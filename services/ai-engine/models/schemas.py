"""
Pydantic models for all MunimAI API request/response payloads.

Naming convention:
  - *Create   = request body for creating a resource
  - *Response = response body returned to clients
  - *Update   = partial update payload
"""

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"


class UdhariStatus(str, Enum):
    PENDING = "pending"
    PARTIAL = "partial"
    SETTLED = "settled"
    OVERDUE = "overdue"


class GSTSlabRate(str, Enum):
    ZERO = "0"
    FIVE = "5"
    TWELVE = "12"
    EIGHTEEN = "18"
    TWENTY_EIGHT = "28"


class EmployeePayFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------

class TransactionCreate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    merchant_id: str
    amount: float = Field(..., gt=0, description="Amount in INR")
    type: str = Field(..., description="income or expense")
    category: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    party_name: Optional[str] = None
    txn_date: Optional[str] = Field(None, description="Transaction date (YYYY-MM-DD), defaults to today")
    payment_mode: Optional[str] = Field(None, description="cash / upi / bank / card")
    source: str = Field("voice", description="How the transaction was created: voice, manual, import")


class TransactionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: str
    merchant_id: str
    amount: float
    type: str  # "income" or "expense"
    category: str
    description: Optional[str] = None
    party_name: Optional[str] = None
    date: str
    payment_mode: Optional[str] = None
    source: str = "voice"
    created_at: Optional[str] = None


class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]
    total: int
    filters_applied: dict[str, Any] = {}


class CategorySummary(BaseModel):
    category: str
    total: float
    count: int
    percentage: float


# ---------------------------------------------------------------------------
# Udhari (Credit / Khata)
# ---------------------------------------------------------------------------

class UdhariCreate(BaseModel):
    merchant_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    amount: float = Field(..., gt=0)
    description: Optional[str] = None
    due_date: Optional[date] = None


class UdhariResponse(BaseModel):
    id: str
    merchant_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    amount: float
    amount_paid: float = 0
    remaining: float = 0
    status: UdhariStatus = UdhariStatus.PENDING
    description: Optional[str] = None
    due_date: Optional[str] = None
    created_at: Optional[str] = None
    last_reminded_at: Optional[str] = None


class UdhariSettleRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Amount being settled now")
    payment_mode: Optional[str] = "cash"


class UdhariStats(BaseModel):
    total_outstanding: float
    total_entries: int
    overdue_count: int
    overdue_amount: float
    collected_this_month: float
    average_days_outstanding: float


class UdhariPhotoImport(BaseModel):
    merchant_id: str
    image_base64: str
    source: str = "photo"


# ---------------------------------------------------------------------------
# Customer
# ---------------------------------------------------------------------------

class CustomerResponse(BaseModel):
    id: str
    merchant_id: str
    name: str
    phone: Optional[str] = None
    total_transactions: int = 0
    total_amount: float = 0
    last_transaction_date: Optional[str] = None
    segment: Optional[str] = None
    risk_score: Optional[float] = None


class EnrichedCustomerResponse(BaseModel):
    id: str
    merchant_id: str
    name: str
    phone: Optional[str] = None
    segment: str = "promising"
    total_spent: float = 0
    transaction_count: int = 0
    last_visit: Optional[str] = None
    avg_order_value: float = 0
    clv: float = 0
    churn_probability: float = 0.5
    days_since_last_visit: int = 0
    visit_count: int = 0
    favorite_items: list[str] = []


