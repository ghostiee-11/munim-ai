"use client";

import { useSpring, motion, useMotionValueEvent } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  className?: string;
  /** Flash color on change: "green" for income, "red" for expense */
  flashColor?: "green" | "red" | "blue";
}

/**
 * Format number in Indian system (lakhs/thousands).
 */
function formatIndian(num: number): string {
  const abs = Math.abs(Math.round(num));
  const sign = num < 0 ? "-" : "";
  return sign + abs.toLocaleString("en-IN");
}

/**
 * Animated number counter with Framer Motion spring animation.
 * Formats with Indian number system and flashes on change.
 */
export function AnimatedNumber({
  value,
  prefix = "Rs",
  className,
  flashColor = "green",
}: AnimatedNumberProps) {
  const springValue = useSpring(0, { stiffness: 100, damping: 20, mass: 1 });
  const [display, setDisplay] = useState(formatIndian(value));
  const [isFlashing, setIsFlashing] = useState(false);
  const prevValue = useRef(value);

  useMotionValueEvent(springValue, "change", (latest) => {
    setDisplay(formatIndian(latest));
  });

  useEffect(() => {
    springValue.set(value);

    if (prevValue.current !== value && prevValue.current !== 0) {
      setIsFlashing(true);
      const timer = setTimeout(() => setIsFlashing(false), 600);
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value, springValue]);

  const flashClasses = {
    green: "shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-110",
    red: "shadow-[0_0_20px_rgba(239,68,68,0.4)] scale-110",
    blue: "shadow-[0_0_20px_rgba(0,186,242,0.4)] scale-110",
  };

  return (
    <motion.span
      className={cn(
        "inline-block tabular-nums transition-all duration-300",
        isFlashing && flashClasses[flashColor],
        className
      )}
      aria-live="polite"
      aria-label={`${prefix} ${display}`}
    >
      {prefix} {display}
    </motion.span>
  );
}
