"use client";

import { cn } from "@/lib/utils";
import { LiveDot } from "./LiveDot";
import { useSocket } from "@/hooks/useSocket";

interface NavbarProps {
  shopName?: string;
  payScore?: number;
  className?: string;
}

/**
 * PayScore circular mini gauge for the navbar.
 */
function PayScoreBadge({ score }: { score: number }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const color =
    score >= 80
      ? "#22C55E"
      : score >= 60
        ? "#F59E0B"
        : "#EF4444";

  return (
    <div
      className="relative flex items-center justify-center"
      aria-label={`PayScore: ${score}`}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-[9px] font-bold text-munim-text-primary">
        {score}
      </span>
    </div>
  );
}

/**
 * Top navigation bar for MunimAI.
 */
export function Navbar({
  shopName = "Sunita Saree Shop",
  payScore = 0,
  className,
}: NavbarProps) {
  const { isConnected } = useSocket();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4",
        className
      )}
    >
      {/* Left: Logo + Brand */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-munim-primary-dark">
          <span className="text-sm font-bold text-white">M</span>
        </div>
        <span className="text-base font-bold text-munim-primary-dark">
          MunimAI
        </span>
        {isConnected && <LiveDot />}
      </div>

      {/* Center: Shop Name */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-munim-text-primary truncate max-w-[40%]">
        {shopName}
      </h1>

      {/* Right: PayScore Badge */}
      <PayScoreBadge score={payScore} />
    </header>
  );
}
