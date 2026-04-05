"""
GST router -- tax compliance: classification, preparation, and filing.
"""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from config import get_settings
from models import db
from models.schemas import (
    GSTClassifyRequest,
    GSTClassifyResponse,
    GSTFilingResponse,
    GSTSummary,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Standard GST slab rates
GST_SLABS = {
    "food_grains": 0,
    "packaged_food": 5,
    "clothing_under_1000": 5,
    "clothing_over_1000": 12,
    "electronics": 18,
    "services": 18,
    "general": 18,
    "luxury": 28,
    "tobacco": 28,
}

# ---------------------------------------------------------------------------
# Classification cache -- avoids repeated LLM calls for the same category
# ---------------------------------------------------------------------------
_classification_cache: dict[str, dict] = {}


async def _classify_cached(txn: dict) -> dict:
    """Classify with in-memory cache by category to avoid repeated LLM calls."""
    cache_key = f"{txn.get('category', '')}|{txn.get('description', '')}"
    if cache_key in _classification_cache:
        return _classification_cache[cache_key]
    from services.agents.gst_agent import auto_classify_transaction
    result = await auto_classify_transaction(txn)
    _classification_cache[cache_key] = result
    return result


# ---------------------------------------------------------------------------
# GST Chatbot endpoint (placed before /{merchant_id} to avoid path conflict)
# ---------------------------------------------------------------------------
@router.post("/chat")
async def gst_chat(body: dict):
    """
    GST doubt-clearing chatbot. Answers any GST question in Hindi/English
    with context of the merchant's business data.
    """
    import json
    import httpx

    settings = get_settings()
    merchant_id = body.get("merchant_id", "")
    question = body.get("question", "").strip()

    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    # Fetch merchant's GST context
    context = ""
    try:
        txns = db.select("transactions", filters={"merchant_id": merchant_id}, limit=50)
        if txns:
            total_income = sum(t.get("amount", 0) for t in txns if t.get("type") == "income")
            total_expense = sum(t.get("amount", 0) for t in txns if t.get("type") == "expense")
            categories = list(set(t.get("category", "") for t in txns if t.get("category")))
            context = (
                f"Merchant data: Monthly income ~Rs {total_income:,.0f}, expenses ~Rs {total_expense:,.0f}. "
                f"Business categories: {', '.join(categories[:10])}. "
                f"Business type: Indian small business (likely textile/retail)."
            )
    except Exception:
        context = "Business type: Indian small business."

    system_prompt = f"""You are MunimAI's GST expert chatbot for Indian small businesses.

RULES:
1. Answer GST questions in simple Hindi (with English terms for GST jargon)
2. Be specific with rates, HSN codes, due dates, penalties
3. Reference the merchant's actual business data when relevant
4. Keep answers concise (under 200 words)
5. If unsure, say so and suggest consulting a CA
6. Include practical examples relevant to their business
7. Mention deadlines: GSTR-3B due 20th of next month, GSTR-1 due 11th

{context}

Answer the merchant's GST question:"""

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        "temperature": 0.3,
        "max_tokens": 500,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 200:
            answer = resp.json()["choices"][0]["message"]["content"].strip()
            return {"answer": answer, "question": question}
    except Exception as e:
        logger.error("GST chat failed: %s", e)

    return {
        "answer": "Maaf kijiye, abhi answer nahi mil paya. Kripya apne CA se puchein ya dobara try karein.",
        "question": question,
    }


# ---------------------------------------------------------------------------
# Feature 1: GSTR-3B JSON Download
# ---------------------------------------------------------------------------
@router.get("/download-json/{merchant_id}")
async def download_gstr3b_json(merchant_id: str, period: str = Query(None)):
    """Generate downloadable GSTR-3B JSON in GST portal format."""
    from fastapi.responses import JSONResponse

    if not period:
        period = date.today().strftime("%Y-%m")

    summary = await get_gst_summary(merchant_id, period=period)
    year, month = period.split("-")
    ret_period = f"{month}{year}"

    gstr3b = {
        "gstin": "07XXXXX1234X1Z5",
        "ret_period": ret_period,
        "sup_details": {
            "osup_det": {
                "txval": summary.total_sales,
                "iamt": 0,
                "camt": round(summary.gst_collected / 2, 2),
                "samt": round(summary.gst_collected / 2, 2),
                "csamt": 0,
            },
            "osup_zero": {"txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0},
            "osup_nil_exmp": {"txval": 0},
            "isup_rev": {"txval": 0, "iamt": 0, "camt": 0, "samt": 0, "csamt": 0},
            "osup_nongst": {"txval": 0},
        },
        "itc_elg": {
            "itc_avl": [
                {"ty": "IMPG", "iamt": 0, "camt": round(summary.gst_paid / 2, 2), "samt": round(summary.gst_paid / 2, 2), "csamt": 0},
            ],
            "itc_rev": [{"ty": "RUL", "iamt": 0, "camt": 0, "samt": 0, "csamt": 0}],
            "itc_net": {"iamt": 0, "camt": round(summary.gst_paid / 2, 2), "samt": round(summary.gst_paid / 2, 2), "csamt": 0},
            "itc_inelg": [{"ty": "RUL", "iamt": 0, "camt": 0, "samt": 0, "csamt": 0}],
        },
        "intr_ltfee": {
            "intr_details": {"iamt": 0, "camt": 0, "samt": 0, "csamt": 0},
            "ltfee_details": {"iamt": 0, "camt": 0, "samt": 0, "csamt": 0},
        },
        "tax_pmt": {
            "net_tax": round(summary.net_gst_liability, 2),
            "camt": round(summary.net_gst_liability / 2, 2),
            "samt": round(summary.net_gst_liability / 2, 2),
        },
        "_metadata": {
            "generated_by": "MunimAI",
            "period_display": period,
            "total_sales": summary.total_sales,
            "total_purchases": summary.total_purchases,
        },
    }

    headers = {"Content-Disposition": f"attachment; filename=GSTR3B_{ret_period}.json"}
    return JSONResponse(content=gstr3b, headers=headers)


# ---------------------------------------------------------------------------
# Feature 2: ITC Mismatch via OCR
# ---------------------------------------------------------------------------
@router.post("/itc-verify/{merchant_id}")
async def verify_itc_from_invoice(merchant_id: str, body: dict):
    """Upload purchase invoice image, OCR extracts data, cross-check with recorded expenses."""
    from services.ocr_service import extract_invoice_data

    image_b64 = body.get("image_base64", "")
    if not image_b64:
        raise HTTPException(status_code=400, detail="image_base64 is required")

    result = await extract_invoice_data(image_b64, merchant_id, "invoice")

    if not result.get("data"):
        return {"success": False, "error": result.get("error", "OCR failed"), "matches": []}

    data = result["data"]
    invoice_vendor = data.get("vendor", "Unknown")
    invoice_total = float(data.get("total", 0) or 0)
    invoice_tax = float(data.get("tax", 0) or 0)
    invoice_items = data.get("items", [])

    # Cross-check with recorded expenses
    expenses = db.select("transactions", filters={"merchant_id": merchant_id, "type": "expense"}, limit=500)

    matches = []
    for exp in expenses:
        exp_amount = float(exp.get("amount", 0))
        exp_desc = (exp.get("description", "") + " " + exp.get("category", "")).lower()
        vendor_lower = invoice_vendor.lower()

        # Match by amount (within 5%) or vendor name
        amount_match = abs(exp_amount - invoice_total) / max(invoice_total, 1) < 0.05
        vendor_match = vendor_lower in exp_desc or any(w in exp_desc for w in vendor_lower.split() if len(w) > 3)

        if amount_match or vendor_match:
            diff = round(abs(exp_amount - invoice_total), 2)
            matches.append({
                "transaction_id": exp.get("id"),
                "recorded_amount": exp_amount,
                "invoice_amount": invoice_total,
                "difference": diff,
                "status": "matched" if diff < 100 else "mismatch",
                "category": exp.get("category", ""),
                "date": exp.get("created_at", "")[:10],
            })

    mismatch_count = len([m for m in matches if m["status"] == "mismatch"])

    return {
        "success": True,
        "vendor": invoice_vendor,
        "invoice_total": invoice_total,
        "invoice_tax": invoice_tax,
        "items_found": len(invoice_items),
        "matches": matches,
        "mismatch_count": mismatch_count,
        "alert_hi": f"{'⚠️ ' + str(mismatch_count) + ' mismatch mila!' if mismatch_count else '✅ Sab match ho raha hai.'} Invoice: Rs {invoice_total:,.0f}, Vendor: {invoice_vendor}",
    }


# ---------------------------------------------------------------------------
# Feature 3: GST Deadline WhatsApp Reminder
# ---------------------------------------------------------------------------
@router.post("/send-deadline-reminder/{merchant_id}")
async def send_gst_deadline_reminder(merchant_id: str):
    """Send WhatsApp reminder about upcoming GST filing deadline."""
    from services.twilio_service import send_whatsapp

    today = date.today()
    day = today.day

    # GSTR-3B due 20th, GSTR-1 due 11th
    alerts = []
    if 15 <= day <= 19:
        days_left = 20 - day
        alerts.append(f"GSTR-3B ki deadline {days_left} din mein hai (20 {today.strftime('%B')})!")
    elif day > 20:
        late_days = day - 20
        penalty = min(late_days * 100, 5000)
        alerts.append(f"GSTR-3B overdue hai! {late_days} din late. Penalty: Rs {penalty}. Abhi file karein!")

    if 6 <= day <= 10:
        days_left = 11 - day
        alerts.append(f"GSTR-1 ki deadline {days_left} din mein hai (11 {today.strftime('%B')})!")
    elif 11 < day <= 15:
        late_days = day - 11
        alerts.append(f"GSTR-1 overdue! {late_days} din late.")

    if not alerts:
        return {"sent": False, "message": "No upcoming deadlines right now."}

    # Get liability estimate
    try:
        summary = await get_gst_summary(merchant_id)
        liability_text = f" Net liability: Rs {summary.net_gst_liability:,.0f}."
    except Exception:
        liability_text = ""

    message = "🔔 GST Deadline Alert!\n\n" + "\n".join(alerts) + liability_text + "\n\n- MunimAI"

    try:
        result = await send_whatsapp(to="+917725014797", body=message)
        return {"sent": True, "message": message, "whatsapp_result": result}
    except Exception as e:
        return {"sent": False, "message": message, "error": str(e)}


# ---------------------------------------------------------------------------
# Feature 4: Composition Scheme Advisor
# ---------------------------------------------------------------------------
@router.get("/composition-analysis/{merchant_id}")
async def composition_scheme_analysis(merchant_id: str):
    """Analyze if merchant benefits from GST Composition Scheme."""
    import httpx

    # Fetch all transactions to estimate annual turnover
    txns = db.select("transactions", filters={"merchant_id": merchant_id}, limit=5000)

    total_income = sum(t.get("amount", 0) for t in txns if t.get("type") == "income")
    total_expense = sum(t.get("amount", 0) for t in txns if t.get("type") == "expense")

    # Estimate annual turnover (extrapolate from available data)
    if txns:
        dates = [t.get("created_at", "")[:10] for t in txns if t.get("created_at")]
        unique_days = len(set(dates)) or 1
        daily_avg = total_income / unique_days
        annual_turnover = daily_avg * 365
    else:
        annual_turnover = 0

    eligible = annual_turnover < 15000000  # Rs 1.5 Cr limit

    # Current effective GST rate
    try:
        summary = await get_gst_summary(merchant_id)
        current_gst = summary.gst_collected
        current_rate = round(current_gst / max(total_income, 1) * 100, 1)
    except Exception:
        current_gst = 0
        current_rate = 18

    composition_rate = 1.0  # 1% for traders/manufacturers
    annual_gst_current = round(annual_turnover * current_rate / 100, 2)
    annual_gst_composition = round(annual_turnover * composition_rate / 100, 2)
    annual_saving = round(annual_gst_current - annual_gst_composition, 2)

    # Groq recommendation
    recommendation_hi = ""
    try:
        settings_obj = get_settings()
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {settings_obj.groq_api_key}", "Content-Type": "application/json"}
        prompt = f"""Merchant ka annual turnover Rs {annual_turnover:,.0f} hai. Current GST rate ~{current_rate}%, Composition scheme mein 1% lagega.
Annual saving: Rs {annual_saving:,.0f}.
Composition scheme mein ITC nahi milta aur inter-state supply nahi kar sakte.
Kya merchant ko composition scheme leni chahiye? 2-3 lines mein Hindi mein batao."""

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json={
                "model": settings_obj.groq_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3, "max_tokens": 200,
            })
        if resp.status_code == 200:
            recommendation_hi = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        recommendation_hi = f"Aapka turnover Rs {annual_turnover:,.0f} hai. Composition scheme se Rs {annual_saving:,.0f}/year bach sakta hai, lekin ITC nahi milega."

    return {
        "eligible": eligible,
        "annual_turnover": round(annual_turnover, 2),
        "current_effective_rate": current_rate,
        "composition_rate": composition_rate,
        "annual_saving": max(0, annual_saving),
        "current_annual_gst": annual_gst_current,
        "composition_annual_gst": annual_gst_composition,
        "recommendation_hi": recommendation_hi,
        "tradeoffs": [
            "ITC (Input Tax Credit) nahi milega",
            "Inter-state supply nahi kar sakte",
            "Quarterly filing (monthly nahi)",
            "Invoice pe 'Composition Taxable Person' likhna hoga",
        ],
    }


@router.get("/{merchant_id}", response_model=GSTSummary)
async def get_gst_summary(
    merchant_id: str,
    period: str = Query(None, description="YYYY-MM, defaults to current month"),
):
    """
    GST summary for a given period: total sales, purchases, GST collected,
    GST paid (ITC), and net liability.
    """
    if not period:
        today = date.today()
        period = today.strftime("%Y-%m")

    year, month = period.split("-")
    start = f"{year}-{month}-01"
    # Compute end of month
    if int(month) == 12:
        end = f"{int(year) + 1}-01-01"
    else:
        end = f"{year}-{int(month) + 1:02d}-01"

    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", start),
        lte=("recorded_at", end),
    )

    sales = sum(t["amount"] for t in txns if t.get("type") == "income")
    purchases = sum(t["amount"] for t in txns if t.get("type") == "expense")

    # Use real HSN rates per transaction via cached auto_classify_transaction
    gst_collected = 0.0
    gst_paid = 0.0
    slab_sales: dict[str, float] = {}
    slab_gst: dict[str, float] = {}

    for t in txns:
        try:
            cls = await _classify_cached(t)
            rate = cls.get("gst_rate", 18) / 100.0
        except Exception:
            rate = 0.18
        amount = t.get("amount", 0)
        gst_amount = round(amount * rate / (1 + rate), 2)
        slab_key = f"{int(rate * 100)}%"
        if t.get("type") == "income":
            gst_collected += gst_amount
            slab_sales[slab_key] = slab_sales.get(slab_key, 0) + amount
            slab_gst[slab_key] = slab_gst.get(slab_key, 0) + gst_amount
        elif t.get("type") == "expense":
            gst_paid += gst_amount

    gst_collected = round(gst_collected, 2)
    gst_paid = round(gst_paid, 2)
    net_liability = round(gst_collected - gst_paid, 2)

    # Slab breakdown from actual classification
    slab_breakdown = [
        {"slab": slab, "sales": round(slab_sales.get(slab, 0), 2), "gst": round(slab_gst.get(slab, 0), 2)}
        for slab in sorted(slab_sales.keys())
    ]

    return GSTSummary(
        merchant_id=merchant_id,
        period=period,
        total_sales=round(sales, 2),
        total_purchases=round(purchases, 2),
        gst_collected=gst_collected,
        gst_paid=gst_paid,
        net_gst_liability=net_liability,
        slab_breakdown=slab_breakdown,
    )


