// MunimAI Design System Constants

export const COLORS = {
  primary: "#00BAF2", // Paytm blue
  primaryDark: "#002E6E", // Navy
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  purple: "#7C3AED",
  background: "#F8FAFC",
  textPrimary: "#1E293B",
  textSecondary: "#64748B",
  white: "#FFFFFF",
} as const;

export const THRESHOLDS = {
  profitMargin: {
    good: 30,
    warning: 10,
  },
  payScore: {
    excellent: 80,
    good: 60,
  },
  churnRisk: {
    high: 0.7,
    medium: 0.4,
  },
  udhariOverdue: {
    critical: 90, // days
    warning: 30, // days
  },
} as const;

/**
 * Format a number in Indian Rupee notation (lakhs/crores).
 * Examples: 150000 -> "Rs 1,50,000", 25000000 -> "Rs 2,50,00,000"
 */
export function formatINR(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  // Use Indian locale formatting
  const formatted = absValue.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

  return `${sign}Rs ${formatted}`;
}

/**
 * Format a Date to a readable date string (DD MMM YYYY).
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a Date to a readable time string (hh:mm AM/PM).
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export const DEMO_MERCHANT_ID = "11111111-1111-1111-1111-111111111111";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
