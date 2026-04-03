"""
Speech-to-Text engine for MunimAI.

Primary: Groq Whisper API (whisper-large-v3) with language="hi".
Applies noise reduction via `noisereduce` before sending audio to the API.
"""

import io
import logging
import struct
import wave
from typing import Optional

import numpy as np

try:
    import noisereduce as nr
    HAS_NOISEREDUCE = True
except ImportError:
    HAS_NOISEREDUCE = False

from groq import AsyncGroq

from config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def _wav_bytes_to_numpy(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    """Convert WAV bytes to a numpy float32 array and sample rate."""
    buf = io.BytesIO(audio_bytes)
    with wave.open(buf, "rb") as wf:
        sample_rate = wf.getframerate()
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    if sample_width == 2:
        fmt = f"<{n_frames * n_channels}h"
        samples = np.array(struct.unpack(fmt, raw), dtype=np.float32) / 32768.0
    elif sample_width == 4:
        fmt = f"<{n_frames * n_channels}i"
        samples = np.array(struct.unpack(fmt, raw), dtype=np.float32) / 2147483648.0
    else:
        # Fallback: treat as raw int16
        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0

    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)

    return samples, sample_rate


def _numpy_to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    """Convert numpy float32 array back to WAV bytes."""
    audio = np.clip(audio, -1.0, 1.0)
    int_samples = (audio * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int_samples.tobytes())
    return buf.getvalue()


def _is_wav(audio_bytes: bytes) -> bool:
    """Check if bytes start with WAV header."""
    return audio_bytes[:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE"


def _reduce_noise(audio_bytes: bytes) -> bytes:
    """
    Apply noise reduction to audio bytes.
    If audio is WAV, process through noisereduce.
    For non-WAV (e.g. webm), return as-is (Whisper handles it).
    """
    if not HAS_NOISEREDUCE:
        logger.warning("noisereduce not installed; skipping noise reduction")
        return audio_bytes

    if not _is_wav(audio_bytes):
        logger.debug("Non-WAV audio detected; skipping noise reduction (format handled by Whisper)")
        return audio_bytes

    try:
        audio_np, sr = _wav_bytes_to_numpy(audio_bytes)
        reduced = nr.reduce_noise(y=audio_np, sr=sr, prop_decrease=0.6)
        return _numpy_to_wav_bytes(reduced, sr)
    except Exception as e:
        logger.warning("Noise reduction failed, using original audio: %s", e)
        return audio_bytes


# ---------------------------------------------------------------------------
# STT Engine
# ---------------------------------------------------------------------------

_client: Optional[AsyncGroq] = None


def _get_client() -> AsyncGroq:
    global _client
    if _client is None:
        settings = get_settings()
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


async def transcribe(audio_bytes: bytes) -> str:
    """
    Transcribe audio bytes to Hindi text using Groq Whisper API.

    Accepts both WAV and WebM formats.
    Applies noise reduction for WAV audio before transcription.

    Args:
        audio_bytes: Raw audio bytes (WAV or WebM).

    Returns:
        Transcribed text string.

    Raises:
        ValueError: If audio_bytes is empty.
        RuntimeError: If transcription fails.
    """
    if not audio_bytes:
        raise ValueError("Empty audio bytes provided")

    settings = get_settings()

    # Noise reduction (WAV only)
    processed_audio = _reduce_noise(audio_bytes)

    # Determine file extension for API
    if _is_wav(processed_audio):
        filename = "audio.wav"
        content_type = "audio/wav"
    else:
        filename = "audio.webm"
        content_type = "audio/webm"

    logger.info(
        "Transcribing audio: %d bytes, format=%s",
        len(processed_audio),
        filename,
    )

    try:
        client = _get_client()
        transcription = await client.audio.transcriptions.create(
            file=(filename, processed_audio),
            model=settings.groq_whisper_model,
            language="hi",
            response_format="text",
            prompt=(
                "यह एक भारतीय दुकानदार की आवाज़ है जो हिंदी या हिंगलिश में "
                "बोल रहा है। इसमें पैसों के लेनदेन, उधारी, खर्चे, और "
                "कारोबार से जुड़ी बातें हो सकती हैं।"
            ),
        )

        text = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()

        logger.info("Transcription result: '%s'", text)
        return text

    except Exception as e:
        logger.error("Groq Whisper transcription failed: %s", e, exc_info=True)
        raise RuntimeError(f"Speech-to-text failed: {e}") from e
