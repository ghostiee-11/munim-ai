"""
MunimAI Customer Radar Agent — TS2Vec-inspired Churn Detection

Analyzes customer behavior to:
1. Calculate RFM (Recency, Frequency, Monetary) scores
2. Detect churn risk using transaction pattern analysis
3. Generate personalized Hindi winback messages via Groq LLM
4. Segment customers into actionable groups

For production: would use TS2Vec contrastive learning on time-series
transaction embeddings. For now: heuristic-based pattern analysis
that captures the same signal (frequency decay, monetary decline).
"""

import logging
from datetime import datetime, date, timedelta
from typing import Optional

from groq import AsyncGroq

from config import get_settings
from models import db

logger = logging.getLogger(__name__)

settings = get_settings()

# RFM scoring thresholds (tuned for Indian small business patterns)
RFM_RECENCY_BINS = [7, 14, 30, 60, 90]        # days since last visit
RFM_FREQUENCY_BINS = [1, 3, 6, 12, 20]         # visits in period
RFM_MONETARY_BINS = [500, 2000, 5000, 15000, 50000]  # total spend in INR

# Customer segments based on RFM combination
SEGMENT_MAP = {
    (5, 5, 5): "champion",
    (5, 5, 4): "champion",
    (5, 4, 5): "champion",
    (4, 5, 5): "loyal",
    (4, 4, 5): "loyal",
    (5, 4, 4): "loyal",
    (4, 4, 4): "loyal",
    (5, 3, 3): "promising",
    (4, 3, 3): "promising",
    (3, 4, 4): "promising",
    (3, 3, 3): "needs_attention",
    (2, 3, 3): "needs_attention",
    (3, 2, 2): "needs_attention",
    (2, 2, 2): "at_risk",
    (2, 1, 2): "at_risk",
    (1, 2, 2): "at_risk",
    (1, 1, 1): "churned",
    (1, 1, 2): "churned",
    (1, 2, 1): "churned",
    (2, 1, 1): "churned",
}

WINBACK_SYSTEM_PROMPT = """You are MunimAI's customer winback specialist for Indian small businesses.

Your task: Generate a personalized WhatsApp message in Hindi to win back a customer who hasn't visited recently.

RULES:
1. Use "ji" suffix with the customer's name
2. Mention the shop name naturally
3. Reference their past purchases if available
4. Include a personalized offer (discount or freebie)
5. Keep under 160 characters for WhatsApp readability
6. Use Hindi (Devanagari) with common English words
7. Sound personal, NOT like a marketing blast
8. Add 1-2 relevant emojis
9. Create urgency without being pushy
10. Be warm — this is a relationship, not a transaction

TONE: Like a shopkeeper personally inviting a regular customer back.

Generate ONLY the message text. No explanation."""


