"""
Invoice router -- create, list, pay, and share invoices.

Auto-generates invoice numbers, classifies items via GST agent,
calculates CGST/SGST, creates income transactions, and deducts inventory.
"""

from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from config import get_settings
from models import db
from services import realtime

logger = logging.getLogger(__name__)
router = APIRouter()

settings = get_settings()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class InvoiceItem(BaseModel):
    name: str
    qty: float = 1
    rate: float
    description: str = ""


class CreateInvoiceRequest(BaseModel):
    merchant_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    items: list[InvoiceItem]
    notes: Optional[str] = None
    payment_mode: str = "cash"
    discount_pct: float = 0  # Discount percentage (0-100)


class PayInvoiceRequest(BaseModel):
    amount_paid: Optional[float] = None


class ShareInvoiceRequest(BaseModel):
    phone: Optional[str] = None  # If not provided, uses customer_phone from invoice


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _generate_invoice_number(merchant_id: str) -> str:
    """Generate INV-YYYY-MM-NNN based on existing count for this month."""
    now = datetime.now()
    prefix = f"INV-{now.year}-{now.month:02d}"
    try:
        existing = db.select(
            "invoices",
            filters={"merchant_id": merchant_id},
            columns="invoice_number",
        )
        month_invoices = [
            inv for inv in existing
            if inv.get("invoice_number", "").startswith(prefix)
        ]
        seq = len(month_invoices) + 1
    except Exception:
        seq = 1
    return f"{prefix}-{seq:03d}"


async def _classify_item(item_name: str, rate: float) -> dict:
    """Classify a single item via gst_agent to get HSN + GST rate."""
    try:
        from services.agents.gst_agent import auto_classify_transaction
        txn = {
            "category": item_name,
            "description": item_name,
            "amount": rate,
            "type": "income",
        }
        result = await auto_classify_transaction(txn)
        return {
            "hsn_code": result.get("hsn_code", "9999"),
            "gst_rate": result.get("gst_rate", 18),
        }
    except Exception:
        logger.warning("GST classification failed for '%s', defaulting 18%%", item_name)
        return {"hsn_code": "9999", "gst_rate": 18}


def _deduct_inventory(merchant_id: str, item_name: str, qty: float):
    """If an inventory item matches, deduct stock."""
    try:
        from models.db import get_client as _gc
        supa = _gc()
        matches = (
            supa.table("inventory")
            .select("id, current_qty, item_name")
            .eq("merchant_id", merchant_id)
            .ilike("item_name", f"%{item_name}%")
            .limit(1)
            .execute()
        ).data or []
        if matches:
            item = matches[0]
            new_qty = max(0, (item.get("current_qty", 0) or 0) - qty)
            supa.table("inventory").update({"current_qty": new_qty}).eq("id", item["id"]).execute()
            logger.info("Inventory deducted: %s qty %s -> %s", item["item_name"], item["current_qty"], new_qty)
    except Exception:
        logger.warning("Inventory deduction failed for '%s'", item_name)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/")
