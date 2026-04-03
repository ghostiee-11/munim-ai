"""
Entity Extractor for MunimAI.

Uses Groq LLM with structured JSON output to extract named entities
(AMOUNT, PERSON, CATEGORY, DATE, PRODUCT) from Hindi/Hinglish text.
Integrates the Hindi numeral parser for robust amount extraction.
"""

import json
import logging
from typing import Any, Optional

from groq import AsyncGroq

from config import get_settings
from services.nlu.hindi_numerals import parse_hindi_amount

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt for entity extraction
# ---------------------------------------------------------------------------

ENTITY_SYSTEM_PROMPT = """\
You are MunimAI's entity extractor. Given a Hindi/Hinglish text from a small \
Indian shopkeeper AND its classified intent, extract the following entities.

You MUST respond with valid JSON only — no extra text.

Output format:
{
  "amount": <integer or null>,
  "amount_raw": "<original amount text as spoken or null>",
  "person": "<person name or null>",
  "category": "<expense/income category or null>",
  "date": "<temporal reference or null>",
  "product": "<product/item name or null>"
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTITY EXTRACTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## AMOUNT (monetary value)
- Extract the monetary amount as an INTEGER (no decimals for Indian business).
- Parse Hindi numerals: "paanch hazaar" = 5000, "dedh lakh" = 150000
- Parse mixed: "15 hazaar" = 15000, "2.5 lakh" = 250000
- Parse digits: "5000", "₹5000", "Rs 5000", "5000 rupaye" = 5000
- If multiple amounts exist, pick the PRIMARY transaction amount.
- "amount_raw" should capture the original spoken form for auditing.
- Examples:
  Input: "Sharma ji se paanch hazaar mile"    → amount: 5000, amount_raw: "paanch hazaar"
  Input: "bijli bill 2450 bhara"              → amount: 2450, amount_raw: "2450"
  Input: "dedh lakh ka order aaya"            → amount: 150000, amount_raw: "dedh lakh"
  Input: "dhai sau ka saamaan"                → amount: 250, amount_raw: "dhai sau"
  Input: "Rs 800 diye"                        → amount: 800, amount_raw: "Rs 800"

## PERSON (name of customer/person)
- Extract the person's name involved in the transaction.
- Keep honorifics: "ji", "bhai", "didi", "sahab", "seth", "madam"
- Common patterns:
  - "Sharma ji se..."  → "Sharma ji"
  - "Ramesh ne..."     → "Ramesh"
  - "Ravi ko..."       → "Ravi"
  - "Geeta didi ka..." → "Geeta didi"
  - "Pappu bhai..."    → "Pappu bhai"
  - "Mohanlal sahab..."→ "Mohanlal sahab"
- If no person is mentioned, return null.
- Do NOT extract generic words as names: "dukaan", "staff", "safai wala"
  are NOT person names.
- For staff/employee salary: if a specific name is given, extract it.
  "Ram ki salary" → person: "Ram". "staff salary" → person: null.

## CATEGORY (expense or income category)
- Infer the business category from context. Use standardized category names:
  - For EXPENSE_LOG intent:
    - "bijli bill" / "electricity" → "utilities"
    - "kiraya" / "rent" → "rent"
    - "salary" / "tankhwah" / "wages" → "salary"
    - "transport" / "freight" / "delivery" → "transport"
    - "chai paani" / "khaana" / "food" → "food"
    - "packing" / "packaging" → "packaging"
    - "internet" / "phone bill" / "recharge" → "telecom"
    - "repair" / "maintenance" → "maintenance"
    - "stationery" / "printing" → "office_supplies"
    - "safai" / "cleaning" → "cleaning"
    - Other → "miscellaneous"
  - For CASH_RECEIVED / UDHARI intents:
    - "saamaan" / "goods" → "goods_sale"
    - "service" / "labour" → "service"
    - "advance" → "advance"
    - Other → "general"
  - If no clear category, return null.

## DATE (temporal reference)
- Extract time references as spoken, then normalize:
  - "aaj" → "today"
  - "kal" → "yesterday" or "tomorrow" (infer from context: past action = yesterday, future = tomorrow)
  - "parson" → "day_after_tomorrow" or "day_before_yesterday"
  - "is hafte" → "this_week"
  - "pichhle hafte" → "last_week"
  - "is mahine" → "this_month"
  - "pichhle mahine" → "last_month"
  - "is saal" → "this_year"
  - "15 tarikh" → "15th"
  - "december" / "january" etc. → month name
  - "monday" / "somvar" → day name
  - Specific dates: "2 march", "15 jan" → as-is
- If no date is mentioned, return null.
- For transactions being logged NOW, infer "today" only if explicitly stated or strongly implied.

## PRODUCT (item/product name for inventory)
- Extract product or item names relevant to inventory/goods.
- Examples:
  - "10 packet chips" → "chips"
  - "cement ke 5 bag" → "cement"
  - "rice 50 kg" → "rice"
  - "2 darjan ande" → "ande" (eggs)
  - "mobile phone becha" → "mobile phone"
  - "saamaan" (generic goods) → null (too vague)
- If no specific product, return null.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTENT-SPECIFIC HINTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- CASH_RECEIVED: Expect AMOUNT + PERSON. Category often "general" or "goods_sale".
- EXPENSE_LOG: Expect AMOUNT + CATEGORY. PERSON usually null unless paying someone specific.
- UDHARI_CREATE: Expect AMOUNT + PERSON. May have PRODUCT.
- UDHARI_SETTLE: Expect AMOUNT + PERSON.
- QUERY_SUMMARY: Expect DATE. Amount/Person usually null.
- QUERY_PROFIT: Expect DATE.
- QUERY_EXPENSE: Expect DATE and/or CATEGORY.
- QUERY_CUSTOMER: Expect PERSON.
- COMMAND_REMIND: Expect PERSON + DATE.
- COMMAND_GST: Usually no entities, or DATE for period.
- PAYMENT_TAG: Expect CATEGORY, maybe AMOUNT.
- GENERAL: Usually no entities.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXAMPLES (full input → output)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Input: "Sharma ji se 5000 rupaye mile" (intent: CASH_RECEIVED)
Output: {"amount": 5000, "amount_raw": "5000 rupaye", "person": "Sharma ji", "category": "general", "date": null, "product": null}

Input: "bijli ka bill bhara 2000" (intent: EXPENSE_LOG)
Output: {"amount": 2000, "amount_raw": "2000", "person": null, "category": "utilities", "date": null, "product": null}

Input: "Ravi ko 3000 ki udhari de di aaj" (intent: UDHARI_CREATE)
Output: {"amount": 3000, "amount_raw": "3000", "person": "Ravi", "category": "general", "date": "today", "product": null}

Input: "pichhle hafte ka kharcha dikhao" (intent: QUERY_EXPENSE)
Output: {"amount": null, "amount_raw": null, "person": null, "category": null, "date": "last_week", "product": null}

Input: "Geeta didi ka hisaab dikhao" (intent: QUERY_CUSTOMER)
Output: {"amount": null, "amount_raw": null, "person": "Geeta didi", "category": null, "date": null, "product": null}

Input: "kal Mohanlal ko yaad dilana 7000 ke baare me" (intent: COMMAND_REMIND)
Output: {"amount": 7000, "amount_raw": "7000", "person": "Mohanlal", "category": null, "date": "tomorrow", "product": null}

Input: "Pintu ne dedh hazaar ka cement liya credit pe" (intent: UDHARI_CREATE)
Output: {"amount": 1500, "amount_raw": "dedh hazaar", "person": "Pintu", "category": "general", "date": null, "product": "cement"}

Remember: Output ONLY valid JSON. No markdown, no explanation outside JSON.
"""

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
# Post-processing: Hindi numeral fallback
# ---------------------------------------------------------------------------

