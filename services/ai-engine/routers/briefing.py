"""
Briefing router -- AI-generated daily business briefings.

Generates a concise summary of the day's activity, highlights, alerts,
and actionable recommendations, optionally as an audio clip.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException

from config import get_settings
from models import db
from models.schemas import BriefingResponse

logger = logging.getLogger(__name__)
router = APIRouter()


async def _generate_briefing_text(merchant_id: str) -> dict:
    """
    Gather data and generate a briefing via Groq LLM.

    Returns dict with summary, highlights, alerts, recommendations.
    """
    import json
    import httpx

    settings = get_settings()
    today_str = date.today().isoformat()
    yesterday_str = (date.today() - timedelta(days=1)).isoformat()

    # Gather data
    today_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", today_str),
        lte=("recorded_at", today_str + "T23:59:59"),
    )
    yesterday_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", yesterday_str),
        lte=("recorded_at", yesterday_str + "T23:59:59"),
    )
    udharis = db.get_merchant_udharis(merchant_id, status="pending")
    overdue = db.get_merchant_udharis(merchant_id, status="overdue")

    t_income = sum(t["amount"] for t in today_txns if t.get("type") == "income")
    t_expense = sum(t["amount"] for t in today_txns if t.get("type") == "expense")
    y_income = sum(t["amount"] for t in yesterday_txns if t.get("type") == "income")
    total_udhari = sum(u.get("remaining", 0) for u in udharis)
    overdue_amount = sum(u.get("remaining", 0) for u in overdue)

    # GST deadline check
    import json as _json
    gst_alerts = []
    today_day = datetime.now().day
    today_month = datetime.now().strftime("%B")
    if 15 <= today_day <= 19:
        days_left = 20 - today_day
        gst_alerts.append(f"GSTR-3B deadline {days_left} din mein! (20 {today_month})")
    elif today_day > 20 and today_day <= 25:
        late_days = today_day - 20
        penalty = late_days * 100
        gst_alerts.append(f"GSTR-3B {late_days} din late! Penalty: Rs {penalty}. Abhi file karein!")
    if 6 <= today_day <= 10:
        days_left = 11 - today_day
        gst_alerts.append(f"GSTR-1 deadline {days_left} din mein! (11 {today_month})")

    context = (
        f"Merchant data for {today_str}:\n"
        f"- Today's income: Rs {t_income}\n"
        f"- Today's expense: Rs {t_expense}\n"
        f"- Today's profit: Rs {t_income - t_expense}\n"
        f"- Yesterday's income: Rs {y_income}\n"
        f"- Total transactions today: {len(today_txns)}\n"
        f"- Pending udhari: Rs {total_udhari} ({len(udharis)} entries)\n"
        f"- Overdue udhari: Rs {overdue_amount} ({len(overdue)} entries)\n"
        f"- GST alerts: {'; '.join(gst_alerts) if gst_alerts else 'None'}\n"
    )

    prompt = (
        "You are Munim, an AI business assistant for Indian SMBs. "
        "Generate a morning business briefing in Hindi (Hinglish) for a shopkeeper. "
        "Keep it warm and conversational, like a trusted munshi giving an update. "
        "3-4 lines max for summary. Include one actionable tip in recommendations. "
        "Return JSON with keys: summary (2-3 sentences in Hinglish), highlights (list of strings), "
        "alerts (list of strings), recommendations (list of strings with at least one actionable tip). "
        f"Data:\n{context}"
    )

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": "You are Munim, a friendly AI business assistant. Respond in JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 500,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 200:
            raw = resp.json()["choices"][0]["message"]["content"]
            return json.loads(raw)
    except Exception:
        logger.exception("Briefing generation failed, using fallback")

    # Fallback briefing
    return {
        "summary": (
            f"Aaj aapki dukaan mein {t_income} rupaye aaye aur {t_expense} rupaye kharche hue. "
            f"Net profit {t_income - t_expense} rupaye raha."
        ),
        "highlights": [
            f"Aaj {len(today_txns)} transactions hue.",
            f"Income kal se {'zyada' if t_income > y_income else 'kam'} rahi.",
        ],
        "alerts": ([f"{len(overdue)} customers ka {overdue_amount} rupaye udhari overdue hai."] if overdue else []),
        "recommendations": [
            "Overdue customers ko aaj reminder bhejein." if overdue else "Sab theek hai, aise hi chalte rahein!",
        ],
    }


@router.get("/{merchant_id}/generate", response_model=BriefingResponse)
async def generate_briefing(merchant_id: str):
    """
    Generate today's business briefing using AI.

    Collects current data, generates a narrative summary with highlights
    and actionable recommendations.
    """
    briefing_data = await _generate_briefing_text(merchant_id)

    # Optionally generate audio via TTS
    audio_url = None
    settings = get_settings()
    if settings.sarvam_api_key:
        try:
            from routers.voice import synthesize_speech
            audio_url = await synthesize_speech(briefing_data.get("summary", ""), "hi")
        except Exception:
            logger.exception("Briefing TTS failed")

    response = BriefingResponse(
        merchant_id=merchant_id,
        date=date.today().isoformat(),
        summary=briefing_data.get("summary", ""),
        highlights=briefing_data.get("highlights", []),
        alerts=briefing_data.get("alerts", []),
        recommendations=briefing_data.get("recommendations", []),
        audio_url=audio_url,
    )

    # Cache the briefing
    db.upsert("briefings", {
        "merchant_id": merchant_id,
        "date": date.today().isoformat(),
        "content": briefing_data,
        "audio_url": audio_url,
    })

    return response


@router.post("/{merchant_id}/send")
async def send_briefing(merchant_id: str):
    """
    Send today's briefing to the merchant via WhatsApp.

    Generates the briefing if not already cached, then dispatches it.
    """
    # Check for cached briefing
    cached = db.select(
        "briefings",
        filters={"merchant_id": merchant_id, "date": date.today().isoformat()},
        single=True,
    )

    if not cached:
        # Generate fresh
        briefing_resp = await generate_briefing(merchant_id)
        text = briefing_resp.summary
    else:
        content = cached.get("content", {})
        text = content.get("summary", "Aaj ki briefing taiyaar hai.")

    # Get merchant phone
    merchant = db.select("merchants", filters={"id": merchant_id}, single=True)
    phone = merchant.get("phone") if merchant else None

    # Always use test number for sandbox
    phone = "+917725014797"

    # Send via Twilio WhatsApp
    from services.twilio_service import send_whatsapp
    wa_result = await send_whatsapp(to=phone, body=f"🌅 Good morning! Aaj ki business briefing:\n\n{text}")

    # Also send TTS voice note
    try:
        from routers.voice import synthesize_speech
        import base64, uuid
        audio_data_uri = await synthesize_speech(text, "hi")
        if audio_data_uri and audio_data_uri.startswith("data:audio"):
            b64_data = audio_data_uri.split(",", 1)[1]
            audio_bytes = base64.b64decode(b64_data)
            audio_id = str(uuid.uuid4())[:8]
            with open(f"/tmp/munim_tts_{audio_id}.ogg", "wb") as f:
                f.write(audio_bytes)

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
                await send_whatsapp(to=phone, body="🔊 Voice briefing:", media_url=audio_url)
    except Exception as e:
        logger.warning("TTS for briefing failed: %s", e)

    return {
        "sent": wa_result.get("status") == "sent",
        "merchant_id": merchant_id,
        "channel": "whatsapp",
        "phone": phone,
        "whatsapp_result": wa_result,
        "preview": text[:200],
    }
