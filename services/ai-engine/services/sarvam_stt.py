"""
Sarvam AI STT client for MunimAI.
Adapted from munimai-sarvam-stt repo -- standalone version using MunimAI config.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


@dataclass
class SarvamError(Exception):
    message: str
    status_code: Optional[int] = None
    payload: Optional[dict[str, Any]] = None

    def __str__(self) -> str:
        return f"{self.status_code}: {self.message}" if self.status_code else self.message


class SarvamSTTClient:
    def __init__(self, api_key: str, base_url: str = "https://api.sarvam.ai", model: str = "whisper-large-v3") -> None:
        if not api_key:
            raise SarvamError("SARVAM_API_KEY is not configured")

        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = 60.0

        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            headers={"Authorization": f"Bearer {self._api_key}"},
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def transcribe_bytes(
        self,
        audio_bytes: bytes,
        filename: str,
        language: str,
        diarize: bool = False,
        punctuate: bool = True,
        extra_payload: Optional[Dict[str, Any]] = None,
    ) -> dict:
        """
        Call Sarvam STT on in-memory audio bytes.
        Returns: {text, language, segments}
        """
        files = {"file": (filename, audio_bytes)}
        data: dict[str, Any] = {
            "model": self._model,
            "language": language,
            "diarize": diarize,
            "punctuate": punctuate,
        }
        if extra_payload:
            data.update(extra_payload)

        try:
            resp = await self._client.post("/stt", files=files, data=data)
        except httpx.RequestError as exc:
            raise SarvamError(f"Network error calling Sarvam STT: {exc}") from exc

        if resp.status_code >= 400:
            try:
                payload = resp.json()
            except Exception:
                payload = None
            raise SarvamError(
                message=f"Sarvam STT HTTP {resp.status_code}: {resp.text}",
                status_code=resp.status_code,
                payload=payload,
            )

        body = resp.json()
        text = body.get("text") or body.get("transcript") or ""
        language_out = body.get("language", language)
        segments_raw = body.get("segments") or []
        segments = [
            {"start": seg.get("start"), "end": seg.get("end"), "text": seg.get("text", "")}
            for seg in segments_raw
            if seg.get("text")
        ]

        return {"text": text, "language": language_out, "segments": segments or None}


_sarvam_client: SarvamSTTClient | None = None


def reset_sarvam_client() -> None:
    global _sarvam_client
    _sarvam_client = None


def get_sarvam_client(api_key: str) -> SarvamSTTClient:
    """Lazy singleton for SarvamSTTClient."""
    global _sarvam_client
    if _sarvam_client is None:
        _sarvam_client = SarvamSTTClient(api_key)
    return _sarvam_client
