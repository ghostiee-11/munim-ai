"""
MunimAI Smart Inventory Inference Agent

Infers inventory levels and needs from transaction patterns:
1. Analyze purchase/sale patterns to estimate stock levels
2. Detect reorder needs based on purchase frequency
3. Identify deadstock (items not moving for 45+ days)
4. Generate Hindi recommendations for inventory actions

No separate inventory table needed — all inferred from transactions.
This is the "jugaad" approach for small businesses that don't
maintain formal inventory records.
"""

import logging
from collections import defaultdict
from datetime import datetime, date, timedelta
from typing import Optional

from groq import AsyncGroq

from config import get_settings
from models import db

logger = logging.getLogger(__name__)

settings = get_settings()

# Thresholds
REORDER_FREQUENCY_MULTIPLIER = 1.5  # If gap > 1.5x avg, reorder needed
DEADSTOCK_DAYS = 45                  # Items not sold in 45+ days
LOW_STOCK_CONFIDENCE = 0.7           # Minimum confidence for alerts

INVENTORY_RECOMMENDATION_PROMPT = """You are MunimAI's inventory advisor for Indian small businesses.

Your task: Generate a concise Hindi inventory recommendation based on the analysis.

RULES:
1. Use Hindi (Devanagari) with common English business terms
2. Be specific — mention item names, quantities, amounts
3. Be actionable — tell the merchant EXACTLY what to do
4. Keep each recommendation under 50 words
5. Use urgency levels: ⚠️ (urgent), 🔶 (attention), 💡 (suggestion)
6. Reference supplier names if available
7. Mention festivals/seasons if relevant to stocking decisions

Generate ONLY the recommendation list. One per line."""


async def infer_inventory(
    merchant_id: str,
    transactions: list[dict],
) -> dict:
    """
    Analyze transaction patterns to infer inventory status.

    Groups transactions by supplier/category, calculates purchase
    and sale velocities, and infers current stock position.

    Args:
        merchant_id: The merchant's UUID
        transactions: List of transaction dicts

    Returns:
        Dict with inferred inventory status per category/supplier,
        reorder alerts, deadstock warnings, and demand trends.
    """
    today = date.today()

    # Separate purchases (expense + stock category) and sales (income)
    purchases: list[dict] = []
    sales: list[dict] = []

    for txn in transactions:
        txn_type = txn.get("type", "")
        if txn_type == "expense" and _is_stock_purchase(txn):
            purchases.append(txn)
        elif txn_type == "income":
            sales.append(txn)

    # Group by category/supplier
    purchase_groups = _group_transactions(purchases, key="party_name")
    sales_groups = _group_transactions(sales, key="category")

    # Analyze each group
    inventory_items = []

    for supplier, supplier_txns in purchase_groups.items():
        if not supplier:
            continue

        analysis = _analyze_purchase_pattern(supplier_txns, today)
        inventory_items.append({
            "type": "supplier",
            "name": supplier,
            "total_purchased": analysis["total_amount"],
            "purchase_count": analysis["count"],
            "avg_purchase_amount": analysis["avg_amount"],
            "avg_purchase_gap_days": analysis["avg_gap_days"],
            "days_since_last_purchase": analysis["days_since_last"],
            "reorder_needed": analysis["reorder_needed"],
            "estimated_next_purchase": analysis["estimated_next_date"],
            "trend": analysis["trend"],
        })

    # Detect reorder needs
    reorder_alerts = detect_reorder_needs(purchases)

    # Detect deadstock from sales patterns
    deadstock_alerts = detect_deadstock(sales)

    # Demand trends from sales
    demand_trends = _analyze_demand_trends(sales, today)

    return {
        "merchant_id": merchant_id,
        "inventory_items": inventory_items,
        "reorder_alerts": reorder_alerts,
        "deadstock_alerts": deadstock_alerts,
        "demand_trends": demand_trends,
        "summary": {
            "total_suppliers": len(purchase_groups),
            "items_needing_reorder": len(reorder_alerts),
            "deadstock_items": len(deadstock_alerts),
            "trending_up": len([d for d in demand_trends if d.get("trend") == "increasing"]),
            "trending_down": len([d for d in demand_trends if d.get("trend") == "decreasing"]),
        },
        "analyzed_at": datetime.now().isoformat(),
    }


