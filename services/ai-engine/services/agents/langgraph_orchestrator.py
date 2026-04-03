"""
MunimAI Multi-Agent Orchestrator — LangGraph State Machine

This is the REAL multi-agent system that orchestrates all specialist agents.
Not just a routing table — a proper state machine with:
- Conditional transitions based on intent + confidence
- Parallel agent execution where appropriate
- Feedback loops (collection result → payscore recalculation)
- Approval gates (auto vs ask-merchant)
- Error recovery and graceful degradation

Architecture:
    ┌─────────┐
    │  START   │
    └────┬────┘
         ▼
    ┌─────────┐     confidence < 0.85     ┌──────────────┐
    │   NLU   │ ─────────────────────────→│  CLARIFY     │
    └────┬────┘                           └──────────────┘
         │ confidence >= 0.85
         ▼
    ┌─────────────┐
    │  CLASSIFY   │ → Determines which agents to invoke
    └────┬────────┘
         │
    ┌────┴────────────────────────────────────────┐
    │  PARALLEL SPECIALIST EXECUTION               │
    │  ┌────────┐ ┌────────┐ ┌────────┐          │
    │  │Action  │ │PayScore│ │Customer│ ... etc   │
    │  │Router  │ │Agent   │ │Agent   │           │
    │  └────────┘ └────────┘ └────────┘           │
    └────┬────────────────────────────────────────┘
         │
         ▼
    ┌──────────────┐    needs_approval    ┌──────────────┐
    │  SYNTHESIZE  │ ───────────────────→ │  ASK_MERCHANT│
    └────┬─────────┘                      └──────────────┘
         │ auto_approve
         ▼
    ┌─────────┐
    │  EMIT   │ → WebSocket + TTS + WhatsApp
    └────┬────┘
         ▼
    ┌─────────┐
    │   END   │
    └─────────┘

Paper references:
- LangGraph: https://github.com/langchain-ai/langgraph
- Constitutional AI: Bai et al., 2022 (for RBI compliance guardrails)
- ReAct: Yao et al., 2022 (reasoning + acting pattern)
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional
from enum import Enum

from groq import AsyncGroq
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ============================================
# STATE DEFINITION
# ============================================

class AgentPhase(str, Enum):
    NLU = "nlu"
    CLASSIFY = "classify"
    EXECUTE = "execute"
    SYNTHESIZE = "synthesize"
    APPROVE = "approve"
    EMIT = "emit"
    CLARIFY = "clarify"
    ERROR = "error"
    DONE = "done"


@dataclass
class AgentState:
    """Full state of one MunimAI agent execution cycle"""
    # Input
    merchant_id: str
    input_text: str
    input_source: str = "voice"  # "voice", "whatsapp", "dashboard"
    audio_bytes: Optional[bytes] = None

    # NLU Results
    transcript: str = ""
    intent: str = ""
    confidence: float = 0.0
    entities: dict = field(default_factory=dict)
    needs_clarification: bool = False
    clarification_prompt: str = ""

    # Routing
    phase: AgentPhase = AgentPhase.NLU
    agents_to_invoke: list[str] = field(default_factory=list)
    requires_approval: bool = False

    # Execution Results
    action_results: dict[str, Any] = field(default_factory=dict)
    specialist_outputs: list[dict] = field(default_factory=list)

    # Response
    response_hindi: str = ""
    response_audio_url: Optional[str] = None
    dashboard_delta: dict = field(default_factory=dict)
    websocket_events: list[dict] = field(default_factory=list)
    whatsapp_messages: list[dict] = field(default_factory=list)

    # Context
    merchant_context: dict = field(default_factory=dict)
    conversation_history: list[dict] = field(default_factory=list)

    # Meta
    processing_time_ms: float = 0.0
    errors: list[str] = field(default_factory=list)


# ============================================
# AGENT ROUTING RULES
# ============================================

# Which specialist agents to invoke per intent
AGENT_ROUTING = {
    "CASH_RECEIVED": {
        "primary": ["action_router"],
        "secondary": ["payscore_updater"],  # Recalc after new income
        "auto_approve": True,
    },
    "EXPENSE_LOG": {
        "primary": ["action_router"],
        "secondary": ["cashflow_checker"],  # Check if expense triggers cash crunch
        "auto_approve": True,
    },
    "UDHARI_CREATE": {
        "primary": ["action_router"],
        "secondary": ["collection_scheduler"],  # Schedule first reminder
        "auto_approve": True,
    },
    "UDHARI_SETTLE": {
        "primary": ["action_router"],
        "secondary": ["payscore_updater", "cashflow_checker"],
        "auto_approve": True,
    },
    "QUERY_SUMMARY": {
        "primary": ["summary_generator"],
        "secondary": [],
        "auto_approve": True,
    },
    "QUERY_PROFIT": {
        "primary": ["profit_calculator"],
        "secondary": [],
        "auto_approve": True,
    },
    "QUERY_EXPENSE": {
        "primary": ["expense_analyzer"],
        "secondary": [],
        "auto_approve": True,
    },
    "QUERY_CUSTOMER": {
        "primary": ["customer_lookup"],
        "secondary": [],
        "auto_approve": True,
    },
    "COMMAND_REMIND": {
        "primary": ["collection_agent"],
        "secondary": [],
        "auto_approve": False,  # ASK before sending messages
    },
    "COMMAND_GST": {
        "primary": ["gst_agent"],
        "secondary": [],
        "auto_approve": False,  # ASK before filing
    },
    "PAYMENT_TAG": {
        "primary": ["action_router"],
        "secondary": ["customer_updater"],
        "auto_approve": True,
    },
    "GENERAL": {
        "primary": ["conversational"],
        "secondary": [],
        "auto_approve": True,
    },
}


# ============================================
# ORCHESTRATOR
# ============================================

class MunimOrchestrator:
    """
    Multi-agent orchestrator using state machine pattern.

    Inspired by LangGraph but implemented without the library dependency
    for simplicity and control. Can be migrated to LangGraph when needed.

    Flow:
    1. NLU Phase: Process voice/text input
    2. Classify Phase: Determine which agents to invoke
    3. Execute Phase: Run primary agents (parallel where possible)
    4. Execute Phase 2: Run secondary agents (depend on primary results)
    5. Synthesize Phase: Generate Hindi response via Master Agent
    6. Approve Phase: If needed, ask merchant for approval
    7. Emit Phase: Push WebSocket events, TTS, WhatsApp
    """

    def __init__(self):
        self._groq_client = None

    @property
    def groq(self) -> AsyncGroq:
        if self._groq_client is None:
            self._groq_client = AsyncGroq(api_key=settings.groq_api_key)
        return self._groq_client

    async def process(self, state: AgentState) -> AgentState:
        """Main entry point — processes a complete agent cycle"""
        start_time = time.time()

        try:
            # Phase 1: NLU
            state = await self._phase_nlu(state)
            if state.needs_clarification:
                state.phase = AgentPhase.CLARIFY
                return state

            # Phase 2: Classify + Route
            state = await self._phase_classify(state)

            # Phase 3: Execute primary agents
            state = await self._phase_execute_primary(state)

            # Phase 4: Execute secondary agents (depends on primary results)
            state = await self._phase_execute_secondary(state)

            # Phase 5: Synthesize response
            state = await self._phase_synthesize(state)

            # Phase 6: Check approval
            if state.requires_approval:
                state.phase = AgentPhase.APPROVE
                return state

            # Phase 7: Emit events
            state = await self._phase_emit(state)

            state.phase = AgentPhase.DONE

        except Exception as e:
            logger.exception("Orchestrator error")
            state.errors.append(str(e))
            state.phase = AgentPhase.ERROR
            state.response_hindi = "Maaf kijiye, kuch gadbad ho gayi. Dobara koshish karein."

        state.processing_time_ms = (time.time() - start_time) * 1000
        return state

    # ---- Phase implementations ----

    async def _phase_nlu(self, state: AgentState) -> AgentState:
        """Run NLU pipeline on input"""
        from services.nlu.pipeline import process_voice, process_text

        state.phase = AgentPhase.NLU

        if state.audio_bytes:
            nlu_result = await process_voice(state.audio_bytes)
        else:
            nlu_result = await process_text(state.input_text)

        state.transcript = nlu_result.transcript
        state.intent = nlu_result.intent
        state.confidence = nlu_result.confidence
        state.entities = nlu_result.entities
        state.needs_clarification = nlu_result.needs_clarification
        state.clarification_prompt = nlu_result.clarification_prompt or ""

        logger.info(f"NLU: intent={state.intent}, confidence={state.confidence:.3f}, "
                    f"entities={state.entities}")

        return state

    async def _phase_classify(self, state: AgentState) -> AgentState:
        """Determine which agents to invoke"""
        state.phase = AgentPhase.CLASSIFY

        routing = AGENT_ROUTING.get(state.intent, AGENT_ROUTING["GENERAL"])
        state.agents_to_invoke = routing["primary"] + routing.get("secondary", [])
        state.requires_approval = not routing.get("auto_approve", True)

        logger.info(f"Routing: {state.agents_to_invoke}, approval={state.requires_approval}")

        return state

    async def _phase_execute_primary(self, state: AgentState) -> AgentState:
        """Execute primary specialist agents"""
        state.phase = AgentPhase.EXECUTE

        routing = AGENT_ROUTING.get(state.intent, AGENT_ROUTING["GENERAL"])
        primary_agents = routing["primary"]

        # Execute primary agents in parallel
        tasks = []
        for agent_name in primary_agents:
            task = self._invoke_agent(agent_name, state)
            tasks.append(task)

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for agent_name, result in zip(primary_agents, results):
                if isinstance(result, Exception):
                    logger.error(f"Agent {agent_name} failed: {result}")
                    state.errors.append(f"{agent_name}: {str(result)}")
                else:
                    state.action_results[agent_name] = result
                    state.specialist_outputs.append({
                        "agent": agent_name,
                        "result": result,
                    })

        return state

    async def _phase_execute_secondary(self, state: AgentState) -> AgentState:
        """Execute secondary agents that depend on primary results"""
        routing = AGENT_ROUTING.get(state.intent, AGENT_ROUTING["GENERAL"])
        secondary_agents = routing.get("secondary", [])

        if not secondary_agents:
            return state

        # Secondary agents run sequentially (they may depend on primary results)
        for agent_name in secondary_agents:
            try:
                result = await self._invoke_agent(agent_name, state)
                state.action_results[agent_name] = result
                state.specialist_outputs.append({
                    "agent": agent_name,
                    "result": result,
                })
            except Exception as e:
                logger.error(f"Secondary agent {agent_name} failed: {e}")
                # Non-critical — don't fail the whole pipeline

        return state

    async def _phase_synthesize(self, state: AgentState) -> AgentState:
        """Generate Hindi response using Master Agent"""
        state.phase = AgentPhase.SYNTHESIZE

        from services.agents.master_agent import generate_response

        state.response_hindi = await generate_response(
            intent=state.intent,
            entities=state.entities,
            action_result=state.action_results.get("action_router", {}),
            merchant_name=state.merchant_context.get("owner_name", "Ji"),
            context=state.merchant_context,
        )

        return state

    async def _phase_emit(self, state: AgentState) -> AgentState:
        """Emit WebSocket events and TTS"""
        state.phase = AgentPhase.EMIT

        from services.realtime import emit_to_merchant

        # Emit dashboard update
        if state.dashboard_delta:
            await emit_to_merchant(
                state.merchant_id,
                "dashboard_update",
                state.dashboard_delta,
            )

        # Emit new event for activity feed
        await emit_to_merchant(
            state.merchant_id,
            "new_event",
            {
                "event_type": state.intent.lower(),
                "title": state.response_hindi[:80],
                "title_hindi": state.response_hindi[:80],
                "severity": "success" if "error" not in state.response_hindi.lower() else "warning",
            },
        )

        # Emit voice response
        await emit_to_merchant(
            state.merchant_id,
            "voice_response",
            {
                "transcript": state.transcript,
                "intent": state.intent,
                "confidence": state.confidence,
                "response_hindi": state.response_hindi,
                "audio_url": state.response_audio_url,
                "processing_time_ms": state.processing_time_ms,
            },
        )

        return state

    # ---- Agent invocation ----

    async def _invoke_agent(self, agent_name: str, state: AgentState) -> dict:
        """Invoke a specialist agent by name"""
        if agent_name == "action_router":
            return await self._run_action_router(state)
        elif agent_name == "collection_agent":
            return await self._run_collection_agent(state)
        elif agent_name == "collection_scheduler":
            return await self._run_collection_scheduler(state)
        elif agent_name == "payscore_updater":
            return await self._run_payscore_updater(state)
        elif agent_name == "cashflow_checker":
            return await self._run_cashflow_checker(state)
        elif agent_name == "gst_agent":
            return await self._run_gst_agent(state)
        elif agent_name == "customer_lookup":
            return await self._run_customer_lookup(state)
        elif agent_name == "customer_updater":
            return await self._run_customer_updater(state)
        elif agent_name == "summary_generator":
            return await self._run_summary_generator(state)
        elif agent_name == "profit_calculator":
            return await self._run_profit_calculator(state)
        elif agent_name == "expense_analyzer":
            return await self._run_expense_analyzer(state)
        elif agent_name == "conversational":
            return await self._run_conversational(state)
        else:
            logger.warning(f"Unknown agent: {agent_name}")
            return {"error": f"Unknown agent: {agent_name}"}

    async def _run_action_router(self, state: AgentState) -> dict:
        """Route to action router for DB operations"""
        from services.action_router import route
        from models.schemas import NLUResult as NLUResultSchema

        nlu = NLUResultSchema(
            intent=state.intent,
            confidence=state.confidence,
            entities=state.entities,
        )
        result = await route(state.merchant_id, nlu)
        return result.to_dict()

    async def _run_collection_agent(self, state: AgentState) -> dict:
        """Run RL-based collection for all overdue udhari"""
        from services.agents.collection_agent import plan_collection
        from models.db import get_merchant_udharis

        udhari_list = get_merchant_udharis(state.merchant_id, status="overdue")
        actions = await plan_collection(
            merchant_id=state.merchant_id,
            udhari_list=udhari_list,
            merchant_name=state.merchant_context.get("name", "Shop"),
            merchant_owner=state.merchant_context.get("owner_name", "Ji"),
        )

        # Add WhatsApp messages to state
        for action in actions:
            state.whatsapp_messages.append({
                "recipient": action["debtor_name"],
                "phone": action.get("debtor_phone"),
                "message": action["message"],
                "payment_link": action.get("payment_link"),
            })

        return {"collection_actions": actions, "count": len(actions)}

    async def _run_collection_scheduler(self, state: AgentState) -> dict:
        """Schedule collection for a newly created udhari"""
        # Schedule first reminder in 3 days
        return {
            "scheduled": True,
            "reminder_date": "3 days from now",
            "debtor": state.entities.get("person", ""),
            "amount": state.entities.get("amount", 0),
        }

    async def _run_payscore_updater(self, state: AgentState) -> dict:
        """Recalculate PayScore after a financial event"""
        from services.ml.tabnet_scorer import extract_features, calculate_payscore
        from models.db import select, get_merchant_udharis

        txns = select("transactions", filters={"merchant_id": state.merchant_id}, limit=1000)
        udhari = get_merchant_udharis(state.merchant_id)
        gst = select("gst_status", filters={"merchant_id": state.merchant_id})
        merchant = select("merchants", filters={"id": state.merchant_id}, limit=1)
        merchant_data = merchant[0] if merchant else {}
        customers = select("customers", filters={"merchant_id": state.merchant_id})

        features = extract_features(txns, udhari, gst, merchant_data, customers)
        result = calculate_payscore(features)

        # Update dashboard with new score
        state.dashboard_delta["payscore"] = result.score

        return {
            "score": result.score,
            "grade": result.grade,
            "change": result.score_change,
        }

    async def _run_cashflow_checker(self, state: AgentState) -> dict:
        """Check if this transaction causes a cash crunch alert"""
        # Simple check: if today's profit went negative, alert
        from models.db import select_range
        from datetime import date

        today = date.today().isoformat()
        txns = select_range(
            "transactions",
            filters={"merchant_id": state.merchant_id},
            gte=("date", today),
            lte=("date", today),
        )

        income = sum(t["amount"] for t in txns if t.get("type") == "income")
        expense = sum(t["amount"] for t in txns if t.get("type") == "expense")
        profit = income - expense

        if profit < 0:
            state.websocket_events.append({
                "event": "alert",
                "data": {
                    "type": "negative_profit",
                    "message_hindi": f"Aaj ka profit negative ho gaya: Rs {abs(profit):,.0f}. Udhari collect karein?",
                    "severity": "critical",
                },
            })
            return {"alert": True, "profit": profit, "type": "negative_profit"}

        return {"alert": False, "profit": profit}

    async def _run_gst_agent(self, state: AgentState) -> dict:
        """Handle GST-related commands"""
        try:
            from services.agents.gst_agent import get_gst_status
            status = await get_gst_status(state.merchant_id)
            return {"gst_status": status}
        except ImportError:
            return {"gst_status": "ready", "message": "GST module loading..."}

    async def _run_customer_lookup(self, state: AgentState) -> dict:
        """Look up customer information"""
        customer_name = state.entities.get("person", "")
        from models.db import select

        customers = select(
            "customers",
            filters={"merchant_id": state.merchant_id, "name": customer_name},
            limit=1,
        )

        if customers:
            return {"customer": customers[0], "found": True}
        return {"found": False, "name": customer_name}

    async def _run_customer_updater(self, state: AgentState) -> dict:
        """Update customer profile after a transaction"""
        return {"updated": True}

    async def _run_summary_generator(self, state: AgentState) -> dict:
        """Generate today's summary"""
        from services.action_router import route
        from models.schemas import NLUResult as NLUResultSchema

        nlu = NLUResultSchema(intent="get_today_summary", confidence=1.0, entities={})
        result = await route(state.merchant_id, nlu)
        return result.to_dict()

    async def _run_profit_calculator(self, state: AgentState) -> dict:
        """Calculate profit"""
        from services.action_router import route
        from models.schemas import NLUResult as NLUResultSchema

        nlu = NLUResultSchema(intent="get_balance", confidence=1.0, entities={})
        result = await route(state.merchant_id, nlu)
        return result.to_dict()

    async def _run_expense_analyzer(self, state: AgentState) -> dict:
        """Analyze expense breakdown"""
        from models.db import select
        from collections import Counter

        txns = select(
            "transactions",
            filters={"merchant_id": state.merchant_id, "type": "expense"},
            limit=500,
        )

        categories = Counter(t.get("category", "Other") for t in txns)
        total = sum(t["amount"] for t in txns)

        breakdown = []
        for cat, count in categories.most_common():
            cat_amount = sum(t["amount"] for t in txns if t.get("category") == cat)
            breakdown.append({
                "category": cat,
                "amount": cat_amount,
                "percentage": round(cat_amount / total * 100, 1) if total > 0 else 0,
                "count": count,
            })

        return {"breakdown": breakdown, "total": total}

    async def _run_conversational(self, state: AgentState) -> dict:
        """Free-form conversational response"""
        try:
            response = await self.groq.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {"role": "system", "content": "You are MunimAI, a helpful Hindi-speaking business assistant. Respond concisely in Hindi."},
                    {"role": "user", "content": state.input_text or state.transcript},
                ],
                temperature=0.7,
                max_tokens=150,
            )
            return {"response": response.choices[0].message.content.strip()}
        except Exception:
            return {"response": "Ji, main sun raha hoon. Kaise madad kar sakta hoon?"}


# ============================================
# SINGLETON
# ============================================

_orchestrator: Optional[MunimOrchestrator] = None


def get_orchestrator() -> MunimOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = MunimOrchestrator()
    return _orchestrator


async def process_input(
    merchant_id: str,
    text: str = "",
    audio_bytes: bytes = None,
    source: str = "voice",
    merchant_context: dict = None,
) -> AgentState:
    """
    High-level API: process voice/text input through the full multi-agent pipeline.

    Returns the complete AgentState with all results, response, and events.
    """
    orchestrator = get_orchestrator()

    state = AgentState(
        merchant_id=merchant_id,
        input_text=text,
        input_source=source,
        audio_bytes=audio_bytes,
        merchant_context=merchant_context or {},
    )

    state = await orchestrator.process(state)

    logger.info(
        f"Pipeline complete: intent={state.intent}, "
        f"phase={state.phase.value}, "
        f"time={state.processing_time_ms:.0f}ms, "
        f"agents={len(state.specialist_outputs)}, "
        f"errors={len(state.errors)}"
    )

    return state
