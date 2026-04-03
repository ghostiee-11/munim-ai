"""
Government Schemes router -- discover and apply for relevant schemes.

Matches merchant profile (sector, revenue, location) against a database
of central and state government schemes for MSMEs.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from models import db
from models.schemas import SchemeApplicationResponse, SchemeResponse

logger = logging.getLogger(__name__)
router = APIRouter()

# Static scheme catalog -- in production this would be a maintained database
# updated from government portals via a background scraper.
_SCHEME_CATALOG = [
    {
        "scheme_code": "PMEGP",
        "name": "Prime Minister's Employment Generation Programme",
        "provider": "Ministry of MSME, GoI",
        "description": "Financial assistance for setting up new micro enterprises. Subsidy up to 35% for general category.",
        "eligibility": "New manufacturing/service units with project cost up to 50 lakh (manufacturing) or 20 lakh (service).",
        "benefit_amount": "Up to 35% subsidy on project cost",
        "max_amount": 5000000, "interest_rate": 8.5, "tenure": "7 years", "eligibility_score": 78,
        "deadline": None,
        "sectors": ["manufacturing", "service", "retail"],
    },
    {
        "scheme_code": "CGTMSE",
        "name": "Credit Guarantee Fund Trust for Micro and Small Enterprises",
        "provider": "SIDBI + GoI",
        "description": "Collateral-free loans up to Rs 5 crore for MSEs. No collateral needed.",
        "eligibility": "Micro and small enterprises (manufacturing and service).",
        "benefit_amount": "Collateral-free loan guarantee up to 5 Cr",
        "max_amount": 50000000, "interest_rate": 9.0, "tenure": "5-7 years", "eligibility_score": 85,
        "deadline": None,
        "sectors": ["manufacturing", "service", "retail", "food"],
    },
    {
        "scheme_code": "MUDRA",
        "name": "Pradhan Mantri MUDRA Yojana",
        "provider": "GoI",
        "description": "Loans up to Rs 10 lakh for small businesses. Three categories: Shishu (50K), Kishore (5L), Tarun (10L).",
        "eligibility": "Any Indian citizen with a business plan for non-farm income generating activity.",
        "benefit_amount": "Loan up to Rs 10 lakh",
        "max_amount": 1000000, "interest_rate": 7.5, "tenure": "5 years", "eligibility_score": 92,
        "deadline": None,
        "sectors": ["retail", "food", "service", "manufacturing", "trading"],
    },
    {
        "scheme_code": "PMFME",
        "name": "PM Formalisation of Micro Food Processing Enterprises",
        "provider": "Ministry of Food Processing Industries",
        "description": "35% capital subsidy for food processing units, up to Rs 10 lakh.",
        "eligibility": "Existing micro food processing units (unorganized sector).",
        "benefit_amount": "35% subsidy, max Rs 10 lakh",
        "max_amount": 1000000, "interest_rate": 0, "tenure": "One-time grant", "eligibility_score": 65,
        "deadline": None,
        "sectors": ["food"],
    },
    {
        "scheme_code": "STANDUPINDIA",
        "name": "Stand Up India",
        "provider": "GoI",
        "description": "Loans between Rs 10 lakh to Rs 1 crore for SC/ST and women entrepreneurs.",
        "eligibility": "SC/ST or women entrepreneurs setting up a greenfield enterprise.",
        "benefit_amount": "Loan Rs 10L - 1Cr",
        "max_amount": 10000000, "interest_rate": 8.0, "tenure": "7 years", "eligibility_score": 70,
        "deadline": None,
        "sectors": ["manufacturing", "service", "retail", "trading"],
    },
    {
        "scheme_code": "UDYAM",
        "name": "Udyam Registration",
        "provider": "Ministry of MSME",
        "description": "Free online registration for MSMEs. Unlocks benefits under multiple schemes.",
        "eligibility": "Any micro, small, or medium enterprise.",
        "benefit_amount": "Access to all MSME scheme benefits",
        "max_amount": 0, "interest_rate": 0, "tenure": "Free registration", "eligibility_score": 95,
        "deadline": None,
        "sectors": ["all"],
    },
]


def _match_score(scheme: dict, merchant: dict) -> float:
    """Compute a relevance score (0-1) for how well a scheme fits the merchant."""
    sectors = scheme.get("sectors", [])
    merchant_sector = merchant.get("sector", "retail").lower()

    if "all" in sectors:
        sector_match = 1.0
    elif merchant_sector in sectors:
        sector_match = 1.0
    else:
        sector_match = 0.3

    # Revenue-based matching (simplified)
    revenue = merchant.get("monthly_revenue", 50000)
    if scheme["scheme_code"] == "MUDRA" and revenue < 500000:
        revenue_match = 0.9
    elif scheme["scheme_code"] == "CGTMSE" and revenue > 100000:
        revenue_match = 0.8
    else:
        revenue_match = 0.6

    return round((sector_match * 0.6 + revenue_match * 0.4), 2)


@router.get("/{merchant_id}")
async def get_eligible_schemes(merchant_id: str):
    """
    Return government schemes relevant to the merchant, ranked by match score.
    """
    # Fetch merchant profile
    merchant = db.select("merchants", filters={"id": merchant_id}, single=True)
    if not merchant:
        merchant = {"id": merchant_id, "sector": "retail", "monthly_revenue": 50000}

    results = []
    for scheme in _SCHEME_CATALOG:
        score = _match_score(scheme, merchant)
        results.append({
            "scheme_code": scheme["scheme_code"],
            "name": scheme["name"],
            "provider": scheme["provider"],
            "description": scheme["description"],
            "eligibility": scheme["eligibility"],
            "benefit_amount": scheme.get("benefit_amount"),
            "max_amount": scheme.get("max_amount", 0),
            "interest_rate": scheme.get("interest_rate", 0),
            "tenure": scheme.get("tenure", "N/A"),
            "eligibility_score": scheme.get("eligibility_score", int(score * 100)),
            "deadline": scheme.get("deadline"),
            "match_score": score,
        })

    results.sort(key=lambda x: x["match_score"], reverse=True)
    return results


@router.get("/{merchant_id}/search")
async def search_live_schemes(merchant_id: str, q: str = "MSME loan"):
    """Search for government schemes using Tavily web search."""
    from services.tavily_search import search_schemes

    results = await search_schemes(q)

    # Use Groq LLM to summarize each result in Hindi and score applicability
    if results:
        import json
        from groq import AsyncGroq
        from config import get_settings

        settings = get_settings()
        if settings.groq_api_key:
            try:
                client = AsyncGroq(api_key=settings.groq_api_key)
                titles_snippet = json.dumps(
                    [{"title": r["title"], "snippet": r["snippet"]} for r in results],
                    ensure_ascii=False,
                )
                resp = await client.chat.completions.create(
                    model=settings.groq_model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are MunimAI, a Hindi-speaking assistant for Indian small businesses. "
                                "For each scheme below, return a JSON array where each element has: "
                                '"hindi_summary" (2-3 line Hindi summary) and "applicability_score" (0-100). '
                                "Respond ONLY with valid JSON."
                            ),
                        },
                        {"role": "user", "content": titles_snippet},
                    ],
                    temperature=0.3,
                    max_tokens=1000,
                    response_format={"type": "json_object"},
                )
                summaries = json.loads(resp.choices[0].message.content)
                summary_list = summaries if isinstance(summaries, list) else summaries.get("schemes", summaries.get("results", []))
                for i, s in enumerate(summary_list):
                    if i < len(results):
                        results[i]["hindi_summary"] = s.get("hindi_summary", "")
                        results[i]["applicability_score"] = s.get("applicability_score", 50)
            except Exception as e:
                logger.warning("Groq Hindi summarization failed: %s", e)

    return {"merchant_id": merchant_id, "query": q, "results": results}


@router.post("/{merchant_id}/{scheme_code}/apply", response_model=SchemeApplicationResponse)
async def apply_for_scheme(merchant_id: str, scheme_code: str):
    """
    Initiate an application for a government scheme.

    In production this would:
    1. Pre-fill application forms with merchant data.
    2. Guide the user through document upload.
    3. Submit to the scheme portal API where available.
    """
    scheme = next((s for s in _SCHEME_CATALOG if s["scheme_code"] == scheme_code), None)
    if not scheme:
        raise HTTPException(status_code=404, detail=f"Scheme '{scheme_code}' not found.")

    # Record the application
    db.insert("scheme_applications", {
        "merchant_id": merchant_id,
        "scheme_code": scheme_code,
        "status": "initiated",
    })

    logger.info("Scheme application started: %s for merchant %s", scheme_code, merchant_id)

    next_steps = [
        "Udyam Registration certificate upload karein (agar nahi hai toh pehle register karein).",
        "Pichle 2 saal ka ITR / bank statement ready rakhein.",
        "Aadhaar aur PAN card ki copy upload karein.",
        "Business address proof upload karein.",
    ]

    return SchemeApplicationResponse(
        status="initiated",
        scheme_code=scheme_code,
        message=f"{scheme['name']} ke liye application start ho gayi. Neeche diye documents taiyaar karein.",
        next_steps=next_steps,
    )
