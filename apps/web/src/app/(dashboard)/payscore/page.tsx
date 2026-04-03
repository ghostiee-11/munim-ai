"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { formatINR } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { PayScoreGauge } from "@/components/dashboard/PayScoreGauge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Zap,
  Target,
  Star,
  Shield,
  BadgeCheck,
  Rocket,
  Lightbulb,
  Calculator,
} from "lucide-react";

// ---------- Types ----------
interface ScoreCategory {
  label: string;
  labelHindi: string;
  score: number;
  maxScore: 100;
  features: { name: string; value: string; impact: string }[];
}

// ---------- Demo Data ----------
const CURRENT_SCORE = 72;

const SCORE_CATEGORIES: ScoreCategory[] = [
  {
    label: "Consistency",
    labelHindi: "Niyamitata",
    score: 78,
    maxScore: 100,
    features: [
      { name: "Monthly revenue variance", value: "12%", impact: "Good" },
      { name: "Regular transaction frequency", value: "26 days/month", impact: "Good" },
      { name: "Seasonal stability", value: "Medium", impact: "Average" },
    ],
  },
  {
    label: "Growth",
    labelHindi: "Vikas",
    score: 68,
    maxScore: 100,
    features: [
      { name: "Revenue growth (6m)", value: "+18%", impact: "Good" },
      { name: "Customer acquisition", value: "+12 customers", impact: "Average" },
      { name: "Ticket size growth", value: "+8%", impact: "Average" },
    ],
  },
  {
    label: "Risk",
    labelHindi: "Jokhim",
    score: 65,
    maxScore: 100,
    features: [
      { name: "Udhari exposure", value: "Rs 1.2L", impact: "High Risk" },
      { name: "Customer concentration", value: "Top 3 = 35%", impact: "Average" },
      { name: "Payment delay ratio", value: "15%", impact: "Average" },
    ],
  },
  {
    label: "Discipline",
    labelHindi: "Anushasan",
    score: 82,
    maxScore: 100,
    features: [
      { name: "GST filing on time", value: "5/6 months", impact: "Good" },
      { name: "Expense recording", value: "92% captured", impact: "Good" },
      { name: "Daily app usage", value: "24 days/month", impact: "Good" },
    ],
  },
  {
    label: "Depth",
    labelHindi: "Gehraai",
    score: 70,
    maxScore: 100,
    features: [
      { name: "Transaction history", value: "8 months", impact: "Average" },
      { name: "Category diversity", value: "3 categories", impact: "Average" },
      { name: "Digital payment ratio", value: "72%", impact: "Good" },
    ],
  },
  {
    label: "Account Aggregator",
    labelHindi: "Khaata Samanvay",
    score: 60,
    maxScore: 100,
    features: [
      { name: "Bank accounts linked", value: "1 of 2", impact: "Average" },
      { name: "Statement months available", value: "6 months", impact: "Average" },
      { name: "Balance consistency", value: "Medium", impact: "Average" },
    ],
  },
];

const SCORE_HISTORY = [
  { month: "Oct", score: 58 },
  { month: "Nov", score: 62 },
  { month: "Dec", score: 60 },
  { month: "Jan", score: 66 },
  { month: "Feb", score: 70 },
  { month: "Mar", score: 72 },
];

const MILESTONES = [
  { score: 0, grade: "F", label: "Start" },
  { score: 40, grade: "D", label: "Basic" },
  { score: 60, grade: "C", label: "Credit Ready" },
  { score: 70, grade: "B", label: "Fast Growing" },
  { score: 80, grade: "A", label: "Lender Approved" },
];

