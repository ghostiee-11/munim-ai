"""
NLU Pipeline orchestrator for MunimAI.

Processes voice or text input through: noise reduction → STT → intent
classification → entity extraction → structured result.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from services.nlu.stt_engine import transcribe
from services.nlu.intent_classifier import classify_intent, IntentResult
from services.nlu.entity_extractor import extract_entities
from services.nlu.code_switch_handler import normalize_hinglish

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class NLUResult:
    """Structured output of the NLU pipeline."""
    transcript: str
    intent: str
    confidence: float
    entities: dict = field(default_factory=lambda: {
        "amount": None,
        "person": None,
        "category": None,
        "date": None,
        "product": None,
    })
    response_hindi: str = ""
    raw_llm_output: Optional[str] = None
    needs_clarification: bool = False
    clarification_prompt: Optional[str] = None
    processing_time_ms: float = 0.0
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Hindi response templates per intent
# ---------------------------------------------------------------------------

RESPONSE_TEMPLATES: dict[str, str] = {
    "CASH_RECEIVED": "{person} se {amount} rupaye mile. Likha gaya.",
    "EXPENSE_LOG": "{category} pe {amount} rupaye kharcha likha gaya.",
    "UDHARI_CREATE": "{person} ko {amount} rupaye ki udhari likhi gayi.",
    "UDHARI_SETTLE": "{person} ki {amount} rupaye ki udhari chukta ho gayi.",
    "QUERY_SUMMARY": "Aapka {date} ka hisaab tayyaar hai.",
    "QUERY_PROFIT": "Aapka {date} ka munafa nikal raha hai.",
    "QUERY_EXPENSE": "Aapka {date} ka kharcha dikhaya ja raha hai.",
    "QUERY_CUSTOMER": "{person} ka hisaab dikhaya ja raha hai.",
    "COMMAND_REMIND": "{person} ke liye {date} ko reminder set kiya gaya.",
    "COMMAND_GST": "GST ka kaam shuru kiya ja raha hai.",
    "PAYMENT_TAG": "Payment ko {category} me tag kiya gaya.",
    "GENERAL": "Main aapki kya madad kar sakta hoon?",
}


def _build_response_hindi(intent: str, entities: dict) -> str:
    """Build a Hindi response string from intent and entities."""
    template = RESPONSE_TEMPLATES.get(intent, RESPONSE_TEMPLATES["GENERAL"])

    # Fill in entity values, replacing missing ones with placeholders
    person = entities.get("person") or "unhe"
    amount = entities.get("amount")
    amount_str = str(amount) if amount else "raqam"
    category = entities.get("category") or "item"
    date = entities.get("date") or "aaj"

    try:
        return template.format(
            person=person,
            amount=amount_str,
            category=category,
            date=date,
        )
    except (KeyError, IndexError):
        return template


# ---------------------------------------------------------------------------
# Pipeline functions
# ---------------------------------------------------------------------------

async def process_voice(audio_bytes: bytes) -> NLUResult:
    """
    Full NLU pipeline for voice input.

    Steps: noise reduce -> STT -> normalize Hinglish -> intent classify ->
    entity extract -> build response.

    Args:
        audio_bytes: Raw audio data (WAV or WebM).

    Returns:
        NLUResult with all fields populated.
    """
    start = time.monotonic()

    if not audio_bytes:
        return NLUResult(
            transcript="",
            intent="GENERAL",
            confidence=0.0,
            error="Empty audio input",
            processing_time_ms=0.0,
        )

    # Step 1: Speech-to-Text (includes noise reduction)
    try:
        transcript = await transcribe(audio_bytes)
    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        logger.error("STT failed: %s", e)
        return NLUResult(
            transcript="",
            intent="GENERAL",
            confidence=0.0,
            error=f"Speech-to-text failed: {e}",
            response_hindi="Awaaz samajh nahi aayi, kya aap dobara bol sakte hain?",
            processing_time_ms=elapsed,
        )

    if not transcript or not transcript.strip():
        elapsed = (time.monotonic() - start) * 1000
        return NLUResult(
            transcript="",
            intent="GENERAL",
            confidence=0.0,
            error="Empty transcription — no speech detected",
            response_hindi="Kuch sunai nahi diya, kya aap dobara bol sakte hain?",
            processing_time_ms=elapsed,
        )

    # Continue with text pipeline
    result = await _process_text_internal(transcript, start)
    return result


async def process_text(text: str) -> NLUResult:
    """
    NLU pipeline for text input (skip STT).

    Steps: normalize Hinglish -> intent classify -> entity extract -> build response.

    Args:
        text: User text input (Hindi/Hinglish).

    Returns:
        NLUResult with all fields populated.
    """
    start = time.monotonic()

    if not text or not text.strip():
        return NLUResult(
            transcript="",
            intent="GENERAL",
            confidence=0.0,
            error="Empty text input",
            processing_time_ms=0.0,
        )

    return await _process_text_internal(text.strip(), start)


async def _process_text_internal(transcript: str, start: float) -> NLUResult:
    """
    Internal shared pipeline for text processing (after STT or direct text).
    """
    # Step 2: Normalize Hinglish code-switching
    normalized = normalize_hinglish(transcript)
    logger.info("Normalized text: '%s'", normalized)

    # Step 3: Intent classification
    try:
        intent_result: IntentResult = await classify_intent(normalized)
    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        logger.error("Intent classification failed: %s", e)
        return NLUResult(
            transcript=transcript,
            intent="GENERAL",
            confidence=0.0,
            error=f"Intent classification failed: {e}",
            response_hindi="Samajh nahi aaya, kya aap dobara bata sakte hain?",
            processing_time_ms=elapsed,
        )

    # Step 4: Entity extraction
    try:
        entities = await extract_entities(normalized, intent_result.intent)
    except Exception as e:
        logger.warning("Entity extraction failed (continuing without entities): %s", e)
        entities = {
            "amount": None,
            "person": None,
            "category": None,
            "date": None,
            "product": None,
        }

    # Step 5: Build Hindi response
    if intent_result.needs_clarification:
        response_hindi = intent_result.clarification_prompt or \
            "Thoda aur detail bataiye?"
    else:
        response_hindi = _build_response_hindi(intent_result.intent, entities)

    elapsed = (time.monotonic() - start) * 1000

    result = NLUResult(
        transcript=transcript,
        intent=intent_result.intent,
        confidence=intent_result.confidence,
        entities=entities,
        response_hindi=response_hindi,
        needs_clarification=intent_result.needs_clarification,
        clarification_prompt=intent_result.clarification_prompt,
        processing_time_ms=elapsed,
    )

    logger.info(
        "NLU pipeline complete in %.1fms: intent=%s (%.2f), entities=%s",
        elapsed,
        result.intent,
        result.confidence,
        result.entities,
    )

    return result
