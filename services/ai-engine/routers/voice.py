"""
Voice router -- the critical path for MunimAI.

POST /process   Accept audio blob -> STT -> NLU -> Action -> Response
POST /text      Accept text directly -> NLU -> Action -> Response
"""

from __future__ import annotations

import io
import logging
import tempfile
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from config import get_settings
from models.schemas import NLUResult, VoiceResponse, VoiceTextRequest
from services import realtime
from services.action_router import route as route_action

logger = logging.getLogger(__name__)
router = APIRouter()

settings = get_settings()


# ---------------------------------------------------------------------------
# STT -- Groq Whisper
# ---------------------------------------------------------------------------

async def transcribe_audio(audio_bytes: bytes, language: str = "hi") -> str:
    """
    Send raw audio for transcription via multi-provider STT.

    Uses the unified multi_stt service which tries:
    OpenAI Whisper -> ElevenLabs Scribe v2 -> Sarvam AI -> Groq Whisper

    Supports Hindi, English, and Hinglish. Returns the transcribed text.
    """
    from services.multi_stt import transcribe_multi

    result = await transcribe_multi(audio_bytes, language)
    logger.info("STT [%s] transcript: %s", result.get("provider"), result.get("text"))
    return result["text"]


# ---------------------------------------------------------------------------
# NLU -- Groq LLM intent extraction
# ---------------------------------------------------------------------------

NLU_SYSTEM_PROMPT = """You are the NLU engine for MunimAI, an AI accounting assistant for Indian small businesses.
Given user speech (Hindi/Hinglish/English), extract:
1. intent: one of [add_income, add_expense, add_udhari, settle_udhari, get_today_summary, get_udhari_summary, get_balance, send_reminder, setup_recurring, greeting, help, unknown]
2. entities: {amount, category, party_name, customer_name, beneficiary_name, description, phone, due_date, payment_mode, frequency, upi_id} -- only include what is present
3. confidence: 0.0 to 1.0

Respond ONLY with valid JSON. Example:
{"intent": "add_income", "confidence": 0.95, "entities": {"amount": 5000, "party_name": "Sharma ji", "category": "Sales", "payment_mode": "cash"}}

Important:
- "aaya" / "mila" / "becha" / "bikri" = income
- "gaya" / "kharcha" / "diya" / "khareed" = expense
- "udhar" / "udhaar" / "baaki" / "credit diya" = add_udhari
- "wapas" / "settle" / "chuka" / "de diya" = settle_udhari
- "aaj kaisa raha" / "aaj ka hisaab" / "aaj ka summary" / "din kaisa raha" / "kitna kamaya aaj" / "aaj kitna hua" / "aaj ka total" / "summary batao" / "aaj ka business" = get_today_summary (NOT greeting)
  - These are daily summary queries asking about today's business performance. Do NOT classify them as "greeting".
  - Only classify as "greeting" for pure greetings like: namaste, hello, hi, kaise ho — with NO business context.
- "har mahine" / "monthly" / "recurring" / "autopay" / "har hafte" / "weekly" / "regular payment" = setup_recurring
  - Examples: "har mahine 15000 rent dena hai" -> setup_recurring, amount=15000, category="rent", frequency="monthly"
  - "weekly salary 5000 Raju ko" -> setup_recurring, amount=5000, beneficiary_name="Raju", category="salary", frequency="weekly"
  - "har mahine bijli bill 3500" -> setup_recurring, amount=3500, category="utility", frequency="monthly"
  - "supplier ko 25000 monthly dena hai" -> setup_recurring, amount=25000, category="supplier", frequency="monthly"
  - frequency: "har hafte"/"weekly" = "weekly", "har do hafte" = "biweekly", "har mahine"/"monthly" = "monthly", "har teen mahine"/"quarterly" = "quarterly". Default to "monthly".
  - category: detect from context -- rent/kiraya = "rent", salary/tankhah/vetan = "salary", supplier/saamaan = "supplier", bijli/paani/gas/bill = "utility", EMI/loan = "emi"
- For amounts: "paanch hazaar" = 5000, "do sau" = 200, etc.
- payment_mode: "cash" if naqad/haath se/cash/rokda, "upi" if UPI/online/phone pe/Google Pay/Paytm/GPay/digital. Default to "cash" if not specified.
"""


