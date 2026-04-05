"""
Inventory router -- manage stock items in the inventory table.

CRUD operations plus low-stock alerts, stock adjustments, and value reports.
All data persisted in Supabase `inventory` table.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from config import get_settings
from models import db

logger = logging.getLogger(__name__)
router = APIRouter()

settings = get_settings()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class AddItemRequest(BaseModel):
    merchant_id: str
    item_name: str
    sku: Optional[str] = None
    category: Optional[str] = None
    current_qty: float = 0
    unit: str = "pcs"
    cost_price: float = 0
    selling_price: float = 0
    reorder_level: float = 10
    hsn_code: Optional[str] = None


class UpdateItemRequest(BaseModel):
    item_name: Optional[str] = None
    category: Optional[str] = None
    current_qty: Optional[float] = None
    unit: Optional[str] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    reorder_level: Optional[float] = None
    hsn_code: Optional[str] = None


class AdjustStockRequest(BaseModel):
    direction: str = Field(..., pattern="^(in|out)$", description="in or out")
    qty: float = Field(..., gt=0)
    reason: str = "manual"  # sale / purchase / return / damage / manual


class OCRImportRequest(BaseModel):
    merchant_id: str
    image_base64: str  # base64-encoded image of invoice/receipt
    extraction_type: str = "invoice"  # invoice or khata


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/")
async def add_item(body: AddItemRequest):
    """Add a new item to inventory."""
    item_data = {
        "merchant_id": body.merchant_id,
        "item_name": body.item_name,
        "sku": body.sku,
        "category": body.category,
        "current_qty": body.current_qty,
        "unit": body.unit,
        "cost_price": body.cost_price,
        "selling_price": body.selling_price,
        "reorder_level": body.reorder_level,
        "hsn_code": body.hsn_code,
    }

    item = db.insert("inventory", item_data)
    return {"success": True, "item": item}


@router.post("/import-ocr")
async def import_from_image(body: OCRImportRequest):
    """
    Upload an invoice/receipt image → Vision AI extracts items → auto-create inventory.
    Tries: OpenAI GPT-4o-mini → Groq Llama 4 Scout → Gemini Flash.
    """
    from services.ocr_service import extract_invoice_data

    result = await extract_invoice_data(
        image_url_or_bytes=body.image_base64,
        merchant_id=body.merchant_id,
        extraction_type=body.extraction_type,
    )

    if result.get("error") or not result.get("data"):
        return {
            "success": False,
            "error": result.get("error", "OCR extraction failed"),
            "items_created": 0,
        }

    data = result["data"]
    items_raw = data.get("items", [])
    vendor = data.get("vendor", "")

    created_items = []
    skipped = []

    # Fetch existing inventory once for matching
    existing_items = db.select("inventory", filters={"merchant_id": body.merchant_id})

    for raw_item in items_raw:
        item_name = raw_item.get("name", "").strip()
        if not item_name:
            skipped.append(raw_item)
            continue

        qty = int(float(raw_item.get("qty", 1) or 1))
        amount = float(raw_item.get("amount", 0) or raw_item.get("rate", 0) or 0)
        cost_price = round(amount / qty, 2) if qty > 0 else amount
        unit = raw_item.get("unit", "pcs") or "pcs"

        # Fuzzy match against existing inventory
        matched = None
        item_lower = item_name.lower().strip()
        for ex in existing_items:
            ex_name = ex.get("item_name", "").lower().strip()
            if ex_name == item_lower or item_lower in ex_name or ex_name in item_lower:
                matched = ex
                break

        if matched:
            new_qty = int((matched.get("current_qty", 0) or 0) + qty)
            db.update("inventory", matched["id"], {"current_qty": new_qty})
            created_items.append({
                "item_name": item_name,
                "qty_added": qty,
                "new_total": new_qty,
                "action": "updated",
            })
        else:
            new_item = db.insert("inventory", {
                "merchant_id": body.merchant_id,
                "item_name": item_name,
                "category": raw_item.get("category", ""),
                "current_qty": int(qty),
                "unit": unit,
                "cost_price": cost_price,
                "selling_price": 0,
                "reorder_level": 5,
                "supplier_name": vendor,
            })
            created_items.append({
                "item_name": item_name,
                "qty_added": qty,
                "cost_price": cost_price,
                "action": "created",
                "id": new_item.get("id"),
            })

    return {
        "success": True,
        "provider": result.get("provider"),
        "vendor": vendor,
        "items_created": len([i for i in created_items if i["action"] == "created"]),
        "items_updated": len([i for i in created_items if i["action"] == "updated"]),
        "items": created_items,
        "skipped": len(skipped),
        "raw_extraction": data,
    }


@router.get("/{merchant_id}")
async def list_inventory(
    merchant_id: str,
    category: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
):
    """List all inventory items with stock value calculation."""
    filters = {"merchant_id": merchant_id}
    if category:
        filters["category"] = category

    items = db.select(
        "inventory",
        filters=filters,
        order_by="item_name",
        order_desc=False,
        limit=limit,
    )

    # Enrich with computed fields
    for item in items:
        qty = item.get("current_qty", 0) or 0
        cost = item.get("cost_price", 0) or 0
        sell = item.get("selling_price", 0) or 0
        reorder = item.get("reorder_level", 0) or 0

        item["stock_value"] = round(qty * cost, 2)
        item["potential_revenue"] = round(qty * sell, 2)

        if qty <= 0:
            item["stock_status"] = "out"
        elif qty <= reorder:
            item["stock_status"] = "low"
        else:
            item["stock_status"] = "ok"

    return {"items": items, "count": len(items)}


@router.patch("/{item_id}")
async def update_item(item_id: str, body: UpdateItemRequest):
    """Update an inventory item (qty, price, etc.)."""
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    updated = db.update("inventory", item_id, update_data)
    return {"success": True, "item": updated}


@router.delete("/{item_id}")
async def delete_item(item_id: str):
    """Remove an item from inventory."""
    deleted = db.delete("inventory", item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"success": True, "deleted": True}


@router.get("/{merchant_id}/low-stock")
async def low_stock_items(merchant_id: str):
    """Get items where current_qty <= reorder_level."""
    all_items = db.select(
        "inventory",
        filters={"merchant_id": merchant_id},
    )

    low = []
    for item in all_items:
        qty = item.get("current_qty", 0) or 0
        reorder = item.get("reorder_level", 0) or 0
        if qty <= reorder:
            item["stock_status"] = "out" if qty <= 0 else "low"
            low.append(item)

    return {"items": low, "count": len(low)}


@router.post("/{item_id}/adjust")
async def adjust_stock(item_id: str, body: AdjustStockRequest):
    """
    Adjust stock in or out with a reason.
    Reasons: sale, purchase, return, damage, manual.
    """
    item = db.select("inventory", filters={"id": item_id}, single=True)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    current_qty = item.get("current_qty", 0) or 0

    if body.direction == "in":
        new_qty = current_qty + body.qty
    else:
        new_qty = max(0, current_qty - body.qty)

    updated = db.update("inventory", item_id, {"current_qty": new_qty})

    # Log the adjustment
    try:
        db.insert("inventory_adjustments", {
            "inventory_id": item_id,
            "merchant_id": item.get("merchant_id"),
            "direction": body.direction,
            "qty": body.qty,
            "reason": body.reason,
            "previous_qty": current_qty,
            "new_qty": new_qty,
            "adjusted_at": datetime.now().isoformat(),
        })
    except Exception:
        # Table may not exist; that's OK, the qty update already happened
        logger.debug("inventory_adjustments table not available, skipping log")

    return {
        "success": True,
        "item": updated,
        "adjustment": {
            "direction": body.direction,
            "qty": body.qty,
            "reason": body.reason,
            "previous_qty": current_qty,
            "new_qty": new_qty,
        },
    }


@router.get("/{merchant_id}/value")
async def total_stock_value(merchant_id: str):
    """Calculate total stock value (qty * cost_price for each item)."""
    items = db.select("inventory", filters={"merchant_id": merchant_id})

    total_cost_value = 0.0
    total_sell_value = 0.0
    item_count = len(items)
    low_stock_count = 0

    for item in items:
        qty = item.get("current_qty", 0) or 0
        cost = item.get("cost_price", 0) or 0
        sell = item.get("selling_price", 0) or 0
        reorder = item.get("reorder_level", 0) or 0

        total_cost_value += qty * cost
        total_sell_value += qty * sell

        if qty <= reorder:
            low_stock_count += 1

    return {
        "merchant_id": merchant_id,
        "total_items": item_count,
        "total_cost_value": round(total_cost_value, 2),
        "total_sell_value": round(total_sell_value, 2),
        "potential_profit": round(total_sell_value - total_cost_value, 2),
        "low_stock_count": low_stock_count,
    }
