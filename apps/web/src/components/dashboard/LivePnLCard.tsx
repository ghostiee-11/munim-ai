"use client";

import { AnimatedNumber } from "@/components/common/AnimatedNumber";
import { LiveDot } from "@/components/common/LiveDot";
import { formatDate } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

interface LivePnLCardProps {
  todayIncome: number;
  todayExpense: number;
  todayProfit: number;
  profitMargin: number;
  incomeChange?: string;
  monthlyIncome?: number;
  monthlyExpense?: number;
  monthlyProfit?: number;
  monthlyMargin?: number;
}

export function LivePnLCard({
  todayIncome,
  todayExpense,
  todayProfit,
  profitMargin,
  incomeChange = "+12% kal se",
  monthlyIncome = 342500,
  monthlyExpense = 214200,
  monthlyProfit = 128300,
  monthlyMargin = 37.5,
}: LivePnLCardProps) {
  const marginColor =
    profitMargin >= 30
      ? "bg-emerald-500"
      : profitMargin >= 10
        ? "bg-amber-500"
        : "bg-red-500";

  const marginTextColor =
    profitMargin >= 30
      ? "text-emerald-600"
      : profitMargin >= 10
        ? "text-amber-600"
        : "text-red-600";

  const profitColor = todayProfit >= 0 ? "text-[#002E6E]" : "text-red-500";

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LiveDot />
          <h2 className="font-semibold text-gray-900">Aaj Ka Hisaab</h2>
        </div>
        <span className="text-sm text-gray-500">{formatDate(new Date())}</span>
      </div>

      {/* Three columns: Income, Expense, Profit */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Income */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500 mr-1" />
            <span className="text-xs text-gray-500">Kamaai</span>
          </div>
          <AnimatedNumber
            value={todayIncome}
            flashColor="green"
            className="text-lg font-bold text-emerald-600 block"
          />
          <span className="text-xs text-emerald-600">{incomeChange}</span>
        </div>

        {/* Expense */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
            <span className="text-xs text-gray-500">Kharcha</span>
          </div>
          <AnimatedNumber
            value={todayExpense}
            flashColor="red"
            className="text-lg font-bold text-red-500 block"
          />
          <span className="text-xs text-gray-500">
            {todayExpense > 0
              ? `${Math.round((todayExpense / Math.max(todayIncome, 1)) * 100)}% of income`
              : "No expense"}
          </span>
        </div>

        {/* Profit */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <BarChart3 className="w-4 h-4 text-[#002E6E] mr-1" />
            <span className="text-xs text-gray-500">Munafa</span>
          </div>
          <AnimatedNumber
            value={todayProfit}
            flashColor={todayProfit >= 0 ? "green" : "red"}
            className={cn("text-lg font-bold block", profitColor)}
          />
          <span className={cn("text-xs font-medium", marginTextColor)}>
            Margin: {profitMargin.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Profit Margin Bar */}
      <div className="mb-4">
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full transition-colors duration-500", marginColor)}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
            transition={{ type: "spring", stiffness: 50, damping: 15 }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">0%</span>
          <span className="text-[10px] text-gray-400">Margin</span>
          <span className="text-[10px] text-gray-400">100%</span>
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Month-to-Date</span>
          <span className="text-gray-400 text-xs">Revenue | Expenses | Profit</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-medium text-gray-700">
            Rs {monthlyIncome.toLocaleString("en-IN")}
          </span>
          <span className="text-sm text-gray-400">|</span>
          <span className="text-sm font-medium text-gray-700">
            Rs {monthlyExpense.toLocaleString("en-IN")}
          </span>
          <span className="text-sm text-gray-400">|</span>
          <span className={cn("text-sm font-bold", monthlyProfit >= 0 ? "text-emerald-600" : "text-red-500")}>
            Rs {monthlyProfit.toLocaleString("en-IN")} ({monthlyMargin.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}
