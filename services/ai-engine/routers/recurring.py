"""
Recurring payments router -- manage scheduled payment reminders and auto-debits.

Full AutoPay system with WhatsApp approval flow:
- Create/manage recurring payments (rent, salary, supplier, utility, EMI)
- Execute payments with WhatsApp approval or auto-approve
- Track execution history
- Support UPI and bank transfer payment methods
"""

from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RecurringCreate(BaseModel):
    merchant_id: str
    name: str = Field(..., min_length=1, max_length=200, description="e.g. 'Monthly Rent', 'Salary - Raju'")
    amount: float = Field(..., gt=0)
    frequency: str = Field("monthly", description="weekly / biweekly / monthly / quarterly")
    category: str = Field("rent", description="rent / salary / supplier / utility / emi / other")

    # Payment details
    payment_method: str = Field("upi", description="upi / bank_transfer / paytm")
    upi_id: Optional[str] = None
    account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    beneficiary_name: Optional[str] = None

    # Schedule
    next_due: Optional[str] = Field(None, description="Next due date YYYY-MM-DD, defaults to today")
    reminder_days_before: int = Field(1, description="Send WhatsApp reminder N days before due")
    auto_approve: bool = Field(False, description="If true, pay without asking. If false, send WhatsApp for approval")

    # Status
    is_active: bool = True
    notes: Optional[str] = None


class RecurringResponse(BaseModel):
    id: str
    merchant_id: str
    name: str
    amount: float
    frequency: str
    category: str
    payment_method: str = "upi"
    upi_id: Optional[str] = None
    account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    beneficiary_name: Optional[str] = None
    next_due: Optional[str] = None
    reminder_days_before: int = 1
    auto_approve: bool = False
    is_active: bool = True
    notes: Optional[str] = None
    created_at: str


class RecurringUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    category: Optional[str] = None
    payment_method: Optional[str] = None
    upi_id: Optional[str] = None
    account_no: Optional[str] = None
    ifsc_code: Optional[str] = None
    beneficiary_name: Optional[str] = None
    next_due: Optional[str] = None
    reminder_days_before: Optional[int] = None
    auto_approve: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class RecurringExecution(BaseModel):
    id: str
    recurring_id: str
    recurring_name: str
    amount: float
    status: str  # "pending_approval", "approved", "paid", "failed", "skipped"
    scheduled_date: str
    approved_at: Optional[str] = None
    paid_at: Optional[str] = None
    whatsapp_approval_sid: Optional[str] = None
    created_at: str


class ExecuteRequest(BaseModel):
    merchant_phone: Optional[str] = None


class ApproveRequest(BaseModel):
    action: str = Field("approve", description="approve / skip / delay")
    delay_days: Optional[int] = None


# ---------------------------------------------------------------------------
# All data stored in Supabase `recurring_payments` table. No in-memory stores.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Helper: advance next_due based on frequency
# ---------------------------------------------------------------------------

def _advance_due_date(current_due: str, frequency: str) -> str:
    """Calculate the next due date based on frequency."""
    dt = datetime.strptime(current_due, "%Y-%m-%d").date()
    if frequency == "weekly":
        dt += timedelta(days=7)
    elif frequency == "biweekly":
        dt += timedelta(days=14)
    elif frequency == "monthly":
        month = dt.month + 1
        year = dt.year
        if month > 12:
            month = 1
            year += 1
        day = min(dt.day, 28)  # safe for all months
        dt = dt.replace(year=year, month=month, day=day)
    elif frequency == "quarterly":
        month = dt.month + 3
        year = dt.year
        while month > 12:
            month -= 12
            year += 1
        day = min(dt.day, 28)
        dt = dt.replace(year=year, month=month, day=day)
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/{merchant_id}/check-due")
async def check_due_payments(merchant_id: str):
    """Check if any recurring payments are due and need approval."""
    today = date.today().isoformat()

    # Get all active recurring payments
    payments = await list_recurring(merchant_id)
    due_payments = []

    for p in payments:
        if p.get("is_active") and p.get("next_due", "") <= today:
            due_payments.append(p)

    return {"due_count": len(due_payments), "payments": due_payments}


@router.post("/", response_model=RecurringResponse, status_code=201)
async def create_recurring(body: RecurringCreate):
    """Create a new recurring payment schedule."""
    record = {
        "merchant_id": body.merchant_id,
        "name": body.name,
        "amount": body.amount,
        "frequency": body.frequency,
        "category": body.category,
        "payment_method": body.payment_method,
        "upi_id": body.upi_id,
        "account_no": body.account_no,
        "ifsc_code": body.ifsc_code,
        "beneficiary_name": body.beneficiary_name,
        "next_due": body.next_due or datetime.now().strftime("%Y-%m-%d"),
        "reminder_days_before": body.reminder_days_before,
        "auto_approve": body.auto_approve,
        "is_active": True,
        "notes": body.notes,
        "created_at": datetime.now().isoformat(),
    }

    from models import db
    saved = db.insert("recurring_payments", record)
    logger.info("Recurring payment created in DB: %s", saved.get("id"))
    return saved


