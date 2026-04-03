"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CashFlowChart, {
  type CashFlowDataPoint,
} from "@/components/charts/CashFlowChart";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common/Skeleton";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  PartyPopper,
  IndianRupee,
  Calendar,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  PiggyBank,
  Star,
  Package,
  Users,
  BarChart3,
  Zap,
} from "lucide-react";

// ---------- Types for API response ----------
interface ApiFestival {
  date: string;
  name: string;
  name_hi: string;
  impact_pct: number;
  category: string;
  expected_boost: number;
}

interface ApiRecommendation {
  type: string;
  text_hi: string;
  impact: number;
}

interface ApiForecastDay {
  date: string;
  predicted_income: number;
  predicted_expense: number;
  predicted_net: number;
  is_festival: boolean;
  festival_name?: string | null;
  festival_name_hi?: string | null;
  impact_pct: number;
}

interface ApiForecastResponse {
  merchant_id: string;
  period: string;
  predicted_income: number;
  predicted_expense: number;
  predicted_profit: number;
  confidence: number;
  daily_forecast: ApiForecastDay[];
  upcoming_festivals: ApiFestival[];
  cash_crunch_days: string[];
  recommendations: ApiRecommendation[];
  model_version: string;
}

// ---------- Fallback Demo Forecast Data (90 days) ----------

const INDIAN_FESTIVALS_FALLBACK: Array<{
  date: string;
  name: string;
  name_hi: string;
  impact_pct: number;
  category: string;
}> = [
  { date: "2026-04-06", name: "Ram Navami", name_hi: "राम नवमी", impact_pct: 60, category: "religious" },
  { date: "2026-04-14", name: "Baisakhi", name_hi: "बैसाखी", impact_pct: 40, category: "harvest" },
  { date: "2026-04-21", name: "Mahavir Jayanti", name_hi: "महावीर जयंती", impact_pct: 15, category: "religious" },
  { date: "2026-04-26", name: "Akshaya Tritiya", name_hi: "अक्षय तृतीया", impact_pct: 80, category: "shopping" },
  { date: "2026-05-12", name: "Buddha Purnima", name_hi: "बुद्ध पूर्णिमा", impact_pct: 15, category: "religious" },
  { date: "2026-05-25", name: "Eid ul-Fitr", name_hi: "ईद उल-फ़ित्र", impact_pct: 50, category: "religious" },
  { date: "2026-06-23", name: "Rath Yatra", name_hi: "रथ यात्रा", impact_pct: 30, category: "religious" },
];

