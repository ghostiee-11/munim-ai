"""Vendor Ledger - Track suppliers, payables, and vendor analytics."""
import logging
import uuid
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from models.db import get_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vendors", tags=["vendors"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class VendorCreate(BaseModel):
    merchant_id: str
    name: str
    phone: Optional[str] = None
    upi_id: Optional[str] = None
    account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    gst_number: Optional[str] = None
    category: str = "supplier"
    payment_terms: str = "30_days"


class PayableCreate(BaseModel):
    merchant_id: str
    vendor_name: str
    vendor_id: Optional[str] = None
    amount: float = Field(..., gt=0)
    due_date: Optional[str] = None
    description: Optional[str] = None
    invoice_number: Optional[str] = None


class PaymentRecord(BaseModel):
    amount: float = Field(..., gt=0)
    payment_mode: str = "upi"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def get_vendor_payables_summary(merchant_id: str) -> dict:
    """Get total payables and overdue for dashboard."""
    db = get_client()
    rows = (
        db.table("payables")
        .select("remaining,status")
        .eq("merchant_id", merchant_id)
        .neq("status", "paid")
        .execute()
    ).data or []
    total = sum(r.get("remaining", 0) or 0 for r in rows)
    overdue = sum(r.get("remaining", 0) or 0 for r in rows if r.get("status") == "overdue")
    return {"total_payables": total, "overdue_payables": overdue}


# ---------------------------------------------------------------------------
# Vendor CRUD
# ---------------------------------------------------------------------------

@router.get("/{merchant_id}")
async def list_vendors(merchant_id: str):
    """List all vendors with outstanding amounts."""
    db = get_client()
    vendors = (
        db.table("vendors")
        .select("*")
        .eq("merchant_id", merchant_id)
        .eq("is_active", True)
        .execute()
    ).data or []

    for v in vendors:
        # Get outstanding payables for this vendor
        payables = (
            db.table("payables")
            .select("remaining,status")
            .eq("vendor_id", v["id"])
            .in_("status", ["pending", "partial", "overdue"])
            .execute()
        ).data or []
        v["outstanding"] = sum(p.get("remaining", 0) or 0 for p in payables)
        v["overdue"] = sum(p.get("remaining", 0) or 0 for p in payables if p.get("status") == "overdue")

    return vendors


@router.post("/")
async def create_vendor(body: VendorCreate):
    """Register a new vendor."""
    db = get_client()
    vendor_data = body.dict()
    vendor_data["is_active"] = True
    saved = db.table("vendors").insert(vendor_data).execute()
    if saved.data:
        return saved.data[0]
    raise HTTPException(500, "Failed to create vendor")


# ---------------------------------------------------------------------------
# Payables
# ---------------------------------------------------------------------------

@router.get("/payables/{merchant_id}")
async def list_payables(merchant_id: str, status: Optional[str] = None):
    """List payables with totals."""
    db = get_client()
    query = db.table("payables").select("*").eq("merchant_id", merchant_id)
    if status:
        query = query.eq("status", status)
    rows = query.execute().data or []

    # Sort: overdue first, then by due_date
    rows.sort(key=lambda p: (0 if p.get("status") == "overdue" else 1, p.get("due_date") or ""))

    active = [p for p in rows if p.get("status") != "paid"]
    total = sum(p.get("remaining", 0) or 0 for p in active)
    overdue = sum(p.get("remaining", 0) or 0 for p in active if p.get("status") == "overdue")
    return {"total_payable": total, "total_overdue": overdue, "count": len(rows), "payables": rows}


@router.post("/payables/")
async def create_payable(body: PayableCreate):
    """Create a new payable (vendor credit taken)."""
    db = get_client()
    payable_data = {
        "merchant_id": body.merchant_id,
        "vendor_name": body.vendor_name,
        "vendor_id": body.vendor_id,
        "amount": body.amount,
        "amount_paid": 0,
        "status": "pending",
        "due_date": body.due_date or (date.today() + timedelta(days=30)).isoformat(),
        "description": body.description or "",
        "invoice_number": body.invoice_number,
    }
    # Do NOT insert 'remaining' - it is a GENERATED column
    saved = db.table("payables").insert(payable_data).execute()
    if saved.data:
        return saved.data[0]
    raise HTTPException(500, "Failed to create payable")


