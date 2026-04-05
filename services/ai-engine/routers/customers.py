"""
Customers router -- customer intelligence, at-risk detection, and winback.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from models import db
from models.schemas import AtRiskCustomer, CustomerResponse, EnrichedCustomerResponse, WinbackRequest

logger = logging.getLogger(__name__)
router = APIRouter()


def _assign_segment(total_spent: float, txn_count: int, days_since_last: int) -> str:
    """
    Assign RFM (Recency-Frequency-Monetary) segment using scored dimensions.

    Each dimension is scored 1-5, then averaged to pick a segment.
    """
    # Recency score (1-5): fewer days since last visit = higher
    r = (
        5 if days_since_last <= 7
        else 4 if days_since_last <= 14
        else 3 if days_since_last <= 30
        else 2 if days_since_last <= 60
        else 1
    )

    # Frequency score (1-5): more transactions = higher
    f = (
        5 if txn_count >= 20
        else 4 if txn_count >= 10
        else 3 if txn_count >= 5
        else 2 if txn_count >= 2
        else 1
    )

    # Monetary score (1-5): more spent = higher
    m = (
        5 if total_spent >= 30000
        else 4 if total_spent >= 15000
        else 3 if total_spent >= 5000
        else 2 if total_spent >= 1000
        else 1
    )

    avg = (r + f + m) / 3
    if avg >= 4:
        return "champion"
    if avg >= 3.3:
        return "loyal"
    if avg >= 2.5:
        return "promising"
    if r <= 2 and f >= 3:
        return "at_risk"
    if r <= 2:
        return "churned"
    return "promising"


def _churn_probability(days_since_last: int) -> float:
    """Estimate churn probability based on days since last visit."""
    if days_since_last <= 7:
        return round(0.05 + (days_since_last / 7) * 0.05, 2)
    if days_since_last <= 14:
        return round(0.10 + (days_since_last - 7) / 7 * 0.10, 2)
    if days_since_last <= 30:
        return round(0.20 + (days_since_last - 14) / 16 * 0.20, 2)
    if days_since_last <= 60:
        return round(0.40 + (days_since_last - 30) / 30 * 0.30, 2)
    return min(round(0.70 + (days_since_last - 60) / 120 * 0.29, 2), 0.99)


# ---------------------------------------------------------------------------
# New endpoints with static paths -- must be registered BEFORE /{merchant_id}
# to avoid FastAPI treating the path segment as a merchant_id parameter.
# ---------------------------------------------------------------------------


@router.get("/predictions/{merchant_id}")
async def predict_customer_visits(merchant_id: str):
    """Predict which customers are likely to visit in next 3 days based on patterns."""
    customers = db.get_merchant_customers(merchant_id)

    try:
        transactions = db.select("transactions", filters={"merchant_id": merchant_id, "type": "income"}, limit=5000)
    except Exception:
        transactions = []

    # Group transactions by customer with dates
    from collections import defaultdict
    customer_visits: dict[str, list[str]] = defaultdict(list)
    customer_items: dict[str, list[str]] = defaultdict(list)

    for t in transactions:
        name = (t.get("customer_name") or "").strip()
        if not name:
            continue
        dt = str(t.get("created_at", ""))[:10]
        if dt:
            customer_visits[name].append(dt)
        cat = t.get("category", "")
        if cat:
            customer_items[name].append(cat)

    predictions = []
    today = date.today()

    for c in customers:
        name = c.get("name", "")
        visits = sorted(set(customer_visits.get(name, [])))
        if len(visits) < 2:
            continue

        # Calculate average gap between visits
        gaps = []
        for i in range(1, len(visits)):
            try:
                d1 = date.fromisoformat(visits[i-1])
                d2 = date.fromisoformat(visits[i])
                gaps.append((d2 - d1).days)
            except Exception:
                continue

        if not gaps:
            continue

        avg_gap = sum(gaps) / len(gaps)
        last_visit = visits[-1]
        try:
            last_date = date.fromisoformat(last_visit)
            days_since = (today - last_date).days
            expected_next = last_date + timedelta(days=int(avg_gap))
            days_until = (expected_next - today).days
        except Exception:
            continue

        # Predict if likely to visit in next 3 days
        if -2 <= days_until <= 3:
            # Get favorite items
            items = customer_items.get(name, [])
            top_items = [item for item, _ in Counter(items).most_common(2)]

            predictions.append({
                "name": name,
                "phone": c.get("phone", ""),
                "avg_visit_gap_days": round(avg_gap, 1),
                "last_visit": last_visit,
                "days_since_last": days_since,
                "predicted_next": expected_next.isoformat(),
                "days_until": days_until,
                "confidence": round(min(0.95, len(visits) / 10), 2),
                "favorite_items": top_items,
                "total_visits": len(visits),
                "alert_hi": f"{name} ji {'aaj' if days_until == 0 else f'{abs(days_until)} din mein'} aa sakte hain. Favorite: {', '.join(top_items) if top_items else 'General'}",
            })

    # Sort by days_until (soonest first)
    predictions.sort(key=lambda p: p["days_until"])

    return {
        "merchant_id": merchant_id,
        "predictions": predictions[:10],
        "count": len(predictions),
        "date": today.isoformat(),
    }


@router.get("/{merchant_id}/analysis")
async def get_customer_analysis(merchant_id: str):
    """Full RFM analysis with Hindi alerts via customer_agent."""
    from services.agents.customer_agent import analyze_customers
    customers = db.get_merchant_customers(merchant_id)
    transactions = db.select("transactions", filters={"merchant_id": merchant_id}, limit=10000)
    result = await analyze_customers(merchant_id, customers, transactions or [])
    return result


@router.get("/{merchant_id}/churn")
async def get_churn_detection(merchant_id: str):
    """ML-style churn detection with Hindi reasons."""
    from services.agents.customer_agent import detect_churn
    churn_list = await detect_churn(merchant_id)
    return {"merchant_id": merchant_id, "at_risk": churn_list, "count": len(churn_list)}


@router.get("/{merchant_id}/winback-stats")
async def get_winback_stats(merchant_id: str):
    """Real winback campaign analytics from customer_outreach table."""
    try:
        outreach = db.select("customer_outreach", filters={"merchant_id": merchant_id})
    except Exception:
        outreach = []
    sent = len(outreach)
    # Count returned = customers who had outreach AND later had a transaction
    returned = len([o for o in outreach if o.get("response") == "returned"])
    revenue = sum(float(o.get("revenue_recovered", 0) or 0) for o in outreach)
    success_rate = round(returned / max(sent, 1) * 100)
    return {"campaigns_sent": sent, "customers_returned": returned, "revenue_recovered": revenue, "success_rate": success_rate}


# ---------------------------------------------------------------------------
# Existing endpoints
# ---------------------------------------------------------------------------


@router.get("/{merchant_id}", response_model=list[CustomerResponse])
async def list_customers(
    merchant_id: str,
    limit: int = Query(200, ge=1, le=1000),
):
    """List all customers for a merchant, ordered by last transaction date."""
    customers = db.get_merchant_customers(merchant_id, limit=limit)
    return customers


@router.get("/{merchant_id}/enriched", response_model=list[EnrichedCustomerResponse])
async def list_enriched_customers(
    merchant_id: str,
    limit: int = Query(200, ge=1, le=1000),
):
    """
    Return enriched customer data with computed segments, CLV, and churn probability.
    Joins customer records with actual transaction data.
    """
    customers = db.get_merchant_customers(merchant_id, limit=limit)
    today = date.today()
    enriched = []

    # Try to fetch all transactions for this merchant to enrich customer data
    try:
        transactions = db.select(
            "transactions",
            filters={"merchant_id": merchant_id},
            limit=10000,
        )
    except Exception:
        transactions = []

    # Build a lookup: customer_name -> aggregated stats + categories
    txn_by_name: dict[str, dict] = {}
    categories_by_name: dict[str, list[str]] = {}
    for txn in (transactions or []):
        cname = (txn.get("customer_name") or "").strip()
        if not cname:
            continue
        if cname not in txn_by_name:
            txn_by_name[cname] = {"count": 0, "total": 0.0, "last_date": None}
            categories_by_name[cname] = []
        txn_by_name[cname]["count"] += 1
        txn_by_name[cname]["total"] += float(txn.get("amount") or txn.get("total_amount") or 0)
        txn_date = txn.get("date") or txn.get("created_at") or txn.get("transaction_date")
        if txn_date:
            txn_date_str = str(txn_date)[:10]
            existing = txn_by_name[cname]["last_date"]
            if not existing or txn_date_str > existing:
                txn_by_name[cname]["last_date"] = txn_date_str
        # Track category for favorite items
        cat = (txn.get("category") or "").strip()
        if cat:
            categories_by_name[cname].append(cat)

    # Compute top 2-3 most common categories per customer
    favorite_items_by_name: dict[str, list[str]] = {}
    for cname, cats in categories_by_name.items():
        if cats:
            counter = Counter(cats)
            favorite_items_by_name[cname] = [item for item, _ in counter.most_common(3)]
        else:
            favorite_items_by_name[cname] = []

    for c in customers:
        cid = c.get("id", "")
        name = c.get("name", "Unknown")
        phone = c.get("phone")
        merchant = c.get("merchant_id", merchant_id)

        # Use transaction-level stats if available, else fall back to customer record
        txn_stats = txn_by_name.get(name, {})
        txn_count = txn_stats.get("count", 0) or c.get("total_transactions", 0) or 0
        total_spent = txn_stats.get("total", 0.0) or float(c.get("total_amount", 0) or 0)

        last_visit_str = (
            txn_stats.get("last_date")
            or c.get("last_transaction_date")
            or c.get("last_visit")
        )

        # Calculate days since last visit
        days_since = 0
        if last_visit_str:
            try:
                last_dt = date.fromisoformat(str(last_visit_str)[:10])
                days_since = (today - last_dt).days
            except (ValueError, TypeError):
                days_since = 0

        # Segment
        segment = _assign_segment(total_spent, txn_count, days_since)

        # Avg order value
        avg_order = round(total_spent / max(txn_count, 1), 2)

        # CLV: total_spent / months_active * 12, safe division
        months_active = max(1, round(txn_count / 3))
        clv = round((total_spent / max(months_active, 1)) * 12)

        # Churn probability
        churn_prob = _churn_probability(days_since)

        enriched.append(EnrichedCustomerResponse(
            id=cid,
            merchant_id=merchant,
            name=name,
            phone=phone,
            segment=segment,
            total_spent=total_spent,
            transaction_count=txn_count,
            last_visit=last_visit_str or today.isoformat(),
            avg_order_value=avg_order,
            clv=clv,
            churn_probability=churn_prob,
            days_since_last_visit=days_since,
            visit_count=txn_count,
            favorite_items=favorite_items_by_name.get(name, []),
        ))

    return enriched


@router.get("/{merchant_id}/at-risk", response_model=list[AtRiskCustomer])
async def get_at_risk_customers(merchant_id: str):
    """
    Identify customers who are likely to churn.

    Uses recency, frequency, and monetary (RFM) signals to detect
    customers whose visit patterns have declined.
    """
    customers = db.get_merchant_customers(merchant_id)
    today = date.today()
    at_risk: list[AtRiskCustomer] = []

    for c in customers:
        last_date_str = c.get("last_transaction_date")
        if not last_date_str:
            continue

        try:
            last_date = date.fromisoformat(last_date_str[:10])
        except (ValueError, TypeError):
            continue

        days_since = (today - last_date).days
        total_amount = c.get("total_amount", 0)
        total_txns = c.get("total_transactions", 0)

        # Estimate average monthly spend (rough)
        avg_monthly = total_amount / max(total_txns, 1) * 4  # assume ~4 visits/month

        # Risk classification
        if days_since > 60:
            risk_level = "high"
            action = "Send a personal WhatsApp message with a special offer."
        elif days_since > 30:
            risk_level = "medium"
            action = "Send a reminder message or a small discount coupon."
        elif days_since > 14 and avg_monthly > 1000:
            risk_level = "low"
            action = "Keep monitoring. Consider a loyalty reward."
        else:
            continue  # Not at risk

        at_risk.append(AtRiskCustomer(
            id=c["id"],
            name=c.get("name", "Unknown"),
            phone=c.get("phone"),
            days_since_last_visit=days_since,
            avg_monthly_spend=round(avg_monthly, 2),
            risk_level=risk_level,
            suggested_action=action,
        ))

    # Sort by risk: high first
    risk_order = {"high": 0, "medium": 1, "low": 2}
    at_risk.sort(key=lambda x: (risk_order.get(x.risk_level, 3), -x.days_since_last_visit))

    # For top 5 at-risk customers, generate personalized Hindi action suggestions via Groq
    try:
        from groq import AsyncGroq
        from config import get_settings
        settings = get_settings()
        if settings.groq_api_key and at_risk:
            client = AsyncGroq(api_key=settings.groq_api_key)
            for entry in at_risk[:5]:
                try:
                    prompt = (
                        f"Customer: {entry.name}, {entry.days_since_last_visit} din se nahi aaye, "
                        f"avg monthly spend Rs {entry.avg_monthly_spend:.0f}, risk level: {entry.risk_level}. "
                        f"Ek chhota Hindi mein action suggestion do shopkeeper ke liye (1 line, under 120 chars). "
                        f"Sirf Hindi mein likho."
                    )
                    resp = await client.chat.completions.create(
                        model=settings.groq_model,
                        messages=[
                            {"role": "system", "content": "You suggest winback actions in Hindi for Indian shopkeepers. Be concise."},
                            {"role": "user", "content": prompt},
                        ],
                        temperature=0.7,
                        max_tokens=100,
                    )
                    hindi_action = resp.choices[0].message.content.strip()
                    if hindi_action:
                        entry.suggested_action = hindi_action
                except Exception:
                    pass  # keep existing English action
    except Exception:
        pass  # Groq unavailable — keep existing English actions

    return at_risk


@router.post("/{merchant_id}/winback/{customer_id}")
async def winback_customer(
    merchant_id: str,
    customer_id: str,
    body: WinbackRequest,
):
    """
    Trigger a winback action for a specific customer -- sends a
    personalized message via WhatsApp or SMS.
    """
    customer = db.select("customers", filters={"id": customer_id, "merchant_id": merchant_id}, single=True)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    phone = customer.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Customer phone number not available.")

    name = customer.get("name", "Customer")

    # Generate offer text: try LLM-generated Hindi message first, then fall back to hardcoded
    offer_text = body.offer_text
    if not offer_text:
        try:
            from services.agents.customer_agent import generate_winback
            winback_result = await generate_winback(merchant_id, name)
            offer_text = winback_result.get("message", "")
        except Exception as e:
            logger.warning("LLM winback generation failed, using fallback: %s", e)
            offer_text = ""

    if not offer_text:
        offer_text = (
            f"Namaste {name} ji! Aapko bohot miss kar rahe hain. "
            f"Aapke liye special 10% discount ready hai. Jaldi aayein!"
        )

    # Send via WhatsApp
    try:
        from services.twilio_service import send_whatsapp
        await send_whatsapp(to=phone, body=offer_text)
        logger.info("WhatsApp sent to %s for winback %s", phone, customer_id)
    except Exception as e:
        logger.error("WhatsApp send failed for %s: %s", customer_id, e)

    logger.info("Winback %s via %s to %s: %s", customer_id, body.channel, phone, offer_text)

    # Record the outreach
    db.insert("customer_outreach", {
        "merchant_id": merchant_id,
        "customer_id": customer_id,
        "channel": body.channel,
        "message": offer_text,
        "status": "sent",
    })

    return {
        "sent": True,
        "customer_id": customer_id,
        "customer_name": name,
        "channel": body.channel,
        "message": offer_text,
    }