async def run_nlu(text: str, language: str = "hi") -> NLUResult:
    """
    Run the NLU pipeline via Groq LLM to extract intent and entities
    from transcribed text.
    """
    import json
    import httpx

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": NLU_SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "temperature": 0.1,
        "max_tokens": 300,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code != 200:
        logger.error("NLU LLM call failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=502, detail="NLU service error")

    raw = resp.json()["choices"][0]["message"]["content"]
    logger.info("NLU raw output: %s", raw)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("NLU returned invalid JSON: %s", raw)
        return NLUResult(
            intent="unknown",
            confidence=0.0,
            entities={},
            raw_text=text,
            language=language,
        )

    return NLUResult(
        intent=parsed.get("intent", "unknown"),
        confidence=parsed.get("confidence", 0.0),
        entities=parsed.get("entities", {}),
        raw_text=text,
        language=language,
    )


# ---------------------------------------------------------------------------
# TTS -- Sarvam AI (optional, returns URL or None)
# ---------------------------------------------------------------------------

async def synthesize_speech(text: str, language: str = "hi") -> Optional[str]:
    """
    Convert response text to speech via Sarvam AI TTS.

    Returns a URL to the audio file, or None if TTS is unavailable.
    """
    if not settings.sarvam_api_key:
        return None

    import httpx

    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "API-Subscription-Key": settings.sarvam_api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": [text],
        "target_language_code": "hi-IN" if language == "hi" else "en-IN",
        "speaker": "anushka",
        "model": "bulbul:v2",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 200:
            data = resp.json()
            # Sarvam returns base64 audio -- in production you'd upload to
            # storage and return a URL.  For now return a data URI.
            audios = data.get("audios", [])
            if audios:
                return f"data:audio/wav;base64,{audios[0]}"
    except Exception:
        logger.exception("TTS synthesis failed")

    return None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/process", response_model=VoiceResponse)
async def process_voice(
    audio: UploadFile = File(..., description="Audio blob from the client mic"),
    merchant_id: str = Form(..., description="Merchant performing the action"),
    language: str = Form("hi", description="Language hint: hi / en / hinglish"),
):
    """
    Full voice pipeline: Audio -> STT -> NLU -> Action -> Response.

    This is the primary interaction endpoint.  The frontend records audio
    from the user's mic and sends it here as a multipart upload.
    """
    # 1. Read audio bytes
    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is too small or empty.")

    logger.info(
        "Voice request: merchant=%s, lang=%s, audio_size=%d bytes",
        merchant_id, language, len(audio_bytes),
    )

    # 2. STT
    try:
        transcript = await transcribe_audio(audio_bytes, language)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("STT failed")
        return VoiceResponse(
            success=False,
            response_text="Aapki awaaz samajh nahi aayi. Kripya dobara boliye.",
            error=str(exc),
        )

    if not transcript or len(transcript.strip()) < 2:
        return VoiceResponse(
            success=False,
            transcript=transcript,
            response_text="Kuch sunai nahi diya. Kripya dobara boliye.",
        )

    # 3. NLU
    nlu = await run_nlu(transcript, language)

    # 4. Action routing OR conversational Groq LLM
    if nlu.intent not in ("greeting", "unknown", "help") and nlu.confidence > 0.75:
        action_result = await route_action(merchant_id, nlu)
        response_text = action_result.response_text
        action_data = action_result.data
        success = action_result.success
    else:
        # Conversational: use Groq LLM for a natural Hindi response
        import httpx as _httpx
        try:
            from models.db import select as _db_select
            today_txns = _db_select("transactions", filters={"merchant_id": merchant_id})
            inc = sum(t.get("amount", 0) for t in today_txns if t.get("type") == "income")
            exp = sum(t.get("amount", 0) for t in today_txns if t.get("type") == "expense")
            ctx = f"Income: Rs {inc:,.0f}, Expense: Rs {exp:,.0f}, Profit: Rs {inc-exp:,.0f}"
        except Exception:
            ctx = ""

        try:
            async with _httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": settings.groq_model,
                        "messages": [
                            {"role": "system", "content": f"You are Muneem AI, a warm Hindi-speaking AI accountant. Respond in Hinglish, 2-3 sentences. Context: {ctx}"},
                            {"role": "user", "content": transcript},
                        ],
                        "temperature": 0.7, "max_tokens": 200,
                    },
                )
            response_text = r.json()["choices"][0]["message"]["content"] if r.status_code == 200 else "Maaf kijiye, samajh nahi aaya."
        except Exception:
            response_text = "Namaste! Main Muneem hoon. Kya madad kar sakta hoon?"
        action_data = {}
        success = True

    # 5. TTS
    audio_url = await synthesize_speech(response_text, language)

    # 6. Emit real-time event
    response = VoiceResponse(
        success=success,
        transcript=transcript,
        nlu=nlu,
        action_result=action_data,
        response_text=response_text,
        response_audio_url=audio_url,
    )

    await realtime.emit_voice_response(merchant_id, response.model_dump())

    return response