def detect_reorder_needs(purchase_history: list[dict]) -> list[dict]:
    """
    Detect items/suppliers where reorder is needed.

    Rule: If days since last purchase > 1.5x average purchase frequency,
    flag as reorder needed.

    Args:
        purchase_history: List of purchase (expense) transactions

    Returns:
        List of reorder alerts:
        [{supplier, days_overdue, avg_frequency, last_purchase_date,
          estimated_amount, urgency, recommendation_hi}]
    """
    today = date.today()
    groups = _group_transactions(purchase_history, key="party_name")
    alerts = []

    for supplier, txns in groups.items():
        if not supplier or len(txns) < 2:
            continue

        analysis = _analyze_purchase_pattern(txns, today)
        avg_gap = analysis["avg_gap_days"]
        days_since = analysis["days_since_last"]

        if avg_gap <= 0:
            continue

        # Reorder trigger: days since last > 1.5x average gap
        if days_since > avg_gap * REORDER_FREQUENCY_MULTIPLIER:
            days_overdue = int(days_since - avg_gap)

            if days_overdue > avg_gap:
                urgency = "high"
            elif days_overdue > avg_gap * 0.5:
                urgency = "medium"
            else:
                urgency = "low"

            alerts.append({
                "supplier": supplier,
                "days_overdue": days_overdue,
                "avg_frequency_days": round(avg_gap),
                "days_since_last_purchase": days_since,
                "last_purchase_date": analysis.get("last_date", ""),
                "estimated_amount": analysis["avg_amount"],
                "urgency": urgency,
                "recommendation_hi": _reorder_recommendation(
                    supplier, days_overdue, analysis["avg_amount"], urgency
                ),
            })

    # Sort by urgency (high first)
    urgency_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: urgency_order.get(a["urgency"], 3))
    return alerts


def detect_deadstock(sales_data: list[dict]) -> list[dict]:
    """
    Identify items/categories not sold in 45+ days.

    Args:
        sales_data: List of sales (income) transactions

    Returns:
        List of deadstock alerts:
        [{category, days_since_last_sale, last_sale_date,
          total_value_at_risk, recommendation_hi}]
    """
    today = date.today()
    groups = _group_transactions(sales_data, key="category")
    alerts = []

    for category, txns in groups.items():
        if not category:
            continue

        dates = _extract_dates(txns)
        if not dates:
            continue

        last_sale = max(dates)
        days_since = (today - last_sale).days

        if days_since >= DEADSTOCK_DAYS:
            total_historical = sum(t.get("amount", 0) for t in txns)
            avg_sale = total_historical / max(len(txns), 1)

            alerts.append({
                "category": category,
                "days_since_last_sale": days_since,
                "last_sale_date": last_sale.isoformat(),
                "historical_avg_sale": round(avg_sale, 2),
                "total_historical_value": round(total_historical, 2),
                "recommendation_hi": _deadstock_recommendation(category, days_since),
            })

    alerts.sort(key=lambda a: -a["days_since_last_sale"])
    return alerts


