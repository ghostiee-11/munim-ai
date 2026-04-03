"""
Google Gemini multimodal STT client for MunimAI.
Adapted from munimai-sarvam-stt repo -- standalone version using MunimAI config.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class GeminiSttError(Exception):
    message: str

    def __str__(self) -> str:
        return self.message


class GeminiSttClient:
    def __init__(self, api_key: str) -> None:
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            self._model = genai.GenerativeModel("models/gemini-1.5-flash")
        except Exception as exc:
            raise GeminiSttError(f"Failed to configure Gemini client: {exc}") from exc

    async def transcribe_bytes(
        self,
        audio_bytes: bytes,
        filename: str,
        language: Optional[str] = None,
    ) -> dict:
        """
        Use Gemini multimodal model to get a transcript for the given audio bytes.
        Returns: {text, language, segments}
        """
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = filename

        try:
            response = self._model.generate_content(
                [
                    "Transcribe this audio. Respond with only the raw transcript text, no explanations.",
                    {"mime_type": "audio/wav", "data": audio_file.read()},
                ]
            )
        except Exception as exc:
            raise GeminiSttError(f"Gemini STT failed: {exc}") from exc

        text = (response.text or "").strip()
        return {"text": text, "language": language or "unknown", "segments": None}


_gemini_stt_client: GeminiSttClient | None = None


def get_gemini_stt_client(api_key: str) -> GeminiSttClient:
    global _gemini_stt_client
    if _gemini_stt_client is None:
        _gemini_stt_client = GeminiSttClient(api_key)
    return _gemini_stt_client
