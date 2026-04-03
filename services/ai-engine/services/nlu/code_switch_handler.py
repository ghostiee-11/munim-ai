"""
Code-switching (Hindi-English) handler for MunimAI.

Detects and normalizes common Hinglish patterns so downstream NLU
components receive cleaner, more consistent text.
"""

import re
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Common Hinglish → normalised Hindi/English replacements
# ---------------------------------------------------------------------------
HINGLISH_NORMALIZATIONS: list[tuple[str, str]] = [
    # Money / transaction terms
    (r"\bpayment\b", "bhugtan"),
    (r"\breceive(?:d)?\b", "mila"),
    (r"\bpaid\b", "diya"),
    (r"\bcash\b", "naqad"),
    (r"\bamount\b", "raqam"),
    (r"\bbalance\b", "baaki"),
    (r"\bprofit\b", "munafa"),
    (r"\bloss\b", "nuksan"),
    (r"\bexpense\b", "kharcha"),
    (r"\bincome\b", "amdani"),
    (r"\bsalary\b", "tankhwah"),
    (r"\brent\b", "kiraya"),
    (r"\btotal\b", "kul"),
    (r"\bsale(?:s)?\b", "bikri"),
    (r"\bpurchase\b", "khareed"),

    # Action terms
    (r"\bremind(?:er)?\b", "yaad dilao"),
    (r"\bsend\b", "bhejo"),
    (r"\bshow\b", "dikhao"),
    (r"\btell\b", "batao"),
    (r"\bcalculate\b", "hisaab karo"),
    (r"\bsettl(?:e|ed)\b", "chukta"),
    (r"\bbook\b", "likho"),
    (r"\brecord\b", "likho"),
    (r"\badd\b", "jodo"),
    (r"\bdelete\b", "hatao"),

    # Time terms
    (r"\btoday\b", "aaj"),
    (r"\byesterday\b", "kal"),
    (r"\btomorrow\b", "kal"),
    (r"\bweek\b", "hafta"),
    (r"\bmonth\b", "mahina"),
    (r"\byear\b", "saal"),
    (r"\bjan(?:uary)?\b", "january"),
    (r"\bfeb(?:ruary)?\b", "february"),

    # People / relationships
    (r"\bcustomer\b", "grahak"),
    (r"\bsupplier\b", "supplier"),
    (r"\bpartner\b", "saathi"),

    # GST terms
    (r"\bgst\s*return\b", "gst return"),
    (r"\btax\b", "kar"),
    (r"\binvoice\b", "bill"),

    # Common Hinglish connectors / filler
    (r"\bactually\b", ""),
    (r"\bbasically\b", ""),
    (r"\blike\b", ""),
    (r"\byou know\b", ""),
]

# Common spelling variations in Hinglish transcription
SPELLING_NORMALIZATIONS: list[tuple[str, str]] = [
    (r"\bpaisa\b", "paise"),
    (r"\brupya\b", "rupaye"),
    (r"\brupiya\b", "rupaye"),
    (r"\bhazar\b", "hazaar"),
    (r"\bhjar\b", "hazaar"),
    (r"\blac\b", "lakh"),
    (r"\bkaror\b", "crore"),
    (r"\bdukhaan\b", "dukaan"),
    (r"\budhari\b", "udhari"),
    (r"\budhaar\b", "udhari"),
    (r"\bhisab\b", "hisaab"),
    (r"\bkharche\b", "kharcha"),
]


def detect_code_switch_ratio(text: str) -> float:
    """
    Return a rough ratio (0.0 - 1.0) of English tokens in the text.
    Uses a simple heuristic: tokens matching [a-zA-Z]+ that are common
    English words score as English.
    """
    tokens = text.lower().split()
    if not tokens:
        return 0.0

    english_words = {
        "the", "is", "was", "are", "and", "or", "but", "for", "from", "to",
        "in", "on", "at", "of", "with", "my", "your", "his", "her", "this",
        "that", "it", "not", "yes", "no", "please", "thanks", "ok", "okay",
        "how", "much", "many", "what", "when", "where", "who", "which",
        "payment", "cash", "amount", "balance", "profit", "loss", "expense",
        "income", "salary", "rent", "total", "sale", "sales", "purchase",
        "remind", "reminder", "send", "show", "tell", "calculate", "settle",
        "settled", "book", "record", "add", "delete", "today", "yesterday",
        "tomorrow", "week", "month", "year", "customer", "supplier", "partner",
        "tax", "invoice", "return", "paid", "received", "due",
    }

    english_count = sum(1 for t in tokens if t in english_words)
    return english_count / len(tokens)


def normalize_hinglish(text: str) -> str:
    """
    Normalize a Hinglish (Hindi-English code-mixed) string into a more
    consistent form for downstream NLU processing.

    Steps:
      1. Lowercase
      2. Fix common spelling variations
      3. Replace English terms with Hindi equivalents
      4. Collapse extra whitespace
    """
    if not text:
        return text

    original = text
    text = text.lower().strip()

    # Step 1: spelling normalization
    for pattern, replacement in SPELLING_NORMALIZATIONS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Step 2: code-switch normalization (English → Hindi)
    for pattern, replacement in HINGLISH_NORMALIZATIONS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Step 3: collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()

    if text != original.lower().strip():
        logger.debug("Code-switch normalized: '%s' -> '%s'", original, text)

    return text
