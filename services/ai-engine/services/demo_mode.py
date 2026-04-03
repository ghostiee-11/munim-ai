"""
MunimAI Demo Mode — In-memory data store for running without external services.

When Supabase/Groq/Redis are not configured, the app falls back to this
module which provides:
1. Pre-loaded demo data (Sunita Saree Shop)
2. In-memory CRUD operations
3. Mock NLU responses for common demo phrases
4. Mock WebSocket events

This lets the team see the full app running immediately.
"""

import json
import random
from datetime import datetime, date, timedelta
from typing import Any, Optional
from copy import deepcopy

# ============================================
# IN-MEMORY DATA STORE
# ============================================

DEMO_MERCHANT_ID = "11111111-1111-1111-1111-111111111111"

_store: dict[str, list[dict]] = {
    "merchants": [],
    "transactions": [],
    "udhari": [],
    "customers": [],
    "employees": [],
    "events": [],
    "daily_summary": [],
    "gst_status": [],
    "forecasts": [],
    "payscore_history": [],
    "scheme_matches": [],
    "whatsapp_messages": [],
    "collection_actions": [],
}

_initialized = False


def _load_seed_data():
    """Load seed data into in-memory store"""
    global _initialized
    if _initialized:
        return

    from data.seed_merchant import generate_all_data
    data = generate_all_data()

    _store["merchants"] = [data["merchant"]]
    _store["transactions"] = data["transactions"]
    _store["udhari"] = data["udhari"]
    _store["customers"] = data["customers"]
    _store["employees"] = data["employees"]
    _store["events"] = data["events"]
    _store["gst_status"] = data["gst_status"]
    _store["forecasts"] = data["forecasts"]
    _store["payscore_history"] = data["payscore_history"]
    _store["scheme_matches"] = data["scheme_matches"]

    _initialized = True
    print("📦 Demo mode: loaded seed data into memory")


def ensure_initialized():
    """Make sure demo data is loaded"""
    if not _initialized:
        _load_seed_data()


# ============================================
# MOCK DB OPERATIONS (drop-in for models.db)
# ============================================

def insert(table: str, data: dict) -> dict:
    """Insert into in-memory store"""
    ensure_initialized()
    import uuid
    if "id" not in data:
        data["id"] = str(uuid.uuid4())
    if "created_at" not in data:
        data["created_at"] = datetime.now().isoformat()
    _store.setdefault(table, []).append(data)
    return data


def select(table: str, filters: dict = None, order_by: str = None,
           order_desc: bool = True, limit: int = None) -> list[dict]:
    """Query in-memory store with optional filters"""
    ensure_initialized()
    results = _store.get(table, [])

    if filters:
        for key, value in filters.items():
            results = [r for r in results if r.get(key) == value]

    if order_by:
        results = sorted(results, key=lambda x: x.get(order_by, ""), reverse=order_desc)

    if limit:
        results = results[:limit]

    return deepcopy(results)


def select_range(table: str, filters: dict = None,
                 gte: tuple = None, lte: tuple = None) -> list[dict]:
    """Query with range filters"""
    ensure_initialized()
    results = select(table, filters)

    if gte:
        field, value = gte
        results = [r for r in results if str(r.get(field, "")) >= str(value)]

    if lte:
        field, value = lte
        results = [r for r in results if str(r.get(field, "")) <= str(value)]

    return results


def update(table: str, record_id: str, data: dict) -> dict:
    """Update a record by ID"""
    ensure_initialized()
    records = _store.get(table, [])
    for i, record in enumerate(records):
        if record.get("id") == record_id:
            records[i].update(data)
            records[i]["updated_at"] = datetime.now().isoformat()
            return deepcopy(records[i])
    return data


def delete(table: str, record_id: str) -> bool:
    """Delete a record by ID"""
    ensure_initialized()
    records = _store.get(table, [])
    _store[table] = [r for r in records if r.get("id") != record_id]
    return True


def get_merchant_udharis(merchant_id: str, status: str = None) -> list[dict]:
    """Get udhari entries for a merchant"""
    filters = {"merchant_id": merchant_id}
    if status:
        filters["status"] = status
    return select("udhari", filters)


# ============================================
# MOCK NLU RESPONSES (for demo without Groq)
# ============================================