async def create_invoice(body: CreateInvoiceRequest):
    """
    Create a new invoice.
    - Auto-generate invoice_number (INV-YYYY-MM-NNN)
    - Classify each item for HSN + GST
    - Calculate CGST / SGST per item
    - Auto-create income transaction
    - Auto-deduct inventory if matched
    """
    invoice_number = await _generate_invoice_number(body.merchant_id)

    line_items = []
    subtotal = 0.0
    total_gst = 0.0
    total_cgst = 0.0
    total_sgst = 0.0

    for item in body.items:
        classification = await _classify_item(item.name, item.rate)
        hsn_code = classification["hsn_code"]
        gst_rate = classification["gst_rate"]

        item_total = item.qty * item.rate
        gst_amount = round(item_total * gst_rate / 100, 2)
        cgst = round(gst_amount / 2, 2)
        sgst = round(gst_amount / 2, 2)

        line_items.append({
            "name": item.name,
            "description": item.description,
            "qty": item.qty,
            "rate": item.rate,
            "hsn_code": hsn_code,
            "gst_rate": gst_rate,
            "item_total": item_total,
            "gst_amount": gst_amount,
            "cgst": cgst,
            "sgst": sgst,
            "total_with_gst": round(item_total + gst_amount, 2),
        })

        subtotal += item_total
        total_gst += gst_amount
        total_cgst += cgst
        total_sgst += sgst

        # Deduct inventory
        _deduct_inventory(body.merchant_id, item.name, item.qty)

    # Apply discount
    discount_pct = max(0, min(100, body.discount_pct))
    discount_amount = round(subtotal * discount_pct / 100, 2)
    discounted_subtotal = round(subtotal - discount_amount, 2)

    # Recalculate GST on discounted subtotal
    if discount_pct > 0:
        total_gst = 0.0
        total_cgst = 0.0
        total_sgst = 0.0
        for item in line_items:
            item_discounted = round(item["item_total"] * (1 - discount_pct / 100), 2)
            gst_amount = round(item_discounted * item["gst_rate"] / 100, 2)
            cgst = round(gst_amount / 2, 2)
            sgst = round(gst_amount / 2, 2)
            item["discount_pct"] = discount_pct
            item["discounted_total"] = item_discounted
            item["gst_amount"] = gst_amount
            item["cgst"] = cgst
            item["sgst"] = sgst
            item["total_with_gst"] = round(item_discounted + gst_amount, 2)
            total_gst += gst_amount
            total_cgst += cgst
            total_sgst += sgst

    total = round(discounted_subtotal + total_gst, 2)

    # Store invoice in Supabase
    import json
    invoice_data = {
        "merchant_id": body.merchant_id,
        "invoice_number": invoice_number,
        "customer_name": body.customer_name,
        "customer_phone": body.customer_phone,
        "items": json.dumps(line_items),
        "subtotal": round(subtotal, 2),
        "discount_pct": discount_pct,
        "discount_amount": discount_amount,
        "gst_total": round(total_gst, 2),
        "cgst": round(total_cgst, 2),
        "sgst": round(total_sgst, 2),
        "total": total,
        "amount_paid": 0,
        "status": "unpaid",
        "payment_mode": body.payment_mode,
        "notes": body.notes,
            }

    invoice = db.insert("invoices", invoice_data)

    # Auto-create income transaction
    try:
        db.insert("transactions", {
            "merchant_id": body.merchant_id,
            "amount": total,
            "type": "income",
            "category": "Invoice",
            "customer_name": body.customer_name,
            "payment_mode": body.payment_mode,
            "description": f"Invoice {invoice_number} - {body.customer_name}",
            "recorded_at": datetime.now().isoformat(),
            "source": "invoice",
        })
    except Exception:
        logger.warning("Failed to create income transaction for invoice %s", invoice_number)

    await realtime.emit_dashboard_refresh(body.merchant_id)

    # Parse items back for response
    invoice["items_parsed"] = line_items
    return {"success": True, "invoice": invoice}


@router.get("/{merchant_id}")
async def list_invoices(
    merchant_id: str,
    status: Optional[str] = Query(None, description="unpaid / paid / partial"),
    limit: int = Query(50, ge=1, le=200),
):
    """List invoices for a merchant."""
    import json
    filters = {"merchant_id": merchant_id}
    if status:
        filters["status"] = status

    invoices = db.select(
        "invoices",
        filters=filters,
        order_by="created_at",
        order_desc=True,
        limit=limit,
    )

    # Parse items JSON for each invoice
    for inv in invoices:
        try:
            inv["items_parsed"] = json.loads(inv.get("items", "[]")) if isinstance(inv.get("items"), str) else inv.get("items", [])
        except Exception:
            inv["items_parsed"] = []

    return {"invoices": invoices, "count": len(invoices)}


