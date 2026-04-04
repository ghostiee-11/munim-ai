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
    Compute PayScore from real transaction and udhari data.

    Five factors, each scored 0-20, for a total of 0-100:
    1. Consistency (Niyamitata) -- how regularly do transactions happen?
    2. Growth (Vikas)           -- is income trending up?
    3. Risk (Jokhim)            -- expense to income ratio (lower is better)
    4. Discipline (Anushasan)   -- udhari collection rate
    5. Depth (Gehraai)          -- customer diversity + payment mode variety
    """
    all_txns = db.select("transactions", filters={"merchant_id": merchant_id}) or []
    all_udharis = db.select("udhari", filters={"merchant_id": merchant_id}) or []

    if len(all_txns) < 5:
        return {
            "score": 30,
            "grade": "D",
            "factors": [
                {"name": "Consistency", "score": 6, "max": 20, "label": "Niyamitata", "note": "Insufficient data"},
                {"name": "Growth", "score": 6, "max": 20, "label": "Vikas", "note": "Insufficient data"},
                {"name": "Risk", "score": 6, "max": 20, "label": "Jokhim", "note": "Insufficient data"},
                {"name": "Discipline", "score": 6, "max": 20, "label": "Anushasan", "note": "Insufficient data"},
                {"name": "Depth", "score": 6, "max": 20, "label": "Gehraai", "note": "Insufficient data"},
            ],
        }

    # Factor 1: Consistency (0-20) -- how many unique transaction days in last 30?
    unique_days = len(set(
        str(t.get("created_at", t.get("recorded_at", "")))[:10] for t in all_txns
    ))
    consistency = min(20, round(unique_days * 20 / 30))  # 30 unique days = full score

    # Factor 2: Growth (0-20) -- compare last 15 days income vs previous 15 days
    now = datetime.now()
    mid = now - timedelta(days=15)
    recent_inc = sum(
        t.get("amount", 0) for t in all_txns
        if t.get("type") == "income"
        and str(t.get("created_at", t.get("recorded_at", ""))) >= mid.isoformat()
    )
    older_inc = sum(
        t.get("amount", 0) for t in all_txns
        if t.get("type") == "income"
        and str(t.get("created_at", t.get("recorded_at", ""))) < mid.isoformat()
    )
    growth_ratio = recent_inc / max(older_inc, 1)
    growth = min(20, round(growth_ratio * 10))

    # Factor 3: Risk (0-20) -- expense-to-income ratio (lower ratio = higher score)
    total_inc = sum(t.get("amount", 0) for t in all_txns if t.get("type") == "income")
    total_exp = sum(t.get("amount", 0) for t in all_txns if t.get("type") == "expense")
    exp_ratio = total_exp / max(total_inc, 1)
    risk = min(20, round((1 - min(exp_ratio, 1)) * 20))

    # Factor 4: Discipline (0-20) -- udhari settlement rate
    total_udhari = len(all_udharis)
    settled = len([u for u in all_udharis if u.get("status") == "settled"])
    discipline = min(20, round(settled / max(total_udhari, 1) * 20))

    # Factor 5: Depth (0-20) -- customer diversity + payment mode variety
    customers = set(t.get("customer_name") for t in all_txns if t.get("customer_name"))
    has_upi = any(t.get("payment_mode") == "upi" for t in all_txns)
    has_cash = any(t.get("payment_mode") == "cash" for t in all_txns)
    depth = min(20, len(customers) * 2 + (5 if has_upi else 0) + (5 if has_cash else 0))

    score = consistency + growth + risk + discipline + depth
    score = min(100, max(0, score))

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

    margin_pct = round((1 - exp_ratio) * 100, 1) if total_inc > 0 else 0

    factors = [
        {"name": "Consistency", "score": consistency, "max": 20, "label": "Niyamitata", "note": f"{unique_days} active days"},
        {"name": "Growth", "score": growth, "max": 20, "label": "Vikas", "note": f"{round(growth_ratio, 2)}x recent vs prior"},
        {"name": "Risk", "score": risk, "max": 20, "label": "Jokhim", "note": f"{margin_pct}% margin"},
        {"name": "Discipline", "score": discipline, "max": 20, "label": "Anushasan", "note": f"{settled}/{total_udhari} settled"},
        {"name": "Depth", "score": depth, "max": 20, "label": "Gehraai", "note": f"{len(customers)} customers"},
    ]

    return {"score": score, "grade": grade, "factors": factors}


@router.get("/{merchant_id}", response_model=PayScoreResponse)
async def get_payscore(merchant_id: str):
    """Get the current PayScore for a merchant."""
    try:
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
    except Exception as e:
        logger.exception(f"Error in payscore: {e}")
        return {"error": True, "message": "Kuch gadbad ho gayi. Kripya dobara try karein.", "detail": str(e)}


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