@router.get("/{merchant_id}/optimization")
async def get_optimization_tips(merchant_id: str):
    """Get tax optimization suggestions based on transaction patterns."""
    from services.agents.gst_agent import get_tax_optimization_tips

    tips = await get_tax_optimization_tips(merchant_id)
    return {"merchant_id": merchant_id, "tips": tips, "count": len(tips)}


@router.get("/{merchant_id}/report")
async def get_gst_report(
    merchant_id: str,
    month: int = Query(None, ge=1, le=12, description="Month (1-12)"),
    year: int = Query(None, ge=2020, le=2099, description="Year"),
):
    """Get full GST report with CGST/SGST breakdown for a given month."""
    today = date.today()
    rpt_month = month or today.month
    rpt_year = year or today.year

    start = f"{rpt_year}-{rpt_month:02d}-01"
    if rpt_month == 12:
        end = f"{rpt_year + 1}-01-01"
    else:
        end = f"{rpt_year}-{rpt_month + 1:02d}-01"

    txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id},
        gte=("recorded_at", start),
        lte=("recorded_at", end),
    )

    # Auto-classify each transaction
    sales_items = []
    purchase_items = []
    total_output_gst = 0.0
    total_input_itc = 0.0
    total_cgst = 0.0
    total_sgst = 0.0

    for txn in txns:
        cls = await _classify_cached(txn)
        item = {
            "id": txn.get("id"),
            "description": txn.get("description", ""),
            "category": txn.get("category", ""),
            "amount": txn.get("amount", 0),
            "hsn_code": cls["hsn_code"],
            "gst_rate": cls["gst_rate"],
            "gst_amount": cls["gst_amount"],
            "cgst": cls["cgst"],
            "sgst": cls["sgst"],
        }

        if txn.get("type") == "income":
            sales_items.append(item)
            total_output_gst += cls["gst_amount"]
        elif txn.get("type") == "expense":
            purchase_items.append(item)
            total_input_itc += cls["gst_amount"]

        total_cgst += cls["cgst"]
        total_sgst += cls["sgst"]

    net_liability = max(0.0, total_output_gst - total_input_itc)
    total_sales = sum(i["amount"] for i in sales_items)
    total_purchases = sum(i["amount"] for i in purchase_items)

    return {
        "merchant_id": merchant_id,
        "period": f"{rpt_year}-{rpt_month:02d}",
        "total_sales": round(total_sales, 2),
        "total_purchases": round(total_purchases, 2),
        "output_gst": round(total_output_gst, 2),
        "input_itc": round(total_input_itc, 2),
        "net_liability": round(net_liability, 2),
        "cgst": round(total_cgst / 2 + net_liability / 2, 2) if net_liability else 0.0,
        "sgst": round(total_cgst / 2 + net_liability / 2, 2) if net_liability else 0.0,
        "sales_items": sales_items,
        "purchase_items": purchase_items,
        "transaction_count": len(txns),
        "message_hi": (
            f"GST Report {rpt_year}-{rpt_month:02d}: "
            f"Total bikri Rs {total_sales:,.0f}, kharcha Rs {total_purchases:,.0f}, "
            f"net GST dena hai Rs {net_liability:,.0f}."
        ),
    }


