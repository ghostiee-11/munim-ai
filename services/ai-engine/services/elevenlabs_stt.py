"""
ElevenLabs Scribe v2 STT client for MunimAI.
Adapted from munimai-sarvam-stt repo -- standalone version using MunimAI config.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, List, Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class ElevenLabsSttError(Exception):
    message: str
    status_code: Optional[int] = None
    payload: Optional[dict[str, Any]] = None

    def __str__(self) -> str:
        return f"{self.status_code}: {self.message}" if self.status_code else self.message


class ElevenLabsSTTClient:
    """
    ElevenLabs Speech-to-Text (POST /v1/speech-to-text).
    Docs: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
    """

    def __init__(self, api_key: str, base_url: str = "https://api.elevenlabs.io", model: str = "scribe_v2") -> None:
        if not api_key:
            raise ElevenLabsSttError("ELEVENLABS_API_KEY is not configured")

        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = 120.0

        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            headers={"xi-api-key": self._api_key},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def transcribe_bytes(
        self,
        audio_bytes: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> dict:
        """
        Transcribe audio bytes via ElevenLabs Scribe v2.
        Returns: {text, language, segments}
        """
        files = {"file": (filename, audio_bytes)}
        data: dict[str, Any] = {"model_id": self._model}
        if language:
            data["language_code"] = language

        try:
            resp = await self._client.post("/v1/speech-to-text", files=files, data=data)
        except httpx.RequestError as exc:
            raise ElevenLabsSttError(f"Network error calling ElevenLabs STT: {exc}") from exc

        if resp.status_code >= 400:
            try:
                payload = resp.json()
            except Exception:
                payload = None
            raise ElevenLabsSttError(
                message=f"ElevenLabs STT HTTP {resp.status_code}: {resp.text}",
                status_code=resp.status_code,
                payload=payload,
            )

        body = resp.json()
        chunk = _extract_transcript_chunk(body)
        text = (chunk.get("text") or "").strip()
        language_out = chunk.get("language_code") or language or "unknown"

        words = chunk.get("words") or []
        segments: list[dict] | None = None
        if words:
            segments = [
                {"start": w.get("start"), "end": w.get("end"), "text": w.get("text", "")}
                for w in words
                if w.get("text") and w.get("type") == "word"
            ]
            if not segments:
                segments = None

        return {"text": text, "language": str(language_out), "segments": segments}


def _extract_transcript_chunk(body: dict[str, Any]) -> dict[str, Any]:
    if "text" in body and "words" in body:
        return body
    transcripts = body.get("transcripts")
    if isinstance(transcripts, list) and transcripts:
        first = transcripts[0]
        if isinstance(first, dict):
            return first
    return body


_elevenlabs_client: ElevenLabsSTTClient | None = None


def get_elevenlabs_stt_client(api_key: str) -> ElevenLabsSTTClient:
    global _elevenlabs_client
    if _elevenlabs_client is None:
        _elevenlabs_client = ElevenLabsSTTClient(api_key)
    return _elevenlabs_client
