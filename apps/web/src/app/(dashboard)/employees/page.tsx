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
    totalWorkingDays: 26,
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
    totalWorkingDays: 26,
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
    totalWorkingDays: 26,
    phone: "+91 9998877665",
    joinedDate: "2025-01-10",
    upiId: "raju.y@paytm",
  },
];

const EMPLOYEES_FALLBACK = EMPLOYEES;

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [showPayConfirm, setShowPayConfirm] = useState<Employee | null>(null);

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
        totalWorkingDays: (d.totalWorkingDays ?? d.total_working_days ?? 26) as number,
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

  useEffect(() => { fetchEmployees(); }, []);

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

  const adjustAttendance = (id: string, delta: number) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, attendanceThisMonth: Math.max(0, Math.min(e.totalWorkingDays, e.attendanceThisMonth + delta)) }
          : e
      )
    );
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
    </div>
  );
}