@router.post("/text-demo")
async def process_text_demo(req: VoiceTextRequest):
    """
    DEMO MODE: Works without any API keys.
    Uses mock NLU + in-memory data store.
    Perfect for testing the full app flow locally.
    """
    from services.demo_mode import mock_nlu, mock_action_response, insert, select, DEMO_MERCHANT_ID

    if not req.text or len(req.text.strip()) < 2:
        raise HTTPException(status_code=400, detail="Text is too short.")

    merchant_id = req.merchant_id or DEMO_MERCHANT_ID
    logger.info("Demo text request: merchant=%s, text='%s'", merchant_id, req.text)

    # Mock NLU
    nlu_result = mock_nlu(req.text)
    intent = nlu_result["intent"]
    entities = nlu_result["entities"]
    confidence = nlu_result["confidence"]

    # Execute action on in-memory store
    if intent == "add_expense" and entities.get("amount"):
        insert("transactions", {
            "merchant_id": merchant_id,
            "type": "expense",
            "amount": entities["amount"],
            "category": entities.get("category", "General"),
            "description": req.text,
            "source": "voice",
            "recorded_at": datetime.now().isoformat(),
        })
    elif intent == "add_income" and entities.get("amount"):
        insert("transactions", {
            "merchant_id": merchant_id,
            "type": "income",
            "amount": entities["amount"],
            "category": entities.get("category", "Sales"),
            "description": req.text,
            "source": "voice",
            "recorded_at": datetime.now().isoformat(),
        })
    elif intent == "add_udhari" and entities.get("amount"):
        insert("udhari", {
            "merchant_id": merchant_id,
            "debtor_name": entities.get("customer_name", "Customer"),
            "amount": entities["amount"],
            "amount_paid": 0,
            "status": "pending",
            "source": "voice",
            "created_at": datetime.now().isoformat(),
        })

    response_text = mock_action_response(intent, entities)

    # Emit WebSocket event
    try:
        await realtime.emit_voice_response(merchant_id, {
            "transcript": req.text,
            "intent": intent,
            "confidence": confidence,
            "response_hindi": response_text,
        })
    except Exception:
        pass  # Socket may not be connected in demo

    return {
        "success": True,
        "transcript": req.text,
        "intent": intent,
        "confidence": confidence,
        "entities": entities,
        "response_hindi": response_text,
        "response_audio_url": None,
        "mode": "demo",
    }