@router.post("/{merchant_id}/classify", response_model=GSTClassifyResponse)
async def classify_items(merchant_id: str, body: GSTClassifyRequest):
    """
    Classify items by HSN code and GST slab using LLM.

    Takes a list of item names/descriptions and returns the appropriate
    HSN code and GST rate for each.
    """
    import json
    import httpx

    settings = get_settings()

    prompt = (
        "You are an Indian GST classification expert. For each item, return the "
        "HSN/SAC code, GST slab (0, 5, 12, 18, or 28), and GST amount. "
        "Respond with a JSON array: "
        '[{"name": "...", "hsn_code": "...", "slab": 18, "gst_amount": ...}]. '
        "Items:\n"
    )
    for item in body.items:
        prompt += f"- {item.get('name', 'Unknown')}: {item.get('amount', 0)} INR ({item.get('description', '')})\n"

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.groq_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.groq_model,
        "messages": [
            {"role": "system", "content": "You are an Indian GST expert. Respond ONLY with valid JSON."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 1000,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)

        if resp.status_code == 200:
            raw = resp.json()["choices"][0]["message"]["content"]
            parsed = json.loads(raw)
            items = parsed if isinstance(parsed, list) else parsed.get("items", parsed.get("classified_items", []))
            return GSTClassifyResponse(classified_items=items)
    except Exception:
        logger.exception("GST classification LLM call failed")

    # Fallback: default 18% for everything
    fallback = []
    for item in body.items:
        amt = item.get("amount", 0)
        gst = round(amt * 0.18, 2)
        fallback.append({
            "name": item.get("name", "Unknown"),
            "hsn_code": "9999",
            "slab": 18,
            "gst_amount": gst,
        })

    return GSTClassifyResponse(classified_items=fallback)


@router.post("/{merchant_id}/prepare", response_model=GSTFilingResponse)
async def prepare_gst_filing(
    merchant_id: str,
    period: str = Query(None, description="YYYY-MM"),
):
    """
    Prepare GSTR-3B data for filing.  Aggregates all transactions,
    classifies them, and generates the filing payload.
    """
    if not period:
        period = date.today().strftime("%Y-%m")

    # Get the summary
    summary_data = await get_gst_summary(merchant_id, period=period)

    # Store the prepared filing
    filing = db.upsert("gst_filings", {
        "merchant_id": merchant_id,
        "period": period,
        "status": "prepared",
        "total_sales": summary_data.total_sales,
        "total_purchases": summary_data.total_purchases,
        "gst_collected": summary_data.gst_collected,
        "gst_paid": summary_data.gst_paid,
        "net_liability": summary_data.net_gst_liability,
    })

    return GSTFilingResponse(
        status="prepared",
        reference_id=filing.get("id"),
        period=period,
        total_liability=summary_data.net_gst_liability,
        message=f"GSTR-3B for {period} prepared. Net liability: Rs {summary_data.net_gst_liability}.",
    )


@router.post("/{merchant_id}/file", response_model=GSTFilingResponse)
async def file_gst(
    merchant_id: str,
    period: str = Query(None, description="YYYY-MM"),
):
    """
    Submit the GST filing.  In production this would integrate with the
    GST Portal API.  For now it marks the filing as submitted.
    """
    if not period:
        period = date.today().strftime("%Y-%m")

    filing = db.select(
        "gst_filings",
        filters={"merchant_id": merchant_id, "period": period},
        single=True,
    )

    if not filing:
        raise HTTPException(
            status_code=400,
            detail=f"No prepared filing found for {period}. Run /prepare first.",
        )

    if filing.get("status") == "filed":
        return GSTFilingResponse(
            status="filed",
            reference_id=filing.get("id"),
            period=period,
            total_liability=filing.get("net_liability", 0),
            message=f"GSTR-3B for {period} was already filed.",
        )

    db.update("gst_filings", filing["id"], {"status": "filed"})

    return GSTFilingResponse(
        status="filed",
        reference_id=filing.get("id"),
        period=period,
        total_liability=filing.get("net_liability", 0),
        message=f"GSTR-3B for {period} filed successfully!",
    )
