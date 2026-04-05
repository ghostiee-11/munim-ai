"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common/Skeleton";
import {
  Users,
  IndianRupee,
  Calendar,
  CheckCircle,
  Clock,
  Wallet,
  UserCircle,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  FileText,
  Send,
  X,
  Download,
} from "lucide-react";

// ---------- Types ----------
interface Employee {
  id: string;
  name: string;
  role: string;
  roleHindi: string;
  salary: number;
  lastPaidDate: string;
  attendanceThisMonth: number;
  totalWorkingDays: number;
  phone: string;
  joinedDate: string;
  upiId: string;
}

// ---------- Demo Data ----------
const EMPLOYEES: Employee[] = [
  {
    id: "emp_1",
    name: "Ramesh Kumar",
    role: "Shop Assistant",
    roleHindi: "दुकान सहायक",
    salary: 12000,
    lastPaidDate: "2026-03-01",
    attendanceThisMonth: 24,
    totalWorkingDays: getWorkingDaysInMonth(),
    phone: "+91 9876543210",
    joinedDate: "2024-06-15",
    upiId: "ramesh@paytm",
  },
  {
    id: "emp_2",
    name: "Priya Sharma",
    role: "Tailor",
    roleHindi: "दर्ज़ी",
    salary: 15000,
    lastPaidDate: "2026-03-01",
    attendanceThisMonth: 22,
    totalWorkingDays: getWorkingDaysInMonth(),
    phone: "+91 9812345678",
    joinedDate: "2023-11-01",
    upiId: "priya.s@paytm",
  },
  {
    id: "emp_3",
    name: "Raju Yadav",
    role: "Delivery Boy",
    roleHindi: "डिलीवरी बॉय",
    salary: 8000,
    lastPaidDate: "2026-03-01",
    attendanceThisMonth: 20,
    totalWorkingDays: getWorkingDaysInMonth(),
    phone: "+91 9998877665",
    joinedDate: "2025-01-10",
    upiId: "raju.y@paytm",
  },
];

const EMPLOYEES_FALLBACK = EMPLOYEES;