async def analyze_customers(
    merchant_id: str,
    customers: list[dict],
    transactions: list[dict],
) -> dict:
    """
    Full customer analysis: RFM scoring, segmentation, and churn detection.

    Args:
        merchant_id: The merchant's UUID
        customers: List of customer dicts {name, phone, ...}
        transactions: List of transaction dicts with party_name, date, amount

    Returns:
        Dict with segmented customer list, summary stats, and alerts.
    """
    today = date.today()

    # Group transactions by customer (party_name)
    customer_txns: dict[str, list[dict]] = {}
    for txn in transactions:
        party = txn.get("party_name", "")
        if not party or txn.get("type") != "income":
            continue
        customer_txns.setdefault(party, []).append(txn)

    analyzed = []
    segment_counts = {
        "champion": 0, "loyal": 0, "promising": 0,
        "needs_attention": 0, "at_risk": 0, "churned": 0, "new": 0,
    }

    for customer in customers:
        name = customer.get("name", customer.get("party_name", "Unknown"))
        txns = customer_txns.get(name, [])

        if not txns:
            # Customer with no transactions — new or completely churned
            segment_counts["new"] += 1
            analyzed.append({
                "customer_name": name,
                "phone": customer.get("phone"),
                "rfm": {"recency": 1, "frequency": 1, "monetary": 1},
                "segment": "new",
                "churn_probability": 0.0,
                "total_spent": 0,
                "visit_count": 0,
                "days_since_last_visit": None,
            })
            continue

        rfm = calculate_rfm(txns)
        churn_prob = predict_churn_simple({
            "transactions": txns,
            "rfm": rfm,
            "days_since_last_visit": rfm.get("days_since_last_visit", 999),
        })

        segment = rfm.get("segment", "needs_attention")
        segment_counts[segment] = segment_counts.get(segment, 0) + 1

        analyzed.append({
            "customer_name": name,
            "phone": customer.get("phone"),
            "rfm": rfm,
            "segment": segment,
            "churn_probability": round(churn_prob, 2),
            "total_spent": rfm.get("total_spent", 0),
            "visit_count": rfm.get("visit_count", 0),
            "days_since_last_visit": rfm.get("days_since_last_visit"),
            "avg_transaction": rfm.get("avg_transaction", 0),
        })

    # Sort: at-risk and churned first (most actionable)
    priority_order = {"churned": 0, "at_risk": 1, "needs_attention": 2,
                      "promising": 3, "loyal": 4, "champion": 5, "new": 6}
    analyzed.sort(key=lambda c: priority_order.get(c["segment"], 7))

    total_customers = len(analyzed)
    at_risk_count = segment_counts.get("at_risk", 0) + segment_counts.get("churned", 0)

    return {
        "merchant_id": merchant_id,
        "total_customers": total_customers,
        "segment_counts": segment_counts,
        "at_risk_percentage": round(at_risk_count / max(total_customers, 1) * 100, 1),
        "customers": analyzed,
        "alerts_hi": _generate_customer_alerts(segment_counts, analyzed),
        "analyzed_at": datetime.now().isoformat(),
    }


async def detect_churn(merchant_id: str) -> list[dict]:
    """
    Identify at-risk and churned customers from the database.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        List of at-risk customers with churn details:
        [{customer_id, churn_probability, churn_risk, reason, days_since_last_visit}]
    """
    try:
        transactions = db.select(
            "transactions",
            filters={"merchant_id": merchant_id, "type": "income"},
            order_by="date",
            order_desc=True,
        )
    except Exception as e:
        logger.error("Failed to fetch transactions for churn detection: %s", e)
        return []

    if not transactions:
        return []

    # Group by customer
    customer_txns: dict[str, list[dict]] = {}
    for txn in transactions:
        party = txn.get("party_name", "")
        if party:
            customer_txns.setdefault(party, []).append(txn)

    churn_list = []
    today = date.today()

    for name, txns in customer_txns.items():
        if len(txns) < 2:
            continue  # Need at least 2 visits to detect pattern

        rfm = calculate_rfm(txns)
        churn_prob = predict_churn_simple({
            "transactions": txns,
            "rfm": rfm,
            "days_since_last_visit": rfm.get("days_since_last_visit", 999),
        })

        if churn_prob < 0.3:
            continue  # Not at risk

        # Determine risk level and reason
        days_since = rfm.get("days_since_last_visit", 0)
        if churn_prob >= 0.7:
            risk = "high"
        elif churn_prob >= 0.5:
            risk = "medium"
        else:
            risk = "low"

        reason = _churn_reason(rfm, txns, days_since)

        churn_list.append({
            "customer_name": name,
            "churn_probability": round(churn_prob, 2),
            "churn_risk": risk,
            "reason": reason,
            "reason_hi": _churn_reason_hindi(reason, name, days_since),
            "days_since_last_visit": days_since,
            "total_spent": rfm.get("total_spent", 0),
            "visit_count": rfm.get("visit_count", 0),
            "segment": rfm.get("segment", "at_risk"),
        })

    # Sort by churn probability (highest first)
    churn_list.sort(key=lambda c: -c["churn_probability"])
    return churn_list


