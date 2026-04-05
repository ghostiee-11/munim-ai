"""
Employees router -- manage staff records and salary payments.
"""

from __future__ import annotations

import logging
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query

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


def _working_days_in_month(year: int = None, month: int = None) -> int:
    """Calculate working days (excluding Sundays) in a month."""
    import calendar
    today = date.today()
    y = year or today.year
    m = month or today.month
    total = 0
    for day in range(1, calendar.monthrange(y, m)[1] + 1):
        if date(y, m, day).weekday() != 6:  # 6 = Sunday
            total += 1
    return total


@router.get("/payroll-summary/{merchant_id}")
async def payroll_summary(merchant_id: str):
    """Payroll analytics: trends, % of revenue, insights."""
    employees = db.get_merchant_employees(merchant_id)

    # Get salary transactions for last 6 months
    from datetime import timedelta
    six_months_ago = (date.today() - timedelta(days=180)).isoformat()
    salary_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id, "category": "Salary"},
        gte=("created_at", six_months_ago),
    )

    # Monthly breakdown
    from collections import defaultdict
    monthly: dict[str, float] = defaultdict(float)
    for t in salary_txns:
        m = str(t.get("created_at", ""))[:7]
        if m:
            monthly[m] += float(t.get("amount", 0))

    monthly_trend = [{"month": k, "amount": round(v, 2)} for k, v in sorted(monthly.items())]
    total_ytd = sum(v for v in monthly.values())

    # Revenue for comparison
    all_income = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id, "type": "income"},
        gte=("created_at", six_months_ago),
    )
    total_revenue = sum(float(t.get("amount", 0)) for t in all_income)
    payroll_pct = round(total_ytd / max(total_revenue, 1) * 100, 1)

    total_monthly_salary = sum(float(e.get("salary", 0) or 0) for e in employees)

    # If no salary transactions yet, estimate from employee salaries vs revenue
    if total_ytd == 0 and total_monthly_salary > 0 and total_revenue > 0:
        payroll_pct = round(total_monthly_salary / max(total_revenue / 6, 1) * 100, 1)
        total_ytd = total_monthly_salary  # Estimate 1 month

    # Pending payments
    today = date.today()
    pending = []
    for e in employees:
        last_paid = e.get("last_paid_date", "")
        if last_paid:
            try:
                last = date.fromisoformat(str(last_paid)[:10])
                days_since = (today - last).days
                if days_since > 28:
                    pending.append({"name": e.get("name"), "days_overdue": days_since, "salary": e.get("salary", 0)})
            except Exception:
                pending.append({"name": e.get("name"), "days_overdue": 0, "salary": e.get("salary", 0)})
        else:
            pending.append({"name": e.get("name"), "days_overdue": 0, "salary": e.get("salary", 0)})

    # Groq insight
    insight_hi = f"Salary kharcha Rs {total_monthly_salary:,.0f}/month hai, jo aapki income ka {payroll_pct}% hai."
    if payroll_pct > 30:
        insight_hi += " Ye thoda zyada hai - 30% se neeche rakhna better hai."
    elif payroll_pct > 0 and payroll_pct < 15:
        insight_hi += " Ye healthy range mein hai. Ek aur employee afford kar sakte hain."
    elif payroll_pct > 0:
        insight_hi += " Ye normal range mein hai."
    else:
        insight_hi += " Abhi tak koi salary payment record nahi hua."

    if pending:
        overdue_names = [p["name"] for p in pending if p.get("days_overdue", 0) > 28]
        if overdue_names:
            insight_hi += f" {', '.join(overdue_names)} ki salary pending hai!"

    return {
        "merchant_id": merchant_id,
        "employee_count": len(employees),
        "total_monthly_salary": total_monthly_salary,
        "total_ytd": round(total_ytd, 2),
        "payroll_pct_of_revenue": payroll_pct,
        "monthly_trend": monthly_trend,
        "pending_payments": pending,
        "insight_hi": insight_hi,
    }