@router.post("/chat")
async def chat_with_muneem(req: VoiceTextRequest):
    """
    Conversational chat with Muneem AI.
    For actionable commands (add expense, create udhari), routes through NLU.
    For general questions, uses Groq LLM directly as a conversational assistant.
    """
    text = req.text.strip() if req.text else ""
    if len(text) < 2:
        raise HTTPException(status_code=400, detail="Text is too short.")

    merchant_id = req.merchant_id
    language = req.language or "hi"

    logger.info("Chat request: merchant=%s, text='%s'", merchant_id, text)

    # First try NLU to see if it's an actionable command
    nlu = await run_nlu(text, language)

    # If it's a clear action (not greeting/unknown/help), route it
    if nlu.intent not in ("greeting", "unknown", "help") and nlu.confidence > 0.75:
        action_result = await route_action(merchant_id, nlu)
        audio_url = await synthesize_speech(action_result.response_text, language)
        return {
            "reply": action_result.response_text,
            "action_taken": nlu.intent,
            "entities": nlu.entities,
            "is_action": True,
            "audio_url": audio_url,
        }

    # Otherwise, use Groq LLM for conversational response
    import httpx

    # Get merchant context for personalized responses
    try:
        from models.db import select as db_select
        transactions = db_select(
            "transactions",
            filters={"merchant_id": merchant_id},
            limit=50,
            order_by="recorded_at",
            order_desc=True,
        )
        today_income = sum(t["amount"] for t in transactions if t.get("type") == "income")
        today_expense = sum(t["amount"] for t in transactions if t.get("type") == "expense")
        context = f"Merchant's recent data: Income Rs {today_income}, Expense Rs {today_expense}, Profit Rs {today_income - today_expense}"
    except Exception:
        context = "No data available yet"

    chat_prompt = f"""You are Muneem AI, a friendly and helpful AI accountant/CFO for Indian small businesses.
You speak in Hindi-English mix (Hinglish). You are warm, professional, and knowledgeable about:
- Bookkeeping, P&L, cash flow
- GST filing and tax optimization
- Udhari (credit) management
- Government MSME schemes
- Business growth advice

Current merchant context: {context}

User message: {text}

Respond naturally in Hinglish. Keep response concise (2-3 sentences max).
If the user asks about their business data, use the context provided.
If they ask to do something (log expense, create udhari), tell them to use voice commands or the specific page."""

    reply = "Maaf kijiye, abhi kuch technical issue hai. Kripya dobara try karein."

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json={
                    "model": settings.groq_model,
                    "messages": [
                        {"role": "system", "content": chat_prompt},
                        {"role": "user", "content": text},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 200,
                },
            )

        if resp.status_code == 200:
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
        else:
            logger.error("Groq chat failed: %s %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.exception("Chat LLM call failed: %s", exc)

    # Generate TTS
    audio_url = await synthesize_speech(reply, language)

    return {
        "reply": reply,
        "action_taken": None,
        "is_action": False,
        "audio_url": audio_url,
    }


@router.post("/text", response_model=VoiceResponse)
async def process_text(req: VoiceTextRequest):
    """
    Text-only pipeline: Text -> NLU -> Action -> Response.

    Useful for typed input, testing, and accessibility.
    """
    if not req.text or len(req.text.strip()) < 2:
        raise HTTPException(status_code=400, detail="Text is too short.")

    logger.info("Text request: merchant=%s, text='%s'", req.merchant_id, req.text)

    # NLU
    nlu = await run_nlu(req.text, req.language)

    # Action OR conversational Groq LLM
    if nlu.intent not in ("greeting", "unknown", "help") and nlu.confidence > 0.75:
        action_result = await route_action(req.merchant_id, nlu)
    else:
        # Use Groq LLM for conversational response
        import httpx as _httpx
        try:
            from models.db import select as _db_select
            txns = _db_select("transactions", filters={"merchant_id": req.merchant_id})
            inc = sum(t.get("amount", 0) for t in txns if t.get("type") == "income")
            exp = sum(t.get("amount", 0) for t in txns if t.get("type") == "expense")
            ctx = f"Income: Rs {inc:,.0f}, Expense: Rs {exp:,.0f}, Profit: Rs {inc-exp:,.0f}"
        except Exception:
            ctx = ""
        try:
            async with _httpx.AsyncClient(timeout=15.0) as c:
                r = await c.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": settings.groq_model,
                        "messages": [
                            {"role": "system", "content": f"You are Muneem AI, a warm Hindi-speaking AI accountant for Indian small businesses. Respond in natural Hinglish, 2-3 sentences. Be helpful and specific. Context: {ctx}"},
                            {"role": "user", "content": req.text},
                        ],
                        "temperature": 0.7, "max_tokens": 200,
                    },
                )
            resp_text = r.json()["choices"][0]["message"]["content"] if r.status_code == 200 else "Maaf kijiye, samajh nahi aaya."
        except Exception:
            resp_text = "Namaste! Kya madad kar sakta hoon?"
        from services.action_router import ActionResult
        action_result = ActionResult(success=True, response_text=resp_text)

    # TTS
    audio_url = await synthesize_speech(action_result.response_text, req.language)

    response = VoiceResponse(
        success=action_result.success,
        transcript=req.text,
        nlu=nlu,
        action_result=action_result.data,
        response_text=action_result.response_text,
        response_audio_url=audio_url,
    )

    await realtime.emit_voice_response(req.merchant_id, response.model_dump())

    return response


