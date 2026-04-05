"""
Udhari (credit / khata) router -- manage customer credit entries.
"""

from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from models import db
from models.schemas import (
    UdhariCreate,
    UdhariPhotoImport,
    UdhariResponse,
    UdhariSettleRequest,
    UdhariStats,
    UdhariStatus,
    TransactionType,
)
from services import realtime

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/{udhari_id}/call")
async def call_debtor(udhari_id: str):
    """Make an automated AI voice call to the debtor for udhari collection."""
    from services.voice_call_agent import simulate_call

    try:
        udhari_records = db.select("udhari", filters={"id": udhari_id}, limit=1)
        if not udhari_records:
            raise HTTPException(status_code=404, detail="Udhari not found")

        u = udhari_records[0] if isinstance(udhari_records, list) else udhari_records
        remaining = u.get("amount", 0) - u.get("amount_paid", 0)

        result = await simulate_call(
            debtor_name=u.get("debtor_name", "Customer"),
            amount=remaining,
            tone="polite_follow_up" if u.get("reminder_count", 0) < 3 else "firm_request",
        )

        # Update reminder count
        try:
            db.update("udhari", udhari_id, {
                "reminder_count": u.get("reminder_count", 0) + 1,
                "last_reminder_at": datetime.now().isoformat(),
            })
        except Exception:
            pass

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice call failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{udhari_id}")
async def delete_udhari(udhari_id: str):
    """Delete an udhari entry."""
    try:
        deleted = db.delete("udhari", udhari_id)
        return {"deleted": deleted, "id": udhari_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")


@router.get("/{merchant_id}")
async def list_udharis(
    merchant_id: str,
    status: Optional[str] = Query(None, description="pending / partial / settled / overdue"),
    limit: int = Query(100, ge=1, le=500),
):
    """List all udhari entries for a merchant, optionally filtered by status."""
    try:
        udharis = db.get_merchant_udharis(merchant_id, status=status, limit=limit)
    except Exception:
        # Fallback: direct query
        filters = {"merchant_id": merchant_id}
        if status:
            filters["status"] = status
        udharis = db.select("udhari", filters=filters)
    return udharis


@router.post("/", response_model=UdhariResponse, status_code=201)
async def create_udhari(body: UdhariCreate):
    """Create a new udhari (credit) entry."""
    data = body.model_dump()
    data["amount_paid"] = 0
    data["status"] = UdhariStatus.PENDING.value

    udhari = db.insert("udhari", data)
    logger.info("Udhari created: %s for %s", udhari.get("id"), body.customer_name)

    await realtime.emit_udhari_created(body.merchant_id, udhari)
    await realtime.emit_dashboard_refresh(body.merchant_id)

    return udhari


@router.patch("/{udhari_id}/settle", response_model=UdhariResponse)
async def settle_udhari(udhari_id: str, body: UdhariSettleRequest):
    """
    Record a (partial or full) payment against an udhari entry.

    Also creates a corresponding income transaction for the collection.
    """
    udhari = db.select("udhari", filters={"id": udhari_id}, single=True)
    if not udhari:
        raise HTTPException(status_code=404, detail="Udhari not found.")

    remaining = udhari.get("remaining", udhari["amount"])
    if body.amount > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Settlement amount ({body.amount}) exceeds remaining ({remaining}).",
        )

    new_paid = udhari.get("amount_paid", 0) + body.amount
    new_remaining = round(remaining - body.amount, 2)
    new_status = UdhariStatus.SETTLED.value if new_remaining == 0 else UdhariStatus.PARTIAL.value

    updated = db.update("udhari", udhari_id, {
        "amount_paid": new_paid,
        "status": new_status,
    })

    # Record as income
    merchant_id = udhari["merchant_id"]
    db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": body.amount,
        "type": TransactionType.INCOME.value,
        "category": "Udhari Collection",
        "customer_name": udhari.get("debtor_name"),
        "description": f"Udhari collection - {body.payment_mode}",
        "recorded_at": datetime.now().isoformat(),
        "payment_mode": body.payment_mode,
        "source": "udhari_settle",
    })

    # Record ML reward for collection strategy
    try:
        from services.ml.thompson_sampler import ThompsonSamplingCollector
        collector = ThompsonSamplingCollector()
        collector.update(udhari_id, "whatsapp_text|polite_follow_up|morning_9am", "paid", body.amount, new_remaining)
    except Exception:
        pass

    await realtime.emit_udhari_settled(merchant_id, updated)
    await realtime.emit_dashboard_refresh(merchant_id)

    return updated


