"""
Dashboard router -- aggregated views of merchant state.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query

from config import get_settings
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


def _get_vendor_payables(merchant_id: str) -> dict:
    """Get vendor payables summary for dashboard."""
    try:
        from routers.vendors import get_vendor_payables_summary
        return get_vendor_payables_summary(merchant_id)
    except Exception:
        return {"total_payables": 0, "overdue_payables": 0}


def _aggregate_txns(txns: list[dict]) -> tuple[float, float]:
    """Return (income, expense) totals from a list of transaction dicts."""
    income = sum(t["amount"] for t in txns if t.get("type") == "income")
    expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
    return income, expense


@router.get("/expense-optimization/{merchant_id}")
async def expense_optimization(merchant_id: str):
    """AI-powered expense optimization suggestions using Groq."""
    import httpx
    from datetime import timedelta
    from collections import defaultdict

    settings = get_settings()

    # Get last 90 days expenses
    ninety_days_ago = (date.today() - timedelta(days=90)).isoformat()
    expenses = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id, "type": "expense"},
        gte=("created_at", ninety_days_ago),
    )

    if not expenses:
        return {"suggestions": [], "total_expense": 0, "recommendation_hi": "Abhi koi expense data nahi hai."}

    # Group by category and vendor
    cat_totals: dict[str, float] = defaultdict(float)
    vendor_totals: dict[str, float] = defaultdict(float)
    vendor_frequency: dict[str, int] = defaultdict(int)
    monthly_expense: dict[str, float] = defaultdict(float)

    for e in expenses:
        amt = float(e.get("amount", 0))
        cat = e.get("category", "Other") or "Other"
        vendor = e.get("supplier_name", e.get("description", "")) or "Unknown"
        month = str(e.get("created_at", ""))[:7]

        cat_totals[cat] += amt
        vendor_totals[vendor] += amt
        vendor_frequency[vendor] += 1
        monthly_expense[month] += amt

    total_expense = sum(cat_totals.values())

    # Get income for context
    income_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id, "type": "income"},
        gte=("created_at", ninety_days_ago),
    )
    total_income = sum(float(t.get("amount", 0)) for t in income_txns)

    # Build suggestions
    suggestions = []

    # Top expense categories
    sorted_cats = sorted(cat_totals.items(), key=lambda x: -x[1])
    top_cats = sorted_cats[:5]

    # Vendors with multiple small orders (bulk opportunity)
    for vendor, total in sorted(vendor_totals.items(), key=lambda x: -x[1])[:5]:
        freq = vendor_frequency[vendor]
        if freq >= 3 and total > 5000:
            avg_order = total / freq
            suggestions.append({
                "type": "bulk_order",
                "vendor": vendor,
                "total_spent": round(total, 2),
                "order_count": freq,
                "avg_order": round(avg_order, 2),
                "potential_saving": round(total * 0.08, 2),
                "tip_hi": f"{vendor} se {freq} baar order kiya (avg Rs {avg_order:,.0f}). Ek saath bulk order se 5-10% bach sakta hai.",
            })

    # Category over-spending
    expense_pct = round(total_expense / max(total_income, 1) * 100, 1)
    if expense_pct > 60:
        suggestions.append({
            "type": "high_expense_ratio",
            "expense_pct": expense_pct,
            "tip_hi": f"Kharcha income ka {expense_pct}% hai. 50-60% se neeche rakhna chahiye.",
        })

    # Groq detailed recommendation
    recommendation_hi = ""
    try:
        cat_summary = ", ".join([f"{c}: Rs {a:,.0f}" for c, a in top_cats])
        vendor_summary = ", ".join([f"{v}: Rs {a:,.0f} ({vendor_frequency[v]}x)" for v, a in sorted(vendor_totals.items(), key=lambda x: -x[1])[:3]])

        prompt = f"""Indian small business expense analysis (last 3 months):
Total income: Rs {total_income:,.0f}
Total expense: Rs {total_expense:,.0f} ({expense_pct}% of income)
Top categories: {cat_summary}
Top vendors: {vendor_summary}

