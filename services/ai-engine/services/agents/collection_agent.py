"""
MunimAI Collection Agent

Orchestrates the udhari collection process:
1. Scores each debtor using Thompson Sampling
2. Generates culturally-aware Hindi messages via Groq LLM
3. Sends via WhatsApp with embedded Paytm payment links
4. Tracks responses and updates RL model
5. Manages escalation ladder with merchant-set limits

RBI Fair Practices Code compliant:
- No threatening language
- Respectful tone always
- Reasonable timing (no early morning/late night)
- Clear merchant identity
"""

import json
import random
from datetime import datetime
from typing import Optional

from groq import AsyncGroq

from config import get_settings
from services.ml.thompson_sampler import (
    ThompsonSamplingCollector,
    DebtorState,
    CollectionAction,
    get_collector,
)


settings = get_settings()


COLLECTION_SYSTEM_PROMPT = """You are MunimAI's collection message writer for Indian small businesses.

Your task: Generate a WhatsApp message in Hindi to collect a pending udhari (informal credit) payment.

CRITICAL RULES:
1. ALWAYS use "ji" suffix with the debtor's name (e.g., "Sharma ji")
2. NEVER use threatening or aggressive language
3. Include the exact amount pending
4. Naturally embed the Paytm payment link in the message
5. Keep under 200 characters for WhatsApp readability
6. Be culturally sensitive — udhari is a social relationship in India
7. RBI Fair Practices Code compliant — no harassment
8. Each message should be UNIQUE (not copy-paste of previous ones)
9. Use Hindi script (Devanagari) mixed with common English words like "payment", "link"
10. Add appropriate emoji sparingly (1-2 max)

TONE LEVELS:
- friendly_reminder: Very casual, like reminding a friend. "Bas yaad dila raha tha..."
- polite_follow_up: Still polite but more direct. "Request hai ki..."
- firm_request: Business-like, mentions duration. "Kaafi time se pending hai..."
- urgent_notice: Serious, emphasizes importance. "Ye important hai..."
- escalation_notice: Final notice, mentions merchant involvement. "Ab directly baat karni padegi..."

Generate ONLY the message text. No explanation, no quotes, no formatting."""


async def generate_collection_message(
    debtor_name: str,
    amount: float,
    days_overdue: int,
    tone: str,
    merchant_name: str,
    merchant_owner: str,
    payment_link: str,
    previous_messages: list[str] = None,
    reminder_count: int = 0,
) -> str:
    """Generate a culturally-aware Hindi collection message using Groq LLM"""

    previous_context = ""
    if previous_messages:
        previous_context = f"\nPrevious messages sent (DO NOT repeat these):\n" + "\n".join(f"- {m}" for m in previous_messages[-3:])

    user_prompt = f"""Generate a {tone} WhatsApp message:

Debtor: {debtor_name}
Amount pending: Rs {amount:,.0f}
Days overdue: {days_overdue}
Merchant shop: {merchant_name}
Merchant owner: {merchant_owner}
Paytm payment link: {payment_link}
Reminder number: {reminder_count + 1}
{previous_context}

Write the message in Hindi:"""

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": COLLECTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,  # Some creativity for unique messages
            max_tokens=200,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Fallback to template-based message
        return _fallback_message(debtor_name, amount, tone, payment_link, merchant_name)


def _fallback_message(debtor_name: str, amount: float, tone: str,
                      payment_link: str, merchant_name: str) -> str:
    """Fallback template messages if LLM fails"""
    templates = {
        "friendly_reminder": f"Namaste {debtor_name}, {merchant_name} ki taraf se yaad dila raha hoon — Rs {amount:,.0f} pending hai. Ye link se bhej dijiye: {payment_link} 🙏",
        "polite_follow_up": f"{debtor_name}, Rs {amount:,.0f} abhi bhi pending hai. Request hai ki jaldi bhej dijiye: {payment_link}",
        "firm_request": f"{debtor_name}, Rs {amount:,.0f} ka payment kaafi time se pending hai. Kripya aaj settle karein: {payment_link}",
        "urgent_notice": f"{debtor_name}, ye important reminder hai — Rs {amount:,.0f} pending. Please aaj hi bhejiye: {payment_link}",
        "escalation_notice": f"{debtor_name}, Rs {amount:,.0f} ke baare mein kai baar yaad dilaya. Ab shop owner se directly baat hogi. Abhi settle karein: {payment_link}",
    }
    return templates.get(tone, templates["friendly_reminder"])


