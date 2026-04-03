"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Plus,
  X,
  Home,
  Briefcase,
  Package,
  Zap,
  CreditCard,
  MoreHorizontal,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageCircle,
  ChevronRight,
  Pencil,
  Trash2,
  Play,
  SkipForward,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight,
  IndianRupee,
} from "lucide-react";

// ---------- Types ----------

interface RecurringPayment {
  id: string;
  merchant_id: string;
  name: string;
  amount: number;
  frequency: string;
  category: string;
  payment_method: string;
  upi_id: string | null;
  account_no: string | null;
  ifsc_code: string | null;
  beneficiary_name: string | null;
  next_due: string | null;
  reminder_days_before: number;
  auto_approve: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  days_until_due?: number;
}

interface PaymentExecution {
  id: string;
  recurring_id: string;
  recurring_name: string;
  amount: number;
  status: string;
  scheduled_date: string;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
}

// ---------- Constants ----------

const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string; label: string }> = {
  rent: { icon: Home, color: "text-blue-600", bgColor: "bg-blue-50", label: "Rent" },
  salary: { icon: Briefcase, color: "text-emerald-600", bgColor: "bg-emerald-50", label: "Salary" },
  supplier: { icon: Package, color: "text-orange-600", bgColor: "bg-orange-50", label: "Supplier" },
  utility: { icon: Zap, color: "text-yellow-600", bgColor: "bg-yellow-50", label: "Utility" },
  emi: { icon: CreditCard, color: "text-violet-600", bgColor: "bg-violet-50", label: "EMI" },
  other: { icon: MoreHorizontal, color: "text-gray-600", bgColor: "bg-gray-50", label: "Other" },
};

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

// ---------- Demo Data ----------

const DEMO_PAYMENTS: RecurringPayment[] = [
  {
    id: "rec_1",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Monthly Rent",
    amount: 15000,
    frequency: "monthly",
    category: "rent",
    payment_method: "upi",
    upi_id: "landlord@paytm",
    account_no: null,
    ifsc_code: null,
    beneficiary_name: "Ramesh Verma",
    next_due: "2026-04-10",
    reminder_days_before: 1,
    auto_approve: false,
    is_active: true,
    notes: "Shop rent for Lal Market unit",
    created_at: "2026-01-15T10:00:00",
  },
  {
    id: "rec_2",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Salary - Raju",
    amount: 8000,
    frequency: "weekly",
    category: "salary",
    payment_method: "bank_transfer",
    upi_id: null,
    account_no: "1234567890",
    ifsc_code: "SBIN0001234",
    beneficiary_name: "Raju Yadav",
    next_due: "2026-04-07",
    reminder_days_before: 1,
    auto_approve: false,
    is_active: true,
    notes: "Delivery boy weekly salary",
    created_at: "2026-02-01T10:00:00",
  },
  {
    id: "rec_3",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Supplier - Gupta Traders",
    amount: 25000,
    frequency: "monthly",
    category: "supplier",
    payment_method: "upi",
    upi_id: "gupta.traders@ybl",
    account_no: null,
    ifsc_code: null,
    beneficiary_name: "Gupta Traders",
    next_due: "2026-04-15",
    reminder_days_before: 2,
    auto_approve: false,
    is_active: true,
    notes: "Monthly fabric order payment",
    created_at: "2026-01-20T10:00:00",
  },
  {
    id: "rec_4",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Electricity Bill",
    amount: 3500,
    frequency: "monthly",
    category: "utility",
    payment_method: "upi",
    upi_id: "jvvnl.bill@paytm",
    account_no: null,
    ifsc_code: null,
    beneficiary_name: "JVVNL Electricity",
    next_due: "2026-04-20",
    reminder_days_before: 1,
    auto_approve: true,
    is_active: true,
    notes: "Auto-approved monthly electricity",
    created_at: "2026-02-10T10:00:00",
  },
];