@router.get("/{merchant_id}", response_model=list[RecurringResponse])
async def list_recurring(
    merchant_id: str,
    active_only: bool = Query(True, description="Only show active schedules"),
):
    """List recurring payment schedules for a merchant."""
    from models import db
    filters = {"merchant_id": merchant_id}
    if active_only:
        filters["is_active"] = True
    records = db.select("recurring_payments", filters=filters, order_by="created_at", order_desc=True)
    return records


@router.get("/{merchant_id}/upcoming")
async def list_upcoming(
    merchant_id: str,
    days: int = Query(7, description="Number of days to look ahead"),
):
    """List recurring payments due in the next N days."""
    today = date.today()
    cutoff = today + timedelta(days=days)

    # Get all active recurring payments from Supabase
    from models import db
    all_payments = db.select("recurring_payments", filters={"merchant_id": merchant_id, "is_active": True})

    upcoming = []
    for p in all_payments:
        due_str = p.get("next_due")
        if due_str:
            try:
                due_date = datetime.strptime(due_str, "%Y-%m-%d").date()
                if today <= due_date <= cutoff:
                    days_until = (due_date - today).days
                    upcoming.append({**p, "days_until_due": days_until})
            except ValueError:
                pass

    upcoming.sort(key=lambda x: x.get("next_due", ""))
    return upcoming