async def generate_winback(merchant_id: str, customer_id: str) -> dict:
    """
    Generate a personalized Hindi winback message for a churning customer.

    Args:
        merchant_id: The merchant's UUID
        customer_id: Customer name or ID

    Returns:
        Dict with {message, offer, channel, suggested_discount}
    """
    # Fetch customer's transaction history
    try:
        transactions = db.select(
            "transactions",
            filters={"merchant_id": merchant_id, "type": "income"},
            order_by="date",
            order_desc=True,
            limit=100,
        )
        # Filter for this customer
        customer_txns = [t for t in transactions
                         if t.get("party_name", "").lower() == customer_id.lower()]
    except Exception as e:
        logger.error("Failed to fetch customer transactions: %s", e)
        customer_txns = []

    # Determine offer parameters
    if customer_txns:
        total_spent = sum(t.get("amount", 0) for t in customer_txns)
        visit_count = len(customer_txns)
        last_category = customer_txns[0].get("category", "general") if customer_txns else "general"
        avg_spend = total_spent / max(visit_count, 1)

        # Higher-value customers get better offers
        if total_spent > 20000:
            discount = 15
            validity_days = 7
        elif total_spent > 5000:
            discount = 10
            validity_days = 10
        else:
            discount = 5
            validity_days = 14
    else:
        total_spent = 0
        visit_count = 0
        last_category = "general"
        avg_spend = 0
        discount = 10
        validity_days = 10

    # Fetch merchant info
    try:
        merchant = db.select("merchants", filters={"id": merchant_id}, single=True)
        shop_name = merchant.get("name", "Hamari Dukaan") if merchant else "Hamari Dukaan"
    except Exception:
        shop_name = "Hamari Dukaan"

    user_prompt = f"""Generate a Hindi winback WhatsApp message:

Customer: {customer_id}
Shop: {shop_name}
Last purchased: {last_category}
Total visits: {visit_count}
Average spend: Rs {avg_spend:,.0f}
Offer: {discount}% discount, valid {validity_days} days

Write the message in Hindi:"""

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": WINBACK_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,
            max_tokens=200,
        )
        message = response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Winback message generation failed: %s", e)
        message = (
            f"Namaste {customer_id} ji! {shop_name} mein aapki bahut yaad aa rahi hai. "
            f"Aapke liye special {discount}% discount hai — bas {validity_days} din ke liye! "
            f"Aa jayiye na 🙏"
        )

    return {
        "customer_name": customer_id,
        "message": message,
        "offer": {
            "discount_percent": discount,
            "validity_days": validity_days,
            "category": last_category,
        },
        "channel": "whatsapp",
        "suggested_timing": "morning_10am",
    }