function generateFallbackForecastData(): {
  daily: CashFlowDataPoint[];
  festivals: ApiFestival[];
  crunchDays: string[];
  recommendations: ApiRecommendation[];
} {
  const data: CashFlowDataPoint[] = [];
  const today = new Date();
  const avgIncome = 28000;
  const avgExpense = 18000;

  // Build festival lookup
  const festivalLookup: Record<string, (typeof INDIAN_FESTIVALS_FALLBACK)[0]> = {};
  for (const f of INDIAN_FESTIVALS_FALLBACK) {
    festivalLookup[f.date] = f;
  }

  const crunchDays: string[] = [];

  for (let i = 1; i <= 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const weekday = d.getDay(); // 0=Sun

    let dayIncome = avgIncome;
    let dayExpense = avgExpense;

    // Weekend effect
    if (weekday === 0) {
      dayIncome *= 0.8;
      dayExpense *= 0.85;
    } else if (weekday === 6) {
      dayIncome *= 1.1;
    }

    const fest = festivalLookup[dateStr];
    const isFestival = !!fest;
    let festivalName: string | undefined;
    let impactPct = 0;

    if (fest) {
      festivalName = fest.name;
      impactPct = fest.impact_pct;
      dayIncome *= (1 + impactPct / 100);
      dayExpense *= (1 + impactPct / 300);
    }

    // Add slight variation
    dayIncome += Math.sin(i * 0.15) * 3000;
    dayExpense += Math.cos(i * 0.1) * 2000;

    dayIncome = Math.round(dayIncome);
    dayExpense = Math.round(dayExpense);
    const net = dayIncome - dayExpense;
    const margin = Math.round(Math.abs(net) * 0.25);

    if (dayExpense > dayIncome) {
      crunchDays.push(dateStr);
    }

    data.push({
      date: dateStr,
      predicted_income: dayIncome,
      predicted_expense: dayExpense,
      predicted_net: net,
      confidence_upper: net + margin + 3000,
      confidence_lower: net - margin - 3000,
      is_festival: isFestival,
      festival_name: festivalName,
      is_crisis: dayExpense > dayIncome,
    });
  }

  const festivals: ApiFestival[] = INDIAN_FESTIVALS_FALLBACK
    .filter((f) => f.date >= today.toISOString().split("T")[0])
    .map((f) => ({
      date: f.date,
      name: f.name,
      name_hi: f.name_hi,
      impact_pct: f.impact_pct,
      category: f.category,
      expected_boost: Math.round(avgIncome * f.impact_pct / 100),
    }));

  const recommendations: ApiRecommendation[] = [
    {
      type: "festival_prep",
      text_hi: "Ram Navami (6 April) ke liye stock taiyaar karein. 60% zyada bikri expected.",
      impact: 16800,
    },
    {
      type: "festival_prep",
      text_hi: "Akshaya Tritiya (26 April) ke liye gold jewelry aur silk stock badhayein. 80% zyada bikri expected.",
      impact: 22400,
    },
    {
      type: "cash_crunch",
      text_hi: "Kuch dinon mein kharcha income se zyada hoga. Reserve rakhein.",
      impact: 0,
    },
    {
      type: "savings",
      text_hi: "Har mahine Rs 3,00,000 bacha sakte hain. FD ya mutual fund mein daalein.",
      impact: 300000,
    },
  ];

  return { daily: data, festivals, crunchDays, recommendations };
}

// ---------- What-If Scenarios ----------
interface Scenario {
  id: string;
  title: string;
  titleHindi: string;
  icon: typeof Users;
  currentLabel: string;
  currentValue: string;
  newLabel: string;
  newValue: string;
  changeLabel: string;
  impactLabel: string;
  impactValue: string;
  impactColor: string;
  verdict: string;
  verdictEn: string;
}

const PREBUILT_SCENARIOS: Scenario[] = [
  {
    id: "hire",
    title: "Hire 2 more staff",
    titleHindi: "2 aur staff rakhein",
    icon: Users,
    currentLabel: "Current expenses",
    currentValue: "Rs 2,14,000/month",
    newLabel: "New expenses",
    newValue: "Rs 2,38,000/month (+Rs 24,000)",
    changeLabel: "Impact on profit",
    impactLabel: "-7% margin drop",
    impactValue: "-7%",
    impactColor: "text-red-500",
    verdict: "Abhi hire mat karo. Diwali ke baad revenue stable ho toh consider karo",
    verdictEn: "Don't hire now. Consider after Diwali when revenue stabilizes.",
  },
  {
    id: "diwali-low",
    title: "Diwali sales 20% lower",
    titleHindi: "Diwali bikri 20% kam ho jaye",
    icon: BarChart3,
    currentLabel: "Expected Oct revenue",
    currentValue: "Rs 4,80,000",
    newLabel: "If -20%",
    newValue: "Rs 3,84,000",
    changeLabel: "Cash shortage",
    impactLabel: "Rs 96,000",
    impactValue: "-Rs 96K",
    impactColor: "text-red-500",
    verdict: "Rs 1L buffer rakhein Oct se pehle. FD todna pad sakta hai",
    verdictEn: "Keep Rs 1L buffer before Oct. May need to break FD.",
  },
  {
    id: "new-product",
    title: "Launch new product line",
    titleHindi: "Naya product line launch karein",
    icon: Package,
    currentLabel: "Current revenue",
    currentValue: "Rs 3,20,000/month",
    newLabel: "Projected revenue (3 months)",
    newValue: "Rs 3,84,000/month (+20%)",
    changeLabel: "Upfront investment",
    impactLabel: "Rs 80,000 one-time",
    impactValue: "+20%",
    impactColor: "text-emerald-500",
    verdict: "Achha idea hai! Akshaya Tritiya ke baad launch karo jab cash flow strong ho",
    verdictEn: "Good idea! Launch after Akshaya Tritiya when cash flow is strong.",
  },
];