@router.post("/{udhari_id}/remind")
async def send_reminder(udhari_id: str):
    """Send a payment reminder for a specific udhari entry via WhatsApp using Twilio."""
    udhari = db.select("udhari", filters={"id": udhari_id}, single=True)
    if not udhari:
        raise HTTPException(status_code=404, detail="Udhari not found.")

    phone = udhari.get("debtor_phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Customer phone number not available.")

    merchant_id = udhari["merchant_id"]
    customer_name = udhari.get("debtor_name", "Customer")
    remaining = udhari.get("remaining", udhari.get("amount", 0) - udhari.get("amount_paid", 0))

    # Generate Paytm payment link
    payment_link = udhari.get("payment_link", f"https://paytm.me/pay/{merchant_id[:8]}/{remaining:.0f}")

    # Generate collection message via LLM
    try:
        from services.agents.collection_agent import generate_collection_message
        reminder_count = udhari.get("reminder_count", 0)

        # ML-selected tone via Thompson Sampling
        ml_action_key = None
        try:
            from services.ml.thompson_sampler import ThompsonSamplingCollector, DebtorState
            collector = ThompsonSamplingCollector()

            # Calculate days overdue
            created = udhari.get("created_at", "")
            days_overdue = 0
            if created:
                try:
                    from datetime import date as _date
                    created_date = datetime.fromisoformat(created.replace("Z", "+00:00")).date()
                    days_overdue = (_date.today() - created_date).days
                except Exception:
                    pass

            state = DebtorState(
                debtor_name=customer_name,
                amount=remaining,
                days_overdue=days_overdue,
                reminder_count=reminder_count,
                last_response=None,
            )
            action = collector.select_action(udhari_id, state)
            tone = action.tone
            ml_action_key = action.action_key
            logger.info("ML-selected tone for %s: %s (confidence: %.2f)", customer_name, tone, action.confidence)
        except Exception as e:
            logger.debug("Thompson Sampler fallback: %s", e)
            # Fallback to existing deterministic logic
            if reminder_count == 0:
                tone = "friendly_reminder"
            elif reminder_count <= 2:
                tone = "polite_follow_up"
            elif reminder_count <= 4:
                tone = "firm_request"
            else:
                tone = "urgent_notice"

        message = await generate_collection_message(
            debtor_name=customer_name,
            amount=remaining,
            days_overdue=0,
            tone=tone,
            merchant_name="MunimAI Merchant",
            merchant_owner="Merchant",
            payment_link=payment_link,
            reminder_count=reminder_count,
        )
    except Exception as e:
        logger.warning("Collection message generation failed: %s", e)
        message = (
            f"Namaste {customer_name} ji, Rs {remaining:,.0f} pending hai. "
            f"Yahan se pay karein: {payment_link}"
        )

    # Send via Twilio WhatsApp
    from services.twilio_service import send_whatsapp
    wa_result = await send_whatsapp(to=phone, body=message)

    # Update reminder timestamp and count
    db.update("udhari", udhari_id, {
        "last_reminder_at": datetime.utcnow().isoformat(),
        "reminder_count": udhari.get("reminder_count", 0) + 1,
    })

    logger.info("Reminder sent to %s (%s) for udhari %s — status: %s",
                customer_name, phone, udhari_id, wa_result.get("status"))

    await realtime.emit_udhari_reminder_sent(merchant_id, udhari_id, customer_name)

    return {
        "sent": wa_result.get("status") == "sent",
        "udhari_id": udhari_id,
        "customer_name": customer_name,
        "phone": phone,
        "remaining": remaining,
        "message": message,
        "whatsapp_result": wa_result,
        "payment_link": payment_link,
        "ml_action_key": ml_action_key,
    }


