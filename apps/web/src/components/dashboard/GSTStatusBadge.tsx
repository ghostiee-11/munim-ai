"use client";

import { cn } from "@/lib/utils";
import { FileCheck, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { useRouter } from "next/navigation";

interface GSTStatusBadgeProps {
  status: "filed" | "ready" | "pending" | "late";
  period: string;
  due_date: string;
  days_remaining: number;
}

const STATUS_CONFIG: Record<
  GSTStatusBadgeProps["status"],
  {
    bg: string;
    text: string;
    border: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  filed: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: CheckCircle,
    label: "Filed",
  },
  ready: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    icon: FileCheck,
    label: "Ready",
  },
  pending: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: Clock,
    label: "Pending",
  },
  late: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: AlertTriangle,
    label: "Late",
  },
};

export function GSTStatusBadge({
  status,
  period,
  due_date,
  days_remaining,
}: GSTStatusBadgeProps) {
  const router = useRouter();
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const daysLabel =
    status === "filed"
      ? "Filed"
      : days_remaining <= 0
        ? `${Math.abs(days_remaining)} din late`
        : days_remaining === 1
          ? "Kal due hai"
          : `${days_remaining} din baaki`;

  return (
    <button
      onClick={() => router.push("/gst")}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all hover:shadow-sm active:scale-[0.98]",
        config.bg,
        config.border
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
          config.bg
        )}
      >
        <Icon className={cn("w-4.5 h-4.5", config.text)} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">GSTR-3B</span>
          <span className="text-xs text-gray-500">{period}</span>
        </div>
        <span className={cn("text-xs font-medium", config.text)}>{daysLabel}</span>
      </div>

      {/* Status Pill */}
      <span
        className={cn(
          "text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 uppercase tracking-wide",
          config.bg,
          config.text
        )}
      >
        {config.label}
      </span>
    </button>
  );
}