// Color mapping for festival categories
function festivalGradient(category: string): string {
  switch (category) {
    case "shopping":
      return "from-yellow-400 to-amber-600";
    case "religious":
      return "from-orange-400 to-orange-600";
    case "harvest":
      return "from-green-400 to-emerald-600";
    case "national":
      return "from-blue-400 to-indigo-500";
    default:
      return "from-purple-400 to-purple-600";
  }
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ForecastPage() {
  const [showHindi, setShowHindi] = useState(true);
  const [forecastData, setForecastData] = useState<CashFlowDataPoint[] | null>(null);
  const [upcomingFestivals, setUpcomingFestivals] = useState<ApiFestival[]>([]);
  const [cashCrunchDays, setCashCrunchDays] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<ApiRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // What-If state
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customHires, setCustomHires] = useState(0);
  const [customRevChange, setCustomRevChange] = useState(0);
  const [customExpense, setCustomExpense] = useState(0);
  const [customExpenseType, setCustomExpenseType] = useState<"one-time" | "recurring">("one-time");
  const [customResult, setCustomResult] = useState<{
    netImpact: number;
    marginChange: number;
    verdict: string;
    verdictEn: string;
  } | null>(null);

  // Auto-save state
  const [autoSaveOn, setAutoSaveOn] = useState(true);

  const fetchForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/forecast/${DEMO_MERCHANT_ID}?period=90d`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiForecastResponse = await res.json();

      // Map daily forecast to chart data points
      const mapped: CashFlowDataPoint[] = (json.daily_forecast ?? []).map(
        (d: ApiForecastDay) => {
          const net = d.predicted_net ?? d.predicted_income - d.predicted_expense;
          const margin = Math.round(Math.abs(net) * 0.25);
          return {
            date: d.date,
            predicted_income: d.predicted_income,
            predicted_expense: d.predicted_expense,
            predicted_net: net,
            confidence_upper: net + margin + 3000,
            confidence_lower: net - margin - 3000,
            is_festival: d.is_festival,
            festival_name: d.festival_name ?? undefined,
            is_crisis: d.predicted_expense > d.predicted_income,
          };
        }
      );

      setForecastData(mapped);
      setUpcomingFestivals(json.upcoming_festivals ?? []);
      setCashCrunchDays(json.cash_crunch_days ?? []);
      setRecommendations(json.recommendations ?? []);
    } catch (err) {
      console.error("Forecast fetch failed, using fallback:", err);
      setError((err as Error).message);
      const fallback = generateFallbackForecastData();
      setForecastData(fallback.daily);
      setUpcomingFestivals(fallback.festivals);
      setCashCrunchDays(fallback.crunchDays);
      setRecommendations(fallback.recommendations);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = forecastData ?? [];

  // Summary stats
  const next30 = data.slice(0, 30);
  const totalIncome30 = next30.reduce((s, d) => s + d.predicted_income, 0);
  const totalExpense30 = next30.reduce((s, d) => s + d.predicted_expense, 0);
  const totalNet30 = totalIncome30 - totalExpense30;
  const crisisDays = data.filter((d) => d.is_crisis).length;
  const festivalDays = data.filter((d) => d.is_festival).length;

  // Recommendations categorized
  const festivalRecs = useMemo(
    () => recommendations.filter((r) => r.type === "festival_prep"),
    [recommendations]
  );
  const crunchRecs = useMemo(
    () => recommendations.filter((r) => r.type === "cash_crunch"),
    [recommendations]
  );
  const savingsRecs = useMemo(
    () => recommendations.filter((r) => r.type === "savings"),
    [recommendations]
  );

  // Custom scenario calculator
  const calculateCustomImpact = () => {
    const monthlyIncome = totalIncome30;
    const monthlyExpense = totalExpense30;
    const hireCost = customHires * 10000 * (customExpenseType === "recurring" ? 1 : 0);
    const revenueChange = monthlyIncome * (customRevChange / 100);
    const expenseAdd = customExpenseType === "recurring" ? customExpense + hireCost : hireCost;
    const oneTimeExpense = customExpenseType === "one-time" ? customExpense : 0;

    const newIncome = monthlyIncome + revenueChange;
    const newExpense = monthlyExpense + expenseAdd + customHires * 10000;
    const netImpact =
      newIncome - newExpense - (monthlyIncome - monthlyExpense) - oneTimeExpense;
    const currentMargin =
      ((monthlyIncome - monthlyExpense) / monthlyIncome) * 100;
    const newMargin = ((newIncome - newExpense) / newIncome) * 100;
    const marginChange = newMargin - currentMargin;

    let verdict: string;
    let verdictEn: string;
    if (marginChange > 5) {
      verdict = "Bahut achha plan hai! Revenue growth kaafi strong hoga";
      verdictEn = "Great plan! Revenue growth will be quite strong";
    } else if (marginChange > 0) {
      verdict = "Theek hai, thoda fayda hoga. Dhyan se implement karo";
      verdictEn = "Okay, slight benefit. Implement carefully";
    } else if (marginChange > -5) {
      verdict = "Risk hai but manageable. 3 mahine ka buffer rakhein";
      verdictEn = "Risky but manageable. Keep 3 month buffer";
    } else {
      verdict = "Abhi mat karo. Pehle revenue badhao, phir sochein";
      verdictEn = "Don't do this now. Increase revenue first, then reconsider";
    }

    setCustomResult({ netImpact, marginChange, verdict, verdictEn });
  };

  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-5 w-full">
        <div>
          <Skeleton className="h-7 w-56 mb-1" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 space-y-2"
            >
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-4 w-48" />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="w-8 h-8 rounded-lg" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-5 w-full pb-8">
      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-red-700">
            API unavailable, showing demo data
          </p>
          <button
            onClick={fetchForecast}
            className="text-xs font-semibold text-red-700 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-munim-primary-dark">
          Aapka Cash Flow Forecast
        </h1>
        <p className="text-sm text-munim-text-secondary mt-0.5">
          AI-powered 90-day prediction with festival impact
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] text-gray-500">30D Income</span>
          </div>
          <p className="text-sm font-bold text-gray-900">
            {formatINR(totalIncome30)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-xl border border-gray-100 shadow-sm p-3"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[10px] text-gray-500">30D Expense</span>
          </div>
          <p className="text-sm font-bold text-gray-900">
            {formatINR(totalExpense30)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={cn(
            "rounded-xl border shadow-sm p-3",
            totalNet30 >= 0
              ? "bg-emerald-50 border-emerald-100"
              : "bg-red-50 border-red-100"
          )}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <IndianRupee className="w-3.5 h-3.5 text-munim-primary-dark" />
            <span className="text-[10px] text-gray-500">30D Net</span>
          </div>
          <p
            className={cn(
              "text-sm font-bold",
              totalNet30 >= 0 ? "text-emerald-700" : "text-red-700"
            )}
          >
            {formatINR(totalNet30)}
          </p>
        </motion.div>
      </div>

      {/* Quick Stats Row */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs text-gray-500">
            {crisisDays} crisis days
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-purple-400" />
          <span className="text-xs text-gray-500">
            {festivalDays} festivals
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-500">90 day view</span>
        </div>
      </div>

      {/* Cash Crunch Warning */}
      {cashCrunchDays.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="bg-red-50 border border-red-200 rounded-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">
                Cash Shortage Warning
              </p>
              <p className="text-xs text-red-700 mt-1 leading-relaxed">
                {showHindi
                  ? `${cashCrunchDays.length} din mein kharcha income se zyada hoga. Pehla din: ${formatDateShort(cashCrunchDays[0])}`
                  : `Cash shortage predicted on ${cashCrunchDays.length} days. First: ${formatDateShort(cashCrunchDays[0])}`}
              </p>
              {cashCrunchDays.length <= 5 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cashCrunchDays.map((d) => (
                    <span
                      key={d}
                      className="text-[10px] font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-md"
                    >
                      {formatDateShort(d)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-red-600 mt-2 font-medium">
                {showHindi
                  ? "Udhari collection badhaein aur reserve rakhein"
                  : "Increase udhari collection and maintain reserves"}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Cash Flow Chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
      >
        <CashFlowChart data={data} />
      </motion.div>

      {/* Recommendations from API */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            {showHindi ? "Sujhaav" : "Recommendations"}
          </h3>
          <button
            onClick={() => setShowHindi(!showHindi)}
            className="text-[10px] font-medium text-munim-primary bg-blue-50 px-2.5 py-1 rounded-md"
          >
            {showHindi ? "English" : "Hindi"}
          </button>
        </div>

        <div className="space-y-3">
          {/* Festival prep recommendations */}
          {festivalRecs.map((rec, i) => (
            <motion.div
              key={`fest-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
              className="flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-purple-500 bg-purple-50">
                <PartyPopper className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  {rec.text_hi}
                </p>
                {rec.impact > 0 && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                    Expected boost: {formatINR(rec.impact)}
                  </p>
                )}
              </div>
            </motion.div>
          ))}

          {/* Cash crunch recommendations */}
          {crunchRecs.map((rec, i) => (
            <motion.div
              key={`crunch-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + (festivalRecs.length + i) * 0.08 }}
              className="flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-red-500 bg-red-50">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {rec.text_hi}
              </p>
            </motion.div>
          ))}

          {/* Savings recommendations */}
          {savingsRecs.map((rec, i) => (
            <motion.div
              key={`save-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay:
                  0.4 +
                  (festivalRecs.length + crunchRecs.length + i) * 0.08,
              }}
              className="flex items-start gap-3"
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-emerald-500 bg-emerald-50">
                <IndianRupee className="w-4 h-4" />
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {rec.text_hi}
              </p>
            </motion.div>
          ))}

          {/* GST reminder (always show) */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-blue-500 bg-blue-50">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {showHindi
                ? "GST filing ke liye har quarter mein paisa alag rakhein."
                : "Keep funds aside for quarterly GST filing."}
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* What-If + Smart Savings side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* ========== What-If Scenario Builder ========== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      >
        <div className="p-5 pb-3">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[#00BAF2]" />
            <h3 className="font-semibold text-gray-900">What-If Scenarios</h3>
          </div>
          <p className="text-xs text-gray-400 italic">
            {showHindi
              ? '"Agar ye ho jaye toh kya hoga?"'
              : '"What would happen if...?"'}
          </p>
        </div>

        {/* Pre-built Scenarios */}
        <div className="px-5 pb-3 space-y-2">
          {PREBUILT_SCENARIOS.map((scenario) => {
            const Icon = scenario.icon;
            const isExpanded = expandedScenario === scenario.id;
            return (
              <div
                key={scenario.id}
                className="border border-gray-100 rounded-xl overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedScenario(isExpanded ? null : scenario.id)
                  }
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-[#002E6E]" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {showHindi ? scenario.titleHindi : scenario.title}
                    </p>
                  </div>
                  <span
                    className={cn("text-xs font-bold", scenario.impactColor)}
                  >
                    {scenario.impactValue}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-3 space-y-2">
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">
                              {scenario.currentLabel}
                            </span>
                            <span className="font-medium text-gray-700">
                              {scenario.currentValue}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">
                              {scenario.newLabel}
                            </span>
                            <span className="font-medium text-gray-700">
                              {scenario.newValue}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">
                              {scenario.changeLabel}
                            </span>
                            <span
                              className={cn(
                                "font-bold",
                                scenario.impactColor
                              )}
                            >
                              {scenario.impactLabel}
                            </span>
                          </div>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-amber-800 leading-relaxed">
                              {showHindi
                                ? scenario.verdict
                                : scenario.verdictEn}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Custom Scenario Form */}
        <div className="px-5 pb-5">
          <button
            onClick={() => {
              setShowCustomForm(!showCustomForm);
              setCustomResult(null);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-[#00BAF2] hover:text-[#00BAF2] transition-colors"
          >
            <Plus className="w-4 h-4" />
            {showHindi ? "Apna Scenario Banao" : "Add Custom Scenario"}
          </button>

          <AnimatePresence>
            {showCustomForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 bg-gray-50 rounded-xl p-4 space-y-4">
                  {/* Hire slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        {showHindi ? "Naye staff" : "Hire staff"} (Rs 10K each)
                      </label>
                      <span className="text-xs font-bold text-[#002E6E]">
                        {customHires}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={5}
                      value={customHires}
                      onChange={(e) => setCustomHires(Number(e.target.value))}
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00BAF2]"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>0</span>
                      <span>5</span>
                    </div>
                  </div>

                  {/* Revenue change slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-gray-700">
                        {showHindi ? "Revenue badlav" : "Revenue change"}
                      </label>
                      <span
                        className={cn(
                          "text-xs font-bold",
                          customRevChange > 0
                            ? "text-emerald-600"
                            : customRevChange < 0
                              ? "text-red-500"
                              : "text-gray-500"
                        )}
                      >
                        {customRevChange > 0 ? "+" : ""}
                        {customRevChange}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={100}
                      value={customRevChange}
                      onChange={(e) =>
                        setCustomRevChange(Number(e.target.value))
                      }
                      className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#00BAF2]"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>-50%</span>
                      <span>+100%</span>
                    </div>
                  </div>

                  {/* New expense input */}
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1.5">
                      {showHindi ? "Naya kharcha (Rs)" : "New expense (Rs)"}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0}
                        value={customExpense}
                        onChange={(e) =>
                          setCustomExpense(Number(e.target.value))
                        }
                        placeholder="0"
                        className="flex-1 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]/40"
                      />
                      <select
                        value={customExpenseType}
                        onChange={(e) =>
                          setCustomExpenseType(
                            e.target.value as "one-time" | "recurring"
                          )
                        }
                        className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20"
                      >
                        <option value="one-time">
                          {showHindi ? "Ek baar" : "One-time"}
                        </option>
                        <option value="recurring">
                          {showHindi ? "Har mahina" : "Monthly"}
                        </option>
                      </select>
                    </div>
                  </div>

                  {/* Calculate button */}
                  <button
                    onClick={calculateCustomImpact}
                    className="w-full h-10 rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] text-white text-sm font-semibold shadow-lg shadow-[#00BAF2]/20 hover:shadow-[#00BAF2]/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    {showHindi ? "Impact Dekho" : "Calculate Impact"}
                  </button>

                  {/* Result */}
                  <AnimatePresence>
                    {customResult && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="space-y-2"
                      >
                        <div className="bg-white rounded-lg p-3 border border-gray-100 space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">
                              {showHindi
                                ? "Monthly impact"
                                : "Net monthly impact"}
                            </span>
                            <span
                              className={cn(
                                "font-bold",
                                customResult.netImpact >= 0
                                  ? "text-emerald-600"
                                  : "text-red-500"
                              )}
                            >
                              {customResult.netImpact >= 0 ? "+" : ""}
                              {formatINR(customResult.netImpact)}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">
                              {showHindi ? "Margin badlav" : "Margin change"}
                            </span>
                            <span
                              className={cn(
                                "font-bold",
                                customResult.marginChange >= 0
                                  ? "text-emerald-600"
                                  : "text-red-500"
                              )}
                            >
                              {customResult.marginChange >= 0 ? "+" : ""}
                              {customResult.marginChange.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-[#00BAF2] mt-0.5 shrink-0" />
                            <p className="text-xs text-[#002E6E] leading-relaxed font-medium">
                              {showHindi
                                ? customResult.verdict
                                : customResult.verdictEn}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ========== Auto-Save Recommendations ========== */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl border border-emerald-100 shadow-sm p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <PiggyBank className="w-5 h-5 text-emerald-600" />
          <h3 className="font-semibold text-gray-900">
            {showHindi ? "Smart Bachat" : "Smart Savings"}
          </h3>
        </div>

        <div className="space-y-3">
          {/* Festival revenue highlight */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
              <PartyPopper className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {showHindi
                ? `Festivals mein Rs ${Math.round(upcomingFestivals.reduce((s, f) => s + f.expected_boost, 0)).toLocaleString("en-IN")} extra revenue expected`
                : `Rs ${Math.round(upcomingFestivals.reduce((s, f) => s + f.expected_boost, 0)).toLocaleString("en-IN")} extra revenue expected during festivals`}
            </p>
          </div>

          {/* MunimAI suggestion */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-[#00BAF2]" />
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {showHindi
                ? "MunimAI suggestion: Rs 40,000 save karo January ke lean period ke liye"
                : "MunimAI suggestion: Save Rs 40,000 for January lean period"}
            </p>
          </div>

          {/* Auto-save toggle */}
          <div className="bg-white rounded-xl border border-gray-100 p-3.5 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Auto-Save
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {showHindi
                    ? "Rs 2,000/day automatically save hoga high-revenue days mein"
                    : "Rs 2,000/day auto-saved on high-revenue days"}
                </p>
              </div>
              <button
                onClick={() => setAutoSaveOn(!autoSaveOn)}
                className={cn(
                  "relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0",
                  autoSaveOn ? "bg-emerald-500" : "bg-gray-300"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                    autoSaveOn && "translate-x-5"
                  )}
                />
              </button>
            </div>
            {autoSaveOn && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-3 pt-3 border-t border-gray-100"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full w-[35%] rounded-full bg-emerald-400" />
                  </div>
                  <span className="text-[10px] font-medium text-emerald-600">
                    Rs 14,000 / Rs 40,000
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {showHindi
                    ? "7 din mein Rs 14,000 save hua"
                    : "Rs 14,000 saved in 7 days"}
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      </div>{/* end What-If + Smart Savings grid */}

      {/* ========== Festival Impact Cards (from API) ========== */}
      {upcomingFestivals.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-4 h-4 text-amber-500" />
            <h3 className="font-semibold text-gray-900">
              {showHindi ? "Festival Impact" : "Upcoming Festival Impact"}
            </h3>
          </div>

          <div className="space-y-3">
            {upcomingFestivals.slice(0, 6).map((festival, i) => {
              const daysLeft = daysUntil(festival.date);
              return (
                <motion.div
                  key={`${festival.date}-${festival.name}`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.08 }}
                  className="border border-gray-100 rounded-xl p-3.5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center shrink-0",
                          festivalGradient(festival.category)
                        )}
                      >
                        <PartyPopper className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {festival.name}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {festival.name_hi}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {formatDateShort(festival.date)}
                          {daysLeft > 0 && ` (${daysLeft} din baaki)`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                      +{festival.impact_pct}% sales
                    </span>
                  </div>

                  {/* Impact bar */}
                  <div className="mb-2">
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full bg-gradient-to-r",
                          festivalGradient(festival.category)
                        )}
                        style={{
                          width: `${Math.min(festival.impact_pct, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Expected boost */}
                  <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-2.5">
                    <Package className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                      {showHindi
                        ? `Expected boost: ${formatINR(festival.expected_boost)}. Stock pehle se ready rakhein.`
                        : `Expected boost: ${formatINR(festival.expected_boost)}. Stock up in advance.`}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