Give 3 specific Hindi expense optimization tips. Be practical for a small shopkeeper. Include potential savings in Rs."""

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
                json={"model": settings.groq_model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.4, "max_tokens": 300})
        if resp.status_code == 200:
            recommendation_hi = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        recommendation_hi = f"Total kharcha Rs {total_expense:,.0f} hai (income ka {expense_pct}%). Top category: {top_cats[0][0] if top_cats else 'N/A'}."

    return {
        "merchant_id": merchant_id,
        "total_expense": round(total_expense, 2),
        "total_income": round(total_income, 2),
        "expense_pct": expense_pct,
        "top_categories": [{"category": c, "amount": round(a, 2)} for c, a in top_cats],
        "suggestions": suggestions,
        "recommendation_hi": recommendation_hi,
    }


@router.get("/pnl-report/{merchant_id}")
async def auto_pnl_report(merchant_id: str, month: int = Query(None), year: int = Query(None)):
    """Generate monthly P&L report with Groq Hindi commentary."""
    return await _generate_pnl(merchant_id, month, year)


async def _generate_pnl(merchant_id: str, month=None, year=None):
    import httpx
    from collections import defaultdict

    settings = get_settings()
    today = date.today()
    try:
        rpt_month = int(month) if month is not None else today.month
    except (TypeError, ValueError):
        rpt_month = today.month
    try:
        rpt_year = int(year) if year is not None else today.year
    except (TypeError, ValueError):
        rpt_year = today.year

    start = f"{rpt_year}-{rpt_month:02d}-01"
    if rpt_month == 12:
        end = f"{rpt_year + 1}-01-01"
    else:
        end = f"{rpt_year}-{rpt_month + 1:02d}-01"

    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("created_at", start),
        lte=("created_at", end),
    )

    # Income breakdown
    income_by_cat: dict[str, float] = defaultdict(float)
    expense_by_cat: dict[str, float] = defaultdict(float)

    for t in txns:
        amt = float(t.get("amount", 0))
        cat = t.get("category", "Other") or "Other"
        if t.get("type") == "income":
            income_by_cat[cat] += amt
        elif t.get("type") == "expense":
            expense_by_cat[cat] += amt

    total_income = sum(income_by_cat.values())
    total_expense = sum(expense_by_cat.values())
    net_profit = total_income - total_expense
    margin = round(net_profit / max(total_income, 1) * 100, 1)

    # Previous month for comparison
    if rpt_month == 1:
        prev_start = f"{rpt_year - 1}-12-01"
        prev_end = f"{rpt_year}-01-01"
    else:
        prev_start = f"{rpt_year}-{rpt_month - 1:02d}-01"
        prev_end = start

    prev_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("created_at", prev_start),
        lte=("created_at", prev_end),
    )
    prev_income = sum(float(t.get("amount", 0)) for t in prev_txns if t.get("type") == "income")
    prev_expense = sum(float(t.get("amount", 0)) for t in prev_txns if t.get("type") == "expense")
    prev_profit = prev_income - prev_expense

    income_growth = round((total_income - prev_income) / max(prev_income, 1) * 100, 1)
    profit_growth = round((net_profit - prev_profit) / max(abs(prev_profit), 1) * 100, 1)

    # Top income and expense categories
    top_income = sorted(income_by_cat.items(), key=lambda x: -x[1])[:5]
    top_expense = sorted(expense_by_cat.items(), key=lambda x: -x[1])[:5]

    # Most profitable item (highest income category minus related expense)
    most_profitable = top_income[0][0] if top_income else "N/A"

    # Groq commentary
    import calendar
    month_name = calendar.month_name[rpt_month]
    commentary_hi = ""
    try:
        income_cats = ", ".join([f"{c}: Rs {a:,.0f}" for c, a in top_income])
        expense_cats = ", ".join([f"{c}: Rs {a:,.0f}" for c, a in top_expense])

        prompt = f"""{month_name} {rpt_year} P&L for Indian small business:
Income: Rs {total_income:,.0f} (prev month: Rs {prev_income:,.0f}, growth: {income_growth}%)
Expense: Rs {total_expense:,.0f} (prev: Rs {prev_expense:,.0f})
Profit: Rs {net_profit:,.0f} (margin: {margin}%, growth: {profit_growth}%)
Top income: {income_cats}
Top expense: {expense_cats}

