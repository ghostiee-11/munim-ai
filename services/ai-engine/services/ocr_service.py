"""
OCR Service for invoice and khata image processing.

Pipeline: Image → Vision LLM (OpenAI / Groq / Gemini) → Structured JSON
Extracts items, quantities, prices, vendor info from invoice photos.
"""

import base64
import json
import logging
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

INVOICE_EXTRACTION_PROMPT = """You are an expert invoice/receipt data extractor for Indian small businesses.
Look at this invoice/receipt image carefully and extract ALL items and details.

Return ONLY valid JSON in this exact format:
{
  "vendor": "Vendor/Shop name if visible",
  "date": "YYYY-MM-DD or as shown on invoice",
  "invoice_number": "Invoice number if visible",
  "gst_number": "GST number if visible, else null",
  "items": [
    {"name": "Item name", "qty": 1, "rate": 100.0, "amount": 100.0, "unit": "pcs"}
  ],
  "subtotal": 0.0,
  "tax": 0.0,
  "total": 0.0,
  "payment_mode": "cash/upi/card/unknown",
  "notes": "Any additional notes"
}

Rules:
- Extract EVERY item line you can see
- If qty is not visible, assume 1
- If rate is not visible but amount is, use amount as rate
- For handwritten invoices, do your best to read the text
- Indian currency (Rs/₹) amounts
- Return ONLY valid JSON, no explanation or markdown"""

KHATA_EXTRACTION_PROMPT = """You are an OCR expert for Indian khata (credit ledger) pages.
Look at this handwritten khata image and extract all credit entries.

Return ONLY valid JSON:
{
  "entries": [
    {"customer_name": "Name", "amount": 500, "description": "Items purchased", "date": "if visible"}
  ],
  "total": 0.0,
  "page_notes": "any general notes"
}

Return ONLY valid JSON, no explanation."""


async def extract_invoice_data(
    image_url_or_bytes,
    merchant_id: str = None,
    extraction_type: str = "invoice",
) -> dict:
    """
    Extract invoice/khata data from an image using vision LLMs.

    Tries in order: OpenAI GPT-4o-mini → Groq Llama 4 Scout → Gemini Flash
    """
    prompt = INVOICE_EXTRACTION_PROMPT if extraction_type == "invoice" else KHATA_EXTRACTION_PROMPT

    # Normalize image to base64 string
    if isinstance(image_url_or_bytes, bytes):
        b64 = base64.b64encode(image_url_or_bytes).decode("utf-8")
    elif isinstance(image_url_or_bytes, str) and image_url_or_bytes.startswith("http"):
        # URL - download first
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(image_url_or_bytes)
                b64 = base64.b64encode(resp.content).decode("utf-8")
        except Exception as e:
            logger.error("Failed to download image: %s", e)
            return {"error": f"Failed to download image: {e}", "data": None}
    elif isinstance(image_url_or_bytes, str):
        # Already base64
        b64 = image_url_or_bytes
    else:
        return {"error": "Invalid image input", "data": None}

    # Try providers in order
    providers = []

    if settings.openai_api_key:
        providers.append(("openai", _extract_with_openai))
    if settings.groq_api_key:
        providers.append(("groq", _extract_with_groq_vision))
    if settings.gemini_api_key:
        providers.append(("gemini", _extract_with_gemini))

    for provider_name, extract_fn in providers:
        try:
            result = await extract_fn(prompt, b64)
            if result and not result.get("parse_error"):
                logger.info("Invoice extracted via %s for merchant %s", provider_name, merchant_id)
                return {"data": result, "provider": provider_name, "error": None}
            elif result and result.get("parse_error"):
                logger.warning("%s returned unparseable response, trying next", provider_name)
                continue
        except Exception as e:
            logger.warning("%s vision extraction failed: %s", provider_name, e)
            continue

    return {
        "data": None,
        "provider": None,
        "error": "All vision providers failed. Check API keys and image quality.",
    }


async def _extract_with_openai(prompt: str, b64_image: str) -> Optional[dict]:
    """Use OpenAI GPT-4o-mini vision."""
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
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}", "detail": "high"},
                    },
                ],
            }
        ],
        "max_tokens": 1500,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        logger.error("OpenAI API error: %s %s", resp.status_code, resp.text[:200])
        return None

    return _parse_json_response(resp.json()["choices"][0]["message"]["content"])


async def _extract_with_groq_vision(prompt: str, b64_image: str) -> Optional[dict]:
    """Use Groq Llama 4 Scout (vision-capable model)."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64_image}"},
                    },
                ],
            }
        ],
        "max_tokens": 1500,
        "temperature": 0.1,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        logger.error("Groq vision API error: %s %s", resp.status_code, resp.text[:200])
        return None

    return _parse_json_response(resp.json()["choices"][0]["message"]["content"])


async def _extract_with_gemini(prompt: str, b64_image: str) -> Optional[dict]:
    """Use Google Gemini Flash vision."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={settings.gemini_api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": b64_image,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1500,
        },
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        logger.error("Gemini API error: %s %s", resp.status_code, resp.text[:200])
        return None

    try:
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_json_response(text)
    except (KeyError, IndexError) as e:
        logger.error("Gemini response parse error: %s", e)
        return None


def _parse_json_response(raw_text: str) -> Optional[dict]:
    """Parse JSON from LLM response, stripping markdown fences if present."""
    raw_text = raw_text.strip()

    # Strip markdown code fences
    if raw_text.startswith("```"):
        lines = raw_text.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's ```)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw_text = "\n".join(lines).strip()

    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(raw_text[start:end])
            except json.JSONDecodeError:
                pass
        logger.error("Failed to parse JSON from LLM: %s", raw_text[:300])
        return {"raw_text": raw_text, "parse_error": True}


async def extract_text_invoice(text: str, merchant_id: str = None) -> dict:
    """Extract invoice data from plain text (e.g. OCR output) using Groq LLM."""
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
