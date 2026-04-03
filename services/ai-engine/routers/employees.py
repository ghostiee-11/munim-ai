"""
Employees router -- manage staff records and salary payments.
"""

from __future__ import annotations

import logging
from datetime import date, datetime

from fastapi import APIRouter, HTTPException

from models import db
from models.schemas import (
    EmployeeCreate,
    EmployeePayRequest,
    EmployeeResponse,
    EmployeeUpdate,
    TransactionType,
)
from services import realtime

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{merchant_id}")
async def list_employees(merchant_id: str):
    """List all employees for a merchant."""
    try:
        employees = db.get_merchant_employees(merchant_id)
        return employees
    except Exception as e:
        logger.error("Failed to list employees for %s: %s", merchant_id, e)
        return []


@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(body: EmployeeCreate):
    """Add a new employee."""
    data = body.model_dump()

    employee = db.insert("employees", data)
    logger.info("Employee created: %s (%s)", employee.get("id"), body.name)

    return employee


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(employee_id: str, body: EmployeeUpdate):
    """Update an employee's details (partial update)."""
    existing = db.select("employees", filters={"id": employee_id}, single=True)
    if not existing:
        raise HTTPException(status_code=404, detail="Employee not found.")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update.")

    updated = db.update("employees", employee_id, update_data)
    return updated


@router.post("/{employee_id}/pay")
async def pay_employee(employee_id: str, body: EmployeePayRequest):
    """
    Record a salary payment to an employee.

    Creates an expense transaction and updates the employee's payment record.
    """
    employee = db.select("employees", filters={"id": employee_id}, single=True)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")

    merchant_id = employee["merchant_id"]
    emp_name = employee.get("name", "Employee")

    # Record expense transaction
    txn = db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": body.amount,
        "type": TransactionType.EXPENSE.value,
        "category": "Salary",
        "supplier_name": emp_name,
        "description": body.note or f"Salary payment to {emp_name}",
        "recorded_at": datetime.now().isoformat(),
        "payment_mode": body.payment_mode,
        "source": "employee_pay",
    })

    # Update employee record
    db.update("employees", employee_id, {
        "last_paid_amount": body.amount,
        "last_paid_date": date.today().isoformat(),
    })

    await realtime.emit_employee_paid(merchant_id, employee, body.amount)
    await realtime.emit_dashboard_refresh(merchant_id)

    return {
        "paid": True,
        "employee_id": employee_id,
        "employee_name": emp_name,
        "amount": body.amount,
        "payment_mode": body.payment_mode,
        "transaction_id": txn.get("id"),
    }
