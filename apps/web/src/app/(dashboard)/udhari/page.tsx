"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common/Skeleton";
import {
  Search,
  Send,
  CheckCircle,
  AlertTriangle,
  Clock,
  Users,
  TrendingUp,
  Calendar,
  Bell,
  Filter,
  ChevronDown,
  ChevronUp,
  Phone,
  RefreshCw,
} from "lucide-react";

// ---------- Types ----------
type UdhariStatus = "pending" | "overdue" | "settled" | "partial";

interface UdhariEntry {
  id: string;
  debtor_name: string;
  phone: string;
  amount: number;
  amount_paid: number;
  status: UdhariStatus;
  days_overdue: number;
  reminder_count: number;
  risk_score: number; // 0-100
  created_at: string;
  last_reminder?: string;
  items?: string;
}

// ---------- Demo Data (35 entries) ----------
const NAMES = [
  "Tripathi ji", "Mehra ji", "Sharma ji", "Gupta ji", "Patel ji",
  "Verma ji", "Singh ji", "Yadav ji", "Mishra ji", "Agarwal ji",
  "Chauhan ji", "Tiwari ji", "Pandey ji", "Joshi ji", "Saxena ji",
  "Dubey ji", "Rawat ji", "Negi ji", "Bhatia ji", "Kapoor ji",
  "Malhotra ji", "Khanna ji", "Arora ji", "Soni ji", "Bansal ji",
  "Goyal ji", "Mehta ji", "Thakur ji", "Rathi ji", "Khandelwal ji",
  "Rathore ji", "Srivastava ji", "Dwivedi ji", "Bhardwaj ji", "Chaube ji",
];

function generateUdhariData(): UdhariEntry[] {
  return NAMES.map((name, i) => {
    const statuses: UdhariStatus[] = ["pending", "overdue", "settled", "partial"];
    const status = i < 8 ? "overdue" : i < 18 ? "pending" : i < 25 ? "partial" : "settled";
    const amount = Math.round((3000 + Math.random() * 22000) / 100) * 100;
    const amountPaid = status === "settled" ? amount : status === "partial" ? Math.round(amount * (0.2 + Math.random() * 0.5) / 100) * 100 : 0;
    const daysOverdue = status === "overdue" ? Math.floor(15 + Math.random() * 75) : status === "pending" ? Math.floor(Math.random() * 14) : 0;
    const riskScore = status === "overdue" ? Math.floor(60 + Math.random() * 40) : status === "pending" ? Math.floor(20 + Math.random() * 40) : status === "partial" ? Math.floor(30 + Math.random() * 30) : 0;

    return {
      id: `udh_${i + 1}`,
      debtor_name: name,
      phone: `+91 98${Math.floor(10000000 + Math.random() * 89999999)}`,
      amount,
      amount_paid: amountPaid,
      status,
      days_overdue: daysOverdue,
      reminder_count: status === "settled" ? 0 : Math.floor(Math.random() * 6),
      risk_score: riskScore,
      created_at: new Date(Date.now() - (daysOverdue + Math.random() * 30) * 86400000).toISOString(),
      last_reminder: status !== "settled" && Math.random() > 0.3 ? new Date(Date.now() - Math.random() * 7 * 86400000).toISOString() : undefined,
      items: ["Saree", "Suit material", "Blouse piece", "Dupatta", "Lehenga"][Math.floor(Math.random() * 5)],
    };
  });
}

const UDHARI_FALLBACK = generateUdhariData();

type TabType = "all" | "pending" | "overdue" | "settled";

const TAB_OPTIONS: { id: TabType; label: string; hindiLabel: string }[] = [
  { id: "all", label: "All", hindiLabel: "सभी" },
  { id: "pending", label: "Pending", hindiLabel: "बाकी" },
  { id: "overdue", label: "Overdue", hindiLabel: "लेट" },
  { id: "settled", label: "Settled", hindiLabel: "चुकता" },
];

function getRiskColor(score: number) {
  if (score >= 70) return "text-red-600 bg-red-50";
  if (score >= 40) return "text-amber-600 bg-amber-50";
  return "text-emerald-600 bg-emerald-50";
}