class AtRiskCustomer(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    days_since_last_visit: int
    avg_monthly_spend: float
    risk_level: str  # high / medium / low
    suggested_action: str


class WinbackRequest(BaseModel):
    channel: str = Field("whatsapp", description="whatsapp or sms")
    offer_text: Optional[str] = None


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

class DashboardState(BaseModel):
    merchant_id: str
    today_income: float = 0
    today_expense: float = 0
    today_profit: float = 0
    month_income: float = 0
    month_expense: float = 0
    month_profit: float = 0
    total_udhari: float = 0
    overdue_udhari: float = 0
    payscore: Optional[int] = None
    active_customers: int = 0
    recent_transactions: list[TransactionResponse] = []
    alerts: list[dict[str, Any]] = []


class TodaySummary(BaseModel):
    income: float = 0
    expense: float = 0
    profit: float = 0
    transaction_count: int = 0
    top_category: Optional[str] = None
    comparison_yesterday: Optional[float] = None


class MonthlySummary(BaseModel):
    income: float = 0
    expense: float = 0
    profit: float = 0
    daily_breakdown: list[dict[str, Any]] = []
    category_breakdown: list[CategorySummary] = []
    comparison_last_month: Optional[float] = None


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------

class ForecastResponse(BaseModel):
    merchant_id: str
    period: str  # "7d" | "30d" | "90d"
    predicted_income: float
    predicted_expense: float
    predicted_profit: float
    confidence: float = Field(..., ge=0, le=1)
    daily_forecast: list[dict[str, Any]] = []
    upcoming_festivals: list[dict[str, Any]] = []
    cash_crunch_days: list[str] = []
    recommendations: list[dict[str, Any]] = []
    model_version: str = "v2-festival-aware"


class CrisisAlert(BaseModel):
    alert_type: str  # cash_crunch | revenue_drop | expense_spike
    severity: str  # critical | warning | info
    message: str
    predicted_date: Optional[str] = None
    recommendation: str
    confidence: float = Field(..., ge=0, le=1)


# ---------------------------------------------------------------------------
# PayScore
# ---------------------------------------------------------------------------

class PayScoreResponse(BaseModel):
    merchant_id: str
    score: int = Field(..., ge=0, le=100)
    grade: str  # A+ / A / B+ / B / C / D
    factors: list[dict[str, Any]] = []
    last_updated: Optional[str] = None


class PayScoreHistory(BaseModel):
    entries: list[dict[str, Any]]  # [{date, score, grade}]
    trend: str  # improving / stable / declining


# ---------------------------------------------------------------------------
# GST
# ---------------------------------------------------------------------------

class GSTSummary(BaseModel):
    merchant_id: str
    period: str
    total_sales: float
    total_purchases: float
    gst_collected: float
    gst_paid: float
    net_gst_liability: float
    slab_breakdown: list[dict[str, Any]] = []


class GSTClassifyRequest(BaseModel):
    items: list[dict[str, Any]]  # [{name, amount, description}]


class GSTClassifyResponse(BaseModel):
    classified_items: list[dict[str, Any]]  # [{name, hsn_code, slab, gst_amount}]


class GSTFilingResponse(BaseModel):
    status: str  # prepared | filed | error
    reference_id: Optional[str] = None
    period: str
    total_liability: float
    message: str


# ---------------------------------------------------------------------------
# Schemes
# ---------------------------------------------------------------------------

class SchemeResponse(BaseModel):
    scheme_code: str
    name: str
    provider: str
    description: str
    eligibility: str
    benefit_amount: Optional[str] = None
    deadline: Optional[str] = None
    match_score: float = Field(..., ge=0, le=1)


class SchemeApplicationResponse(BaseModel):
    status: str
    scheme_code: str
    message: str
    next_steps: list[str] = []


# ---------------------------------------------------------------------------
# Employee
# ---------------------------------------------------------------------------

class EmployeeCreate(BaseModel):
    merchant_id: str
    name: str
    phone: Optional[str] = None
    role: Optional[str] = None
    salary: float = Field(..., gt=0)
    pay_frequency: EmployeePayFrequency = EmployeePayFrequency.MONTHLY
    join_date: date = Field(default_factory=date.today)


class EmployeeResponse(BaseModel):
    id: str
    merchant_id: str
    name: str
    phone: Optional[str] = None
    role: Optional[str] = None
    salary: float
    pay_frequency: str
    join_date: Optional[str] = None
    is_active: bool = True
    total_paid: float = 0
    last_paid_date: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    salary: Optional[float] = None
    pay_frequency: Optional[EmployeePayFrequency] = None
    is_active: Optional[bool] = None


class EmployeePayRequest(BaseModel):
    amount: float = Field(..., gt=0)
    payment_mode: str = "cash"
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# WhatsApp
# ---------------------------------------------------------------------------

class WhatsAppSendRequest(BaseModel):
    merchant_id: str
    to_phone: str
    message: str
    template_name: Optional[str] = None


class WhatsAppMessage(BaseModel):
    id: str
    merchant_id: str
    direction: str  # inbound / outbound
    from_phone: str
    to_phone: str
    message: str
    status: str
    created_at: Optional[str] = None


class WhatsAppWebhookPayload(BaseModel):
    """Raw webhook payload from Meta WhatsApp Business API."""
    object: str
    entry: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Briefing
# ---------------------------------------------------------------------------

class BriefingResponse(BaseModel):
    merchant_id: str
    date: str
    summary: str
    highlights: list[str]
    alerts: list[str]
    recommendations: list[str]
    audio_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Voice
# ---------------------------------------------------------------------------

class VoiceTextRequest(BaseModel):
    merchant_id: str
    text: str
    language: str = "hi"


class NLUResult(BaseModel):
    intent: str
    confidence: float = Field(..., ge=0, le=1)
    entities: dict[str, Any] = {}
    raw_text: str
    language: str = "hi"


class VoiceResponse(BaseModel):
    success: bool
    transcript: Optional[str] = None
    nlu: Optional[NLUResult] = None
    action_result: Optional[dict[str, Any]] = None
    response_text: str
    response_audio_url: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

class DemoResetRequest(BaseModel):
    merchant_id: str = "demo_merchant"


class DemoSimulatePayment(BaseModel):
    merchant_id: str = "demo_merchant"
    amount: float = 500
    category: str = "General"
    party_name: Optional[str] = "Walk-in Customer"


class DemoSimulateCollection(BaseModel):
    merchant_id: str = "demo_merchant"
    udhari_id: Optional[str] = None
    amount: float = 200


class DemoTriggerAlert(BaseModel):
    merchant_id: str = "demo_merchant"
    alert_type: str = "cash_crunch"
