"""
MunimAI Master Agent — LangGraph Multi-Agent Orchestration

The Master Agent is the "Muneem personality" that:
1. Receives NLU output (intent + entities)
2. Routes to the correct specialist agent
3. Coordinates multi-step workflows
4. Generates the final Hindi response
5. Manages approval gates (auto vs ask-merchant)

Constitutional AI Guardrails:
- RBI Fair Practices Code compliance for collection messages
- No threatening language in any communication
- Financial advice disclosures
- Data privacy compliance
"""

from typing import Optional
from groq import AsyncGroq

from config import get_settings

settings = get_settings()

# Muneem personality prompt
MUNEEM_PERSONALITY = """You are MunimAI (मुनीम AI), the digital muneem (bookkeeper) for Indian small businesses.

PERSONALITY:
- You are respectful, always use "ji" suffix (e.g., "Sunita ji")
- You speak Hindi mixed with common English business terms
- You are proactive — you don't just answer, you suggest actions
- You are concise — shopkeepers are busy
- You use business metaphors, not financial jargon
- You are warm but professional, like a trusted family accountant
- You use the merchant's name in conversation

RULES:
- Always respond in Hindi (Devanagari script with English numbers)
- Keep responses under 150 words
- Include specific numbers (Rs amounts, percentages, dates)
- When suggesting actions, be specific ("3 udhari reminders bhejein" not "kuch karein")
- For financial advice, add disclaimer: "ye suggestion hai, final decision aapka hai"
- Never share debtor data with other people
- RBI compliant: no threatening language about collections

RESPONSE FORMAT:
- Start with acknowledgment of what was done
- Then give current status/summary if relevant
- End with a suggestion or next step if applicable"""


async def generate_response(
    intent: str,
    entities: dict,
    action_result: dict,
    merchant_name: str = "Sunita ji",
    context: dict = None,
) -> str:
    """
    Generate the Master Agent's Hindi response after an action is completed.

    Args:
        intent: The classified intent
        entities: Extracted entities
        action_result: What the action router did (DB writes, calculations, etc.)
        merchant_name: Merchant's name for personalization
        context: Additional context (today's P&L, pending udhari, etc.)

    Returns:
        Hindi response text for WhatsApp/TTS
    """
    context = context or {}

    context_str = ""
    if context:
        context_str = f"""
Current context:
- Today's income: Rs {context.get('today_income', 0):,.0f}
- Today's expense: Rs {context.get('today_expense', 0):,.0f}
- Today's profit: Rs {context.get('today_profit', 0):,.0f}
- Profit margin: {context.get('profit_margin', 0):.1f}%
- Pending udhari: Rs {context.get('total_udhari', 0):,.0f}
- PayScore: {context.get('payscore', 0)}
"""

    action_summary = ""
    if action_result:
        action_summary = f"""
Action taken:
- Type: {action_result.get('action_type', 'unknown')}
- Details: {action_result.get('description', '')}
- Amount: Rs {action_result.get('amount', 0):,.0f}
- Person: {action_result.get('person', '')}
"""

    user_message = f"""Intent: {intent}
Original voice command entities: {entities}

{action_summary}
{context_str}

Generate a response for {merchant_name} confirming the action and giving relevant context."""

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": MUNEEM_PERSONALITY},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Master Agent Error: {e}")
        return _fallback_response(intent, entities, action_result)


def _fallback_response(intent: str, entities: dict, action_result: dict) -> str:
    """Fallback Hindi responses when LLM is unavailable"""
    amount = entities.get("amount", 0)
    person = entities.get("person", "")

    fallbacks = {
        "CASH_RECEIVED": f"Rs {amount:,.0f} income note kar liya. 💰",
        "EXPENSE_LOG": f"Rs {amount:,.0f} kharcha mein daal diya. 📝",
        "UDHARI_CREATE": f"{person} ka Rs {amount:,.0f} udhari note kar liya. Remind karoonga. 📋",
        "UDHARI_SETTLE": f"{person} ne Rs {amount:,.0f} wapas kar diya! Udhari settle. ✅",
        "QUERY_SUMMARY": "Aaj ka hisaab tayyar hai. Dashboard pe dekhiye. 📊",
        "QUERY_PROFIT": "Profit ka hisaab dashboard pe update ho gaya. 📈",
        "QUERY_EXPENSE": "Kharcha ka breakdown dashboard pe hai. 📉",
        "COMMAND_REMIND": "Reminders bhej diye! Paytm link bhi include hai. 📤",
        "COMMAND_GST": "GST ka status update ho gaya. Dashboard pe dekhiye. 📋",
        "GENERAL": "Ji, main sun raha hoon. Kaise madad kar sakta hoon? 🙏",
    }
    return fallbacks.get(intent, "Note kar liya. 👍")


