"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatINR, formatDate, COLORS } from "@/lib/constants";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
  Scatter,
} from "recharts";

export interface CashFlowDataPoint {
  date: string;
  predicted_income: number;
  predicted_expense: number;
  predicted_net: number;
  confidence_upper: number;
  confidence_lower: number;
  is_festival: boolean;
  festival_name?: string;
  is_crisis: boolean;
}

interface CashFlowChartProps {
  data: CashFlowDataPoint[];
}

type ViewRange = 30 | 60 | 90;

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CashFlowDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-900 mb-1">{formatDate(d.date)}</p>
      <p className="text-green-600">Income: {formatINR(d.predicted_income)}</p>
      <p className="text-red-500">Expense: {formatINR(d.predicted_expense)}</p>
      <p className={cn("font-semibold", d.predicted_net >= 0 ? "text-blue-600" : "text-red-600")}>
        Net: {formatINR(d.predicted_net)}
      </p>
      {d.is_festival && d.festival_name && (
        <p className="text-purple-600 mt-1">{"🎉"} {d.festival_name}</p>
      )}
      {d.is_crisis && (
        <p className="text-red-600 mt-1">{"⚠️"} Cash crisis zone</p>
      )}
    </div>
  );
}

export default function CashFlowChart({ data }: CashFlowChartProps) {
  const [viewRange, setViewRange] = useState<ViewRange>(30);

  const slicedData = useMemo(() => data.slice(0, viewRange), [data, viewRange]);

  // Get crisis zones as contiguous ranges
  const crisisZones = useMemo(() => {
    const zones: Array<{ start: string; end: string }> = [];
    let current: { start: string; end: string } | null = null;
    for (const point of slicedData) {
      if (point.is_crisis) {
        if (!current) current = { start: point.date, end: point.date };
        else current.end = point.date;
      } else if (current) {
        zones.push(current);
        current = null;
      }
    }
    if (current) zones.push(current);
    return zones;
  }, [slicedData]);

  const festivalPoints = useMemo(
    () => slicedData.filter((d) => d.is_festival),
    [slicedData]
  );

  const formatXTick = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const formatYTick = (val: number) => {
    if (Math.abs(val) >= 100000) return `${(val / 100000).toFixed(1)}L`;
    if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)}K`;
    return val.toString();
  };

  return (
    <div className="w-full">
      {/* Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Cash Flow Forecast</h3>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {([30, 60, 90] as ViewRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setViewRange(range)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewRange === range
                  ? "bg-white text-[#002E6E] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {range}D
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={slicedData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXTick}
            tick={{ fontSize: 11, fill: "#64748B" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatYTick}
            tick={{ fontSize: 11, fill: "#64748B" }}
            width={50}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ fontSize: 12 }}
          />

          {/* Crisis zones */}
          {crisisZones.map((zone, i) => (
            <ReferenceArea
              key={`crisis-${i}`}
              x1={zone.start}
              x2={zone.end}
              fill="#FEE2E2"
              fillOpacity={0.6}
              strokeOpacity={0}
            />
          ))}

          {/* Zero line */}
          <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="4 4" />

          {/* Confidence band */}
          <Area
            dataKey="confidence_upper"
            stroke="none"
            fill={COLORS.primary}
            fillOpacity={0.08}
            name="Confidence Upper"
            legendType="none"
          />
          <Area
            dataKey="confidence_lower"
            stroke="none"
            fill="#FFFFFF"
            fillOpacity={1}
            name="Confidence Lower"
            legendType="none"
          />

          {/* Net line */}
          <Line
            dataKey="predicted_net"
            stroke={COLORS.primary}
            strokeWidth={2.5}
            dot={false}
            name="Predicted Net"
          />

          {/* Income/Expense lines */}
          <Line
            dataKey="predicted_income"
            stroke={COLORS.success}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name="Income"
          />
          <Line
            dataKey="predicted_expense"
            stroke={COLORS.danger}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name="Expense"
          />

          {/* Festival markers */}
          {festivalPoints.length > 0 && (
            <Scatter
              data={festivalPoints}
              fill={COLORS.purple}
              name="Festival"
              shape="diamond"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
