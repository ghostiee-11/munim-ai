"""
Escalation Engine for Udhari Collection.

Determines the appropriate escalation level for overdue udhari entries
and executes the corresponding action (WhatsApp, SMS, voice call, merchant alert).

Escalation Levels:
  0 - WhatsApp polite reminder with Paytm payment link
  1 - WhatsApp firm message + SMS
  2 - Automated voice call
  3 - Alert merchant to handle personally
"""

import logging
from datetime import datetime
from typing import Optional

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


async def get_escalation_plan(udhari_entry: dict) -> dict:
    """
    Determine the escalation level based on days overdue, amount, and past reminders.

    Parameters
    ----------
    udhari_entry : dict
        Must contain: amount, amount_paid, created_at, reminder_count, status

    Returns
    -------
    dict with level, tone, channels, and reasoning.
    """
    remaining = udhari_entry.get("amount", 0) - udhari_entry.get("amount_paid", 0)
    reminder_count = udhari_entry.get("reminder_count", 0)
    status = udhari_entry.get("status", "pending")

    # Calculate days overdue
    days_overdue = 0
    created_at = udhari_entry.get("created_at")
    due_date = udhari_entry.get("due_date")

    if due_date:
        try:
            due = datetime.fromisoformat(str(due_date).replace("Z", "+00:00"))
            if due.tzinfo:
                days_overdue = (datetime.now(due.tzinfo) - due).days
            else:
                days_overdue = (datetime.now() - due).days
        except (ValueError, TypeError):
            pass

    if days_overdue <= 0 and created_at:
        try:
            created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
            if created.tzinfo:
                age_days = (datetime.now(created.tzinfo) - created).days
            else:
                age_days = (datetime.now() - created).days
            # Consider overdue if more than 7 days old
            days_overdue = max(0, age_days - 7)
        except (ValueError, TypeError):
            pass

    # Determine escalation level
    if reminder_count == 0 or days_overdue < 3:
        level = 0
        tone = "friendly_reminder"
        channels = ["whatsapp"]
        reasoning = "First reminder or recent entry — polite WhatsApp nudge"
    elif reminder_count <= 2 or days_overdue < 10:
        level = 1
        tone = "polite_follow_up"
        channels = ["whatsapp", "sms"]
        reasoning = f"Follow-up #{reminder_count + 1}, {days_overdue} days overdue"
    elif reminder_count <= 4 or days_overdue < 21:
        level = 1
        tone = "firm_request"
        channels = ["whatsapp", "sms"]
        reasoning = f"Firm request — {days_overdue} days overdue, {reminder_count} reminders sent"
    elif reminder_count <= 6 or days_overdue < 30:
        level = 2
        tone = "urgent_notice"
        channels = ["whatsapp", "sms", "voice"]
        reasoning = f"Urgent — {days_overdue} days, escalating to voice call"
    else:
        level = 3
        tone = "escalation_notice"
        channels = ["whatsapp", "merchant_alert"]
        reasoning = f"Final escalation — {days_overdue} days, {reminder_count} reminders. Alerting merchant."

    # High-amount entries escalate faster
    if remaining >= 10000 and level < 2:
        level = min(level + 1, 3)
        reasoning += f" (High amount Rs {remaining:,.0f} — escalated)"

    return {
        "level": level,
        "tone": tone,
        "channels": channels,
        "days_overdue": days_overdue,
        "reminder_count": reminder_count,
        "remaining_amount": remaining,
        "reasoning": reasoning,
    }


async def execute_escalation(
    merchant_id: str,
    udhari_id: str,
    udhari_entry: dict,
    level: Optional[int] = None,
) -> dict:
    """
    Execute the escalation action for an udhari entry.

    If level is not provided, it is determined automatically via get_escalation_plan.
    """
    from services.twilio_service import send_whatsapp, send_sms, make_voice_call
    from services.agents.collection_agent import generate_collection_message

    plan = await get_escalation_plan(udhari_entry)
    if level is not None:
        plan["level"] = level

    debtor_name = udhari_entry.get("debtor_name", "Customer")
    debtor_phone = udhari_entry.get("debtor_phone")
    remaining = plan["remaining_amount"]

    if not debtor_phone:
        return {
            "status": "skipped",
            "reason": "No phone number for debtor",
            "plan": plan,
        }

    # Generate Paytm payment link
    payment_link = udhari_entry.get("payment_link", f"https://paytm.me/pay/{merchant_id[:8]}/{remaining:.0f}")

    # Generate the collection message
    try:
        message = await generate_collection_message(
            debtor_name=debtor_name,
            amount=remaining,
            days_overdue=plan["days_overdue"],
            tone=plan["tone"],
            merchant_name="MunimAI Merchant",
            merchant_owner="Merchant",
            payment_link=payment_link,
            reminder_count=plan["reminder_count"],
        )
    except Exception:
        message = (
            f"Namaste {debtor_name} ji, Rs {remaining:,.0f} pending hai. "
            f"Yahan se pay karein: {payment_link}"
        )

    results = {"plan": plan, "actions": []}

    # Level 0: WhatsApp polite reminder
    if plan["level"] >= 0 and "whatsapp" in plan["channels"]:
        wa_result = await send_whatsapp(to=debtor_phone, body=message)
        results["actions"].append({"channel": "whatsapp", "result": wa_result})

    # Level 1: Also send SMS
    if plan["level"] >= 1 and "sms" in plan["channels"]:
        sms_body = f"{debtor_name} ji, Rs {remaining:,.0f} pending. Pay: {payment_link}"
        sms_result = await send_sms(to=debtor_phone, body=sms_body)
        results["actions"].append({"channel": "sms", "result": sms_result})

    # Level 2: Voice call
    if plan["level"] >= 2 and "voice" in plan["channels"]:
        twiml = f"""<Response>
            <Say language="hi-IN" voice="Polly.Aditi">
                Namaste {debtor_name} ji! Yeh ek zaroori message hai.
                Rs {remaining:,.0f} ka payment pending hai.
                Kripya jaldi se jaldi bhej dijiye.
                Payment link SMS mein bheja gaya hai. Dhanyavaad.
            </Say>
        </Response>"""
        call_result = await make_voice_call(to=debtor_phone, twiml=twiml)
        results["actions"].append({"channel": "voice", "result": call_result})

    # Level 3: Alert merchant
    if plan["level"] >= 3 and "merchant_alert" in plan["channels"]:
        from services import realtime
        await realtime.emit_alert(merchant_id, {
            "alert_type": "collection_escalation",
            "severity": "critical",
            "message": f"{debtor_name} owes Rs {remaining:,.0f} — {plan['days_overdue']} days overdue, {plan['reminder_count']} reminders sent. Please follow up personally.",
            "udhari_id": udhari_id,
            "debtor_name": debtor_name,
            "debtor_phone": debtor_phone,
            "amount": remaining,
        })
        results["actions"].append({"channel": "merchant_alert", "result": {"status": "emitted"}})

    results["status"] = "executed"
    results["message_sent"] = message
    return results
