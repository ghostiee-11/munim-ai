"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatINR, COLORS } from "@/lib/constants";

interface RevenueHeatmapProps {
  /** 7 rows (Mon-Sun) x 12 cols (9AM-9PM) */
  data: number[][];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 9;
  return h <= 12 ? `${h}${h < 12 ? "AM" : "PM"}` : `${h - 12}PM`;
});

function interpolateColor(value: number, min: number, max: number): string {
  if (max === min) return "#F1F5F9";
  const ratio = (value - min) / (max - min);
  // White -> Paytm blue (#00BAF2) -> Navy (#002E6E)
  if (ratio < 0.5) {
    const t = ratio * 2;
    const r = Math.round(241 + (0 - 241) * t);
    const g = Math.round(245 + (186 - 245) * t);
    const b = Math.round(249 + (242 - 249) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(0 + (0 - 0) * t);
    const g = Math.round(186 + (46 - 186) * t);
    const b = Math.round(242 + (110 - 242) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export default function RevenueHeatmap({ data }: RevenueHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    day: number;
    hour: number;
    x: number;
    y: number;
  } | null>(null);

  const allValues = data.flat();
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Revenue Heatmap</h3>
      <div className="overflow-x-auto">
        <div className="inline-block min-w-[500px]">
          {/* Hour labels */}
          <div className="flex ml-10">
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px] text-gray-500 pb-1"
              >
                {h}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="relative">
            {data.map((row, dayIdx) => (
              <div key={dayIdx} className="flex items-center">
                <div className="w-10 text-xs text-gray-600 font-medium text-right pr-2">
                  {DAYS[dayIdx]}
                </div>
                <div className="flex flex-1 gap-[2px]">
                  {row.map((value, hourIdx) => (
                    <div
                      key={hourIdx}
                      className={cn(
                        "flex-1 aspect-square rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10 relative min-h-[24px]"
                      )}
                      style={{ backgroundColor: interpolateColor(value, min, max) }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          day: dayIdx,
                          hour: hourIdx,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <div
                className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 text-sm pointer-events-none -translate-x-1/2 -translate-y-full -mt-2"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <p className="font-semibold text-gray-900">
                  {DAYS[tooltip.day]} {HOURS[tooltip.hour]}
                </p>
                <p className="text-[#00BAF2] font-medium">
                  {formatINR(data[tooltip.day][tooltip.hour])}
                </p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end mt-3 gap-2">
            <span className="text-[10px] text-gray-500">Low</span>
            <div className="flex h-3 w-32 rounded-sm overflow-hidden">
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className="flex-1"
                  style={{
                    backgroundColor: interpolateColor(
                      min + ((max - min) * i) / 19,
                      min,
                      max
                    ),
                  }}
                />
              ))}
            </div>
            <span className="text-[10px] text-gray-500">High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
