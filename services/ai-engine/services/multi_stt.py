"""
Multi-provider STT service for MunimAI.
Providers: Groq Whisper (free) -> ElevenLabs Scribe v2 -> Sarvam AI -> OpenAI Whisper (paid fallback)
"""
import logging
import io
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


async def transcribe_multi(
    audio_bytes: bytes,
    language: str = "hi",
    filename: str = "audio.webm",
    preferred_provider: Optional[str] = None,
) -> dict:
    """
    Transcribe audio using multiple providers with automatic fallback.

    Args:
        audio_bytes: Raw audio data.
        language: Language hint (default "hi" for Hindi).
        filename: Original filename for MIME type detection.
        preferred_provider: If set, try this provider first.
            One of: "openai_whisper", "elevenlabs", "sarvam", "groq_whisper", or None for auto.

    Returns: {text, provider, language, segments}
    """
    settings = get_settings()
    errors = []

    # Build provider order: free/cheap first, OpenAI (paid) last as fallback
    providers = [
        ("groq_whisper", _groq_whisper),
        ("elevenlabs", _elevenlabs_scribe),
        ("sarvam", _sarvam_stt),
        ("openai_whisper", _openai_whisper),
    ]

    # If a preferred provider is specified, move it to the front
    if preferred_provider:
        providers.sort(key=lambda p: 0 if p[0] == preferred_provider else 1)

    for provider_name, provider_fn in providers:
        # Check if API key exists for the provider
        if provider_name == "openai_whisper" and not settings.openai_api_key:
            continue
        if provider_name == "elevenlabs" and not settings.elevenlabs_api_key:
            continue
        if provider_name == "sarvam" and not settings.sarvam_api_key:
            continue
        if provider_name == "groq_whisper" and not settings.groq_api_key:
            continue

        try:
            result = await provider_fn(audio_bytes, language, filename, settings)
            if result and result.get("text", "").strip():
                return {**result, "provider": provider_name}
        except Exception as e:
            logger.warning("STT provider %s failed: %s", provider_name, e)
            errors.append(f"{provider_name}: {e}")

    raise Exception(f"All STT providers failed: {'; '.join(errors)}")


async def _openai_whisper(audio_bytes: bytes, language: str, filename: str, settings) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            files={"file": (filename, io.BytesIO(audio_bytes), "audio/webm")},
            data={"model": "whisper-1", "language": language, "response_format": "text"},
        )
    if resp.status_code == 200 and resp.text.strip():
        return {"text": resp.text.strip(), "language": language, "segments": None}
    return None


async def _elevenlabs_scribe(audio_bytes: bytes, language: str, filename: str, settings) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": settings.elevenlabs_api_key},
            files={"file": (filename, audio_bytes)},
            data={"model_id": "scribe_v2", "language_code": language},
        )
    if resp.status_code == 200:
        body = resp.json()
        # Handle both response formats
        text = body.get("text", "")
        if not text and "transcripts" in body:
            text = body["transcripts"][0].get("text", "") if body["transcripts"] else ""
        segments = []
        for w in body.get("words", []):
            if w.get("text") and w.get("type") == "word":
                segments.append({"start": w.get("start"), "end": w.get("end"), "text": w["text"]})
        if text.strip():
            return {"text": text.strip(), "language": language, "segments": segments or None}
    return None


async def _sarvam_stt(audio_bytes: bytes, language: str, filename: str, settings) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.sarvam.ai/stt",
            headers={"Authorization": f"Bearer {settings.sarvam_api_key}"},
            files={"file": (filename, audio_bytes)},
            data={"model": "whisper-large-v3", "language": language},
        )
    if resp.status_code == 200:
        body = resp.json()
        text = body.get("text") or body.get("transcript") or ""
        if text.strip():
            return {"text": text.strip(), "language": body.get("language", language), "segments": None}
    return None


async def _groq_whisper(audio_bytes: bytes, language: str, filename: str, settings) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            files={"file": (filename, io.BytesIO(audio_bytes), "audio/webm")},
            data={"model": settings.groq_whisper_model, "language": language, "response_format": "text"},
        )
    if resp.status_code == 200 and resp.text.strip():
        return {"text": resp.text.strip(), "language": language, "segments": None}
    return None