async def generate_inventory_recommendations(merchant_id: str) -> list[str]:
    """
    Generate Hindi inventory recommendations using Groq LLM.

    Fetches recent transactions, analyzes patterns, and produces
    actionable Hindi recommendations.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        List of Hindi recommendation strings.
    """
    # Fetch last 90 days of transactions
    ninety_days_ago = (date.today() - timedelta(days=90)).isoformat()
    try:
        transactions = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("date", ninety_days_ago),
            lte=("date", date.today().isoformat()),
            order_by="date",
            order_desc=True,
        )
    except Exception as e:
        logger.error("Failed to fetch transactions for inventory: %s", e)
        return ["Transaction data load nahi ho paya. Baad mein try karein."]

    if not transactions:
        return ["Abhi koi transaction data nahi hai. Pehle kuch transactions add karein."]

    # Run inventory analysis
    analysis = await infer_inventory(merchant_id, transactions)

    # Build context for LLM
    reorder_summary = ""
    for alert in analysis.get("reorder_alerts", [])[:5]:
        reorder_summary += (
            f"- {alert['supplier']}: {alert['days_overdue']} din overdue, "
            f"avg order Rs {alert['estimated_amount']:,.0f}\n"
        )

    deadstock_summary = ""
    for alert in analysis.get("deadstock_alerts", [])[:5]:
        deadstock_summary += (
            f"- {alert['category']}: {alert['days_since_last_sale']} din se nahi bika\n"
        )

    trend_summary = ""
    for trend in analysis.get("demand_trends", [])[:5]:
        trend_summary += (
            f"- {trend['category']}: {trend['trend']} "
            f"({trend.get('change_percent', 0):+.0f}%)\n"
        )

    prompt = f"""Generate Hindi inventory recommendations for a small business:

Reorder needed:
{reorder_summary or 'Koi reorder nahi chahiye abhi.'}

Deadstock items:
{deadstock_summary or 'Koi deadstock nahi hai.'}

Demand trends:
{trend_summary or 'Trends stable hain.'}

Summary:
- {analysis['summary']['items_needing_reorder']} items reorder chahiye
- {analysis['summary']['deadstock_items']} items deadstock hain
- {analysis['summary']['trending_up']} categories mein demand badh rahi hai

Generate 3-5 actionable recommendations in Hindi:"""

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": INVENTORY_RECOMMENDATION_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=400,
        )
        text = response.choices[0].message.content.strip()
        # Split into individual recommendations
        recs = [line.strip() for line in text.split("\n") if line.strip()]
        return recs if recs else _fallback_recommendations(analysis)
    except Exception as e:
        logger.error("Inventory recommendation generation failed: %s", e)
        return _fallback_recommendations(analysis)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_stock_purchase(txn: dict) -> bool:
    """Determine if an expense transaction is a stock purchase."""
    category = txn.get("category", "").lower()
    description = txn.get("description", "").lower()
    stock_keywords = (
        "stock", "inventory", "maal", "supplier", "wholesale",
        "textile", "fabric", "saree", "kapda", "purchase",
    )
    exclude_keywords = ("rent", "salary", "electricity", "bijli", "kiraya")

    if any(kw in category for kw in exclude_keywords):
        return False
    if any(kw in category or kw in description for kw in stock_keywords):
        return True
    # If party_name is a known supplier pattern
    if txn.get("party_name", ""):
        return True  # Expenses to named parties are likely stock purchases
    return False


