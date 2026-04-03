"""
MunimAI Text-to-Speech Service

Primary: Sarvam Bulbul (Hindi-optimized, 2B parameter Indic TTS)
Fallback: Browser SpeechSynthesis API (handled frontend-side)

The "Muneem Personality" voice:
- Respectful, uses merchant's name
- Business-savvy, concise
- Warm but professional
"""

import httpx
import base64
from typing import Optional

from config import get_settings

settings = get_settings()


async def synthesize_hindi(text: str, voice: str = "meera") -> Optional[bytes]:
    """
    Convert Hindi text to speech audio.

    Args:
        text: Hindi text to synthesize
        voice: Voice model ("meera" = female, "arvind" = male)

    Returns:
        Audio bytes (wav format) or None if service unavailable
    """
    if not settings.sarvam_api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.sarvam.ai/text-to-speech",
                headers={
                    "api-subscription-key": settings.sarvam_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "inputs": [text],
                    "target_language_code": "hi-IN",
                    "speaker": voice,
                    "pitch": 0,
                    "pace": 1.0,
                    "loudness": 1.5,
                    "speech_sample_rate": 22050,
                    "enable_preprocessing": True,
                    "model": "bulbul:v1",
                },
            )

            if response.status_code == 200:
                data = response.json()
                if "audios" in data and data["audios"]:
                    audio_b64 = data["audios"][0]
                    return base64.b64decode(audio_b64)

            return None

    except Exception as e:
        print(f"TTS Error: {e}")
        return None


async def generate_voice_confirmation(
    action_type: str,
    amount: Optional[float] = None,
    person: Optional[str] = None,
    summary: Optional[str] = None,
) -> str:
    """
    Generate Hindi voice confirmation text for Soundbox speaker.

    Returns text (synthesis done separately or on frontend).
    """
    confirmations = {
        "income_added": f"Rs {amount:,.0f} income note kar liya." if amount else "Income note kar liya.",
        "expense_added": f"Rs {amount:,.0f} kharcha mein daal diya." if amount else "Kharcha note kar liya.",
        "udhari_created": f"{person} ka Rs {amount:,.0f} udhari note kar liya. Remind karoonga." if person and amount else "Udhari note kar liya.",
        "udhari_settled": f"{person} ne Rs {amount:,.0f} wapas kar diya. Udhari settle ho gaya." if person and amount else "Udhari settle ho gaya.",
        "reminder_sent": f"{person} ko reminder bhej diya." if person else "Reminders bhej diye.",
        "query_response": summary or "Ye raha aapka hisaab.",
    }

    return confirmations.get(action_type, "Note kar liya.")


# Pre-recorded audio phrases for demo (fallback when TTS is unavailable)
DEMO_AUDIO_PHRASES = {
    "greeting": "Namaste! Main aapka MunimAI hoon.",
    "rent_logged": "Rs 5,000 rent mein daal diya. Aaj ka total kharcha Rs 12,400.",
    "income_received": "Paytm se payment mila. Income update ho gayi.",
    "udhari_created": "Udhari note kar liya. 3 din baad remind karoonga.",
    "udhari_collected": "Payment aa gaya! Udhari settle ho gaya.",
    "reminders_sent": "3 reminders bhej diye. Paytm link bhi bheja hai.",
    "day_summary": "Aaj Rs 34,500 ki sale hui. Kharcha Rs 12,400. Munafa Rs 22,100. Margin 64 percent.",
    "profit_negative": "Aaj ka profit negative ho gaya. Udhari collection tez karein?",
}
