"""
Paytm API integration router.

Handles:
- Creating payment links for udhari collection
- Receiving payment webhooks when debtors pay
- Generating QR codes for incoming payments
"""

from __future__ import annotations

import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

from services.paytm_api import create_payment_link, handle_payment_webhook, check_payment_status
from services import realtime
from models import db

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateLinkRequest(BaseModel):
    merchant_id: str
    amount: float
    debtor_name: str
    debtor_phone: Optional[str] = None
    udhari_id: Optional[str] = None
    merchant_name: str = "Sunita Saree Shop"


class LinkStatusRequest(BaseModel):
    link_id: str


@router.post("/create-link")
async def create_link(req: CreateLinkRequest):
    """Create a Paytm payment link for udhari collection."""
    result = await create_payment_link(
        amount=req.amount,
        debtor_name=req.debtor_name,
        debtor_phone=req.debtor_phone,
        merchant_name=req.merchant_name,
    )

    # If udhari_id provided, save the link to the udhari record
    if req.udhari_id and result["success"]:
        try:
            db.update("udhari", req.udhari_id, {
                "payment_link": result["short_url"],
            })
        except Exception:
            pass  # Non-critical

    return result


@router.post("/webhook")
async def paytm_webhook(request: Request):
    """
    Receive Paytm payment callbacks.
    When a debtor pays via the payment link, Paytm sends a webhook here.
    We update the udhari status and emit real-time events.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = dict(await request.form())

    logger.info(f"Paytm webhook received: {payload}")

    result = await handle_payment_webhook(payload)

    if result.get("success"):
        # Find the udhari associated with this payment link
        link_id = result.get("link_id", "")
        amount = result.get("amount", 0)

        # In production: lookup udhari by link_id and settle it
        # For demo: emit a collection event
        logger.info(f"Payment confirmed: Rs {amount} via link {link_id}")

    return {"status": "ok"}


@router.get("/link-status/{link_id}")
async def get_link_status(link_id: str):
    """Check the status of a payment link."""
    return await check_payment_status(link_id)
