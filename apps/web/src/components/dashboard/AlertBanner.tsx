"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { AlertTriangle, X, TrendingDown, Calendar } from "lucide-react";
import { useState } from "react";

interface AlertAction {
  label: string;
  onClick: () => void;
}

interface AlertBannerProps {
  isVisible: boolean;
  type: "cash_crunch" | "negative_profit" | "gst_deadline";
  message_hindi: string;
  actions?: AlertAction[];
  onDismiss?: () => void;
}

const ALERT_CONFIG: Record<
  AlertBannerProps["type"],
  {
    bg: string;
    border: string;
    text: string;
    icon: React.ComponentType<{ className?: string }>;
    btnBg: string;
    btnText: string;
  }
> = {
  cash_crunch: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: AlertTriangle,
    btnBg: "bg-red-600 hover:bg-red-700",
    btnText: "text-white",
  },
  negative_profit: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: TrendingDown,
    btnBg: "bg-red-600 hover:bg-red-700",
    btnText: "text-white",
  },
  gst_deadline: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: Calendar,
    btnBg: "bg-amber-600 hover:bg-amber-700",
    btnText: "text-white",
  },
};

export function AlertBanner({
  isVisible,
  type,
  message_hindi,
  actions = [],
  onDismiss,
}: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const config = ALERT_CONFIG[type];
  const Icon = config.icon;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <AnimatePresence>
      {isVisible && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -60, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -60, height: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={cn(
            "rounded-2xl border p-4 mb-4 overflow-hidden",
            config.bg,
            config.border
          )}
        >
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="shrink-0 mt-0.5">
              <Icon className={cn("w-5 h-5", config.text)} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium leading-relaxed", config.text)}>
                {message_hindi}
              </p>

              {/* Action Buttons */}
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {actions.map((action, i) => (
                    <button
                      key={i}
                      onClick={action.onClick}
                      className={cn(
                        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        i === 0
                          ? cn(config.btnBg, config.btnText)
                          : "bg-white/80 text-gray-600 hover:bg-white border border-gray-200"
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className={cn(
                "shrink-0 p-1 rounded-lg transition-colors hover:bg-black/5",
                config.text
              )}
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
