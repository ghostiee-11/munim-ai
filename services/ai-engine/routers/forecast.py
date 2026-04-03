"""
Forecast router -- predictive analytics for cash flow and crisis detection.
Includes Indian festival calendar with real business impact predictions.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query

from models import db
from models.schemas import CrisisAlert, ForecastResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Indian Festival Calendar 2026-2027
# ---------------------------------------------------------------------------

INDIAN_FESTIVALS = [
    # 2026 festivals (April onwards for current relevance)
    {"date": "2026-04-06", "name": "Ram Navami", "name_hi": "राम नवमी", "impact_pct": 60, "category": "religious"},
    {"date": "2026-04-14", "name": "Baisakhi", "name_hi": "बैसाखी", "impact_pct": 40, "category": "harvest"},
    {"date": "2026-04-14", "name": "Ambedkar Jayanti", "name_hi": "अम्बेडकर जयंती", "impact_pct": 10, "category": "national"},
    {"date": "2026-04-21", "name": "Mahavir Jayanti", "name_hi": "महावीर जयंती", "impact_pct": 15, "category": "religious"},
    {"date": "2026-04-26", "name": "Akshaya Tritiya", "name_hi": "अक्षय तृतीया", "impact_pct": 80, "category": "shopping"},
    {"date": "2026-05-12", "name": "Buddha Purnima", "name_hi": "बुद्ध पूर्णिमा", "impact_pct": 15, "category": "religious"},
    {"date": "2026-05-25", "name": "Eid ul-Fitr", "name_hi": "ईद उल-फ़ित्र", "impact_pct": 50, "category": "religious"},
    {"date": "2026-06-23", "name": "Rath Yatra", "name_hi": "रथ यात्रा", "impact_pct": 30, "category": "religious"},
    {"date": "2026-07-07", "name": "Guru Purnima", "name_hi": "गुरु पूर्णिमा", "impact_pct": 20, "category": "religious"},
    {"date": "2026-08-08", "name": "Raksha Bandhan", "name_hi": "रक्षा बंधन", "impact_pct": 70, "category": "shopping"},
    {"date": "2026-08-15", "name": "Independence Day", "name_hi": "स्वतंत्रता दिवस", "impact_pct": 25, "category": "national"},
    {"date": "2026-08-16", "name": "Janmashtami", "name_hi": "जन्माष्टमी", "impact_pct": 45, "category": "religious"},
    {"date": "2026-09-06", "name": "Ganesh Chaturthi", "name_hi": "गणेश चतुर्थी", "impact_pct": 55, "category": "religious"},
    {"date": "2026-10-01", "name": "Navratri Start", "name_hi": "नवरात्रि शुरू", "impact_pct": 60, "category": "shopping"},
    {"date": "2026-10-10", "name": "Dussehra", "name_hi": "दशहरा", "impact_pct": 70, "category": "shopping"},
    {"date": "2026-10-25", "name": "Dhanteras", "name_hi": "धनतेरस", "impact_pct": 90, "category": "shopping"},
    {"date": "2026-10-27", "name": "Diwali", "name_hi": "दीवाली", "impact_pct": 100, "category": "shopping"},
    {"date": "2026-10-28", "name": "Govardhan Puja", "name_hi": "गोवर्धन पूजा", "impact_pct": 40, "category": "religious"},
    {"date": "2026-10-29", "name": "Bhai Dooj", "name_hi": "भाई दूज", "impact_pct": 50, "category": "shopping"},
    {"date": "2026-11-17", "name": "Guru Nanak Jayanti", "name_hi": "गुरु नानक जयंती", "impact_pct": 25, "category": "religious"},
    {"date": "2026-12-25", "name": "Christmas", "name_hi": "क्रिसमस", "impact_pct": 35, "category": "shopping"},
    {"date": "2027-01-14", "name": "Makar Sankranti", "name_hi": "मकर संक्रांति", "impact_pct": 40, "category": "harvest"},
    {"date": "2027-01-26", "name": "Republic Day", "name_hi": "गणतंत्र दिवस", "impact_pct": 20, "category": "national"},
    {"date": "2027-03-14", "name": "Holi", "name_hi": "होली", "impact_pct": 60, "category": "shopping"},
]

# Pre-build a lookup: date_str -> list of festivals on that date
_FESTIVAL_LOOKUP: dict[str, list[dict]] = {}
for _f in INDIAN_FESTIVALS:
    _FESTIVAL_LOOKUP.setdefault(_f["date"], []).append(_f)

# Preparation tips by category
_PREP_TIPS: dict[str, str] = {
    "shopping": "{name} ({date_str}) ke liye stock taiyaar karein. {impact_pct}% zyada bikri expected.",
    "religious": "{name} ({date_str}) pe puja items aur special stock ready rakhein. {impact_pct}% zyada bikri expected.",
    "harvest": "{name} ({date_str}) pe seasonal items ka stock badhayein. {impact_pct}% zyada bikri expected.",
    "national": "{name} ({date_str}) pe offers aur discounts rakhein. {impact_pct}% zyada footfall expected.",
}


def _get_festivals_for_date(date_str: str) -> list[dict]:
    """Return all festivals falling on the given date string."""
    return _FESTIVAL_LOOKUP.get(date_str, [])


def _simple_forecast(
    txns: list[dict],
    days_ahead: int,
) -> tuple[float, float, list[dict], list[dict], list[str], list[dict]]:
    """
    Festival-aware forecast based on daily averages from historical data.

    Returns:
        (total_income, total_expense, daily_forecast, upcoming_festivals,
         cash_crunch_days, recommendations)
    """
    if not txns:
        # Fallback: use reasonable defaults for a small Indian merchant
        avg_income = 28000.0
        avg_expense = 18000.0
    else:
        daily_income: dict[str, float] = {}
        daily_expense: dict[str, float] = {}

        for t in txns:
            d = str(t.get("recorded_at", ""))[:10]
            if t.get("type") == "income":
                daily_income[d] = daily_income.get(d, 0) + t.get("amount", 0)
            else:
                daily_expense[d] = daily_expense.get(d, 0) + t.get("amount", 0)

        all_dates = set(list(daily_income.keys()) + list(daily_expense.keys()))
        num_days = max(len(all_dates), 1)

        avg_income = sum(daily_income.values()) / num_days
        avg_expense = sum(daily_expense.values()) / num_days

    today = date.today()
    daily_forecast: list[dict] = []
    total_income = 0.0
    total_expense = 0.0
    upcoming_festivals: list[dict] = []
    cash_crunch_days: list[str] = []
    seen_festivals: set[str] = set()

    for i in range(1, days_ahead + 1):
        forecast_date = today + timedelta(days=i)
        d_str = forecast_date.isoformat()
        weekday = forecast_date.weekday()  # 0=Mon, 6=Sun

        # Base income with slight daily variation
        day_income = avg_income
        day_expense = avg_expense

        # Weekend effect: Sunday slightly lower
        if weekday == 6:
            day_income *= 0.80
            day_expense *= 0.85
        elif weekday == 5:  # Saturday: slightly higher
            day_income *= 1.10

        # Festival impact
        festivals_today = _get_festivals_for_date(d_str)
        is_festival = len(festivals_today) > 0
        festival_name = ""
        festival_name_hi = ""
        festival_impact_pct = 0

        if is_festival:
            # Take the highest-impact festival for the day
            best = max(festivals_today, key=lambda f: f["impact_pct"])
            festival_name = best["name"]
            festival_name_hi = best["name_hi"]
            festival_impact_pct = best["impact_pct"]
            # Apply festival boost to income
            day_income *= (1 + festival_impact_pct / 100)
            # Expenses also rise slightly during festivals (more stock, staff overtime)
            day_expense *= (1 + festival_impact_pct / 300)

        day_income = round(day_income, 2)
        day_expense = round(day_expense, 2)
        day_net = round(day_income - day_expense, 2)

        total_income += day_income
        total_expense += day_expense

        entry: dict = {
            "date": d_str,
            "predicted_income": day_income,
            "predicted_expense": day_expense,
            "predicted_net": day_net,
            "is_festival": is_festival,
            "festival_name": festival_name if is_festival else None,
            "festival_name_hi": festival_name_hi if is_festival else None,
            "impact_pct": festival_impact_pct if is_festival else 0,
        }
        daily_forecast.append(entry)

        # Cash crunch detection
        if day_expense > day_income:
            cash_crunch_days.append(d_str)

        # Collect upcoming festivals (deduplicated)
        for fest in festivals_today:
            key = f"{fest['date']}_{fest['name']}"
            if key not in seen_festivals:
                seen_festivals.add(key)
                expected_boost = round(avg_income * fest["impact_pct"] / 100, 2)
                upcoming_festivals.append({
                    "date": fest["date"],
                    "name": fest["name"],
                    "name_hi": fest["name_hi"],
                    "impact_pct": fest["impact_pct"],
                    "category": fest["category"],
                    "expected_boost": expected_boost,
                })

    # Sort upcoming festivals by date
    upcoming_festivals.sort(key=lambda f: f["date"])

    # Generate recommendations
    recommendations: list[dict] = []

    # Festival prep recommendations (next 3 upcoming)
    for fest in upcoming_festivals[:3]:
        tip_template = _PREP_TIPS.get(fest["category"], _PREP_TIPS["shopping"])
        tip_text = tip_template.format(
            name=fest["name"],
            date_str=fest["date"],
            impact_pct=fest["impact_pct"],
        )
        recommendations.append({
            "type": "festival_prep",
            "text_hi": tip_text,
            "impact": fest["expected_boost"],
        })

    # Cash crunch warning
    if cash_crunch_days:
        crunch_count = len(cash_crunch_days)
        first_crunch = cash_crunch_days[0]
        recommendations.append({
            "type": "cash_crunch",
            "text_hi": f"{crunch_count} din aisa aayega jab kharcha income se zyada hoga. Pehla din: {first_crunch}. Reserve rakhein.",
            "impact": round(avg_expense - avg_income, 2) if avg_expense > avg_income else 0,
        })

    # Savings recommendation based on surplus
    avg_net = (total_income - total_expense) / max(days_ahead, 1)
    if avg_net > 0:
        monthly_surplus = round(avg_net * 30, 2)
        recommendations.append({
            "type": "savings",
            "text_hi": f"Har mahine Rs {round(monthly_surplus)} bacha sakte hain. FD ya mutual fund mein daalein.",
            "impact": monthly_surplus,
        })

    return (
        round(total_income, 2),
        round(total_expense, 2),
        daily_forecast,
        upcoming_festivals,
        cash_crunch_days,
        recommendations,
    )


@router.get("/{merchant_id}", response_model=ForecastResponse)
async def get_forecast(
    merchant_id: str,
    period: str = Query("90d", description="7d / 30d / 90d"),
):
    """
    Generate a festival-aware cash-flow forecast for the requested period.

    Uses historical transaction data to project income, expense, and profit.
    Applies Indian festival calendar impact and weekend effects.
    """
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(period, 90)

    # Use last 90 days of data as training window
    lookback_start = (date.today() - timedelta(days=90)).isoformat()
    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", lookback_start),
    )

    pred_income, pred_expense, daily, upcoming_festivals, cash_crunch_days, recommendations = (
        _simple_forecast(txns, days)
    )
    pred_profit = round(pred_income - pred_expense, 2)

    # Confidence is higher when we have more data
    data_days = len(set(str(t.get("recorded_at", ""))[:10] for t in txns))
    confidence = min(0.95, max(0.3, data_days / 90))

    return ForecastResponse(
        merchant_id=merchant_id,
        period=period,
        predicted_income=pred_income,
        predicted_expense=pred_expense,
        predicted_profit=pred_profit,
        confidence=round(confidence, 2),
        daily_forecast=daily,
        upcoming_festivals=upcoming_festivals,
        cash_crunch_days=cash_crunch_days,
        recommendations=recommendations,
        model_version="v2-festival-aware",
    )


@router.get("/{merchant_id}/festivals")
async def get_festival_calendar(merchant_id: str):
    """
    Return the Indian festival calendar for the next 12 months with
    expected business impact and preparation recommendations.
    """
    today = date.today()
    end_date = today + timedelta(days=365)

    # Get merchant's average daily income for impact calculation
    lookback_start = (today - timedelta(days=90)).isoformat()
    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", lookback_start),
    )

    if txns:
        daily_income: dict[str, float] = {}
        for t in txns:
            d = str(t.get("recorded_at", ""))[:10]
            if t.get("type") == "income":
                daily_income[d] = daily_income.get(d, 0) + t.get("amount", 0)
        num_days = max(len(daily_income), 1)
        avg_income = sum(daily_income.values()) / num_days
    else:
        avg_income = 28000.0

    festivals: list[dict] = []
    for fest in INDIAN_FESTIVALS:
        fest_date = date.fromisoformat(fest["date"])
        if today <= fest_date <= end_date:
            days_until = (fest_date - today).days
            expected_boost = round(avg_income * fest["impact_pct"] / 100, 2)
            tip_template = _PREP_TIPS.get(fest["category"], _PREP_TIPS["shopping"])
            tip_text = tip_template.format(
                name=fest["name"],
                date_str=fest["date"],
                impact_pct=fest["impact_pct"],
            )
            festivals.append({
                "date": fest["date"],
                "name": fest["name"],
                "name_hi": fest["name_hi"],
                "impact_pct": fest["impact_pct"],
                "category": fest["category"],
                "days_until": days_until,
                "expected_boost": expected_boost,
                "preparation_tip_hi": tip_text,
            })

    return {
        "merchant_id": merchant_id,
        "festivals": festivals,
        "total_festivals": len(festivals),
        "total_expected_boost": round(sum(f["expected_boost"] for f in festivals), 2),
    }


@router.get("/{merchant_id}/crisis", response_model=list[CrisisAlert])
async def detect_crisis(merchant_id: str):
    """
    Proactive crisis detection: cash crunch, revenue drops, expense spikes.

    Analyzes recent trends and flags potential problems before they hit.
    """
    today = date.today()
    week_ago = (today - timedelta(days=7)).isoformat()
    two_weeks_ago = (today - timedelta(days=14)).isoformat()

    recent_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", two_weeks_ago),
    )

    # Split into this week vs last week
    this_week = [t for t in recent_txns if str(t.get("recorded_at", ""))[:10] >= week_ago]
    last_week = [t for t in recent_txns if str(t.get("recorded_at", ""))[:10] < week_ago]

    tw_income = sum(t["amount"] for t in this_week if t.get("type") == "income")
    tw_expense = sum(t["amount"] for t in this_week if t.get("type") == "expense")
    lw_income = sum(t["amount"] for t in last_week if t.get("type") == "income")
    lw_expense = sum(t["amount"] for t in last_week if t.get("type") == "expense")

    alerts: list[CrisisAlert] = []

    # Cash crunch: expenses exceed income this week
    if tw_expense > tw_income and tw_income > 0:
        deficit = tw_expense - tw_income
        alerts.append(CrisisAlert(
            alert_type="cash_crunch",
            severity="critical" if deficit > tw_income else "warning",
            message=f"Is hafte kharcha income se {round(deficit)} rupaye zyada hai.",
            predicted_date=(today + timedelta(days=7)).isoformat(),
            recommendation="Kuch payments defer karein ya collection speed badhayein.",
            confidence=0.8,
        ))

    # Revenue drop: >30% drop compared to last week
    if lw_income > 0:
        drop_pct = ((lw_income - tw_income) / lw_income) * 100
        if drop_pct > 30:
            alerts.append(CrisisAlert(
                alert_type="revenue_drop",
                severity="critical" if drop_pct > 50 else "warning",
                message=f"Income mein {round(drop_pct)}% ki girawat aayi hai pichle hafte se.",
                recommendation="Naye customers laane ya existing customers ko offers bhejne ka sochein.",
                confidence=round(min(0.9, drop_pct / 100), 2),
            ))

    # Expense spike: >40% increase compared to last week
    if lw_expense > 0:
        spike_pct = ((tw_expense - lw_expense) / lw_expense) * 100
        if spike_pct > 40:
            alerts.append(CrisisAlert(
                alert_type="expense_spike",
                severity="warning",
                message=f"Kharche mein {round(spike_pct)}% ka izaafa hua hai.",
                recommendation="Bade kharche review karein -- koi unnecessary expense toh nahi?",
                confidence=round(min(0.85, spike_pct / 100), 2),
            ))

    # Overdue udharis
    udharis = db.get_merchant_udharis(merchant_id, status="overdue")
    if udharis:
        overdue_total = sum(u.get("remaining", 0) for u in udharis)
        alerts.append(CrisisAlert(
            alert_type="overdue_collections",
            severity="warning" if len(udharis) < 5 else "critical",
            message=f"{len(udharis)} customers ka {round(overdue_total)} rupaye ka udhari overdue hai.",
            recommendation="Aaj hi sabko reminder bhejein -- /remind-all use karein.",
            confidence=0.95,
        ))

    return alerts
