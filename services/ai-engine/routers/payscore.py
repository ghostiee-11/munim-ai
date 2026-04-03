"""
PayScore router -- merchant creditworthiness score (0-100).

PayScore is MunimAI's proprietary scoring system that evaluates a merchant's
financial health based on transaction regularity, profit margins, udhari
management, and growth trajectory.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException

from models import db
from models.schemas import PayScoreHistory, PayScoreResponse
from services import realtime

logger = logging.getLogger(__name__)
router = APIRouter()


def _calculate_score(merchant_id: str) -> dict:
    """
    Compute PayScore from transaction and udhari data.

    Factors (each 0-200, total 0-1000):
    1. Revenue consistency   -- regular daily income
    2. Profit margin         -- income vs expense ratio
    3. Udhari management     -- low overdue, fast collection
    4. Growth trajectory     -- month-over-month improvement
    5. Business activity     -- transaction frequency
    """
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    three_months_ago = (today - timedelta(days=90)).isoformat()

    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", three_months_ago),
    )
    udharis = db.select("udhari", filters={"merchant_id": merchant_id})

    if not txns:
        return {"score": 30, "grade": "C", "factors": [
            {"name": "Insufficient Data", "score": 30, "max": 100, "note": "More data needed"},
        ]}

    income = sum(t["amount"] for t in txns if t.get("type") == "income")
    expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
    total_days = max((today - date.fromisoformat(three_months_ago)).days, 1)
    active_days = len(set(str(t.get("recorded_at", ""))[:10] for t in txns))

    # Factor 1: Revenue consistency
    consistency_ratio = active_days / total_days
    f1 = min(200, int(consistency_ratio * 250))

    # Factor 2: Profit margin
    margin = (income - expense) / income if income > 0 else 0
    f2 = min(200, max(0, int(margin * 400)))

    # Factor 3: Udhari management
    total_udhari = sum(u.get("amount", 0) for u in udharis)
    overdue = sum(1 for u in udharis if u.get("status") == "overdue")
    settled = sum(1 for u in udharis if u.get("status") == "settled")
    udhari_ratio = settled / max(len(udharis), 1)
    overdue_penalty = min(100, overdue * 20)
    f3 = min(200, max(0, int(udhari_ratio * 200) - overdue_penalty))

    # Factor 4: Growth (compare recent month to prior)
    month_txns = [t for t in txns if str(t.get("recorded_at", ""))[:10] >= month_start]
    prior_txns = [t for t in txns if str(t.get("recorded_at", ""))[:10] < month_start]
    m_income = sum(t["amount"] for t in month_txns if t.get("type") == "income")
    p_income = sum(t["amount"] for t in prior_txns if t.get("type") == "income")
    if p_income > 0:
        growth = (m_income - p_income / 2) / (p_income / 2)  # normalized to ~1 month
        f4 = min(200, max(0, int((growth + 0.5) * 133)))
    else:
        f4 = 100  # neutral

    # Factor 5: Activity level
    txn_freq = len(txns) / total_days
    f5 = min(200, int(txn_freq * 100))

    raw_score = f1 + f2 + f3 + f4 + f5
    raw_score = max(0, min(1000, raw_score))

    # Normalize to 0-100 for frontend
    score = min(100, round(raw_score / 10))

    # Grade
    if score >= 90:
        grade = "A+"
    elif score >= 80:
        grade = "A"
    elif score >= 70:
        grade = "B+"
    elif score >= 60:
        grade = "B"
    elif score >= 40:
        grade = "C"
    else:
        grade = "D"

    factors = [
        {"name": "Revenue Consistency", "score": min(20, round(f1 / 10)), "max": 20, "note": f"{active_days}/{total_days} active days"},
        {"name": "Profit Margin", "score": min(20, round(f2 / 10)), "max": 20, "note": f"{round(margin * 100, 1)}% margin"},
        {"name": "Udhari Management", "score": min(20, round(f3 / 10)), "max": 20, "note": f"{overdue} overdue, {settled} settled"},
        {"name": "Growth Trajectory", "score": min(20, round(f4 / 10)), "max": 20, "note": "Month-over-month"},
        {"name": "Business Activity", "score": min(20, round(f5 / 10)), "max": 20, "note": f"{round(txn_freq, 1)} txns/day"},
    ]

    return {"score": score, "grade": grade, "factors": factors}


@router.get("/{merchant_id}", response_model=PayScoreResponse)
async def get_payscore(merchant_id: str):
    """Get the current PayScore for a merchant."""
    # Try cached score first
    cached = db.select("payscores", filters={"merchant_id": merchant_id}, single=True)
    if cached:
        return PayScoreResponse(
            merchant_id=merchant_id,
            score=cached["score"],
            grade=cached.get("grade", "C"),
            factors=cached.get("factors", []),
            last_updated=cached.get("updated_at"),
        )

    # Calculate fresh
    result = _calculate_score(merchant_id)
    return PayScoreResponse(
        merchant_id=merchant_id,
        score=result["score"],
        grade=result["grade"],
        factors=result["factors"],
    )


@router.get("/{merchant_id}/history", response_model=PayScoreHistory)
async def get_payscore_history(merchant_id: str):
    """Get historical PayScore entries for trend analysis."""
    entries = db.select(
        "payscore_history",
        filters={"merchant_id": merchant_id},
        order_by="calculated_at",
        order_desc=False,
        limit=90,
    )

    if not entries:
        return PayScoreHistory(entries=[], trend="stable")

    # Determine trend from last 5 entries
    recent = entries[-5:] if len(entries) >= 5 else entries
    if len(recent) >= 2:
        first_score = recent[0].get("score", 500)
        last_score = recent[-1].get("score", 500)
        diff = last_score - first_score
        if diff > 30:
            trend = "improving"
        elif diff < -30:
            trend = "declining"
        else:
            trend = "stable"
    else:
        trend = "stable"

    return PayScoreHistory(entries=entries, trend=trend)


@router.post("/{merchant_id}/recalculate", response_model=PayScoreResponse)
async def recalculate_payscore(merchant_id: str):
    """Force recalculation of PayScore and persist the result."""
    result = _calculate_score(merchant_id)

    # Persist
    db.upsert("payscores", {
        "merchant_id": merchant_id,
        "score": result["score"],
        "grade": result["grade"],
        "factors": result["factors"],
        "updated_at": datetime.now().isoformat(),
    })

    # Also store in history
    db.insert("payscore_history", {
        "merchant_id": merchant_id,
        "score": result["score"],
        "grade": result["grade"],
        "calculated_at": datetime.now().isoformat(),
    })

    payscore_resp = PayScoreResponse(
        merchant_id=merchant_id,
        score=result["score"],
        grade=result["grade"],
        factors=result["factors"],
        last_updated=date.today().isoformat(),
    )

    await realtime.emit_payscore_updated(merchant_id, payscore_resp.model_dump())

    return payscore_resp
