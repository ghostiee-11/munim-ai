"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common/Skeleton";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  ArrowRight,
  Shield,
  IndianRupee,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Zap,
  XCircle,
  HelpCircle,
  Calculator,
  Lightbulb,
  Sparkles,
  MessageCircle,
} from "lucide-react";

// ---------- Types ----------
type GSTStatus = "filed" | "filed_late" | "ready" | "pending" | "overdue";

interface GSTMonth {
  month: string;
  monthLabel: string;
  year: number;
  status: GSTStatus;
  dueDate: string;
  filedDate?: string;
  penalty?: number;
  taxAmount: number;
  itcClaimed: number;
}

// ---------- Demo Data ----------
const GST_TIMELINE: GSTMonth[] = [
  {
    month: "Oct",
    monthLabel: "October",
    year: 2025,
    status: "filed",
    dueDate: "2025-11-20",
    filedDate: "2025-11-18",
    taxAmount: 42500,
    itcClaimed: 12800,
  },
  {
    month: "Nov",
    monthLabel: "November",
    year: 2025,
    status: "filed",
    dueDate: "2025-12-20",
    filedDate: "2025-12-15",
    taxAmount: 38900,
    itcClaimed: 11200,
  },
  {
    month: "Dec",
    monthLabel: "December",
    year: 2025,
    status: "filed_late",
    dueDate: "2026-01-20",
    filedDate: "2026-01-25",
    penalty: 2100,
    taxAmount: 45200,
    itcClaimed: 13500,
  },
  {
    month: "Jan",
    monthLabel: "January",
    year: 2026,
    status: "filed",
    dueDate: "2026-02-20",
    filedDate: "2026-02-19",
    taxAmount: 41800,
    itcClaimed: 12100,
  },
  {
    month: "Feb",
    monthLabel: "February",
    year: 2026,
    status: "filed",
    dueDate: "2026-03-20",
    filedDate: "2026-03-17",
    taxAmount: 39600,
    itcClaimed: 11900,
  },
  {
    month: "Mar",
    monthLabel: "March",
    year: 2026,
    status: "ready",
    dueDate: "2026-04-20",
    taxAmount: 44100,
    itcClaimed: 13200,
  },
];

const STATUS_CONFIG: Record<GSTStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
  filed: { label: "Filed", icon: CheckCircle, color: "text-emerald-600", bgColor: "bg-emerald-50 border-emerald-200" },
  filed_late: { label: "Filed Late", icon: AlertTriangle, color: "text-amber-600", bgColor: "bg-amber-50 border-amber-200" },
  ready: { label: "Ready to File", icon: Zap, color: "text-blue-600", bgColor: "bg-blue-50 border-blue-200" },
  pending: { label: "Pending", icon: Clock, color: "text-gray-600", bgColor: "bg-gray-50 border-gray-200" },
  overdue: { label: "Overdue", icon: XCircle, color: "text-red-600", bgColor: "bg-red-50 border-red-200" },
};

// ITC Reconciliation Data
const ITC_DATA = {
  totalClaimed: 74700,
  matched: 68200,
  mismatched: 6500,
  mismatchItems: [
    { supplier: "Rajan Textiles", claimed: 3200, available: 2800, diff: 400 },
    { supplier: "Mumbai Dyes Ltd", claimed: 5100, available: 4200, diff: 900 },
    { supplier: "Gujarat Prints", claimed: 8400, available: 3200, diff: 5200 },
  ],
};

// Classification Progress
const CLASSIFICATION = {
  total: 500,
  classified: 482,
  pending: 18,
};

interface GSTApiData {
  timeline: GSTMonth[];
  itc: typeof ITC_DATA;
  classification: typeof CLASSIFICATION;
}

// ---------- Backend Report & Optimization Types ----------
interface GSTReportBackend {
  total_sales: number;
  total_purchases: number;
  output_gst: number;
  input_itc: number;
  net_liability: number;
  cgst: number;
  sgst: number;
  sales_items: { hsn_code: string; gst_rate: number; gst_amount: number }[];
  purchase_items: { hsn_code: string; gst_rate: number; gst_amount: number }[];
  summary_hindi: string;
}

