"""
MunimAI Synthetic Data Generator
Generates realistic 6-month Paytm merchant data for "Sunita Saree Shop, Varanasi"

Revenue: Rs 3-4L/month | 3 employees | 200+ customers | Paytm QR + Soundbox
"""

import random
import json
import uuid
from datetime import datetime, timedelta, date
from typing import Optional

# ============================================
# CONSTANTS
# ============================================

DEMO_MERCHANT_ID = "11111111-1111-1111-1111-111111111111"

MERCHANT = {
    "id": DEMO_MERCHANT_ID,
    "name": "Sunita Saree Shop",
    "owner_name": "Sunita Devi",
    "phone": "+919876543210",
    "business_type": "saree_shop",
    "location": {
        "city": "Varanasi",
        "state": "Uttar Pradesh",
        "pincode": "221001",
        "area": "Vishwanath Gali"
    },
    "employee_count": 3,
    "monthly_rent": 15000,
    "paytm_merchant_id": "PAYTM_SUNITA_001",
    "payscore": 74,
    "payscore_grade": "B",
    "preferred_language": "hi",
    "morning_briefing_time": "09:00",
    "onboarding_complete": True,
}

# Indian festivals with revenue impact multipliers
FESTIVALS_2026 = {
    "Makar Sankranti": {"date": "2026-01-14", "multiplier": 1.3},
    "Republic Day": {"date": "2026-01-26", "multiplier": 1.1},
    "Vasant Panchami": {"date": "2026-02-01", "multiplier": 1.4},  # Yellow sarees!
    "Maha Shivaratri": {"date": "2026-02-15", "multiplier": 1.2},
    "Holi": {"date": "2026-03-17", "multiplier": 1.5},
    "Eid ul-Fitr": {"date": "2026-03-21", "multiplier": 1.3},
    "Navratri Start": {"date": "2026-03-28", "multiplier": 1.8},  # HUGE for sarees
    "Ram Navami": {"date": "2026-04-06", "multiplier": 1.6},
    "Baisakhi": {"date": "2026-04-13", "multiplier": 1.3},
    "Akshaya Tritiya": {"date": "2026-04-26", "multiplier": 1.5},
}

# Day-of-week revenue patterns (0=Monday)
DAY_MULTIPLIERS = {
    0: 0.75,   # Monday — slow
    1: 0.85,   # Tuesday
    2: 0.90,   # Wednesday
    3: 0.95,   # Thursday
    4: 1.10,   # Friday — picking up
    5: 1.35,   # Saturday — peak
    6: 0.40,   # Sunday — mostly closed (partial)
}

# Monthly seasonality
MONTH_MULTIPLIERS = {
    1: 0.70,   # January — post-Diwali lull
    2: 0.85,   # February — wedding season starting
    3: 1.10,   # March — Holi + Navratri + financial year end
    4: 0.95,   # April
    5: 0.80,   # May — summer heat
    6: 0.75,   # June — monsoon begins
    7: 0.70,   # July — deep monsoon
    8: 0.80,   # August — Independence Day
    9: 0.95,   # September — Navratri prep
    10: 1.40,  # October — Navratri + Dussehra + Diwali month
    11: 1.20,  # November — post-Diwali weddings
    12: 1.00,  # December — Christmas + New Year
}

# Customer names (realistic Indian names)
CUSTOMER_NAMES = [
    "Sharma ji", "Gupta ji", "Tripathi ji", "Mehra ji", "Patel ji",
    "Agarwal ji", "Singh ji", "Kumar ji", "Verma ji", "Joshi ji",
    "Mishra ji", "Pandey ji", "Tiwari ji", "Dubey ji", "Srivastava ji",
    "Yadav ji", "Chauhan ji", "Saxena ji", "Rastogi ji", "Kapoor ji",
    "Meena Devi", "Kamla ji", "Pushpa ji", "Radha ji", "Lakshmi ji",
    "Geeta ji", "Suman ji", "Asha ji", "Usha ji", "Neeta ji",
    "Poonam ji", "Rekha ji", "Kavita ji", "Sundar ji", "Rajan ji",
    "Mohan ji", "Kiran ji", "Vinod ji", "Rajesh ji", "Mahesh ji",
    "Deepak ji", "Mukesh ji", "Suresh ji", "Ramesh ji", "Ganesh ji",
    "Priya ji", "Anita ji", "Shanta ji", "Mala ji", "Nirmala ji",
]

