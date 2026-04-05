"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/common/Skeleton";
import {
  Landmark,
  CheckCircle,
  Clock,
  ArrowRight,
  TrendingDown,
  Shield,
  FileText,
  X,
  Star,
  IndianRupee,
  Percent,
  ChevronRight,
  RefreshCw,
  Search,
  ExternalLink,
  Loader2,
} from "lucide-react";

// ---------- Search Result Type ----------
interface SchemeSearchResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
  hindi_summary: string;
  applicability_score: number;
}

// ---------- Types ----------
type SchemeStatus = "matched" | "applied" | "approved";

interface Scheme {
  id: string;
  name: string;
  nameHindi: string;
  description: string;
  descriptionHindi: string;
  eligibleAmount: number;
  interestRate: number;
  tenure: string;
  eligibilityScore: number; // 0-100
  status: SchemeStatus;
  benefits: string[];
  requirements: string[];
  processingTime: string;
}

// ---------- Demo Data ----------
const SCHEMES: Scheme[] = [
  {
    id: "mudra",
    name: "MUDRA Shishu Loan",
    nameHindi: "मुद्रा शिशु लोन",
    description: "Collateral-free loan up to Rs 50,000 for small businesses. No guarantor needed.",
    descriptionHindi: "छोटे व्यापार के लिए Rs 50,000 तक बिना गारंटी का लोन। कोई ज़मानत नहीं।",
    eligibleAmount: 50000,
    interestRate: 8.5,
    tenure: "5 years",
    eligibilityScore: 92,
    status: "matched",
    benefits: [
      "No collateral required",
      "Low interest rate (8.5%)",
      "Flexible repayment up to 5 years",
      "Quick disbursement in 7-10 days",
    ],
    requirements: [
      "Aadhaar Card",
      "PAN Card",
      "Business address proof",
      "Last 6 months bank statement",
    ],
    processingTime: "7-10 days",
  },
  {
    id: "pmegp",
    name: "PMEGP",
    nameHindi: "पीएमईजीपी",
    description: "Prime Minister Employment Generation Programme. Up to Rs 10 lakh with 25% subsidy.",
    descriptionHindi: "प्रधानमंत्री रोजगार सृजन कार्यक्रम। Rs 10 लाख तक 25% सब्सिडी के साथ।",
    eligibleAmount: 1000000,
    interestRate: 9.0,
    tenure: "3-7 years",
    eligibilityScore: 78,
    status: "matched",
    benefits: [
      "25% subsidy on project cost",
      "Higher subsidy (35%) for SC/ST/Women",
      "Both manufacturing & service sector",
      "Covers working capital too",
    ],
    requirements: [
      "Age above 18 years",
      "Min 8th pass for manufacturing > Rs 10 lakh",
      "Project report",
      "Aadhaar, PAN, Address proof",
    ],
    processingTime: "30-45 days",
  },
  {
    id: "cgtmse",
    name: "CGTMSE",
    nameHindi: "सीजीटीएमएसई",
    description: "Credit Guarantee Fund Trust. Collateral-free loans up to Rs 5 crore for MSMEs.",
    descriptionHindi: "एमएसएमई के लिए Rs 5 करोड़ तक बिना गारंटी का लोन।",
    eligibleAmount: 5000000,
    interestRate: 9.5,
    tenure: "5-7 years",
    eligibilityScore: 65,
    status: "applied",
    benefits: [
      "No collateral up to Rs 5 crore",
      "Government backs 85% of loan",
      "Both new & existing businesses",
      "Available at all major banks",
    ],
    requirements: [
      "MSME registration (Udyam)",
      "Business plan",
      "Last 2 years ITR",
      "Bank statements (12 months)",
    ],
    processingTime: "15-30 days",
  },
  {
    id: "standup",
    name: "Stand-Up India",
    nameHindi: "स्टैंड-अप इंडिया",
    description: "Loans from Rs 10 lakh to Rs 1 crore for SC/ST and women entrepreneurs.",
    descriptionHindi: "SC/ST और महिला उद्यमियों के लिए Rs 10 लाख से Rs 1 करोड़ तक लोन।",
    eligibleAmount: 2500000,
    interestRate: 8.0,
    tenure: "7 years",
    eligibilityScore: 85,
    status: "matched",
    benefits: [
      "Lowest interest rate (8%)",
      "Long tenure up to 7 years",
      "Moratorium period of 18 months",
      "Handholding support included",
    ],
    requirements: [
      "SC/ST or Woman entrepreneur",
      "First-time borrower for enterprise",
      "Age 18+ years",
      "Business should be in manufacturing/services/trading",
    ],
    processingTime: "15-20 days",
  },
];

const MONEYLENDER_RATE = 36;