async def generate_morning_briefing(
    merchant_name: str,
    yesterday_data: dict,
    alerts: list[str],
    payscore: int,
    udhari_due_today: list[dict],
    gst_status: dict = None,
) -> str:
    """
    Generate the daily morning WhatsApp briefing.

    This is the "digital muneem's" daily report to the merchant.
    """
    alerts_text = "\n".join(f"• {a}" for a in alerts) if alerts else "Koi special alert nahi hai aaj."

    udhari_text = ""
    if udhari_due_today:
        total_due = sum(u.get("remaining", u["amount"] - u.get("amount_paid", 0)) for u in udhari_due_today)
        names = ", ".join(u["debtor_name"] for u in udhari_due_today[:3])
        udhari_text = f"📝 {len(udhari_due_today)} udhari due hain aaj (Rs {total_due:,.0f}): {names}"
        if len(udhari_due_today) > 3:
            udhari_text += f" aur {len(udhari_due_today) - 3} aur"

    gst_text = ""
    if gst_status and gst_status.get("status") in ("pending", "ready"):
        days_left = gst_status.get("days_remaining", 0)
        gst_text = f"📋 GSTR-3B {days_left} din mein due hai — {gst_status.get('status', 'pending')}"

    prompt = f"""Generate a Hindi morning briefing WhatsApp message for {merchant_name}.

Yesterday's data:
- Income: Rs {yesterday_data.get('income', 0):,.0f}
- Expense: Rs {yesterday_data.get('expense', 0):,.0f}
- Profit: Rs {yesterday_data.get('profit', 0):,.0f}
- Margin: {yesterday_data.get('margin', 0):.1f}%
- Income change vs day before: {yesterday_data.get('income_change', 'N/A')}

Today's alerts:
{alerts_text}

Udhari due:
{udhari_text}

GST:
{gst_text}

PayScore: {payscore}

Format it as a WhatsApp message with emojis and clear sections. Keep it under 200 words.
End with an encouraging line and "Reply karein ya voice note bhejein! 🎤" """

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": MUNEEM_PERSONALITY},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=400,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        # Fallback static briefing
        return f"""Namaste {merchant_name}! 🙏

Kal ka hisaab:
📈 Sale: Rs {yesterday_data.get('income', 0):,.0f}
📉 Kharcha: Rs {yesterday_data.get('expense', 0):,.0f}
💰 Munafa: Rs {yesterday_data.get('profit', 0):,.0f} ({yesterday_data.get('margin', 0):.0f}% margin)

Aaj ke alerts:
{alerts_text}

{udhari_text}
{gst_text}

PayScore: {payscore} 💳

Reply karein ya voice note bhejein! 🎤"""


# ============================================
# INTENT ROUTING MAP
# ============================================

INTENT_ROUTING = {
    "CASH_RECEIVED": {
        "specialist": "action_router",
        "action": "create_income_transaction",
        "auto_approve": True,
    },
    "EXPENSE_LOG": {
        "specialist": "action_router",
        "action": "create_expense_transaction",
        "auto_approve": True,
    },
    "UDHARI_CREATE": {
        "specialist": "action_router",
        "action": "create_udhari",
        "auto_approve": True,
        "follow_up": "collection_agent",  # Schedule collection after creating
    },
    "UDHARI_SETTLE": {
        "specialist": "action_router",
        "action": "settle_udhari",
        "auto_approve": True,
        "follow_up": "payscore_agent",  # Recalculate score after collection
    },
    "QUERY_SUMMARY": {
        "specialist": "cashflow_agent",
        "action": "get_today_summary",
        "auto_approve": True,
    },
    "QUERY_PROFIT": {
        "specialist": "action_router",
        "action": "get_profit",
        "auto_approve": True,
    },
    "QUERY_EXPENSE": {
        "specialist": "action_router",
        "action": "get_expense_breakdown",
        "auto_approve": True,
    },
    "QUERY_CUSTOMER": {
        "specialist": "customer_agent",
        "action": "get_customer_info",
        "auto_approve": True,
    },
    "COMMAND_REMIND": {
        "specialist": "collection_agent",
        "action": "send_reminders",
        "auto_approve": False,  # Ask merchant before sending
    },
    "COMMAND_GST": {
        "specialist": "gst_agent",
        "action": "process_gst_command",
        "auto_approve": False,
    },
    "PAYMENT_TAG": {
        "specialist": "action_router",
        "action": "tag_last_payment",
        "auto_approve": True,
    },
    "GENERAL": {
        "specialist": "master_llm",
        "action": "conversational_response",
        "auto_approve": True,
    },
}


def get_routing(intent: str) -> dict:
    """Get the routing configuration for an intent"""
    return INTENT_ROUTING.get(intent, INTENT_ROUTING["GENERAL"])