const DEMO_HISTORY: PaymentExecution[] = [
  {
    id: "ex_1",
    recurring_id: "rec_1",
    recurring_name: "Monthly Rent",
    amount: 15000,
    status: "paid",
    scheduled_date: "2026-04-01",
    approved_at: "2026-03-31T18:30:00",
    paid_at: "2026-04-01T09:00:00",
    created_at: "2026-03-31T18:00:00",
  },
  {
    id: "ex_2",
    recurring_id: "rec_2",
    recurring_name: "Salary - Raju",
    amount: 8000,
    status: "paid",
    scheduled_date: "2026-03-31",
    approved_at: "2026-03-31T10:00:00",
    paid_at: "2026-03-31T10:05:00",
    created_at: "2026-03-31T09:00:00",
  },
  {
    id: "ex_3",
    recurring_id: "rec_3",
    recurring_name: "Supplier - Gupta Traders",
    amount: 25000,
    status: "paid",
    scheduled_date: "2026-03-15",
    approved_at: "2026-03-14T20:00:00",
    paid_at: "2026-03-15T09:00:00",
    created_at: "2026-03-14T18:00:00",
  },
  {
    id: "ex_4",
    recurring_id: "rec_4",
    recurring_name: "Electricity Bill",
    amount: 3500,
    status: "paid",
    scheduled_date: "2026-03-20",
    approved_at: "2026-03-20T00:01:00",
    paid_at: "2026-03-20T00:01:00",
    created_at: "2026-03-20T00:00:00",
  },
  {
    id: "ex_5",
    recurring_id: "rec_2",
    recurring_name: "Salary - Raju",
    amount: 8000,
    status: "skipped",
    scheduled_date: "2026-03-24",
    approved_at: null,
    paid_at: null,
    created_at: "2026-03-24T09:00:00",
  },
];

// ---------- Helpers ----------

function maskUPI(upi: string): string {
  if (!upi) return "";
  const parts = upi.split("@");
  if (parts.length !== 2) return upi;
  const name = parts[0];
  if (name.length <= 4) return upi;
  return name.slice(0, 3) + "***@" + parts[1];
}

function maskAccount(account: string): string {
  if (!account) return "";
  if (account.length <= 4) return account;
  return "****" + account.slice(-4);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ---------- Components ----------

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bg: string; label: string }> = {
    paid: { color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", label: "Paid" },
    pending_approval: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Pending" },
    approved: { color: "text-blue-700", bg: "bg-blue-50 border-blue-200", label: "Approved" },
    failed: { color: "text-red-700", bg: "bg-red-50 border-red-200", label: "Failed" },
    skipped: { color: "text-gray-500", bg: "bg-gray-50 border-gray-200", label: "Skipped" },
  };
  const c = config[status] || config.pending_approval;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", c.bg, c.color)}>
      {c.label}
    </span>
  );
}

function CategoryIcon({ category, size = "md" }: { category: string; size?: "sm" | "md" | "lg" }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  const Icon = config.icon;
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  const iconSizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };
  return (
    <div className={cn("rounded-xl flex items-center justify-center", sizeClasses[size], config.bgColor)}>
      <Icon className={cn(iconSizeClasses[size], config.color)} />
    </div>
  );
}

// ---------- Upcoming Card ----------