def calculate_rfm(customer_transactions: list[dict]) -> dict:
    """
    Calculate RFM (Recency, Frequency, Monetary) scores for a customer.

    Scoring (1-5, 5 is best):
    - Recency: Days since last visit (lower = better)
    - Frequency: Number of visits in period (higher = better)
    - Monetary: Total spent (higher = better)

    Args:
        customer_transactions: List of transaction dicts for ONE customer

    Returns:
        Dict with R/F/M scores (1-5), segment label, and raw values.
    """
    if not customer_transactions:
        return {
            "recency": 1, "frequency": 1, "monetary": 1,
            "segment": "churned",
            "days_since_last_visit": 999,
            "visit_count": 0,
            "total_spent": 0,
            "avg_transaction": 0,
        }

    today = date.today()

    # Parse dates and sort
    dates = []
    total_spent = 0.0
    for txn in customer_transactions:
        txn_date = txn.get("date", "")
        if isinstance(txn_date, str):
            try:
                txn_date = date.fromisoformat(txn_date[:10])
            except ValueError:
                txn_date = today
        elif isinstance(txn_date, datetime):
            txn_date = txn_date.date()
        dates.append(txn_date)
        total_spent += txn.get("amount", 0)

    dates.sort(reverse=True)
    last_visit = dates[0]
    days_since = (today - last_visit).days
    visit_count = len(dates)
    avg_transaction = total_spent / max(visit_count, 1)

    # Score Recency (1-5): fewer days = higher score
    if days_since <= RFM_RECENCY_BINS[0]:
        r_score = 5
    elif days_since <= RFM_RECENCY_BINS[1]:
        r_score = 4
    elif days_since <= RFM_RECENCY_BINS[2]:
        r_score = 3
    elif days_since <= RFM_RECENCY_BINS[3]:
        r_score = 2
    else:
        r_score = 1

    # Score Frequency (1-5): more visits = higher score
    if visit_count >= RFM_FREQUENCY_BINS[4]:
        f_score = 5
    elif visit_count >= RFM_FREQUENCY_BINS[3]:
        f_score = 4
    elif visit_count >= RFM_FREQUENCY_BINS[2]:
        f_score = 3
    elif visit_count >= RFM_FREQUENCY_BINS[1]:
        f_score = 2
    else:
        f_score = 1

    # Score Monetary (1-5): more spending = higher score
    if total_spent >= RFM_MONETARY_BINS[4]:
        m_score = 5
    elif total_spent >= RFM_MONETARY_BINS[3]:
        m_score = 4
    elif total_spent >= RFM_MONETARY_BINS[2]:
        m_score = 3
    elif total_spent >= RFM_MONETARY_BINS[1]:
        m_score = 2
    else:
        m_score = 1

    # Determine segment
    segment_key = (r_score, f_score, m_score)
    segment = SEGMENT_MAP.get(segment_key)

    if segment is None:
        # Fallback: use average score to determine segment
        avg_score = (r_score + f_score + m_score) / 3
        if avg_score >= 4.0:
            segment = "champion"
        elif avg_score >= 3.3:
            segment = "loyal"
        elif avg_score >= 2.7:
            segment = "promising"
        elif avg_score >= 2.0:
            segment = "needs_attention"
        elif avg_score >= 1.3:
            segment = "at_risk"
        else:
            segment = "churned"

    return {
        "recency": r_score,
        "frequency": f_score,
        "monetary": m_score,
        "segment": segment,
        "days_since_last_visit": days_since,
        "visit_count": visit_count,
        "total_spent": round(total_spent, 2),
        "avg_transaction": round(avg_transaction, 2),
    }


