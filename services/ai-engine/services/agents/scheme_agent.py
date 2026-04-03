"""
MunimAI Government Scheme Navigator — RAG-based Scheme Matching

Matches merchant profiles against government schemes for MSMEs:
1. Rule-based eligibility scoring on sector, turnover, employees, etc.
2. Groq LLM for Hindi explanation of eligibility
3. Compares scheme interest rates with moneylender rates

For production: ChromaDB + BGE-M3 embeddings for semantic similarity
search across scheme descriptions.
For now: deterministic scoring on eligibility criteria fields.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from groq import AsyncGroq

from config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Load government schemes data
_SCHEMES_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "government_schemes.json"
_SCHEMES_DATA: dict = {}


def _load_schemes() -> list[dict]:
    """Load government schemes from data file."""
    global _SCHEMES_DATA
    if not _SCHEMES_DATA:
        try:
            with open(_SCHEMES_PATH, "r", encoding="utf-8") as f:
                _SCHEMES_DATA = json.load(f)
        except FileNotFoundError:
            logger.warning("Government schemes file not found at %s", _SCHEMES_PATH)
            _SCHEMES_DATA = {"schemes": []}
    return _SCHEMES_DATA.get("schemes", [])


# Typical moneylender rates in India for comparison
MONEYLENDER_RATES = {
    "local_moneylender": 36.0,   # 3% per month
    "microfinance": 24.0,        # 2% per month
    "gold_loan": 14.0,
    "credit_card": 42.0,         # 3.5% per month
}

SCHEME_EXPLANATION_PROMPT = """You are MunimAI's government scheme advisor for Indian small businesses.

Your task: Explain in Hindi why a merchant is eligible for a government scheme and how it benefits them.

RULES:
1. Use simple Hindi (Devanagari) with common English terms
2. Compare the scheme rate with moneylender rates to show savings
3. Be specific about amounts, rates, and benefits
4. Mention required documents clearly
5. Keep under 200 words
6. Be encouraging — many merchants don't know they qualify
7. End with a clear next step (what to do to apply)
8. Use "aap" (respectful you) not "tu"