function UpcomingCard({
  payment,
  onPayNow,
  onSkip,
}: {
  payment: RecurringPayment;
  onPayNow: () => void;
  onSkip: () => void;
}) {
  const days = payment.days_until_due ?? (payment.next_due ? daysUntil(payment.next_due) : 0);
  const config = CATEGORY_CONFIG[payment.category] || CATEGORY_CONFIG.other;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-3">
        <CategoryIcon category={payment.category} />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 truncate">{payment.name}</h4>
          <p className="text-lg font-bold text-[#002E6E] mt-0.5">
            Rs {payment.amount.toLocaleString("en-IN")}
          </p>
          {payment.beneficiary_name && (
            <p className="text-xs text-gray-500 mt-0.5">
              To: {payment.beneficiary_name}
            </p>
          )}
          <div className="text-xs text-gray-400 mt-1 space-y-0.5">
            {payment.upi_id && (
              <p>UPI: {maskUPI(payment.upi_id)}</p>
            )}
            {payment.account_no && (
              <p>A/C: {maskAccount(payment.account_no)} | IFSC: {payment.ifsc_code}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={cn(
            "text-xs font-semibold rounded-full px-2.5 py-1",
            days <= 1 ? "bg-red-50 text-red-600" :
            days <= 3 ? "bg-amber-50 text-amber-600" :
            "bg-blue-50 text-blue-600"
          )}>
            {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`}
          </div>
          {payment.next_due && (
            <p className="text-[11px] text-gray-400 mt-1">
              {formatShortDate(payment.next_due)}
            </p>
          )}
        </div>
      </div>

      {/* WhatsApp approval badge */}
      {!payment.auto_approve && (
        <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-100">
          <MessageCircle className="h-3.5 w-3.5 text-green-600" />
          <span className="text-[11px] font-medium text-green-700">
            WhatsApp approval before payment
          </span>
        </div>
      )}
      {payment.auto_approve && (
        <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
          <Zap className="h-3.5 w-3.5 text-violet-600" />
          <span className="text-[11px] font-medium text-violet-700">
            Auto-approved payment
          </span>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={onPayNow}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#002E6E] px-3 py-2 text-xs font-semibold text-white hover:bg-[#001d47] transition-colors"
        >
          <Play className="h-3.5 w-3.5" />
          Pay Now
        </button>
        <button
          onClick={onSkip}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Skip
        </button>
      </div>
    </motion.div>
  );
}

// ---------- Payment Card (All Payments) ----------

function PaymentCard({
  payment,
  onEdit,
  onDelete,
  onToggle,
}: {
  payment: RecurringPayment;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const config = CATEGORY_CONFIG[payment.category] || CATEGORY_CONFIG.other;
  const days = payment.next_due ? daysUntil(payment.next_due) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-xl border bg-white p-5 hover:shadow-lg transition-all",
        payment.is_active ? "border-gray-200" : "border-gray-100 opacity-60"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <CategoryIcon category={payment.category} size="lg" />
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{payment.name}</h4>
            <p className="text-xs text-gray-400">{FREQUENCY_LABELS[payment.frequency] || payment.frequency}</p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title={payment.is_active ? "Pause" : "Resume"}
        >
          {payment.is_active ? (
            <ToggleRight className="h-6 w-6 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-gray-300" />
          )}
        </button>
      </div>

      <div className="mt-3">
        <p className="text-2xl font-bold text-[#002E6E]">
          Rs {payment.amount.toLocaleString("en-IN")}
        </p>
      </div>

      {payment.beneficiary_name && (
        <p className="text-xs text-gray-500 mt-1.5">
          To: {payment.beneficiary_name}
        </p>
      )}

      <div className="text-xs text-gray-400 mt-1.5">
        {payment.upi_id && <p>UPI: {maskUPI(payment.upi_id)}</p>}
        {payment.account_no && <p>A/C: {maskAccount(payment.account_no)}</p>}
      </div>

      {payment.next_due && days !== null && (
        <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          <span>Next: {formatShortDate(payment.next_due)}</span>
          <span className={cn(
            "ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full",
            days <= 3 ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-500"
          )}>
            {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days}d`}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-2.5">
        {payment.auto_approve ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
            <Zap className="h-3 w-3" /> Auto
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            <MessageCircle className="h-3 w-3" /> WhatsApp
          </span>
        )}
        <span className={cn(
          "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
          payment.is_active ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"
        )}>
          {payment.is_active ? "Active" : "Paused"}
        </span>
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#002E6E] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 transition-colors ml-auto"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </motion.div>
  );
}

// ---------- Add/Edit Modal ----------