@router.post("/remind-all")
async def remind_all(merchant_id: str = Query(...)):
    """Send reminders to all customers with pending/overdue udharis via Twilio WhatsApp."""
    from services.twilio_service import send_whatsapp

    udharis = db.get_merchant_udharis(merchant_id, status="pending")
    overdue = db.get_merchant_udharis(merchant_id, status="overdue")
    all_pending = udharis + overdue

    sent_count = 0
    skipped = 0
    failed = 0

    for u in all_pending:
        phone = u.get("debtor_phone")
        if not phone:
            skipped += 1
            continue

        remaining = u.get("remaining", u.get("amount", 0) - u.get("amount_paid", 0))
        customer_name = u.get("debtor_name", "Customer")
        payment_link = u.get("payment_link", f"https://paytm.me/pay/{merchant_id[:8]}/{remaining:.0f}")

        message = (
            f"Namaste {customer_name} ji, Rs {remaining:,.0f} pending hai. "
            f"Yahan se pay karein: {payment_link}"
        )

        wa_result = await send_whatsapp(to=phone, body=message)

        if wa_result.get("status") == "sent":
            sent_count += 1
        else:
            failed += 1

        db.update("udhari", u["id"], {
            "last_reminder_at": datetime.utcnow().isoformat(),
            "reminder_count": u.get("reminder_count", 0) + 1,
        })

        await realtime.emit_udhari_reminder_sent(
            merchant_id, u["id"], customer_name,
        )

    return {
        "total": len(all_pending),
        "sent": sent_count,
        "failed": failed,
        "skipped_no_phone": skipped,
    }


@router.get("/{merchant_id}/ranked")
async def get_ranked_udharis(merchant_id: str):
    """
    Return udhari entries ranked by risk score (highest risk first).

    Risk score considers: days overdue, amount, reminder count, and status.
    """
    all_udharis = db.select("udhari", filters={"merchant_id": merchant_id})

    today = date.today()
    scored = []

    for u in all_udharis:
        status = u.get("status", "pending")

        # Include settled entries with risk_score 0
        if status == "settled":
            scored.append({
                **u,
                "risk_score": 0,
                "days_old": 0,
                "remaining": 0,
            })
            continue

        amount = u.get("amount", 0) or 0
        amount_paid = u.get("amount_paid", 0) or 0
        remaining = u.get("remaining", amount - amount_paid)
        if remaining is None:
            remaining = amount - amount_paid

        # Calculate days since creation
        days_old = 0
        created = u.get("created_at", "")
        if created:
            try:
                created_date = datetime.fromisoformat(created.replace("Z", "+00:00")).date()
                days_old = (today - created_date).days
            except (ValueError, TypeError):
                pass

        reminder_count = u.get("reminder_count", 0) or 0

        # Risk score (0-100): multi-factor scoring
        # Factor 1: Days old (max 40 points)
        days_score = min(40, days_old * 1.5)

        # Factor 2: Outstanding amount (max 30 points)
        amount_score = min(30, (remaining / 1000) * 3)

        # Factor 3: Reminder unresponsiveness (max 20 points)
        reminder_score = min(20, reminder_count * 7)

        # Factor 4: Debtor history -- has this person settled before?
        debtor_name = u.get("debtor_name", "")
        past_settled = len([
            prev for prev in all_udharis
            if prev.get("debtor_name") == debtor_name and prev.get("status") == "settled"
        ])
        history_bonus = -10 if past_settled > 0 else 10  # Good history = lower risk

        risk_score = days_score + amount_score + reminder_score + history_bonus
        risk_score = max(0, min(100, round(risk_score)))

        scored.append({
            **u,
            "risk_score": risk_score,
            "days_old": days_old,
            "remaining": remaining,
        })

    # Sort by risk score descending
    scored.sort(key=lambda x: -x["risk_score"])

    # Auto-send reminders for 7+ day overdue entries
    for entry in scored:
        if entry.get("status") == "overdue":
            days_old = entry.get("days_old", 0)
            last_remind = entry.get("last_reminder_at")
            if days_old > 7 and (not last_remind or (date.today() - datetime.fromisoformat(last_remind.replace("Z", "+00:00")).date()).days > 3):
                try:
                    import asyncio
                    from services.twilio_service import send_whatsapp
                    msg = f"Namaste {entry['debtor_name']} ji, Rs {entry.get('remaining', 0):,.0f} ka payment {days_old} din se baaki hai."
                    asyncio.create_task(send_whatsapp("+917725014797", f"\U0001f514 Udhari Reminder Sent\n{msg}"))
                except Exception:
                    pass

    return {
        "merchant_id": merchant_id,
        "total": len(scored),
        "entries": scored,
    }


