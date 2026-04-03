"""
Hindi Numeral Parser for MunimAI.

Converts spoken Hindi/Hinglish numeral expressions to integer values.
Handles compound expressions, fractions (dedh, dhai, sawa, paune, saadhe),
mixed Hindi-digit patterns, and currency markers.
"""

import re
from typing import Optional


# ---------------------------------------------------------------------------
# Base Hindi number words → integer
# ---------------------------------------------------------------------------
HINDI_UNITS: dict[str, int] = {
    # 0-10
    "zero": 0, "sifar": 0, "shunya": 0,
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5,
    "chhe": 6, "cheh": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10,
    # 11-19
    "gyarah": 11, "baarah": 12, "terah": 13, "chaudah": 14,
    "pandrah": 15, "solah": 16, "satrah": 17, "atharah": 18, "unnis": 19,
    # 20-29
    "bees": 20, "ikkis": 21, "bais": 22, "teis": 23, "chaubis": 24,
    "pachees": 25, "chhabbis": 26, "sattais": 27, "atthaais": 28, "untees": 29,
    # 30-39
    "tees": 30, "ikattees": 31, "battees": 32, "taintees": 33, "chauntees": 34,
    "paintees": 35, "chhattees": 36, "saintees": 37, "adtees": 38, "untaalees": 39,
    # 40-49
    "chaalees": 40, "iktaalees": 41, "bayaalees": 42, "taintaalees": 43,
    "chavaalees": 44, "paintaalees": 45, "chhiyaalees": 46,
    "saintaalees": 47, "adtaalees": 48, "unchaas": 49,
    # 50-59
    "pachaas": 50, "ikyaavan": 51, "baavan": 52, "tirpan": 53, "chauvan": 54,
    "pachpan": 55, "chhappan": 56, "sattaavan": 57, "atthaavan": 58, "unsath": 59,
    # 60-69
    "saath": 60, "iksath": 61, "baasath": 62, "tirsath": 63, "chausath": 64,
    "painsath": 65, "chhiyasath": 66, "sarsath": 67, "adsath": 68, "unhattar": 69,
    # 70-79
    "sattar": 70, "ikattar": 71, "bahattar": 72, "tihattar": 73, "chauhattar": 74,
    "pachattar": 75, "chhi-hattar": 76, "chhibhattar": 76, "satattar": 77,
    "athhattar": 78, "unnaasi": 79,
    # 80-89
    "assi": 80, "ikyaasi": 81, "bayaasi": 82, "tiraasi": 83, "chauraasi": 84,
    "pachaasi": 85, "chhiyaasi": 86, "sattaasi": 87, "atthaasi": 88, "navaasi": 89,
    # 90-99
    "nabbe": 90, "ikyaanve": 91, "baanve": 92, "tiraanve": 93, "chauraanve": 94,
    "pachaanve": 95, "chhiyaanve": 96, "sattaanve": 97, "atthaanve": 98, "ninyaanve": 99,
    # 100
    "sau": 100, "so": 100,
}

# Multiplier words
HINDI_MULTIPLIERS: dict[str, int] = {
    "sau": 100, "so": 100,
    "hazaar": 1000, "hazar": 1000, "hajaar": 1000,
    "lakh": 100_000, "lac": 100_000, "laakh": 100_000,
    "crore": 10_000_000, "karod": 10_000_000, "caror": 10_000_000, "crore": 10_000_000,
}

# Fractional prefixes
# dedh = 1.5, dhai = 2.5, sawa = 1.25, paune = 0.75 (of next), saadhe = X.5
FRACTIONAL_PREFIXES: dict[str, float] = {
    "dedh": 1.5,
    "dhai": 2.5, "dhaai": 2.5, "adhai": 2.5,
    "sawa": 1.25, "savaa": 1.25,
    "paune": 0.75, "pone": 0.75, "pauna": 0.75,
    "saadhe": 0.5, "saade": 0.5, "sade": 0.5, "sadhe": 0.5,  # adds 0.5 to the base
}

# Currency markers (stripped during parsing)
CURRENCY_PATTERN = re.compile(
    r"(?:rs\.?|rupaye|rupiya|rupees?|rupaiye|₹)\s*",
    re.IGNORECASE,
)