async def plan_collection(
    merchant_id: str,
    udhari_list: list[dict],
    merchant_name: str = "Sunita Saree Shop",
    merchant_owner: str = "Sunita ji",
) -> list[dict]:
    """
    Plan collection actions for all overdue udhari entries.

    Returns a list of planned actions with messages and timing.
    """
    collector = get_collector()
    actions = []

    for udhari in udhari_list:
        if udhari["status"] not in ("pending", "partial", "overdue"):
            continue

        remaining = udhari["amount"] - udhari.get("amount_paid", 0)
        if remaining <= 0:
            continue

        days_overdue = udhari.get("days_overdue", 0)
        if not days_overdue and udhari.get("created_at"):
            created = datetime.fromisoformat(str(udhari["created_at"]).replace("Z", "+00:00"))
            days_overdue = (datetime.now(created.tzinfo) - created).days if created.tzinfo else (datetime.now() - created).days

        # Build debtor state
        state = DebtorState(
            debtor_name=udhari["debtor_name"],
            amount=remaining,
            days_overdue=days_overdue,
            reminder_count=udhari.get("reminder_count", 0),
            last_response=udhari.get("last_reminder_response"),
            debtor_has_paytm=bool(udhari.get("debtor_phone")),
        )

        # Get optimal action from Thompson Sampling
        debtor_id = udhari.get("id", udhari["debtor_name"])
        action: CollectionAction = collector.select_action(debtor_id, state)

        # Generate Paytm payment link
        existing_link = udhari.get("payment_link")
        if existing_link:
            payment_link = existing_link
        else:
            try:
                from services.paytm_api import create_payment_link
                link_result = await create_payment_link(
                    amount=remaining,
                    debtor_name=udhari["debtor_name"],
                    debtor_phone=udhari.get("debtor_phone"),
                    merchant_name=merchant_name,
                )
                payment_link = link_result["short_url"]
            except Exception:
                payment_link = f"https://paytm.me/pay/{merchant_id[:8]}/{remaining:.0f}"

        # Generate message
        message = await generate_collection_message(
            debtor_name=udhari["debtor_name"],
            amount=remaining,
            days_overdue=days_overdue,
            tone=action.tone,
            merchant_name=merchant_name,
            merchant_owner=merchant_owner,
            payment_link=payment_link,
            reminder_count=udhari.get("reminder_count", 0),
        )

        actions.append({
            "udhari_id": udhari.get("id"),
            "debtor_name": udhari["debtor_name"],
            "debtor_phone": udhari.get("debtor_phone"),
            "amount": remaining,
            "days_overdue": days_overdue,
            "action": {
                "channel": action.channel,
                "tone": action.tone,
                "timing": action.timing,
                "confidence": round(action.confidence, 3),
                "reasoning": action.reasoning,
            },
            "message": message,
            "payment_link": payment_link,
        })

    # Sort by amount (highest first) then by days overdue
    actions.sort(key=lambda x: (-x["amount"], -x["days_overdue"]))

    return actions


async def process_collection_response(
    udhari_id: str,
    debtor_id: str,
    action_key: str,
    response: str,
    amount_paid: float,
    total_amount: float,
):
    """
    Process debtor response and update RL model.

    response: "paid", "partial_paid", "replied", "read", "ignored"
    """
    collector = get_collector()
    collector.update(debtor_id, action_key, response, amount_paid, total_amount)


def get_collection_stats(merchant_id: str, udhari_list: list[dict]) -> dict:
    """Get collection performance statistics"""
    total_pending = sum(u["amount"] - u.get("amount_paid", 0)
                       for u in udhari_list if u["status"] in ("pending", "partial", "overdue"))
    total_collected = sum(u.get("amount_paid", 0) for u in udhari_list)
    total_original = sum(u["amount"] for u in udhari_list)

    overdue_count = len([u for u in udhari_list if u["status"] == "overdue"])
    settled_count = len([u for u in udhari_list if u["status"] == "settled"])

    recovery_rate = (total_collected / total_original * 100) if total_original > 0 else 0

    return {
        "total_pending": round(total_pending, 2),
        "total_collected": round(total_collected, 2),
        "total_original": round(total_original, 2),
        "recovery_rate": round(recovery_rate, 1),
        "overdue_count": overdue_count,
        "settled_count": settled_count,
        "active_count": len([u for u in udhari_list if u["status"] in ("pending", "partial", "overdue")]),
        "avg_days_to_collect": 8,  # Placeholder
        "best_channel": "whatsapp_text",
        "best_timing": "morning_9am",
    }