SUPPLIER_NAMES = [
    "Gupta Traders", "Banarasi Silk House", "Rajesh Textiles",
    "Varanasi Wholesale Market", "Sahu Brothers",
]

EXPENSE_CATEGORIES = {
    "rent": {"amount_range": (15000, 15000), "frequency": "monthly", "payee": "Landlord"},
    "salary_1": {"amount_range": (12000, 12000), "frequency": "monthly", "payee": "Ramesh (helper)"},
    "salary_2": {"amount_range": (12000, 12000), "frequency": "monthly", "payee": "Priya (sales)"},
    "salary_3": {"amount_range": (10000, 10000), "frequency": "monthly", "payee": "Raju (delivery)"},
    "electricity": {"amount_range": (1800, 2800), "frequency": "monthly", "payee": "UPPCL"},
    "stock": {"amount_range": (30000, 65000), "frequency": "weekly", "payee": None},  # Random supplier
    "transport": {"amount_range": (1500, 4000), "frequency": "weekly", "payee": "Transport"},
    "miscellaneous": {"amount_range": (500, 2000), "frequency": "weekly", "payee": "Misc"},
}


def _is_festival(date_obj: date) -> Optional[tuple]:
    """Check if date is near a festival (within 3 days)"""
    for name, info in FESTIVALS_2026.items():
        fest_date = datetime.strptime(info["date"], "%Y-%m-%d").date()
        diff = abs((date_obj - fest_date).days)
        if diff <= 3:
            return (name, info["multiplier"])
    return None


def _get_daily_base_revenue(date_obj: date) -> float:
    """Calculate base daily revenue with all seasonality applied"""
    base = 11500  # Average daily revenue ~Rs 11,500 (Rs 3.45L/month / 30)

    # Month multiplier
    base *= MONTH_MULTIPLIERS.get(date_obj.month, 1.0)

    # Day-of-week multiplier
    base *= DAY_MULTIPLIERS.get(date_obj.weekday(), 1.0)

    # Festival multiplier
    festival = _is_festival(date_obj)
    if festival:
        base *= festival[1]

    # Random noise (+-15%)
    base *= random.uniform(0.85, 1.15)

    return max(base, 0)


def generate_transactions(start_date: date, end_date: date) -> list:
    """Generate 6 months of realistic Paytm transactions"""
    transactions = []
    current = start_date

    while current <= end_date:
        daily_revenue = _get_daily_base_revenue(current)

        if current.weekday() == 6 and random.random() > 0.3:
            # Sunday: 70% chance of being closed
            current += timedelta(days=1)
            continue

        # Generate individual transactions for the day
        remaining = daily_revenue
        num_txns = random.randint(15, 45)
        hour = 9  # Shop opens at 9 AM

        for i in range(num_txns):
            if remaining <= 0:
                break

            # Transaction amount (saree shop: Rs 200 - Rs 25,000)
            if random.random() < 0.1:
                # Big sale (10% chance)
                amount = random.randint(5000, 25000)
            elif random.random() < 0.3:
                # Medium sale
                amount = random.randint(1500, 5000)
            else:
                # Small sale / accessories
                amount = random.randint(200, 1500)

            amount = min(amount, remaining)
            remaining -= amount

            # Payment mode
            mode_roll = random.random()
            if mode_roll < 0.55:
                payment_mode = "upi"
                source = "paytm_webhook"
            elif mode_roll < 0.80:
                payment_mode = "cash"
                source = "voice"
            elif mode_roll < 0.92:
                payment_mode = "card"
                source = "paytm_webhook"
            else:
                payment_mode = "wallet"
                source = "paytm_webhook"

            # Customer (30% are regulars with names)
            customer = None
            if random.random() < 0.3:
                customer = random.choice(CUSTOMER_NAMES[:30])

            # Time of day
            hour = min(hour + random.uniform(0.1, 0.8), 21)
            txn_time = datetime(current.year, current.month, current.day,
                              int(hour), random.randint(0, 59), random.randint(0, 59))

            transactions.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "type": "income",
                "amount": round(amount, 2),
                "category": f"{payment_mode}_payment",
                "description": f"Sale - {payment_mode.upper()}",
                "source": source,
                "payment_mode": payment_mode,
                "customer_name": customer,
                "recorded_at": txn_time.isoformat(),
            })

        current += timedelta(days=1)

    return transactions


