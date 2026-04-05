"use client";

import { useEffect, useState, useCallback } from "react";
import { LivePnLCard } from "@/components/dashboard/LivePnLCard";
import { UdhariTracker, type UdhariEntry } from "@/components/dashboard/UdhariTracker";
import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { DashboardSkeleton } from "@/components/common/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { useDashboardState } from "@/hooks/useDashboardState";
import { DEMO_MERCHANT_ID, API_BASE_URL, formatINR, formatDate } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Send,
  Award,
  AlertTriangle,
  FileText,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  IndianRupee,
  ShieldCheck,
  Zap,
  RefreshCw,
  WifiOff,
  Plus,
  BookOpen,
  Bell,
  X,
  Package,
} from "lucide-react";
import Link from "next/link";

// ---- Types for API data ----
interface APIDashboardData {
  today_income: number;
  today_expense: number;
  today_profit: number;
  cash_income: number;
  upi_income: number;
  cash_expense: number;
  upi_expense: number;
  month_income: number;
  month_expense: number;
  month_profit: number;
  total_udhari: number;
  overdue_udhari: number;
  payscore: number;
  active_customers: number;
  recent_transactions: APITransaction[];
  alerts: APIAlert[];
  udhari_list?: APIUdhari[];
  events?: APIEvent[];
  forecast?: APIForecastDay[];
}

interface APITransaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  category?: string;
  customer_name?: string;
  payment_mode?: string;
  created_at: string;
}

interface APIAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: string;
}

interface APIUdhari {
  id: string;
  debtor_name: string;
  amount: number;
  amount_paid: number;
  status: "pending" | "partial" | "settled" | "overdue" | "written_off" | "paid";
  days_overdue: number;
  reminder_count: number;
}

interface APIEvent {
  id: string;
  event_type: string;
  title: string;
  title_hindi?: string;
  severity: string;
  created_at: string;
}

interface APIForecastDay {
  date: string;
  day: string;
  predicted_income: number;
  predicted_expense: number;
  net: number;
}

interface PnLCategoryItem {
  category: string;
  amount: number;
  pct: number;
}

interface PnLDailyTrend {
  date: string;
  income: number;
  expense: number;
  profit: number;
}

interface PnLTopCustomer {
  name: string;
  amount: number;
  txn_count: number;
}

interface PnLReport {
  period: string;
  period_type: string;
  total_income: number;
  total_expense: number;
  gross_profit: number;
  personal_withdrawals: number;
  business_profit: number;
  profit_margin: number;
  income_by_category: PnLCategoryItem[];
  expense_by_category: PnLCategoryItem[];
  daily_trend: PnLDailyTrend[];
  vs_previous: {
    income_change_pct: number;
    expense_change_pct: number;
    profit_change_pct: number;
    trend: string;
  };
  top_customers: PnLTopCustomer[];
  payment_modes: Record<string, { income: number; expense: number }>;
}

// ---- Sparkline component ----
function MiniSparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");

  return (
    <svg width={w} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// ---- Event type mappings ----
const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  income_added: TrendingUp,
  expense_added: TrendingDown,
  udhari_created: FileText,
  udhari_collected: CheckCircle,
  reminder_sent: Send,
  payscore_change: Award,
  alert: AlertTriangle,
  transaction: IndianRupee,
};

const SEVERITY_COLORS: Record<string, string> = {
  success: "text-emerald-500 bg-emerald-50",
  info: "text-blue-500 bg-blue-50",
  warning: "text-amber-500 bg-amber-50",
  critical: "text-red-500 bg-red-50",
};

// ---- Quick Actions Modal ----
function QuickActionModal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