function getWorkingDaysInMonth(year?: number, month?: number): number {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth(); // 0-indexed
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let working = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(y, m, d).getDay();
    if (day !== 0) working++; // Exclude Sundays
  }
  return working;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [showPayConfirm, setShowPayConfirm] = useState<Employee | null>(null);
  // Payroll summary
  const [payrollSummary, setPayrollSummary] = useState<any>(null);
  // Payslip modal
  const [payslipEmployee, setPayslipEmployee] = useState<Employee | null>(null);
  const [payslipSending, setPayslipSending] = useState(false);
  const [payslipSent, setPayslipSent] = useState(false);
  // Overtime modal
  const [otEmployee, setOtEmployee] = useState<Employee | null>(null);
  const [otMode, setOtMode] = useState<"hours" | "days">("hours");
  const [otValue, setOtValue] = useState(0);
  const [otResult, setOtResult] = useState<any>(null);
  const [otSaving, setOtSaving] = useState(false);

  const fetchPayrollSummary = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/employees/payroll-summary/${DEMO_MERCHANT_ID}`);
      if (res.ok) setPayrollSummary(await res.json());
    } catch {}
  };

  const fetchEmployees = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/employees/${DEMO_MERCHANT_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: Employee[] = (Array.isArray(json) ? json : json.data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        name: d.name as string,
        role: d.role as string,
        roleHindi: (d.roleHindi ?? d.role_hindi ?? "") as string,
        salary: d.salary as number,
        lastPaidDate: (d.lastPaidDate ?? d.last_paid_date ?? "") as string,
        attendanceThisMonth: (d.attendanceThisMonth ?? d.attendance_this_month ?? 0) as number,
        totalWorkingDays: Number(d.totalWorkingDays ?? d.total_working_days ?? 0) || getWorkingDaysInMonth(),
        phone: d.phone as string,
        joinedDate: (d.joinedDate ?? d.joined_date ?? "") as string,
        upiId: (d.upiId ?? d.upi_id ?? "") as string,
      }));
      setEmployees(list);
    } catch (err) {
      console.error("Employees fetch failed, using fallback:", err);
      setFetchError((err as Error).message);
      setEmployees(EMPLOYEES_FALLBACK);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); fetchPayrollSummary(); }, []);

  const totalPayroll = employees.reduce((s, e) => s + e.salary, 0);
  const paidThisMonth = employees.filter((e) => paidIds.has(e.id)).reduce((s, e) => s + e.salary, 0);
  const pending = totalPayroll - paidThisMonth;

  const handlePay = (emp: Employee) => {
    setShowPayConfirm(emp);
  };

  const confirmPay = (emp: Employee) => {
    setPayingId(emp.id);
    // Fire API call
    fetch(`${API_BASE_URL}/api/employees/${emp.id}/pay`, { method: "POST" }).catch(() => {});
    setTimeout(() => {
      setPaidIds((prev) => new Set(prev).add(emp.id));
      setPayingId(null);
      setShowPayConfirm(null);
      setEmployees((prev) =>
        prev.map((e) =>
          e.id === emp.id ? { ...e, lastPaidDate: new Date().toISOString().split("T")[0] } : e
        )
      );
    }, 2000);
  };

  const adjustAttendance = async (id: string, delta: number) => {
    const emp = employees.find(e => e.id === id);
    if (!emp) return;
    const newVal = Math.max(0, Math.min(emp.totalWorkingDays, emp.attendanceThisMonth + delta));
    // Optimistic update
    setEmployees((prev) => prev.map((e) => e.id === id ? { ...e, attendanceThisMonth: newVal } : e));
    // Persist to backend
    try {
      await fetch(`${API_BASE_URL}/api/employees/${id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: delta > 0 ? "present" : "absent", date: new Date().toISOString().slice(0, 10) }),
      });
    } catch {}
  };

  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-5 w-full">
        <div>
          <Skeleton className="h-7 w-44 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-32 w-full rounded-2xl" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-5 w-full">
      {/* Error banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-red-700">API unavailable, showing demo data</p>
          <button onClick={fetchEmployees} className="text-xs font-semibold text-red-700 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-munim-primary-dark">
          Employee Payments
        </h1>
        <p className="text-sm text-munim-text-secondary">
          Salary disbursement & attendance
        </p>
      </div>

      {/* Payroll Summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-[#002E6E] to-[#0052B4] rounded-2xl p-5 text-white"
      >
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-5 h-5 text-blue-300" />
          <span className="text-sm font-medium text-blue-200">
            Monthly Payroll - April 2026
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-blue-300">Total</p>
            <p className="text-lg font-bold">{formatINR(totalPayroll)}</p>
          </div>
          <div>
            <p className="text-[10px] text-emerald-300">Paid</p>
            <p className="text-lg font-bold text-emerald-400">{formatINR(paidThisMonth)}</p>
          </div>
          <div>
            <p className="text-[10px] text-amber-300">Pending</p>
            <p className="text-lg font-bold text-amber-400">{formatINR(pending)}</p>
          </div>
        </div>
        {/* Progress */}
        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: totalPayroll > 0 ? `${(paidThisMonth / totalPayroll) * 100}%` : "0%" }}
            className="h-full bg-emerald-400 rounded-full"
            transition={{ duration: 0.5 }}
          />
        </div>
        <p className="text-[10px] text-blue-300 mt-1">
          {employees.length} employees | {paidIds.size} paid this month
        </p>
      </motion.div>

      {/* AI Payroll Insights */}
      {payrollSummary && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">AI Payroll Insights</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="bg-blue-50 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-blue-600">Monthly Payroll</p>
              <p className="text-sm font-bold text-blue-900">{formatINR(payrollSummary.total_monthly_salary || 0)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-emerald-600">% of Revenue</p>
              <p className="text-sm font-bold text-emerald-900">{payrollSummary.payroll_pct_of_revenue || 0}%</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2.5 text-center">
              <p className="text-[10px] text-amber-600">YTD Spent</p>
              <p className="text-sm font-bold text-amber-900">{formatINR(payrollSummary.total_ytd || 0)}</p>
            </div>
          </div>
          {payrollSummary.insight_hi && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
              <p className="text-xs text-orange-800 leading-relaxed">{payrollSummary.insight_hi}</p>
            </div>
          )}
          {payrollSummary.pending_payments?.filter((p: any) => p.days_overdue > 28).length > 0 && (
            <div className="mt-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-700">Pending Salaries:</p>
              {payrollSummary.pending_payments.filter((p: any) => p.days_overdue > 28).map((p: any, i: number) => (
                <p key={i} className="text-xs text-red-600">{p.name} - {p.days_overdue} days overdue</p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Employee Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {employees.map((emp, i) => {
          const isPaid = paidIds.has(emp.id);
          const isPaying = payingId === emp.id;
          const attendancePercent = Math.round((emp.attendanceThisMonth / emp.totalWorkingDays) * 100);

          return (
            <motion.div
              key={emp.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="p-4">
                {/* Top Row */}
                <div className="flex items-start gap-3 mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold",
                    isPaid ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                  )}>
                    {emp.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{emp.name}</h3>
                      {isPaid && (
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <CheckCircle className="w-2.5 h-2.5" />
                          Paid
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{emp.role} ({emp.roleHindi})</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatINR(emp.salary)}</p>
                    <p className="text-[10px] text-gray-400">/month</p>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-1 mb-1">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400">Last Paid</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900">
                      {new Date(emp.lastPaidDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-1 mb-1">
                      <UserCircle className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400">UPI ID</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900 truncate">{emp.upiId}</p>
                  </div>
                </div>

                {/* Attendance */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">Attendance</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => adjustAttendance(emp.id, -1)}
                        className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
                      >
                        <Minus className="w-3 h-3 text-gray-500" />
                      </button>
                      <span className="text-xs font-bold text-gray-900 w-16 text-center">
                        {emp.attendanceThisMonth}/{emp.totalWorkingDays} days
                      </span>
                      <button
                        onClick={() => adjustAttendance(emp.id, 1)}
                        className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
                      >
                        <Plus className="w-3 h-3 text-gray-500" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        attendancePercent >= 90 ? "bg-emerald-500" :
                        attendancePercent >= 70 ? "bg-amber-500" : "bg-red-500"
                      )}
                      style={{ width: `${attendancePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-gray-400">{attendancePercent}% attendance</span>
                    <span className="text-[10px] text-gray-400">
                      Pro-rata: {formatINR(Math.round((emp.salary / emp.totalWorkingDays) * emp.attendanceThisMonth))}
                    </span>
                  </div>
                </div>

                {/* Pay Button */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    {!isPaid ? (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handlePay(emp)}
                        disabled={isPaying}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors",
                          isPaying
                            ? "bg-gray-100 text-gray-400"
                            : "bg-munim-primary text-white active:bg-munim-primary/90"
                        )}
                      >
                        {isPaying ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <IndianRupee className="w-4 h-4" />
                            Pay Salary - {formatINR(emp.salary)}
                          </>
                        )}
                      </motion.button>
                    ) : (
                      <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-emerald-50 text-emerald-700">
                        <CheckCircle className="w-4 h-4" />
                        Salary Paid for April
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => { setOtEmployee(emp); setOtValue(0); setOtResult(null); setOtMode("hours"); }}
                    className="px-3 py-2 text-xs font-medium text-amber-600 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors flex items-center gap-1"
                  >
                    <Clock className="w-3 h-3" />
                    OT
                  </button>
                  <button
                    onClick={() => { setPayslipEmployee(emp); setPayslipSent(false); }}
                    className="px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3" />
                    Payslip
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pay Confirmation Modal */}
      <AnimatePresence>
        {showPayConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => !payingId && setShowPayConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl"
            >
              <h3 className="font-bold text-lg text-gray-900 mb-4">Confirm Payment</h3>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Employee</span>
                  <span className="font-semibold">{showPayConfirm.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold text-gray-900">{formatINR(showPayConfirm.salary)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">UPI ID</span>
                  <span className="font-semibold">{showPayConfirm.upiId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Attendance</span>
                  <span className="font-semibold">{showPayConfirm.attendanceThisMonth}/{showPayConfirm.totalWorkingDays} days</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPayConfirm(null)}
                  disabled={!!payingId}
                  className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={() => confirmPay(showPayConfirm)}
                  disabled={!!payingId}
                  className="flex-1 py-3 bg-emerald-500 text-white font-semibold rounded-xl active:bg-emerald-600"
                >
                  {payingId ? "Sending..." : "Pay Now"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overtime Modal */}
      <AnimatePresence>
        {otEmployee && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setOtEmployee(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <h3 className="font-semibold text-gray-900">Add Overtime</h3>
                </div>
                <button onClick={() => setOtEmployee(null)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-sm font-semibold text-gray-900">{otEmployee.name}</p>
                  <p className="text-xs text-gray-500">{otEmployee.role} | Base: {formatINR(otEmployee.salary)}</p>
                </div>

                {/* Hours / Days toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button
                    onClick={() => { setOtMode("hours"); setOtValue(0); }}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-medium transition-colors",
                      otMode === "hours" ? "bg-white text-amber-700 shadow-sm" : "text-gray-500"
                    )}
                  >
                    Hours
                  </button>
                  <button
                    onClick={() => { setOtMode("days"); setOtValue(0); }}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-medium transition-colors",
                      otMode === "days" ? "bg-white text-amber-700 shadow-sm" : "text-gray-500"
                    )}
                  >
                    Days
                  </button>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    Overtime {otMode === "hours" ? "Hours" : "Days"}
                  </label>
                  <input
                    type="number"
                    value={otValue || ""}
                    onChange={(e) => setOtValue(Number(e.target.value))}
                    min={otMode === "hours" ? 0.5 : 0.5}
                    step={0.5}
                    placeholder={otMode === "hours" ? "e.g. 3" : "e.g. 1"}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                  />
                </div>

                {otValue > 0 && (() => {
                  const otHoursCalc = otMode === "days" ? otValue * 8 : otValue;
                  const hrRate = otEmployee.salary / (otEmployee.totalWorkingDays * 8);
                  const otRate = hrRate * 1.5;
                  const otAmt = Math.round(otHoursCalc * otRate);
                  return (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                      {otMode === "days" && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600">Days to Hours</span>
                          <span className="font-semibold text-gray-900">{otValue} day = {otHoursCalc}h</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Daily Rate</span>
                        <span className="font-semibold text-gray-900">{formatINR(Math.round(otEmployee.salary / otEmployee.totalWorkingDays))}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">OT Rate (1.5x)</span>
                        <span className="font-semibold text-amber-700">{formatINR(Math.round(otRate))}/hr</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1 border-t border-amber-200">
                        <span className="font-semibold text-gray-900">OT Amount</span>
                        <span className="font-bold text-amber-700">{formatINR(otAmt)}</span>
                      </div>
                    </div>
                  );
                })()}

                {otResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-semibold text-emerald-700">
                      {otResult.hours}h OT added. Total: {otResult.total_ot_hours}h = {formatINR(otResult.total_ot_amount)}
                    </p>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => setOtEmployee(null)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
                >
                  {otResult ? "Done" : "Cancel"}
                </button>
                {!otResult && (
                  <button
                    onClick={async () => {
                      if (otValue <= 0) return;
                      const hoursToSend = otMode === "days" ? otValue * 8 : otValue;
                      setOtSaving(true);
                      try {
                        const res = await fetch(`${API_BASE_URL}/api/employees/${otEmployee.id}/overtime`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ hours: hoursToSend }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setOtResult(data);
                        }
                      } catch {}
                      setOtSaving(false);
                    }}
                    disabled={otSaving || otValue <= 0}
                    className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50"
                  >
                    {otSaving ? "Saving..." : "Add Overtime"}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payslip Preview Modal */}
      <AnimatePresence>
        {payslipEmployee && (() => {
          const emp = payslipEmployee;
          const workingDays = emp.totalWorkingDays || 26;
          const proRata = Math.round((emp.salary / workingDays) * emp.attendanceThisMonth);
          const monthName = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
              onClick={() => setPayslipEmployee(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-[#002E6E] to-[#0052B4] px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-200" />
                    <span className="font-semibold text-white">Salary Slip</span>
                  </div>
                  <button onClick={() => setPayslipEmployee(null)} className="text-blue-200 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Payslip Content */}
                <div className="p-5 space-y-4">
                  {/* Employee Info */}
                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                      <p className="text-xs text-gray-500">{emp.role} | {monthName}</p>
                    </div>
                  </div>

                  {/* Salary Breakdown */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Salary Breakdown</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">Base Salary</span>
                        <span className="text-sm font-semibold text-gray-900">{formatINR(emp.salary)}</span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">Working Days</span>
                        <span className="text-sm font-semibold text-gray-900">{workingDays} days</span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">Days Worked</span>
                        <span className={cn("text-sm font-semibold", emp.attendanceThisMonth < workingDays ? "text-amber-600" : "text-emerald-600")}>
                          {emp.attendanceThisMonth} days
                        </span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5">
                        <span className="text-sm text-gray-600">Attendance</span>
                        <span className="text-sm font-semibold text-gray-900">{Math.round(emp.attendanceThisMonth / workingDays * 100)}%</span>
                      </div>
                      <div className="flex justify-between px-4 py-2.5 bg-blue-50">
                        <span className="text-sm text-gray-600">Pro-rata Amount</span>
                        <span className="text-sm font-semibold text-blue-700">{formatINR(proRata)}</span>
                      </div>
                      {(() => {
                        const otHrs = 0; // Will be fetched from API in future
                        const hrRate = emp.salary / (workingDays * 8);
                        const otAmt = Math.round(otHrs * hrRate * 1.5);
                        const netTotal = proRata + otAmt;
                        return (
                          <>
                            {otHrs > 0 && (
                              <div className="flex justify-between px-4 py-2.5 bg-amber-50">
                                <span className="text-sm text-gray-600">Overtime ({otHrs}h x 1.5x)</span>
                                <span className="text-sm font-semibold text-amber-700">+ {formatINR(otAmt)}</span>
                              </div>
                            )}
                            <div className="flex justify-between px-4 py-3 bg-gradient-to-r from-[#002E6E] to-[#0052B4]">
                              <span className="text-sm font-semibold text-white">Net Payable</span>
                              <span className="text-lg font-bold text-white">{formatINR(netTotal)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {emp.upiId && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-2">
                      <Wallet className="w-3.5 h-3.5" />
                      UPI: {emp.upiId}
                    </div>
                  )}

                  {/* Success Message */}
                  {payslipSent && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-700">Payslip sent to {emp.phone || "WhatsApp"}</p>
                    </motion.div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
                  <button
                    onClick={() => {
                      const w = window.open("", "_blank");
                      if (!w) return;
                      w.document.write(`<html><head><title>Payslip - ${emp.name}</title>
                        <style>body{font-family:Arial;padding:40px;color:#333}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:10px;border-bottom:1px solid #eee}.total{background:#002E6E;color:white;font-weight:bold}.header{text-align:center;margin-bottom:30px}.header h2{color:#002E6E;margin:0}</style></head><body>
                        <div class="header"><h2>Salary Slip - ${monthName}</h2><p>MunimAI Payroll</p></div>
                        <table><tr><td><b>Employee</b></td><td>${emp.name}</td></tr><tr><td><b>Role</b></td><td>${emp.role}</td></tr><tr><td><b>Base Salary</b></td><td>Rs ${emp.salary.toLocaleString("en-IN")}</td></tr><tr><td><b>Working Days</b></td><td>${workingDays}</td></tr><tr><td><b>Days Worked</b></td><td>${emp.attendanceThisMonth}</td></tr><tr><td><b>Attendance</b></td><td>${Math.round(emp.attendanceThisMonth / workingDays * 100)}%</td></tr><tr><td><b>Pro-rata</b></td><td>Rs ${proRata.toLocaleString("en-IN")}</td></tr><tr class="total"><td>Net Payable</td><td>Rs ${proRata.toLocaleString("en-IN")}</td></tr></table>
                        <p style="text-align:center;color:#999;margin-top:40px;font-size:12px">Generated by MunimAI on ${new Date().toLocaleDateString("en-IN")}</p></body></html>`);
                      w.document.close();
                      w.print();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Print / PDF
                  </button>
                  <button
                    onClick={async () => {
                      setPayslipSending(true);
                      try {
                        await fetch(`${API_BASE_URL}/api/employees/${emp.id}/send-payslip`, { method: "POST" });
                        setPayslipSent(true);
                      } catch {}
                      setPayslipSending(false);
                    }}
                    disabled={payslipSending || payslipSent}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                      payslipSent
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                    )}
                  >
                    <Send className="w-4 h-4" />
                    {payslipSending ? "Sending..." : payslipSent ? "Sent!" : "Send via WhatsApp"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