@router.get("/salary-insights/{merchant_id}")
async def salary_insights(merchant_id: str):
    """AI-powered salary and payroll recommendations."""
    import httpx

    employees = db.get_merchant_employees(merchant_id)
    if not employees:
        return {"insights": [], "recommendation_hi": "Abhi koi employee nahi hai."}

    # Get revenue data
    from datetime import timedelta
    month_ago = (date.today() - timedelta(days=30)).isoformat()
    income_txns = db.select_range(
        "transactions",
        filters={"merchant_id": merchant_id, "type": "income"},
        gte=("created_at", month_ago),
    )
    monthly_income = sum(float(t.get("amount", 0)) for t in income_txns)
    total_salary = sum(float(e.get("salary", 0) or 0) for e in employees)
    salary_pct = round(total_salary / max(monthly_income, 1) * 100, 1)

    # Build insights
    insights = []
    for e in employees:
        last_paid = e.get("last_paid_date", "")
        if last_paid:
            try:
                days = (date.today() - date.fromisoformat(str(last_paid)[:10])).days
                if days > 35:
                    insights.append({"type": "overdue", "name": e["name"], "days": days, "alert_hi": f"{e['name']} ki salary {days} din se pending hai!"})
            except Exception:
                pass

    if salary_pct > 30:
        insights.append({"type": "high_payroll", "pct": salary_pct, "alert_hi": f"Payroll {salary_pct}% hai income ka. 30% se neeche rakhna chahiye."})

    # Groq recommendation
    recommendation_hi = ""
    try:
        settings_obj = __import__("config", fromlist=["get_settings"]).get_settings()
        emp_list = ", ".join([f"{e['name']} ({e.get('role','')}) Rs {e.get('salary',0):,.0f}" for e in employees])
        prompt = f"Merchant monthly income Rs {monthly_income:,.0f}. Employees: {emp_list}. Total salary Rs {total_salary:,.0f} ({salary_pct}% of income). Give 2-3 line Hindi advice on payroll health and if they can afford more staff."

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings_obj.groq_api_key}", "Content-Type": "application/json"},
                json={"model": settings_obj.groq_model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.3, "max_tokens": 200})
        if resp.status_code == 200:
            recommendation_hi = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        recommendation_hi = f"Aapki income Rs {monthly_income:,.0f}/month hai, salary kharcha Rs {total_salary:,.0f} ({salary_pct}%). {'Ye thoda zyada hai.' if salary_pct > 30 else 'Ye theek hai.'}"

    return {
        "merchant_id": merchant_id,
        "monthly_income": monthly_income,
        "total_salary": total_salary,
        "salary_pct": salary_pct,
        "employee_count": len(employees),
        "insights": insights,
        "recommendation_hi": recommendation_hi,
    }


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


@router.post("/{employee_id}/attendance")
async def mark_attendance(employee_id: str, body: dict):
    """Mark daily attendance for an employee."""
    emp = db.select("employees", filters={"id": employee_id}, single=True)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    status = body.get("status", "present")  # present, absent, half_day, leave
    att_date = body.get("date", date.today().isoformat())

    # Update attendance_this_month counter
    current = emp.get("attendance_this_month", 0) or 0
    if status == "present":
        new_count = current + 1
    elif status == "half_day":
        new_count = current + 0.5
    else:
        new_count = current  # absent/leave don't add

    db.update("employees", employee_id, {"attendance_this_month": int(new_count)})

    return {"employee_id": employee_id, "date": att_date, "status": status, "attendance_this_month": new_count}


@router.get("/{employee_id}/attendance")
async def get_attendance(employee_id: str, month: str = Query(None)):
    """Get attendance summary for an employee."""
    emp = db.select("employees", filters={"id": employee_id}, single=True)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    attendance = emp.get("attendance_this_month", 0) or 0
    salary = emp.get("salary", 0) or 0
    working_days = _working_days_in_month()
    pro_rata = round(salary * attendance / max(working_days, 1), 2)

    return {
        "employee_id": employee_id,
        "name": emp.get("name"),
        "month": month or date.today().strftime("%Y-%m"),
        "days_present": attendance,
        "total_working_days": working_days,
        "attendance_pct": round(attendance / working_days * 100, 1),
        "base_salary": salary,
        "pro_rata_salary": pro_rata,
    }


@router.get("/{employee_id}/payslip")
async def generate_payslip(employee_id: str, month: str = Query(None)):
    """Generate salary payslip with pro-rata calculation."""
    emp = db.select("employees", filters={"id": employee_id}, single=True)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    rpt_month = month or date.today().strftime("%Y-%m")
    name = emp.get("name", "Employee")
    salary = emp.get("salary", 0) or 0
    attendance = emp.get("attendance_this_month", 0) or 0
    working_days = _working_days_in_month()

    pro_rata = round(salary * attendance / max(working_days, 1), 2)

    # Overtime calculation
    ot_hours = float(emp.get("overtime_hours", 0) or 0)
    hourly_rate = salary / (working_days * 8)
    ot_rate = hourly_rate * 1.5
    ot_amount = round(ot_hours * ot_rate, 2)

    # Check for advances
    advance_deduction = 0
    try:
        txns = db.select("transactions", filters={"merchant_id": emp.get("merchant_id"), "category": "Employee Advance"}, limit=100)
        pending_advances = [t for t in txns if name.lower() in (t.get("description", "") or "").lower() and t.get("source") == "employee_advance"]
        advance_deduction = min(round(salary * 0.1, 2), sum(t.get("amount", 0) for t in pending_advances))
    except Exception:
        pass

    net_payable = round(pro_rata + ot_amount - advance_deduction, 2)

    # Summary
    summary_hi = f"{name} ki {rpt_month} salary: {attendance}/{working_days} din kaam kiya. Base Rs {salary:,.0f}, pro-rata Rs {pro_rata:,.0f}"
    if ot_hours > 0:
        summary_hi += f", overtime {ot_hours} ghante Rs {ot_amount:,.0f}"
    if advance_deduction > 0:
        summary_hi += f", advance katautee Rs {advance_deduction:,.0f}"
    summary_hi += f". Net Rs {net_payable:,.0f} milega."

    return {
        "employee_id": employee_id,
        "name": name,
        "role": emp.get("role", ""),
        "month": rpt_month,
        "base_salary": salary,
        "working_days": working_days,
        "days_worked": attendance,
        "attendance_pct": round(attendance / working_days * 100, 1),
        "pro_rata_amount": pro_rata,
        "overtime_hours": ot_hours,
        "overtime_amount": ot_amount,
        "advance_deduction": advance_deduction,
        "net_payable": net_payable,
        "payment_mode": emp.get("payment_mode", "cash"),
        "upi_id": emp.get("upi_id", ""),
        "summary_hi": summary_hi,
    }


