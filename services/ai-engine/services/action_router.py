"""
Action Router -- maps NLU intents to concrete database operations and
real-time events.

This is the bridge between the language understanding layer and the
business logic.  Every recognised intent dispatches to a handler that:

1. Validates extracted entities.
2. Performs the DB mutation / query.
3. Emits a Socket.IO event so dashboards update instantly.
4. Returns a human-friendly response string + structured result dict.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
import uuid
from typing import Any

from models import db
from models.schemas import NLUResult, TransactionType, UdhariStatus
from services import realtime

logger = logging.getLogger(__name__)

# Valid categories for Groq recategorization
_VALID_CATEGORIES = frozenset([
    "saree", "textile", "stock", "rent", "salary", "utility",
    "transport", "food", "personal", "supplier_payment", "general",
])


async def _groq_recategorize(
    merchant_id: str, txn_id: str, description: str, current_category: str
):
    """Use Groq LLM to verify/correct transaction category asynchronously."""
    try:
        import httpx
        from config import get_settings
        settings = get_settings()
        if not settings.groq_api_key:
            return

        prompt = (
            f"Transaction: {description}. Current category: {current_category}. "
            f"Merchant type: textile/saree shop. Correct category from: "
            f"saree, textile, stock, rent, salary, utility, transport, food, "
            f"personal, supplier_payment, general. Return ONLY the category word."
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json={
                    "model": "llama-3.3-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0,
                    "max_tokens": 20,
                },
            )
        if resp.status_code == 200:
            new_cat = resp.json()["choices"][0]["message"]["content"].strip().lower()
            if new_cat != current_category.lower() and new_cat in _VALID_CATEGORIES:
                from models.db import get_client
                get_client().table("transactions").update(
                    {"category": new_cat}
                ).eq("id", txn_id).execute()
                logger.info(
                    "Recategorized txn %s: %s -> %s", txn_id, current_category, new_cat
                )
    except Exception:
        pass  # Non-blocking -- never fail the main flow


class ActionResult:
    """Container for the outcome of an action dispatch."""

    __slots__ = ("success", "response_text", "data")

    def __init__(self, success: bool, response_text: str, data: dict[str, Any] | None = None):
        self.success = success
        self.response_text = response_text
        self.data = data or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "response_text": self.response_text,
            "data": self.data,
        }


# ---------------------------------------------------------------------------
# Intent registry
# ---------------------------------------------------------------------------

_INTENT_HANDLERS: dict[str, Any] = {}


def _register(intent: str):
    """Decorator to register a handler for an NLU intent."""
    def decorator(fn):
        _INTENT_HANDLERS[intent] = fn
        return fn
    return decorator


async def route(merchant_id: str, nlu: NLUResult) -> ActionResult:
    """
    Dispatch an NLU result to the matching handler.

    Parameters
    ----------
    merchant_id : str
        The merchant performing the action.
    nlu : NLUResult
        Parsed intent, confidence, and entities from the NLU pipeline.

    Returns
    -------
    ActionResult
    """
    handler = _INTENT_HANDLERS.get(nlu.intent)
    if handler is None:
        logger.warning("No handler for intent '%s'", nlu.intent)
        return ActionResult(
            success=False,
            response_text=(
                "Maaf kijiye, mujhe samajh nahi aaya. "
                "Kya aap dobara bata sakte hain?"
            ),
        )

    try:
        return await handler(merchant_id, nlu.entities)
    except Exception:
        logger.exception("Action handler failed for intent '%s'", nlu.intent)
        return ActionResult(
            success=False,
            response_text="Kuch gadbad ho gayi. Kripya dobara koshish karein.",
        )


# ---------------------------------------------------------------------------
# Handlers -- Transactions
# ---------------------------------------------------------------------------

@_register("add_income")
async def _add_income(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    if not amount:
        return ActionResult(False, "Kitne rupaye aaye? Amount bataiye.")

    category = entities.get("category", "Sales")
    party = entities.get("party_name")
    customer_name = entities.get("customer_name") or party
    description = entities.get("description", "")
    payment_mode = entities.get("payment_mode", "cash")

    txn = db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": float(amount),
        "type": "income",
        "category": category,
        "customer_name": customer_name,
        "payment_mode": payment_mode,
        "description": description or f"Rs {amount} income",
        "recorded_at": datetime.now().isoformat(),
        "source": "voice",
    })

    # Async Groq re-categorization (non-blocking)
    if txn.get("id"):
        import asyncio as _asyncio_inc
        _asyncio_inc.create_task(_groq_recategorize(
            merchant_id, txn["id"],
            description or f"Rs {amount} income", category,
        ))

    # Auto-classify for GST HSN code
    try:
        from services.agents.gst_agent import auto_classify_transaction
        classification = await auto_classify_transaction(txn)
        if txn.get("id"):
            db.update("transactions", txn["id"], {
                "hsn_code": classification["hsn_code"],
                "gst_rate": classification["gst_rate"],
            })
            txn["hsn_code"] = classification["hsn_code"]
            txn["gst_rate"] = classification["gst_rate"]
    except Exception:
        logger.warning("Auto GST classification failed for income txn, continuing")

    # Check for duplicate: same amount within 1 hour
    try:
        import asyncio
        from services.twilio_service import send_whatsapp
        one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
        dupes = db.select_range("transactions",
            filters={"merchant_id": merchant_id, "amount": float(amount)},
            gte=("created_at", one_hour_ago))
        if len(dupes) > 1:
            asyncio.create_task(send_whatsapp("+917725014797",
                f"\u26a0\ufe0f Warning: Rs {amount} {party or ''} do baar record hua 1 ghante mein. Check karein."))
    except Exception:
        pass

    await realtime.emit_transaction_created(merchant_id, txn)
    await realtime.emit_dashboard_refresh(merchant_id)

    party_str = f" {customer_name} se" if customer_name else ""
    mode_str = f" ({payment_mode})" if payment_mode else ""
    return ActionResult(
        success=True,
        response_text=f"Done! {amount} rupaye{party_str} income record ho gaya{mode_str}. Category: {category}.",
        data={"transaction": txn},
    )


@_register("add_expense")
async def _add_expense(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    if not amount:
        return ActionResult(False, "Kitna kharcha hua? Amount bataiye.")

    category = entities.get("category", "General")
    party = entities.get("party_name")
    customer_name = entities.get("customer_name") or party
    description = entities.get("description", "")
    payment_mode = entities.get("payment_mode", "cash")

    # Check if party is a known vendor — auto-redirect to vendor payment
    if party:
        try:
            from models.db import get_client as _get_client
            supa = _get_client()
            vendors = supa.table("vendors").select("id,name").eq("merchant_id", merchant_id).execute()
            for v in (vendors.data or []):
                if party.lower() in v.get("name", "").lower() or v.get("name", "").lower() in party.lower():
                    # It's a vendor! Route to vendor payment handler
                    return await _add_vendor_payment(merchant_id, entities)
        except Exception:
            pass

    txn = db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": float(amount),
        "type": "expense",
        "category": category,
        "customer_name": customer_name,
        "supplier_name": party,
        "payment_mode": payment_mode,
        "description": description or f"Rs {amount} {category}",
        "recorded_at": datetime.now().isoformat(),
        "source": "voice",
    })

    # Async Groq re-categorization (non-blocking)
    if txn.get("id"):
        import asyncio as _asyncio_exp
        _asyncio_exp.create_task(_groq_recategorize(
            merchant_id, txn["id"],
            description or f"Rs {amount} {category}", category,
        ))

    # Auto-classify for GST HSN code
    try:
        from services.agents.gst_agent import auto_classify_transaction
        classification = await auto_classify_transaction(txn)
        if txn.get("id"):
            db.update("transactions", txn["id"], {
                "hsn_code": classification["hsn_code"],
                "gst_rate": classification["gst_rate"],
            })
            txn["hsn_code"] = classification["hsn_code"]
            txn["gst_rate"] = classification["gst_rate"]
    except Exception:
        logger.warning("Auto GST classification failed for expense txn, continuing")

    # Check for duplicate: same amount within 1 hour
    try:
        import asyncio
        from services.twilio_service import send_whatsapp
        one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
        dupes = db.select_range("transactions",
            filters={"merchant_id": merchant_id, "amount": float(amount)},
            gte=("created_at", one_hour_ago))
        if len(dupes) > 1:
            asyncio.create_task(send_whatsapp("+917725014797",
                f"\u26a0\ufe0f Warning: Rs {amount} {party or ''} do baar record hua 1 ghante mein. Check karein."))
    except Exception:
        pass

    await realtime.emit_transaction_created(merchant_id, txn)
    await realtime.emit_dashboard_refresh(merchant_id)

    party_str = f" {customer_name or party} ko" if (customer_name or party) else ""
    mode_str = f" ({payment_mode})" if payment_mode else ""
    return ActionResult(
        success=True,
        response_text=f"Done! {amount} rupaye{party_str} expense record ho gaya{mode_str}. Category: {category}.",
        data={"transaction": txn},
    )


# ---------------------------------------------------------------------------
# Handlers -- Personal Withdrawal (Business vs Personal separation)
# ---------------------------------------------------------------------------

@_register("personal_withdrawal")
async def _personal_withdrawal(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    if not amount:
        return ActionResult(False, "Kitne rupaye nikale? Amount bataiye.")

    description = entities.get("description", "Personal withdrawal")

    try:
        txn = db.insert("transactions", {
            "merchant_id": merchant_id,
            "amount": float(amount),
            "type": "expense",
            "category": "personal",
            "description": description,
            "is_personal": True,
            "source": "voice",
            "payment_mode": "cash",
            "recorded_at": datetime.now().isoformat(),
        })
    except Exception:
        logger.exception("Failed to insert personal withdrawal")
        return ActionResult(False, "Personal withdrawal record nahi ho paya. Dobara try karein.")

    await realtime.emit_transaction_created(merchant_id, txn)
    await realtime.emit_dashboard_refresh(merchant_id)

    return ActionResult(
        success=True,
        response_text=f"Rs {amount} personal withdrawal record ho gaya. Ye business P&L mein nahi dikhega.",
        data={"transaction": txn},
    )


# ---------------------------------------------------------------------------
# Handlers -- Udhari
# ---------------------------------------------------------------------------

@_register("add_udhari")
async def _add_udhari(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    customer_name = entities.get("customer_name") or entities.get("party_name")
    if not amount or not customer_name:
        return ActionResult(False, "Udhari ke liye customer ka naam aur amount dono chahiye.")

    due_date = entities.get("due_date")
    phone = entities.get("phone")

    udhari = db.insert("udhari", {
        "merchant_id": merchant_id,
        "debtor_name": customer_name,
        "debtor_phone": phone,
        "amount": float(amount),
        "amount_paid": 0,
        "status": "pending",
        "notes": entities.get("description", ""),
        "due_date": due_date,
        "source": "voice",
    })

    await realtime.emit_udhari_created(merchant_id, udhari)
    await realtime.emit_dashboard_refresh(merchant_id)

    return ActionResult(
        success=True,
        response_text=f"{customer_name} ki {amount} rupaye udhari likh di gayi.",
        data={"udhari": udhari},
    )


@_register("settle_udhari")
async def _settle_udhari(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    customer_name = entities.get("customer_name") or entities.get("party_name")
    amount = entities.get("amount")

    if not customer_name:
        return ActionResult(False, "Kiska udhari settle karna hai? Naam bataiye.")

    # Find the most recent pending udhari for this customer
    udharis = db.select(
        "udhari",
        filters={"merchant_id": merchant_id, "customer_name": customer_name},
        order_by="created_at",
        order_desc=True,
        limit=1,
    )

    if not udharis:
        return ActionResult(False, f"{customer_name} ka koi pending udhari nahi mila.")

    udhari = udharis[0] if isinstance(udharis, list) else udharis
    settle_amount = float(amount) if amount else udhari["remaining"]
    new_paid = udhari.get("amount_paid", 0) + settle_amount
    new_remaining = max(0, udhari["amount"] - new_paid)
    new_status = UdhariStatus.SETTLED.value if new_remaining == 0 else UdhariStatus.PARTIAL.value

    updated = db.update("udhari", udhari["id"], {
        "amount_paid": new_paid,
        "remaining": new_remaining,
        "status": new_status,
    })

    # Also record as income transaction
    db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": settle_amount,
        "type": TransactionType.INCOME.value,
        "category": "Udhari Collection",
        "party_name": customer_name,
        "description": f"Udhari settlement from {customer_name}",
        "date": date.today().isoformat(),
        "source": "voice",
    })

    await realtime.emit_udhari_settled(merchant_id, updated)
    await realtime.emit_dashboard_refresh(merchant_id)

    if new_remaining == 0:
        return ActionResult(True, f"{customer_name} ka udhari poora settle ho gaya!", data={"udhari": updated})
    return ActionResult(
        True,
        f"{customer_name} se {settle_amount} rupaye mil gaye. Abhi {new_remaining} rupaye baaki hain.",
        data={"udhari": updated},
    )


# ---------------------------------------------------------------------------
# Handlers -- Queries
# ---------------------------------------------------------------------------

@_register("get_today_summary")
async def _get_today_summary(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    today = date.today().isoformat()
    try:
        txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("created_at", today),
            lte=("created_at", f"{today}T23:59:59"),
        )
    except Exception:
        # Fallback: get all today's transactions
        all_txns = db.select("transactions", filters={"merchant_id": merchant_id})
        txns = [t for t in all_txns if t.get("created_at", "").startswith(today)]

    income = sum(t["amount"] for t in txns if t.get("type") == "income")
    expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
    profit = income - expense

    return ActionResult(
        success=True,
        response_text=(
            f"Aaj ki summary: {income} rupaye income, {expense} rupaye kharcha, "
            f"aur {profit} rupaye profit."
        ),
        data={"income": income, "expense": expense, "profit": profit, "count": len(txns)},
    )


@_register("get_udhari_summary")
async def _get_udhari_summary(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    udharis = db.get_merchant_udharis(merchant_id, status="pending")
    total = sum(u.get("remaining", 0) for u in udharis)
    count = len(udharis)

    return ActionResult(
        success=True,
        response_text=f"Aapka total {count} logon ka {total} rupaye udhari pending hai.",
        data={"total_outstanding": total, "count": count},
    )


@_register("get_balance")
async def _get_balance(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    today = date.today().isoformat()
    start = date.today().replace(day=1).isoformat()

    try:
        txns = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("created_at", start),
            lte=("created_at", f"{today}T23:59:59"),
        )
    except Exception:
        all_txns = db.select("transactions", filters={"merchant_id": merchant_id})
        txns = [t for t in all_txns if t.get("created_at", "") >= start]

    income = sum(t["amount"] for t in txns if t.get("type") == "income")
    expense = sum(t["amount"] for t in txns if t.get("type") == "expense")

    return ActionResult(
        success=True,
        response_text=f"Is mahine abhi tak {income} rupaye aaye aur {expense} rupaye gaye. Net: {income - expense} rupaye.",
        data={"month_income": income, "month_expense": expense, "net": income - expense},
    )


@_register("send_reminder")
async def _send_reminder(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    customer_name = entities.get("customer_name") or entities.get("party_name")
    if not customer_name:
        return ActionResult(False, "Kisko reminder bhejna hai? Naam bataiye.")

    udharis = db.select(
        "udhari",
        filters={"merchant_id": merchant_id, "customer_name": customer_name, "status": "pending"},
        limit=1,
    )

    if not udharis:
        return ActionResult(False, f"{customer_name} ka koi pending udhari nahi hai.")

    udhari = udharis[0] if isinstance(udharis, list) else udharis

    db.update("udhari", udhari["id"], {
        "last_reminded_at": datetime.utcnow().isoformat(),
    })

    await realtime.emit_udhari_reminder_sent(merchant_id, udhari["id"], customer_name)

    return ActionResult(
        success=True,
        response_text=f"{customer_name} ko {udhari['remaining']} rupaye ka payment reminder bhej diya.",
        data={"udhari_id": udhari["id"], "customer_name": customer_name},
    )


# ---------------------------------------------------------------------------
# Fallback / Greeting
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Handlers -- Recurring Payments (AutoPay)
# ---------------------------------------------------------------------------

@_register("setup_recurring")
async def _setup_recurring(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    if not amount:
        return ActionResult(False, "Kitne rupaye ka recurring payment set karna hai? Amount bataiye.")

    beneficiary = entities.get("beneficiary_name") or entities.get("party_name") or entities.get("customer_name")
    category = entities.get("category", "other")
    frequency = entities.get("frequency", "monthly")
    payment_mode = entities.get("payment_mode", "upi")
    upi_id = entities.get("upi_id")

    # Map category to readable name
    category_names = {
        "rent": "Rent", "salary": "Salary", "supplier": "Supplier",
        "utility": "Utility", "emi": "EMI", "other": "Recurring",
    }
    cat_display = category_names.get(category, category.title())

    # Build a descriptive name
    name = f"{cat_display}"
    if beneficiary:
        name = f"{cat_display} - {beneficiary}"

    # Calculate next due (default: 1st of next month for monthly, next week for weekly)
    from datetime import date, timedelta
    today = date.today()
    if frequency == "weekly":
        next_due = (today + timedelta(days=7)).isoformat()
    elif frequency == "biweekly":
        next_due = (today + timedelta(days=14)).isoformat()
    elif frequency == "quarterly":
        month = today.month + 3
        year = today.year
        while month > 12:
            month -= 12
            year += 1
        next_due = today.replace(year=year, month=month, day=min(today.day, 28)).isoformat()
    else:  # monthly
        month = today.month + 1
        year = today.year
        if month > 12:
            month = 1
            year += 1
        next_due = today.replace(year=year, month=month, day=min(today.day, 28)).isoformat()

    record = {
        "id": str(uuid.uuid4()),
        "merchant_id": merchant_id,
        "name": name,
        "amount": float(amount),
        "frequency": frequency,
        "category": category,
        "payment_method": payment_mode if payment_mode in ("upi", "bank_transfer") else "upi",
        "upi_id": upi_id,
        "account_no": None,
        "ifsc_code": None,
        "beneficiary_name": beneficiary,
        "next_due": next_due,
        "reminder_days_before": 1,
        "auto_approve": False,
        "is_active": True,
        "notes": None,
        "created_at": datetime.now().isoformat(),
    }

    # Store in recurring payments (Supabase only)
    saved = db.insert("recurring_payments", record)
    logger.info("Recurring payment created via voice: %s", saved.get("id"))

    freq_hindi = {
        "weekly": "har hafte", "biweekly": "har do hafte",
        "monthly": "har mahine", "quarterly": "har teen mahine",
    }
    freq_str = freq_hindi.get(frequency, frequency)
    bene_str = f" {beneficiary} ko" if beneficiary else ""

    await realtime.emit_dashboard_refresh(merchant_id)

    return ActionResult(
        success=True,
        response_text=(
            f"Done! {freq_str}{bene_str} {amount} rupaye ka autopay set ho gaya. "
            f"Category: {cat_display}. Next payment: {next_due}. "
            f"Har baar payment se pehle aapko WhatsApp pe approval maanga jayega."
        ),
        data={"recurring_payment": record},
    )


# ---------------------------------------------------------------------------
# Fallback / Greeting
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Handlers -- Vendor operations
# ---------------------------------------------------------------------------

@_register("add_vendor_payment")
async def _add_vendor_payment(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    vendor_name = entities.get("party_name") or entities.get("customer_name")
    if not amount:
        return ActionResult(False, "Vendor ko kitna payment karna hai? Amount bataiye.")
    if not vendor_name:
        return ActionResult(False, "Kis vendor ko payment karna hai? Naam bataiye.")

    payment_mode = entities.get("payment_mode", "upi")

    # Look up vendor in Supabase
    from models.db import get_client
    supa = get_client()
    vendor_results = (
        supa.table("vendors")
        .select("*")
        .eq("merchant_id", merchant_id)
        .ilike("name", f"%{vendor_name}%")
        .limit(1)
        .execute()
    ).data or []
    matched_vendor = vendor_results[0] if vendor_results else None

    # Find pending payable for this vendor and record payment
    if matched_vendor:
        payable_results = (
            supa.table("payables")
            .select("*")
            .eq("vendor_id", matched_vendor["id"])
            .in_("status", ["pending", "partial", "overdue"])
            .limit(1)
            .execute()
        ).data or []
        if payable_results:
            p = payable_results[0]
            pay_amount = min(float(amount), p.get("remaining", 0) or 0)
            if pay_amount > 0:
                new_amount_paid = (p.get("amount_paid", 0) or 0) + pay_amount
                new_status = "paid" if (p["amount"] - new_amount_paid) <= 0 else "partial"
                supa.table("payables").update({
                    "amount_paid": new_amount_paid,
                    "status": new_status,
                }).eq("id", p["id"]).execute()

    # Record as expense
    txn = db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": float(amount),
        "type": "expense",
        "category": "vendor_payment",
        "supplier_name": vendor_name,
        "payment_mode": payment_mode,
        "description": f"Payment to vendor {vendor_name}",
        "recorded_at": datetime.now().isoformat(),
        "source": "voice",
    })

    await realtime.emit_transaction_created(merchant_id, txn)
    await realtime.emit_dashboard_refresh(merchant_id)

    return ActionResult(
        success=True,
        response_text=f"Done! {vendor_name} ko {amount} rupaye ka payment record ho gaya ({payment_mode}).",
        data={"transaction": txn},
    )


@_register("add_vendor_order")
async def _add_vendor_order(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    amount = entities.get("amount")
    vendor_name = entities.get("party_name") or entities.get("customer_name")
    if not vendor_name:
        return ActionResult(False, "Kis vendor se order karna hai? Naam bataiye.")

    description = entities.get("description", "")

    # Create a payable for this order via Supabase
    from models.db import get_client
    supa = get_client()
    vendor_results = (
        supa.table("vendors")
        .select("id")
        .eq("merchant_id", merchant_id)
        .ilike("name", f"%{vendor_name}%")
        .limit(1)
        .execute()
    ).data or []
    vendor_id = vendor_results[0]["id"] if vendor_results else None

    payable_data = {
        "merchant_id": merchant_id,
        "vendor_name": vendor_name,
        "vendor_id": vendor_id,
        "amount": float(amount) if amount else 0,
        "amount_paid": 0,
        "status": "pending",
        "due_date": (date.today() + timedelta(days=30)).isoformat(),
        "description": description or f"Order from {vendor_name}",
    }
    # Do NOT insert 'remaining' - it is a GENERATED column
    saved = supa.table("payables").insert(payable_data).execute()
    payable = saved.data[0] if saved.data else payable_data

    await realtime.emit_dashboard_refresh(merchant_id)

    amount_str = f" {amount} rupaye ka" if amount else ""
    return ActionResult(
        success=True,
        response_text=f"{vendor_name} se{amount_str} order place ho gaya. Payable create kar diya.",
        data={"payable": payable},
    )


@_register("check_vendor_balance")
async def _check_vendor_balance(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    vendor_name = entities.get("party_name") or entities.get("customer_name")

    from models.db import get_client
    supa = get_client()

    if vendor_name:
        # Find specific vendor's payables
        matched_payables = (
            supa.table("payables")
            .select("remaining")
            .eq("merchant_id", merchant_id)
            .ilike("vendor_name", f"%{vendor_name}%")
            .neq("status", "paid")
            .execute()
        ).data or []
        total = sum(p.get("remaining", 0) or 0 for p in matched_payables)
        return ActionResult(
            success=True,
            response_text=f"{vendor_name} ko total {total} rupaye dena baaki hai.",
            data={"vendor_name": vendor_name, "outstanding": total, "payables_count": len(matched_payables)},
        )
    else:
        # All vendors
        all_payables = (
            supa.table("payables")
            .select("remaining,status")
            .eq("merchant_id", merchant_id)
            .neq("status", "paid")
            .execute()
        ).data or []
        total = sum(p.get("remaining", 0) or 0 for p in all_payables)
        overdue = sum(p.get("remaining", 0) or 0 for p in all_payables if p.get("status") == "overdue")
        return ActionResult(
            success=True,
            response_text=f"Total vendor outstanding {total} rupaye hai, jisme se {overdue} rupaye overdue hai.",
            data={"total_outstanding": total, "total_overdue": overdue, "payables_count": len(all_payables)},
        )


# ---------------------------------------------------------------------------
# Handlers -- Invoice & Inventory
# ---------------------------------------------------------------------------

@_register("create_invoice")
async def _create_invoice(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    customer_name = entities.get("customer_name") or entities.get("party_name") or "Customer"
    amount = entities.get("amount")
    description = entities.get("description", "")

    if not amount:
        return ActionResult(False, "Invoice ke liye amount bataiye. Kitne ka bill banana hai?")

    item_name = description if description else "Item"
    items = [{"name": item_name, "qty": 1, "rate": float(amount), "description": description}]

    try:
        import json as _json
        from routers.invoices import _generate_invoice_number, _classify_item, _deduct_inventory

        invoice_number = await _generate_invoice_number(merchant_id)
        line_items = []
        subtotal = 0.0
        total_gst = 0.0

        for item in items:
            classification = await _classify_item(item["name"], item["rate"])
            hsn_code = classification["hsn_code"]
            gst_rate = classification["gst_rate"]
            item_total = item["qty"] * item["rate"]
            gst_amount = round(item_total * gst_rate / 100, 2)
            cgst = round(gst_amount / 2, 2)
            sgst = round(gst_amount / 2, 2)

            line_items.append({
                "name": item["name"], "qty": item["qty"], "rate": item["rate"],
                "hsn_code": hsn_code, "gst_rate": gst_rate,
                "item_total": item_total, "gst_amount": gst_amount,
                "cgst": cgst, "sgst": sgst,
                "total_with_gst": round(item_total + gst_amount, 2),
                "description": item.get("description", ""),
            })
            subtotal += item_total
            total_gst += gst_amount
            _deduct_inventory(merchant_id, item["name"], item["qty"])

        grand_total = round(subtotal + total_gst, 2)
        total_cgst = round(total_gst / 2, 2)
        total_sgst = round(total_gst / 2, 2)

        invoice = db.insert("invoices", {
            "merchant_id": merchant_id,
            "invoice_number": invoice_number,
            "customer_name": customer_name,
            "items": _json.dumps(line_items),
            "subtotal": round(subtotal, 2),
            "total_gst": round(total_gst, 2),
            "cgst": total_cgst,
            "sgst": total_sgst,
            "grand_total": grand_total,
            "amount_paid": 0,
            "status": "unpaid",
            "payment_mode": "cash",
            "invoice_date": datetime.now().isoformat(),
        })

        db.insert("transactions", {
            "merchant_id": merchant_id,
            "amount": grand_total,
            "type": "income",
            "category": "Invoice",
            "customer_name": customer_name,
            "description": f"Invoice {invoice_number} - {customer_name}",
            "recorded_at": datetime.now().isoformat(),
            "source": "voice",
        })

        await realtime.emit_dashboard_refresh(merchant_id)

        return ActionResult(
            success=True,
            response_text=(
                f"Done! {customer_name} ka invoice {invoice_number} ban gaya. "
                f"Amount: Rs {subtotal:,.0f} + GST Rs {total_gst:,.0f} = Rs {grand_total:,.0f}."
            ),
            data={"invoice": invoice},
        )
    except Exception:
        logger.exception("Create invoice via voice failed")
        return ActionResult(False, "Invoice banana mein kuch gadbad ho gayi. Kripya dobara try karein.")


@_register("check_stock")
async def _check_stock(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    category = entities.get("category", "")
    item_name = entities.get("item_name", "") or entities.get("description", "")

    try:
        items = db.select("inventory", filters={"merchant_id": merchant_id})
    except Exception:
        return ActionResult(False, "Inventory data load nahi ho paya.")

    if not items:
        return ActionResult(True, "Abhi inventory mein koi item nahi hai.")

    search = (category or item_name).lower()
    if search:
        filtered = [
            i for i in items
            if search in (i.get("item_name", "") or "").lower()
            or search in (i.get("category", "") or "").lower()
        ]
    else:
        filtered = items

    if not filtered:
        return ActionResult(True, f"'{search}' se milta julta koi item nahi mila inventory mein.")

    if len(filtered) <= 5:
        lines = []
        for i in filtered:
            qty = i.get("current_qty", 0) or 0
            name = i.get("item_name", "Item")
            unit = i.get("unit", "pcs")
            reorder = i.get("reorder_level", 0) or 0
            status = "LOW!" if qty <= reorder else "OK"
            lines.append(f"- {name}: {qty} {unit} [{status}]")
        detail = "; ".join(lines)
        return ActionResult(
            success=True,
            response_text=f"Stock status: {detail}. Total {len(filtered)} items.",
            data={"items": filtered, "count": len(filtered)},
        )
    else:
        total_value = sum((i.get("current_qty", 0) or 0) * (i.get("cost_price", 0) or 0) for i in filtered)
        low = [i for i in filtered if (i.get("current_qty", 0) or 0) <= (i.get("reorder_level", 0) or 0)]
        return ActionResult(
            success=True,
            response_text=(
                f"Total {len(filtered)} items inventory mein hain. "
                f"Stock value: Rs {total_value:,.0f}. "
                f"{len(low)} items low stock mein hain."
            ),
            data={"count": len(filtered), "low_stock": len(low), "total_value": total_value},
        )


# ---------------------------------------------------------------------------
# Fallback / Greeting
# ---------------------------------------------------------------------------

@_register("greeting")
async def _greeting(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    return ActionResult(
        success=True,
        response_text="Namaste! Main Munim hoon, aapka AI munshi. Batayiye, kya karna hai?",
    )


@_register("help")
async def _help(merchant_id: str, entities: dict[str, Any]) -> ActionResult:
    return ActionResult(
        success=True,
        response_text=(
            "Main yeh sab kar sakta hoon: income ya kharcha record karna, "
            "udhari likhna, udhari wapas lena, aaj ki summary, "
            "balance check, ya reminder bhejna. Boliye kya karein?"
        ),
    )
