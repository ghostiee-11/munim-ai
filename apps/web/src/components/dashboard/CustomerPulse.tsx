"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/constants";
import { Users, MessageSquare, Clock } from "lucide-react";

interface Customer {
  name: string;
  churn_risk: "low" | "medium" | "high" | "churned";
  days_since_last_visit: number;
  total_spent: number;
  rfm_segment: string;
}

interface CustomerPulseProps {
  customers: Customer[];
  onWinback?: (customerName: string) => void;
}

const RISK_STYLES: Record<Customer["churn_risk"], { badge: string; dot: string; label: string }> = {
  low: {
    badge: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-500",
    label: "Safe",
  },
  medium: {
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    label: "At Risk",
  },
  high: {
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    label: "High Risk",
  },
  churned: {
    badge: "bg-gray-100 text-gray-500",
    dot: "bg-gray-400",
    label: "Churned",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CustomerPulse({ customers, onWinback }: CustomerPulseProps) {
  const displayCustomers = customers.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#00BAF2]" />
          <h3 className="font-semibold text-gray-900">Customer Pulse</h3>
        </div>
        <span className="text-xs text-gray-400">{customers.length} tracked</span>
      </div>

      {/* Customer Cards */}
      <div className="space-y-3">
        {displayCustomers.map((customer, index) => {
          const risk = RISK_STYLES[customer.churn_risk];
          const showWinback = customer.churn_risk === "high" || customer.churn_risk === "churned";

          return (
            <motion.div
              key={customer.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
            >
              {/* Avatar */}
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0",
                  risk.dot
                )}
              >
                {getInitials(customer.name)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {customer.name}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
                      risk.badge
                    )}
                  >
                    {risk.label}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500">
                    {formatINR(customer.total_spent)} spent
                  </span>
                  {customer.days_since_last_visit > 7 && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {customer.days_since_last_visit} din se nahi aaye
                    </span>
                  )}
                </div>
              </div>

              {/* Winback Button */}
              {showWinback && (
                <button
                  onClick={() => onWinback?.(customer.name)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#00BAF2]/10 text-[#00BAF2] hover:bg-[#00BAF2]/20 transition-colors"
                >
                  <MessageSquare className="w-3 h-3" />
                  Winback bhejein?
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {customers.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Koi customer data nahi hai
        </div>
      )}
    </div>
  );
}
