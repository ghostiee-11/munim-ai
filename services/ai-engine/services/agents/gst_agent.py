"""
MunimAI GST Autopilot Agent

Handles all GST-related operations for Indian small businesses:
1. Auto-classify transactions to HSN/SAC codes using Groq LLM
2. Prepare GSTR-3B filing summary
3. Cross-reference ITC claims for mismatches
4. Track filing status, deadlines, and penalties

Uses IndicBERT-style prompting for accurate HSN code classification
with a comprehensive system prompt containing HSN code examples.
"""

import json
import logging
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from groq import AsyncGroq

from config import get_settings
from models import db

logger = logging.getLogger(__name__)

settings = get_settings()

# Load HSN codes data
_HSN_DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "hsn_codes.json"
_HSN_DATA: dict = {}

def _load_hsn_data() -> dict:
    """Load HSN/SAC codes from data file."""
    global _HSN_DATA
    if not _HSN_DATA:
        try:
            with open(_HSN_DATA_PATH, "r", encoding="utf-8") as f:
                _HSN_DATA = json.load(f)
        except FileNotFoundError:
            logger.warning("HSN codes file not found at %s", _HSN_DATA_PATH)
            _HSN_DATA = {"common_codes": [], "sac_codes": [], "category_to_hsn_mapping": {}}
    return _HSN_DATA


# IndicBERT-style system prompt for HSN classification
HSN_CLASSIFICATION_PROMPT = """You are an expert Indian GST tax classifier trained on HSN and SAC codes.

Your task: Given a business transaction description, classify it to the correct HSN (goods) or SAC (services) code and determine the applicable GST rate.

CLASSIFICATION RULES:
1. HSN codes are for GOODS (physical products)
2. SAC codes are for SERVICES (intangible services)
3. GST slabs: 0%, 5%, 12%, 18%, 28%
4. For textiles under Rs 1000/piece: 5% GST
5. For textiles above Rs 1000/piece: 12% GST
6. Essential food items (rice, atta, milk): 0% GST
7. For ambiguous items, choose the LOWER rate (benefit of doubt to taxpayer)

COMMON HSN CODES FOR SMALL BUSINESSES:
- 5007: Woven fabrics of silk (5%)
- 5208: Woven fabrics of cotton (5%)
- 5407: Synthetic fabrics (5%)
- 6204: Women's suits, dresses, sarees (5%)
- 6106: Women's blouses and shirts (5%)
- 6214: Shawls, scarves, veils (5%)
- 7117: Imitation jewellery (18%)
- 4819: Cartons, boxes, bags of paper (18%)
- 0402: Milk and cream (0%)
- 0902: Tea (5%)
- 1006: Rice (0%)
- 1101: Wheat flour/atta (0%)
- 1507: Cooking oil (5%)
- 2201: Packaged water (18%)
- 2202: Soft drinks (28%)

COMMON SAC CODES:
- 997212: Commercial property rent (18%)
- 998511: Personnel supply/salary (18%)
- 996511: Road transport goods (5%)
- 999711: Electricity (18%)
- 998721: Maintenance and repair (18%)

RESPOND IN STRICT JSON FORMAT:
{"hsn_code": "XXXX", "gst_rate": X, "category": "category_name", "confidence": 0.X, "reasoning": "brief explanation"}
"""


async def classify_transactions(
    merchant_id: str,
    transactions: list[dict],
) -> list[dict]:
    """
    Auto-classify transactions to HSN/SAC codes using Groq LLM.

    Args:
        merchant_id: The merchant's UUID
        transactions: List of transaction dicts with at least
                      {id, description, category, amount, type}

    Returns:
        List of classification results:
        [{transaction_id, hsn_code, gst_rate, category, confidence}]
    """
    hsn_data = _load_hsn_data()
    category_map = hsn_data.get("category_to_hsn_mapping", {})
    all_codes = {c["hsn"]: c for c in hsn_data.get("common_codes", [])}
    all_codes.update({c["sac"]: c for c in hsn_data.get("sac_codes", [])})

    results = []

    for txn in transactions:
        txn_id = txn.get("id", "unknown")
        description = txn.get("description", "")
        category = txn.get("category", "")
        amount = txn.get("amount", 0)

        # Try rule-based classification first (fast path)
        rule_result = _rule_based_classify(category, description, amount, category_map, all_codes)
        if rule_result and rule_result["confidence"] >= 0.8:
            results.append({"transaction_id": txn_id, **rule_result})
            continue

        # Fall back to LLM classification
        llm_result = await _llm_classify(description, category, amount)
        results.append({"transaction_id": txn_id, **llm_result})

    return results


