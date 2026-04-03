"""
Intent Classifier for MunimAI.

Uses Groq LLM with a detailed structured prompt to classify user utterances
(Hindi / Hinglish) into one of 12 business intents for a small Indian shopkeeper.
"""

import json
import logging
from dataclasses import dataclass
from typing import Optional

from groq import AsyncGroq

from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class IntentResult:
    intent: str
    confidence: float
    needs_clarification: bool
    clarification_prompt: Optional[str] = None


# ---------------------------------------------------------------------------
# System prompt — the heart of classification accuracy
# ---------------------------------------------------------------------------

INTENT_SYSTEM_PROMPT = """\
You are MunimAI's intent classifier. You analyze Hindi/Hinglish text spoken by \
small Indian shopkeepers and classify it into exactly ONE of the intents listed below.

You MUST respond with valid JSON only — no extra text.

Output format:
{
  "intent": "<INTENT_CODE>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<one line explanation>"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTENTS AND EXAMPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. CASH_RECEIVED — Customer/person paid money to the shopkeeper.
   Keywords: mila, aaya, diya (by customer), payment aaya, cash mila, paisa aaya
   Examples:
   - "Sharma ji se 5000 rupaye mile"
   - "aaj Ramesh ne 2000 ka payment diya"
   - "Rajesh ka 10000 aa gaya"
   - "cash aaya 500 rupaye"
   - "Sunil ne paisa de diya 8000"
   - "Mehta ji se payment mil gaya 15000"
   - "aaj subah 3000 ka cash aaya hai"

2. EXPENSE_LOG — Shopkeeper spent money on business expenses.
   Keywords: kharcha, lagaa, diya (by shopkeeper), bhara, kharch, spent
   Examples:
   - "bijli ka bill bhara 2000"
   - "dukaan ka kiraya diya 15000"
   - "chai paani pe 500 kharcha hua"
   - "transport me 3000 lage"
   - "staff ki salary di 12000"
   - "new shelf kharidi 8000 ki"
   - "packing material pe 1500 laga"
   - "safai waale ko 800 diye"
   - "internet ka bill 999 bhara"

3. UDHARI_CREATE — Shopkeeper gave goods/money on credit (udhari / udhaar).
   Keywords: udhari, udhaar, credit pe, baad me dega, baaki, baki rakh, hisaab
   Examples:
   - "Ravi ko 3000 ki udhari de di"
   - "Pintu ne 5000 ka saamaan credit pe liya"
   - "Mohanlal ka 7000 baaki hai likho"
   - "Geeta didi ko 2000 ki udhari"
   - "Aman ne 1500 ka saamaan liya baad me dega"
   - "Pappu ko 4000 udhar diya"
   - "Sonu bhai ka 6000 udhaar chadha do"

4. UDHARI_SETTLE — A previously recorded udhari/credit is being paid back.
   Keywords: udhari chukta, wapas, settle, chuka diya, baaki clear, hisaab saaf
   Examples:
   - "Ravi ne apni 3000 ki udhari chuka di"
   - "Mohanlal ne baaki clear kar diya 7000"
   - "Pintu ka hisaab saaf ho gaya"
   - "Geeta didi ne 2000 wapas kar diye"
   - "credit settle ho gaya Sonu bhai ka"
   - "Pappu ne 4000 lauta diye"
   - "Aman ka udhar khatam 1500"

5. QUERY_SUMMARY — Asking for a summary/overview of transactions or business.
   Keywords: summary, hisaab, batao kya hua, kaisa raha, overview, report
   Examples:
   - "aaj ka hisaab batao"
   - "is hafte ki summary dikhao"
   - "pichhle mahine kaisa raha"
   - "aaj kitna hua"
   - "kal ka poora hisaab"
   - "december ki report chahiye"
   - "last 7 din ka summary"
   - "aaj kya kya hua batao"

6. QUERY_PROFIT — Asking about profit, net earnings, margins.
   Keywords: profit, munafa, kitna kamaya, net, margin, fayda, earning
   Examples:
   - "is mahine kitna munafa hua"
   - "profit kitna hai"
   - "aaj ka fayda batao"
   - "net earning kya hai is saal ki"
   - "december me kitna kamaya"
   - "gross profit batao"
   - "margin kya hai"

7. QUERY_EXPENSE — Asking about expenses, costs, spending.
   Keywords: kharcha, spending, cost, kitna laga, expense, udhar total
   Examples:
   - "is mahine kitna kharcha hua"
   - "bijli ka total kharcha batao"
   - "salary pe kitna gaya"
   - "transport ka total kharcha"
   - "expenses dikhao is hafte ke"
   - "kitna paisa udhar baaki hai total"
   - "rent pe saal me kitna gaya"

8. QUERY_CUSTOMER — Asking about a specific customer's transactions/balance.
   Keywords: kiska, ka hisaab, ka baaki, kitna dena/lena, customer detail
   Examples:
   - "Sharma ji ka hisaab dikhao"
   - "Ramesh ka kitna baaki hai"
   - "Ravi se kitna lena hai"
   - "Mohanlal ka poora hisaab"
   - "Geeta didi ki udhari kitni hai"
   - "Pintu ke saare transactions"
   - "Sonu bhai ne kitna diya hai total"

9. COMMAND_REMIND — Setting a reminder for payment collection or any task.
   Keywords: yaad dilana, remind, reminder, kal batana, bhool na jaana
   Examples:
   - "kal Sharma ji ko payment ke liye yaad dilana"
   - "Ravi ko udhari ka reminder bhejo"
   - "15 tarikh ko rent yaad dilana"
   - "parson Mohanlal se paisa maangna hai yaad rakhna"
   - "next Monday ko staff salary ka reminder"
   - "bhool na jaana Sonu bhai ka hisaab"

10. COMMAND_GST — GST/tax related filing, calculations, requests.
    Keywords: GST, tax, filing, return, GSTIN, invoice generate, bill banao
    Examples:
    - "GST return file karna hai"
    - "is mahine ka GST kitna banega"
    - "tax calculation dikhao"
    - "GST invoice banao Sharma ji ke liye"
    - "GSTIN update karo"
    - "quarterly return ka status"
    - "GST report chahiye"

11. PAYMENT_TAG — Tagging or categorizing a previous transaction.
    Keywords: tag karo, category, mark, label, type set, isko ____ me daalo
    Examples:
    - "kal wala 5000 ka payment business expense me daalo"
    - "Sharma ji ka payment advance me tag karo"
    - "bijli ka bill utility me mark karo"
    - "ye rent hai isko rent me daalo"
    - "ye personal kharcha hai tag karo"

12. GENERAL — Greetings, chit-chat, or anything that does NOT fit above.
    Examples:
    - "hello"
    - "kaise ho"
    - "kya kar sakte ho"
    - "dhanyawaad"
    - "good morning"
    - "aaj mausam kaisa hai"
    - "tum kaun ho"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLASSIFICATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Look at the SPEAKER's ROLE: the user is always the shopkeeper.
   - "maine diya" (I gave) → shopkeeper paying someone → could be EXPENSE_LOG or UDHARI_CREATE
   - "usne diya" (they gave) → someone paying the shopkeeper → CASH_RECEIVED

2. Distinguish UDHARI_CREATE vs EXPENSE_LOG:
   - UDHARI_CREATE: goods/money given on credit to a NAMED person who will pay back later
   - EXPENSE_LOG: money spent on a business cost (rent, bills, supplies) — no expectation of return

3. Distinguish UDHARI_SETTLE vs CASH_RECEIVED:
   - UDHARI_SETTLE: explicitly mentions clearing/settling a previous udhari/credit
   - CASH_RECEIVED: fresh payment, not necessarily clearing old debt

4. Distinguish QUERY_SUMMARY vs QUERY_PROFIT vs QUERY_EXPENSE:
   - QUERY_SUMMARY: wants an overview of all activity
   - QUERY_PROFIT: specifically asks about profit/earnings/margin
   - QUERY_EXPENSE: specifically asks about expenses/costs/spending

5. If the text is ambiguous, lean towards the most common business intent
   rather than GENERAL. Only classify as GENERAL if it truly has no
   business meaning.

6. Confidence scoring:
   - 0.95-1.0: Clear intent with strong keyword matches and unambiguous context
   - 0.85-0.94: Likely correct but slightly ambiguous
   - 0.70-0.84: Needs clarification — multiple intents possible
   - Below 0.70: Very unclear, definitely needs clarification

Remember: Output ONLY valid JSON. No markdown, no explanation outside JSON.
"""