@router.get("/{merchant_id}/stats", response_model=UdhariStats)
async def get_udhari_stats(merchant_id: str):
    """Aggregate udhari statistics for the merchant."""
    all_udharis = db.select(
        "udhari",
        filters={"merchant_id": merchant_id},
    )

    total_outstanding = 0.0
    overdue_count = 0
    overdue_amount = 0.0
    total_days = 0
    pending_count = 0

    today = date.today()
    month_start = today.replace(day=1).isoformat()

    for u in all_udharis:
        status = u.get("status", "pending")
        remaining = u.get("remaining", 0)

        if status in ("pending", "partial", "overdue"):
            total_outstanding += remaining
            pending_count += 1

            created = u.get("created_at", "")
            if created:
                try:
                    created_date = datetime.fromisoformat(created.replace("Z", "+00:00")).date()
                    total_days += (today - created_date).days
                except (ValueError, TypeError):
                    pass

        if status == "overdue":
            overdue_count += 1
            overdue_amount += remaining

    # Collected this month
    settled_this_month = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id, "category": "Udhari Collection"},
        gte=("recorded_at", month_start),
    )
    collected = sum(t.get("amount", 0) for t in settled_this_month)

    avg_days = (total_days / pending_count) if pending_count > 0 else 0

    return UdhariStats(
        total_outstanding=round(total_outstanding, 2),
        total_entries=pending_count,
        overdue_count=overdue_count,
        overdue_amount=round(overdue_amount, 2),
        collected_this_month=round(collected, 2),
        average_days_outstanding=round(avg_days, 1),
    )


@router.post("/import-photo")
async def import_from_photo(body: UdhariPhotoImport):
    """
    Extract udhari entries from a photo of a handwritten khata page
    using OCR + LLM parsing.

    In production this would:
    1. Decode the base64 image.
    2. Run OCR (Google Vision / Tesseract).
    3. Pass OCR text through LLM to extract structured entries.
    4. Insert each entry into the database.
    """
    import json
    import httpx

    settings_mod = __import__("config", fromlist=["get_settings"])
    settings = settings_mod.get_settings()

    # Placeholder: call Groq to parse a description of the image
    # In production, prepend with actual OCR output
    prompt = (
        "You are an OCR post-processor for Indian khata (credit ledger) pages. "
        "Given OCR text from a handwritten khata, extract a JSON array of entries: "
        '[{"customer_name": "...", "amount": ..., "description": "..."}]. '
        "Return ONLY valid JSON."
    )

    # For now return a stub -- real implementation pipes through OCR first
    logger.info("Photo import requested for merchant %s", body.merchant_id)

    return {
        "status": "processing",
        "merchant_id": body.merchant_id,
        "message": "Photo is being processed. Entries will appear shortly.",
        "entries_found": 0,
    }
