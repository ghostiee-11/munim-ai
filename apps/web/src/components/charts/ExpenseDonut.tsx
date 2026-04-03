"use client";

import { formatINR } from "@/lib/constants";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface ExpenseCategory {
  category: string;
  amount: number;
  percentage: number;
}

interface ExpenseDonutProps {
  data: ExpenseCategory[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Stock: "#00BAF2",
  Salary: "#002E6E",
  Rent: "#7C3AED",
  Utilities: "#F59E0B",
  Transport: "#22C55E",
  Misc: "#64748B",
};

const DEFAULT_COLORS = ["#00BAF2", "#002E6E", "#7C3AED", "#F59E0B", "#22C55E", "#64748B", "#EF4444", "#EC4899"];

function getColor(category: string, index: number): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  category: string;
  percentage: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, payload } = props;
  const category = payload?.category ?? "";
  const percentage = payload?.percentage ?? 0;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 24;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={500}
    >
      {category} {percentage}%
    </text>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ExpenseCategory }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-sm">
      <p className="font-semibold text-gray-900">{d.category}</p>
      <p className="text-gray-600">{formatINR(d.amount)} ({d.percentage}%)</p>
    </div>
  );
}

export default function ExpenseDonut({ data }: ExpenseDonutProps) {
  const total = data.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Expense Breakdown</h3>
      <div className="relative">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={100}
              paddingAngle={2}
              dataKey="amount"
              nameKey="category"
              label={renderLabel}
              labelLine={{ stroke: "#CBD5E1", strokeWidth: 1 }}
            >
              {data.map((entry, i) => (
                <Cell key={entry.category} fill={getColor(entry.category, i)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-base font-bold text-gray-900">{formatINR(total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
