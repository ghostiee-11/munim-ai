"""
Supabase client singleton and async query helpers for all MunimAI tables.
"""

from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Any, Optional

from supabase import create_client, Client
from config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[Client] = None


def init_supabase() -> Client:
    """Initialize the Supabase client singleton. Called once at startup."""
    global _client
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_key:
        logger.warning("Supabase credentials missing -- running in stub mode")
        return None  # type: ignore
    _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client


def get_client() -> Client:
    """Return the Supabase client, initializing if needed."""
    global _client
    if _client is None:
        init_supabase()
    if _client is None:
        raise RuntimeError("Supabase client not initialized. Check SUPABASE_URL and SUPABASE_KEY.")
    return _client


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

def _serialize_dates(data: dict[str, Any]) -> dict[str, Any]:
    """Convert date/datetime objects to ISO strings for Supabase."""
    out = {}
    for k, v in data.items():
        if isinstance(v, (datetime, date)):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def insert(table: str, data: dict[str, Any]) -> dict[str, Any]:
    """Insert a single row and return the created record."""
    resp = get_client().table(table).insert(_serialize_dates(data)).execute()
    if resp.data:
        return resp.data[0]
    raise RuntimeError(f"Insert into {table} failed: {resp}")


def upsert(table: str, data: dict[str, Any]) -> dict[str, Any]:
    """Upsert a single row and return the record."""
    resp = get_client().table(table).upsert(_serialize_dates(data)).execute()
    if resp.data:
        return resp.data[0]
    raise RuntimeError(f"Upsert into {table} failed: {resp}")


def select(
    table: str,
    *,
    columns: str = "*",
    filters: Optional[dict[str, Any]] = None,
    order_by: Optional[str] = None,
    order_desc: bool = True,
    limit: Optional[int] = None,
    single: bool = False,
) -> list[dict[str, Any]] | dict[str, Any] | None:
    """
    Flexible select with optional filtering, ordering, and limits.

    Parameters
    ----------
    table : str
        Supabase table name.
    columns : str
        Comma-separated column names or ``"*"``.
    filters : dict | None
        Simple equality filters applied via ``.eq()``.
    order_by : str | None
        Column name for ordering.
    order_desc : bool
        If True, order descending.
    limit : int | None
        Max number of rows.
    single : bool
        If True, return a single dict or None instead of a list.
    """
    query = get_client().table(table).select(columns)

    if filters:
        for col, val in filters.items():
            query = query.eq(col, val)

    if order_by:
        query = query.order(order_by, desc=order_desc)

    if limit:
        query = query.limit(limit)

    resp = query.execute()

    if single:
        return resp.data[0] if resp.data else None
    return resp.data or []


def select_range(
    table: str,
    *,
    columns: str = "*",
    filters: Optional[dict[str, Any]] = None,
    gte: Optional[tuple[str, str]] = None,
    lte: Optional[tuple[str, str]] = None,
    order_by: Optional[str] = None,
    order_desc: bool = True,
    limit: Optional[int] = None,
) -> list[dict[str, Any]]:
    """Select with range filters (gte/lte) for date ranges."""
    query = get_client().table(table).select(columns)

    if filters:
        for col, val in filters.items():
            query = query.eq(col, val)

    if gte:
        query = query.gte(gte[0], gte[1])
    if lte:
        query = query.lte(lte[0], lte[1])

    if order_by:
        query = query.order(order_by, desc=order_desc)

    if limit:
        query = query.limit(limit)

    resp = query.execute()
    return resp.data or []


def update(table: str, row_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update a row by id and return the updated record."""
    resp = (
        get_client()
        .table(table)
        .update(_serialize_dates(data))
        .eq("id", row_id)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    raise RuntimeError(f"Update on {table} id={row_id} failed: {resp}")


def delete(table: str, row_id: str) -> bool:
    """Delete a row by id. Returns True on success."""
    resp = get_client().table(table).delete().eq("id", row_id).execute()
    return bool(resp.data)


def rpc(function_name: str, params: Optional[dict[str, Any]] = None) -> Any:
    """Call a Supabase RPC / database function."""
    resp = get_client().rpc(function_name, params or {}).execute()
    return resp.data


# ---------------------------------------------------------------------------
# Domain-specific helpers
# ---------------------------------------------------------------------------

def get_merchant_transactions(
    merchant_id: str,
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    txn_type: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Fetch transactions for a merchant with optional filters."""
    query = get_client().table("transactions").select("*").eq("merchant_id", merchant_id)

    if start_date:
        query = query.gte("recorded_at", start_date)
    if end_date:
        query = query.lte("recorded_at", end_date)
    if category:
        query = query.eq("category", category)
    if txn_type:
        query = query.eq("type", txn_type)

    query = query.order("recorded_at", desc=True).limit(limit)
    resp = query.execute()
    return resp.data or []


def get_merchant_udharis(
    merchant_id: str,
    *,
    status: Optional[str] = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Fetch udhari (credit) entries for a merchant."""
    query = get_client().table("udhari").select("*").eq("merchant_id", merchant_id)

    if status:
        query = query.eq("status", status)

    query = query.order("created_at", desc=True).limit(limit)
    resp = query.execute()
    return resp.data or []


def get_merchant_customers(
    merchant_id: str,
    *,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Fetch customers for a merchant."""
    return select(
        "customers",
        filters={"merchant_id": merchant_id},
        order_by="last_visit",
        order_desc=True,
        limit=limit,
    )


def get_merchant_employees(merchant_id: str) -> list[dict[str, Any]]:
    """Fetch employees for a merchant."""
    return select(
        "employees",
        filters={"merchant_id": merchant_id},
        order_by="name",
        order_desc=False,
    )