def generate_expenses(start_date: date, end_date: date) -> list:
    """Generate realistic business expenses"""
    expenses = []
    current = start_date

    while current <= end_date:
        # Monthly expenses (on specific dates)
        if current.day == 1:
            # Rent
            expenses.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "type": "expense",
                "amount": 15000,
                "category": "rent",
                "description": "Monthly rent",
                "source": "voice",
                "supplier_name": "Landlord",
                "is_recurring": True,
                "recurring_frequency": "monthly",
                "voice_transcript": "Muneem, Rs 15,000 rent diya",
                "recorded_at": datetime(current.year, current.month, current.day, 10, 0).isoformat(),
            })

        if current.day == 5:
            # Salaries
            for emp_name, salary in [("Ramesh", 12000), ("Priya", 12000), ("Raju", 10000)]:
                expenses.append({
                    "id": str(uuid.uuid4()),
                    "merchant_id": DEMO_MERCHANT_ID,
                    "type": "expense",
                    "amount": salary,
                    "category": "salary",
                    "description": f"Salary - {emp_name}",
                    "source": "voice",
                    "supplier_name": emp_name,
                    "is_recurring": True,
                    "recurring_frequency": "monthly",
                    "voice_transcript": f"Muneem, {emp_name} ko Rs {salary} salary diya",
                    "recorded_at": datetime(current.year, current.month, current.day, 11, 0).isoformat(),
                })

        if current.day == 15:
            # Electricity
            bill = random.randint(1800, 2800)
            expenses.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "type": "expense",
                "amount": bill,
                "category": "utilities",
                "description": "Bijli ka bill",
                "source": "voice",
                "supplier_name": "UPPCL",
                "is_recurring": True,
                "recurring_frequency": "monthly",
                "voice_transcript": f"Muneem, bijli ka bill Rs {bill}",
                "recorded_at": datetime(current.year, current.month, current.day, 14, 0).isoformat(),
            })

        # Weekly stock purchases (every Tuesday and Friday)
        if current.weekday() in [1, 4]:
            stock_amount = random.randint(30000, 65000)
            supplier = random.choice(SUPPLIER_NAMES)
            expenses.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "type": "expense",
                "amount": stock_amount,
                "category": "stock",
                "description": f"Stock purchase from {supplier}",
                "source": "voice",
                "supplier_name": supplier,
                "voice_transcript": f"Muneem, Rs {stock_amount} stock kharida {supplier} se",
                "recorded_at": datetime(current.year, current.month, current.day, 16, 0).isoformat(),
            })

        # Weekly transport (every Wednesday)
        if current.weekday() == 2:
            transport = random.randint(1500, 4000)
            expenses.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "type": "expense",
                "amount": transport,
                "category": "transport",
                "description": "Transport / delivery",
                "source": "voice",
                "voice_transcript": f"Muneem, Rs {transport} transport ka bill",
                "recorded_at": datetime(current.year, current.month, current.day, 18, 0).isoformat(),
            })

        # Random miscellaneous (30% chance any day)
        if random.random() < 0.3 and current.weekday() != 6:
            misc = random.randint(200, 1500)
            expenses.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "type": "expense",
                "amount": misc,
                "category": "miscellaneous",
                "description": "Chai-paani / misc expenses",
                "source": "voice",
                "voice_transcript": f"Muneem, Rs {misc} chai-paani kharcha",
                "recorded_at": datetime(current.year, current.month, current.day, 12, 30).isoformat(),
            })

        current += timedelta(days=1)

    return expenses