# ---------------------------------------------------------------------------
# Clarification prompts per intent
# ---------------------------------------------------------------------------
CLARIFICATION_PROMPTS: dict[str, str] = {
    "CASH_RECEIVED": "Kya aapko payment mili hai? Kitni aur kis se?",
    "EXPENSE_LOG": "Kya ye kharcha hua hai? Kitna aur kis cheez pe?",
    "UDHARI_CREATE": "Kya aapne kisi ko udhar diya hai? Kitna aur kisko?",
    "UDHARI_SETTLE": "Kya kisi ne apni udhari chuka di? Kitni aur kisne?",
    "QUERY_SUMMARY": "Aap kis time period ka hisaab dekhna chahte hain?",
    "QUERY_PROFIT": "Kis time period ka profit jaanna chahte hain?",
    "QUERY_EXPENSE": "Kis category ya time period ka kharcha dekhna hai?",
    "QUERY_CUSTOMER": "Kis customer ke baare me jaanna hai?",
    "COMMAND_REMIND": "Kya reminder set karna hai? Kab aur kiske liye?",
    "COMMAND_GST": "GST se kya kaam karna hai? Filing ya calculation?",
    "PAYMENT_TAG": "Kis payment ko kaunsi category me daalna hai?",
    "GENERAL": "Main aapki kya madad kar sakta hoon?",
}

