"""
MunimAI API Routers.

Each module exposes a FastAPI ``APIRouter`` instance named ``router``
that is mounted in ``main.py`` with the appropriate prefix and tags.
"""

from routers import (
    voice,
    transactions,
    udhari,
    dashboard,
    forecast,
    payscore,
    gst,
    customers,
    schemes,
    employees,
    whatsapp,
    briefing,
    demo,
    paytm,
    recurring,
    invoices,
    inventory,
)

__all__ = [
    "voice",
    "transactions",
    "udhari",
    "dashboard",
    "forecast",
    "payscore",
    "gst",
    "customers",
    "schemes",
    "employees",
    "whatsapp",
    "briefing",
    "demo",
    "paytm",
    "recurring",
    "invoices",
    "inventory",
]