def _normalize(text: str) -> str:
    """Lowercase, strip currency markers, collapse whitespace."""
    text = text.lower().strip()
    text = CURRENCY_PATTERN.sub("", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _try_direct_digit(text: str) -> Optional[int]:
    """If the text is purely digits (possibly with commas), return as int."""
    cleaned = text.replace(",", "").replace(" ", "")
    if cleaned.isdigit():
        return int(cleaned)
    return None


def parse_hindi_amount(text: str) -> Optional[int]:
    """
    Parse a Hindi/Hinglish spoken numeral expression into an integer.

    Examples:
        "dedh lakh"        -> 150000
        "dhai hazaar"      -> 2500
        "sawa do sau"      -> 225
        "paune teen sau"   -> 275
        "saadhe paanch sau"-> 550
        "15 hazaar"        -> 15000
        "2 lakh"           -> 200000
        "800"              -> 800
        "Rs 5000"          -> 5000
        "pachees hazaar"   -> 25000
        "ek crore"         -> 10000000
        "do lakh pachaas hazaar" -> 250000
    """
    if not text or not text.strip():
        return None

    text = _normalize(text)
    if not text:
        return None

    # Pure digit string
    direct = _try_direct_digit(text)
    if direct is not None:
        return direct

    tokens = text.split()
    return _parse_tokens(tokens)


def _parse_tokens(tokens: list[str]) -> Optional[int]:
    """Parse a list of tokens into a numeric value."""
    if not tokens:
        return None

    total = 0
    i = 0
    n = len(tokens)

    while i < n:
        token = tokens[i]

        # --- Fractional prefix handling ---
        if token in FRACTIONAL_PREFIXES:
            frac = FRACTIONAL_PREFIXES[token]
            i += 1

            # For "saadhe" style: saadhe + number + multiplier  e.g. "saadhe paanch sau"
            # means (5 + 0.5) * 100 = 550
            if token in ("saadhe", "saade", "sade", "sadhe"):
                base_val, consumed = _read_number(tokens, i)
                if base_val is not None:
                    i += consumed
                    # Check if next token is a multiplier
                    if i < n and tokens[i] in HINDI_MULTIPLIERS:
                        mult = HINDI_MULTIPLIERS[tokens[i]]
                        i += 1
                        total += int((base_val + 0.5) * mult)
                    else:
                        # saadhe + number directly, e.g. "saadhe paanch" = 5.5 -> 5 (unusual for money)
                        total += int(base_val + 0.5)
                else:
                    # saadhe + multiplier directly, e.g. "saadhe hazaar" = 1500
                    if i < n and tokens[i] in HINDI_MULTIPLIERS:
                        mult = HINDI_MULTIPLIERS[tokens[i]]
                        i += 1
                        total += int(1.5 * mult)
                continue

            # For dedh/dhai: frac * next multiplier
            # e.g. "dedh lakh" = 1.5 * 100000
            if i < n and tokens[i] in HINDI_MULTIPLIERS:
                mult = HINDI_MULTIPLIERS[tokens[i]]
                i += 1
                total += int(frac * mult)
                continue

            # For sawa/paune + number + multiplier
            # e.g. "sawa do sau" = 1.25 * 200 = 225? No, sawa do sau = 225 (sawa applied to sau with do as base)
            # Actually: "sawa do sau" = (2 + 0.25) * 100 = 225
            # "paune teen sau" = (3 - 0.25) * 100 = 275
            base_val, consumed = _read_number(tokens, i)
            if base_val is not None:
                i += consumed
                if i < n and tokens[i] in HINDI_MULTIPLIERS:
                    mult = HINDI_MULTIPLIERS[tokens[i]]
                    i += 1
                    if token in ("sawa", "savaa"):
                        total += int((base_val + 0.25) * mult)
                    elif token in ("paune", "pone", "pauna"):
                        total += int((base_val - 0.25) * mult)
                    else:
                        total += int(frac * base_val * mult)
                else:
                    # sawa + number without multiplier: "sawa sau" handled differently
                    if token in ("sawa", "savaa"):
                        total += int(base_val * 1.25)
                    elif token in ("paune", "pone", "pauna"):
                        total += int(base_val * 0.75)
                    else:
                        total += int(frac * base_val)
            else:
                # Fractional prefix alone — unusual, skip
                continue

            continue

        # --- Regular number + optional multiplier ---
        base_val, consumed = _read_number(tokens, i)
        if base_val is not None:
            i += consumed
            if i < n and tokens[i] in HINDI_MULTIPLIERS:
                mult = HINDI_MULTIPLIERS[tokens[i]]
                i += 1
                total += int(base_val * mult)
            else:
                total += int(base_val)
            continue

        # --- Standalone multiplier (e.g., "hazaar" meaning 1000) ---
        if token in HINDI_MULTIPLIERS:
            total += HINDI_MULTIPLIERS[token]
            i += 1
            continue

        # Unknown token — skip
        i += 1

    return total if total > 0 else None


def _read_number(tokens: list[str], start: int) -> tuple[Optional[int], int]:
    """
    Read a single number from tokens starting at `start`.
    Returns (value, number_of_tokens_consumed) or (None, 0).
    """
    if start >= len(tokens):
        return None, 0

    token = tokens[start]

    # Digit string
    if token.replace(",", "").isdigit():
        return int(token.replace(",", "")), 1

    # Hindi word
    if token in HINDI_UNITS:
        return HINDI_UNITS[token], 1

    return None, 0