def _resolve_amount(llm_amount: Any, amount_raw: Optional[str], original_text: str) -> Optional[int]:
    """
    Resolve the final amount using LLM output + Hindi numeral parser fallback.
    """
    # If LLM gave a valid integer, use it
    if llm_amount is not None:
        try:
            val = int(llm_amount)
            if val > 0:
                return val
        except (ValueError, TypeError):
            pass

    # Fallback: parse amount_raw with Hindi numeral parser
    if amount_raw:
        parsed = parse_hindi_amount(amount_raw)
        if parsed is not None and parsed > 0:
            return parsed

    # Last resort: try parsing the entire text for amounts
    parsed = parse_hindi_amount(original_text)
    if parsed is not None and parsed > 0:
        return parsed

    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def extract_entities(text: str, intent: str) -> dict:
    """
    Extract named entities from Hindi/Hinglish text given its intent.

    Args:
        text: User utterance.
        intent: Classified intent code (e.g. "CASH_RECEIVED").

    Returns:
        Dict with keys: amount, person, category, date, product.
    """
    empty_result = {
        "amount": None,
        "person": None,
        "category": None,
        "date": None,
        "product": None,
    }

    if not text or not text.strip():
        return empty_result

    settings = get_settings()
    client = _get_client()

    user_message = f"Text: {text}\nIntent: {intent}"

    try:
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": ENTITY_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.05,
            max_tokens=512,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content.strip()
        logger.debug("Entity extractor raw output: %s", raw)

        result = json.loads(raw)

        # Resolve amount with Hindi numeral parser fallback
        amount = _resolve_amount(
            result.get("amount"),
            result.get("amount_raw"),
            text,
        )

        entities = {
            "amount": amount,
            "person": result.get("person") or None,
            "category": result.get("category") or None,
            "date": result.get("date") or None,
            "product": result.get("product") or None,
        }

        # Clean up: strip whitespace from string values
        for key in ("person", "category", "date", "product"):
            if entities[key] and isinstance(entities[key], str):
                entities[key] = entities[key].strip()
                if not entities[key]:
                    entities[key] = None

        logger.info("Extracted entities: %s", entities)
        return entities

    except json.JSONDecodeError as e:
        logger.error("Failed to parse entity JSON: %s", e)
        return empty_result
    except Exception as e:
        logger.error("Entity extraction failed: %s", e, exc_info=True)
        return empty_result