Generate ONLY the explanation. No metadata or formatting."""


async def match_schemes(merchant_profile: dict) -> list[dict]:
    """
    Score and rank government schemes based on merchant profile.

    Scoring considers: sector match, turnover eligibility, employee count,
    location, gender, and social category.

    Args:
        merchant_profile: Dict with keys like:
            - business_type: "saree_shop", "kirana", "manufacturing", etc.
            - monthly_turnover or annual_turnover: in INR
            - employee_count: number
            - location: {city, state, pincode}
            - owner_gender: "male" / "female"
            - owner_category: "General" / "SC" / "ST" / "OBC"
            - business_age_months: how old the business is
            - has_udyam: bool (Udyam registration)
            - has_gst: bool

    Returns:
        List of matched schemes sorted by eligibility_score (descending):
        [{scheme_code, name, eligibility_score, max_amount, interest_rate,
          benefits, savings_vs_moneylender, description_hi}]
    """
    schemes = _load_schemes()
    if not schemes:
        return []

    results = []

    for scheme in schemes:
        score, reasons = _score_eligibility(merchant_profile, scheme)
        if score <= 0:
            continue

        # Calculate savings vs moneylender
        scheme_rate = scheme.get("interest_rate", 12)
        moneylender_rate = MONEYLENDER_RATES.get("local_moneylender", 36)
        max_amount = scheme.get("max_amount", 0)

        if max_amount > 0 and scheme_rate > 0:
            # Annual savings on max loan amount
            annual_savings = max_amount * (moneylender_rate - scheme_rate) / 100
        else:
            annual_savings = 0

        results.append({
            "scheme_code": scheme.get("code", ""),
            "name": scheme.get("name", ""),
            "full_name": scheme.get("full_name", ""),
            "eligibility_score": round(score, 2),
            "eligibility_reasons": reasons,
            "max_amount": max_amount,
            "interest_rate": scheme_rate,
            "benefits": scheme.get("benefits", []),
            "savings_vs_moneylender": round(annual_savings, 0),
            "description": scheme.get("description", ""),
            "description_hi": _scheme_description_hindi(scheme, annual_savings),
            "application_url": scheme.get("application_url", ""),
            "documents_required": scheme.get("documents_required", []),
        })

    # Sort by eligibility score descending
    results.sort(key=lambda s: -s["eligibility_score"])
    return results


def _score_eligibility(profile: dict, scheme: dict) -> tuple[float, list[str]]:
    """
    Score a merchant's eligibility for a scheme (0.0 to 1.0).

    Returns (score, list_of_reasons).
    """
    eligibility = scheme.get("eligibility", {})
    score = 0.0
    max_score = 0.0
    reasons = []

    # --- Business type match ---
    max_score += 0.25
    allowed_types = eligibility.get("business_types", ["all"])
    biz_type = profile.get("business_type", "").lower()

    if "all" in allowed_types:
        score += 0.25
        reasons.append("Sabhi business types ke liye available")
    elif any(t in biz_type for t in allowed_types):
        score += 0.25
        reasons.append(f"Aapka business type ({biz_type}) eligible hai")
    else:
        # Map common types
        type_mapping = {
            "saree_shop": ["retail", "trading"],
            "kirana": ["retail", "trading"],
            "textile": ["manufacturing", "retail"],
            "restaurant": ["service"],
            "salon": ["service"],
        }
        mapped = type_mapping.get(biz_type, [])
        if any(m in allowed_types for m in mapped):
            score += 0.20
            reasons.append(f"Aapka business type related hai")

    # --- Turnover eligibility ---
    max_score += 0.20
    annual_turnover = profile.get("annual_turnover",
                                   profile.get("monthly_turnover", 0) * 12)
    max_turnover = eligibility.get("max_turnover")
    min_turnover = eligibility.get("min_turnover", 0)

    if max_turnover is not None:
        if min_turnover <= annual_turnover <= max_turnover:
            score += 0.20
            reasons.append(f"Turnover Rs {annual_turnover:,.0f} limit mein hai")
        elif annual_turnover < min_turnover:
            score += 0.05  # Partial — could grow into it
        # If over max, no score
    else:
        score += 0.20  # No turnover limit

    # --- Business age ---
    max_score += 0.15
    min_age = eligibility.get("business_age_months", 0)
    biz_age = profile.get("business_age_months", 24)  # Default assume 2 years

    if biz_age >= min_age:
        score += 0.15
        reasons.append(f"Business age ({biz_age} months) sufficient hai")
    elif biz_age >= min_age * 0.5:
        score += 0.07
        reasons.append("Business age thoda kam hai, par apply kar sakte hain")

    # --- Gender/Category preference ---
    max_score += 0.20
    gender_req = eligibility.get("gender", [])
    category_req = eligibility.get("category", [])
    owner_gender = profile.get("owner_gender", "").lower()
    owner_category = profile.get("owner_category", "General")

    if not gender_req and not category_req:
        score += 0.20  # Open to all
        reasons.append("Sabhi ke liye available — koi restriction nahi")
    else:
        gender_match = not gender_req or owner_gender in [g.lower() for g in gender_req]
        category_match = not category_req or owner_category in category_req

        if owner_gender == "female" and "female" in [g.lower() for g in gender_req]:
            score += 0.20
            reasons.append("Mahila udyami ke liye special scheme — aap eligible hain!")
        elif gender_match and category_match:
            score += 0.20
            reasons.append("Aapki category eligible hai")
        elif gender_match or category_match:
            score += 0.10
            reasons.append("Partially eligible — details check karein")

    # --- Collateral requirement ---
    max_score += 0.10
    requires_collateral = eligibility.get("requires_collateral", False)
    if not requires_collateral:
        score += 0.10
        reasons.append("Bina guarantee/collateral ke milega!")

    # --- Additional checks ---
    max_score += 0.10
    if eligibility.get("requires_udyam") and not profile.get("has_udyam"):
        reasons.append("Udyam registration karwana hoga — free hai online")
    else:
        score += 0.10

    # Normalize to 0-1
    final_score = score / max_score if max_score > 0 else 0
    return final_score, reasons


async def get_scheme_details(scheme_code: str) -> dict:
    """
    Return full details for a specific government scheme.

    Args:
        scheme_code: The scheme's unique code (e.g., "MUDRA_SHISHU")

    Returns:
        Full scheme dict or empty dict if not found.
    """
    schemes = _load_schemes()
    for scheme in schemes:
        if scheme.get("code") == scheme_code:
            return {
                **scheme,
                "moneylender_comparison": _moneylender_comparison(scheme),
            }
    return {}


async def generate_eligibility_explanation(
    merchant_profile: dict,
    scheme: dict,
) -> str:
    """
    Use Groq LLM to generate a Hindi explanation of why a merchant
    is eligible for a scheme and how it compares to moneylender rates.

    Args:
        merchant_profile: Merchant's profile dict
        scheme: Scheme details dict

    Returns:
        Hindi explanation string.
    """
    scheme_rate = scheme.get("interest_rate", 12)
    moneylender_rate = MONEYLENDER_RATES.get("local_moneylender", 36)
    max_amount = scheme.get("max_amount", 0)

    # Calculate concrete savings for the prompt
    if max_amount > 0:
        monthly_saving = max_amount * (moneylender_rate - scheme_rate) / 100 / 12
    else:
        monthly_saving = 0

    owner_name = merchant_profile.get("owner_name", "Dukandaar ji")
    biz_type = merchant_profile.get("business_type", "dukaan")

    user_prompt = f"""Explain to {owner_name} (who runs a {biz_type}) why they should apply