interface OptimizationTip {
  type: string;
  title: string;
  description_hi: string;
  potential_saving: number;
}

// ---------- GST Report Data ----------
const GST_REPORT = {
  totalSales: 885000,
  salesBreakdown: [
    { category: "Textile (5%)", amount: 520000, rate: 5 },
    { category: "Readymade Garments (12%)", amount: 280000, rate: 12 },
    { category: "Luxury Fabrics (18%)", amount: 85000, rate: 18 },
  ],
  totalPurchases: 412000,
  gstCollected: {
    total: 44100,
    cgst: 15200,
    sgst: 15200,
    igst: 13700,
  },
  itcAvailable: 13200,
  netLiability: 30900,
};

const HINDI_EXPLANATIONS: Record<string, string> = {
  "textile_5": "Ye 5% GST textile items pe lagta hai. Aapke saree aur fabric sales is category mein aate hain.",
  "readymade_12": "Readymade garments pe 12% GST lagta hai. Ye stitched/ready items hain jo aap bechte hain.",
  "luxury_18": "Luxury fabrics jaise silk ya designer fabrics pe 18% GST lagta hai.",
  "itc": "ITC ka matlab hai jo GST aapne purchase pe diya, wo aapke output GST se kat jayega. Isse aapka tax burden kam hota hai.",
  "net_liability": "Net liability = Output GST - Input GST (ITC). Ye actual amount hai jo aapko government ko dena hai.",
  "cgst_sgst": "CGST state ke andar sales pe lagta hai (Central ka hissa), SGST bhi state ke andar (State ka hissa). IGST doosre state ke sales pe lagta hai.",
};

