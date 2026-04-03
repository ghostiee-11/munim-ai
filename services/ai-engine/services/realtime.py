"""
Socket.IO real-time event emitter.

Broadcasts domain events to merchant-specific rooms so the frontend
dashboard updates instantly without polling.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _get_sio():
    """
    Lazily import the Socket.IO server instance from main.py to avoid
    circular imports.  Every call goes through here so we never hold a
    stale reference.
    """
    from main import sio
    return sio


# ---------------------------------------------------------------------------
# Core emitter
# ---------------------------------------------------------------------------

async def emit_to_merchant(
    merchant_id: str,
    event: str,
    data: dict[str, Any],
) -> None:
    """
    Emit a Socket.IO event to every client in the merchant's room.

    Parameters
    ----------
    merchant_id : str
        Identifies the room ``merchant_{merchant_id}``.
    event : str
        Event name the frontend listens for (e.g. ``"transaction:created"``).
    data : dict
        JSON-serializable payload.
    """
    sio = _get_sio()
    room = f"merchant_{merchant_id}"
    try:
        await sio.emit(event, data, room=room)
        logger.debug("Emitted %s to %s", event, room)
    except Exception:
        logger.exception("Failed to emit %s to %s", event, room)


# ---------------------------------------------------------------------------
# Domain-specific helpers
# ---------------------------------------------------------------------------

async def emit_transaction_created(merchant_id: str, transaction: dict[str, Any]) -> None:
    """Notify clients that a new transaction was recorded."""
    await emit_to_merchant(merchant_id, "transaction:created", {
        "transaction": transaction,
        "type": "transaction_created",
    })


async def emit_transaction_deleted(merchant_id: str, transaction_id: str) -> None:
    """Notify clients that a transaction was removed."""
    await emit_to_merchant(merchant_id, "transaction:deleted", {
        "transaction_id": transaction_id,
        "type": "transaction_deleted",
    })


async def emit_udhari_created(merchant_id: str, udhari: dict[str, Any]) -> None:
    """Notify clients of a new udhari entry."""
    await emit_to_merchant(merchant_id, "udhari:created", {
        "udhari": udhari,
        "type": "udhari_created",
    })


async def emit_udhari_settled(merchant_id: str, udhari: dict[str, Any]) -> None:
    """Notify clients that an udhari was (partially) settled."""
    await emit_to_merchant(merchant_id, "udhari:settled", {
        "udhari": udhari,
        "type": "udhari_settled",
    })


async def emit_udhari_reminder_sent(merchant_id: str, udhari_id: str, customer_name: str) -> None:
    """Notify clients that a payment reminder was dispatched."""
    await emit_to_merchant(merchant_id, "udhari:reminder_sent", {
        "udhari_id": udhari_id,
        "customer_name": customer_name,
        "type": "udhari_reminder_sent",
    })


async def emit_dashboard_refresh(merchant_id: str, dashboard: Optional[dict[str, Any]] = None) -> None:
    """Tell the frontend to refresh its dashboard state."""
    await emit_to_merchant(merchant_id, "dashboard:refresh", {
        "dashboard": dashboard,
        "type": "dashboard_refresh",
    })


async def emit_voice_response(merchant_id: str, response: dict[str, Any]) -> None:
    """Push a voice interaction result to the frontend."""
    await emit_to_merchant(merchant_id, "voice:response", {
        "response": response,
        "type": "voice_response",
    })


async def emit_alert(merchant_id: str, alert: dict[str, Any]) -> None:
    """Push a proactive alert (cash crunch, overdue, etc.) to the frontend."""
    await emit_to_merchant(merchant_id, "alert:new", {
        "alert": alert,
        "type": "alert",
    })


async def emit_employee_paid(merchant_id: str, employee: dict[str, Any], amount: float) -> None:
    """Notify clients of a salary payment."""
    await emit_to_merchant(merchant_id, "employee:paid", {
        "employee": employee,
        "amount": amount,
        "type": "employee_paid",
    })


async def emit_whatsapp_message(merchant_id: str, message: dict[str, Any]) -> None:
    """Push a new WhatsApp message to the frontend."""
    await emit_to_merchant(merchant_id, "whatsapp:message", {
        "message": message,
        "type": "whatsapp_message",
    })


async def emit_payscore_updated(merchant_id: str, payscore: dict[str, Any]) -> None:
    """Notify clients of a PayScore recalculation."""
    await emit_to_merchant(merchant_id, "payscore:updated", {
        "payscore": payscore,
        "type": "payscore_updated",
    })
