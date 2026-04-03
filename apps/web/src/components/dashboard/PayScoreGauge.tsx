"use client";

import { motion, useSpring, useMotionValueEvent } from "framer-motion";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface PayScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#22C55E"; // Green — excellent
  if (score >= 60) return "#00BAF2"; // Blue — good
  if (score >= 40) return "#F59E0B"; // Amber — fair
  return "#EF4444"; // Red — poor
}

function getScoreGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
}

export function PayScoreGauge({
  score,
  size = "md",
  showLabel = true,
  className,
}: PayScoreGaugeProps) {
  const springScore = useSpring(0, { stiffness: 40, damping: 15 });
  const [displayScore, setDisplayScore] = useState(0);

  useMotionValueEvent(springScore, "change", (latest) => {
    setDisplayScore(Math.round(latest));
  });

  useEffect(() => {
    springScore.set(score);
  }, [score, springScore]);

  const dimensions = {
    sm: { size: 48, stroke: 4, fontSize: 14 },
    md: { size: 80, stroke: 6, fontSize: 22 },
    lg: { size: 120, stroke: 8, fontSize: 32 },
  };

  const d = dimensions[size];
  const radius = (d.size - d.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (displayScore / 100) * circumference;
  const color = getScoreColor(displayScore);

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative" style={{ width: d.size, height: d.size }}>
        <svg width={d.size} height={d.size} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={d.size / 2}
            cy={d.size / 2}
            r={radius}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={d.stroke}
          />
          {/* Progress circle */}
          <motion.circle
            cx={d.size / 2}
            cy={d.size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={d.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
            }}
          />
        </svg>
        {/* Score number in center */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ fontSize: d.fontSize }}
        >
          <span className="font-bold tabular-nums" style={{ color }}>
            {displayScore}
          </span>
        </div>
      </div>

      {showLabel && (
        <div className="mt-1 text-center">
          <span className="text-xs font-medium text-gray-500">PayScore</span>
          {size !== "sm" && (
            <span
              className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {getScoreGrade(displayScore)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