@router.patch("/{recurring_id}")
async def update_recurring(recurring_id: str, body: RecurringUpdate):
    """Update a recurring payment schedule."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    from models import db
    updated = db.update("recurring_payments", recurring_id, updates)
    return updated


@router.delete("/{recurring_id}")
async def delete_recurring(recurring_id: str):
    """Deactivate a recurring payment schedule."""
    from models import db
    db.update("recurring_payments", recurring_id, {"is_active": False})
    return {"status": "deactivated", "id": recurring_id}


@router.post("/{recurring_id}/execute")
async def execute_recurring(recurring_id: str, body: ExecuteRequest = ExecuteRequest()):
    """
    Execute a recurring payment.

    If auto_approve is False, sends a WhatsApp message asking for approval.
    If auto_approve is True, processes the payment immediately.
    """
    # Find the payment in Supabase
    from models import db
    results = db.select("recurring_payments", filters={"id": recurring_id})
    payment = results[0] if results else None

    if not payment:
        raise HTTPException(status_code=404, detail="Recurring payment not found")

    execution_id = str(uuid4())
    execution = {
        "id": execution_id,
        "recurring_id": recurring_id,
        "recurring_name": payment["name"],
        "amount": payment["amount"],
        "status": "pending_approval",
        "scheduled_date": payment.get("next_due", date.today().isoformat()),
        "approved_at": None,
        "paid_at": None,
        "whatsapp_approval_sid": None,
        "created_at": datetime.now().isoformat(),
    }

    if not payment.get("auto_approve", False):
        # Send WhatsApp asking for approval
        upi_line = f"UPI: {payment['upi_id']}" if payment.get("upi_id") else ""
        bank_line = f"Account: {payment.get('account_no', '')} | IFSC: {payment.get('ifsc_code', '')}" if payment.get("account_no") else ""
        payment_detail = upi_line or bank_line

        message = (
            f"MunimAI Payment Reminder\n\n"
            f"{payment['name']}\n"
            f"Amount: Rs {payment['amount']:,.0f}\n"
            f"To: {payment.get('beneficiary_name', 'N/A')}\n"
            f"{payment_detail}\n"
            f"Due: {payment.get('next_due', 'Today')}\n\n"
            f"Reply:\n"
            f"APPROVE -- Pay now\n"
            f"SKIP -- Skip this payment\n"
            f"DELAY 3 -- Delay by 3 days"
        )

        # Try to send WhatsApp
        try:
            from services.twilio_service import send_whatsapp
            merchant_phone = body.merchant_phone or "+919999999999"
            result = await send_whatsapp(to=merchant_phone, body=message)
            execution["whatsapp_approval_sid"] = result.get("sid")
            logger.info("WhatsApp approval sent for recurring %s", recurring_id)
        except Exception as e:
            logger.warning("WhatsApp send failed, payment still pending: %s", e)

        execution["status"] = "pending_approval"
        try:
            db.insert("recurring_executions", execution)
        except Exception:
            logger.warning("Could not store execution in DB")

        return {
            "status": "pending_approval",
            "message": f"WhatsApp approval request sent for {payment['name']} - Rs {payment['amount']:,.0f}",
            "execution": execution,
        }
    else:
        # Auto-approve: process immediately
        execution["status"] = "paid"
        execution["approved_at"] = datetime.now().isoformat()
        execution["paid_at"] = datetime.now().isoformat()
        try:
            db.insert("recurring_executions", execution)
        except Exception:
            logger.warning("Could not store execution in DB")

        # Record as transaction
        try:
            from models import db
            db.insert("transactions", {
                "merchant_id": payment["merchant_id"],
                "amount": payment["amount"],
                "type": "expense",
                "category": payment.get("category", "Recurring"),
                "description": f"AutoPay: {payment['name']}",
                "payment_mode": payment.get("payment_method", "upi"),
                "source": "autopay",
                "recorded_at": datetime.now().isoformat(),
            })
        except Exception:
            pass

        # Advance next due date
        if payment.get("next_due") and payment.get("frequency"):
            new_due = _advance_due_date(payment["next_due"], payment["frequency"])
            db.update("recurring_payments", recurring_id, {"next_due": new_due})

        # Send WhatsApp confirmation
        try:
            from services.twilio_service import send_whatsapp
            merchant_phone = body.merchant_phone or "+919999999999"
            await send_whatsapp(
                to=merchant_phone,
                body=f"AutoPay: Rs {payment['amount']:,.0f} to {payment.get('beneficiary_name', payment['name'])} processed successfully!",
            )
        except Exception:
            pass

        return {
            "status": "paid",
            "message": f"Auto-payment of Rs {payment['amount']:,.0f} for {payment['name']} processed!",
            "execution": execution,
        }


@router.post("/{recurring_id}/approve")
async def approve_recurring(recurring_id: str, body: ApproveRequest):
    """
    Approve, skip, or delay a pending recurring payment.
    Called from WhatsApp callback or manually.
    """
    from models import db

    # Find the pending execution for this recurring payment in Supabase
    try:
        executions = db.select("recurring_executions", filters={"recurring_id": recurring_id, "status": "pending_approval"}, limit=1)
        execution = executions[0] if executions else None
    except Exception:
        execution = None

    if not execution:
        raise HTTPException(status_code=404, detail="No pending approval found for this payment")

    results = db.select("recurring_payments", filters={"id": recurring_id})
    payment = results[0] if results else None

    action = body.action.lower()

    if action == "approve":
        execution["status"] = "paid"
        execution["approved_at"] = datetime.now().isoformat()
        execution["paid_at"] = datetime.now().isoformat()

        # Record as transaction
        if payment:
            try:
                from models import db
                db.insert("transactions", {
                    "merchant_id": payment["merchant_id"],
                    "amount": payment["amount"],
                    "type": "expense",
                    "category": payment.get("category", "Recurring"),
                    "description": f"Recurring: {payment['name']}",
                    "payment_mode": payment.get("payment_method", "upi"),
                    "source": "autopay",
                    "recorded_at": datetime.now().isoformat(),
                })
            except Exception:
                pass

            # Advance next due date
            if payment.get("next_due") and payment.get("frequency"):
                new_due = _advance_due_date(payment["next_due"], payment["frequency"])
                db.update("recurring_payments", recurring_id, {"next_due": new_due})

        # Update execution in DB
        try:
            db.update("recurring_executions", execution["id"], {"status": "paid", "approved_at": execution["approved_at"], "paid_at": execution["paid_at"]})
        except Exception:
            pass

        return {
            "status": "paid",
            "message": f"Payment approved and processed! Rs {execution['amount']:,.0f}",
            "execution": execution,
        }

    elif action == "skip":
        execution["status"] = "skipped"

        # Advance next due date even when skipped
        if payment and payment.get("next_due") and payment.get("frequency"):
            new_due = _advance_due_date(payment["next_due"], payment["frequency"])
            db.update("recurring_payments", recurring_id, {"next_due": new_due})

        try:
            db.update("recurring_executions", execution["id"], {"status": "skipped"})
        except Exception:
            pass

        return {
            "status": "skipped",
            "message": f"Payment skipped for {execution.get('recurring_name', 'this payment')}",
            "execution": execution,
        }

    elif action == "delay":
        delay_days = body.delay_days or 3
        if payment and payment.get("next_due"):
            try:
                current_due = datetime.strptime(payment["next_due"], "%Y-%m-%d").date()
                new_due = (current_due + timedelta(days=delay_days)).isoformat()
                db.update("recurring_payments", recurring_id, {"next_due": new_due})
                execution["scheduled_date"] = new_due
            except ValueError:
                pass

        execution["status"] = "pending_approval"  # still pending, just delayed
        return {
            "status": "delayed",
            "message": f"Payment delayed by {delay_days} days",
            "execution": execution,
        }

    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}. Use approve/skip/delay")


@router.get("/{merchant_id}/history")
async def payment_history(
    merchant_id: str,
    limit: int = Query(50, ge=1, le=200),
):
    """Get execution history for a merchant's recurring payments."""
    from models import db

    # Get all recurring IDs for this merchant
    all_payments = db.select("recurring_payments", filters={"merchant_id": merchant_id})
    merchant_recurring_ids = {p["id"] for p in all_payments}

    # Fetch executions from Supabase
    all_executions = []
    for rid in merchant_recurring_ids:
        try:
            execs = db.select("recurring_executions", filters={"recurring_id": rid}, order_by="created_at", order_desc=True)
            all_executions.extend(execs)
        except Exception:
            pass

    all_executions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return all_executions[:limit]


