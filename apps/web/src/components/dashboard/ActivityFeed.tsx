"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/constants";
import {
  TrendingUp,
  TrendingDown,
  FileText,
  CheckCircle,
  Send,
  Award,
  AlertTriangle,
  Activity,
} from "lucide-react";

interface ActivityEvent {
  id: string;
  event_type:
    | "income_added"
    | "expense_added"
    | "udhari_created"
    | "udhari_collected"
    | "reminder_sent"
    | "payscore_change"
    | "alert";
  title: string;
  title_hindi: string;
  severity: "success" | "info" | "warning" | "critical";
  created_at: string;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
}

const EVENT_ICONS: Record<ActivityEvent["event_type"], React.ComponentType<{ className?: string }>> = {
  income_added: TrendingUp,
  expense_added: TrendingDown,
  udhari_created: FileText,
  udhari_collected: CheckCircle,
  reminder_sent: Send,
  payscore_change: Award,
  alert: AlertTriangle,
};

const SEVERITY_STYLES: Record<ActivityEvent["severity"], { bg: string; text: string; icon: string; border: string }> = {
  success: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    icon: "text-emerald-500",
    border: "border-emerald-200",
  },
  info: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    icon: "text-blue-500",
    border: "border-blue-200",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    icon: "text-amber-500",
    border: "border-amber-200",
  },
  critical: {
    bg: "bg-red-50",
    text: "text-red-700",
    icon: "text-red-500",
    border: "border-red-200",
  },
};

export function ActivityFeed({ events }: ActivityFeedProps) {
  const recentEvents = events.slice(0, 8);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-[#00BAF2]" />
        <h3 className="font-semibold text-gray-900">Live Activity</h3>
        <span className="ml-auto text-xs text-gray-400">{recentEvents.length} recent</span>
      </div>

      {/* Event List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        <AnimatePresence initial={false}>
          {recentEvents.map((event) => {
            const Icon = EVENT_ICONS[event.event_type] || Activity;
            const styles = SEVERITY_STYLES[event.severity] || SEVERITY_STYLES.info;

            return (
              <motion.div
                key={event.id}
                layout
                initial={{ opacity: 0, y: -20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, x: 50, height: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border",
                  styles.bg,
                  styles.border
                )}
              >
                {/* Time */}
                <span className="text-[11px] font-medium text-gray-400 w-14 shrink-0 text-right tabular-nums">
                  {formatTime(event.created_at)}
                </span>

                {/* Icon */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    styles.bg
                  )}
                >
                  <Icon className={cn("w-4 h-4", styles.icon)} />
                </div>

                {/* Title */}
                <span className={cn("text-sm font-medium flex-1 min-w-0 truncate", styles.text)}>
                  {event.title_hindi}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {recentEvents.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Koi nayi activity nahi hai
          </div>
        )}
      </div>
    </div>
  );
}
