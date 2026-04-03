"""
Demo router -- simulation endpoints for product demos and testing.

These endpoints allow seeding data, simulating transactions, and
triggering alerts without real-world side effects.
"""

from __future__ import annotations

import logging
import random
from datetime import date, datetime, timedelta

from fastapi import APIRouter

from models import db
from models.schemas import (
    DemoResetRequest,
    DemoSimulateCollection,
    DemoSimulatePayment,
    DemoTriggerAlert,
    TransactionType,
    UdhariStatus,
)
from services import realtime

logger = logging.getLogger(__name__)
router = APIRouter()

# Realistic Indian SMB demo data
_DEMO_CATEGORIES_INCOME = ["Sales", "Service", "Repair", "Rental", "Commission"]
_DEMO_CATEGORIES_EXPENSE = ["Inventory", "Rent", "Electricity", "Transport", "Packaging", "Salary", "Miscellaneous"]
_DEMO_CUSTOMERS = [
    ("Sharma ji", "9876543210"),
    ("Gupta Trading", "9812345678"),
    ("Priya Textiles", "9988776655"),
    ("Rajesh Kirana", "9123456789"),
    ("Meena Sweets", "9234567890"),
    ("Arjun Electronics", "9345678901"),
    ("Fatima Garments", "9456789012"),
    ("Vikram Hardware", "9567890123"),
]


@router.post("/reset")
async def reset_demo(body: DemoResetRequest):
    """
    Reset the demo merchant's data and seed with fresh realistic entries.

    Creates 30 days of transaction history, a few udhari entries,
    customers, and employees.
    """
    merchant_id = body.merchant_id
    logger.info("Resetting demo data for merchant: %s", merchant_id)

    # Clear existing data (order matters due to potential FK constraints)
    for table in ["transactions", "udhari", "customers", "employees", "whatsapp_messages", "briefings"]:
        try:
            existing = db.select(table, filters={"merchant_id": merchant_id})
            for row in existing:
                db.delete(table, row["id"])
        except Exception:
            logger.debug("Could not clear %s for demo reset", table)

    # Seed transactions for last 30 days
    transactions_created = 0
    for day_offset in range(30, 0, -1):
        d = (date.today() - timedelta(days=day_offset)).isoformat()
        num_txns = random.randint(3, 8)

        for _ in range(num_txns):
            is_income = random.random() < 0.6
            if is_income:
                amount = random.choice([100, 200, 350, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000])
                category = random.choice(_DEMO_CATEGORIES_INCOME)
                customer = random.choice(_DEMO_CUSTOMERS)
                db.insert("transactions", {
                    "merchant_id": merchant_id,
                    "amount": amount,
                    "type": TransactionType.INCOME.value,
                    "category": category,
                    "customer_name": customer[0],
                    "recorded_at": d,
                    "source": "demo",
                })
            else:
                amount = random.choice([50, 100, 200, 300, 500, 800, 1000, 2000])
                category = random.choice(_DEMO_CATEGORIES_EXPENSE)
                db.insert("transactions", {
                    "merchant_id": merchant_id,
                    "amount": amount,
                    "type": TransactionType.EXPENSE.value,
                    "category": category,
                    "recorded_at": d,
                    "source": "demo",
                })
            transactions_created += 1

    # Seed customers
    customers_created = 0
    for name, phone in _DEMO_CUSTOMERS:
        db.insert("customers", {
            "merchant_id": merchant_id,
            "name": name,
            "phone": phone,
            "total_visits": random.randint(5, 50),
            "total_spent": random.randint(5000, 100000),
            "last_visit": (date.today() - timedelta(days=random.randint(0, 45))).isoformat(),
            "rfm_segment": random.choice(["regular", "vip", "occasional"]),
        })
        customers_created += 1

    # Seed udharis
    udharis_created = 0
    for name, phone in random.sample(_DEMO_CUSTOMERS, 4):
        amount = random.choice([500, 1000, 1500, 2000, 3000, 5000])
        status = random.choice(["pending", "pending", "overdue", "partial"])
        paid = random.randint(0, amount // 2) if status == "partial" else 0
        db.insert("udhari", {
            "merchant_id": merchant_id,
            "debtor_name": name,
            "debtor_phone": phone,
            "amount": amount,
            "amount_paid": paid,
            "status": status,
            "notes": "Demo udhari",
            "due_date": (date.today() - timedelta(days=random.randint(-10, 20))).isoformat(),
        })
        udharis_created += 1

    # Seed employees
    employees_created = 0
    demo_employees = [
        ("Ravi Kumar", "Helper", 8000),
        ("Sunita Devi", "Cashier", 10000),
        ("Mohammad Irfan", "Delivery", 9000),
    ]
    for name, role, salary in demo_employees:
        db.insert("employees", {
            "merchant_id": merchant_id,
            "name": name,
            "role": role,
            "salary": salary,
            "payment_frequency": "monthly",
        })
        employees_created += 1

    await realtime.emit_dashboard_refresh(merchant_id)

    return {
        "status": "reset_complete",
        "merchant_id": merchant_id,
        "seeded": {
            "transactions": transactions_created,
            "customers": customers_created,
            "udhari": udharis_created,
            "employees": employees_created,
        },
    }


@router.post("/simulate-payment")
async def simulate_payment(body: DemoSimulatePayment):
    """Simulate an incoming payment (income transaction) with real-time update."""
    txn = db.insert("transactions", {
        "merchant_id": body.merchant_id,
        "amount": body.amount,
        "type": TransactionType.INCOME.value,
        "category": body.category,
        "customer_name": body.party_name,
        "recorded_at": datetime.now().isoformat(),
        "source": "demo_simulation",
    })

    await realtime.emit_transaction_created(body.merchant_id, txn)
    await realtime.emit_dashboard_refresh(body.merchant_id)

    return {"simulated": True, "transaction": txn}


@router.post("/simulate-collection")
async def simulate_collection(body: DemoSimulateCollection):
    """
    Simulate an udhari collection.  If udhari_id is given, partially settles
    that entry.  Otherwise picks a random pending udhari.
    """
    merchant_id = body.merchant_id

    if body.udhari_id:
        udhari = db.select("udhari", filters={"id": body.udhari_id}, single=True)
    else:
        udharis = db.get_merchant_udharis(merchant_id, status="pending")
        if not udharis:
            return {"simulated": False, "reason": "No pending udharis found."}
        udhari = random.choice(udharis)

    if not udhari:
        return {"simulated": False, "reason": "Udhari not found."}

    settle_amount = min(body.amount, udhari.get("remaining", body.amount))
    new_paid = udhari.get("amount_paid", 0) + settle_amount
    new_remaining = max(0, udhari["amount"] - new_paid)
    new_status = UdhariStatus.SETTLED.value if new_remaining == 0 else UdhariStatus.PARTIAL.value

    updated = db.update("udhari", udhari["id"], {
        "amount_paid": new_paid,
        "status": new_status,
    })

    # Also record income
    db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": settle_amount,
        "type": TransactionType.INCOME.value,
        "category": "Udhari Collection",
        "customer_name": udhari.get("debtor_name"),
        "recorded_at": datetime.now().isoformat(),
        "source": "demo_simulation",
    })

    await realtime.emit_udhari_settled(merchant_id, updated)
    await realtime.emit_dashboard_refresh(merchant_id)

    return {"simulated": True, "udhari": updated, "amount_collected": settle_amount}


