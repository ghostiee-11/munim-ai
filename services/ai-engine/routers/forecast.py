"""
Forecast router -- predictive analytics for cash flow and crisis detection.
Includes Indian festival calendar with real business impact predictions.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

import numpy as np

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

# Festival-specific inventory suggestions
FESTIVAL_INVENTORY: dict[str, list[str]] = {
    "Ram Navami": ["Puja items", "Yellow/orange sarees", "Pooja thali sets"],
    "Akshaya Tritiya": ["Gold jewelry", "Wedding sarees", "Gift sets"],
    "Raksha Bandhan": ["Rakhi sets", "Gift packs", "Sweets packaging"],
    "Navratri Start": ["Chaniya choli", "Navratri special items", "Garba accessories"],
    "Diwali": ["Festive sarees", "Home decor", "Gift hampers", "Diyas"],
    "Dussehra": ["Festive wear", "Puja items"],
    "Eid ul-Fitr": ["Festive kurtas", "Embroidered fabric", "Gift items"],
    "Holi": ["White clothes", "Color-safe fabric", "Festive wear"],
    "Ganesh Chaturthi": ["Ganesh idols", "Puja items", "Modak packaging"],
    "Dhanteras": ["Gold jewelry", "Utensils", "Electronics"],
    "Bhai Dooj": ["Gift sets", "Sweets packaging", "Tikka items"],
    "Janmashtami": ["Puja items", "Makhan-mishri sets", "Krishna decor"],
    "Baisakhi": ["Festive wear", "Seasonal items", "Harvest decor"],
    "Christmas": ["Gift items", "Decorations", "Party supplies"],
    "Makar Sankranti": ["Kite supplies", "Til-gur items", "Festive wear"],
}

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
    # Build day-of-week pattern multipliers from real data
    # dow_income[weekday] = list of daily income totals for that weekday
    dow_income: dict[int, list[float]] = {i: [] for i in range(7)}
    dow_expense: dict[int, list[float]] = {i: [] for i in range(7)}

    # Defaults for stddev (overwritten if txns exist)
    income_stddev = 0.0
    expense_stddev = 0.0

    if not txns:
        # Fallback: use reasonable defaults for a small Indian merchant
        avg_income = 28000.0
        avg_expense = 18000.0
        income_stddev = avg_income * 0.3
        expense_stddev = avg_expense * 0.3
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

        # Stddev for confidence intervals
        income_values = list(daily_income.values()) if daily_income else [0]
        expense_values = list(daily_expense.values()) if daily_expense else [0]
        income_stddev = float(np.std(income_values)) if len(income_values) > 1 else avg_income * 0.3
        expense_stddev = float(np.std(expense_values)) if len(expense_values) > 1 else avg_expense * 0.3

        # Build day-of-week patterns from actual transaction dates
        for d_str_hist, inc_val in daily_income.items():
            try:
                dow = date.fromisoformat(d_str_hist).weekday()
                dow_income[dow].append(inc_val)
            except (ValueError, TypeError):
                pass
        for d_str_hist, exp_val in daily_expense.items():
            try:
                dow = date.fromisoformat(d_str_hist).weekday()
                dow_expense[dow].append(exp_val)
            except (ValueError, TypeError):
                pass

    # Compute day-of-week multipliers relative to the global average
    dow_inc_mult: dict[int, float] = {}
    dow_exp_mult: dict[int, float] = {}
    for wd in range(7):
        if dow_income[wd] and avg_income > 0:
            dow_inc_mult[wd] = (sum(dow_income[wd]) / len(dow_income[wd])) / avg_income
        else:
            # Sensible defaults: Sunday=0.8, Saturday=1.1, weekdays=1.0
            dow_inc_mult[wd] = 0.80 if wd == 6 else 1.10 if wd == 5 else 1.0
        if dow_expense[wd] and avg_expense > 0:
            dow_exp_mult[wd] = (sum(dow_expense[wd]) / len(dow_expense[wd])) / avg_expense
        else:
            dow_exp_mult[wd] = 0.85 if wd == 6 else 1.0

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

        # Apply day-of-week multiplier from real data patterns
        day_income = avg_income * dow_inc_mult.get(weekday, 1.0)
        day_expense = avg_expense * dow_exp_mult.get(weekday, 1.0)

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
            "income_upper": round(day_income + 1.5 * income_stddev, 2),
            "income_lower": round(max(0, day_income - 1.5 * income_stddev), 2),
            "expense_upper": round(day_expense + 1.5 * expense_stddev, 2),
            "expense_lower": round(max(0, day_expense - 1.5 * expense_stddev), 2),
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


def _build_data_driven_recommendations(
    txns: list[dict],
    merchant_id: str,
    total_income: float,
    total_expense: float,
    avg_income: float,
    avg_expense: float,
) -> list[dict]:
    """
    Build recommendations grounded in real merchant transaction data.

    Analyses income trends, top expense categories, cash runway,
    and biggest udhari recovery opportunities.
    """
    recommendations: list[dict] = []

    # Compute how many unique days we have data for
    all_dates = set()
    for t in txns:
        d = str(t.get("recorded_at", ""))[:10]
        if d:
            all_dates.add(d)
    num_days = max(len(all_dates), 1)
    avg_daily = total_income / max(num_days, 1)

    # 1. Income trend -- compare last 7 days vs overall average
    seven_days_ago = (date.today() - timedelta(days=7)).isoformat()
    recent_income: dict[str, float] = {}
    for t in txns:
        d = str(t.get("recorded_at", ""))[:10]
        if d >= seven_days_ago and t.get("type") == "income":
            recent_income[d] = recent_income.get(d, 0) + t.get("amount", 0)
    recent_days = max(len(recent_income), 1)
    recent_7d_avg = sum(recent_income.values()) / recent_days if recent_income else 0

    if avg_daily > 0 and recent_7d_avg < avg_daily * 0.85:
        drop_pct = round((1 - recent_7d_avg / avg_daily) * 100)
        recommendations.append({
            "type": "income_drop",
            "text_hi": f"Aapki avg daily income Rs {avg_daily:,.0f} hai. Pichle hafte {drop_pct}% kam hui. Kya hua?",
            "impact": round(avg_daily - recent_7d_avg) * 7,
        })

    # 2. Top expense category
    expense_by_cat: dict[str, float] = {}
    for t in txns:
        if t.get("type") == "expense":
            cat = t.get("category", "General")
            expense_by_cat[cat] = expense_by_cat.get(cat, 0) + t.get("amount", 0)
    if expense_by_cat:
        top_expense_cat = max(expense_by_cat, key=expense_by_cat.get)
        top_expense_amt = expense_by_cat[top_expense_cat]
        # Normalise to monthly estimate
        monthly_top = round(top_expense_amt / max(num_days, 1) * 30)
        recommendations.append({
            "type": "expense_alert",
            "text_hi": f"Sabse zyada kharcha: {top_expense_cat} (Rs {monthly_top:,.0f}/month).",
            "impact": monthly_top,
        })

    # 3. Cash runway
    avg_daily_expense = total_expense / max(num_days, 1)
    cash_on_hand = total_income - total_expense
    days_of_cash = round(cash_on_hand / max(avg_daily_expense, 1))
    recommendations.append({
        "type": "cash_runway",
        "text_hi": f"Cash position: Rs {cash_on_hand:,.0f}. {days_of_cash} din ka kharcha cover kar sakta hai.",
        "impact": cash_on_hand,
    })

    # 4. Biggest udhari recovery opportunity
    try:
        from models.db import get_client
        supa = get_client()
        biggest_udhari = (
            supa.table("udhari")
            .select("debtor_name,remaining")
            .eq("merchant_id", merchant_id)
            .neq("status", "settled")
            .order("remaining", desc=True)
            .limit(1)
            .execute()
        )
        if biggest_udhari.data:
            u = biggest_udhari.data[0]
            remaining = u.get("remaining", 0) or 0
            if remaining > 0:
                buffer_days = round(remaining / max(avg_daily_expense, 1))
                recommendations.append({
                    "type": "collection_opportunity",
                    "text_hi": f"Agar {u['debtor_name']} ka Rs {remaining:,.0f} aa jaye toh {buffer_days} din ka buffer ban jayega.",
                    "impact": remaining,
                })
    except Exception:
        pass

    return recommendations


@router.get("/cash-crunch-alert/{merchant_id}")
async def cash_crunch_alert(merchant_id: str):
    """Predict when merchant will run out of cash and suggest actions."""
    # Get current cash position
    txns = db.select("transactions", filters={"merchant_id": merchant_id}, limit=500)
    total_income = sum(float(t.get("amount", 0)) for t in txns if t.get("type") == "income")
    total_expense = sum(float(t.get("amount", 0)) for t in txns if t.get("type") == "expense")
    current_cash = total_income - total_expense

    # Calculate daily burn rate (last 30 days)
    thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()
    recent = db.select_range("transactions", filters={"merchant_id": merchant_id}, gte=("created_at", thirty_days_ago))
    recent_expense = sum(float(t.get("amount", 0)) for t in recent if t.get("type") == "expense")
    recent_income = sum(float(t.get("amount", 0)) for t in recent if t.get("type") == "income")

    days_data = len(set(str(t.get("created_at", ""))[:10] for t in recent)) or 1
    daily_expense = recent_expense / days_data
    daily_income = recent_income / days_data
    daily_net = daily_income - daily_expense

    # Cash runway
    if daily_net < 0:
        runway_days = int(current_cash / abs(daily_net)) if current_cash > 0 else 0
    else:
        runway_days = 999  # Positive cash flow

    # Get pending udhari for collection suggestion
    try:
        udharis = db.get_merchant_udharis(merchant_id, status="pending")
        overdue = db.get_merchant_udharis(merchant_id, status="overdue")
        total_collectible = sum(float(u.get("amount", 0)) - float(u.get("amount_paid", 0)) for u in udharis + overdue)
        top_debtors = sorted(udharis + overdue, key=lambda u: float(u.get("amount", 0)) - float(u.get("amount_paid", 0)), reverse=True)[:3]
    except Exception:
        total_collectible = 0
        top_debtors = []

    # Determine urgency
    if runway_days <= 3:
        urgency = "critical"
        urgency_hi = "BAHUT URGENT"
    elif runway_days <= 7:
        urgency = "high"
        urgency_hi = "URGENT"
    elif runway_days <= 14:
        urgency = "medium"
        urgency_hi = "DHYAN DEIN"
    else:
        urgency = "low"
        urgency_hi = "SAFE"

    # Build suggestion
    suggestions = []
    if total_collectible > 0:
        suggestions.append(f"Rs {total_collectible:,.0f} udhari collect karein")
        for d in top_debtors:
            remaining = float(d.get("amount", 0)) - float(d.get("amount_paid", 0))
            suggestions.append(f"  - {d.get('debtor_name', 'Customer')}: Rs {remaining:,.0f}")
    if daily_expense > daily_income:
        cut_needed = round((daily_expense - daily_income) * 30, 2)
        suggestions.append(f"Monthly kharcha Rs {cut_needed:,.0f} kam karein")

    alert_hi = f"Cash position: Rs {current_cash:,.0f}. "
    if runway_days < 999:
        alert_hi += f"{runway_days} din ka kharcha cover ho sakta hai. "
    else:
        alert_hi += "Cash flow positive hai. "
    if suggestions:
        alert_hi += "Sujhaav: " + "; ".join(suggestions[:3])

    return {
        "merchant_id": merchant_id,
        "current_cash": round(current_cash, 2),
        "daily_income": round(daily_income, 2),
        "daily_expense": round(daily_expense, 2),
        "runway_days": runway_days,
        "urgency": urgency,
        "urgency_hi": urgency_hi,
        "total_collectible": round(total_collectible, 2),
        "top_debtors": [{"name": d.get("debtor_name"), "amount": round(float(d.get("amount", 0)) - float(d.get("amount_paid", 0)), 2)} for d in top_debtors],
        "suggestions": suggestions,
        "alert_hi": alert_hi,
    }


@router.post("/cash-crunch-notify/{merchant_id}")
async def send_cash_crunch_alert(merchant_id: str):
    """Send cash crunch WhatsApp alert if runway < 7 days. Max 1 per day."""
    from services.twilio_service import send_whatsapp as _send_wa

    # 24-hour cooldown: check if already sent today
    today_str = date.today().isoformat()
    try:
        recent = db.select_range(
            "briefings",
            filters={"merchant_id": merchant_id, "type": "cash_crunch"},
            gte=("created_at", today_str),
            limit=1,
        )
        if recent:
            return {"sent": False, "reason": "Already sent today. Next alert tomorrow."}
    except Exception:
        pass  # Table may not exist, proceed

    data = await cash_crunch_alert(merchant_id)
    if data["runway_days"] >= 14:
        return {"sent": False, "reason": "Cash position healthy"}

    msg = f"\u26a0\ufe0f {data['urgency_hi']}! Cash Alert\n\n"
    msg += f"Cash: Rs {data['current_cash']:,.0f}\n"
    msg += f"Runway: {data['runway_days']} din\n\n"
    if data["suggestions"]:
        msg += "Kya karein:\n" + "\n".join(f"\u2022 {s}" for s in data["suggestions"][:4])
    msg += "\n\n- MunimAI"

    try:
        result = await _send_wa(to="+917725014797", body=msg)
        # Record so we don't send again today
        try:
            db.insert("briefings", {
                "merchant_id": merchant_id,
                "type": "cash_crunch",
                "content": msg,
            })
        except Exception:
            pass
        return {"sent": True, "message": msg, "data": data}
    except Exception as e:
        return {"sent": False, "message": msg, "error": str(e)}


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
    try:
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

        # Augment with data-driven recommendations from real merchant data
        if txns:
            daily_inc_vals: dict[str, float] = {}
            daily_exp_vals: dict[str, float] = {}
            for t in txns:
                d = str(t.get("recorded_at", ""))[:10]
                if t.get("type") == "income":
                    daily_inc_vals[d] = daily_inc_vals.get(d, 0) + t.get("amount", 0)
                else:
                    daily_exp_vals[d] = daily_exp_vals.get(d, 0) + t.get("amount", 0)
            all_d = set(list(daily_inc_vals.keys()) + list(daily_exp_vals.keys()))
            n_days = max(len(all_d), 1)
            hist_total_income = sum(daily_inc_vals.values())
            hist_total_expense = sum(daily_exp_vals.values())
            hist_avg_income = hist_total_income / n_days
            hist_avg_expense = hist_total_expense / n_days

            data_recs = _build_data_driven_recommendations(
                txns, merchant_id,
                hist_total_income, hist_total_expense,
                hist_avg_income, hist_avg_expense,
            )
            recommendations.extend(data_recs)

        # Add inventory suggestions to each upcoming festival
        for fest in upcoming_festivals:
            fest["inventory_suggestions"] = FESTIVAL_INVENTORY.get(fest["name"], [])

        # Confidence is higher when we have more data
        data_days = len(set(str(t.get("recorded_at", ""))[:10] for t in txns))
        confidence = min(0.95, max(0.3, data_days / 90))

        # Auto-send cash crunch warning via WhatsApp
        if cash_crunch_days:
            # Only send once per 24 hours
            try:
                import asyncio
                from services.twilio_service import send_whatsapp
                from models.db import get_client as _gc2
                _db2 = _gc2()
                # Check if we already sent today
                today_str = date.today().isoformat()
                existing = _db2.table("briefings").select("id").eq("merchant_id", merchant_id).gte("created_at", today_str).execute()
                already_sent = any("cash_crunch" in str(b) for b in (existing.data or []))
                if not already_sent:
                    msg = f"\u26a0\ufe0f Cash Crunch Alert: {len(cash_crunch_days)} din mein cash short hoga. Collection badhaein."
                    asyncio.create_task(send_whatsapp("+917725014797", msg))
                    # Mark as sent
                    try:
                        _db2.table("briefings").insert({"merchant_id": merchant_id, "date": today_str, "content": {"type": "cash_crunch", "sent": True}}).execute()
                    except Exception:
                        pass  # briefing for today may already exist
            except Exception:
                pass

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
            confidence_level="85% prediction interval (±1.5σ)",
            model_version="v2-festival-aware",
        )
    except Exception as e:
        logger.exception(f"Error in forecast: {e}")
        return {"error": True, "message": "Kuch gadbad ho gayi. Kripya dobara try karein.", "detail": str(e)}


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
                "inventory_suggestions": FESTIVAL_INVENTORY.get(fest["name"], []),
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