const BADGES = [
  { label: "Credit Ready", minScore: 60, icon: Shield, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { label: "Fast Growing", minScore: 70, icon: Rocket, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { label: "Lender Approved", minScore: 80, icon: BadgeCheck, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
];

const IMPROVEMENT_TIPS = [
  { text: "3 aur customers ko UPI pe laao", impact: "+5 points", progress: 40, icon: Target },
  { text: "Next month GST time pe file karo", impact: "+3 points", progress: 83, icon: Zap },
  { text: "Udhari Rs 50K neeche laao", impact: "+4 points", progress: 25, icon: TrendingDown },
  { text: "Rozana expenses voice se daalo", impact: "+1 point", progress: 70, icon: Lightbulb },
  { text: "Doosra bank account link karo", impact: "+3 points", progress: 0, icon: Star },
];

function getScoreColor(score: number): string {
  if (score >= 80) return "#22C55E";
  if (score >= 60) return "#00BAF2";
  if (score >= 40) return "#F59E0B";
  return "#EF4444";
}

function getScoreGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

function getBarColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-blue-500";
  if (score >= 30) return "bg-amber-500";
  return "bg-red-500";
}

export default function PayScorePage() {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [loanSliderScore, setLoanSliderScore] = useState(CURRENT_SCORE);

  // Loan calculation based on score
  const loanCalc = useMemo(() => {
    const score = loanSliderScore;
    let eligibleAmount = 0;
    let interestRate = 0;

    if (score >= 80) { eligibleAmount = 1000000; interestRate = 12; }
    else if (score >= 70) { eligibleAmount = 500000; interestRate = 14; }
    else if (score >= 60) { eligibleAmount = 300000; interestRate = 18; }
    else if (score >= 40) { eligibleAmount = 100000; interestRate = 24; }
    else { eligibleAmount = 0; interestRate = 0; }

    const monthlyRate = interestRate / 12 / 100;
    const tenure = 12;
    const emi = eligibleAmount > 0
      ? Math.round((eligibleAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1))
      : 0;

    return { eligibleAmount, interestRate, emi, score };
  }, [loanSliderScore]);

  // Score trend
  const trend = useMemo(() => {
    const recent = SCORE_HISTORY.slice(-3);
    const diff = recent[recent.length - 1].score - recent[0].score;
    if (diff > 3) return "Improving";
    if (diff < -3) return "Declining";
    return "Stable";
  }, []);

  // Points needed for next milestone
  const nextMilestone = MILESTONES.find((m) => m.score > CURRENT_SCORE);
  const pointsNeeded = nextMilestone ? nextMilestone.score - CURRENT_SCORE : 0;

  return (
    <div className="px-4 pt-4 space-y-5 w-full pb-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-munim-primary-dark">PayScore</h1>
        <p className="text-sm text-munim-text-secondary">
          Aapki credit health ka AI score
        </p>
      </div>

      {/* ===== A. Score Display + B. Score Breakdown (side by side on desktop) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-[#002E6E] to-[#0052B4] rounded-2xl p-6 text-white text-center"
      >
        <PayScoreGauge score={CURRENT_SCORE} size="lg" showLabel={false} className="mx-auto" />
        <div className="mt-3">
          <span
            className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full"
            style={{
              backgroundColor: `${getScoreColor(CURRENT_SCORE)}30`,
              color: getScoreColor(CURRENT_SCORE),
            }}
          >
            <Award className="w-4 h-4" />
            Grade {getScoreGrade(CURRENT_SCORE)}
          </span>
        </div>
        {nextMilestone && (
          <p className="text-sm text-blue-200 mt-3">
            {pointsNeeded} points se{" "}
            <span className="font-bold text-white">
              {nextMilestone.score >= 80
                ? "Rs 10L loan"
                : nextMilestone.score >= 70
                ? "Rs 5L loan"
                : "Rs 3L loan"}
            </span>{" "}
            unlock hoga!
          </p>
        )}
      </motion.div>

      {/* ===== B. Score Breakdown ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <h3 className="font-semibold text-gray-900 mb-4">Score Breakdown</h3>
        <div className="space-y-3">
          {SCORE_CATEGORIES.map((cat) => {
            const isExpanded = expandedCategory === cat.label;
            return (
              <div key={cat.label}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
                  className="w-full"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{cat.label}</span>
                      <span className="text-[10px] text-gray-400">({cat.labelHindi})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-bold",
                        cat.score >= 75 ? "text-emerald-600" : cat.score >= 50 ? "text-blue-600" : "text-red-600"
                      )}>
                        {cat.score}/100
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.score}%` }}
                      transition={{ duration: 0.8, delay: 0.1 }}
                      className={cn("h-full rounded-full", getBarColor(cat.score))}
                    />
                  </div>
                </button>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-2 ml-2 space-y-1.5"
                  >
                    {cat.features.map((f, j) => (
                      <div key={j} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                        <span className="text-gray-600">{f.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{f.value}</span>
                          <span className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                            f.impact === "Good" ? "bg-emerald-50 text-emerald-600" :
                            f.impact === "Average" ? "bg-amber-50 text-amber-600" :
                            "bg-red-50 text-red-600"
                          )}>
                            {f.impact}
                          </span>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
      </div>

      {/* ===== C. Milestones & D. Tips (side by side on desktop) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <h3 className="font-semibold text-gray-900 mb-4">Milestones</h3>

        {/* Progress line */}
        <div className="relative mb-6">
          <div className="h-2 bg-gray-100 rounded-full">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${CURRENT_SCORE}%` }}
              transition={{ duration: 1, delay: 0.2 }}
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full relative"
            >
              {/* Animated current position dot */}
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute -right-2 -top-1.5 w-5 h-5 bg-white border-3 border-blue-500 rounded-full shadow-md"
                style={{ borderWidth: 3, borderColor: getScoreColor(CURRENT_SCORE) }}
              />
            </motion.div>
          </div>

          {/* Milestone markers */}
          <div className="flex justify-between mt-3">
            {MILESTONES.map((m) => (
              <div
                key={m.score}
                className={cn(
                  "flex flex-col items-center",
                  CURRENT_SCORE >= m.score ? "opacity-100" : "opacity-40"
                )}
                style={{ position: "relative" }}
              >
                <span className={cn(
                  "text-[10px] font-bold",
                  CURRENT_SCORE >= m.score ? "text-gray-900" : "text-gray-400"
                )}>
                  {m.score}
                </span>
                <span className={cn(
                  "text-[9px]",
                  CURRENT_SCORE >= m.score ? "text-gray-600" : "text-gray-400"
                )}>
                  {m.grade}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Badges */}
        <div className="space-y-2">
          {BADGES.map((badge) => {
            const earned = CURRENT_SCORE >= badge.minScore;
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl border",
                  earned ? `${badge.bg} ${badge.border}` : "bg-gray-50 border-gray-200 opacity-50"
                )}
              >
                <Icon className={cn("w-5 h-5", earned ? badge.color : "text-gray-400")} />
                <div className="flex-1">
                  <span className={cn("text-sm font-semibold", earned ? badge.color : "text-gray-400")}>
                    {badge.label}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-2">({badge.minScore}+ score)</span>
                </div>
                {earned ? (
                  <span className="text-xs font-bold text-emerald-600">Earned</span>
                ) : (
                  <span className="text-xs text-gray-400">{badge.minScore - CURRENT_SCORE} pts away</span>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ===== D. Improvement Tips ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900">Score Badhao Tips</h3>
        </div>
        <div className="space-y-3">
          {IMPROVEMENT_TIPS.map((tip, i) => {
            const Icon = tip.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                className="bg-gray-50 rounded-xl p-3"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm">
                    <Icon className="w-4 h-4 text-munim-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{tip.text}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs font-bold text-emerald-600">{tip.impact}</span>
                      <span className="text-[10px] text-gray-400">{tip.progress}% done</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${tip.progress}%` }}
                        transition={{ duration: 0.6, delay: 0.3 + i * 0.05 }}
                        className="h-full bg-emerald-400 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
      </div>

      {/* ===== E. Loan Calculator + F. Score History (side by side on desktop) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-5 h-5 text-munim-primary" />
          <h3 className="font-semibold text-gray-900">Loan Calculator</h3>
        </div>

        {/* Current eligibility */}
        <div className="bg-blue-50 rounded-xl p-4 mb-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] text-blue-600">Eligible Amount</p>
              <p className="text-sm font-bold text-blue-900">{formatINR(loanCalc.eligibleAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-blue-600">Interest Rate</p>
              <p className="text-sm font-bold text-blue-900">{loanCalc.interestRate}% p.a.</p>
            </div>
            <div>
              <p className="text-[10px] text-blue-600">Monthly EMI</p>
              <p className="text-sm font-bold text-blue-900">{formatINR(loanCalc.emi)}</p>
            </div>
          </div>
        </div>

        {/* Score slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Agar score ho jaye...</span>
            <span className="text-sm font-bold" style={{ color: getScoreColor(loanSliderScore) }}>
              {loanSliderScore}
            </span>
          </div>
          <input
            type="range"
            min={20}
            max={100}
            value={loanSliderScore}
            onChange={(e) => setLoanSliderScore(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">
            <span>20</span>
            <span>40</span>
            <span>60</span>
            <span>80</span>
            <span>100</span>
          </div>
        </div>

        {/* Comparison table */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            <div className="px-3 py-2">Source</div>
            <div className="px-3 py-2 text-center">Rate</div>
            <div className="px-3 py-2 text-right">Annual Cost</div>
          </div>
          <div className="grid grid-cols-3 text-xs border-t border-gray-100">
            <div className="px-3 py-2.5 font-medium text-munim-primary">MunimAI Loan</div>
            <div className="px-3 py-2.5 text-center font-semibold text-emerald-600">14%</div>
            <div className="px-3 py-2.5 text-right font-semibold">{formatINR(Math.round(500000 * 0.14))}</div>
          </div>
          <div className="grid grid-cols-3 text-xs border-t border-gray-100 bg-red-50/50">
            <div className="px-3 py-2.5 font-medium text-gray-700">Moneylender</div>
            <div className="px-3 py-2.5 text-center font-semibold text-red-600">36%</div>
            <div className="px-3 py-2.5 text-right font-semibold">{formatINR(Math.round(500000 * 0.36))}</div>
          </div>
        </div>

        {/* Savings */}
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-emerald-600 mb-0.5">Annual savings on Rs 5L loan</p>
          <p className="text-2xl font-bold text-emerald-600">
            {formatINR(Math.round(500000 * 0.36) - Math.round(500000 * 0.14))}
          </p>
          <p className="text-xs text-emerald-700 mt-0.5">MunimAI ke saath bachat</p>
        </div>
      </motion.div>

      {/* ===== F. Score History Chart ===== */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Score History</h3>
          <div className={cn(
            "flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full",
            trend === "Improving" ? "bg-emerald-50 text-emerald-600" :
            trend === "Declining" ? "bg-red-50 text-red-600" :
            "bg-gray-50 text-gray-600"
          )}>
            {trend === "Improving" ? <TrendingUp className="w-3.5 h-3.5" /> :
             trend === "Declining" ? <TrendingDown className="w-3.5 h-3.5" /> :
             <Minus className="w-3.5 h-3.5" />}
            {trend}
          </div>
        </div>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SCORE_HISTORY} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => `${value}`}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#00BAF2"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#00BAF2", stroke: "#fff", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: "#002E6E" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500">
          <span>
            6 mahine ka trend:{" "}
            <span className={cn(
              "font-bold",
              trend === "Improving" ? "text-emerald-600" : trend === "Declining" ? "text-red-600" : "text-gray-700"
            )}>
              +{SCORE_HISTORY[SCORE_HISTORY.length - 1].score - SCORE_HISTORY[0].score} points
            </span>
          </span>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
