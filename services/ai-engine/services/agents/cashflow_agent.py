"""
MunimAI Cash Flow Forecast Agent

Provides cash flow forecasting and crisis detection:
1. Load/compute forecasts enriched with festival markers
2. Detect upcoming cash crunches and generate recommendations
3. Daily summary for morning briefing (today vs yesterday vs last week)
4. Hindi crisis recommendations with urgency levels

Uses pre-computed forecasts from seed data when available,
otherwise builds simple moving-average forecasts from transaction history.
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional

from groq import AsyncGroq

from config import get_settings
from models import db

logger = logging.getLogger(__name__)

settings = get_settings()

# Load festival calendar for enriching forecasts
_FESTIVAL_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "festival_calendar.json"
_FESTIVAL_DATA: dict = {}


def _load_festivals() -> dict:
    """Load festival calendar data."""
    global _FESTIVAL_DATA
    if not _FESTIVAL_DATA:
        try:
            with open(_FESTIVAL_PATH, "r", encoding="utf-8") as f:
                _FESTIVAL_DATA = json.load(f)
        except FileNotFoundError:
            logger.warning("Festival calendar not found at %s", _FESTIVAL_PATH)
            _FESTIVAL_DATA = {"festivals": [], "gst_deadlines": []}
    return _FESTIVAL_DATA


# Cash crunch thresholds
DEFAULT_MIN_CASH_THRESHOLD = 5000   # Rs 5,000 minimum daily balance
CRISIS_LOOKAHEAD_DAYS = 30          # Look 30 days ahead for crises


async def get_forecast(merchant_id: str, days: int = 30) -> dict:
    """
    Get cash flow forecast for the next N days.

    Tries to load pre-computed forecasts from DB first.
    Falls back to generating a simple moving-average forecast
    from historical transaction data.

    Args:
        merchant_id: The merchant's UUID
        days: Number of days to forecast (default 30)

    Returns:
        Dict with daily forecasts, festival markers, crisis alerts,
        and summary statistics.
    """
    today = date.today()
    festivals = _load_festivals()

    # Try loading pre-computed forecasts
    try:
        stored_forecasts = db.select_range(
            "cashflow_forecasts",
            filters={"merchant_id": merchant_id},
            gte=("date", today.isoformat()),
            lte=("date", (today + timedelta(days=days)).isoformat()),
            order_by="date",
            order_desc=False,
        )
    except Exception:
        stored_forecasts = []

    if stored_forecasts and len(stored_forecasts) >= days * 0.5:
        daily_forecasts = _enrich_with_festivals(stored_forecasts, festivals)
    else:
        # Generate forecast from transaction history
        daily_forecasts = await _generate_forecast(merchant_id, days, festivals)

    # Detect crisis dates
    crisis_alerts = _detect_crisis_dates(daily_forecasts, DEFAULT_MIN_CASH_THRESHOLD)

    # Summary stats
    total_predicted_income = sum(d.get("predicted_income", 0) for d in daily_forecasts)
    total_predicted_expense = sum(d.get("predicted_expense", 0) for d in daily_forecasts)
    total_predicted_net = total_predicted_income - total_predicted_expense
    crisis_count = len(crisis_alerts)

    # Festival impact days
    festival_days = [d for d in daily_forecasts if d.get("festival")]

    return {
        "merchant_id": merchant_id,
        "forecast_days": days,
        "daily_forecasts": daily_forecasts,
        "crisis_alerts": crisis_alerts,
        "festival_impact_days": festival_days,
        "summary": {
            "total_predicted_income": round(total_predicted_income, 2),
            "total_predicted_expense": round(total_predicted_expense, 2),
            "total_predicted_net": round(total_predicted_net, 2),
            "avg_daily_income": round(total_predicted_income / max(days, 1), 2),
            "avg_daily_expense": round(total_predicted_expense / max(days, 1), 2),
            "crisis_days_count": crisis_count,
            "festival_days_count": len(festival_days),
        },
        "recommendations_hi": generate_crisis_recommendations(crisis_alerts),
        "generated_at": datetime.now().isoformat(),
    }


async def detect_cash_crunch(merchant_id: str) -> list[dict]:
    """
    Identify upcoming dates where cash flow is predicted to go negative
    or below the safety threshold.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        List of crisis alerts:
        [{date, predicted_net, shortfall, severity, days_until,
          recommendation_hi}]
    """
    forecast = await get_forecast(merchant_id, days=CRISIS_LOOKAHEAD_DAYS)
    crises = forecast.get("crisis_alerts", [])

    # Enrich each crisis with Hindi recommendations
    for crisis in crises:
        days_until = crisis.get("days_until", 30)
        severity = crisis.get("severity", "medium")
        shortfall = crisis.get("shortfall", 0)

        crisis["recommendation_hi"] = _crisis_recommendation_single(
            days_until, severity, shortfall
        )

    return crises


async def get_today_summary(merchant_id: str) -> dict:
    """
    Aggregate today's transactions and compare with yesterday
    and last week same day.

    Designed for the morning briefing feature.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        Comprehensive summary for morning briefing with comparisons.
    """
    today = date.today()
    yesterday = today - timedelta(days=1)
    last_week_same_day = today - timedelta(days=7)

    # Fetch today's, yesterday's, and last week's transactions
    try:
        today_txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("date", today.isoformat()),
            lte=("date", today.isoformat()),
        )
    except Exception as e:
        logger.error("Failed to fetch today's transactions: %s", e)
        today_txns = []

    try:
        yesterday_txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("date", yesterday.isoformat()),
            lte=("date", yesterday.isoformat()),
        )
    except Exception as e:
        logger.error("Failed to fetch yesterday's transactions: %s", e)
        yesterday_txns = []

    try:
        last_week_txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("date", last_week_same_day.isoformat()),
            lte=("date", last_week_same_day.isoformat()),
        )
    except Exception as e:
        logger.error("Failed to fetch last week's transactions: %s", e)
        last_week_txns = []

    # Aggregate each day
    today_data = _aggregate_day(today_txns)
    yesterday_data = _aggregate_day(yesterday_txns)
    last_week_data = _aggregate_day(last_week_txns)

    # Comparisons
    income_vs_yesterday = _calc_change(today_data["income"], yesterday_data["income"])
    income_vs_last_week = _calc_change(today_data["income"], last_week_data["income"])
    profit_vs_yesterday = _calc_change(today_data["profit"], yesterday_data["profit"])

    # Check for upcoming festivals
    festivals = _load_festivals()
    upcoming_festivals = _upcoming_festivals(festivals, today, days=7)

    # Check for GST deadlines
    gst_deadlines = _upcoming_gst_deadlines(festivals, today)

    return {
        "merchant_id": merchant_id,
        "date": today.isoformat(),
        "day_name": today.strftime("%A"),
        "today": today_data,
        "yesterday": yesterday_data,
        "last_week_same_day": last_week_data,
        "comparisons": {
            "income_vs_yesterday": income_vs_yesterday,
            "income_vs_last_week": income_vs_last_week,
            "profit_vs_yesterday": profit_vs_yesterday,
        },
        "upcoming_festivals": upcoming_festivals,
        "gst_deadlines": gst_deadlines,
        "alerts_hi": _generate_daily_alerts(
            today_data, yesterday_data, income_vs_yesterday, upcoming_festivals, gst_deadlines,
        ),
    }


def generate_crisis_recommendations(crisis_dates: list[dict]) -> list[str]:
    """
    Generate Hindi recommendations based on crisis severity and timing.

    Urgency tiers:
    - < 7 days: Immediate action needed
    - < 14 days: Preparation required
    - < 30 days: Planning recommended

    Args:
        crisis_dates: List of crisis alert dicts

    Returns:
        List of Hindi recommendation strings.
    """
    if not crisis_dates:
        return ["✅ Agle 30 din mein koi cash crunch nahi dikhta. Sab theek hai!"]

    recommendations = []
    seen_tiers = set()

    for crisis in crisis_dates:
        days_until = crisis.get("days_until", 30)
        severity = crisis.get("severity", "medium")
        shortfall = crisis.get("shortfall", 0)

        if days_until <= 7 and "immediate" not in seen_tiers:
            seen_tiers.add("immediate")
            recommendations.append(
                f"⚠️ {days_until} din mein Rs {shortfall:,.0f} ki kami ho sakti hai! "
                f"Abhi se udhari collection tez karein."
            )
            recommendations.append(
                "⚠️ Aaj hi top 5 pending payments ke reminders bhejein — "
                "Paytm link ke saath."
            )
        elif days_until <= 14 and "short_term" not in seen_tiers:
            seen_tiers.add("short_term")
            recommendations.append(
                f"🔶 {days_until} din mein cash tight ho sakta hai. "
                f"Top 5 udhari reminders bhejein."
            )
            recommendations.append(
                "🔶 Non-urgent purchases ko 1-2 hafta postpone karein."
            )
        elif days_until <= 30 and "medium_term" not in seen_tiers:
            seen_tiers.add("medium_term")
            recommendations.append(
                f"💡 {days_until} din baad cash flow tight hoga. "
                f"Supplier payments reschedule karein."
            )
            recommendations.append(
                "💡 Festival season ke liye stock purchase plan karein — "
                "advance mein negotiate karein."
            )

    return recommendations


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _generate_forecast(
    merchant_id: str, days: int, festivals: dict,
) -> list[dict]:
    """
    Generate a simple moving-average forecast from historical data.

    Uses 30-day rolling average with day-of-week adjustment
    and festival multipliers.
    """
    today = date.today()
    lookback = 60  # Look back 60 days for patterns

    try:
        history = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("date", (today - timedelta(days=lookback)).isoformat()),
            lte=("date", today.isoformat()),
            order_by="date",
        )
    except Exception as e:
        logger.error("Failed to fetch historical transactions: %s", e)
        history = []

    # Aggregate historical data by date
    daily_history: dict[str, dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for txn in history:
        txn_date = txn.get("date", "")
        if isinstance(txn_date, str):
            txn_date = txn_date[:10]
        amount = txn.get("amount", 0)
        if txn.get("type") == "income":
            daily_history[txn_date]["income"] += amount
        elif txn.get("type") == "expense":
            daily_history[txn_date]["expense"] += amount

    # Calculate day-of-week averages
    dow_income = defaultdict(list)   # day_of_week -> list of incomes
    dow_expense = defaultdict(list)

    for date_str, data in daily_history.items():
        try:
            d = date.fromisoformat(date_str)
            dow = d.weekday()
            dow_income[dow].append(data["income"])
            dow_expense[dow].append(data["expense"])
        except ValueError:
            continue

    # Calculate averages per day of week
    avg_income_by_dow = {}
    avg_expense_by_dow = {}
    for dow in range(7):
        incomes = dow_income.get(dow, [0])
        expenses = dow_expense.get(dow, [0])
        avg_income_by_dow[dow] = sum(incomes) / max(len(incomes), 1)
        avg_expense_by_dow[dow] = sum(expenses) / max(len(expenses), 1)

    # Overall averages as fallback
    all_incomes = [d["income"] for d in daily_history.values()]
    all_expenses = [d["expense"] for d in daily_history.values()]
    overall_avg_income = sum(all_incomes) / max(len(all_incomes), 1) if all_incomes else 10000
    overall_avg_expense = sum(all_expenses) / max(len(all_expenses), 1) if all_expenses else 7000

    # Generate forecast
    forecasts = []
    cumulative_net = 0.0

    for i in range(days):
        forecast_date = today + timedelta(days=i + 1)
        dow = forecast_date.weekday()

        base_income = avg_income_by_dow.get(dow, overall_avg_income)
        base_expense = avg_expense_by_dow.get(dow, overall_avg_expense)

        # Apply festival multiplier
        festival_info = _get_festival_for_date(festivals, forecast_date)
        if festival_info:
            multiplier = festival_info.get("revenue_impact", 1.0)
            base_income *= multiplier

        predicted_net = base_income - base_expense
        cumulative_net += predicted_net

        forecast_entry = {
            "date": forecast_date.isoformat(),
            "day_name": forecast_date.strftime("%A"),
            "predicted_income": round(base_income, 2),
            "predicted_expense": round(base_expense, 2),
            "predicted_net": round(predicted_net, 2),
            "cumulative_net": round(cumulative_net, 2),
            "festival": festival_info.get("name") if festival_info else None,
            "festival_impact": festival_info.get("revenue_impact") if festival_info else None,
        }
        forecasts.append(forecast_entry)

    return forecasts


def _enrich_with_festivals(
    forecasts: list[dict], festivals: dict,
) -> list[dict]:
    """Add festival markers to pre-computed forecasts."""
    enriched = []
    for f in forecasts:
        entry = dict(f)
        forecast_date_str = entry.get("date", "")
        try:
            forecast_date = date.fromisoformat(forecast_date_str[:10])
            festival = _get_festival_for_date(festivals, forecast_date)
            if festival:
                entry["festival"] = festival.get("name")
                entry["festival_impact"] = festival.get("revenue_impact")
        except ValueError:
            pass
        enriched.append(entry)
    return enriched


def _get_festival_for_date(festivals: dict, target_date: date) -> Optional[dict]:
    """Check if a date falls near a festival (within 2 days)."""
    for fest in festivals.get("festivals", []):
        try:
            fest_date = date.fromisoformat(fest["date"])
            if abs((target_date - fest_date).days) <= 2:
                return fest
        except (ValueError, KeyError):
            continue
    return None


def _detect_crisis_dates(
    forecasts: list[dict], threshold: float,
) -> list[dict]:
    """Identify forecast dates where predicted_net is below threshold."""
    today = date.today()
    crises = []

    for f in forecasts:
        predicted_net = f.get("predicted_net", 0)
        if predicted_net < -threshold:
            try:
                forecast_date = date.fromisoformat(f.get("date", "")[:10])
                days_until = (forecast_date - today).days
            except ValueError:
                days_until = 30

            shortfall = abs(predicted_net)
            if shortfall > threshold * 3:
                severity = "critical"
            elif shortfall > threshold * 2:
                severity = "high"
            elif shortfall > threshold:
                severity = "medium"
            else:
                severity = "low"

            crises.append({
                "date": f.get("date"),
                "predicted_net": round(predicted_net, 2),
                "shortfall": round(shortfall, 2),
                "severity": severity,
                "days_until": days_until,
                "festival": f.get("festival"),
            })

    return crises


def _aggregate_day(transactions: list[dict]) -> dict:
    """Aggregate transactions for a single day."""
    income = 0.0
    expense = 0.0
    income_count = 0
    expense_count = 0
    categories: dict[str, float] = defaultdict(float)

    for txn in transactions:
        amount = txn.get("amount", 0)
        category = txn.get("category", "other")

        if txn.get("type") == "income":
            income += amount
            income_count += 1
        elif txn.get("type") == "expense":
            expense += amount
            expense_count += 1
            categories[category] += amount

    profit = income - expense
    margin = (profit / income * 100) if income > 0 else 0

    return {
        "income": round(income, 2),
        "expense": round(expense, 2),
        "profit": round(profit, 2),
        "margin": round(margin, 1),
        "income_count": income_count,
        "expense_count": expense_count,
        "top_expense_categories": dict(
            sorted(categories.items(), key=lambda x: -x[1])[:5]
        ),
    }


def _calc_change(current: float, previous: float) -> dict:
    """Calculate percentage change between two values."""
    if previous > 0:
        change_pct = ((current - previous) / previous) * 100
    elif current > 0:
        change_pct = 100.0
    else:
        change_pct = 0.0

    if change_pct > 5:
        direction = "up"
    elif change_pct < -5:
        direction = "down"
    else:
        direction = "stable"

    return {
        "current": round(current, 2),
        "previous": round(previous, 2),
        "change_percent": round(change_pct, 1),
        "direction": direction,
    }


def _upcoming_festivals(festivals: dict, today: date, days: int = 7) -> list[dict]:
    """Find festivals in the next N days."""
    upcoming = []
    for fest in festivals.get("festivals", []):
        try:
            fest_date = date.fromisoformat(fest["date"])
            diff = (fest_date - today).days
            if 0 <= diff <= days:
                upcoming.append({
                    "name": fest["name"],
                    "date": fest["date"],
                    "days_away": diff,
                    "revenue_impact": fest.get("revenue_impact", 1.0),
                })
        except (ValueError, KeyError):
            continue
    return upcoming


def _upcoming_gst_deadlines(festivals: dict, today: date) -> list[dict]:
    """Find upcoming GST deadlines."""
    deadlines = []
    for gst in festivals.get("gst_deadlines", []):
        deadline_day = gst.get("day", 20)
        # This month's deadline
        try:
            deadline_date = today.replace(day=deadline_day)
        except ValueError:
            continue

        if deadline_date < today:
            # Next month
            if today.month == 12:
                deadline_date = deadline_date.replace(year=today.year + 1, month=1)
            else:
                deadline_date = deadline_date.replace(month=today.month + 1)

        days_away = (deadline_date - today).days
        if days_away <= 15:
            deadlines.append({
                "type": gst.get("type", "GSTR-3B"),
                "date": deadline_date.isoformat(),
                "days_away": days_away,
                "description": gst.get("description", ""),
            })

    return deadlines


def _crisis_recommendation_single(
    days_until: int, severity: str, shortfall: float,
) -> str:
    """Generate a single Hindi recommendation for a crisis date."""
    if days_until <= 7:
        return (
            f"⚠️ Sirf {days_until} din bache! Rs {shortfall:,.0f} ki kami hogi. "
            f"Abhi se udhari collection tez karein aur non-urgent kharche rokein."
        )
    elif days_until <= 14:
        return (
            f"🔶 {days_until} din mein Rs {shortfall:,.0f} tight hoga. "
            f"Top 5 udhari reminders bhejein aur supplier se extra credit maangein."
        )
    return (
        f"💡 {days_until} din baad cash flow issue ho sakta hai. "
        f"Supplier payments reschedule karein aur advance orders lein."
    )


def _generate_daily_alerts(
    today_data: dict,
    yesterday_data: dict,
    income_change: dict,
    festivals: list,
    gst_deadlines: list,
) -> list[str]:
    """Generate Hindi alerts for the daily briefing."""
    alerts = []

    # Income comparison
    direction = income_change.get("direction", "stable")
    change = income_change.get("change_percent", 0)
    if direction == "up":
        alerts.append(f"📈 Aaj ki sale kal se {change:.0f}% zyada hai! Badiya chal raha hai.")
    elif direction == "down":
        alerts.append(f"📉 Aaj ki sale kal se {abs(change):.0f}% kam hai. Dhyan dein.")

    # Margin alert
    if today_data.get("margin", 0) < 10 and today_data.get("income", 0) > 0:
        alerts.append(
            f"⚠️ Aaj ka margin sirf {today_data['margin']:.0f}% hai — "
            f"expenses zyada ho rahe hain."
        )

    # Festival alerts
    for fest in festivals:
        if fest.get("days_away", 0) <= 3:
            impact = fest.get("revenue_impact", 1.0)
            alerts.append(
                f"🎉 {fest['name']} {fest['days_away']} din mein! "
                f"Sale {(impact - 1) * 100:.0f}% tak badh sakti hai."
            )

    # GST deadline alerts
    for gst in gst_deadlines:
        if gst.get("days_away", 30) <= 5:
            alerts.append(
                f"📋 {gst['type']} filing deadline {gst['days_away']} din mein! "
                f"Abhi file kar lein."
            )

    if not alerts:
        alerts.append("✅ Sab normal chal raha hai. Mehnat karte rahiye!")

    return alerts