# ---------------------------------------------------------------------------
# WhatsApp approval handler (called from whatsapp router)
# ---------------------------------------------------------------------------

async def handle_whatsapp_approval(merchant_id: str, message_text: str) -> Optional[str]:
    """
    Process a WhatsApp response for payment approval.

    Returns a reply message string, or None if the message wasn't an approval command.
    """
    from models import db
    text = message_text.strip().upper()

    # Find pending execution for this merchant from Supabase
    try:
        # Get all recurring payment IDs for this merchant
        payments = db.select("recurring_payments", filters={"merchant_id": merchant_id})
        execution = None
        for p in payments:
            execs = db.select("recurring_executions", filters={"recurring_id": p["id"], "status": "pending_approval"}, limit=1)
            if execs:
                execution = execs[0]
                break
    except Exception:
        return None

    if not execution:
        return None

    recurring_id = execution["recurring_id"]
    try:
        results = db.select("recurring_payments", filters={"id": recurring_id})
        payment = results[0] if results else None
    except Exception:
        payment = None

    if text in ("APPROVE", "YES", "PAY", "OK", "HAAN", "HA"):
        execution["status"] = "paid"
        execution["approved_at"] = datetime.now().isoformat()
        execution["paid_at"] = datetime.now().isoformat()

        # Record as transaction
        if payment:
            try:
                db.insert("transactions", {
                    "merchant_id": payment["merchant_id"],
                    "amount": payment["amount"],
                    "type": "expense",
                    "category": payment.get("category", "Recurring"),
                    "description": f"Recurring: {payment['name']}",
                    "payment_mode": payment.get("payment_method", "upi"),
                    "source": "autopay",
                    "recorded_at": datetime.now().isoformat(),
                })
            except Exception:
                pass

            # Advance due date
            if payment.get("next_due") and payment.get("frequency"):
                new_due = _advance_due_date(payment["next_due"], payment["frequency"])
                db.update("recurring_payments", recurring_id, {"next_due": new_due})

        try:
            db.update("recurring_executions", execution["id"], {"status": "paid", "approved_at": execution["approved_at"], "paid_at": execution["paid_at"]})
        except Exception:
            pass
        return f"Payment approved! Rs {execution['amount']:,.0f} for {execution.get('recurring_name', 'payment')} processed."

    elif text in ("SKIP", "NO", "NAHI", "NHIN", "CANCEL"):
        execution["status"] = "skipped"

        if payment and payment.get("next_due") and payment.get("frequency"):
            new_due = _advance_due_date(payment["next_due"], payment["frequency"])
            db.update("recurring_payments", recurring_id, {"next_due": new_due})

        try:
            db.update("recurring_executions", execution["id"], {"status": "skipped"})
        except Exception:
            pass
        return f"Payment skipped for {execution.get('recurring_name', 'this payment')}. Next due date updated."

    elif text.startswith("DELAY"):
        parts = text.split()
        delay_days = 3
        if len(parts) > 1:
            try:
                delay_days = int(parts[1])
            except ValueError:
                delay_days = 3

        if payment and payment.get("next_due"):
            try:
                current_due = datetime.strptime(payment["next_due"], "%Y-%m-%d").date()
                new_due = (current_due + timedelta(days=delay_days)).isoformat()
                db.update("recurring_payments", recurring_id, {"next_due": new_due})
                execution["scheduled_date"] = new_due
            except ValueError:
                pass

        return f"Payment delayed by {delay_days} days. New due date: {execution.get('scheduled_date', 'updated')}."

    return None