# ---------------------------------------------------------------------------
# Multi-provider STT endpoints (audio/process, audio/transcript)
# ---------------------------------------------------------------------------

DEMO_MERCHANT_ID = "11111111-1111-1111-1111-111111111111"


@router.post("/audio/process")
async def process_audio_multi(
    file: UploadFile = File(...),
    language: str = Form("hi"),
    source: str = Form("soundbox"),
    merchant_id: str = Form(DEMO_MERCHANT_ID),
    stt_provider: str = Form("auto"),
):
    """Multi-provider audio processing with STT provider info."""
    from services.multi_stt import transcribe_multi

    audio_bytes = await file.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is too small or empty.")

    preferred = stt_provider if stt_provider != "auto" else None
    stt_result = await transcribe_multi(
        audio_bytes, language, file.filename or "audio.webm", preferred_provider=preferred,
    )

    transcript = stt_result["text"]
    provider = stt_result["provider"]

    # Run NLU first to detect actionable commands
    nlu = await run_nlu(transcript, language)
    nlu_dict = nlu.model_dump() if hasattr(nlu, "model_dump") else nlu.dict()

    # If it's a clear action (not greeting/unknown/help), route through action pipeline
    if nlu.intent not in ("greeting", "unknown", "help") and nlu.confidence > 0.75:
        action_result = await route_action(merchant_id, nlu)
        response_text = action_result.response_text
        action_data = action_result.data
        is_action = True
    else:
        # Use Groq LLM for conversational response (like chat endpoint)
        import httpx
        try:
            # Get merchant context
            from models.db import select as _db_select
            today_txns = _db_select("transactions", filters={"merchant_id": merchant_id})
            total_income = sum(t.get("amount", 0) for t in today_txns if t.get("type") == "income")
            total_expense = sum(t.get("amount", 0) for t in today_txns if t.get("type") == "expense")
            context = f"Income: Rs {total_income:,.0f}, Expense: Rs {total_expense:,.0f}, Profit: Rs {total_income - total_expense:,.0f}"
        except Exception:
            context = "No data yet"

        chat_prompt = (
            "You are Muneem AI, a friendly Hindi-speaking AI accountant for Indian small businesses. "
            "Respond in natural Hinglish (Hindi-English mix). Be warm, concise (2-3 sentences max). "
            f"Merchant context: {context}. "
            f"User said: {transcript}"
        )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json={
                        "model": settings.groq_model,
                        "messages": [{"role": "system", "content": chat_prompt}, {"role": "user", "content": transcript}],
                        "temperature": 0.7,
                        "max_tokens": 200,
                    },
                )
            if resp.status_code == 200:
                response_text = resp.json()["choices"][0]["message"]["content"]
            else:
                response_text = "Maaf kijiye, samajh nahi aaya. Kripya dobara boliye."
        except Exception:
            response_text = "Namaste! Main Muneem hoon. Kya madad kar sakta hoon?"

        action_data = {}
        is_action = False

    audio_url = await synthesize_speech(response_text, language)

    return {
        "transcript": transcript,
        "stt_provider": provider,
        "language": stt_result.get("language", language),
        "segments": stt_result.get("segments"),
        "nlu": nlu_dict,
        "action_result": action_data,
        "response_text": response_text,
        "response_audio_url": audio_url,
        "is_action": is_action,
    }


@router.post("/audio/transcript")
async def transcript_only(
    file: UploadFile = File(...),
    language: str = Form("hi"),
    stt_provider: str = Form("auto"),
):
    """STT only -- no NLU processing."""
    from services.multi_stt import transcribe_multi

    audio_bytes = await file.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is too small or empty.")

    preferred = stt_provider if stt_provider != "auto" else None
    result = await transcribe_multi(
        audio_bytes, language, file.filename or "audio.webm", preferred_provider=preferred,
    )

    return {
        "transcript": result["text"],
        "stt_provider": result["provider"],
        "language": result.get("language", language),
        "segments": result.get("segments"),
    }