Write 3-4 line Hindi commentary for the shopkeeper. Be specific with numbers. Mention what went well, what needs attention, and one actionable tip."""

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
                json={"model": settings.groq_model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.4, "max_tokens": 300})
        if resp.status_code == 200:
            commentary_hi = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        commentary_hi = f"{month_name} mein Rs {total_income:,.0f} income, Rs {total_expense:,.0f} kharcha. Profit Rs {net_profit:,.0f} ({margin}% margin)."

    return {
        "merchant_id": merchant_id,
        "period": f"{rpt_year}-{rpt_month:02d}",
        "month_name": month_name,
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "net_profit": round(net_profit, 2),
        "margin_pct": margin,
        "prev_income": round(prev_income, 2),
        "prev_expense": round(prev_expense, 2),
        "prev_profit": round(prev_profit, 2),
        "income_growth_pct": income_growth,
        "profit_growth_pct": profit_growth,
        "income_breakdown": [{"category": c, "amount": round(a, 2)} for c, a in top_income],
        "expense_breakdown": [{"category": c, "amount": round(a, 2)} for c, a in top_expense],
        "most_profitable": most_profitable,
        "commentary_hi": commentary_hi,
        "transaction_count": len(txns),
    }


@router.post("/send-pnl/{merchant_id}")
async def send_pnl_whatsapp(merchant_id: str):
    """Send monthly P&L summary via WhatsApp."""
    from services.twilio_service import send_whatsapp

    data = await _generate_pnl(merchant_id)

    arrow = "+" if data['income_growth_pct'] > 0 else ""
    msg = f"P&L Report - {data['month_name']}\n\n"
    msg += f"Income: Rs {data['total_income']:,.0f}"
    if data['income_growth_pct'] != 0:
        msg += f" ({arrow}{data['income_growth_pct']}%)"
    msg += f"\nExpense: Rs {data['total_expense']:,.0f}"
    msg += f"\nProfit: Rs {data['net_profit']:,.0f} ({data['margin_pct']}%)"
    if data.get('commentary_hi'):
        msg += f"\n\n{data['commentary_hi'][:500]}"
    msg += "\n\n- MunimAI"

    try:
        result = await send_whatsapp(to="+917725014797", body=msg)
        return {"sent": True, "message": msg}
    except Exception as e:
        return {"sent": False, "message": msg, "error": str(e)}


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

        # --- Phase 3.1: Personal vs Business Money Separation ---
        try:
            personal_expenses = sum(
                t["amount"] for t in today_txns if t.get("is_personal")
            )
            business_expense = t_exp - personal_expenses
            business_profit = t_inc - business_expense
        except Exception:
            personal_expenses = 0
            business_expense = t_exp
            business_profit = t_inc - t_exp

        # --- Phase 3.2: Cash Runway Calculator ---
        try:
            avg_daily_expense = m_exp / max(date.today().day, 1)
            cash_on_hand = t_inc - t_exp  # simplified
            cash_runway_days = round(cash_on_hand / max(avg_daily_expense, 1))
        except Exception:
            cash_runway_days = 0

        # --- Phase 3.3: Expense Anomaly Detection ---
        try:
            # Build category totals for this month (expenses only)
            category_totals: dict[str, float] = {}
            for t in month_txns:
                if t.get("type") == "expense":
                    cat = t.get("category", "Other")
                    category_totals[cat] = category_totals.get(cat, 0) + t.get("amount", 0)

            # Fetch last month's transactions for comparison
            last_month_end_dt = now_ist.replace(day=1) - td(days=1)
            last_month_start_str = last_month_end_dt.replace(day=1).strftime("%Y-%m-%d")
            last_month_end_str = last_month_end_dt.strftime("%Y-%m-%d") + "T23:59:59+05:30"
            try:
                last_month_txns = db.select_range(
                    "transactions",
                    filters={"merchant_id": merchant_id},
                    gte=("created_at", last_month_start_str),
                    lte=("created_at", last_month_end_str),
                )
            except Exception:
                last_month_txns = []

            last_month_category_totals: dict[str, float] = {}
            for t in last_month_txns:
                if t.get("type") == "expense":
                    cat = t.get("category", "Other")
                    last_month_category_totals[cat] = last_month_category_totals.get(cat, 0) + t.get("amount", 0)

            anomalies = []
            for cat, this_month_total in category_totals.items():
                last_month_total = last_month_category_totals.get(cat, 0)
                if last_month_total > 0 and this_month_total > last_month_total * 1.5:
                    pct = round((this_month_total - last_month_total) / last_month_total * 100)
                    anomalies.append({
                        "category": cat,
                        "this_month": this_month_total,
                        "last_month": last_month_total,
                        "increase_pct": pct,
                        "alert_hi": f"{cat} kharcha {pct}% zyada hai pichle mahine se!",
                    })
        except Exception:
            anomalies = []

        # --- Phase 3.4: Loan Readiness ---
        try:
            _payscore = payscore or 0
            if _payscore >= 80:
                loan_eligible = "Rs 5,00,000 at 14%"
            elif _payscore >= 70:
                loan_eligible = "Rs 2,00,000 at 16%"
            elif _payscore >= 60:
                loan_eligible = "Rs 50,000 at 18%"
            else:
                loan_eligible = "Not yet eligible"
            points_needed = max(0, 80 - _payscore)
        except Exception:
            loan_eligible = "Not yet eligible"
            points_needed = 80

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

        dashboard_result = {
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
            # Phase 3.1: Personal vs Business separation
            "personal_expenses": round(personal_expenses, 2),
            "business_expense": round(business_expense, 2),
            "business_profit": round(business_profit, 2),
            # Phase 3.2: Cash runway
            "cash_runway_days": cash_runway_days,
            # Phase 3.3: Expense anomalies
            "expense_anomalies": anomalies,
            # Phase 3.4: Loan readiness
            "loan_eligible": loan_eligible,
            "points_needed": points_needed,
            # Vendor payables
            **_get_vendor_payables(merchant_id),
        }

        # Auto-send morning briefing if not sent today
        try:
            from datetime import date as _date
            from models.db import get_client as _gc
            _db = _gc()
            _today = _date.today().isoformat()
            existing = _db.table("briefings").select("id").eq("merchant_id", merchant_id).eq("date", _today).execute()
            if not existing.data:
                briefing_text = f"Namaste! Aaj ka hisaab: Income Rs {t_inc:,.0f}, Kharcha Rs {t_exp:,.0f}, Profit Rs {t_inc-t_exp:,.0f}. Udhari pending: Rs {total_udhari:,.0f}."
                from services.twilio_service import send_whatsapp
                import asyncio
                asyncio.create_task(send_whatsapp("+917725014797", f"\U0001f305 MunimAI Morning Briefing\n\n{briefing_text}"))
                _db.table("briefings").insert({"merchant_id": merchant_id, "date": _today, "content": {"summary": briefing_text}}).execute()
        except Exception:
            pass

        return dashboard_result
    except Exception as e:
        logger.exception(f"Error in dashboard: {e}")
        return {"error": True, "message": "Kuch gadbad ho gayi. Kripya dobara try karein.", "detail": str(e)}


@router.get("/{merchant_id}/pnl")
async def get_pnl_report(merchant_id: str, period: str = "month"):
    """
    Profit & Loss report -- monthly or yearly breakdown.
    period: "month" (current month), "year" (current year), "last_month", "last_year"
    """
    try:
        from datetime import timezone, timedelta as td
        from collections import defaultdict

        ist = timezone(td(hours=5, minutes=30))
        now_ist = datetime.now(ist)

        # ---- Determine date boundaries for the requested period ----
        if period == "month":
            start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now_ist
            period_label = now_ist.strftime("%B %Y")
            # Previous period = last month
            prev_end = start - td(seconds=1)
            prev_start = prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "last_month":
            first_this_month = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = first_this_month - td(seconds=1)
            start = end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            period_label = start.strftime("%B %Y")
            prev_end = start - td(seconds=1)
            prev_start = prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        elif period == "year":
            start = now_ist.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now_ist
            period_label = str(now_ist.year)
            prev_start = start.replace(year=start.year - 1)
            prev_end = start - td(seconds=1)
        elif period == "last_year":
            start = now_ist.replace(year=now_ist.year - 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now_ist.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0) - td(seconds=1)
            period_label = str(now_ist.year - 1)
            prev_start = start.replace(year=start.year - 1)
            prev_end = start - td(seconds=1)
        else:
            # Default to current month
            start = now_ist.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end = now_ist
            period_label = now_ist.strftime("%B %Y")
            prev_end = start - td(seconds=1)
            prev_start = prev_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        start_str = start.strftime("%Y-%m-%dT%H:%M:%S+05:30")
        end_str = end.strftime("%Y-%m-%dT%H:%M:%S+05:30")
        prev_start_str = prev_start.strftime("%Y-%m-%dT%H:%M:%S+05:30")
        prev_end_str = prev_end.strftime("%Y-%m-%dT%H:%M:%S+05:30")

        # ---- Fetch transactions for current and previous period ----
        txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("created_at", start_str),
            lte=("created_at", end_str),
        )
        prev_txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("created_at", prev_start_str),
            lte=("created_at", prev_end_str),
        )

        # ---- Totals ----
        total_income = sum(t["amount"] for t in txns if t.get("type") == "income")
        total_expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
        gross_profit = total_income - total_expense
        personal_withdrawals = sum(
            t["amount"] for t in txns if t.get("type") == "expense" and t.get("is_personal")
        )
        business_profit = gross_profit + personal_withdrawals  # add back personal since it's already in expense
        # Actually: business_profit = total_income - (total_expense - personal_withdrawals)
        business_profit = total_income - (total_expense - personal_withdrawals)
        profit_margin = round((gross_profit / total_income * 100), 1) if total_income > 0 else 0

        # ---- Income breakdown by category ----
        income_by_cat: dict[str, float] = defaultdict(float)
        for t in txns:
            if t.get("type") == "income":
                cat = t.get("category") or "Sales"
                income_by_cat[cat] += t["amount"]
        income_by_category = sorted(
            [
                {
                    "category": cat,
                    "amount": round(amt, 2),
                    "pct": round(amt / total_income * 100, 1) if total_income > 0 else 0,
                }
                for cat, amt in income_by_cat.items()
            ],
            key=lambda x: x["amount"],
            reverse=True,
        )

        # ---- Expense breakdown by category ----
        expense_by_cat: dict[str, float] = defaultdict(float)
        for t in txns:
            if t.get("type") == "expense":
                cat = t.get("category") or "Other"
                expense_by_cat[cat] += t["amount"]
        expense_by_category = sorted(
            [
                {
                    "category": cat,
                    "amount": round(amt, 2),
                    "pct": round(amt / total_expense * 100, 1) if total_expense > 0 else 0,
                }
                for cat, amt in expense_by_cat.items()
            ],
            key=lambda x: x["amount"],
            reverse=True,
        )

        # ---- Daily trend ----
        daily_map: dict[str, dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
        for t in txns:
            d = str(t.get("created_at", ""))[:10]
            if t.get("type") == "income":
                daily_map[d]["income"] += t["amount"]
            elif t.get("type") == "expense":
                daily_map[d]["expense"] += t["amount"]
        daily_trend = sorted(
            [
                {
                    "date": d,
                    "income": round(vals["income"], 2),
                    "expense": round(vals["expense"], 2),
                    "profit": round(vals["income"] - vals["expense"], 2),
                }
                for d, vals in daily_map.items()
            ],
            key=lambda x: x["date"],
        )

        # ---- Comparison with previous period ----
        prev_income = sum(t["amount"] for t in prev_txns if t.get("type") == "income")
        prev_expense = sum(t["amount"] for t in prev_txns if t.get("type") == "expense")
        prev_profit = prev_income - prev_expense

        income_change_pct = round((total_income - prev_income) / prev_income * 100, 1) if prev_income > 0 else 0
        expense_change_pct = round((total_expense - prev_expense) / prev_expense * 100, 1) if prev_expense > 0 else 0
        profit_change_pct = round((gross_profit - prev_profit) / abs(prev_profit) * 100, 1) if prev_profit != 0 else 0

        if profit_change_pct > 5:
            trend = "improving"
        elif profit_change_pct < -5:
            trend = "declining"
        else:
            trend = "stable"

        vs_previous = {
            "income_change_pct": income_change_pct,
            "expense_change_pct": expense_change_pct,
            "profit_change_pct": profit_change_pct,
            "trend": trend,
        }

        # ---- Top customers by revenue ----
        customer_map: dict[str, dict] = defaultdict(lambda: {"amount": 0.0, "txn_count": 0})
        for t in txns:
            if t.get("type") == "income" and t.get("customer_name"):
                name = t["customer_name"]
                customer_map[name]["amount"] += t["amount"]
                customer_map[name]["txn_count"] += 1
        top_customers = sorted(
            [
                {"name": name, "amount": round(vals["amount"], 2), "txn_count": vals["txn_count"]}
                for name, vals in customer_map.items()
            ],
            key=lambda x: x["amount"],
            reverse=True,
        )[:10]

        # ---- Payment mode split ----
        payment_modes: dict[str, dict[str, float]] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
        for t in txns:
            mode = (t.get("payment_mode") or "cash").lower()
            if t.get("type") == "income":
                payment_modes[mode]["income"] += t["amount"]
            elif t.get("type") == "expense":
                payment_modes[mode]["expense"] += t["amount"]
        # Round values
        payment_modes_out = {
            mode: {"income": round(vals["income"], 2), "expense": round(vals["expense"], 2)}
            for mode, vals in payment_modes.items()
        }

        return {
            "period": period_label,
            "period_type": period,
            "total_income": round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "gross_profit": round(gross_profit, 2),
            "personal_withdrawals": round(personal_withdrawals, 2),
            "business_profit": round(business_profit, 2),
            "profit_margin": profit_margin,
            "income_by_category": income_by_category,
            "expense_by_category": expense_by_category,
            "daily_trend": daily_trend,
            "vs_previous": vs_previous,
            "top_customers": top_customers,
            "payment_modes": payment_modes_out,
        }
    except Exception as e:
        logger.exception(f"Error in P&L report: {e}")
        return {
            "error": True,
            "message": "P&L report generate karne mein error aaya.",
            "detail": str(e),
        }


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