def generate_customers() -> list:
    """Generate 200+ customer profiles with RFM segments"""
    customers = []
    today = date.today()

    segments = {
        "champion": {"count": 30, "freq_range": (3, 7), "aov_range": (2000, 8000), "last_visit_range": (0, 7)},
        "loyal": {"count": 50, "freq_range": (7, 15), "aov_range": (1500, 5000), "last_visit_range": (3, 20)},
        "promising": {"count": 60, "freq_range": (15, 30), "aov_range": (800, 3000), "last_visit_range": (10, 35)},
        "at_risk": {"count": 40, "freq_range": (20, 45), "aov_range": (1000, 4000), "last_visit_range": (30, 60)},
        "churned": {"count": 20, "freq_range": (30, 90), "aov_range": (500, 3000), "last_visit_range": (60, 120)},
    }

    name_idx = 0
    for segment, config in segments.items():
        for i in range(config["count"]):
            name = CUSTOMER_NAMES[name_idx % len(CUSTOMER_NAMES)]
            if name_idx >= len(CUSTOMER_NAMES):
                name = f"{name} ({name_idx // len(CUSTOMER_NAMES) + 1})"
            name_idx += 1

            freq = random.randint(*config["freq_range"])
            aov = random.randint(*config["aov_range"])
            last_days = random.randint(*config["last_visit_range"])
            visits = random.randint(3, 50)
            total_spent = aov * visits

            churn_risk = "low"
            churn_prob = 0.1
            if segment == "at_risk":
                churn_risk = "medium" if last_days < 45 else "high"
                churn_prob = random.uniform(0.4, 0.75)
            elif segment == "churned":
                churn_risk = "churned"
                churn_prob = random.uniform(0.8, 0.98)

            # RFM scores (1-5)
            rfm_r = max(1, min(5, 6 - (last_days // 15)))
            rfm_f = max(1, min(5, 6 - (freq // 10)))
            rfm_m = max(1, min(5, total_spent // 20000 + 1))

            customers.append({
                "id": str(uuid.uuid4()),
                "merchant_id": DEMO_MERCHANT_ID,
                "name": name,
                "phone": f"+9198{random.randint(10000000, 99999999)}",
                "total_visits": visits,
                "total_spent": total_spent,
                "average_order_value": aov,
                "first_visit": (today - timedelta(days=random.randint(60, 180))).isoformat(),
                "last_visit": (today - timedelta(days=last_days)).isoformat(),
                "visit_frequency_days": freq,
                "expected_next_visit": (today - timedelta(days=last_days) + timedelta(days=freq)).isoformat(),
                "rfm_recency_score": rfm_r,
                "rfm_frequency_score": rfm_f,
                "rfm_monetary_score": rfm_m,
                "rfm_segment": segment,
                "churn_risk": churn_risk,
                "churn_probability": round(churn_prob, 3),
                "days_since_last_visit": last_days,
            })

    return customers


def generate_udhari() -> list:
    """Generate 35 pending udhari entries with diverse risk profiles"""
    udhari = []
    today = date.today()

    # High likelihood to pay (10)
    for i in range(10):
        days_old = random.randint(1, 15)
        amount = random.choice([1000, 2000, 3000, 5000, 8000])
        udhari.append({
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "debtor_name": CUSTOMER_NAMES[i],
            "debtor_phone": f"+9199{random.randint(10000000, 99999999)}",
            "amount": amount,
            "amount_paid": 0,
            "status": "pending",
            "risk_score": round(random.uniform(0.7, 0.95), 3),
            "reminder_count": random.randint(0, 1),
            "escalation_level": 0,
            "source": "voice",
            "due_date": (today + timedelta(days=random.randint(1, 14))).isoformat(),
            "created_at": (today - timedelta(days=days_old)).isoformat(),
        })

    # Medium risk (15)
    for i in range(10, 25):
        days_old = random.randint(15, 45)
        amount = random.choice([3000, 5000, 8000, 12000, 15000])
        paid = random.choice([0, 0, 0, amount * 0.3, amount * 0.5]) if random.random() < 0.3 else 0
        udhari.append({
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "debtor_name": CUSTOMER_NAMES[i],
            "debtor_phone": f"+9199{random.randint(10000000, 99999999)}",
            "amount": amount,
            "amount_paid": round(paid, 2),
            "status": "partial" if paid > 0 else ("overdue" if days_old > 30 else "pending"),
            "risk_score": round(random.uniform(0.3, 0.65), 3),
            "reminder_count": random.randint(1, 4),
            "escalation_level": random.randint(1, 2),
            "source": "voice",
            "due_date": (today - timedelta(days=random.randint(0, 15))).isoformat(),
            "created_at": (today - timedelta(days=days_old)).isoformat(),
        })

    # High risk (10)
    for i in range(25, 35):
        days_old = random.randint(30, 90)
        amount = random.choice([5000, 8000, 10000, 15000, 20000, 25000])
        udhari.append({
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "debtor_name": CUSTOMER_NAMES[i],
            "debtor_phone": f"+9199{random.randint(10000000, 99999999)}",
            "amount": amount,
            "amount_paid": 0,
            "status": "overdue",
            "risk_score": round(random.uniform(0.05, 0.3), 3),
            "reminder_count": random.randint(3, 8),
            "escalation_level": random.randint(2, 3),
            "source": "voice",
            "due_date": (today - timedelta(days=random.randint(15, 60))).isoformat(),
            "created_at": (today - timedelta(days=days_old)).isoformat(),
        })

    return udhari


def generate_employees() -> list:
    """Generate 3 employee records"""
    return [
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "name": "Ramesh",
            "phone": "+919812345001",
            "role": "helper",
            "salary": 12000,
            "payment_frequency": "monthly",
            "last_paid_date": (date.today().replace(day=5)).isoformat(),
            "last_paid_amount": 12000,
            "attendance_this_month": 24,
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "name": "Priya",
            "phone": "+919812345002",
            "role": "sales",
            "salary": 12000,
            "payment_frequency": "monthly",
            "last_paid_date": (date.today().replace(day=5)).isoformat(),
            "last_paid_amount": 12000,
            "attendance_this_month": 26,
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "name": "Raju",
            "phone": "+919812345003",
            "role": "delivery",
            "salary": 10000,
            "payment_frequency": "monthly",
            "last_paid_date": (date.today().replace(day=5)).isoformat(),
            "last_paid_amount": 10000,
            "attendance_this_month": 22,
        },
    ]


def generate_gst_status() -> list:
    """Generate GST filing history"""
    statuses = []
    today = date.today()

    months = [
        ("October 2025", "2025-11-20", "filed", 0),
        ("November 2025", "2025-12-20", "filed", 0),
        ("December 2025", "2026-01-20", "filed", 0),
        ("January 2026", "2026-02-20", "late", 2100),    # Filed late
        ("February 2026", "2026-03-20", "filed", 0),
        ("March 2026", "2026-04-20", "ready", 0),        # Current: ready to file (demo!)
    ]

    for period, due, status, penalty in months:
        statuses.append({
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "gstin": "09AABCT1332L1ZD",
            "return_type": "GSTR-3B",
            "period": period,
            "due_date": due,
            "status": status,
            "estimated_tax": random.randint(8000, 18000),
            "itc_claimed": random.randint(3000, 8000),
            "itc_matched": random.randint(2500, 7500),
            "itc_mismatch": 8400 if period == "January 2026" else random.randint(0, 500),
            "transactions_classified": random.randint(400, 600),
            "transactions_total": random.randint(400, 600),
            "penalty_amount": penalty,
        })

    return statuses


def generate_scheme_matches() -> list:
    """Pre-matched government schemes for the demo merchant"""
    return [
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "scheme_name": "MUDRA Shishu Loan",
            "scheme_code": "MUDRA_SHISHU",
            "description": "Collateral-free loans up to Rs 50,000 for micro enterprises at 8.5% interest rate under Pradhan Mantri MUDRA Yojana",
            "eligible_amount": 50000,
            "interest_rate": 8.5,
            "eligibility_score": 0.92,
            "status": "matched",
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "scheme_name": "PMEGP (Prime Minister's Employment Generation Programme)",
            "scheme_code": "PMEGP",
            "description": "Subsidy of 15-35% on project cost for setting up new micro enterprises. Max project cost Rs 25 lakh for manufacturing.",
            "eligible_amount": 250000,
            "interest_rate": 11.0,
            "eligibility_score": 0.78,
            "status": "matched",
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "scheme_name": "CGTMSE (Credit Guarantee Fund Trust for MSEs)",
            "scheme_code": "CGTMSE",
            "description": "Credit guarantee for collateral-free loans up to Rs 5 crore. Government guarantees up to 85% of the loan amount.",
            "eligible_amount": 500000,
            "interest_rate": 12.0,
            "eligibility_score": 0.85,
            "status": "matched",
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "scheme_name": "Stand-Up India",
            "scheme_code": "STANDUP_INDIA",
            "description": "Loans between Rs 10 lakh to Rs 1 crore for SC/ST and women entrepreneurs for setting up greenfield enterprises.",
            "eligible_amount": 1000000,
            "interest_rate": 9.0,
            "eligibility_score": 0.71,
            "status": "matched",
        },
    ]


def generate_forecasts() -> list:
    """Pre-computed 90-day cash flow forecast"""
    forecasts = []
    today = date.today()

    for i in range(90):
        forecast_date = today + timedelta(days=i)
        base_income = _get_daily_base_revenue(forecast_date)
        base_expense = base_income * random.uniform(0.55, 0.75)

        festival = _is_festival(forecast_date)
        net = base_income - base_expense
        is_crisis = net < 2000

        forecasts.append({
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "forecast_date": forecast_date.isoformat(),
            "predicted_income": round(base_income, 2),
            "predicted_expense": round(base_expense, 2),
            "predicted_net": round(net, 2),
            "confidence_upper": round(net * 1.3, 2),
            "confidence_lower": round(net * 0.7, 2),
            "is_festival": festival is not None,
            "festival_name": festival[0] if festival else None,
            "is_crisis": is_crisis,
            "crisis_severity": "mild" if is_crisis and net > 0 else ("moderate" if is_crisis else None),
            "model_version": "tft_chronos_ensemble_v1",
        })

    return forecasts


def generate_payscore_history() -> list:
    """PayScore history over 6 months"""
    history = []
    today = date.today()
    score = 52  # Starting score 6 months ago

    for month_offset in range(6):
        calc_date = today - timedelta(days=(5 - month_offset) * 30)
        # Score gradually improves
        delta = random.randint(2, 6)
        score = min(100, score + delta)

        # Dip in month 3 (late GST)
        if month_offset == 3:
            score -= 4

        history.append({
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "score": score,
            "grade": "A" if score >= 80 else "B" if score >= 60 else "C" if score >= 40 else "D",
            "feature_breakdown": {
                "consistency": random.randint(15, 22),
                "growth": random.randint(10, 18),
                "risk": random.randint(8, 16),
                "discipline": random.randint(6, 13),
                "depth": random.randint(4, 9),
                "account_aggregator": random.randint(2, 7),
            },
            "improvement_tips": [
                {"tip": "File GST on time next month", "impact": 3, "tip_hindi": "Agla GST time pe file karo"},
                {"tip": "Get 5 more customers on UPI", "impact": 2, "tip_hindi": "5 aur customers ko UPI pe le aao"},
                {"tip": "Reduce udhari below Rs 1L", "impact": 4, "tip_hindi": "Udhari Rs 1 lakh se neeche laao"},
                {"tip": "Log expenses daily via voice", "impact": 1, "tip_hindi": "Rozana kharcha voice se daalo"},
            ],
            "credit_eligibility": {
                "max_loan": 50000 if score < 60 else (200000 if score < 70 else (300000 if score < 80 else 500000)),
                "interest_rate": 18 if score < 60 else (16 if score < 70 else (14 if score < 80 else 12)),
                "vs_moneylender_rate": 36,
                "annual_savings": round((36 - (14 if score >= 70 else 18)) / 100 * 200000, 0),
            },
            "model_version": "tabnet_han_v1",
            "calculated_at": calc_date.isoformat(),
        })

    return history


def generate_events_today() -> list:
    """Generate today's activity feed events"""
    today = datetime.now()
    events = [
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "event_type": "income_added",
            "title": "Rs 2,500 received via UPI",
            "title_hindi": "Rs 2,500 UPI se mila",
            "severity": "success",
            "created_at": today.replace(hour=9, minute=15).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "event_type": "income_added",
            "title": "Rs 4,200 card payment received",
            "title_hindi": "Rs 4,200 card se mila",
            "severity": "success",
            "created_at": today.replace(hour=9, minute=42).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "event_type": "income_added",
            "title": "Rs 800 cash received",
            "title_hindi": "Rs 800 cash mila",
            "severity": "success",
            "created_at": today.replace(hour=10, minute=5).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "event_type": "expense_added",
            "title": "Rs 3,200 stock purchase logged",
            "title_hindi": "Rs 3,200 stock kharcha daala",
            "severity": "info",
            "created_at": today.replace(hour=10, minute=20).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "event_type": "reminder_sent",
            "title": "Reminder sent to Tripathi ji (Rs 12,000)",
            "title_hindi": "Tripathi ji ko reminder bheja (Rs 12,000)",
            "severity": "info",
            "created_at": today.replace(hour=10, minute=30).isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "merchant_id": DEMO_MERCHANT_ID,
            "event_type": "payscore_change",
            "title": "PayScore updated: 72 → 74 (+2)",
            "title_hindi": "PayScore badha: 72 → 74 (+2)",
            "severity": "success",
            "created_at": today.replace(hour=10, minute=35).isoformat(),
        },
    ]
    return events


def generate_all_data() -> dict:
    """Generate complete synthetic dataset"""
    random.seed(42)  # Reproducible

    end_date = date.today()
    start_date = end_date - timedelta(days=180)  # 6 months

    print("🏪 Generating data for Sunita Saree Shop, Varanasi...")

    transactions = generate_transactions(start_date, end_date)
    expenses = generate_expenses(start_date, end_date)
    all_txns = sorted(transactions + expenses, key=lambda x: x["recorded_at"])

    customers = generate_customers()
    udhari_list = generate_udhari()
    employees_list = generate_employees()
    gst_list = generate_gst_status()
    scheme_list = generate_scheme_matches()
    forecast_list = generate_forecasts()
    payscore_list = generate_payscore_history()
    events_list = generate_events_today()

    # Calculate totals for today
    today_str = date.today().isoformat()
    today_income = sum(t["amount"] for t in all_txns
                       if t["type"] == "income" and t["recorded_at"][:10] == today_str)
    today_expense = sum(t["amount"] for t in all_txns
                        if t["type"] == "expense" and t["recorded_at"][:10] == today_str)
    total_udhari = sum(u["amount"] - u["amount_paid"] for u in udhari_list
                       if u["status"] in ("pending", "partial", "overdue"))

    print(f"   📊 Transactions: {len(all_txns)} ({len(transactions)} income + {len(expenses)} expense)")
    print(f"   👥 Customers: {len(customers)}")
    print(f"   📝 Udhari entries: {len(udhari_list)} (total pending: Rs {total_udhari:,.0f})")
    print(f"   👷 Employees: {len(employees_list)}")
    print(f"   📋 GST records: {len(gst_list)}")
    print(f"   🏛️ Scheme matches: {len(scheme_list)}")
    print(f"   📈 Forecast days: {len(forecast_list)}")
    print(f"   💳 PayScore history: {len(payscore_list)} months")
    print(f"   📰 Today's events: {len(events_list)}")
    print(f"   💰 Today: Income Rs {today_income:,.0f} | Expense Rs {today_expense:,.0f}")
    print("   ✅ Data generation complete!")

    return {
        "merchant": MERCHANT,
        "transactions": all_txns,
        "customers": customers,
        "udhari": udhari_list,
        "employees": employees_list,
        "gst_status": gst_list,
        "scheme_matches": scheme_list,
        "forecasts": forecast_list,
        "payscore_history": payscore_list,
        "events": events_list,
    }


if __name__ == "__main__":
    data = generate_all_data()

    # Save to JSON for inspection
    with open("data/synthetic_data.json", "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"\n📁 Saved to data/synthetic_data.json")