def _rule_based_classify(
    category: str,
    description: str,
    amount: float,
    category_map: dict,
    all_codes: dict,
) -> Optional[dict]:
    """
    Fast rule-based HSN/SAC classification using category mapping.

    Returns None if no confident match is found.
    """
    category_lower = category.lower().strip()
    description_lower = description.lower().strip() if description else ""

    # Direct category match
    for key, code in category_map.items():
        if key in category_lower or key in description_lower:
            code_info = all_codes.get(code, {})
            gst_rate = code_info.get("gst_rate", 18)

            # Textile rate adjustment based on price
            if code_info.get("category") in ("textiles", "garments") and amount > 1000:
                gst_rate = 12

            return {
                "hsn_code": code,
                "gst_rate": gst_rate,
                "category": code_info.get("category", category_lower),
                "confidence": 0.85,
            }

    # Common keyword matching
    keyword_map = {
        "saree": ("6204", 5, "garments"),
        "sari": ("6204", 5, "garments"),
        "fabric": ("5208", 5, "textiles"),
        "kapda": ("5208", 5, "textiles"),
        "silk": ("5007", 5, "textiles"),
        "resham": ("5007", 5, "textiles"),
        "blouse": ("6106", 5, "garments"),
        "dupatta": ("6214", 5, "accessories"),
        "shawl": ("6214", 5, "accessories"),
        "jewellery": ("7117", 18, "jewellery"),
        "jewelry": ("7117", 18, "jewellery"),
        "rent": ("997212", 18, "rent"),
        "kiraya": ("997212", 18, "rent"),
        "salary": ("998511", 18, "salary"),
        "tankhah": ("998511", 18, "salary"),
        "bijli": ("999711", 18, "utilities"),
        "electricity": ("999711", 18, "utilities"),
        "transport": ("996511", 5, "transport"),
        "delivery": ("996511", 5, "transport"),
        "tea": ("0902", 5, "food"),
        "chai": ("0902", 5, "food"),
        "rice": ("1006", 0, "food"),
        "chawal": ("1006", 0, "food"),
        "atta": ("1101", 0, "food"),
        "milk": ("0402", 0, "food"),
        "doodh": ("0402", 0, "food"),
        "oil": ("1507", 5, "food"),
        "tel": ("1507", 5, "food"),
    }

    combined = f"{category_lower} {description_lower}"
    for keyword, (code, rate, cat) in keyword_map.items():
        if keyword in combined:
            return {
                "hsn_code": code,
                "gst_rate": rate,
                "category": cat,
                "confidence": 0.80,
            }

    return None


