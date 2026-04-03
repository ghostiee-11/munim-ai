"use client";

import { cn } from "@/lib/utils";

interface LiveDotProps {
  className?: string;
  label?: string;
}

/**
 * Pulsing green "LIVE" indicator dot.
 */
export function LiveDot({ className, label = "LIVE" }: LiveDotProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="status"
      aria-label={label}
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-pulse-green rounded-full bg-munim-success opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-munim-success" />
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-munim-success">
        {label}
      </span>
    </span>
  );
}