function getStatusBadge(status: UdhariStatus) {
  const map: Record<UdhariStatus, { label: string; className: string }> = {
    overdue: { label: "Overdue", className: "bg-red-100 text-red-700" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-700" },
    partial: { label: "Partial", className: "bg-blue-100 text-blue-700" },
    settled: { label: "Settled", className: "bg-emerald-100 text-emerald-700" },
  };
  return map[status];
}

export default function UdhariPage() {
  const [tab, setTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [data, setData] = useState<UdhariEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);

  const fetchUdhari = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/udhari/${DEMO_MERCHANT_ID}/ranked`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: UdhariEntry[] = (Array.isArray(json) ? json : json.entries ?? json.data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        debtor_name: d.debtor_name as string,
        phone: d.phone as string,
        amount: d.amount as number,
        amount_paid: d.amount_paid as number,
        status: d.status as UdhariStatus,
        days_overdue: d.days_overdue as number,
        reminder_count: d.reminder_count as number,
        risk_score: d.risk_score as number,
        created_at: d.created_at as string,
        last_reminder: d.last_reminder as string | undefined,
        items: d.items as string | undefined,
      }));
      setData(list);
    } catch (err) {
      console.error("Udhari fetch failed, using fallback:", err);
      setFetchError((err as Error).message);
      setData(UDHARI_FALLBACK);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUdhari(); }, []);

  const filtered = useMemo(() => {
    let list = data;
    if (tab !== "all") {
      list = list.filter((e) => e.status === tab || (tab === "pending" && e.status === "partial"));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.debtor_name.toLowerCase().includes(q));
    }
    return list;
  }, [data, tab, search]);

  // Summary stats
  const totalPending = data.filter((e) => e.status !== "settled").reduce((s, e) => s + (e.amount - e.amount_paid), 0);
  const recoveryRate = Math.round((data.filter((e) => e.status === "settled").length / data.length) * 100);
  const avgDays = Math.round(data.filter((e) => e.days_overdue > 0).reduce((s, e) => s + e.days_overdue, 0) / Math.max(1, data.filter((e) => e.days_overdue > 0).length));
  const overdueCount = data.filter((e) => e.status === "overdue").length;

  const [remindToast, setRemindToast] = useState<{ name: string; message: string } | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const handleRemind = async (id: string) => {
    const entry = data.find((e) => e.id === id);
    setRemindingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/udhari/${id}/remind`, { method: "POST" });
      let responseMessage = "";
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        responseMessage = json.message || json.whatsapp_message || `Payment reminder of ${formatINR(entry?.amount ?? 0 - (entry?.amount_paid ?? 0))} sent.`;
      }
      setRemindToast({
        name: entry?.debtor_name || "Customer",
        message: responseMessage || `Reminder sent for ${formatINR((entry?.amount ?? 0) - (entry?.amount_paid ?? 0))}`,
      });
      setTimeout(() => setRemindToast(null), 4000);
    } catch {
      setRemindToast({
        name: entry?.debtor_name || "Customer",
        message: "Reminder saved locally (API unavailable)",
      });
      setTimeout(() => setRemindToast(null), 4000);
    }
    setData((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, reminder_count: e.reminder_count + 1, last_reminder: new Date().toISOString() } : e
      )
    );
    setRemindingId(null);
  };

  const handleSettle = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/udhari/${id}/settle`, { method: "PATCH" });
    } catch { /* fallback to local update */ }
    setData((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: "settled" as UdhariStatus, amount_paid: e.amount, days_overdue: 0 } : e
      )
    );
  };

  const handleRemindAll = async () => {
    setRemindingAll(true);
    const overdueIds = data.filter((e) => e.status === "overdue").map((e) => e.id);
    try {
      await Promise.allSettled(overdueIds.map((id) =>
        fetch(`${API_BASE_URL}/api/udhari/${id}/remind`, { method: "POST" })
      ));
    } catch { /* fallback */ }
    setData((prev) =>
      prev.map((e) =>
        e.status === "overdue" ? { ...e, reminder_count: e.reminder_count + 1, last_reminder: new Date().toISOString() } : e
      )
    );
    setRemindingAll(false);
  };

  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-4 w-full">
        <div>
          <Skeleton className="h-7 w-40 mb-1" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-10" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-4 w-full">
      {/* Error banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-red-700">API unavailable, showing demo data</p>
          <button onClick={fetchUdhari} className="text-xs font-semibold text-red-700 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-munim-primary-dark">
            Udhari Khata
          </h1>
          <p className="text-sm text-munim-text-secondary">
            Track & collect pending payments
          </p>
        </div>
        {overdueCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleRemindAll}
            disabled={remindingAll}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
              remindingAll
                ? "bg-gray-100 text-gray-400"
                : "bg-red-500 text-white active:bg-red-600"
            )}
          >
            <Bell className="w-3.5 h-3.5" />
            {remindingAll ? "Sending..." : `Remind All (${overdueCount})`}
          </motion.button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3"
        >
          <div className="flex items-center gap-1 mb-1">
            <Users className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] text-gray-500">Total Pending</span>
          </div>
          <p className="text-sm font-bold text-gray-900">{formatINR(totalPending)}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3"
        >
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] text-gray-500">Recovery Rate</span>
          </div>
          <p className="text-sm font-bold text-emerald-600">{recoveryRate}%</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3"
        >
          <div className="flex items-center gap-1 mb-1">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] text-gray-500">Avg Days</span>
          </div>
          <p className="text-sm font-bold text-gray-900">{avgDays} days</p>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {TAB_OPTIONS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 py-2 rounded-lg text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-white text-munim-primary-dark shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
            <span className="block text-[9px] text-gray-400">{t.hindiLabel}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-munim-primary/20 focus:border-munim-primary"
        />
      </div>

      {/* Results Count */}
      <p className="text-xs text-gray-400 px-1">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"} found
      </p>

      {/* Debtor Cards */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((entry, i) => {
            const isExpanded = expandedId === entry.id;
            const badge = getStatusBadge(entry.status);
            const riskColor = getRiskColor(entry.risk_score);
            const remaining = entry.amount - entry.amount_paid;

            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Main Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left"
                >
                  {/* Avatar */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                    entry.status === "overdue" ? "bg-red-100 text-red-700" :
                    entry.status === "settled" ? "bg-emerald-100 text-emerald-700" :
                    "bg-blue-100 text-blue-700"
                  )}>
                    {entry.debtor_name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {entry.debtor_name}
                      </span>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md", badge.className)}>
                        {badge.label}
                      </span>
                      {entry.risk_score > 0 && (
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                          entry.risk_score >= 70 ? "bg-red-50 text-red-700" :
                          entry.risk_score >= 40 ? "bg-amber-50 text-amber-700" :
                          "bg-emerald-50 text-emerald-700"
                        )}>
                          {entry.risk_score >= 70 ? "\uD83D\uDD34 High Risk" : entry.risk_score >= 40 ? "\uD83D\uDFE1 Medium" : "\uD83D\uDFE2 Low"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">
                        {formatINR(remaining)} baaki
                      </span>
                      {entry.days_overdue > 0 && (
                        <span className="text-[10px] text-red-500">
                          {entry.days_overdue}d overdue
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {entry.risk_score > 0 && (
                      <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", riskColor)}>
                        {entry.risk_score}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-gray-400">Total Amount</span>
                            <p className="font-semibold text-gray-900">{formatINR(entry.amount)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Paid</span>
                            <p className="font-semibold text-emerald-600">{formatINR(entry.amount_paid)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Reminders Sent</span>
                            <p className="font-semibold text-gray-900">{entry.reminder_count}</p>
                            {entry.last_reminder && (
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                Last: {new Date(entry.last_reminder).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                {" "}
                                {new Date(entry.last_reminder).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                              </p>
                            )}
                          </div>
                          <div>
                            <span className="text-gray-400">Items</span>
                            <p className="font-semibold text-gray-900">{entry.items || "N/A"}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Phone</span>
                            <p className="font-semibold text-gray-900">{entry.phone}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Risk Score</span>
                            <p className={cn("font-bold", entry.risk_score >= 70 ? "text-red-600" : entry.risk_score >= 40 ? "text-amber-600" : "text-emerald-600")}>
                              {entry.risk_score}/100
                            </p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        {entry.amount_paid > 0 && (
                          <div>
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                              <span>Payment progress</span>
                              <span>{Math.round((entry.amount_paid / entry.amount) * 100)}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${(entry.amount_paid / entry.amount) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        {entry.status !== "settled" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRemind(entry.id)}
                              disabled={remindingId === entry.id}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-xl active:bg-emerald-700 disabled:opacity-50 disabled:cursor-wait"
                            >
                              {remindingId === entry.id ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <span className="text-sm">{"\uD83D\uDCF1"}</span>
                                  <Send className="w-3.5 h-3.5" />
                                  WhatsApp Remind
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleSettle(entry.id)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-500 text-white text-xs font-semibold rounded-xl active:bg-emerald-600"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Mark Settled
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No entries found</p>
        </div>
      )}

      {/* Remind Success Toast */}
      <AnimatePresence>
        {remindToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto z-50"
          >
            <div className="bg-emerald-600 text-white rounded-xl shadow-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">
                    WhatsApp reminder sent to {remindToast.name}!
                  </p>
                  <p className="text-xs text-emerald-100 mt-0.5 truncate">
                    {remindToast.message}
                  </p>
                </div>
                <button
                  onClick={() => setRemindToast(null)}
                  className="text-white/60 hover:text-white shrink-0"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