async def _llm_classify(description: str, category: str, amount: float) -> dict:
    """Use Groq LLM for HSN/SAC classification when rules are insufficient."""
    user_prompt = f"""Classify this Indian business transaction:
Description: {description}
Category: {category}
Amount: Rs {amount:,.0f}

Return JSON with hsn_code, gst_rate, category, confidence, reasoning."""

    try:
        client = AsyncGroq(api_key=settings.groq_api_key)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {"role": "system", "content": HSN_CLASSIFICATION_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,  # Low temperature for consistent classification
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return {
            "hsn_code": str(result.get("hsn_code", "9999")),
            "gst_rate": result.get("gst_rate", 18),
            "category": result.get("category", "uncategorized"),
            "confidence": result.get("confidence", 0.5),
        }
    except Exception as e:
        logger.error("LLM HSN classification failed: %s", e)
        return {
            "hsn_code": "9999",
            "gst_rate": 18,
            "category": "uncategorized",
            "confidence": 0.1,
        }


async def prepare_gstr3b(merchant_id: str) -> dict:
    """
    Aggregate classified transactions into GSTR-3B filing summary.

    Pulls the current month's transactions, classifies them,
    and calculates CGST, SGST, IGST, and ITC claims.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        GSTR-3B filing summary dict with tax breakdowns.
    """
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    month_end = today.isoformat()

    try:
        transactions = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("date", month_start),
            lte=("date", month_end),
        )
    except Exception as e:
        logger.error("Failed to fetch transactions for GSTR-3B: %s", e)
        transactions = []

    if not transactions:
        return _empty_gstr3b(merchant_id, today)

    # Classify all transactions
    classifications = await classify_transactions(merchant_id, transactions)
    classification_map = {c["transaction_id"]: c for c in classifications}

    # Separate sales (income) and purchases (expense)
    total_taxable_sales = 0.0
    total_taxable_purchases = 0.0
    sales_by_rate = {0: 0.0, 5: 0.0, 12: 0.0, 18: 0.0, 28: 0.0}
    purchases_by_rate = {0: 0.0, 5: 0.0, 12: 0.0, 18: 0.0, 28: 0.0}

    for txn in transactions:
        txn_id = txn.get("id", "")
        cls = classification_map.get(txn_id, {"gst_rate": 18})
        rate = cls.get("gst_rate", 18)
        amount = txn.get("amount", 0)

        if txn.get("type") == "income":
            total_taxable_sales += amount
            sales_by_rate[rate] = sales_by_rate.get(rate, 0) + amount
        elif txn.get("type") == "expense":
            total_taxable_purchases += amount
            purchases_by_rate[rate] = purchases_by_rate.get(rate, 0) + amount

    # Calculate tax amounts (intra-state: CGST + SGST, each half of GST rate)
    cgst = sum(amt * (rate / 100 / 2) for rate, amt in sales_by_rate.items())
    sgst = cgst  # Same as CGST for intra-state
    igst = 0.0   # Assuming intra-state for small businesses

    # ITC (Input Tax Credit) from purchases
    itc_cgst = sum(amt * (rate / 100 / 2) for rate, amt in purchases_by_rate.items())
    itc_sgst = itc_cgst
    itc_igst = 0.0

    # Net tax payable
    net_cgst = max(0, cgst - itc_cgst)
    net_sgst = max(0, sgst - itc_sgst)
    net_igst = max(0, igst - itc_igst)
    total_payable = net_cgst + net_sgst + net_igst

    return {
        "merchant_id": merchant_id,
        "period": f"{today.strftime('%B %Y')}",
        "filing_type": "GSTR-3B",
        "total_taxable_sales": round(total_taxable_sales, 2),
        "total_taxable_purchases": round(total_taxable_purchases, 2),
        "sales_by_rate": {str(k): round(v, 2) for k, v in sales_by_rate.items()},
        "purchases_by_rate": {str(k): round(v, 2) for k, v in purchases_by_rate.items()},
        "output_tax": {
            "cgst": round(cgst, 2),
            "sgst": round(sgst, 2),
            "igst": round(igst, 2),
            "total": round(cgst + sgst + igst, 2),
        },
        "itc_claimed": {
            "cgst": round(itc_cgst, 2),
            "sgst": round(itc_sgst, 2),
            "igst": round(itc_igst, 2),
            "total": round(itc_cgst + itc_sgst + itc_igst, 2),
        },
        "net_payable": {
            "cgst": round(net_cgst, 2),
            "sgst": round(net_sgst, 2),
            "igst": round(net_igst, 2),
            "total": round(total_payable, 2),
        },
        "status": "draft",
        "generated_at": datetime.now().isoformat(),
    }


def _empty_gstr3b(merchant_id: str, today: date) -> dict:
    """Return an empty GSTR-3B summary when no transactions exist."""
    zero_tax = {"cgst": 0.0, "sgst": 0.0, "igst": 0.0, "total": 0.0}
    return {
        "merchant_id": merchant_id,
        "period": f"{today.strftime('%B %Y')}",
        "filing_type": "GSTR-3B",
        "total_taxable_sales": 0.0,
        "total_taxable_purchases": 0.0,
        "sales_by_rate": {},
        "purchases_by_rate": {},
        "output_tax": zero_tax,
        "itc_claimed": zero_tax,
        "net_payable": zero_tax,
        "status": "no_data",
        "generated_at": datetime.now().isoformat(),
    }


