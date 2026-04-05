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

    from services.agents.gst_agent import auto_classify_transaction

    sales = sum(t["amount"] for t in txns if t.get("type") == "income")
    purchases = sum(t["amount"] for t in txns if t.get("type") == "expense")

    # Use real HSN rates per transaction via auto_classify_transaction
    gst_collected = 0.0
    gst_paid = 0.0
    slab_sales: dict[str, float] = {}
    slab_gst: dict[str, float] = {}

    for t in txns:
        try:
            cls = await auto_classify_transaction(t)
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
    from services.agents.gst_agent import auto_classify_transaction

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
        cls = await auto_classify_transaction(txn)
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