DEMO_NLU_RESPONSES = {
    # Expense commands
    "rs 5000 rent diya": {
        "intent": "add_expense", "confidence": 0.96,
        "entities": {"amount": 5000, "category": "Rent", "party_name": "Landlord"},
    },
    "muneem rs 5000 rent diya": {
        "intent": "add_expense", "confidence": 0.96,
        "entities": {"amount": 5000, "category": "Rent", "party_name": "Landlord"},
    },
    "bijli ka bill 2200": {
        "intent": "add_expense", "confidence": 0.94,
        "entities": {"amount": 2200, "category": "Utilities", "party_name": "UPPCL"},
    },
    "45000 stock kharida gupta traders se": {
        "intent": "add_expense", "confidence": 0.95,
        "entities": {"amount": 45000, "category": "Stock", "party_name": "Gupta Traders"},
    },
    "muneem rs 45000 stock kharida gupta traders se": {
        "intent": "add_expense", "confidence": 0.95,
        "entities": {"amount": 45000, "category": "Stock", "party_name": "Gupta Traders"},
    },

    # Income commands
    "rs 800 cash mila": {
        "intent": "add_income", "confidence": 0.95,
        "entities": {"amount": 800, "category": "Cash Sale"},
    },
    "2500 mila sharma ji se": {
        "intent": "add_income", "confidence": 0.93,
        "entities": {"amount": 2500, "category": "Sales", "customer_name": "Sharma ji"},
    },

    # Udhari commands
    "sharma ji ka 8000 udhari": {
        "intent": "add_udhari", "confidence": 0.97,
        "entities": {"amount": 8000, "customer_name": "Sharma ji"},
    },
    "muneem sharma ji ka 8000 udhari": {
        "intent": "add_udhari", "confidence": 0.97,
        "entities": {"amount": 8000, "customer_name": "Sharma ji"},
    },
    "sharma ji ne 5000 wapas kiya": {
        "intent": "settle_udhari", "confidence": 0.96,
        "entities": {"amount": 5000, "customer_name": "Sharma ji"},
    },

    # Query commands
    "aaj kaisa raha": {
        "intent": "get_today_summary", "confidence": 0.94,
        "entities": {},
    },
    "muneem aaj kaisa raha": {
        "intent": "get_today_summary", "confidence": 0.94,
        "entities": {},
    },
    "profit kitna hua": {
        "intent": "get_balance", "confidence": 0.92,
        "entities": {},
    },

    # Action commands
    "sab ko remind karo": {
        "intent": "send_reminder", "confidence": 0.95,
        "entities": {},
    },
    "haan bhej do": {
        "intent": "send_reminder", "confidence": 0.90,
        "entities": {},
    },
    "gst file karo": {
        "intent": "get_today_summary", "confidence": 0.88,
        "entities": {},
    },
}

DEMO_ACTION_RESPONSES = {
    "add_expense": "Rs {amount} {category} mein daal diya. Aaj ka total kharcha update ho gaya.",
    "add_income": "Rs {amount} income note kar liya. Dashboard update ho gaya.",
    "add_udhari": "{customer_name} ka Rs {amount} udhari note kar liya. 3 din baad remind karoonga.",
    "settle_udhari": "{customer_name} ne Rs {amount} wapas kar diya! Udhari update ho gaya.",
    "get_today_summary": "Aaj Rs {income} ki income hui, Rs {expense} kharcha, aur Rs {profit} munafa. Margin {margin}%.",
    "get_balance": "Is mahine Rs {income} aaye, Rs {expense} gaye. Net Rs {profit}.",
    "send_reminder": "3 udhari reminders bhej diye! Paytm payment link bhi include hai.",
}


def mock_nlu(text: str) -> dict:
    """Get mock NLU result for a demo phrase"""
    text_lower = text.lower().strip()

    # Exact match
    if text_lower in DEMO_NLU_RESPONSES:
        return DEMO_NLU_RESPONSES[text_lower]

    # Fuzzy match — check if any key is a substring
    for key, result in DEMO_NLU_RESPONSES.items():
        if key in text_lower or text_lower in key:
            return result

    # Keyword matching fallback
    if any(w in text_lower for w in ["mila", "aaya", "cash", "income"]):
        amount = _extract_number(text_lower)
        return {"intent": "add_income", "confidence": 0.80,
                "entities": {"amount": amount or 1000, "category": "Sales"}}

    if any(w in text_lower for w in ["diya", "kharcha", "bill", "rent", "salary"]):
        amount = _extract_number(text_lower)
        return {"intent": "add_expense", "confidence": 0.80,
                "entities": {"amount": amount or 1000, "category": "General"}}

    if any(w in text_lower for w in ["udhari", "udhar", "baaki", "credit"]):
        amount = _extract_number(text_lower)
        return {"intent": "add_udhari", "confidence": 0.80,
                "entities": {"amount": amount or 1000}}

    if any(w in text_lower for w in ["kaisa", "summary", "hisaab", "total"]):
        return {"intent": "get_today_summary", "confidence": 0.80, "entities": {}}

    if any(w in text_lower for w in ["remind", "yaad", "collect", "bhej"]):
        return {"intent": "send_reminder", "confidence": 0.80, "entities": {}}

    # Default
    return {"intent": "greeting", "confidence": 0.50, "entities": {}}


def mock_action_response(intent: str, entities: dict) -> str:
    """Generate demo response for an intent"""
    template = DEMO_ACTION_RESPONSES.get(intent, "Note kar liya.")

    # Fill template with entities or defaults
    today_txns = select("transactions", {"merchant_id": DEMO_MERCHANT_ID})
    today = date.today().isoformat()
    today_txns = [t for t in today_txns if str(t.get("recorded_at", ""))[:10] == today]

    income = sum(t["amount"] for t in today_txns if t.get("type") == "income")
    expense = sum(t["amount"] for t in today_txns if t.get("type") == "expense")
    profit = income - expense
    margin = round((profit / income * 100) if income > 0 else 0, 1)

    return template.format(
        amount=entities.get("amount", 0),
        category=entities.get("category", ""),
        customer_name=entities.get("customer_name", ""),
        party_name=entities.get("party_name", ""),
        income=f"{income:,.0f}",
        expense=f"{expense:,.0f}",
        profit=f"{profit:,.0f}",
        margin=margin,
    )


def _extract_number(text: str) -> Optional[int]:
    """Extract a number from text"""
    import re
    # Try digits first
    nums = re.findall(r'\d+', text.replace(",", ""))
    if nums:
        return int(nums[0])
    return None


def reset_demo_data():
    """Reset in-memory store to fresh seed data"""
    global _initialized
    _initialized = False
    for key in _store:
        _store[key] = []
    _load_seed_data()
    print("🔄 Demo data reset complete")