function PaymentModal({
  open,
  onClose,
  onSave,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<RecurringPayment>) => void;
  existing?: RecurringPayment | null;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [category, setCategory] = useState("rent");
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [upiId, setUpiId] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setAmount(String(existing.amount));
      setFrequency(existing.frequency);
      setCategory(existing.category);
      setPaymentMethod(existing.payment_method);
      setUpiId(existing.upi_id || "");
      setAccountNo(existing.account_no || "");
      setIfscCode(existing.ifsc_code || "");
      setBeneficiaryName(existing.beneficiary_name || "");
      setNextDue(existing.next_due || "");
      setAutoApprove(existing.auto_approve);
      setNotes(existing.notes || "");
    } else {
      setName("");
      setAmount("");
      setFrequency("monthly");
      setCategory("rent");
      setPaymentMethod("upi");
      setUpiId("");
      setAccountNo("");
      setIfscCode("");
      setBeneficiaryName("");
      setNextDue("");
      setAutoApprove(false);
      setNotes("");
    }
  }, [existing, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      amount: parseFloat(amount),
      frequency,
      category,
      payment_method: paymentMethod,
      upi_id: paymentMethod === "upi" ? upiId : null,
      account_no: paymentMethod === "bank_transfer" ? accountNo : null,
      ifsc_code: paymentMethod === "bank_transfer" ? ifscCode : null,
      beneficiary_name: beneficiaryName,
      next_due: nextDue,
      auto_approve: autoApprove,
      notes: notes || null,
    });
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-50 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        >
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-bold text-[#002E6E]">
              {existing ? "Edit Payment" : "Add Recurring Payment"}
            </h3>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Monthly Rent, Salary - Raju"
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
              />
            </div>

            {/* Amount + Frequency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rs)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="15000"
                  required
                  min={1}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all",
                        category === key
                          ? "border-[#00BAF2] bg-[#00BAF2]/5 text-[#002E6E]"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      )}
                    >
                      <Icon className={cn("h-4 w-4", category === key ? cfg.color : "text-gray-400")} />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("upi")}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                    paymentMethod === "upi"
                      ? "border-[#00BAF2] bg-[#00BAF2]/5 text-[#002E6E]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  UPI
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("bank_transfer")}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm font-medium transition-all",
                    paymentMethod === "bank_transfer"
                      ? "border-[#00BAF2] bg-[#00BAF2]/5 text-[#002E6E]"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  Bank Transfer
                </button>
              </div>
            </div>

            {/* UPI ID or Bank Details */}
            {paymentMethod === "upi" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. ramesh@paytm"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={accountNo}
                    onChange={(e) => setAccountNo(e.target.value)}
                    placeholder="e.g. 1234567890"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value)}
                    placeholder="e.g. SBIN0001234"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
                  />
                </div>
              </div>
            )}

            {/* Beneficiary Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Beneficiary Name</label>
              <input
                type="text"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
              />
            </div>

            {/* Next Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Due Date</label>
              <input
                type="date"
                value={nextDue}
                onChange={(e) => setNextDue(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2]"
              />
            </div>

            {/* Auto-approve */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100">
              <button
                type="button"
                onClick={() => setAutoApprove(!autoApprove)}
                className="mt-0.5 shrink-0"
              >
                {autoApprove ? (
                  <ToggleRight className="h-6 w-6 text-violet-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-gray-300" />
                )}
              </button>
              <div>
                <p className="text-sm font-medium text-gray-900">Auto-approve payments</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {autoApprove
                    ? "Payment will go through automatically on due date. No WhatsApp confirmation needed."
                    : "You will receive a WhatsApp message to approve each payment before it is processed."}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 focus:border-[#00BAF2] resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl transition-all active:scale-[0.98]"
            >
              {existing ? "Update Payment" : "Create Recurring Payment"}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// ---------- Main Page ----------

export default function AutoPayPage() {
  const [payments, setPayments] = useState<RecurringPayment[]>(DEMO_PAYMENTS);
  const [history, setHistory] = useState<PaymentExecution[]>(DEMO_HISTORY);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);
  const [activeTab, setActiveTab] = useState<"upcoming" | "all" | "history">("upcoming");

  // Fetch from API on mount (fallback to demo data)
  useEffect(() => {
    async function fetchPayments() {
      try {
        const res = await fetch(`${API_BASE_URL}/recurring/${DEMO_MERCHANT_ID}`);
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) setPayments(data);
        }
      } catch {
        // Use demo data
      }
    }
    async function fetchHistory() {
      try {
        const res = await fetch(`${API_BASE_URL}/recurring/${DEMO_MERCHANT_ID}/history`);
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) setHistory(data);
        }
      } catch {
        // Use demo data
      }
    }
    fetchPayments();
    fetchHistory();
  }, []);

  // Compute upcoming payments (next 7 days)
  const upcoming = useMemo(() => {
    return payments
      .filter((p) => p.is_active && p.next_due)
      .map((p) => ({
        ...p,
        days_until_due: daysUntil(p.next_due!),
      }))
      .filter((p) => p.days_until_due >= 0 && p.days_until_due <= 7)
      .sort((a, b) => a.days_until_due - b.days_until_due);
  }, [payments]);

  // Summary stats
  const totalMonthly = useMemo(() => {
    return payments
      .filter((p) => p.is_active)
      .reduce((sum, p) => {
        const multiplier =
          p.frequency === "weekly" ? 4.33 :
          p.frequency === "biweekly" ? 2.17 :
          p.frequency === "quarterly" ? 0.33 : 1;
        return sum + p.amount * multiplier;
      }, 0);
  }, [payments]);

  const activeCount = payments.filter((p) => p.is_active).length;
  const paidThisMonth = history.filter((h) => h.status === "paid" && h.paid_at && h.paid_at.startsWith("2026-04")).length
    + history.filter((h) => h.status === "paid" && h.paid_at && h.paid_at.startsWith("2026-03")).length;

  // Handlers
  const handlePayNow = async (payment: RecurringPayment) => {
    try {
      await fetch(`${API_BASE_URL}/recurring/${payment.id}/execute`, { method: "POST" });
    } catch {
      // Demo mode
    }
    const newExecution: PaymentExecution = {
      id: `ex_${Date.now()}`,
      recurring_id: payment.id,
      recurring_name: payment.name,
      amount: payment.amount,
      status: payment.auto_approve ? "paid" : "pending_approval",
      scheduled_date: payment.next_due || new Date().toISOString().split("T")[0],
      approved_at: payment.auto_approve ? new Date().toISOString() : null,
      paid_at: payment.auto_approve ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
    };
    setHistory((prev) => [newExecution, ...prev]);

    if (payment.auto_approve) {
      // Advance due date
      setPayments((prev) =>
        prev.map((p) =>
          p.id === payment.id ? { ...p, next_due: advanceDue(p.next_due!, p.frequency) } : p
        )
      );
    }
  };

  const handleSkip = async (payment: RecurringPayment) => {
    try {
      await fetch(`${API_BASE_URL}/recurring/${payment.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });
    } catch {
      // Demo mode
    }
    const newExecution: PaymentExecution = {
      id: `ex_${Date.now()}`,
      recurring_id: payment.id,
      recurring_name: payment.name,
      amount: payment.amount,
      status: "skipped",
      scheduled_date: payment.next_due || new Date().toISOString().split("T")[0],
      approved_at: null,
      paid_at: null,
      created_at: new Date().toISOString(),
    };
    setHistory((prev) => [newExecution, ...prev]);
    setPayments((prev) =>
      prev.map((p) =>
        p.id === payment.id ? { ...p, next_due: advanceDue(p.next_due!, p.frequency) } : p
      )
    );
  };

  const handleSave = async (data: Partial<RecurringPayment>) => {
    if (editingPayment) {
      // Update
      setPayments((prev) =>
        prev.map((p) => (p.id === editingPayment.id ? { ...p, ...data } : p))
      );
      try {
        await fetch(`${API_BASE_URL}/recurring/${editingPayment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {}
    } else {
      // Create
      const newPayment: RecurringPayment = {
        id: `rec_${Date.now()}`,
        merchant_id: DEMO_MERCHANT_ID,
        name: data.name || "New Payment",
        amount: data.amount || 0,
        frequency: data.frequency || "monthly",
        category: data.category || "other",
        payment_method: data.payment_method || "upi",
        upi_id: data.upi_id || null,
        account_no: data.account_no || null,
        ifsc_code: data.ifsc_code || null,
        beneficiary_name: data.beneficiary_name || null,
        next_due: data.next_due || null,
        reminder_days_before: 1,
        auto_approve: data.auto_approve || false,
        is_active: true,
        notes: data.notes || null,
        created_at: new Date().toISOString(),
      };
      setPayments((prev) => [newPayment, ...prev]);
      try {
        await fetch(`${API_BASE_URL}/recurring/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, merchant_id: DEMO_MERCHANT_ID }),
        });
      } catch {}
    }
    setModalOpen(false);
    setEditingPayment(null);
  };

  const handleDelete = async (payment: RecurringPayment) => {
    setPayments((prev) => prev.map((p) => (p.id === payment.id ? { ...p, is_active: false } : p)));
    try {
      await fetch(`${API_BASE_URL}/recurring/${payment.id}`, { method: "DELETE" });
    } catch {}
  };

  const handleToggle = (payment: RecurringPayment) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, is_active: !p.is_active } : p))
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#002E6E] to-[#00BAF2] flex items-center justify-center shadow-lg shadow-[#00BAF2]/20">
              <RefreshCw className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#002E6E]">AutoPay</h1>
              <p className="text-sm text-gray-500">Automatic Recurring Payments</p>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Set up recurring payments for rent, salary, suppliers and more.
            Get WhatsApp confirmation before each payment.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingPayment(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl transition-all active:scale-[0.98] shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Payment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <IndianRupee className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Monthly Outflow</p>
              <p className="text-xl font-bold text-[#002E6E]">Rs {Math.round(totalMonthly).toLocaleString("en-IN")}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Active Payments</p>
              <p className="text-xl font-bold text-[#002E6E]">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Upcoming (7 days)</p>
              <p className="text-xl font-bold text-[#002E6E]">{upcoming.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Feature Banner */}
      <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-4 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
          <MessageCircle className="h-6 w-6 text-green-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">WhatsApp Approval Flow</p>
          <p className="text-xs text-green-600 mt-0.5">
            Before each payment, you get a WhatsApp message. Reply APPROVE to pay, SKIP to skip, or DELAY 3 to postpone by 3 days.
            Enable auto-approve for payments you trust completely.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {(["upcoming", "all", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-white text-[#002E6E] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab === "upcoming" ? `Upcoming (${upcoming.length})` :
             tab === "all" ? `All Payments (${payments.length})` :
             `History (${history.length})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "upcoming" && (
          <motion.div
            key="upcoming"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            {upcoming.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcoming.map((p) => (
                  <UpcomingCard
                    key={p.id}
                    payment={p}
                    onPayNow={() => handlePayNow(p)}
                    onSkip={() => handleSkip(p)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-medium">No payments due in the next 7 days</p>
                <p className="text-xs mt-1">Your upcoming payments will appear here</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === "all" && (
          <motion.div
            key="all"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {payments.map((p) => (
                <PaymentCard
                  key={p.id}
                  payment={p}
                  onEdit={() => {
                    setEditingPayment(p);
                    setModalOpen(true);
                  }}
                  onDelete={() => handleDelete(p)}
                  onToggle={() => handleToggle(p)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Payment</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Amount</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">Date</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map((ex) => (
                    <tr key={ex.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{ex.recurring_name}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-[#002E6E]">Rs {ex.amount.toLocaleString("en-IN")}</p>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-sm text-gray-500">{formatDate(ex.scheduled_date)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={ex.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No payment history yet</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <PaymentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPayment(null);
        }}
        onSave={handleSave}
        existing={editingPayment}
      />
    </div>
  );
}

// ---------- Utility ----------

function advanceDue(currentDue: string, frequency: string): string {
  const dt = new Date(currentDue);
  switch (frequency) {
    case "weekly":
      dt.setDate(dt.getDate() + 7);
      break;
    case "biweekly":
      dt.setDate(dt.getDate() + 14);
      break;
    case "monthly":
      dt.setMonth(dt.getMonth() + 1);
      break;
    case "quarterly":
      dt.setMonth(dt.getMonth() + 3);
      break;
  }
  return dt.toISOString().split("T")[0];
}