for the {scheme.get('full_name', scheme.get('name', ''))} scheme:

Scheme details:
- Loan up to: Rs {max_amount:,.0f}
- Interest rate: {scheme_rate}%
- Benefits: {', '.join(scheme.get('benefits', []))}
- Documents needed: {', '.join(scheme.get('documents_required', []))}

Compare with:
- Local moneylender: {moneylender_rate}% interest
- Monthly saving on Rs {max_amount:,.0f} loan: Rs {monthly_saving:,.0f}

Merchant profile:
- Business: {biz_type}
- Location: {merchant_profile.get('location', {}).get('city', 'unknown')}
- Employees: {merchant_profile.get('employee_count', 0)}

Write the explanation in Hindi:"""

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": SCHEME_EXPLANATION_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=400,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("Scheme explanation generation failed: %s", e)
        return _fallback_explanation(scheme, owner_name, moneylender_rate, monthly_saving)


def _fallback_explanation(
    scheme: dict, owner_name: str, moneylender_rate: float, monthly_saving: float,
) -> str:
    """Fallback Hindi explanation when LLM is unavailable."""
    rate = scheme.get("interest_rate", 12)
    max_amt = scheme.get("max_amount", 0)
    name = scheme.get("name", "Sarkari Yojana")

    return (
        f"{owner_name}, aapke liye ek bahut acchi sarkari yojana hai — {name}!\n\n"
        f"Rs {max_amt:,.0f} tak ka loan mil sakta hai sirf {rate}% interest pe.\n"
        f"Sahukar se lete toh {moneylender_rate}% lagta — isse aap har mahine Rs {monthly_saving:,.0f} bacha sakte hain!\n\n"
        f"Zaruri documents: {', '.join(scheme.get('documents_required', []))}\n\n"
        f"Apply karein: {scheme.get('application_url', 'Bank mein jaayein')}"
    )


def _scheme_description_hindi(scheme: dict, annual_savings: float) -> str:
    """Generate a short Hindi description for scheme listing."""
    rate = scheme.get("interest_rate", 0)
    max_amt = scheme.get("max_amount", 0)
    name = scheme.get("name", "")

    if max_amt > 0:
        return (
            f"{name}: Rs {max_amt:,.0f} tak, {rate}% interest. "
            f"Sahukar se Rs {annual_savings:,.0f}/saal bachao!"
        )
    return f"{name}: {scheme.get('description', '')}"


def _moneylender_comparison(scheme: dict) -> dict:
    """Compare scheme rate with various informal lending rates."""
    scheme_rate = scheme.get("interest_rate", 12)
    max_amount = scheme.get("max_amount", 0)

    comparisons = {}
    for source, rate in MONEYLENDER_RATES.items():
        if max_amount > 0:
            annual_saving = max_amount * (rate - scheme_rate) / 100
            monthly_saving = annual_saving / 12
        else:
            annual_saving = 0
            monthly_saving = 0

        comparisons[source] = {
            "rate": rate,
            "scheme_rate": scheme_rate,
            "rate_difference": round(rate - scheme_rate, 1),
            "annual_saving_on_max": round(annual_saving, 0),
            "monthly_saving_on_max": round(monthly_saving, 0),
        }
    return comparisons