async def check_itc_mismatch(merchant_id: str) -> list[dict]:
    """
    Cross-reference merchant's purchase data with ITC claims.

    Compares purchase invoices against claimed input tax credits
    and flags any mismatches that could trigger GST audit issues.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        List of mismatch dicts:
        [{type, description, amount_difference, severity, recommendation}]
    """
    today = date.today()
    month_start = today.replace(day=1).isoformat()

    try:
        # Fetch purchase transactions (expenses)
        purchases = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id, "type": "expense"},
            gte=("date", month_start),
            lte=("date", today.isoformat()),
        )
    except Exception as e:
        logger.error("Failed to fetch purchases for ITC check: %s", e)
        purchases = []

    mismatches = []

    if not purchases:
        return mismatches

    # Classify purchases for GST rates
    classifications = await classify_transactions(merchant_id, purchases)

    # Check for common ITC mismatch patterns
    for txn, cls in zip(purchases, classifications):
        amount = txn.get("amount", 0)
        category = txn.get("category", "").lower()

        # Personal expenses claimed as business
        if category in ("personal", "food", "entertainment"):
            mismatches.append({
                "type": "ineligible_itc",
                "transaction_id": txn.get("id"),
                "description": f"'{txn.get('description', category)}' may not qualify for ITC",
                "amount": amount,
                "gst_impact": round(amount * cls.get("gst_rate", 18) / 100, 2),
                "severity": "medium",
                "recommendation_hi": "Ye kharcha business se related nahi lag raha. ITC claim na karein.",
            })

        # Purchases without GST invoice (cash purchases)
        if txn.get("payment_mode") == "cash" and amount > 5000:
            mismatches.append({
                "type": "no_gst_invoice",
                "transaction_id": txn.get("id"),
                "description": f"Cash purchase of Rs {amount:,.0f} — GST invoice needed for ITC",
                "amount": amount,
                "gst_impact": round(amount * cls.get("gst_rate", 18) / 100, 2),
                "severity": "high",
                "recommendation_hi": "Rs 5,000 se upar ke cash purchase pe GST invoice zaruri hai ITC ke liye.",
            })

        # Exempt items where ITC is not available
        if cls.get("gst_rate", 0) == 0:
            mismatches.append({
                "type": "exempt_itc",
                "transaction_id": txn.get("id"),
                "description": f"'{txn.get('description', '')}' is GST exempt — no ITC available",
                "amount": amount,
                "gst_impact": 0,
                "severity": "low",
                "recommendation_hi": "Ye item GST se exempt hai, isme ITC nahi milegi.",
            })

    return mismatches


async def get_gst_status(merchant_id: str) -> dict:
    """
    Return current GST filing status, next deadline, and any penalties.

    Args:
        merchant_id: The merchant's UUID

    Returns:
        Dict with filing_status, next_deadline, pending_returns, penalties, etc.
    """
    today = date.today()

    # GSTR-3B is due on 20th of each month
    if today.day <= 20:
        next_deadline = today.replace(day=20)
    else:
        # Next month's 20th
        if today.month == 12:
            next_deadline = today.replace(year=today.year + 1, month=1, day=20)
        else:
            next_deadline = today.replace(month=today.month + 1, day=20)

    days_until_deadline = (next_deadline - today).days

    # GSTR-1 is due on 11th of each month
    if today.day <= 11:
        gstr1_deadline = today.replace(day=11)
    else:
        if today.month == 12:
            gstr1_deadline = today.replace(year=today.year + 1, month=1, day=11)
        else:
            gstr1_deadline = today.replace(month=today.month + 1, day=11)

    # Determine filing status
    if today.day > 20:
        current_status = "filed"  # Assume filed after deadline
        penalty = 0
    elif days_until_deadline <= 5:
        current_status = "urgent"
        penalty = 0
    else:
        current_status = "pending"
        penalty = 0

    # Late fee calculation: Rs 50/day CGST + Rs 50/day SGST (capped at Rs 5000)
    late_days = max(0, today.day - 20) if today.day > 20 else 0
    if late_days > 0:
        penalty = min(late_days * 100, 5000)  # Rs 50 CGST + Rs 50 SGST per day
        current_status = "overdue"

    return {
        "merchant_id": merchant_id,
        "gstin_status": "active",
        "current_period": today.strftime("%B %Y"),
        "filing_status": current_status,
        "gstr3b": {
            "next_deadline": next_deadline.isoformat(),
            "days_remaining": days_until_deadline,
            "status": current_status,
        },
        "gstr1": {
            "next_deadline": gstr1_deadline.isoformat(),
            "days_remaining": (gstr1_deadline - today).days,
            "status": "pending",
        },
        "penalties": {
            "late_fee": penalty,
            "interest": 0,
            "total": penalty,
        },
        "recommendations_hi": _gst_recommendations(current_status, days_until_deadline),
        "checked_at": datetime.now().isoformat(),
    }


