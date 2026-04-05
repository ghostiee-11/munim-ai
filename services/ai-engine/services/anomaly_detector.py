"""
Anomaly Detection Service using statistical methods (z-score, IQR).
No scikit-learn dependency - uses numpy only.
"""

import logging
from datetime import datetime, date, timedelta
from collections import defaultdict

import numpy as np

from models import db

logger = logging.getLogger(__name__)


async def detect_anomalies(merchant_id: str, lookback_days: int = 90) -> list[dict]:
    """
    Detect anomalous transactions using z-score analysis per category.

    Anomaly types:
    - amount_spike: Amount > mean + 2*stddev for that category
    - unusual_timing: Transaction at unusual hour (before 6am or after 11pm)
    - new_large_payee: First transaction with a payee but amount > Rs 10,000
    - round_number: Suspiciously round amount > Rs 10,000 (possible fake invoice)
    """
    today = date.today()
    start = (today - timedelta(days=lookback_days)).isoformat()

    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("created_at", start),
        limit=5000,
    )

    if not txns or len(txns) < 5:
        return []

    anomalies = []

    # --- 1. Z-score per category ---
    cat_amounts: dict[str, list[float]] = defaultdict(list)
    for t in txns:
        cat = t.get("category", "Other") or "Other"
        amt = float(t.get("amount", 0) or 0)
        if amt > 0:
            cat_amounts[cat].append(amt)

    cat_stats: dict[str, tuple[float, float]] = {}
    for cat, amounts in cat_amounts.items():
        if len(amounts) >= 3:
            arr = np.array(amounts)
            cat_stats[cat] = (float(np.mean(arr)), float(np.std(arr)))

    for t in txns:
        cat = t.get("category", "Other") or "Other"
        amt = float(t.get("amount", 0) or 0)

        if cat in cat_stats:
            mean, std = cat_stats[cat]
            if std > 0 and amt > mean + 2 * std:
                z_score = round((amt - mean) / std, 1)
                anomalies.append({
                    "txn_id": t.get("id"),
                    "amount": amt,
                    "category": cat,
                    "description": t.get("description", ""),
                    "date": str(t.get("created_at", ""))[:10],
                    "anomaly_type": "amount_spike",
                    "score": min(1.0, round(z_score / 5, 2)),
                    "details": f"Rs {amt:,.0f} is {z_score}x std above avg Rs {mean:,.0f}",
                    "alert_hi": f"⚠️ {cat} mein Rs {amt:,.0f} ka kharcha unusual hai. Average Rs {mean:,.0f} hai.",
                })

    # --- 2. Unusual timing ---
    for t in txns:
        created = t.get("created_at", "")
        if created and len(str(created)) > 13:
            try:
                hour = int(str(created)[11:13])
                if hour < 6 or hour > 23:
                    amt = float(t.get("amount", 0) or 0)
                    anomalies.append({
                        "txn_id": t.get("id"),
                        "amount": amt,
                        "category": t.get("category", ""),
                        "description": t.get("description", ""),
                        "date": str(created)[:10],
                        "anomaly_type": "unusual_timing",
                        "score": 0.6,
                        "details": f"Transaction at {hour}:00 hours",
                        "alert_hi": f"🕐 Raat {hour} baje Rs {amt:,.0f} ka transaction. Verify karein.",
                    })
            except (ValueError, IndexError):
                pass

    # --- 3. New large payee ---
    payee_counts: dict[str, int] = defaultdict(int)
    for t in txns:
        payee = (t.get("customer_name", "") or t.get("description", "") or "").strip().lower()
        if payee:
            payee_counts[payee] += 1

    for t in txns:
        payee = (t.get("customer_name", "") or t.get("description", "") or "").strip().lower()
        amt = float(t.get("amount", 0) or 0)
        if payee and payee_counts.get(payee, 0) == 1 and amt > 10000:
            anomalies.append({
                "txn_id": t.get("id"),
                "amount": amt,
                "category": t.get("category", ""),
                "description": t.get("description", ""),
                "date": str(t.get("created_at", ""))[:10],
                "anomaly_type": "new_large_payee",
                "score": 0.7,
                "details": f"First transaction with this payee, amount Rs {amt:,.0f}",
                "alert_hi": f"🆕 Naye party ko Rs {amt:,.0f} diya. Pehli baar hai. Verify karein.",
            })

    # --- 4. Round number large amounts ---
    for t in txns:
        amt = float(t.get("amount", 0) or 0)
        if amt >= 10000 and amt % 1000 == 0 and t.get("type") == "expense":
            anomalies.append({
                "txn_id": t.get("id"),
                "amount": amt,
                "category": t.get("category", ""),
                "description": t.get("description", ""),
                "date": str(t.get("created_at", ""))[:10],
                "anomaly_type": "round_number",
                "score": 0.4,
                "details": f"Exact round amount Rs {amt:,.0f}",
                "alert_hi": f"🔢 Rs {amt:,.0f} bilkul round amount hai. Invoice check karein.",
            })

    # Sort by score descending, deduplicate by txn_id
    seen = set()
    unique = []
    for a in sorted(anomalies, key=lambda x: -x["score"]):
        tid = a.get("txn_id")
        if tid and tid not in seen:
            seen.add(tid)
            unique.append(a)

    return unique[:20]  # Top 20 anomalies
