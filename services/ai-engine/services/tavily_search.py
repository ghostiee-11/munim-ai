"""
Tavily Web Search integration for MunimAI.

Provides live web search for government MSME schemes, GST deductions,
and income tax benefits using the Tavily async client.
"""

import logging

from tavily import AsyncTavilyClient

from config import get_settings

logger = logging.getLogger(__name__)


async def search_schemes(query: str, max_results: int = 5) -> list[dict]:
    """Search for government MSME schemes using Tavily."""
    settings = get_settings()
    if not settings.tavily_api_key:
        logger.warning("Tavily API key not configured — returning empty results")
        return []

    client = AsyncTavilyClient(api_key=settings.tavily_api_key)
    try:
        response = await client.search(
            query=f"India MSME small business scheme {query}",
            max_results=max_results,
            search_depth="basic",
        )
        results = []
        for r in response.get("results", []):
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", "")[:300],
                "score": r.get("score", 0),
            })
        return results
    except Exception as e:
        logger.error("Tavily search failed: %s", e)
        return []


async def search_tax_deductions(business_type: str) -> list[dict]:
    """Search for GST deductions and tax benefits."""
    return await search_schemes(f"GST deduction tax benefit {business_type} 2024 2025")


async def search_income_tax_schemes(income_range: str) -> list[dict]:
    """Search for income tax schemes and benefits."""
    return await search_schemes(f"income tax benefit small business {income_range}")