def predict_churn_simple(customer: dict) -> float:
    """
    Heuristic churn probability estimator.

    Logic:
    - If days_since_last_visit > 2 * average visit frequency -> high risk
    - Weighted by: frequency trend (declining = higher risk),
      monetary trend, and recency

    Args:
        customer: Dict with 'transactions', 'rfm', 'days_since_last_visit'

    Returns:
        Float 0.0 to 1.0 representing churn probability.
    """
    days_since = customer.get("days_since_last_visit", 0)
    rfm = customer.get("rfm", {})
    txns = customer.get("transactions", [])

    if not txns or len(txns) < 2:
        # Not enough data — use recency only
        if days_since > 60:
            return 0.8
        elif days_since > 30:
            return 0.5
        return 0.2

    # Calculate average visit gap
    dates = []
    for txn in txns:
        txn_date = txn.get("date", "")
        if isinstance(txn_date, str):
            try:
                dates.append(date.fromisoformat(txn_date[:10]))
            except ValueError:
                continue
        elif isinstance(txn_date, (date, datetime)):
            dates.append(txn_date if isinstance(txn_date, date) else txn_date.date())

    dates.sort()
    if len(dates) < 2:
        return 0.5

    gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
    avg_gap = sum(gaps) / len(gaps) if gaps else 30

    # Core heuristic: recency vs expected frequency
    if avg_gap > 0:
        recency_ratio = days_since / avg_gap
    else:
        recency_ratio = 1.0

    # Frequency trend: compare recent half vs older half
    mid = len(gaps) // 2
    if mid > 0:
        recent_avg_gap = sum(gaps[mid:]) / len(gaps[mid:])
        older_avg_gap = sum(gaps[:mid]) / len(gaps[:mid])
        # If recent gaps are larger, visits are declining
        frequency_trend = recent_avg_gap / max(older_avg_gap, 1)
    else:
        frequency_trend = 1.0

    # Monetary trend: compare recent vs older transaction amounts
    amounts = [t.get("amount", 0) for t in txns]
    mid_a = len(amounts) // 2
    if mid_a > 0:
        recent_avg_amount = sum(amounts[:mid_a]) / mid_a  # txns sorted desc
        older_avg_amount = sum(amounts[mid_a:]) / len(amounts[mid_a:])
        monetary_trend = older_avg_amount / max(recent_avg_amount, 1)
    else:
        monetary_trend = 1.0

    # Weighted churn score
    # recency_ratio > 2 means they're overdue by 2x their normal pattern
    churn_score = 0.0
    churn_score += min(recency_ratio / 3, 1.0) * 0.50  # 50% weight on recency
    churn_score += min(frequency_trend / 2, 1.0) * 0.30  # 30% weight on frequency decline
    churn_score += min(monetary_trend / 2, 1.0) * 0.20  # 20% weight on monetary decline

    return max(0.0, min(1.0, churn_score))


def _churn_reason(rfm: dict, txns: list, days_since: int) -> str:
    """Determine the primary reason for churn risk."""
    if days_since > 60:
        return "long_absence"
    if rfm.get("frequency", 0) <= 2 and rfm.get("recency", 0) <= 2:
        return "declining_visits"
    if rfm.get("monetary", 0) <= 2:
        return "declining_spend"
    if days_since > 30:
        return "overdue_visit"
    return "pattern_change"


def _churn_reason_hindi(reason: str, name: str, days_since: int) -> str:
    """Generate Hindi explanation for churn reason."""
    reasons = {
        "long_absence": f"{name} ji {days_since} din se nahi aaye. Kahin competitor ke paas toh nahi gaye?",
        "declining_visits": f"{name} ji ki visits kam ho rahi hain. Unhe special offer bhejein.",
        "declining_spend": f"{name} ji ka spend kam ho raha hai. Kuch naya dikhayein unhe.",
        "overdue_visit": f"{name} ji ko aaye {days_since} din ho gaye. Yaad dilayein.",
        "pattern_change": f"{name} ji ka pattern badal raha hai. Dhyan dein.",
    }
    return reasons.get(reason, f"{name} ji par dhyan dein — churn risk hai.")


def _generate_customer_alerts(segment_counts: dict, customers: list) -> list[str]:
    """Generate Hindi alerts based on customer analysis."""
    alerts = []
    churned = segment_counts.get("churned", 0)
    at_risk = segment_counts.get("at_risk", 0)
    champions = segment_counts.get("champion", 0)

    if churned > 0:
        alerts.append(f"⚠️ {churned} customer churn ho gaye hain. Winback message bhejein!")
    if at_risk > 0:
        alerts.append(f"🔶 {at_risk} customer at-risk hain. Jaldi action lein.")
    if champions > 0:
        alerts.append(f"⭐ {champions} champion customers hain — inhe reward karein!")

    # Find the highest value at-risk customer
    at_risk_customers = [c for c in customers if c.get("segment") in ("at_risk", "churned")]
    if at_risk_customers:
        top_risk = max(at_risk_customers, key=lambda c: c.get("total_spent", 0))
        alerts.append(
            f"📌 Sabse important: {top_risk['customer_name']} (Rs {top_risk.get('total_spent', 0):,.0f} spent) "
            f"ko turant contact karein!"
        )

    return alerts