@router.post("/{employee_id}/advance")
async def give_advance(employee_id: str, body: dict):
    """Record salary advance for an employee."""
    emp = db.select("employees", filters={"id": employee_id}, single=True)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    amount = float(body.get("amount", 0))
    reason = body.get("reason", "Advance")

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    merchant_id = emp["merchant_id"]
    name = emp.get("name", "Employee")

    # Record as expense transaction
    txn = db.insert("transactions", {
        "merchant_id": merchant_id,
        "amount": amount,
        "type": "expense",
        "category": "Employee Advance",
        "description": f"Advance to {name}: {reason}",
        "payment_mode": body.get("payment_mode", "cash"),
        "source": "employee_advance",
        "recorded_at": datetime.now().isoformat(),
    })

    return {"success": True, "employee": name, "amount": amount, "reason": reason, "transaction_id": txn.get("id")}


@router.post("/{employee_id}/send-payslip")
async def send_payslip_whatsapp(employee_id: str):
    """Send salary slip to employee via WhatsApp."""
    from services.twilio_service import send_whatsapp

    emp = db.select("employees", filters={"id": employee_id}, single=True)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    phone = emp.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="Employee phone not available")

    name = emp.get("name", "Employee")
    salary = emp.get("salary", 0) or 0
    attendance = emp.get("attendance_this_month", 0) or 0
    working_days = _working_days_in_month()
    pro_rata = round(salary * attendance / max(working_days, 1), 2)
    month_name = date.today().strftime("%B %Y")

    message = (
        f"*Salary Slip - {month_name}*\n\n"
        f"Name: {name}\n"
        f"Role: {emp.get('role', '-')}\n"
        f"Days: {attendance}/{working_days}\n"
        f"Base Salary: Rs {salary:,.0f}\n"
        f"Pro-rata: Rs {pro_rata:,.0f}\n"
        f"Net Payable: Rs {pro_rata:,.0f}\n\n"
        f"-- MunimAI Payroll --"
    )

    try:
        result = await send_whatsapp(to=phone, body=message)
        return {"sent": True, "employee": name, "phone": phone, "message": message, "whatsapp_result": result}
    except Exception as e:
        return {"sent": False, "employee": name, "message": message, "error": str(e)}


@router.post("/{employee_id}/overtime")
async def add_overtime(employee_id: str, body: dict):
    """Record overtime hours. OT rate = 1.5x hourly rate (Indian labor law). Persists to employee record."""
    emp = db.select("employees", filters={"id": employee_id}, single=True)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    hours = float(body.get("hours", 0))
    if hours <= 0:
        raise HTTPException(status_code=400, detail="Hours must be positive")

    salary = emp.get("salary", 0) or 0
    working_days = _working_days_in_month()
    hourly_rate = salary / (working_days * 8)
    ot_rate = hourly_rate * 1.5
    ot_amount = round(hours * ot_rate, 2)

    # Persist: accumulate OT hours this month
    existing_ot = float(emp.get("overtime_hours", 0) or 0)
    new_ot = existing_ot + hours
    try:
        db.update("employees", employee_id, {"overtime_hours": new_ot})
    except Exception:
        logger.debug("overtime_hours column may not exist, skipping persist")

    return {
        "employee_id": employee_id,
        "name": emp.get("name"),
        "hours": hours,
        "total_ot_hours": new_ot,
        "hourly_rate": round(hourly_rate, 2),
        "ot_rate": round(ot_rate, 2),
        "ot_amount": ot_amount,
        "total_ot_amount": round(new_ot * ot_rate, 2),
        "date": body.get("date", date.today().isoformat()),
    }