def _group_transactions(
    transactions: list[dict], key: str = "category",
) -> dict[str, list[dict]]:
    """Group transactions by a given key field."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for txn in transactions:
        group_key = txn.get(key, "unknown") or "unknown"
        groups[group_key].append(txn)
    return dict(groups)


def _extract_dates(transactions: list[dict]) -> list[date]:
    """Extract and parse date objects from transactions."""
    dates = []
    for txn in transactions:
        d = txn.get("date", "")
        if isinstance(d, str):
            try:
                dates.append(date.fromisoformat(d[:10]))
            except ValueError:
                continue
        elif isinstance(d, datetime):
            dates.append(d.date())
        elif isinstance(d, date):
            dates.append(d)
    return dates


def _analyze_purchase_pattern(transactions: list[dict], today: date) -> dict:
    """Analyze the purchase frequency pattern for a supplier/category."""
    dates = sorted(_extract_dates(transactions))
    amounts = [t.get("amount", 0) for t in transactions]

    if not dates:
        return {
            "total_amount": 0, "count": 0, "avg_amount": 0,
            "avg_gap_days": 0, "days_since_last": 999,
            "reorder_needed": False, "estimated_next_date": None,
            "trend": "unknown", "last_date": None,
        }

    total_amount = sum(amounts)
    avg_amount = total_amount / len(amounts)
    days_since_last = (today - dates[-1]).days

    # Calculate gaps between purchases
    if len(dates) >= 2:
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_gap = sum(gaps) / len(gaps)
    else:
        avg_gap = 30  # Default assumption: monthly

    reorder_needed = days_since_last > avg_gap * REORDER_FREQUENCY_MULTIPLIER

    # Estimated next purchase date
    if avg_gap > 0:
        est_next = dates[-1] + timedelta(days=int(avg_gap))
    else:
        est_next = None

    # Trend: compare recent amounts vs older
    mid = len(amounts) // 2
    if mid > 0:
        recent_avg = sum(amounts[:mid]) / mid
        older_avg = sum(amounts[mid:]) / len(amounts[mid:])
        if recent_avg > older_avg * 1.1:
            trend = "increasing"
        elif recent_avg < older_avg * 0.9:
            trend = "decreasing"
        else:
            trend = "stable"
    else:
        trend = "stable"

    return {
        "total_amount": round(total_amount, 2),
        "count": len(transactions),
        "avg_amount": round(avg_amount, 2),
        "avg_gap_days": round(avg_gap, 1),
        "days_since_last": days_since_last,
        "last_date": dates[-1].isoformat(),
        "reorder_needed": reorder_needed,
        "estimated_next_date": est_next.isoformat() if est_next else None,
        "trend": trend,
    }


def _analyze_demand_trends(sales: list[dict], today: date) -> list[dict]:
    """Analyze demand trends by comparing recent vs older sales per category."""
    groups = _group_transactions(sales, key="category")
    trends = []
    cutoff = today - timedelta(days=30)

    for category, txns in groups.items():
        if not category or category == "unknown":
            continue

        recent = [t for t in txns if _parse_date(t.get("date")) and _parse_date(t.get("date")) >= cutoff]
        older = [t for t in txns if _parse_date(t.get("date")) and _parse_date(t.get("date")) < cutoff]

        recent_total = sum(t.get("amount", 0) for t in recent)
        older_total = sum(t.get("amount", 0) for t in older)

        # Normalize older period to 30-day equivalent
        if older:
            older_dates = [_parse_date(t.get("date")) for t in older if _parse_date(t.get("date"))]
            if older_dates:
                older_span = max(1, (max(older_dates) - min(older_dates)).days)
                older_normalized = (older_total / older_span) * 30
            else:
                older_normalized = older_total
        else:
            older_normalized = 0

        if older_normalized > 0:
            change_pct = ((recent_total - older_normalized) / older_normalized) * 100
        else:
            change_pct = 100 if recent_total > 0 else 0

        if change_pct > 10:
            trend = "increasing"
        elif change_pct < -10:
            trend = "decreasing"
        else:
            trend = "stable"

        trends.append({
            "category": category,
            "recent_30d_sales": round(recent_total, 2),
            "previous_period_normalized": round(older_normalized, 2),
            "change_percent": round(change_pct, 1),
            "trend": trend,
        })

    trends.sort(key=lambda t: abs(t["change_percent"]), reverse=True)
    return trends


def _parse_date(d) -> Optional[date]:
    """Safely parse a date from various formats."""
    if isinstance(d, date) and not isinstance(d, datetime):
        return d
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, str):
        try:
            return date.fromisoformat(d[:10])
        except ValueError:
            return None
    return None


def _reorder_recommendation(
    supplier: str, days_overdue: int, avg_amount: float, urgency: str,
) -> str:
    """Generate Hindi reorder recommendation."""
    if urgency == "high":
        return (
            f"⚠️ {supplier} se stock {days_overdue} din overdue hai! "
            f"Abhi Rs {avg_amount:,.0f} ka order karein."
        )
    elif urgency == "medium":
        return (
            f"🔶 {supplier} se stock lene ka time aa gaya hai. "
            f"Rs {avg_amount:,.0f} ka order plan karein."
        )
    return (
        f"💡 {supplier} se jaldi stock mangwa lein — "
        f"Rs {avg_amount:,.0f} ka order."
    )


def _deadstock_recommendation(category: str, days_since: int) -> str:
    """Generate Hindi deadstock recommendation."""
    if days_since > 90:
        return (
            f"⚠️ {category} {days_since} din se nahi bika! "
            f"Discount sale lagayein ya return karein supplier ko."
        )
    return (
        f"🔶 {category} {days_since} din se nahi bika. "
        f"Display mein aage rakhein ya discount dein."
    )


def _fallback_recommendations(analysis: dict) -> list[str]:
    """Fallback Hindi recommendations when LLM is unavailable."""
    recs = []

    reorder = analysis.get("reorder_alerts", [])
    if reorder:
        top = reorder[0]
        recs.append(
            f"⚠️ {top['supplier']} se stock khatam hone wala hai — "
            f"Rs {top['estimated_amount']:,.0f} ka order karein!"
        )

    deadstock = analysis.get("deadstock_alerts", [])
    if deadstock:
        top = deadstock[0]
        recs.append(
            f"🔶 {top['category']} {top['days_since_last_sale']} din se nahi bika — "
            f"discount lagayein."
        )

    trends = analysis.get("demand_trends", [])
    increasing = [t for t in trends if t.get("trend") == "increasing"]
    if increasing:
        top = increasing[0]
        recs.append(
            f"💡 {top['category']} ki demand badh rahi hai (+{top['change_percent']:.0f}%) — "
            f"extra stock rakhein!"
        )

    if not recs:
        recs.append("✅ Inventory stable lag raha hai. Keep going!")

    return recs