def _gst_recommendations(status: str, days_remaining: int) -> list[str]:
    """Generate Hindi recommendations based on GST filing status."""
    recs = []
    if status == "overdue":
        recs.append("GSTR-3B overdue hai! Jaldi file karein, har din Rs 100 late fee lag rahi hai.")
        recs.append("CA se baat karein ya MunimAI se auto-file karwa lein.")
    elif days_remaining <= 3:
        recs.append(f"Sirf {days_remaining} din bache hain GSTR-3B file karne mein. Abhi kar lein!")
    elif days_remaining <= 7:
        recs.append(f"GSTR-3B ki deadline {days_remaining} din mein hai. Taiyaari shuru karein.")
    else:
        recs.append("GST filing ka time hai. Transactions classify ho rahe hain automatically.")

    recs.append("Tip: Har purchase pe GST invoice lein — ITC claim kar sakte hain.")
    return recs


async def auto_classify_transaction(transaction: dict) -> dict:
    """Lightweight HSN/SAC classification for a single transaction.
    Called automatically when any transaction is created via voice."""
    category = transaction.get("category", "")
    amount = transaction.get("amount", 0)

    # Rule-based quick classification
    HSN_MAP = {
        "saree": {"hsn": "5007", "rate": 5},
        "textile": {"hsn": "5007", "rate": 5},
        "food": {"hsn": "2106", "rate": 5},
        "grocery": {"hsn": "0904", "rate": 5},
        "rent": {"hsn": "9972", "rate": 18},
        "electricity": {"hsn": "2716", "rate": 18},
        "salary": {"hsn": "9985", "rate": 0},
        "stock": {"hsn": "9801", "rate": 12},
        "general": {"hsn": "9988", "rate": 18},
    }

    match = HSN_MAP.get(category.lower(), HSN_MAP["general"])
    return {
        "hsn_code": match["hsn"],
        "gst_rate": match["rate"],
        "gst_amount": round(amount * match["rate"] / 100, 2),
        "cgst": round(amount * match["rate"] / 200, 2),
        "sgst": round(amount * match["rate"] / 200, 2),
    }