@router.post("/trigger-alert")
async def trigger_alert(body: DemoTriggerAlert):
    """Trigger a simulated proactive alert for demo purposes."""
    alert_messages = {
        "cash_crunch": {
            "type": "cash_crunch",
            "severity": "critical",
            "title": "Cash Crunch Warning",
            "message": "Agle 7 din mein cash ki kami ho sakti hai. Kuch collections jaldi karein.",
            "recommendation": "Top 3 overdue customers ko aaj hi reminder bhejein.",
        },
        "revenue_drop": {
            "type": "revenue_drop",
            "severity": "warning",
            "title": "Revenue Drop Detected",
            "message": "Pichle hafte se income 35% kam aayi hai.",
            "recommendation": "Inactive customers ko special offer bhejein.",
        },
        "overdue_udhari": {
            "type": "overdue_udhari",
            "severity": "warning",
            "title": "Overdue Udhari Alert",
            "message": "5 customers ka Rs 15,000 udhari overdue ho gaya hai.",
            "recommendation": "WhatsApp se automated reminder bhejein.",
        },
        "expense_spike": {
            "type": "expense_spike",
            "severity": "info",
            "title": "Expense Spike",
            "message": "Is hafte kharche normal se 40% zyada hain.",
            "recommendation": "Bade kharche review karein, kahin unnecessary toh nahi.",
        },
    }

    alert = alert_messages.get(body.alert_type, alert_messages["cash_crunch"])

    await realtime.emit_alert(body.merchant_id, alert)

    return {"triggered": True, "alert": alert}
