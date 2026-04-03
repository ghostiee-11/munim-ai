"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/constants";
import { Bell, Check, Clock, AlertTriangle, ChevronRight } from "lucide-react";

export interface UdhariEntry {
  id: string;
  debtor_name?: string;
  customerName?: string;
  amount: number;
  amount_paid?: number;
  originalAmount?: number;
  status: "pending" | "partial" | "settled" | "overdue" | "written_off" | "paid";
  days_overdue?: number;
  reminder_count?: number;
  created_at?: string;
  dueDate?: string;
}

interface UdhariTrackerProps {
  entries: UdhariEntry[];
  totalPending: number;
  onRemind?: (id: string) => void;
  onRemindAll?: () => void;
  maxDisplay?: number;
}

function getStatusColor(status: string, days?: number) {
  if (status === "settled") return "bg-emerald-100 text-emerald-700";
  if (status === "overdue" || (days && days > 30)) return "bg-red-100 text-red-700";
  if (status === "partial") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

function getInitialColor(status: string, days?: number) {
  if (status === "settled") return "bg-emerald-500";
  if (status === "overdue" || (days && days > 30)) return "bg-red-500";
  if (status === "partial") return "bg-amber-500";
  if (days && days > 15) return "bg-orange-500";
  return "bg-blue-500";
}

function getDaysLabel(days?: number): string {
  if (!days || days <= 0) return "Naya";
  if (days === 1) return "1 din";
  return `${days} din`;
}

export function UdhariTracker({
  entries,
  totalPending,
  onRemind,
  onRemindAll,
  maxDisplay = 4,
}: UdhariTrackerProps) {
  const displayEntries = entries
    .filter((e) => e.status !== "settled")
    .sort((a, b) => (b.amount - (b.amount_paid || 0)) - (a.amount - (a.amount_paid || 0)))
    .slice(0, maxDisplay);

  const remainingCount = entries.filter((e) => e.status !== "settled").length - maxDisplay;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Udhari Baaki</h3>
        <span className="text-sm font-bold text-red-500">
          {formatINR(totalPending)}
        </span>
      </div>

      {/* Entries */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {displayEntries.map((entry) => {
            const remaining = entry.amount - (entry.amount_paid || 0);
            const displayName = entry.debtor_name || entry.customerName || "Unknown";
            const daysOverdue = entry.days_overdue || 0;

            return (
              <motion.div
                key={entry.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="flex items-center gap-3"
              >
                {/* Initial avatar */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
                    getInitialColor(entry.status, daysOverdue)
                  )}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {displayName}
                    </span>
                    {daysOverdue <= 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        Naya
                      </span>
                    )}
                    {entry.status === "overdue" && (
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-sm font-bold",
                        daysOverdue > 30 ? "text-red-500" : daysOverdue > 15 ? "text-orange-500" : "text-gray-700"
                      )}
                    >
                      {formatINR(remaining)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {getDaysLabel(daysOverdue)}
                    </span>
                  </div>
                </div>

                {/* Action button */}
                <button
                  onClick={() => onRemind?.(entry.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                    entry.reminder_count && entry.reminder_count > 0
                      ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  )}
                >
                  {entry.reminder_count && entry.reminder_count > 0 ? (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Follow-up
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Bell className="w-3 h-3" />
                      Remind
                    </span>
                  )}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        {remainingCount > 0 && (
          <span className="text-xs text-gray-400">
            {remainingCount} aur log...{" "}
            <button className="text-[#00BAF2] font-medium hover:underline">
              Sab Dekho
            </button>
          </span>
        )}
        {onRemindAll && entries.filter((e) => e.status === "overdue").length > 0 && (
          <button
            onClick={onRemindAll}
            className="text-xs font-medium text-white bg-[#00BAF2] px-3 py-1.5 rounded-lg hover:bg-[#00a5d9] transition-colors"
          >
            Sab ko Remind Karo
          </button>
        )}
      </div>
    </div>
  );
}