// ---- Quick Action Form ----
function TransactionForm({
  type,
  onSubmit,
  loading,
}: {
  type: "income" | "expense" | "udhari";
  onSubmit: (data: { amount: string; description: string; customer?: string }) => void;
  loading: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [customer, setCustomer] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ amount, description, customer });
      }}
      className="space-y-3"
    >
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Amount (Rs)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={type === "udhari" ? "Kiske liye?" : "Kya tha?"}
          className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
          required
        />
      </div>
      {type === "udhari" && (
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">Customer Name</label>
          <input
            type="text"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="Customer ka naam"
            className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
            required
          />
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 rounded-xl bg-[#002E6E] text-white font-semibold text-sm hover:bg-[#003d8f] transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        {loading ? "Processing..." : type === "income" ? "Log Income" : type === "expense" ? "Log Expense" : "Create Udhari"}
      </button>
    </form>
  );
}

// ---- Main Dashboard ----
export default function Home() {
  const wsState = useDashboardState();
  const toast = useToast();

  // API-fetched state
  const [apiData, setApiData] = useState<APIDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<APIForecastDay[]>([]);
  const [pnlData, setPnlData] = useState<PnLReport | null>(null);
  const [pnlExpanded, setPnlExpanded] = useState(false);

  // UI state
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [activeModal, setActiveModal] = useState<"income" | "expense" | "udhari" | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showAllTx, setShowAllTx] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [txModeFilter, setTxModeFilter] = useState<"all" | "cash" | "upi">("all");

  const apiUrl = API_BASE_URL;

  // ---- Fetch dashboard data ----
  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const resp = await fetch(`${apiUrl}/api/dashboard/${DEMO_MERCHANT_ID}`);
      if (!resp.ok) throw new Error(`API returned ${resp.status}`);
      const data: APIDashboardData = await resp.json();
      setApiData(data);
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
      setError("Backend se connection nahi ho paya. Server check karein.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  // ---- Fetch forecast ----
  const fetchForecast = useCallback(async () => {
    try {
      const resp = await fetch(`${apiUrl}/api/forecast/${DEMO_MERCHANT_ID}`);
      if (!resp.ok) return;
      const data = await resp.json();
      // Handle both array and object responses
      if (Array.isArray(data)) {
        setForecastData(data);
      } else if (data?.daily_forecast) {
        setForecastData(data.daily_forecast);
      } else if (data?.data) {
        setForecastData(data.data);
      }
    } catch {
      // Forecast is optional — don't block UI
    }
  }, [apiUrl]);

  // ---- Fetch P&L report ----
  const fetchPnl = useCallback(async () => {
    try {
      const resp = await fetch(`${apiUrl}/api/dashboard/${DEMO_MERCHANT_ID}/pnl?period=month`);
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data.error) {
        setPnlData(data);
      }
    } catch {
      // P&L is optional — don't block UI
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchDashboard();
    fetchForecast();
    fetchPnl();
    // Auto-poll every 3 seconds to pick up changes from demo panel
    const interval = setInterval(fetchDashboard, 3000);
    return () => clearInterval(interval);
  }, [fetchDashboard, fetchForecast, fetchPnl]);

  // ---- Merge WebSocket updates with API data ----
  const todayIncome = wsState.todayIncome > 0 ? wsState.todayIncome : (apiData?.today_income ?? 0);
  const todayExpense = wsState.todayExpense > 0 ? wsState.todayExpense : (apiData?.today_expense ?? 0);
  const todayProfit = wsState.todayProfit !== 0 ? wsState.todayProfit : (apiData?.today_profit ?? 0);
  const profitMargin = todayIncome > 0 ? (todayProfit / todayIncome) * 100 : 0;
  const payScore = wsState.payScore?.score > 0 ? wsState.payScore.score : (apiData?.payscore ?? 0);
  const totalUdhari = wsState.totalUdhari > 0 ? wsState.totalUdhari : (apiData?.total_udhari ?? 0);
  const monthIncome = apiData?.month_income ?? 0;
  const monthExpense = apiData?.month_expense ?? 0;
  const monthProfit = apiData?.month_profit ?? 0;
  const monthMargin = monthIncome > 0 ? (monthProfit / monthIncome) * 100 : 0;

  // Udhari list: prefer WS state, fall back to API
  const udhariList: UdhariEntry[] =
    wsState.udhariList.length > 0
      ? wsState.udhariList.map((u) => ({
          id: u.id,
          debtor_name: u.customerName,
          amount: u.amount,
          amount_paid: u.originalAmount ? u.originalAmount - u.amount : 0,
          status: u.status === "paid" ? ("settled" as const) : u.status,
          days_overdue: u.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(u.dueDate).getTime()) / 86400000)) : 0,
          reminder_count: u.reminders?.length || 0,
        }))
      : (apiData?.udhari_list ?? []);

  // Events: prefer WS, fallback to API, then generate from recent transactions
  let events: APIEvent[] =
    wsState.events.length > 0
      ? wsState.events.map((e) => ({
          id: e.id,
          event_type: e.type,
          title: e.title,
          title_hindi: e.description,
          severity: e.type === "alert" ? "warning" : "info",
          created_at: e.timestamp,
        }))
      : (apiData?.events ?? []);

  // If no events, generate from recent transactions
  if (events.length === 0 && apiData?.recent_transactions) {
    events = apiData.recent_transactions.slice(0, 6).map((t: APITransaction, i: number) => ({
      id: `txn_${i}`,
      event_type: t.type === "income" ? "transaction" : "expense",
      title: `${t.type === "income" ? "+" : "-"}Rs ${(t.amount || 0).toLocaleString("en-IN")} ${t.category || ""}`,
      title_hindi: `${t.customer_name || ""} ${t.payment_mode === "upi" ? "UPI" : "Cash"}`,
      severity: t.type === "income" ? ("info" as const) : ("warning" as const),
      created_at: t.created_at || "",
    }));
  }

  // Alert on negative profit
  useEffect(() => {
    if (apiData && todayProfit < 0 && !alertVisible) {
      setAlertVisible(true);
      setAlertMessage(
        `Aaj ka expense income se zyada ho gaya! Profit: ${formatINR(todayProfit)}. Udhari reminders bhejein?`
      );
    }
  }, [todayProfit, alertVisible, apiData]);

  // Show WS events as toasts
  useEffect(() => {
    if (wsState.events.length > 0) {
      const latest = wsState.events[0];
      if (latest) {
        toast.info(latest.description || latest.title);
      }
    }
    // Only fire on new events, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsState.events.length]);

  // ---- Action handlers ----
  const handleRemind = useCallback(
    async (udhariId: string) => {
      try {
        await fetch(`${apiUrl}/api/udhari/${udhariId}/remind`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchant_id: DEMO_MERCHANT_ID }),
        });
        toast.success("Reminder bhej diya!");
      } catch {
        toast.error("Reminder bhejne mein error aaya");
      }
    },
    [apiUrl, toast]
  );

  const handleRemindAll = useCallback(async () => {
    try {
      await fetch(`${apiUrl}/api/udhari/remind-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: DEMO_MERCHANT_ID }),
      });
      setAlertVisible(false);
      toast.success("Sab ko reminder bhej diya!");
    } catch {
      toast.error("Remind all mein error aaya");
    }
  }, [apiUrl, toast]);

  const handleQuickAction = useCallback(
    async (data: { amount: string; description: string; customer?: string }) => {
      if (!activeModal) return;
      setFormLoading(true);
      try {
        if (activeModal === "udhari") {
          await fetch(`${apiUrl}/api/udhari/${DEMO_MERCHANT_ID}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customer_name: data.customer,
              amount: Number(data.amount),
              description: data.description,
            }),
          });
          toast.success(`${data.customer} ki ${formatINR(Number(data.amount))} udhari bana di`);
        } else {
          await fetch(`${apiUrl}/api/transactions/${DEMO_MERCHANT_ID}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: activeModal,
              amount: Number(data.amount),
              description: data.description,
              category: "general",
              payment_mode: "cash",
            }),
          });
          toast.success(
            activeModal === "income"
              ? `${formatINR(Number(data.amount))} income log kar di`
              : `${formatINR(Number(data.amount))} expense log kar diya`
          );
        }
        setActiveModal(null);
        // Refresh data
        fetchDashboard();
      } catch {
        toast.error("Action fail hua. Phir try karein.");
      } finally {
        setFormLoading(false);
      }
    },
    [activeModal, apiUrl, toast, fetchDashboard]
  );

  // ---- Animation variants ----
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const },
    }),
  };

  // ---- Stat cards config ----
  const statCards = [
    {
      label: "Today's Income",
      labelHindi: "Aaj ki kamaai",
      value: todayIncome,
      change: todayIncome > 0 ? "+12% kal se" : "--",
      changeType: "up" as const,
      icon: TrendingUp,
      color: "emerald",
      sparkData: [28000, 31000, 29500, 32000, 30000, 33500, todayIncome || 34500],
    },
    {
      label: "Today's Expense",
      labelHindi: "Aaj ka kharcha",
      value: todayExpense,
      change: todayExpense > 0 ? "-8% kal se" : "--",
      changeType: "down" as const,
      icon: TrendingDown,
      color: "red",
      sparkData: [15000, 13500, 14200, 11800, 13000, 12800, todayExpense || 12400],
    },
    {
      label: "Net Profit",
      labelHindi: "Shuddh munafa",
      value: todayProfit,
      change: todayProfit !== 0 ? (todayProfit > 0 ? "+23% kal se" : "Loss") : "--",
      changeType: todayProfit >= 0 ? ("up" as const) : ("down" as const),
      icon: Wallet,
      color: todayProfit >= 0 ? "blue" : "red",
      sparkData: [13000, 17500, 15300, 20200, 17000, 20700, todayProfit || 22100],
    },
    {
      label: "PayScore",
      labelHindi: "Credit health",
      value: payScore,
      change: payScore > 0 ? "+2" : "--",
      changeType: "up" as const,
      icon: ShieldCheck,
      color: "violet",
      sparkData: [68, 69, 70, 71, 71, 73, payScore || 74],
      isScore: true,
    },
  ];

  const colorMap: Record<string, { bg: string; iconBg: string; icon: string; change: string; spark: string; border: string }> = {
    emerald: { bg: "bg-white", iconBg: "bg-emerald-50", icon: "text-emerald-500", change: "text-emerald-600 bg-emerald-50", spark: "#22C55E", border: "hover:border-emerald-200" },
    red: { bg: "bg-white", iconBg: "bg-red-50", icon: "text-red-500", change: "text-red-600 bg-red-50", spark: "#EF4444", border: "hover:border-red-200" },
    blue: { bg: "bg-white", iconBg: "bg-blue-50", icon: "text-[#002E6E]", change: "text-blue-600 bg-blue-50", spark: "#002E6E", border: "hover:border-blue-200" },
    violet: { bg: "bg-white", iconBg: "bg-violet-50", icon: "text-violet-500", change: "text-violet-600 bg-violet-50", spark: "#7C3AED", border: "hover:border-violet-200" },
  };

  // ---- Forecast chart data ----
  const chartData =
    forecastData.length > 0
      ? forecastData.slice(0, 30).map((d) => ({
          name: d.day || new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" }),
          income: d.predicted_income,
          expense: d.predicted_expense,
          net: d.net ?? d.predicted_income - d.predicted_expense,
        }))
      : [
          { name: "Mon", income: 38000, expense: 22000, net: 16000 },
          { name: "Tue", income: 42000, expense: 18000, net: 24000 },
          { name: "Wed", income: 35000, expense: 28000, net: 7000 },
          { name: "Thu", income: 48000, expense: 20000, net: 28000 },
          { name: "Fri", income: 52000, expense: 24000, net: 28000 },
          { name: "Sat", income: 60000, expense: 30000, net: 30000 },
          { name: "Sun", income: 25000, expense: 15000, net: 10000 },
        ];

  // ======== RENDER ========

  // Loading state
  if (loading) {
    return <DashboardSkeleton />;
  }

  // Error state
  if (error && !apiData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg border border-red-100 p-8 max-w-md mx-4 text-center"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 mx-auto mb-4">
            <WifiOff className="h-8 w-8 text-red-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Connection Error</h3>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              fetchDashboard();
              fetchForecast();
            }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#002E6E] text-white font-semibold text-sm hover:bg-[#003d8f] transition-colors shadow-lg shadow-[#002E6E]/20"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Alert Banner */}
        <AnimatePresence>
          {alertVisible && (
            <motion.div
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -60, opacity: 0 }}
              className="bg-red-50 border-b border-red-200 px-6 py-3 lg:px-8"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <p className="flex-1 text-sm font-medium text-red-800">{alertMessage}</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleRemindAll}
                    className="text-xs font-semibold text-white bg-red-500 px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Haan, bhej do
                  </button>
                  <button
                    onClick={() => setAlertVisible(false)}
                    className="text-xs font-semibold text-red-700 bg-red-100 px-4 py-2 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

            {/* Greeting Section */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div>
                <h2 className="text-2xl font-bold text-[#002E6E] tracking-tight">
                  Namaste Sunita ji!
                </h2>
                <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>{formatDate(new Date())}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-500">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[11px] font-medium">
                      {wsState.isConnected ? "Real-time" : "Offline"}
                    </span>
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLoading(true);
                    fetchDashboard();
                    fetchForecast();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-500 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setActiveModal("expense")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Quick Entry
                </button>
                <button
                  onClick={() => setActiveModal("income")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#002E6E] text-sm font-medium text-white hover:bg-[#003d8f] shadow-lg shadow-[#002E6E]/20 transition-all hover:shadow-[#002E6E]/30"
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                  New Transaction
                </button>
              </div>
            </motion.div>

            {/* Quick Actions Bar */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mb-2">
              {[
                { label: "Log Income", icon: Plus, color: "emerald", modal: "income" as const },
                { label: "Log Expense", icon: TrendingDown, color: "red", modal: "expense" as const },
                { label: "Create Udhari", icon: BookOpen, color: "blue", modal: "udhari" as const },
                { label: "Send Reminders", icon: Bell, color: "amber", action: handleRemindAll },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => {
                      if (action.modal) setActiveModal(action.modal);
                      else if (action.action) action.action();
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-100 text-sm font-medium text-gray-600 hover:shadow-sm hover:border-gray-200 transition-all whitespace-nowrap shrink-0"
                  >
                    <Icon className={`h-3.5 w-3.5 text-${action.color}-500`} />
                    {action.label}
                  </button>
                );
              })}
            </div>

            {/* Top Row: 4 Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statCards.map((stat, i) => {
                const colors = colorMap[stat.color];
                if (!colors) return null;
                const Icon = stat.icon;
                return (
                  <motion.div
                    key={stat.label}
                    custom={i}
                    initial="hidden"
                    animate="visible"
                    variants={cardVariants}
                    className={`${colors.bg} rounded-2xl border border-gray-100 ${colors.border} p-5 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer group`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.iconBg} group-hover:scale-110 transition-transform`}>
                        <Icon className={`h-5 w-5 ${colors.icon}`} />
                      </div>
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold ${colors.change}`}>
                        {stat.changeType === "up" ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {stat.change}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium mb-0.5">{stat.labelHindi}</p>
                        {stat.isScore ? (
                          <span className="text-3xl font-bold text-gray-900 tabular-nums">{stat.value}</span>
                        ) : (
                          <AnimatedNumber
                            value={stat.value}
                            flashColor={stat.color === "red" ? "red" : "green"}
                            className="text-2xl font-bold text-gray-900 block"
                          />
                        )}
                        <p className="text-xs text-gray-400 mt-1 font-medium">{stat.label}</p>
                        {stat.label === "Today's Income" && apiData && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            <span className="text-emerald-600">Cash: {formatINR(apiData.cash_income ?? 0)}</span>
                            <span className="mx-1">|</span>
                            <span className="text-blue-600">UPI: {formatINR(apiData.upi_income ?? 0)}</span>
                          </p>
                        )}
                        {stat.label === "Today's Expense" && apiData && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            <span className="text-red-600">Cash: {formatINR(apiData.cash_expense ?? 0)}</span>
                            <span className="mx-1">|</span>
                            <span className="text-blue-600">UPI: {formatINR(apiData.upi_expense ?? 0)}</span>
                          </p>
                        )}
                      </div>
                      <MiniSparkline data={stat.sparkData} color={colors.spark} />
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Morning Briefing Card */}
            <motion.div
              custom={4.5}
              initial="hidden"
              animate="visible"
              variants={cardVariants}
              className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-2xl shadow-sm border border-violet-100 hover:shadow-md transition-all p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 shrink-0">
                    <Bell className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Morning Briefing</h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Aaj ka snapshot</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 bg-violet-100 px-2.5 py-1 rounded-full">
                  <Clock className="h-3 w-3" />
                  Sent via WhatsApp at 9:00 AM
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                  <p className="text-[10px] text-gray-400 font-medium">Income</p>
                  <p className="text-lg font-bold text-emerald-600">{formatINR(todayIncome)}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                  <p className="text-[10px] text-gray-400 font-medium">Expense</p>
                  <p className="text-lg font-bold text-red-500">{formatINR(todayExpense)}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                  <p className="text-[10px] text-gray-400 font-medium">Net Profit</p>
                  <p className={`text-lg font-bold ${todayProfit >= 0 ? "text-blue-600" : "text-red-500"}`}>{formatINR(todayProfit)}</p>
                </div>
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                  <p className="text-[10px] text-gray-400 font-medium">Pending Udhari</p>
                  <p className="text-lg font-bold text-amber-600">{formatINR(totalUdhari)}</p>
                  <p className="text-[9px] text-gray-400">{apiData?.overdue_udhari ?? 0} overdue</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-violet-100/50">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-violet-400" />
                  <span>PayScore: <strong className="text-violet-600">{payScore}/100</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <FileText className="h-3.5 w-3.5 text-amber-400" />
                  <span>GST: <strong className="text-amber-600">GSTR-3B due Apr 20</strong></span>
                </div>
              </div>
            </motion.div>

            {/* Middle Row: Live P&L + Cash Flow Forecast */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Live P&L Card */}
              <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants}>
                <LivePnLCard
                  todayIncome={todayIncome}
                  todayExpense={todayExpense}
                  todayProfit={todayProfit}
                  profitMargin={profitMargin}
                  monthlyIncome={monthIncome}
                  monthlyExpense={monthExpense}
                  monthlyProfit={monthProfit}
                  monthlyMargin={monthMargin}
                />
              </motion.div>

              {/* Cash Flow Forecast — Recharts AreaChart */}
              <motion.div
                custom={5}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Cash Flow Forecast</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {forecastData.length > 0 ? `Next ${forecastData.length} days prediction` : "7-day prediction"}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    {todayProfit >= 0 ? "Healthy" : "Watch"}
                  </span>
                </div>

                <div className="h-44 -mx-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #E5E7EB",
                          borderRadius: "12px",
                          fontSize: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                        }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => formatINR(Number(value))}
                      />
                      <Area
                        type="monotone"
                        dataKey="income"
                        stroke="#22C55E"
                        strokeWidth={2}
                        fill="url(#incomeGrad)"
                        name="Income"
                      />
                      <Area
                        type="monotone"
                        dataKey="expense"
                        stroke="#EF4444"
                        strokeWidth={2}
                        fill="url(#expenseGrad)"
                        name="Expense"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                      <span className="text-xs text-gray-500">Income</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-sm bg-red-400" />
                      <span className="text-xs text-gray-500">Expense</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#00BAF2] cursor-pointer hover:underline">
                    View Full Forecast
                  </span>
                </div>
              </motion.div>
            </div>

            {/* Monthly P&L Report -- Expandable Section */}
            {pnlData && (
              <motion.div
                custom={5.5}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all"
              >
                {/* Header -- always visible, click to expand */}
                <button
                  onClick={() => setPnlExpanded(!pnlExpanded)}
                  className="w-full flex items-center justify-between p-5 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 shrink-0">
                      <FileText className="h-5 w-5 text-[#002E6E]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">
                        Monthly P&L &mdash; {pnlData.period}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Profit: {formatINR(pnlData.business_profit)} | Margin: {pnlData.profit_margin}%
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                        pnlData.vs_previous.trend === "improving"
                          ? "bg-emerald-50 text-emerald-600"
                          : pnlData.vs_previous.trend === "declining"
                          ? "bg-red-50 text-red-600"
                          : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      {pnlData.vs_previous.trend === "improving" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : pnlData.vs_previous.trend === "declining" ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : null}
                      {pnlData.vs_previous.trend === "improving"
                        ? "Improving"
                        : pnlData.vs_previous.trend === "declining"
                        ? "Declining"
                        : "Stable"}
                    </span>
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform ${pnlExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expandable body */}
                <AnimatePresence>
                  {pnlExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 space-y-5">
                        {/* Summary Bar */}
                        <div className="space-y-3">
                          {/* Income bar */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-600">Income</span>
                              <span className="text-xs font-bold text-emerald-600">{formatINR(pnlData.total_income)}</span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                            </div>
                          </div>
                          {/* Expense bar */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-gray-600">Expense</span>
                              <span className="text-xs font-bold text-red-500">{formatINR(pnlData.total_expense)}</span>
                            </div>
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full"
                                style={{
                                  width: `${pnlData.total_income > 0 ? Math.min((pnlData.total_expense / pnlData.total_income) * 100, 100) : 0}%`,
                                }}
                              />
                            </div>
                          </div>
                          {/* Personal bar */}
                          {pnlData.personal_withdrawals > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-600">Personal</span>
                                <span className="text-xs font-bold text-gray-500">{formatINR(pnlData.personal_withdrawals)}</span>
                              </div>
                              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gray-400 rounded-full"
                                  style={{
                                    width: `${pnlData.total_income > 0 ? Math.min((pnlData.personal_withdrawals / pnlData.total_income) * 100, 100) : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          {/* Divider + Profit */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                            <span className="text-sm font-bold text-gray-900">Business Profit</span>
                            <div className="text-right">
                              <span className={`text-lg font-bold ${pnlData.business_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                {formatINR(pnlData.business_profit)}
                              </span>
                              <span className="text-xs text-gray-400 ml-2">Margin: {pnlData.profit_margin}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Two-column: Income by Category | Expense by Category */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Income by Category */}
                          <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
                            <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                              Income by Category
                            </h4>
                            <div className="space-y-2.5">
                              {pnlData.income_by_category.map((cat) => (
                                <div key={cat.category}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-gray-600 capitalize">{cat.category}</span>
                                    <span className="text-xs font-semibold text-emerald-700">{formatINR(cat.amount)}</span>
                                  </div>
                                  <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-emerald-500 rounded-full transition-all"
                                      style={{ width: `${cat.pct}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-0.5">{cat.pct}%</p>
                                </div>
                              ))}
                              {pnlData.income_by_category.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-2">No income data</p>
                              )}
                            </div>
                          </div>

                          {/* Expense by Category */}
                          <div className="bg-red-50/50 rounded-xl p-4 border border-red-100">
                            <h4 className="text-xs font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                              Expense by Category
                            </h4>
                            <div className="space-y-2.5">
                              {pnlData.expense_by_category.map((cat) => (
                                <div key={cat.category}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-gray-600 capitalize">{cat.category}</span>
                                    <span className="text-xs font-semibold text-red-600">{formatINR(cat.amount)}</span>
                                  </div>
                                  <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-red-500 rounded-full transition-all"
                                      style={{ width: `${cat.pct}%` }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-gray-400 mt-0.5">{cat.pct}%</p>
                                </div>
                              ))}
                              {pnlData.expense_by_category.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-2">No expense data</p>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Bottom row: Comparison, Top Customer, Payment Modes */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {/* vs Previous Period */}
                          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-2">vs Last Period</p>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Income</span>
                                <span className={`text-xs font-bold ${pnlData.vs_previous.income_change_pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {pnlData.vs_previous.income_change_pct >= 0 ? "+" : ""}{pnlData.vs_previous.income_change_pct}%
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Expense</span>
                                <span className={`text-xs font-bold ${pnlData.vs_previous.expense_change_pct <= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {pnlData.vs_previous.expense_change_pct >= 0 ? "+" : ""}{pnlData.vs_previous.expense_change_pct}%
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">Profit</span>
                                <span className={`text-xs font-bold ${pnlData.vs_previous.profit_change_pct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                  {pnlData.vs_previous.profit_change_pct >= 0 ? "+" : ""}{pnlData.vs_previous.profit_change_pct}%
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Top Customer */}
                          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-2">Top Customer</p>
                            {pnlData.top_customers.length > 0 ? (
                              <div>
                                <p className="text-sm font-bold text-gray-900">{pnlData.top_customers[0].name}</p>
                                <p className="text-xs text-emerald-600 font-semibold">{formatINR(pnlData.top_customers[0].amount)}</p>
                                <p className="text-[10px] text-gray-400">{pnlData.top_customers[0].txn_count} transactions</p>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400">No customer data</p>
                            )}
                          </div>

                          {/* Payment Mode Split */}
                          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-2">Payment Modes</p>
                            <div className="space-y-1.5">
                              {Object.entries(pnlData.payment_modes).map(([mode, vals]) => (
                                <div key={mode} className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500 capitalize">{mode}</span>
                                  <span className="text-xs font-semibold text-gray-700">
                                    {formatINR(vals.income)}
                                  </span>
                                </div>
                              ))}
                              {Object.keys(pnlData.payment_modes).length === 0 && (
                                <p className="text-xs text-gray-400">No data</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Bottom Row: 4 Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Udhari Tracker */}
              <motion.div custom={6} initial="hidden" animate="visible" variants={cardVariants}>
                <UdhariTracker
                  entries={udhariList}
                  totalPending={totalUdhari}
                  onRemind={handleRemind}
                  onRemindAll={handleRemindAll}
                  maxDisplay={4}
                />
              </motion.div>

              {/* Activity Feed */}
              <motion.div
                custom={7}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Activity Feed</h3>
                  <span className="text-xs text-[#00BAF2] font-medium cursor-pointer hover:underline">
                    View All
                  </span>
                </div>
                <div className="space-y-3">
                  {events.length === 0 ? (
                    <div className="text-center py-6">
                      <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No recent activity</p>
                    </div>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {events.slice(0, 6).map((event) => {
                        const Icon = EVENT_ICONS[event.event_type] || Clock;
                        const colorClass = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.info;
                        return (
                          <motion.div
                            key={event.id}
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex items-start gap-3 group cursor-pointer rounded-lg p-1.5 -m-1.5 hover:bg-gray-50 transition-colors"
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-700 truncate">
                                {event.title_hindi || event.title}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                {new Date(event.created_at).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                              </p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>
              </motion.div>

              {/* Recent Transactions */}
              <motion.div
                custom={8}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <IndianRupee className="h-3 w-3" />
                    <span>Today</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {(apiData?.recent_transactions ?? []).length === 0 ? (
                    <div className="text-center py-6">
                      <IndianRupee className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No transactions yet</p>
                    </div>
                  ) : (
                    (apiData?.recent_transactions ?? []).slice(0, 5).map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 group cursor-pointer rounded-lg p-1.5 -m-1.5 hover:bg-gray-50 transition-colors">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                          tx.type === "income" ? "bg-emerald-500" : "bg-red-500"
                        }`}>
                          {tx.type === "income" ? "+" : "-"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {tx.description || tx.category || tx.type}
                            </span>
                            {tx.payment_mode && (
                              <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${
                                tx.payment_mode.toLowerCase() === "cash"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-blue-700"
                              }`}>
                                {tx.payment_mode.toLowerCase() === "cash" ? "\uD83D\uDCB5" : "\uD83D\uDCF1"} {tx.payment_mode}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400">
                            {tx.customer_name && <span className="text-gray-500 font-medium">{tx.customer_name}</span>}
                            {tx.customer_name && tx.created_at && " - "}
                            {tx.created_at && new Date(tx.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-bold ${tx.type === "income" ? "text-emerald-600" : "text-red-500"}`}>
                            {tx.type === "income" ? "+" : "-"}{formatINR(tx.amount)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {(apiData?.recent_transactions ?? []).length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => setShowAllTx(true)}
                      className="w-full text-center text-xs font-medium text-[#00BAF2] hover:underline"
                    >
                      View All Transactions ({(apiData?.recent_transactions ?? []).length})
                    </button>
                  </div>
                )}
              </motion.div>

              {/* Vendor Payables Widget */}
              <motion.div
                custom={9}
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Vendor Payables</h3>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50">
                    <Package className="h-4 w-4 text-orange-500" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Total Payable</p>
                    <p className="text-xl font-bold text-[#002E6E] mt-0.5">{formatINR(apiData?.today_expense ? 222000 : 222000)}</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Overdue</p>
                    <p className="text-xl font-bold text-red-600 mt-0.5">{formatINR(apiData?.today_expense ? 72000 : 72000)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">3 vendors with overdue</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <Link
                    href="/vendors"
                    className="flex items-center justify-center gap-1.5 w-full text-xs font-medium text-[#00BAF2] hover:underline"
                  >
                    View Vendor Ledger
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </motion.div>
            </div>

      {/* ===== Full Transaction History Modal ===== */}
      <AnimatePresence>
        {showAllTx && (() => {
          const allTx = apiData?.recent_transactions ?? [];
          const now = new Date();
          const todayStr = now.toDateString();
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toDateString();
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);

          const filteredTx = allTx.filter((tx) => {
            if (txTypeFilter !== "all" && tx.type !== txTypeFilter) return false;
            if (txModeFilter !== "all" && tx.payment_mode?.toLowerCase() !== txModeFilter) return false;
            if (txSearch.trim()) {
              const q = txSearch.toLowerCase();
              const matchDesc = (tx.description || "").toLowerCase().includes(q);
              const matchCustomer = (tx.customer_name || "").toLowerCase().includes(q);
              if (!matchDesc && !matchCustomer) return false;
            }
            return true;
          });

          const grouped: { label: string; txs: APITransaction[] }[] = [];
          const todayTx = filteredTx.filter((t) => new Date(t.created_at).toDateString() === todayStr);
          const yesterdayTx = filteredTx.filter((t) => new Date(t.created_at).toDateString() === yesterdayStr);
          const weekTx = filteredTx.filter((t) => {
            const d = new Date(t.created_at);
            return d >= weekAgo && d.toDateString() !== todayStr && d.toDateString() !== yesterdayStr;
          });
          const olderTx = filteredTx.filter((t) => new Date(t.created_at) < weekAgo);

          if (todayTx.length > 0) grouped.push({ label: "Today", txs: todayTx });
          if (yesterdayTx.length > 0) grouped.push({ label: "Yesterday", txs: yesterdayTx });
          if (weekTx.length > 0) grouped.push({ label: "This Week", txs: weekTx });
          if (olderTx.length > 0) grouped.push({ label: "Older", txs: olderTx });

          const totalIncome = filteredTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
          const totalExpense = filteredTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

          return (
            <motion.div
              key="tx-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowAllTx(false)}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="absolute inset-0 top-8 bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">All Transactions</h3>
                    <p className="text-xs text-gray-400">{filteredTx.length} transactions</p>
                  </div>
                  <button
                    onClick={() => setShowAllTx(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Filters */}
                <div className="px-5 py-3 space-y-2 border-b border-gray-50 shrink-0">
                  {/* Search */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by description or customer..."
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                    />
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {/* Filter pills */}
                  <div className="flex gap-2 flex-wrap">
                    {(["all", "income", "expense"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTxTypeFilter(t)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          txTypeFilter === t
                            ? "bg-[#002E6E] text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {t === "all" ? "All Types" : t === "income" ? "Income" : "Expense"}
                      </button>
                    ))}
                    <span className="w-px bg-gray-200 mx-1" />
                    {(["all", "cash", "upi"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setTxModeFilter(m)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          txModeFilter === m
                            ? "bg-[#002E6E] text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {m === "all" ? "All Modes" : m === "cash" ? "\uD83D\uDCB5 Cash" : "\uD83D\uDCF1 UPI"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scrollable Transaction List */}
                <div className="flex-1 overflow-y-auto px-5 py-3">
                  {grouped.length === 0 ? (
                    <div className="text-center py-12">
                      <IndianRupee className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">No transactions match your filters</p>
                    </div>
                  ) : (
                    grouped.map((group) => (
                      <div key={group.label} className="mb-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                          {group.label}
                        </p>
                        <div className="space-y-2">
                          {group.txs.map((tx) => (
                            <div
                              key={tx.id}
                              className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                              <div
                                className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                                  tx.type === "income" ? "bg-emerald-500" : "bg-red-500"
                                }`}
                              >
                                {tx.type === "income" ? "\u2191" : "\u2193"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {tx.description || tx.category || tx.type}
                                  </span>
                                  {tx.payment_mode && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 ${
                                        tx.payment_mode.toLowerCase() === "cash"
                                          ? "bg-amber-50 text-amber-700"
                                          : "bg-blue-50 text-blue-700"
                                      }`}
                                    >
                                      {tx.payment_mode.toLowerCase() === "cash" ? "\uD83D\uDCB5" : "\uD83D\uDCF1"}{" "}
                                      {tx.payment_mode}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                                  {tx.customer_name && (
                                    <span className="text-gray-500 font-medium">{tx.customer_name}</span>
                                  )}
                                  {tx.created_at && (
                                    <span>
                                      {new Date(tx.created_at).toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span
                                className={`text-sm font-bold shrink-0 ${
                                  tx.type === "income" ? "text-emerald-600" : "text-red-500"
                                }`}
                              >
                                {tx.type === "income" ? "+" : "-"}
                                {formatINR(tx.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Total Footer */}
                <div className="px-5 py-3 border-t border-gray-100 shrink-0 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      <div>
                        <p className="text-[10px] text-gray-400">Income</p>
                        <p className="text-sm font-bold text-emerald-600">+{formatINR(totalIncome)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400">Expense</p>
                        <p className="text-sm font-bold text-red-500">-{formatINR(totalExpense)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400">Net</p>
                      <p className={`text-sm font-bold ${totalIncome - totalExpense >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {formatINR(totalIncome - totalExpense)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Quick Action Modals */}
      <AnimatePresence>
        {activeModal === "income" && (
          <QuickActionModal open={true} onClose={() => setActiveModal(null)} title="Log Income">
            <TransactionForm type="income" onSubmit={handleQuickAction} loading={formLoading} />
          </QuickActionModal>
        )}
        {activeModal === "expense" && (
          <QuickActionModal open={true} onClose={() => setActiveModal(null)} title="Log Expense">
            <TransactionForm type="expense" onSubmit={handleQuickAction} loading={formLoading} />
          </QuickActionModal>
        )}
        {activeModal === "udhari" && (
          <QuickActionModal open={true} onClose={() => setActiveModal(null)} title="Create Udhari">
            <TransactionForm type="udhari" onSubmit={handleQuickAction} loading={formLoading} />
          </QuickActionModal>
        )}
      </AnimatePresence>
    </div>
  );
}