@router.get("/payables/{merchant_id}/aging")
async def get_aging(merchant_id: str):
    """AP aging report: 0-30, 30-60, 60-90, 90+ days."""
    db = get_client()
    rows = (
        db.table("payables")
        .select("due_date,remaining,status")
        .eq("merchant_id", merchant_id)
        .neq("status", "paid")
        .execute()
    ).data or []

    today = date.today()
    buckets = {"current": 0, "0_30": 0, "30_60": 0, "60_90": 0, "90_plus": 0}
    for p in rows:
        try:
            due = datetime.strptime(p.get("due_date", today.isoformat()), "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        days_overdue = (today - due).days
        remaining = p.get("remaining", 0) or 0
        if days_overdue <= 0:
            buckets["current"] += remaining
        elif days_overdue <= 30:
            buckets["0_30"] += remaining
        elif days_overdue <= 60:
            buckets["30_60"] += remaining
        elif days_overdue <= 90:
            buckets["60_90"] += remaining
        else:
            buckets["90_plus"] += remaining
    return buckets


@router.get("/payables/{merchant_id}/upcoming")
async def get_upcoming(merchant_id: str, days: int = 14):
    """Payments due in the next N days."""
    db = get_client()
    today = date.today()
    cutoff = today + timedelta(days=days)

    rows = (
        db.table("payables")
        .select("*")
        .eq("merchant_id", merchant_id)
        .neq("status", "paid")
        .lte("due_date", cutoff.isoformat())
        .execute()
    ).data or []

    upcoming = []
    for p in rows:
        due_str = p.get("due_date", "")
        if not due_str:
            continue
        try:
            due = datetime.strptime(due_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
        days_until = (due - today).days
        upcoming.append({**p, "days_until": days_until})

    upcoming.sort(key=lambda x: x.get("days_until", 999))
    return upcoming


@router.post("/payables/{payable_id}/pay")
async def pay_payable(payable_id: str, body: PaymentRecord):
    """Record payment against a payable."""
    db = get_client()

    # Fetch the payable
    result = db.table("payables").select("*").eq("id", payable_id).execute()
    if not result.data:
        raise HTTPException(404, "Payable not found")
    p = result.data[0]

    new_amount_paid = (p.get("amount_paid", 0) or 0) + body.amount
    new_remaining = max(0, p["amount"] - new_amount_paid)
    new_status = "paid" if new_remaining <= 0 else "partial"

    # Update only amount_paid and status (remaining is GENERATED)
    updated = db.table("payables").update({
        "amount_paid": new_amount_paid,
        "status": new_status,
    }).eq("id", payable_id).execute()

    updated_payable = updated.data[0] if updated.data else {**p, "amount_paid": new_amount_paid, "remaining": new_remaining, "status": new_status}

    # Auto-create expense transaction
    try:
        db.table("transactions").insert({
            "merchant_id": p["merchant_id"],
            "type": "expense",
            "amount": body.amount,
            "category": "vendor_payment",
            "description": f"Payment to {p['vendor_name']}",
            "supplier_name": p["vendor_name"],
            "payment_mode": body.payment_mode,
            "source": "vendor_ledger",
        }).execute()
    except Exception as e:
        logger.warning("Failed to create expense transaction: %s", e)

    return {"status": new_status, "remaining": new_remaining, "payable": updated_payable}


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@router.get("/{merchant_id}/analytics")
async def vendor_analytics(merchant_id: str):
    """Spend breakdown by vendor."""
    db = get_client()
    spend = {}

    # Sum amount_paid from payables
    payables = (
        db.table("payables")
        .select("vendor_name,amount_paid")
        .eq("merchant_id", merchant_id)
        .execute()
    ).data or []
    for p in payables:
        name = p.get("vendor_name", "Unknown")
        spend[name] = spend.get(name, 0) + (p.get("amount_paid", 0) or 0)

    # Also check transactions table for supplier expenses
    try:
        txns = db.table("transactions").select("supplier_name,amount").eq("merchant_id", merchant_id).eq("type", "expense").not_.is_("supplier_name", "null").execute()
        for t in (txns.data or []):
            name = t.get("supplier_name", "Other")
            if name:
                spend[name] = spend.get(name, 0) + (t.get("amount", 0) or 0)
    except Exception:
        pass

    sorted_spend = sorted(spend.items(), key=lambda x: -x[1])
    return {"spend_by_vendor": [{"name": k, "amount": v} for k, v in sorted_spend]}


# ---------------------------------------------------------------------------
# Delete / AutoPay / Notify
# ---------------------------------------------------------------------------

@router.delete("/{vendor_id}")
async def delete_vendor(vendor_id: str):
    db = get_client()
    result = db.table("vendors").select("id").eq("id", vendor_id).execute()
    if not result.data:
        raise HTTPException(404, "Vendor not found")
    db.table("vendors").update({"is_active": False}).eq("id", vendor_id).execute()
    return {"deleted": True, "vendor_id": vendor_id}


class AutoPaySetup(BaseModel):
    amount: float = Field(..., gt=0)
    frequency: str = "monthly"  # weekly, monthly
    auto_approve: bool = False


@router.post("/{vendor_id}/set-autopay")
async def set_vendor_autopay(vendor_id: str, body: AutoPaySetup):
    db = get_client()
    result = db.table("vendors").select("*").eq("id", vendor_id).execute()
    if not result.data:
        raise HTTPException(404, "Vendor not found")
    vendor = result.data[0]

    # Remove existing autopay for this vendor first
    if vendor.get("autopay_id"):
        try:
            db.table("recurring_payments").delete().eq("id", vendor["autopay_id"]).execute()
        except Exception:
            pass

    # Create recurring payment with vendor details
    recurring_data = {
        "merchant_id": vendor["merchant_id"],
        "name": f"AutoPay - {vendor['name']}",
        "amount": body.amount,
        "frequency": body.frequency,
        "category": vendor.get("category", "supplier"),
        "payment_method": "upi" if vendor.get("upi_id") else "bank_transfer",
        "upi_id": vendor.get("upi_id"),
        "beneficiary_name": vendor["name"],
        "next_due": (date.today() + timedelta(days=5)).isoformat(),
        "is_active": True,
        "auto_approve": body.auto_approve,
        "vendor_id": vendor_id,
    }

    saved = db.table("recurring_payments").insert(recurring_data).execute()
    if not saved.data:
        raise HTTPException(500, "Failed to create recurring payment")

    rec_id = str(saved.data[0]["id"])
    recurring = saved.data[0]

    # Mark vendor as having autopay
    db.table("vendors").update({
        "has_autopay": True,
        "autopay_id": rec_id,
    }).eq("id", vendor_id).execute()

    return {"autopay_id": rec_id, "recurring": recurring}


class NotifyRequest(BaseModel):
    notify_type: str = "payment_reminder"  # payment_reminder, payment_confirmation, order_placed
    message: str = None


@router.post("/{vendor_id}/notify")
async def notify_vendor(vendor_id: str, body: NotifyRequest):
    db = get_client()
    result = db.table("vendors").select("*").eq("id", vendor_id).execute()
    if not result.data:
        raise HTTPException(404, "Vendor not found")
    vendor = result.data[0]

    phone = vendor.get("phone")
    if not phone:
        return {"sent": False, "reason": "Vendor phone not available"}

    # Get outstanding for this vendor
    payables = (
        db.table("payables")
        .select("remaining")
        .eq("vendor_id", vendor_id)
        .neq("status", "paid")
        .execute()
    ).data or []
    outstanding = sum(p.get("remaining", 0) or 0 for p in payables)

    if body.notify_type == "payment_reminder":
        msg = body.message or f"Reminder: Rs {outstanding:,.0f} payment pending to {vendor['name']}. Due soon."
    elif body.notify_type == "payment_confirmation":
        msg = body.message or f"Payment to {vendor['name']} has been processed successfully."
    elif body.notify_type == "order_placed":
        msg = body.message or f"Order placed with {vendor['name']}. Delivery expected soon."
    else:
        msg = body.message or f"Notification for {vendor['name']}"

    # Send via Twilio — send to MERCHANT as self-reminder (sandbox only supports joined numbers)
    try:
        from services.twilio_service import send_whatsapp
        # Use merchant's sandbox number for demo
        merchant_phone = "+917725014797"
        result = await send_whatsapp(to=merchant_phone, body=f"🔔 MunimAI Vendor Alert\n\n{msg}")
        return {"sent": result.get("status") == "sent", "message": msg, "to": merchant_phone, "result": result}
    except Exception as e:
        return {"sent": False, "message": msg, "error": str(e)}
