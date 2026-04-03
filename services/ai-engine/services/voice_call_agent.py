"""
MunimAI Voice Call Agent for Udhari Collection

Makes automated Hindi voice calls to debtors using Twilio.
The AI speaks a culturally-aware Hindi message reminding the debtor
about their pending payment, and provides a Paytm payment link via SMS.

Flow:
1. MunimAI decides to call a debtor (via Thompson Sampling RL)
2. Twilio initiates a call to the debtor's phone
3. Twilio plays a TTS message in Hindi (using Sarvam Bulbul or Twilio's Hindi voice)
4. After the call, sends a follow-up SMS/WhatsApp with the Paytm payment link
5. Tracks whether the debtor answered, listened, or hung up (reward signal for RL)

Twilio Free Trial:
- $15.50 free credit
- Get a test number at https://console.twilio.com
- Supports India calls + SMS
- Voice TTS in Hindi (basic) or use pre-recorded audio

Alternative (no Twilio):
- Use browser-based SpeechSynthesis for demo
- Show the call UI on screen instead of making a real call
"""

import logging
from typing import Optional
from datetime import datetime

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Twilio config (add to .env)
TWILIO_ACCOUNT_SID = ""  # From https://console.twilio.com
TWILIO_AUTH_TOKEN = ""
TWILIO_PHONE_NUMBER = ""  # Your Twilio number


async def make_collection_call(
    debtor_name: str,
    debtor_phone: str,
    amount: float,
    merchant_name: str = "Sunita Saree Shop",
    merchant_owner: str = "Sunita ji",
    payment_link: str = "",
    tone: str = "polite_follow_up",
) -> dict:
    """
    Make an automated voice call to a debtor for udhari collection.

    Returns call status and metadata.
    """
    # Generate the Hindi TTS script
    script = _generate_call_script(
        debtor_name=debtor_name,
        amount=amount,
        merchant_name=merchant_name,
        merchant_owner=merchant_owner,
        tone=tone,
    )

    # For demo: simulate the call
    call_result = {
        "success": True,
        "call_id": f"CALL_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "debtor_name": debtor_name,
        "debtor_phone": debtor_phone,
        "amount": amount,
        "script": script,
        "status": "initiated",
        "duration": 0,
        "answered": False,
        "tone": tone,
        "payment_link": payment_link,
        "timestamp": datetime.now().isoformat(),
        "mode": "demo",  # "demo" or "twilio"
    }

    # If Twilio credentials are available, make a real call
    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
        try:
            call_result = await _make_twilio_call(
                phone=debtor_phone,
                script=script,
                payment_link=payment_link,
            )
            call_result["mode"] = "twilio"
        except Exception as e:
            logger.error(f"Twilio call failed: {e}")
            call_result["error"] = str(e)

    logger.info(f"Collection call: {debtor_name} ({debtor_phone}) — {call_result['status']}")
    return call_result


def _generate_call_script(
    debtor_name: str,
    amount: float,
    merchant_name: str,
    merchant_owner: str,
    tone: str,
) -> str:
    """Generate Hindi TTS script for the collection call."""
    scripts = {
        "friendly_reminder": (
            f"Namaste {debtor_name}! "
            f"Yeh {merchant_name} ki taraf se ek yaad-dahaani hai. "
            f"Aapke Rs {amount:,.0f} abhi pending hain. "
            f"Aapki suvidha anusaar, Paytm link SMS mein bheja ja raha hai. "
            f"Dhanyavaad!"
        ),
        "polite_follow_up": (
            f"Namaste {debtor_name}! "
            f"{merchant_owner} ki taraf se baat kar raha hoon. "
            f"Rs {amount:,.0f} ka payment abhi tak pending hai. "
            f"Kripya jaldi se jaldi bhej dijiye. "
            f"Paytm payment link SMS mein mil jayega. Shukriya!"
        ),
        "firm_request": (
            f"Namaste {debtor_name}! "
            f"Yeh {merchant_name} se ek zaroori message hai. "
            f"Rs {amount:,.0f} kaafi samay se pending hain. "
            f"Kripya aaj hi settle karein. "
            f"Payment link SMS mein bheja ja raha hai. Dhanyavaad."
        ),
        "urgent_notice": (
            f"Namaste {debtor_name}! "
            f"Rs {amount:,.0f} ka payment bahut time se pending hai. "
            f"Yeh last reminder hai. "
            f"Kripya turant payment karein. Link SMS mein hai."
        ),
    }
    return scripts.get(tone, scripts["polite_follow_up"])


async def _make_twilio_call(
    phone: str,
    script: str,
    payment_link: str,
) -> dict:
    """
    Make actual Twilio call.

    Requires: pip install twilio
    """
    try:
        from twilio.rest import Client

        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        # Create TwiML for the voice call
        twiml = f"""
        <Response>
            <Say language="hi-IN" voice="Polly.Aditi">
                {script}
            </Say>
            <Pause length="2"/>
            <Say language="hi-IN" voice="Polly.Aditi">
                Agar aapko koi samasya hai, toh kripya {TWILIO_PHONE_NUMBER} par call karein.
            </Say>
        </Response>
        """

        call = client.calls.create(
            twiml=twiml,
            to=phone,
            from_=TWILIO_PHONE_NUMBER,
        )

        # Also send SMS with payment link
        if payment_link:
            client.messages.create(
                body=f"Namaste! Aapke Rs pending hain. Pay karein: {payment_link}",
                to=phone,
                from_=TWILIO_PHONE_NUMBER,
            )

        return {
            "success": True,
            "call_id": call.sid,
            "status": call.status,
            "debtor_phone": phone,
            "script": script,
        }

    except ImportError:
        logger.warning("Twilio not installed. Run: pip install twilio")
        return {"success": False, "error": "Twilio not installed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def simulate_call(
    debtor_name: str,
    amount: float,
    tone: str = "polite_follow_up",
) -> dict:
    """
    Simulate a voice call for demo purposes.
    Returns the script and simulated status.
    """
    script = _generate_call_script(
        debtor_name=debtor_name,
        amount=amount,
        merchant_name="Sunita Saree Shop",
        merchant_owner="Sunita ji",
        tone=tone,
    )

    return {
        "success": True,
        "mode": "simulation",
        "debtor_name": debtor_name,
        "amount": amount,
        "script": script,
        "tone": tone,
        "status": "completed",
        "duration_seconds": 24,
        "answered": True,
        "listened_fully": True,
        "sms_sent": True,
        "timestamp": datetime.now().isoformat(),
    }