export default function GSTPage() {
  const [showFilingFlow, setShowFilingFlow] = useState(false);
  const [filingStep, setFilingStep] = useState(0);
  const [gstData, setGstData] = useState<GSTApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reportExpanded, setReportExpanded] = useState(false);
  const [expandedExplanation, setExpandedExplanation] = useState<string | null>(null);
  const [showWhyExplanation, setShowWhyExplanation] = useState(false);

  // Backend report & optimization tips
  const [backendReport, setBackendReport] = useState<GSTReportBackend | null>(null);
  const [backendReportExpanded, setBackendReportExpanded] = useState(false);
  const [backendReportLoading, setBackendReportLoading] = useState(true);
  const [optimizationTips, setOptimizationTips] = useState<OptimizationTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(true);

  // GST Chatbot state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: "user" | "bot"; text: string}[]>([
    { role: "bot", text: "Namaste! Main aapka GST expert hoon. GST se related koi bhi sawaal puchein - rates, HSN codes, filing, ITC, penalties - sab samjha dunga!" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const fetchGST = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gst/${DEMO_MERCHANT_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setGstData({
        timeline: json.timeline ?? json.data?.timeline ?? GST_TIMELINE,
        itc: json.itc ?? json.data?.itc ?? ITC_DATA,
        classification: json.classification ?? json.data?.classification ?? CLASSIFICATION,
      });
    } catch (err) {
      console.error("GST fetch failed, using fallback:", err);
      setFetchError((err as Error).message);
      setGstData({ timeline: GST_TIMELINE, itc: ITC_DATA, classification: CLASSIFICATION });
    } finally {
      setLoading(false);
    }
  };

  const fetchBackendReport = async () => {
    setBackendReportLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gst/${DEMO_MERCHANT_ID}/report`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setBackendReport(json);
    } catch (err) {
      console.error("GST report fetch failed:", err);
    } finally {
      setBackendReportLoading(false);
    }
  };

  const fetchOptimizationTips = async () => {
    setTipsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gst/${DEMO_MERCHANT_ID}/optimization`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setOptimizationTips(json.tips ?? []);
    } catch (err) {
      console.error("Optimization tips fetch failed:", err);
    } finally {
      setTipsLoading(false);
    }
  };

  const handleChatSend = async () => {
    const q = chatInput.trim();
    if (!q || chatLoading) return;
    setChatMessages((prev) => [...prev, { role: "user", text: q }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gst/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_id: DEMO_MERCHANT_ID, question: q }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "bot", text: data.answer || "Koi error aaya. Dobara try karein." }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "bot", text: "Network error. Kripya dobara try karein." }]);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => { fetchGST(); fetchBackendReport(); fetchOptimizationTips(); }, []);

  const timeline = gstData?.timeline ?? GST_TIMELINE;
  const itcData = gstData?.itc ?? ITC_DATA;
  const classificationData = gstData?.classification ?? CLASSIFICATION;

  const totalPenalty = timeline.reduce((s, m) => s + (m.penalty || 0), 0);
  const currentMonth = timeline[timeline.length - 1];
  const daysUntilDue = Math.max(0, Math.ceil((new Date(currentMonth.dueDate).getTime() - Date.now()) / 86400000));

  const handleFile = () => {
    setShowFilingFlow(true);
    setFilingStep(0);
    // Try real API filing
    fetch(`${API_BASE_URL}/api/gst/${DEMO_MERCHANT_ID}/file`, { method: "POST" }).catch(() => {});
    // Simulate filing steps for UX
    const timer1 = setTimeout(() => setFilingStep(1), 1000);
    const timer2 = setTimeout(() => setFilingStep(2), 2500);
    const timer3 = setTimeout(() => setFilingStep(3), 4000);
    return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
  };

  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-5 w-full">
        <div>
          <Skeleton className="h-7 w-36 mb-1" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 space-y-5 w-full">
      {/* Error banner */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-red-700">API unavailable, showing demo data</p>
          <button onClick={fetchGST} className="text-xs font-semibold text-red-700 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-munim-primary-dark">
          GST Autopilot
        </h1>
        <p className="text-sm text-munim-text-secondary">
          Automatic filing, tracking & compliance
        </p>
      </div>

      {/* Current Month + Filing Timeline side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* Current Month Highlight */}
      <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-[#002E6E] to-[#0052B4] rounded-2xl p-5 text-white"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-300" />
            <span className="text-sm font-medium text-blue-200">
              {currentMonth.monthLabel} {currentMonth.year}
            </span>
          </div>
          <span className="text-xs font-medium bg-blue-500/30 px-2.5 py-1 rounded-full">
            {daysUntilDue} din baaki
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold">{formatINR(currentMonth.taxAmount)}</p>
            <p className="text-xs text-blue-200 mt-0.5">
              GST Payable | ITC: {formatINR(currentMonth.itcClaimed)}
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleFile}
            className="flex items-center gap-1.5 bg-white text-[#002E6E] px-4 py-2.5 rounded-xl text-sm font-bold active:bg-gray-100"
          >
            <FileText className="w-4 h-4" />
            File GST
          </motion.button>
        </div>
      </motion.div>

      {/* Classification Progress */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900">Transaction Classification</span>
          <span className="text-xs font-medium text-munim-primary">
            {classificationData.classified}/{classificationData.total}
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(classificationData.classified / classificationData.total) * 100}%` }}
            transition={{ duration: 1, delay: 0.3 }}
            className="h-full bg-gradient-to-r from-munim-primary to-emerald-400 rounded-full"
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">
          {classificationData.pending} transactions need review
        </p>
      </motion.div>
      </div>{/* end left column (current month + classification) */}

      {/* Filing Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <h3 className="font-semibold text-gray-900 mb-4">Filing Timeline</h3>
        <div className="space-y-3">
          {timeline.map((month, i) => {
            const config = STATUS_CONFIG[month.status];
            const Icon = config.icon;
            const isCurrent = i === timeline.length - 1;

            return (<div key={month.month + month.year}>
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                  isCurrent ? "border-blue-300 bg-blue-50/50 ring-1 ring-blue-200" : config.bgColor
                )}
              >
                {/* Timeline dot */}
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", config.bgColor)}>
                  <Icon className={cn("w-4 h-4", config.color)} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {month.month} {month.year}
                    </span>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md", config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500">
                      Due: {new Date(month.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    </span>
                    {month.filedDate && (
                      <span className="text-xs text-gray-400">
                        Filed: {new Date(month.filedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{formatINR(month.taxAmount)}</p>
                    {month.penalty && month.penalty > 0 && (
                      <p className="text-[10px] text-red-500 font-medium">
                        Penalty: {formatINR(month.penalty)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedExplanation(expandedExplanation === `timeline_${i}` ? null : `timeline_${i}`);
                    }}
                    className="text-gray-300 hover:text-munim-primary transition-colors"
                    title="Samjhein"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
              {expandedExplanation === `timeline_${i}` ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-[11px] text-orange-800 -mt-1"
                >
                  <span className="font-semibold">Samjhein: </span>
                  {month.status === "filed_late"
                    ? `${month.monthLabel} mein aapne late file kiya. Due date ${new Date(month.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} thi lekin ${month.filedDate ? new Date(month.filedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""} ko file hua. Isliye Rs ${month.penalty?.toLocaleString("en-IN")} penalty lagi.`
                    : month.status === "ready"
                    ? `${month.monthLabel} ka return file karne ke liye tayyar hai. Tax amount Rs ${month.taxAmount.toLocaleString("en-IN")} hai aur ITC Rs ${month.itcClaimed.toLocaleString("en-IN")} milega. Net Rs ${(month.taxAmount - month.itcClaimed).toLocaleString("en-IN")} dena hoga.`
                    : `${month.monthLabel} mein aapne Rs ${month.taxAmount.toLocaleString("en-IN")} ka GST file kiya. ITC Rs ${month.itcClaimed.toLocaleString("en-IN")} mila, toh net payment Rs ${(month.taxAmount - month.itcClaimed).toLocaleString("en-IN")} hua. Time pe file karne se penalty nahi lagi!`
                  }
                </motion.div>
              ) : null}
            </div>);
          })}
        </div>
      </motion.div>

      </div>{/* end Current Month + Filing Timeline grid */}

      {/* ===== A. Monthly GST Report ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      >
        <button
          onClick={() => setReportExpanded(!reportExpanded)}
          className="w-full flex items-center justify-between p-5"
        >
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-munim-primary" />
            <h3 className="font-semibold text-gray-900">Monthly GST Report</h3>
          </div>
          {reportExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {reportExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="px-5 pb-5 space-y-4"
          >
            {/* Total Sales */}
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-blue-900">Total Sales</span>
                <span className="text-lg font-bold text-blue-900">{formatINR(GST_REPORT.totalSales)}</span>
              </div>
              <div className="space-y-2">
                {GST_REPORT.salesBreakdown.map((item) => {
                  const key = item.rate === 5 ? "textile_5" : item.rate === 12 ? "readymade_12" : "luxury_18";
                  return (
                    <div key={item.category}>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-blue-700">{item.category}</span>
                          <button
                            onClick={() => setExpandedExplanation(expandedExplanation === key ? null : key)}
                            className="text-blue-400 hover:text-blue-600"
                          >
                            <HelpCircle className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-semibold text-blue-800">{formatINR(item.amount)}</span>
                      </div>
                      {expandedExplanation === key && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="text-[11px] text-blue-600 bg-blue-100 rounded-lg px-2.5 py-1.5 mt-1"
                        >
                          {HINDI_EXPLANATIONS[key]}
                        </motion.p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Total Purchases */}
            <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
              <span className="text-sm font-semibold text-gray-700">Total Purchases</span>
              <span className="text-lg font-bold text-gray-900">{formatINR(GST_REPORT.totalPurchases)}</span>
            </div>

            {/* GST Collected (Output) */}
            <div className="bg-amber-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-amber-900">GST Collected (Output)</span>
                  <button
                    onClick={() => setExpandedExplanation(expandedExplanation === "cgst_sgst" ? null : "cgst_sgst")}
                    className="text-amber-400 hover:text-amber-600"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-lg font-bold text-amber-900">{formatINR(GST_REPORT.gstCollected.total)}</span>
              </div>
              {expandedExplanation === "cgst_sgst" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] text-amber-700 bg-amber-100 rounded-lg px-2.5 py-1.5 mb-2"
                >
                  {HINDI_EXPLANATIONS.cgst_sgst}
                </motion.p>
              )}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-amber-100/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-amber-600">CGST</p>
                  <p className="font-bold text-amber-800">{formatINR(GST_REPORT.gstCollected.cgst)}</p>
                </div>
                <div className="bg-amber-100/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-amber-600">SGST</p>
                  <p className="font-bold text-amber-800">{formatINR(GST_REPORT.gstCollected.sgst)}</p>
                </div>
                <div className="bg-amber-100/60 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-amber-600">IGST</p>
                  <p className="font-bold text-amber-800">{formatINR(GST_REPORT.gstCollected.igst)}</p>
                </div>
              </div>
            </div>

            {/* ITC Available */}
            <div className="bg-emerald-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-emerald-900">ITC Available (Input)</span>
                  <button
                    onClick={() => setExpandedExplanation(expandedExplanation === "itc" ? null : "itc")}
                    className="text-emerald-400 hover:text-emerald-600"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-lg font-bold text-emerald-900">{formatINR(GST_REPORT.itcAvailable)}</span>
              </div>
              {expandedExplanation === "itc" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] text-emerald-700 bg-emerald-100 rounded-lg px-2.5 py-1.5 mt-2"
                >
                  {HINDI_EXPLANATIONS.itc}
                </motion.p>
              )}
            </div>

            {/* Net Liability */}
            <div className="bg-gradient-to-r from-[#002E6E] to-[#0052B4] rounded-xl p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">Net Liability</span>
                  <button
                    onClick={() => setExpandedExplanation(expandedExplanation === "net_liability" ? null : "net_liability")}
                    className="text-blue-300 hover:text-white"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-xl font-bold">{formatINR(GST_REPORT.gstCollected.total - GST_REPORT.itcAvailable)}</span>
              </div>
              <p className="text-[11px] text-blue-200 mt-1">
                {formatINR(GST_REPORT.gstCollected.total)} (Output) - {formatINR(GST_REPORT.itcAvailable)} (ITC)
              </p>
              {expandedExplanation === "net_liability" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[11px] text-blue-100 bg-white/10 rounded-lg px-2.5 py-1.5 mt-2"
                >
                  {HINDI_EXPLANATIONS.net_liability}
                </motion.p>
              )}
            </div>

            {/* Why this amount? */}
            <button
              onClick={() => setShowWhyExplanation(!showWhyExplanation)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gray-100 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              {showWhyExplanation ? "Band karein" : "Ye amount kyun? Samjhein"}
            </button>
            {showWhyExplanation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-xs text-orange-900 space-y-2"
              >
                <p className="font-semibold">Samjhein (Hindi mein):</p>
                <p>Aapki total sales Rs 8,85,000 hain is mahine. Inmein se alag-alag rates pe GST lagta hai:</p>
                <p>- Textile pe 5% = Rs 26,000</p>
                <p>- Readymade garments pe 12% = Rs 33,600</p>
                <p>- Luxury fabrics pe 18% = Rs 15,300</p>
                <p>Total GST jo aapne collect kiya (Output): Rs 44,100</p>
                <p>Ab aapne jo purchase kiye unpe bhi GST diya tha (Input/ITC): Rs 13,200</p>
                <p className="font-semibold">Toh Net Liability = Rs 44,100 - Rs 13,200 = Rs 30,900</p>
                <p>Ye amount aapko government ko dena hai GSTR-3B mein.</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* ===== C. CA Cost Comparison ===== */}
      {/* CA vs MunimAI section removed */}

      {/* Penalty Tracker */}
      {totalPenalty > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              Total Penalties: {formatINR(totalPenalty)}
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Dec mein late filing se Rs 2,100 penalty lagi. On-time file karein!
            </p>
          </div>
        </motion.div>
      )}

      {/* ITC Reconciliation + Tax Tips side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* ITC Reconciliation */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <h3 className="font-semibold text-gray-900 mb-3">ITC Reconciliation</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Claimed</p>
            <p className="text-xs font-bold text-gray-900">{formatINR(itcData.totalClaimed)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-emerald-600">Matched</p>
            <p className="text-xs font-bold text-emerald-700">{formatINR(itcData.matched)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-red-500">Mismatch</p>
            <p className="text-xs font-bold text-red-600">{formatINR(itcData.mismatched)}</p>
          </div>
        </div>

        {/* Match progress */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-emerald-500 rounded-full"
            style={{ width: `${(itcData.matched / itcData.totalClaimed) * 100}%` }}
          />
        </div>

        {/* Mismatch items */}
        <div className="space-y-2">
          {itcData.mismatchItems.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 px-3 bg-red-50/50 rounded-lg text-xs"
            >
              <span className="text-gray-700 font-medium">{item.supplier}</span>
              <span className="text-red-600 font-semibold">-{formatINR(item.diff)}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ===== Tax Optimization Tips (from backend) ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900">Tax Optimization Tips</h3>
        </div>
        {tipsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : optimizationTips.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            No optimization tips available right now.
          </p>
        ) : (
          <div className="space-y-3">
            {optimizationTips.map((tip, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm font-bold text-amber-900">{tip.title}</p>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed mb-2 ml-6">
                  {tip.description_hi}
                </p>
                <p className="text-xs font-semibold text-emerald-600 ml-6">
                  Potential saving: {formatINR(tip.potential_saving)}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      </div>{/* end ITC + Tax Tips grid */}

      {/* ===== Full GST Report (from backend) ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between p-5">
          <button
            onClick={() => setBackendReportExpanded(!backendReportExpanded)}
            className="flex items-center gap-2 flex-1"
          >
            <FileText className="w-5 h-5 text-munim-primary" />
            <h3 className="font-semibold text-gray-900">Full GST Report</h3>
            {backendReportExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400 ml-auto" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400 ml-auto" />
            )}
          </button>
          <button
            onClick={() => {
              const report = backendReport;
              const period = `${currentMonth.monthLabel} ${currentMonth.year}`;
              const totalSales = report ? report.total_sales.toLocaleString("en-IN") : GST_REPORT.totalSales.toLocaleString("en-IN");
              const totalPurchases = report ? report.total_purchases.toLocaleString("en-IN") : GST_REPORT.totalPurchases.toLocaleString("en-IN");
              const outputGst = report ? report.output_gst.toLocaleString("en-IN") : GST_REPORT.gstCollected.total.toLocaleString("en-IN");
              const inputItc = report ? report.input_itc.toLocaleString("en-IN") : GST_REPORT.itcAvailable.toLocaleString("en-IN");
              const netLiability = report ? report.net_liability.toLocaleString("en-IN") : GST_REPORT.netLiability.toLocaleString("en-IN");
              const cgst = report ? report.cgst.toLocaleString("en-IN") : GST_REPORT.gstCollected.cgst.toLocaleString("en-IN");
              const sgst = report ? report.sgst.toLocaleString("en-IN") : GST_REPORT.gstCollected.sgst.toLocaleString("en-IN");

              const salesRows = report?.sales_items
                ? report.sales_items.map((item) => `<tr><td>${item.hsn_code}</td><td>${item.gst_rate}%</td><td>Rs ${item.gst_amount.toLocaleString("en-IN")}</td></tr>`).join("")
                : GST_REPORT.salesBreakdown.map((item) => `<tr><td>${item.category}</td><td>${item.rate}%</td><td>Rs ${item.amount.toLocaleString("en-IN")}</td></tr>`).join("");

              const purchaseRows = report?.purchase_items
                ? report.purchase_items.map((item) => `<tr><td>${item.hsn_code}</td><td>${item.gst_rate}%</td><td>Rs ${item.gst_amount.toLocaleString("en-IN")}</td></tr>`).join("")
                : "";

              const printWindow = window.open("", "_blank");
              if (!printWindow) return;
              printWindow.document.write(`
                <html><head><title>GSTR-3B Report - MunimAI</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                  th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                  th { background: #f5f5f5; font-weight: bold; }
                  .header { text-align: center; margin-bottom: 30px; }
                  .header h1 { color: #002E6E; margin-bottom: 5px; }
                  .header p { color: #666; margin: 2px 0; }
                  .total { font-weight: bold; background: #e8f5e9; }
                  .section-title { color: #002E6E; margin-top: 25px; margin-bottom: 10px; }
                  .net-box { background: #002E6E; color: white; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
                  .net-box h2 { margin: 0; font-size: 28px; }
                  .net-box p { margin: 5px 0 0; opacity: 0.8; }
                  .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; border-top: 1px solid #eee; padding-top: 15px; }
                  @media print { body { padding: 20px; } }
                </style></head><body>
                <div class="header">
                  <h1>GSTR-3B Return</h1>
                  <p>Period: ${period} | GSTIN: 07XXXXX1234X1Z5</p>
                  <p>Generated by MunimAI on ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>

                <h3 class="section-title">Summary</h3>
                <table>
                  <tr><td>Total Sales</td><td style="text-align:right">Rs ${totalSales}</td></tr>
                  <tr><td>Total Purchases</td><td style="text-align:right">Rs ${totalPurchases}</td></tr>
                  <tr><td>Output GST</td><td style="text-align:right">Rs ${outputGst}</td></tr>
                  <tr><td>Input Tax Credit (ITC)</td><td style="text-align:right">Rs ${inputItc}</td></tr>
                  <tr class="total"><td>Net GST Liability</td><td style="text-align:right">Rs ${netLiability}</td></tr>
                </table>

                <div class="net-box">
                  <p>Net GST Payable</p>
                  <h2>Rs ${netLiability}</h2>
                  <p>CGST: Rs ${cgst} | SGST: Rs ${sgst}</p>
                </div>

                <h3 class="section-title">Sales Breakdown</h3>
                <table>
                  <tr><th>Category / HSN</th><th>GST Rate</th><th>Amount</th></tr>
                  ${salesRows}
                </table>

                ${purchaseRows ? `
                <h3 class="section-title">Purchase Breakdown</h3>
                <table>
                  <tr><th>HSN Code</th><th>GST Rate</th><th>Amount</th></tr>
                  ${purchaseRows}
                </table>` : ""}

                ${report?.summary_hindi ? `<div style="background:#FFF3E0;padding:12px;border-radius:8px;margin-top:20px;"><strong>Hindi Summary:</strong> ${report.summary_hindi}</div>` : ""}

                <div class="footer">
                  <p>This is a computer-generated document by MunimAI. No signature required.</p>
                  <p>For queries, contact your tax consultant.</p>
                </div>
                </body></html>
              `);
              printWindow.document.close();
              printWindow.print();
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors shrink-0 ml-3"
          >
            <FileText className="w-3.5 h-3.5" />
            Download GSTR-3B PDF
          </button>
        </div>

        {backendReportExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="px-5 pb-5 space-y-4"
          >
            {backendReportLoading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : !backendReport ? (
              <p className="text-xs text-gray-400 text-center py-4">
                Report data unavailable. Check backend connection.
              </p>
            ) : (
              <>
                {/* Summary Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-blue-600 mb-0.5">Total Sales</p>
                    <p className="text-sm font-bold text-blue-900">{formatINR(backendReport.total_sales)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500 mb-0.5">Total Purchases</p>
                    <p className="text-sm font-bold text-gray-900">{formatINR(backendReport.total_purchases)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-amber-600 mb-0.5">Output GST</p>
                    <p className="text-sm font-bold text-amber-900">{formatINR(backendReport.output_gst)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-emerald-600 mb-0.5">Input ITC</p>
                    <p className="text-sm font-bold text-emerald-900">{formatINR(backendReport.input_itc)}</p>
                  </div>
                </div>

                {/* Net Liability */}
                <div className="bg-gradient-to-r from-[#002E6E] to-[#0052B4] rounded-xl p-4 text-white text-center">
                  <p className="text-xs text-blue-200 mb-1">Net Liability</p>
                  <p className="text-2xl font-bold">{formatINR(backendReport.net_liability)}</p>
                </div>

                {/* CGST / SGST Breakdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-amber-600">CGST</p>
                    <p className="text-sm font-bold text-amber-800">{formatINR(backendReport.cgst)}</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-amber-600">SGST</p>
                    <p className="text-sm font-bold text-amber-800">{formatINR(backendReport.sgst)}</p>
                  </div>
                </div>

                {/* Hindi Summary */}
                {backendReport.summary_hindi && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-orange-900 mb-1">Samjhein (Hindi mein):</p>
                    <p className="text-xs text-orange-800 leading-relaxed">{backendReport.summary_hindi}</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* GST Chatbot */}
      <div className="fixed bottom-6 right-6 z-40">
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="mb-3 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
            >
              {/* Chat header */}
              <div className="bg-gradient-to-r from-[#002E6E] to-[#0052B4] px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-300" />
                  <span className="text-sm font-semibold text-white">GST Expert</span>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-blue-200 hover:text-white">
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Messages */}
              <div className="h-72 overflow-y-auto p-3 space-y-2">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed",
                      msg.role === "user"
                        ? "bg-[#00BAF2] text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-bl-sm">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-gray-100 p-2 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                  placeholder="GST ka sawaal puchein..."
                  className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                />
                <button
                  onClick={handleChatSend}
                  disabled={chatLoading || !chatInput.trim()}
                  className="p-2 bg-[#00BAF2] text-white rounded-xl hover:bg-[#00BAF2]/90 disabled:opacity-50"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Quick questions */}
              <div className="px-2 pb-2 flex gap-1 flex-wrap">
                {["ITC kya hota hai?", "Late filing penalty?", "Mera GST rate kya hai?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setChatInput(q); }}
                    className="text-[9px] px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setChatOpen(!chatOpen)}
          className={cn(
            "w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors",
            chatOpen ? "bg-gray-600" : "bg-gradient-to-r from-[#002E6E] to-[#00BAF2]"
          )}
        >
          {chatOpen ? (
            <ChevronDown className="w-5 h-5 text-white" />
          ) : (
            <MessageCircle className="w-5 h-5 text-white" />
          )}
        </motion.button>
      </div>

      {/* Mock Filing Flow Modal */}
      {showFilingFlow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => { setShowFilingFlow(false); setFilingStep(0); }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
          >
            <h3 className="font-bold text-lg text-gray-900 mb-4">Filing GSTR-3B</h3>

            <div className="space-y-3">
              {[
                "Verifying transactions...",
                "Calculating tax liability...",
                "Generating return...",
                "Ready to submit!",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {filingStep > i ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : filingStep === i ? (
                    <RefreshCw className="w-5 h-5 text-munim-primary animate-spin shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-200 shrink-0" />
                  )}
                  <span className={cn(
                    "text-sm",
                    filingStep >= i ? "text-gray-900 font-medium" : "text-gray-400"
                  )}>
                    {step}
                  </span>
                </div>
              ))}
            </div>

            {filingStep >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 space-y-3"
              >
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-sm font-semibold text-emerald-800">
                    Tax: {formatINR(currentMonth.taxAmount)} | ITC: {formatINR(currentMonth.itcClaimed)}
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Net payable: {formatINR(currentMonth.taxAmount - currentMonth.itcClaimed)}
                  </p>
                </div>
                <button
                  onClick={() => { setShowFilingFlow(false); setFilingStep(0); }}
                  className="w-full py-3 bg-emerald-500 text-white font-semibold rounded-xl active:bg-emerald-600"
                >
                  Submit to GST Portal
                </button>
              </motion.div>
            )}

            <button
              onClick={() => { setShowFilingFlow(false); setFilingStep(0); }}
              className="w-full py-2.5 text-sm text-gray-500 mt-3"
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
