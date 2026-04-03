"""
Customers router -- customer intelligence, at-risk detection, and winback.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from models import db
from models.schemas import AtRiskCustomer, CustomerResponse, EnrichedCustomerResponse, WinbackRequest

logger = logging.getLogger(__name__)
router = APIRouter()


def _assign_segment(total_spent: float, txn_count: int, days_since_last: int) -> str:
    """Assign RFM segment based on transaction data."""
    if days_since_last > 60:
        return "churned"
    if days_since_last > 30 and txn_count > 0:
        return "at_risk"
    if total_spent > 20000 and txn_count > 10:
        return "champion"
    if total_spent > 10000 and txn_count > 5:
        return "loyal"
    if total_spent > 5000 or txn_count > 3:
        return "promising"
    if txn_count > 0:
        return "promising"
    return "at_risk"


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

    # Build a lookup: customer_name -> aggregated stats
    txn_by_name: dict[str, dict] = {}
    for txn in (transactions or []):
        cname = (txn.get("customer_name") or "").strip()
        if not cname:
            continue
        if cname not in txn_by_name:
            txn_by_name[cname] = {"count": 0, "total": 0.0, "last_date": None}
        txn_by_name[cname]["count"] += 1
        txn_by_name[cname]["total"] += float(txn.get("amount") or txn.get("total_amount") or 0)
        txn_date = txn.get("date") or txn.get("created_at") or txn.get("transaction_date")
        if txn_date:
            txn_date_str = str(txn_date)[:10]
            existing = txn_by_name[cname]["last_date"]
            if not existing or txn_date_str > existing:
                txn_by_name[cname]["last_date"] = txn_date_str

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
            favorite_items=[],
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

    # Generate offer text if not provided
    offer_text = body.offer_text
    if not offer_text:
        offer_text = (
            f"Namaste {name} ji! Aapko bohot miss kar rahe hain. "
            f"Aapke liye special 10% discount ready hai. Jaldi aayein!"
        )

    # In production: call WhatsApp/SMS service
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
