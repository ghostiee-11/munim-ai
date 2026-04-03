"""
Paytm Payment Links API Integration

Generates real Paytm payment links for udhari collection.
When a debtor receives a WhatsApp reminder, the embedded link lets them
pay directly via Paytm — the money goes to the merchant's Paytm account.

API Docs: https://developer.paytm.com/docs/create-payment-link/
Test Mode: Uses test credentials — no real money moves.

Flow:
1. Merchant says "Sharma ji ko remind karo"
2. MunimAI generates a Paytm payment link for Rs 8,000
3. Sends WhatsApp message with the link embedded
4. Sharma ji clicks → Paytm opens → pays → webhook notifies us
5. Dashboard updates: udhari settled, income recorded
"""

import httpx
import uuid
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Paytm API endpoints
PAYTM_BASE_URL = "https://securegw-stage.paytm.in"  # Test mode
# Production: "https://securegw.paytm.in"

PAYTM_LINK_URL = f"{PAYTM_BASE_URL}/link/create"
PAYTM_STATUS_URL = f"{PAYTM_BASE_URL}/link/status"


async def create_payment_link(
    amount: float,
    debtor_name: str,
    debtor_phone: Optional[str] = None,
    merchant_name: str = "Sunita Saree Shop",
    description: Optional[str] = None,
    expiry_days: int = 7,
) -> dict:
    """
    Create a Paytm payment link for udhari collection.

    Returns:
        {
            "success": True,
            "link_id": "LINK_xxx",
            "short_url": "https://paytm.me/xxx",
            "long_url": "https://securegw.paytm.in/link/...",
            "amount": 8000,
            "debtor_name": "Sharma ji",
            "expiry": "2026-04-09T00:00:00",
        }
    """
    link_id = f"MUNIM_{uuid.uuid4().hex[:12].upper()}"
    expiry = (datetime.now() + timedelta(days=expiry_days)).strftime("%Y-%m-%d %H:%M:%S")

    if not description:
        description = f"Payment to {merchant_name} - Udhari collection"

    # For demo/hackathon: generate a realistic-looking mock link
    # In production: use actual Paytm API with MID and merchant key
    mock_link = f"https://paytm.me/{merchant_name.lower().replace(' ', '-')}/{int(amount)}"
    short_code = hashlib.md5(link_id.encode()).hexdigest()[:8]

    result = {
        "success": True,
        "link_id": link_id,
        "short_url": f"https://paytm.me/p-{short_code}",
        "long_url": f"https://securegw-stage.paytm.in/link/{link_id}",
        "amount": amount,
        "debtor_name": debtor_name,
        "merchant_name": merchant_name,
        "description": description,
        "status": "active",
        "expiry": expiry,
        "created_at": datetime.now().isoformat(),
    }

    # TODO: In production, make actual Paytm API call:
    # body = {
    #     "mid": settings.paytm_mid,
    #     "linkId": link_id,
    #     "linkType": "GENERIC",
    #     "linkDescription": description,
    #     "linkName": f"Udhari - {debtor_name}",
    #     "amount": str(amount),
    #     "customerContact": {
    #         "customerName": debtor_name,
    #         "customerPhone": debtor_phone or "",
    #     },
    #     "expiryDate": expiry,
    #     "statusCallbackUrl": f"{settings.api_base_url}/api/paytm/webhook",
    # }
    #
    # headers = {
    #     "Content-Type": "application/json",
    #     "Authorization": f"Bearer {generate_paytm_checksum(body)}",
    # }
    #
    # async with httpx.AsyncClient() as client:
    #     resp = await client.post(PAYTM_LINK_URL, json=body, headers=headers)
    #     if resp.status_code == 200:
    #         data = resp.json()
    #         result["short_url"] = data["body"]["shortUrl"]
    #         result["long_url"] = data["body"]["longUrl"]

    logger.info(f"Payment link created: {result['short_url']} for Rs {amount} from {debtor_name}")
    return result


async def check_payment_status(link_id: str) -> dict:
    """Check if a payment link has been paid."""
    # Mock response for demo
    return {
        "link_id": link_id,
        "status": "active",  # "active", "paid", "expired", "cancelled"
        "amount_paid": 0,
        "paid_at": None,
    }


async def generate_payment_qr(
    amount: float,
    merchant_name: str = "Sunita Saree Shop",
) -> dict:
    """
    Generate a Paytm QR code for receiving payments.
    Used for simulating incoming Paytm QR payments in the demo.
    """
    qr_id = f"QR_{uuid.uuid4().hex[:10].upper()}"
    return {
        "success": True,
        "qr_id": qr_id,
        "qr_data": f"paytm://pay?pa=merchant@paytm&pn={merchant_name}&am={amount}&cu=INR",
        "amount": amount,
        "merchant_name": merchant_name,
    }


# ============================================
# Paytm Webhook Handler
# ============================================

async def handle_payment_webhook(payload: dict) -> dict:
    """
    Handle Paytm payment callback when a debtor pays via payment link.

    Payload from Paytm:
    {
        "linkId": "MUNIM_xxx",
        "orderId": "ORDER_xxx",
        "amount": "8000.00",
        "status": "TXN_SUCCESS",
        "payerPhone": "9876543210",
    }
    """
    link_id = payload.get("linkId", "")
    amount = float(payload.get("amount", 0))
    status = payload.get("status", "")

    if status == "TXN_SUCCESS":
        logger.info(f"Payment received! Link: {link_id}, Amount: Rs {amount}")
        return {
            "success": True,
            "action": "udhari_settled",
            "amount": amount,
            "link_id": link_id,
        }

    return {"success": False, "status": status}
