"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { THRESHOLDS } from "@/lib/constants";

interface ProfitMarginBarProps {
  margin: number;
}

function getBarColor(margin: number): string {
  if (margin > THRESHOLDS.profitMargin.good) return "#22C55E";
  if (margin > THRESHOLDS.profitMargin.warning) return "#F59E0B";
  return "#EF4444";
}

function getLabel(margin: number): string {
  if (margin > THRESHOLDS.profitMargin.good) return "Healthy";
  if (margin > THRESHOLDS.profitMargin.warning) return "Warning";
  return "Critical";
}

export default function ProfitMarginBar({ margin }: ProfitMarginBarProps) {
  const clampedMargin = Math.max(0, Math.min(100, margin));
  const color = getBarColor(clampedMargin);
  const label = getLabel(clampedMargin);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Profit Margin</h3>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              clampedMargin > THRESHOLDS.profitMargin.good && "bg-green-100 text-green-700",
              clampedMargin > THRESHOLDS.profitMargin.warning &&
                clampedMargin <= THRESHOLDS.profitMargin.good &&
                "bg-yellow-100 text-yellow-700",
              clampedMargin <= THRESHOLDS.profitMargin.warning && "bg-red-100 text-red-700"
            )}
          >
            {label}
          </span>
          <span className="text-lg font-bold" style={{ color }}>
            {clampedMargin.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${clampedMargin}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-400">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
