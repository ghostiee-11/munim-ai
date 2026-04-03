"""
Unified Twilio service for WhatsApp, SMS, and Voice calls.

Uses the Twilio Sandbox for WhatsApp in development mode.
"""

import logging
from typing import Optional

from twilio.rest import Client

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def get_twilio_client() -> Optional[Client]:
    """Return an authenticated Twilio client, or None if not configured."""
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        return None
    return Client(settings.twilio_account_sid, settings.twilio_auth_token)


async def send_whatsapp(to: str, body: str, media_url: str = None) -> dict:
    """Send a WhatsApp message via the Twilio Sandbox."""
    client = get_twilio_client()
    if not client:
        logger.warning("Twilio not configured, skipping WhatsApp send")
        return {"status": "skipped", "reason": "Twilio not configured"}

    # Ensure proper whatsapp: prefix for sandbox
    from_number = settings.twilio_whatsapp_number  # whatsapp:+14155238886
    to_number = f"whatsapp:{to}" if not to.startswith("whatsapp:") else to

    kwargs = {"from_": from_number, "to": to_number, "body": body}
    if media_url:
        kwargs["media_url"] = [media_url]

    try:
        message = client.messages.create(**kwargs)
        logger.info("WhatsApp sent: %s to %s", message.sid, to)
        return {"status": "sent", "sid": message.sid, "to": to}
    except Exception as e:
        logger.error("WhatsApp send failed: %s", e)
        return {"status": "failed", "error": str(e)}


async def send_sms(to: str, body: str) -> dict:
    """Send an SMS via Twilio."""
    client = get_twilio_client()
    if not client:
        logger.warning("Twilio not configured, skipping SMS send")
        return {"status": "skipped", "reason": "Twilio not configured"}

    if not settings.twilio_phone_number:
        logger.warning("Twilio phone number not set, skipping SMS")
        return {"status": "skipped", "reason": "Twilio phone number not configured"}

    try:
        message = client.messages.create(
            from_=settings.twilio_phone_number,
            to=to,
            body=body,
        )
        logger.info("SMS sent: %s to %s", message.sid, to)
        return {"status": "sent", "sid": message.sid, "to": to}
    except Exception as e:
        logger.error("SMS send failed: %s", e)
        return {"status": "failed", "error": str(e)}


async def make_voice_call(to: str, twiml_url: str = None, twiml: str = None) -> dict:
    """
    Make a voice call via Twilio.

    Provide either a twiml_url (publicly reachable) or raw twiml XML.
    """
    client = get_twilio_client()
    if not client:
        logger.warning("Twilio not configured, skipping voice call")
        return {"status": "skipped", "reason": "Twilio not configured"}

    if not settings.twilio_phone_number:
        logger.warning("Twilio phone number not set, skipping voice call")
        return {"status": "skipped", "reason": "Twilio phone number not configured"}

    try:
        kwargs = {
            "to": to,
            "from_": settings.twilio_phone_number,
        }
        if twiml_url:
            kwargs["url"] = twiml_url
        elif twiml:
            kwargs["twiml"] = twiml
        else:
            return {"status": "failed", "error": "Must provide twiml_url or twiml"}

        call = client.calls.create(**kwargs)
        logger.info("Voice call initiated: %s to %s", call.sid, to)
        return {"status": "initiated", "sid": call.sid, "to": to}
    except Exception as e:
        logger.error("Voice call failed: %s", e)
        return {"status": "failed", "error": str(e)}
