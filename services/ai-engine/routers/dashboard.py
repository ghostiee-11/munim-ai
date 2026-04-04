"""
Dashboard router -- aggregated views of merchant state.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter

from models import db
from models.schemas import (
    CategorySummary,
    DashboardState,
    MonthlySummary,
    TodaySummary,
    TransactionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _aggregate_txns(txns: list[dict]) -> tuple[float, float]:
    """Return (income, expense) totals from a list of transaction dicts."""
    income = sum(t["amount"] for t in txns if t.get("type") == "income")
    expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
    return income, expense


@router.get("/{merchant_id}")
async def get_dashboard(merchant_id: str):
    """
    Full dashboard state -- today's numbers, monthly numbers, udhari totals,
    recent transactions, and active alerts.  Designed to be called once on
    page load; incremental updates come via Socket.IO.
    """
    try:
        # Use IST timezone for India (UTC+5:30)
        from datetime import timezone, timedelta as td
        ist = timezone(td(hours=5, minutes=30))
        now_ist = datetime.now(ist)
        today_str = now_ist.strftime("%Y-%m-%d")
        month_start = now_ist.replace(day=1).strftime("%Y-%m-%d")

        # Fetch today's transactions using created_at (has correct historical dates)
        try:
            today_txns = db.select_range(
                "transactions",
                filters={"merchant_id": merchant_id},
                gte=("created_at", today_str),
                lte=("created_at", today_str + "T23:59:59+05:30"),
            )
        except Exception:
            today_txns = []

        # If still empty, use last 24 hours as fallback
        if not today_txns:
            yesterday_str = (now_ist - td(hours=24)).strftime("%Y-%m-%dT%H:%M:%S")
            try:
                today_txns = db.select_range(
                    "transactions",
                    filters={"merchant_id": merchant_id},
                    gte=("created_at", yesterday_str),
                )
            except Exception:
                today_txns = []

        try:
            month_txns = db.select_range(
                "transactions",
                filters={"merchant_id": merchant_id},
                gte=("created_at", month_start),
            )
        except Exception:
            month_txns = db.select("transactions", filters={"merchant_id": merchant_id})
        recent = db.get_merchant_transactions(merchant_id, limit=10)
        udharis = db.get_merchant_udharis(merchant_id)
        customers = db.get_merchant_customers(merchant_id)

        # Compute aggregates
        t_inc, t_exp = _aggregate_txns(today_txns)
        m_inc, m_exp = _aggregate_txns(month_txns)
        total_udhari = sum(u.get("remaining", 0) for u in udharis if u.get("status") in ("pending", "partial", "overdue"))
        overdue_udhari = sum(u.get("remaining", 0) for u in udharis if u.get("status") == "overdue")

        # PayScore (may not exist yet)
        payscore_rows = db.select("payscore_history", filters={"merchant_id": merchant_id}, order_by="calculated_at", order_desc=True, limit=1)
        payscore = payscore_rows[0].get("score") if payscore_rows else None

        # Build alerts
        alerts: list[dict] = []
        if overdue_udhari > 0:
            alerts.append({
                "type": "overdue_udhari",
                "severity": "warning",
                "message": f"{overdue_udhari} rupaye ka udhari overdue hai.",
            })
        if m_exp > m_inc and m_inc > 0:
            alerts.append({
                "type": "expense_exceeds_income",
                "severity": "critical",
                "message": "Is mahine kharcha income se zyada ho gaya hai!",
            })

        # Payment mode breakdowns
        cash_income = sum(t["amount"] for t in month_txns if t.get("type") == "income" and t.get("payment_mode", "cash") == "cash")
        upi_income = sum(t["amount"] for t in month_txns if t.get("type") == "income" and t.get("payment_mode") == "upi")
        cash_expense = sum(t["amount"] for t in month_txns if t.get("type") == "expense" and t.get("payment_mode", "cash") == "cash")
        upi_expense = sum(t["amount"] for t in month_txns if t.get("type") == "expense" and t.get("payment_mode") == "upi")

        # Recent transactions with full details
        recent_transactions = [
            {
                "id": t.get("id"),
                "type": t.get("type"),
                "amount": t.get("amount"),
                "category": t.get("category"),
                "payment_mode": t.get("payment_mode", "cash"),
                "customer_name": t.get("customer_name"),
                "created_at": t.get("created_at") or t.get("recorded_at"),
                "description": t.get("description"),
            }
            for t in recent[:10]
        ]

        return {
            "merchant_id": merchant_id,
            "today_income": round(t_inc, 2),
            "today_expense": round(t_exp, 2),
            "today_profit": round(t_inc - t_exp, 2),
            "month_income": round(m_inc, 2),
            "month_expense": round(m_exp, 2),
            "month_profit": round(m_inc - m_exp, 2),
            "cash_income": round(cash_income, 2),
            "upi_income": round(upi_income, 2),
            "cash_expense": round(cash_expense, 2),
            "upi_expense": round(upi_expense, 2),
            "total_udhari": round(total_udhari, 2),
            "overdue_udhari": round(overdue_udhari, 2),
            "payscore": payscore,
            "active_customers": len(customers),
            "recent_transactions": recent_transactions,
            "alerts": alerts,
        }
    except Exception as e:
        logger.exception(f"Error in dashboard: {e}")
        return {"error": True, "message": "Kuch gadbad ho gayi. Kripya dobara try karein.", "detail": str(e)}


@router.get("/{merchant_id}/today", response_model=TodaySummary)
async def get_today_summary(merchant_id: str):
    """Today's income, expense, profit, and comparison to yesterday."""
    today_str = date.today().isoformat()
    yesterday_str = (date.today() - timedelta(days=1)).isoformat()

    today_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", today_str),
        lte=("recorded_at", today_str + "T23:59:59"),
    )
    yesterday_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", yesterday_str),
        lte=("recorded_at", yesterday_str + "T23:59:59"),
    )

    t_inc, t_exp = _aggregate_txns(today_txns)
    y_inc, y_exp = _aggregate_txns(yesterday_txns)

    today_profit = t_inc - t_exp
    yesterday_profit = y_inc - y_exp
    comparison = None
    if yesterday_profit != 0:
        comparison = round(((today_profit - yesterday_profit) / abs(yesterday_profit)) * 100, 1)

    # Top category
    cat_totals: dict[str, float] = {}
    for t in today_txns:
        cat = t.get("category", "Other")
        cat_totals[cat] = cat_totals.get(cat, 0) + t.get("amount", 0)
    top_cat = max(cat_totals, key=cat_totals.get) if cat_totals else None

    return TodaySummary(
        income=round(t_inc, 2),
        expense=round(t_exp, 2),
        profit=round(today_profit, 2),
        transaction_count=len(today_txns),
        top_category=top_cat,
        comparison_yesterday=comparison,
    )