VALID_INTENTS = set(CLARIFICATION_PROMPTS.keys())

# ---------------------------------------------------------------------------
# Groq client
# ---------------------------------------------------------------------------

_client: Optional[AsyncGroq] = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def classify_intent(text: str) -> IntentResult:
    """
    Classify a Hindi/Hinglish text into one of 12 business intents.

    Args:
        text: User utterance (transcribed or typed).

    Returns:
        IntentResult with intent code, confidence, and optional clarification.
    """
    if not text or not text.strip():
        return IntentResult(
            intent="GENERAL",
            confidence=0.0,
            needs_clarification=True,
            clarification_prompt="Kuch samajh nahi aaya, kya aap dobara bol sakte hain?",
        )

    settings = get_settings()
    client = _get_client()

    try:
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            max_tokens=256,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content.strip()
        logger.debug("Intent classifier raw output: %s", raw)

        result = json.loads(raw)
        intent = result.get("intent", "GENERAL").upper()
        confidence = float(result.get("confidence", 0.5))

        # Validate intent
        if intent not in VALID_INTENTS:
            logger.warning("Unknown intent '%s' from LLM, falling back to GENERAL", intent)
            intent = "GENERAL"
            confidence = min(confidence, 0.5)

        needs_clarification = confidence < 0.85
        clarification_prompt = (
            CLARIFICATION_PROMPTS.get(intent) if needs_clarification else None
        )

        return IntentResult(
            intent=intent,
            confidence=confidence,
            needs_clarification=needs_clarification,
            clarification_prompt=clarification_prompt,
        )

    except json.JSONDecodeError as e:
        logger.error("Failed to parse intent JSON: %s | raw: %s", e, raw if 'raw' in dir() else "N/A")
        return IntentResult(
            intent="GENERAL",
            confidence=0.0,
            needs_clarification=True,
            clarification_prompt="Kuch samajh nahi aaya, kya aap dobara bol sakte hain?",
        )
    except Exception as e:
        logger.error("Intent classification failed: %s", e, exc_info=True)
        return IntentResult(
            intent="GENERAL",
            confidence=0.0,
            needs_clarification=True,
            clarification_prompt="Kuch samajh nahi aaya, kya aap dobara bol sakte hain?",
        )
