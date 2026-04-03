"""
MunimAI NLU (Natural Language Understanding) module.

Provides voice and text processing pipelines for Hindi/Hinglish input
from small Indian shopkeepers.
"""

from services.nlu.pipeline import NLUResult, process_voice, process_text
from services.nlu.intent_classifier import IntentResult, classify_intent
from services.nlu.entity_extractor import extract_entities
from services.nlu.stt_engine import transcribe
from services.nlu.hindi_numerals import parse_hindi_amount
from services.nlu.code_switch_handler import normalize_hinglish

__all__ = [
    "NLUResult",
    "IntentResult",
    "process_voice",
    "process_text",
    "classify_intent",
    "extract_entities",
    "transcribe",
    "parse_hindi_amount",
    "normalize_hinglish",
]