@router.get("/{merchant_id}/{invoice_id}")
async def get_invoice_detail(merchant_id: str, invoice_id: str):
    """Get a single invoice with full details."""
    import json
    invoice = db.select(
        "invoices",
        filters={"id": invoice_id, "merchant_id": merchant_id},
        single=True,
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    try:
        invoice["items_parsed"] = json.loads(invoice.get("items", "[]")) if isinstance(invoice.get("items"), str) else invoice.get("items", [])
    except Exception:
        invoice["items_parsed"] = []

    return {"invoice": invoice}


@router.patch("/{invoice_id}/pay")
async def mark_invoice_paid(invoice_id: str, body: PayInvoiceRequest):
    """Mark an invoice as paid (full or partial)."""
    # Fetch current invoice
    invoice = db.select("invoices", filters={"id": invoice_id}, single=True)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pay_amount = body.amount_paid if body.amount_paid else invoice.get("total", 0)
    new_paid = (invoice.get("amount_paid", 0) or 0) + pay_amount
    total = invoice.get("total", 0)

    if new_paid >= total:
        new_status = "paid"
        new_paid = total
    else:
        new_status = "partial"

    updated = db.update("invoices", invoice_id, {
        "amount_paid": round(new_paid, 2),
        "status": new_status,
    })

    merchant_id = invoice.get("merchant_id")
    if merchant_id:
        await realtime.emit_dashboard_refresh(merchant_id)

    return {"success": True, "invoice": updated}


@router.post("/{invoice_id}/share")
async def share_invoice(invoice_id: str, body: ShareInvoiceRequest):
    """Send invoice via WhatsApp with formatted text."""
    import json

    invoice = db.select("invoices", filters={"id": invoice_id}, single=True)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    try:
        items = json.loads(invoice.get("items", "[]")) if isinstance(invoice.get("items"), str) else invoice.get("items", [])
    except Exception:
        items = []

    # Build formatted WhatsApp message
    lines = [
        f"*INVOICE {invoice.get('invoice_number', '')}*",
        f"Date: {invoice.get('created_at', '')[:10]}",
        f"Customer: {invoice.get('customer_name', '')}",
        "",
        "*Items:*",
    ]

    for idx, item in enumerate(items, 1):
        lines.append(
            f"{idx}. {item['name']} x{item['qty']} @ Rs {item['rate']:,.0f} = Rs {item['item_total']:,.0f}"
        )
        lines.append(f"   GST {item['gst_rate']}%: Rs {item['gst_amount']:,.0f} (CGST: {item['cgst']:,.0f} + SGST: {item['sgst']:,.0f})")

    lines.append("")
    lines.append(f"*Subtotal:* Rs {invoice.get('subtotal', 0):,.0f}")
    disc = invoice.get("discount_pct", 0) or 0
    if disc > 0:
        lines.append(f"*Discount:* {disc}% = -Rs {invoice.get('discount_amount', 0):,.0f}")
    lines.append(f"*GST:* Rs {invoice.get('total_gst', 0):,.0f} (CGST: {invoice.get('cgst', 0):,.0f} + SGST: {invoice.get('sgst', 0):,.0f})")
    lines.append(f"*Grand Total:* Rs {invoice.get('total', 0):,.0f}")
    lines.append("")
    lines.append(f"Status: {'PAID' if invoice.get('status') == 'paid' else 'UNPAID'}")
    lines.append("")
    lines.append("-- MunimAI Digital Invoice --")

    message = "\n".join(lines)

    # Use provided phone, or customer's phone from invoice, or merchant's phone
    phone = body.phone or invoice.get("customer_phone") or "+917725014797"

    try:
        from services.twilio_service import send_whatsapp
        result = await send_whatsapp(to=phone, body=message)
        return {"success": True, "message_sent": True, "sent_to": phone, "api_response": result}
    except Exception as e:
        logger.warning("WhatsApp send failed: %s", e)
        return {"success": False, "message_sent": False, "formatted_text": message}
