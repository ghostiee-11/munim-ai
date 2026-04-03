"""
Transactions router -- CRUD for income/expense records.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models import db
from models.schemas import (
    CategorySummary,
    TransactionCreate,
    TransactionListResponse,
    TransactionResponse,
)
from services import realtime

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=TransactionResponse, status_code=201)
async def create_transaction(body: TransactionCreate):
    """Record a new income or expense transaction."""
    txn = db.insert("transactions", body.model_dump())
    logger.info("Transaction created: %s", txn.get("id"))

    await realtime.emit_transaction_created(body.merchant_id, txn)
    await realtime.emit_dashboard_refresh(body.merchant_id)

    return txn


@router.get("/{merchant_id}", response_model=TransactionListResponse)
async def list_transactions(
    merchant_id: str,
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    category: Optional[str] = Query(None),
    txn_type: Optional[str] = Query(None, alias="type", description="income or expense"),
    limit: int = Query(100, ge=1, le=500),
):
    """
    List transactions for a merchant with optional filters.

    Supports date range, category, and type filtering.
    """
    txns = db.get_merchant_transactions(
        merchant_id,
        start_date=start_date,
        end_date=end_date,
        category=category,
        txn_type=txn_type,
        limit=limit,
    )

    filters_applied = {}
    if start_date:
        filters_applied["start_date"] = start_date
    if end_date:
        filters_applied["end_date"] = end_date
    if category:
        filters_applied["category"] = category
    if txn_type:
        filters_applied["type"] = txn_type

    return TransactionListResponse(
        transactions=txns,
        total=len(txns),
        filters_applied=filters_applied,
    )


@router.get("/{merchant_id}/categories", response_model=list[CategorySummary])
async def get_categories(
    merchant_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """
    Category-wise breakdown of transactions for the given merchant and
    optional date range.
    """
    txns = db.get_merchant_transactions(
        merchant_id,
        start_date=start_date,
        end_date=end_date,
        limit=1000,
    )

    if not txns:
        return []

    # Aggregate by category
    cat_map: dict[str, dict] = {}
    grand_total = 0.0

    for t in txns:
        cat = t.get("category", "Uncategorized")
        amt = t.get("amount", 0)
        grand_total += amt
        if cat not in cat_map:
            cat_map[cat] = {"total": 0.0, "count": 0}
        cat_map[cat]["total"] += amt
        cat_map[cat]["count"] += 1

    result = []
    for cat, vals in sorted(cat_map.items(), key=lambda x: x[1]["total"], reverse=True):
        pct = (vals["total"] / grand_total * 100) if grand_total > 0 else 0
        result.append(CategorySummary(
            category=cat,
            total=round(vals["total"], 2),
            count=vals["count"],
            percentage=round(pct, 1),
        ))

    return result


@router.delete("/{transaction_id}", status_code=200)
async def delete_transaction(transaction_id: str):
    """Delete a transaction by ID."""
    # Fetch first to get merchant_id for the real-time event
    txn = db.select("transactions", filters={"id": transaction_id}, single=True)
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    db.delete("transactions", transaction_id)
    logger.info("Transaction deleted: %s", transaction_id)

    await realtime.emit_transaction_deleted(txn["merchant_id"], transaction_id)
    await realtime.emit_dashboard_refresh(txn["merchant_id"])

    return {"deleted": True, "id": transaction_id}
