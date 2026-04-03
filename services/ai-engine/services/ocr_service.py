"""
OCR Service for invoice and khata image processing.

Uses OpenAI GPT-4o-mini vision for image-based extraction, with
Groq LLM as a fallback for text-only extraction.
"""

import base64
import json
import logging
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

INVOICE_EXTRACTION_PROMPT = """You are an invoice/receipt data extractor for Indian small businesses.
Extract ALL data from this invoice image and return ONLY valid JSON:

{
  "vendor": "Vendor/Shop name",
  "date": "YYYY-MM-DD or as shown",
  "gst_number": "GST number if visible, else null",
  "items": [
    {"name": "Item name", "qty": 1, "amount": 100.0}
  ],
  "subtotal": 0.0,
  "tax": 0.0,
  "total": 0.0,
  "payment_mode": "cash/upi/card/unknown",
  "notes": "Any additional notes"
}

If the image is a handwritten khata page, extract credit entries as items.
Return ONLY valid JSON, no explanation."""

KHATA_EXTRACTION_PROMPT = """You are an OCR post-processor for Indian khata (credit ledger) pages.
Given this image of a handwritten khata, extract a JSON array of credit entries:

{
  "entries": [
    {"customer_name": "Name", "amount": 500, "description": "Items purchased", "date": "if visible"}
  ],
  "total": 0.0,
  "page_notes": "any general notes"
}

Return ONLY valid JSON."""


async def extract_invoice_data(
    image_url_or_bytes,
    merchant_id: str = None,
    extraction_type: str = "invoice",
) -> dict:
    """
    Extract invoice/khata data from an image.

    Parameters
    ----------
    image_url_or_bytes : str or bytes
        Either a URL to the image, or raw image bytes.
    merchant_id : str, optional
        Merchant context for logging.
    extraction_type : str
        "invoice" or "khata" to select the extraction prompt.

    Returns
    -------
    dict with extracted data, or error info.
    """
    prompt = INVOICE_EXTRACTION_PROMPT if extraction_type == "invoice" else KHATA_EXTRACTION_PROMPT

    # Build the image content for the API
    if isinstance(image_url_or_bytes, bytes):
        b64 = base64.b64encode(image_url_or_bytes).decode("utf-8")
        image_content = {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
        }
    elif isinstance(image_url_or_bytes, str) and image_url_or_bytes.startswith("http"):
        image_content = {
            "type": "image_url",
            "image_url": {"url": image_url_or_bytes},
        }
    elif isinstance(image_url_or_bytes, str):
        # Assume it is already base64
        image_content = {
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_url_or_bytes}"},
        }
    else:
        return {"error": "Invalid image input", "data": None}

    # Try OpenAI GPT-4o-mini vision (primary)
    if settings.openai_api_key:
        try:
            result = await _extract_with_openai(prompt, image_content)
            if result:
                logger.info("Invoice extracted via OpenAI for merchant %s", merchant_id)
                return {"data": result, "provider": "openai", "error": None}
        except Exception as e:
            logger.warning("OpenAI vision extraction failed: %s", e)

    # Fallback: return a placeholder
    logger.warning("No vision API available for OCR extraction")
    return {
        "data": None,
        "provider": None,
        "error": "No vision API configured. Set OPENAI_API_KEY in .env.",
    }


async def _extract_with_openai(prompt: str, image_content: dict) -> Optional[dict]:
    """Use OpenAI GPT-4o-mini vision to extract structured data from an image."""
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    image_content,
                ],
            }
        ],
        "max_tokens": 1000,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        logger.error("OpenAI vision API error: %s %s", resp.status_code, resp.text)
        return None

    raw_text = resp.json()["choices"][0]["message"]["content"].strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[-1]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3].strip()

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("OpenAI returned invalid JSON: %s", raw_text[:200])
        return {"raw_text": raw_text, "parse_error": True}


async def extract_text_invoice(text: str, merchant_id: str = None) -> dict:
    """
    Extract invoice data from plain text (e.g. OCR output) using Groq LLM.
    """
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": INVOICE_EXTRACTION_PROMPT},
            {"role": "user", "content": f"Extract invoice data from this text:\n\n{text}"},
        ],
        "temperature": 0.1,
        "max_tokens": 800,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code != 200:
            return {"data": None, "error": f"Groq API error: {resp.status_code}"}

        raw = resp.json()["choices"][0]["message"]["content"].strip()
        data = json.loads(raw)
        return {"data": data, "provider": "groq", "error": None}
    except Exception as e:
        logger.error("Text invoice extraction failed: %s", e)
        return {"data": None, "error": str(e)}
