"""
WhatsApp router -- send/receive messages via Twilio WhatsApp Sandbox.

Handles:
- Outbound messages via /send
- Inbound webhook from Twilio (text, image, audio)
- Message history per merchant
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, Form
from fastapi.responses import Response

from config import get_settings
from models import db
from models.schemas import WhatsAppMessage, WhatsAppSendRequest
from services import realtime
from services.twilio_service import send_whatsapp

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/send")
async def send_message(body: WhatsAppSendRequest):
    """Send a WhatsApp message to a customer via Twilio."""
    result = await send_whatsapp(to=body.to_phone, body=body.message)

    # Store in database
    msg = db.insert("whatsapp_messages", {
        "merchant_id": body.merchant_id,
        "direction": "outbound",
        "recipient_type": "customer",
        "recipient_phone": body.to_phone,
        "message_type": "text",
        "content": body.message,
        "status": result.get("status", "unknown"),
    })

    await realtime.emit_whatsapp_message(body.merchant_id, msg)

    return {
        "sent": result.get("status") == "sent",
        "message_id": msg.get("id"),
        "to": body.to_phone,
        "api_response": result,
    }


@router.get("/{merchant_id}/messages")
async def list_messages(
    merchant_id: str,
    direction: str = Query(None, description="inbound / outbound"),
    limit: int = Query(50, ge=1, le=200),
):
    """List WhatsApp messages for a merchant."""
    filters: dict[str, Any] = {"merchant_id": merchant_id}
    if direction:
        filters["direction"] = direction

    try:
        messages = db.select(
            "whatsapp_messages",
            filters=filters,
            order_by="sent_at",
            order_desc=True,
            limit=limit,
        )
    except Exception as e:
        logger.error("Failed to list messages for %s: %s", merchant_id, e)
        messages = []
    return messages


@router.post("/webhook")
async def twilio_webhook(request: Request):
    """
    Webhook endpoint for incoming WhatsApp messages from Twilio.

    Twilio POSTs form-encoded data with fields:
      Body, From, To, NumMedia, MediaUrl0, MediaContentType0, etc.

    For text messages: run through NLU pipeline, respond.
    For images: run OCR extraction, respond.
    For audio: transcribe, then NLU, respond.

    Returns TwiML XML response so Twilio sends the reply back to the user.
    """
    form = await request.form()
    body_text = form.get("Body", "").strip()
    from_number = form.get("From", "")  # e.g. whatsapp:+919999999999
    to_number = form.get("To", "")
    num_media = int(form.get("NumMedia", "0"))
    media_url = form.get("MediaUrl0", "")
    media_type = form.get("MediaContentType0", "")

    logger.info(
        "Twilio webhook: from=%s, body='%s', media=%d, type=%s",
        from_number, body_text[:100], num_media, media_type,
    )

    # Clean phone number for DB lookups
    clean_phone = from_number.replace("whatsapp:", "")

    # Try to find merchant by phone (placeholder — map in production)
    merchant_id = "default_merchant"

    # Use demo merchant for sandbox
    merchant_id = "11111111-1111-1111-1111-111111111111"

    # Store inbound message
    try:
        stored = db.insert("whatsapp_messages", {
            "merchant_id": merchant_id,
            "direction": "inbound",
            "recipient_type": "merchant",
            "recipient_phone": clean_phone,
            "message_type": "text",
            "content": body_text or f"[media: {media_type}]",
            "status": "received",
        })
        await realtime.emit_whatsapp_message(merchant_id, stored)
    except Exception as e:
        logger.warning("Failed to store inbound message: %s", e)
        stored = {}

    reply_text = ""

    # --- Handle image messages ---
    if num_media > 0 and media_type and media_type.startswith("image/"):
        try:
            from services.ocr_service import extract_invoice_data
            result = await extract_invoice_data(
                image_url_or_bytes=media_url,
                merchant_id=merchant_id,
                extraction_type="invoice",
            )
            if result.get("data"):
                data = result["data"]
                total = data.get("total", 0)
                vendor = data.get("vendor", "Unknown")
                items_count = len(data.get("items", []))
                reply_text = (
                    f"Invoice processed!\n"
                    f"Vendor: {vendor}\n"
                    f"Items: {items_count}\n"
                    f"Total: Rs {total:,.0f}\n\n"
                    f"Kya isko transaction mein add karein?"
                )

                # Log the extracted data as a transaction
                try:
                    db.insert("transactions", {
                        "merchant_id": merchant_id,
                        "amount": float(total) if total else 0,
                        "type": "expense",
                        "category": "Invoice",
                        "description": f"Invoice from {vendor} via WhatsApp",
                        "source": "whatsapp_ocr",
                    })
                except Exception:
                    pass
            else:
                reply_text = "Image mili, lekin invoice data extract nahi ho paya. Kripya clear photo bhejein."
        except Exception as e:
            logger.error("OCR processing failed: %s", e)
            reply_text = "Image process karne mein error aaya. Kripya dobara try karein."

    # --- Handle audio messages ---
    elif num_media > 0 and media_type and (media_type.startswith("audio/") or media_type.startswith("video/")):
        try:
            import httpx
            from routers.voice import transcribe_audio, run_nlu
            from services.action_router import route as route_action

            # Download the audio from Twilio (requires Basic Auth + follow redirects)
            settings = get_settings()
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                auth = httpx.BasicAuth(settings.twilio_account_sid, settings.twilio_auth_token)
                audio_resp = await client.get(media_url, auth=auth)

            logger.info("Audio download: status=%d, size=%d, content_type=%s",
                        audio_resp.status_code, len(audio_resp.content), audio_resp.headers.get("content-type", ""))

            if audio_resp.status_code == 200 and len(audio_resp.content) > 100:
                transcript = await transcribe_audio(audio_resp.content, language="hi")
                logger.info("Voice note transcript: %s", transcript)
                nlu = await run_nlu(transcript, language="hi")
                action_result = await route_action(merchant_id, nlu)
                reply_text = f"Sunaa: \"{transcript}\"\n\n{action_result.response_text}"
            else:
                logger.error("Audio download failed: status=%d, size=%d", audio_resp.status_code, len(audio_resp.content))
                reply_text = "Audio download nahi ho paya. Kripya text mein likh kar bhejein."
        except Exception as e:
            logger.exception("Audio processing failed: %s", e)
            reply_text = f"Audio process error: {str(e)[:100]}. Text mein likh kar bhejein."

    # --- Handle text messages ---
    elif body_text:
        # First check if this is a recurring payment approval response
        try:
            from routers.recurring import handle_whatsapp_approval
            approval_reply = await handle_whatsapp_approval(merchant_id, body_text)
            if approval_reply:
                reply_text = approval_reply
                # Skip NLU processing since we handled the approval
                logger.info("Handled as recurring payment approval: %s", body_text)
            else:
                raise ValueError("Not an approval message")
        except (ImportError, ValueError):
            pass

        if not reply_text:
            try:
                from routers.voice import run_nlu
                from services.action_router import route as route_action

                nlu = await run_nlu(body_text, language="hi")
                action_result = await route_action(merchant_id, nlu)
                reply_text = action_result.response_text
            except Exception as e:
                logger.error("NLU processing failed: %s", e)
                reply_text = (
                    "Namaste! Main MunimAI hoon, aapka AI accountant.\n"
                    "Aap mujhe Hindi ya English mein bol sakte hain:\n"
                    "- \"500 ka income aaya\"\n"
                    "- \"Sharma ji ko 1000 udhar diya\"\n"
                    "- \"Aaj ka summary batao\""
                )
    else:
        reply_text = (
            "Namaste! Main MunimAI hoon.\n"
            "Text, photo (invoice), ya audio bhejein — main samajh lunga!"
        )

    # Store outbound reply
    try:
        db.insert("whatsapp_messages", {
            "merchant_id": merchant_id,
            "direction": "outbound",
            "recipient_type": "customer",
            "recipient_phone": clean_phone,
            "message_type": "text",
            "content": reply_text,
            "status": "sent",
        })
    except Exception as e:
        logger.warning("Failed to store reply: %s", e)

    # Generate TTS voice note and send as a follow-up message
    try:
        from routers.voice import synthesize_speech
        import base64, os, uuid

        audio_data_uri = await synthesize_speech(reply_text, "hi")
        if audio_data_uri and audio_data_uri.startswith("data:audio"):
            # Decode base64 audio from Sarvam TTS
            b64_data = audio_data_uri.split(",", 1)[1]
            audio_bytes = base64.b64decode(b64_data)

            # Save to a temp file served by our API
            audio_id = str(uuid.uuid4())[:8]
            audio_path = f"/tmp/munim_tts_{audio_id}.ogg"
            with open(audio_path, "wb") as f:
                f.write(audio_bytes)

            # Send voice note as a separate WhatsApp message via Twilio
            # Use the ngrok URL to serve the audio
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    tunnels_resp = await client.get("http://localhost:4040/api/tunnels")
                    tunnels = tunnels_resp.json().get("tunnels", [])
                    ngrok_url = next((t["public_url"] for t in tunnels if "https" in t["public_url"]), None)
                except Exception:
                    ngrok_url = None

            if ngrok_url:
                audio_url = f"{ngrok_url}/api/whatsapp/tts/{audio_id}"
                await send_whatsapp(to=clean_phone, body="🔊 Voice note:", media_url=audio_url)
                logger.info("Voice note sent: %s", audio_url)
    except Exception as e:
        logger.warning("TTS voice note failed (text reply still sent): %s", e)

    # Return TwiML XML response (text reply)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{_escape_xml(reply_text)}</Message>
</Response>"""

    return Response(content=twiml, media_type="application/xml")


@router.get("/tts/{audio_id}")
async def serve_tts_audio(audio_id: str):
    """Serve TTS audio files for WhatsApp voice notes."""
    import os
    audio_path = f"/tmp/munim_tts_{audio_id}.ogg"
    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio not found")

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    return Response(content=audio_bytes, media_type="audio/ogg")


@router.get("/webhook")
async def verify_webhook(request: Request):
    """
    Webhook verification endpoint.

    Supports both Twilio (simple GET check) and legacy Meta verification.
    """
    settings = get_settings()
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    # Meta-style verification (legacy)
    if mode == "subscribe" and token == settings.whatsapp_verify_token:
        logger.info("WhatsApp webhook verified (Meta)")
        return int(challenge) if challenge else ""

    # Twilio doesn't require GET verification, just return OK
    return {"status": "ok", "provider": "twilio"}


def _escape_xml(text: str) -> str:
    """Escape special characters for XML/TwiML."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