@router.get("/{merchant_id}/monthly", response_model=MonthlySummary)
async def get_monthly_summary(merchant_id: str):
    """
    Current month summary with daily breakdown and category breakdown.
    """
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    last_month_start = (today.replace(day=1) - timedelta(days=1)).replace(day=1).isoformat()
    last_month_end = (today.replace(day=1) - timedelta(days=1)).isoformat()

    month_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", month_start),
    )
    last_month_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", last_month_start),
        lte=("recorded_at", last_month_end),
    )

    m_inc, m_exp = _aggregate_txns(month_txns)
    lm_inc, lm_exp = _aggregate_txns(last_month_txns)

    # Daily breakdown
    daily: dict[str, dict[str, float]] = {}
    for t in month_txns:
        d = str(t.get("recorded_at", ""))[:10]
        if d not in daily:
            daily[d] = {"date": d, "income": 0, "expense": 0}
        if t.get("type") == "income":
            daily[d]["income"] += t["amount"]
        else:
            daily[d]["expense"] += t["amount"]

    daily_breakdown = sorted(daily.values(), key=lambda x: x["date"])

    # Category breakdown
    cat_map: dict[str, dict] = {}
    grand = sum(t.get("amount", 0) for t in month_txns)
    for t in month_txns:
        cat = t.get("category", "Other")
        if cat not in cat_map:
            cat_map[cat] = {"total": 0.0, "count": 0}
        cat_map[cat]["total"] += t.get("amount", 0)
        cat_map[cat]["count"] += 1

    cat_breakdown = []
    for cat, vals in sorted(cat_map.items(), key=lambda x: x[1]["total"], reverse=True):
        pct = (vals["total"] / grand * 100) if grand > 0 else 0
        cat_breakdown.append(CategorySummary(
            category=cat,
            total=round(vals["total"], 2),
            count=vals["count"],
            percentage=round(pct, 1),
        ))

    # Month-over-month comparison
    lm_profit = lm_inc - lm_exp
    comparison = None
    if lm_profit != 0:
        comparison = round(((m_inc - m_exp - lm_profit) / abs(lm_profit)) * 100, 1)

    return MonthlySummary(
        income=round(m_inc, 2),
        expense=round(m_exp, 2),
        profit=round(m_inc - m_exp, 2),
        daily_breakdown=daily_breakdown,
        category_breakdown=cat_breakdown,
        comparison_last_month=comparison,
    )
