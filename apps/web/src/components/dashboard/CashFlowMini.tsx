"use client";

import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  ReferenceDot,
  YAxis,
} from "recharts";

interface CashFlowDataPoint {
  date: string;
  predicted_net: number;
  is_crisis: boolean;
  is_festival: boolean;
}

interface CashFlowMiniProps {
  data: CashFlowDataPoint[];
  className?: string;
}

export function CashFlowMini({ data, className }: CashFlowMiniProps) {
  const hasData = data.length > 0;
  const hasCrisis = data.some((d) => d.is_crisis);
  const minValue = hasData ? Math.min(...data.map((d) => d.predicted_net)) : 0;
  const maxValue = hasData ? Math.max(...data.map((d) => d.predicted_net)) : 0;
  const isAllPositive = minValue >= 0;

  // Map data with index for recharts
  const chartData = data.map((d, i) => ({
    ...d,
    index: i,
  }));

  // Festival markers
  const festivalPoints = chartData.filter((d) => d.is_festival);

  return (
    <div
      className={cn(
        "bg-white rounded-2xl shadow-sm border border-gray-100 p-5",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#00BAF2]" />
          <h3 className="font-semibold text-gray-900 text-sm">30-Day Forecast</h3>
        </div>
        {hasCrisis && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            Crisis Alert
          </span>
        )}
      </div>

      {/* Chart */}
      {hasData ? (
        <div className="h-20 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              <defs>
                <linearGradient id="cashFlowPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="cashFlowNegative" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EF4444" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#EF4444" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <YAxis domain={[minValue, maxValue]} hide />
              <Area
                type="monotone"
                dataKey="predicted_net"
                stroke={isAllPositive ? "#22C55E" : "#EF4444"}
                strokeWidth={2}
                fill={isAllPositive ? "url(#cashFlowPositive)" : "url(#cashFlowNegative)"}
                dot={false}
                isAnimationActive
                animationDuration={1000}
              />
              {/* Festival markers */}
              {festivalPoints.map((point) => (
                <ReferenceDot
                  key={point.index}
                  x={point.index}
                  y={point.predicted_net}
                  r={4}
                  fill="#F59E0B"
                  stroke="#FFF"
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center text-sm text-gray-400">
          No forecast data
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-gray-400">Positive</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-[10px] text-gray-400">Negative</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[10px] text-gray-400">Festival</span>
        </div>
      </div>
    </div>
  );
}