const STATUS_CONFIG: Record<SchemeStatus, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  matched: { label: "Matched", icon: Star, className: "bg-blue-50 text-blue-700 border-blue-200" },
  applied: { label: "Applied", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", icon: CheckCircle, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function SchemesPage() {
  const [selectedScheme, setSelectedScheme] = useState<Scheme | null>(null);
  const [showHindi, setShowHindi] = useState(false);
  const [applicationScheme, setApplicationScheme] = useState<Scheme | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SchemeSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);

  const fetchSchemes = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/schemes/${DEMO_MERCHANT_ID}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: Scheme[] = (Array.isArray(json) ? json : json.data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        name: (d.name ?? d.scheme_name) as string,
        nameHindi: (d.nameHindi ?? d.name_hindi ?? "") as string,
        description: d.description as string,
        descriptionHindi: (d.descriptionHindi ?? d.description_hindi ?? "") as string,
        eligibleAmount: Number(d.eligibleAmount ?? d.eligible_amount ?? d.max_amount ?? 0),
        interestRate: Number(d.interestRate ?? d.interest_rate ?? 0),
        tenure: (d.tenure ?? "N/A") as string,
        eligibilityScore: Number(d.eligibilityScore ?? d.eligibility_score ?? 0),
        status: (d.status ?? "matched") as SchemeStatus,
        benefits: (d.benefits ?? []) as string[],
        requirements: (d.requirements ?? []) as string[],
        processingTime: (d.processingTime ?? d.processing_time ?? "N/A") as string,
      }));
      setSchemes(list);
    } catch (err) {
      console.error("Schemes fetch failed, using fallback:", err);
      setFetchError((err as Error).message);
      setSchemes(SCHEMES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchemes(); }, []);

  const handleApply = async (scheme: Scheme) => {
    try {
      await fetch(`${API_BASE_URL}/api/schemes/${DEMO_MERCHANT_ID}/${scheme.id}/apply`, { method: "POST" });
    } catch { /* fallback */ }
    setApplicationScheme(scheme);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchPerformed(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/schemes/${DEMO_MERCHANT_ID}/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setSearchResults(Array.isArray(json) ? json : json.results ?? json.data ?? []);
    } catch (err) {
      console.error("Scheme search failed:", err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 pt-4 space-y-5 w-full">
        <div>
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} className="h-14 w-full rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
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
          <button onClick={fetchSchemes} className="text-xs font-semibold text-red-700 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-munim-primary-dark">
            Government Schemes
          </h1>
          <p className="text-sm text-munim-text-secondary">
            {showHindi ? "Aapke liye matched sarkari yojnaayein" : "AI-matched schemes for your business"}
          </p>
        </div>
        <button
          onClick={() => setShowHindi(!showHindi)}
          className="text-[10px] font-medium text-munim-primary bg-blue-50 px-2.5 py-1 rounded-md"
        >
          {showHindi ? "English" : "Hindi"}
        </button>
      </div>

      {/* Search Box */}
      <form onSubmit={handleSearch} className="relative">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2.5">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search government schemes..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
          />
          <button
            type="submit"
            disabled={searchLoading || !searchQuery.trim()}
            className="text-xs font-semibold text-white bg-munim-primary px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
          </button>
        </div>
      </form>

      {/* Search Results */}
      {searchLoading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {!searchLoading && searchPerformed && searchResults.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">No results found. Try a different search query.</p>
        </div>
      )}

      {!searchLoading && searchResults.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {searchResults.map((result, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-munim-primary hover:underline flex items-center gap-1"
                >
                  {result.title}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                    result.applicability_score >= 90
                      ? "bg-emerald-100 text-emerald-700"
                      : result.applicability_score >= 70
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-100 text-gray-600"
                  )}
                >
                  {result.applicability_score}% match
                </span>
              </div>
              {result.hindi_summary && (
                <p className="text-xs text-gray-700 leading-relaxed mb-2">
                  {result.hindi_summary}
                </p>
              )}
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {result.snippet}
              </p>
            </motion.div>
          ))}
          <p className="text-[10px] text-gray-400 text-center py-1">
            Powered by Tavily AI Search
          </p>
        </div>
      )}

      {/* Rate Comparison Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white"
      >
        <div className="flex items-center gap-2 mb-2">
          <TrendingDown className="w-5 h-5" />
          <span className="text-sm font-semibold">How it Compares</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">8.5%</p>
            <p className="text-[10px] text-emerald-100">Sarkari Scheme Rate</p>
          </div>
          <div className="text-white/60">vs</div>
          <div className="flex-1 bg-red-500/30 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">36%</p>
            <p className="text-[10px] text-red-200">Sahukar Rate</p>
          </div>
        </div>
        <p className="text-xs text-emerald-100 mt-2 text-center">
          {showHindi
            ? "Sarkari loan se Rs 1 lakh pe Rs 27,500/saal bachao!"
            : "Save Rs 27,500/year per Rs 1 lakh with government loans!"}
        </p>
      </motion.div>

      {/* Scheme Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {schemes.map((scheme, i) => {
          const statusConfig = STATUS_CONFIG[scheme.status] || STATUS_CONFIG.matched;
          const StatusIcon = statusConfig.icon;

          return (
            <motion.div
              key={`${scheme.id}_${i}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              <div className="p-4">
                {/* Top Row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-munim-primary-dark to-munim-primary flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        {showHindi ? scheme.nameHindi : scheme.name}
                      </h3>
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-md border inline-flex items-center gap-1 mt-0.5", statusConfig.className)}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-600 leading-relaxed mb-3">
                  {showHindi ? scheme.descriptionHindi : scheme.description}
                </p>

                {/* Key Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <IndianRupee className="w-3 h-3 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-gray-900">{scheme.eligibleAmount ? formatINR(scheme.eligibleAmount) : "N/A"}</p>
                    <p className="text-[9px] text-gray-400">Amount</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <Percent className="w-3 h-3 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-emerald-600">{scheme.interestRate ? `${scheme.interestRate}%` : "N/A"}</p>
                    <p className="text-[9px] text-gray-400">Interest</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <Clock className="w-3 h-3 text-gray-400 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-gray-900">{scheme.tenure}</p>
                    <p className="text-[9px] text-gray-400">Tenure</p>
                  </div>
                </div>

                {/* Eligibility Score */}
                <div className="mb-3">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">Eligibility Match</span>
                    <span className={cn(
                      "font-bold",
                      scheme.eligibilityScore >= 80 ? "text-emerald-600" :
                      scheme.eligibilityScore >= 60 ? "text-amber-600" : "text-red-600"
                    )}>
                      {scheme.eligibilityScore || 0}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${scheme.eligibilityScore}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                      className={cn(
                        "h-full rounded-full",
                        scheme.eligibilityScore >= 80 ? "bg-emerald-500" :
                        scheme.eligibilityScore >= 60 ? "bg-amber-500" : "bg-red-500"
                      )}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {scheme.status === "matched" && (
                    <button
                      onClick={() => handleApply(scheme)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-munim-primary text-white text-xs font-semibold rounded-xl active:bg-munim-primary/90"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Apply Now
                    </button>
                  )}
                  {scheme.status === "applied" && (
                    <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-50 text-amber-700 text-xs font-semibold rounded-xl">
                      <Clock className="w-3.5 h-3.5" />
                      Application Under Review
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedScheme(scheme)}
                    className="flex items-center justify-center gap-1 px-3 py-2.5 bg-gray-50 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-100"
                  >
                    Details
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Scheme Detail Modal */}
      <AnimatePresence>
        {selectedScheme && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setSelectedScheme(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-gray-900">{selectedScheme.name}</h3>
                <button onClick={() => setSelectedScheme(null)} className="p-1">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Benefits</h4>
                  <div className="space-y-1.5">
                    {selectedScheme.benefits.map((b, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-gray-700">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Requirements</h4>
                  <div className="space-y-1.5">
                    {selectedScheme.requirements.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                        <span className="text-xs text-gray-700">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-700">
                    Processing Time: <span className="font-bold">{selectedScheme.processingTime}</span>
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Application Summary Modal */}
      <AnimatePresence>
        {applicationScheme && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
            onClick={() => setApplicationScheme(null)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-gray-900">Application Summary</h3>
                <button onClick={() => setApplicationScheme(null)} className="p-1">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Scheme</span>
                  <span className="font-semibold text-gray-900">{applicationScheme.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-semibold text-gray-900">{formatINR(applicationScheme.eligibleAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Interest Rate</span>
                  <span className="font-semibold text-emerald-600">{applicationScheme.interestRate}% p.a.</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tenure</span>
                  <span className="font-semibold text-gray-900">{applicationScheme.tenure}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Applicant</span>
                  <span className="font-semibold text-gray-900">Sunita Sharma</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Business</span>
                  <span className="font-semibold text-gray-900">Sunita Saree Shop</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Eligibility</span>
                  <span className="font-semibold text-emerald-600">{applicationScheme.eligibilityScore}% match</span>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
                <p className="text-xs text-emerald-700">
                  <Shield className="w-3.5 h-3.5 inline mr-1" />
                  MunimAI has pre-filled this application from your business data. Review and submit.
                </p>
              </div>

              <button
                onClick={() => setApplicationScheme(null)}
                className="w-full py-3 bg-munim-primary text-white font-semibold rounded-xl active:bg-munim-primary/90"
              >
                Submit Application
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