# ---------------------------------------------------------------------------
# V2 — Full Multi-Agent Orchestrator Pipeline
# ---------------------------------------------------------------------------

@router.post("/process-agentic")
async def process_voice_agentic(
    audio: UploadFile = File(...),
    merchant_id: str = Form(...),
    language: str = Form("hi"),
):
    """
    Full multi-agent pipeline: Audio → NLU → LangGraph Orchestrator → Specialist Agents → Response.

    This endpoint uses the langgraph_orchestrator which:
    1. Runs NLU (IndicWhisper STT + IndicBERTv2 intent + spaCy NER)
    2. Classifies and routes to specialist agents
    3. Executes primary agents in parallel (action_router + relevant specialists)
    4. Executes secondary agents (payscore recalc, cashflow check)
    5. Synthesizes Hindi response via Master Agent
    6. Emits WebSocket events for real-time dashboard updates
    7. Returns complete response with TTS audio

    This is the production-grade endpoint. /process is the simplified fallback.
    """
    from services.agents.langgraph_orchestrator import process_input

    audio_bytes = await audio.read()
    if len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file is too small.")

    logger.info("Agentic voice request: merchant=%s, audio=%d bytes", merchant_id, len(audio_bytes))

    # Get merchant context for personalization
    try:
        from models.db import select
        merchants = select("merchants", filters={"id": merchant_id}, limit=1)
        merchant_context = merchants[0] if merchants else {"owner_name": "Ji", "name": "Shop"}
    except Exception:
        merchant_context = {"owner_name": "Ji", "name": "Shop"}

    # Run the full multi-agent orchestrator
    state = await process_input(
        merchant_id=merchant_id,
        audio_bytes=audio_bytes,
        source="voice",
        merchant_context=merchant_context,
    )

    # Generate TTS for the response
    audio_url = await synthesize_speech(state.response_hindi, language)

    return {
        "success": state.phase.value == "done",
        "transcript": state.transcript,
        "intent": state.intent,
        "confidence": state.confidence,
        "entities": state.entities,
        "response_hindi": state.response_hindi,
        "response_audio_url": audio_url,
        "agents_invoked": [o["agent"] for o in state.specialist_outputs],
        "agent_results": {o["agent"]: o["result"] for o in state.specialist_outputs},
        "dashboard_delta": state.dashboard_delta,
        "whatsapp_messages": state.whatsapp_messages,
        "processing_time_ms": round(state.processing_time_ms, 1),
        "errors": state.errors,
        "phase": state.phase.value,
        "needs_clarification": state.needs_clarification,
        "clarification_prompt": state.clarification_prompt,
    }


@router.post("/text-agentic")
async def process_text_agentic(req: VoiceTextRequest):
    """
    Text input → Full multi-agent orchestrator pipeline.
    Same as /process-agentic but skips STT.
    """
    from services.agents.langgraph_orchestrator import process_input

    if not req.text or len(req.text.strip()) < 2:
        raise HTTPException(status_code=400, detail="Text is too short.")

    logger.info("Agentic text request: merchant=%s, text='%s'", req.merchant_id, req.text)

    try:
        from models.db import select
        merchants = select("merchants", filters={"id": req.merchant_id}, limit=1)
        merchant_context = merchants[0] if merchants else {"owner_name": "Ji", "name": "Shop"}
    except Exception:
        merchant_context = {"owner_name": "Ji", "name": "Shop"}

    state = await process_input(
        merchant_id=req.merchant_id,
        text=req.text,
        source="dashboard",
        merchant_context=merchant_context,
    )

    audio_url = await synthesize_speech(state.response_hindi, req.language)

    return {
        "success": state.phase.value == "done",
        "transcript": state.transcript or req.text,
        "intent": state.intent,
        "confidence": state.confidence,
        "entities": state.entities,
        "response_hindi": state.response_hindi,
        "response_audio_url": audio_url,
        "agents_invoked": [o["agent"] for o in state.specialist_outputs],
        "agent_results": {o["agent"]: o["result"] for o in state.specialist_outputs},
        "dashboard_delta": state.dashboard_delta,
        "whatsapp_messages": state.whatsapp_messages,
        "processing_time_ms": round(state.processing_time_ms, 1),
        "errors": state.errors,
        "phase": state.phase.value,
    }