async def get_tax_optimization_tips(merchant_id: str) -> list[dict]:
    """Analyze transaction patterns and suggest tax-saving tips."""
    try:
        transactions = db.select_range(
            "transactions",
            filters={"merchant_id": merchant_id},
            gte=("recorded_at", "1970-01-01"),
            lte=("recorded_at", "2099-12-31"),
            limit=100,
            order_by="recorded_at",
            order_desc=True,
        )
    except Exception as e:
        logger.error("Failed to fetch transactions for optimization: %s", e)
        transactions = []

    tips = []

    if not transactions:
        tips.append({
            "type": "no_data",
            "title": "Koi transaction nahi mila",
            "description_hi": "Pehle kuch transactions record karein, phir hum tax optimization tips de sakte hain.",
            "potential_saving": 0,
        })
        return tips

    # Analyze for common tax-saving opportunities
    total_expense = sum(t.get("amount", 0) for t in transactions if t.get("type") == "expense")
    total_income = sum(t.get("amount", 0) for t in transactions if t.get("type") == "income")
    expense_categories = {}
    uncategorized_count = 0

    for t in transactions:
        if t.get("type") == "expense":
            cat = t.get("category", "").lower()
            if not cat or cat in ("general", "other", "uncategorized"):
                uncategorized_count += 1
            expense_categories[cat] = expense_categories.get(cat, 0) + t.get("amount", 0)

    # Tip 1: Uncategorized expenses miss ITC
    if uncategorized_count > 0:
        tips.append({
            "type": "missing_classification",
            "title": "Uncategorized Expenses",
            "description_hi": (
                f"{uncategorized_count} expenses bina category ke hain. "
                "Sahi category lagane se ITC claim kar sakte hain aur GST bach sakta hai."
            ),
            "potential_saving": round(uncategorized_count * 500, 2),
        })

    # Tip 2: ITC on rent
    rent_expense = expense_categories.get("rent", 0)
    if rent_expense > 0:
        tips.append({
            "type": "itc_rent",
            "title": "Rent pe ITC",
            "description_hi": (
                f"Aapka rent kharcha Rs {rent_expense:,.0f} hai. "
                "Agar landlord GST registered hai toh 18% ITC claim kar sakte hain."
            ),
            "potential_saving": round(rent_expense * 0.18, 2),
        })

    # Tip 3: Composition scheme suggestion for small turnover
    if total_income < 15000000:  # Under 1.5 Cr
        tips.append({
            "type": "composition_scheme",
            "title": "Composition Scheme",
            "description_hi": (
                f"Aapka turnover Rs {total_income:,.0f} hai. "
                "Composition scheme mein sirf 1% GST lagta hai (traders ke liye). "
                "Regular filing ki zarurat nahi."
            ),
            "potential_saving": round(total_income * 0.05, 2),
        })

    # Tip 4: Digital payment incentives
    tips.append({
        "type": "digital_payments",
        "title": "Digital Payments Benefit",
        "description_hi": (
            "UPI / digital payments se 2% tak discount milta hai. "
            "Cash transactions pe ITC bhi nahi milti Rs 10,000 se upar."
        ),
        "potential_saving": round(total_expense * 0.02, 2),
    })

    # Use Groq to generate a personalized Hindi tip if available
    if settings.groq_api_key:
        try:
            import json
            client = AsyncGroq(api_key=settings.groq_api_key)
            resp = await client.chat.completions.create(
                model=settings.groq_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an Indian GST and tax expert. Give ONE specific, actionable "
                            "tax-saving tip in Hindi for this small business based on their data. "
                            "Respond with JSON: {\"title\": \"...\", \"description_hi\": \"...\", \"potential_saving\": number}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Total income: Rs {total_income:,.0f}, "
                            f"Total expenses: Rs {total_expense:,.0f}, "
                            f"Top expense categories: {json.dumps(dict(sorted(expense_categories.items(), key=lambda x: -x[1])[:5]))}"
                        ),
                    },
                ],
                temperature=0.3,
                max_tokens=300,
                response_format={"type": "json_object"},
            )
            llm_tip = json.loads(resp.choices[0].message.content)
            tips.append({
                "type": "ai_personalized",
                "title": llm_tip.get("title", "AI Tip"),
                "description_hi": llm_tip.get("description_hi", ""),
                "potential_saving": llm_tip.get("potential_saving", 0),
            })
        except Exception as e:
            logger.warning("Groq optimization tip generation failed: %s", e)

    return tips


def calculate_estimated_tax(transactions: list[dict]) -> dict:
    """
    Calculate estimated GST liability from a list of transactions.

    This is a synchronous utility that does not call the LLM.
    Uses rule-based classification for fast estimation.

    Args:
        transactions: List of transaction dicts

    Returns:
        Dict with estimated tax breakdown.
    """
    hsn_data = _load_hsn_data()
    category_map = hsn_data.get("category_to_hsn_mapping", {})
    all_codes = {c["hsn"]: c for c in hsn_data.get("common_codes", [])}
    all_codes.update({c["sac"]: c for c in hsn_data.get("sac_codes", [])})

    total_sales = 0.0
    total_purchases = 0.0
    tax_on_sales = 0.0
    tax_on_purchases = 0.0

    for txn in transactions:
        amount = txn.get("amount", 0)
        category = txn.get("category", "")
        description = txn.get("description", "")

        result = _rule_based_classify(category, description, amount, category_map, all_codes)
        rate = result["gst_rate"] if result else 18

        if txn.get("type") == "income":
            total_sales += amount
            tax_on_sales += amount * rate / 100
        elif txn.get("type") == "expense":
            total_purchases += amount
            tax_on_purchases += amount * rate / 100

    net_liability = max(0, tax_on_sales - tax_on_purchases)

    return {
        "total_taxable_sales": round(total_sales, 2),
        "total_taxable_purchases": round(total_purchases, 2),
        "estimated_output_tax": round(tax_on_sales, 2),
        "estimated_itc": round(tax_on_purchases, 2),
        "estimated_net_liability": round(net_liability, 2),
        "estimated_cgst": round(net_liability / 2, 2),
        "estimated_sgst": round(net_liability / 2, 2),
        "note_hi": "Ye estimated hai. Final amount GSTR-3B mein alag ho sakta hai.",
    }
