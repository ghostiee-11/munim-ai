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
            import httpx as _httpx
            from services.ocr_service import extract_invoice_data

            # Download image from Twilio (requires auth)
            settings = get_settings()
            async with _httpx.AsyncClient(timeout=30.0, follow_redirects=True) as dl_client:
                auth = _httpx.BasicAuth(settings.twilio_account_sid, settings.twilio_auth_token)
                img_resp = await dl_client.get(media_url, auth=auth)

            if img_resp.status_code == 200 and len(img_resp.content) > 100:
                import base64 as _b64
                b64_image = _b64.b64encode(img_resp.content).decode()
            else:
                b64_image = media_url  # fallback to URL

            result = await extract_invoice_data(
                image_url_or_bytes=b64_image,
                merchant_id=merchant_id,
                extraction_type="invoice",
            )
            if result.get("data"):
                data = result["data"]
                total = data.get("total", 0)
                vendor = data.get("vendor", "Unknown")
                items = data.get("items", [])
                items_count = len(items)

                # --- Auto-detect income vs expense ---
                # If the merchant's name/business appears as seller on the receipt, it's income (sale)
                # If the merchant is the buyer (purchasing from vendor), it's expense (purchase)
                txn_type = "expense"
                txn_type_label = "Expense (Purchase)"
                try:
                    merchant_info = db.select("merchants", filters={"id": merchant_id}, single=True)
                    merchant_name = (merchant_info or {}).get("business_name", "").lower().strip()
                    seller_name = (data.get("seller", "") or data.get("from", "") or "").lower().strip()
                    buyer_name = (data.get("buyer", "") or data.get("to", "") or data.get("bill_to", "") or "").lower().strip()
                    vendor_lower = vendor.lower().strip()

                    if merchant_name and (merchant_name in seller_name or seller_name in merchant_name):
                        txn_type = "income"
                        txn_type_label = "Income (Sale)"
                    elif merchant_name and (merchant_name in buyer_name or buyer_name in merchant_name):
                        txn_type = "expense"
                        txn_type_label = "Expense (Purchase)"
                    # Default: if vendor is different from merchant, it's a purchase (expense)
                except Exception:
                    pass

                # --- Auto-categorize based on item names ---
                category_keywords = {
                    "Textile": ["saree", "silk", "cotton", "fabric", "dupatta", "blouse", "kurta", "suit", "cloth"],
                    "Electronics": ["phone", "mobile", "laptop", "charger", "cable", "battery", "led", "tv"],
                    "Grocery": ["rice", "dal", "atta", "sugar", "oil", "tea", "masala", "salt", "flour"],
                    "Hardware": ["pipe", "wire", "cement", "nail", "screw", "paint", "tool"],
                    "Stationery": ["pen", "paper", "notebook", "file", "folder", "ink"],
                    "Medicine": ["tablet", "syrup", "capsule", "medicine", "pharma"],
                }
                detected_category = "General"
                all_item_names = " ".join(it.get("name", "").lower() for it in items)
                for cat, keywords in category_keywords.items():
                    if any(kw in all_item_names for kw in keywords):
                        detected_category = cat
                        break

                # --- Calculate GST from extracted data ---
                subtotal = float(data.get("subtotal", 0) or 0)
                gst_amount = float(data.get("gst", 0) or data.get("tax", 0) or data.get("gst_amount", 0) or 0)
                if not subtotal and total:
                    # Estimate: if GST not explicitly found, back-calculate assuming 5% default
                    if gst_amount > 0:
                        subtotal = round(float(total) - gst_amount, 2)
                    else:
                        # Try to sum item amounts for subtotal
                        item_total = sum(float(it.get("amount", 0) or 0) for it in items)
                        if item_total > 0 and abs(item_total - float(total)) > 1:
                            subtotal = item_total
                            gst_amount = round(float(total) - item_total, 2)
                        else:
                            subtotal = float(total)
                            gst_amount = 0

                # Auto-create inventory items from extracted invoice
                inventory_created = 0
                inventory_updated = 0
                try:
                    existing_inv = db.select("inventory", filters={"merchant_id": merchant_id})
                    for raw_item in items:
                        item_name = raw_item.get("name", "").strip()
                        if not item_name:
                            continue
                        qty = int(float(raw_item.get("qty", 1) or 1))
                        amount = float(raw_item.get("amount", 0) or raw_item.get("rate", 0) or 0)
                        cost_price = round(amount / qty, 2) if qty > 0 else amount

                        # Fuzzy match
                        matched = None
                        item_lower = item_name.lower().strip()
                        for ex in existing_inv:
                            ex_name = ex.get("item_name", "").lower().strip()
                            if ex_name == item_lower or item_lower in ex_name or ex_name in item_lower:
                                matched = ex
                                break

                        if matched:
                            # For purchases (expense), add stock; for sales (income), subtract
                            if txn_type == "expense":
                                new_qty = int((matched.get("current_qty", 0) or 0) + qty)
                            else:
                                new_qty = max(0, int((matched.get("current_qty", 0) or 0) - qty))
                            db.update("inventory", matched["id"], {"current_qty": new_qty})
                            inventory_updated += 1
                        else:
                            db.insert("inventory", {
                                "merchant_id": merchant_id,
                                "item_name": item_name,
                                "category": detected_category,
                                "current_qty": qty,
                                "unit": raw_item.get("unit", "pcs"),
                                "cost_price": cost_price,
                                "selling_price": 0,
                                "reorder_level": 5,
                                "supplier_name": vendor,
                            })
                            inventory_created += 1
                except Exception as inv_err:
                    logger.warning("Inventory auto-create from WhatsApp failed: %s", inv_err)

                # Log transaction with auto-detected type
                try:
                    db.insert("transactions", {
                        "merchant_id": merchant_id,
                        "amount": float(total) if total else 0,
                        "type": txn_type,
                        "category": detected_category,
                        "description": f"{'Invoice from' if txn_type == 'expense' else 'Sale to'} {vendor} via WhatsApp",
                        "source": "whatsapp_ocr",
                    })
                except Exception:
                    pass

                # Record GST ITC/liability
                gst_record_type = "itc" if txn_type == "expense" else "liability"
                try:
                    if gst_amount > 0:
                        db.insert("transactions", {
                            "merchant_id": merchant_id,
                            "amount": gst_amount,
                            "type": "gst_" + gst_record_type,
                            "category": "GST",
                            "description": f"GST {gst_record_type.upper()} from {vendor} receipt",
                            "source": "whatsapp_ocr",
                        })
                except Exception:
                    pass

                # Build items summary (compact: "Name xQty" grouped)
                items_summary_parts = []
                for it in items:
                    it_name = it.get("name", "Item")
                    it_qty = it.get("qty", 1)
                    items_summary_parts.append(f"{it_name} x{it_qty}")
                items_summary = ", ".join(items_summary_parts)

                # Build rich reply
                gst_label = "GST ITC" if txn_type == "expense" else "GST Liability"
                auto_parts = [f"- {txn_type_label} transaction logged"]
                if inventory_created + inventory_updated > 0:
                    auto_parts.append(f"- {inventory_created + inventory_updated} inventory items updated")
                if gst_amount > 0:
                    auto_parts.append(f"- {gst_label}: Rs {gst_amount:,.0f} recorded")
                auto_created = "\n".join(auto_parts)

                reply_text = (
                    f"Receipt processed!\n"
                    f"Type: {txn_type_label}\n"
                    f"Vendor: {vendor}\n"
                    f"Items: {items_count} ({items_summary})\n"
                    f"Subtotal: Rs {subtotal:,.0f}\n"
                    f"GST: Rs {gst_amount:,.0f}\n"
                    f"Total: Rs {float(total):,.0f}\n\n"
                    f"Auto-created:\n"
                    f"{auto_created}\n\n"
                    f"Reply \"undo\" to reverse."
                )
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
        import base64, uuid

        # Truncate text to avoid TTS timeout (max ~200 chars)
        tts_text = reply_text[:200] if len(reply_text) > 200 else reply_text
        audio_data_uri = await synthesize_speech(tts_text, "hi")

        if audio_data_uri and "base64," in audio_data_uri:
            # Decode base64 audio from Sarvam TTS
            b64_data = audio_data_uri.split("base64,", 1)[1]
            audio_bytes = base64.b64decode(b64_data)

            if len(audio_bytes) > 100:
                # Save as WAV (Sarvam returns WAV format)
                audio_id = str(uuid.uuid4())[:8]
                audio_path = f"/tmp/munim_tts_{audio_id}.wav"
                with open(audio_path, "wb") as f:
                    f.write(audio_bytes)

                # Get ngrok URL to serve the audio
                import httpx
                ngrok_url = None
                try:
                    async with httpx.AsyncClient(timeout=3.0) as client:
                        tunnels_resp = await client.get("http://localhost:4040/api/tunnels")
                        tunnels = tunnels_resp.json().get("tunnels", [])
                        ngrok_url = next((t["public_url"] for t in tunnels if "https" in t["public_url"]), None)
                except Exception:
                    pass

                if ngrok_url:
                    audio_url = f"{ngrok_url}/api/whatsapp/tts/{audio_id}"
                    logger.info("Sending voice note: %s (%d bytes)", audio_url, len(audio_bytes))
                    await send_whatsapp(to=clean_phone, body="🔊", media_url=audio_url)
                else:
                    logger.warning("Ngrok not available, skipping voice note")
            else:
                logger.warning("TTS returned empty audio (%d bytes)", len(audio_bytes))
        else:
            logger.info("TTS returned no audio (key may be missing or text too long)")
    except Exception as e:
        logger.warning("TTS voice note failed: %s", e)

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
    # Try WAV first (Sarvam returns WAV), then OGG
    for ext, mime in [(".wav", "audio/wav"), (".ogg", "audio/ogg"), (".mp3", "audio/mpeg")]:
        audio_path = f"/tmp/munim_tts_{audio_id}{ext}"
        if os.path.exists(audio_path):
            with open(audio_path, "rb") as f:
                audio_bytes = f.read()
            return Response(content=audio_bytes, media_type=mime)
    raise HTTPException(status_code=404, detail="Audio not found")


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
