"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Volume2 } from "lucide-react";

interface SoundboxSimulatorProps {
  lastMessage?: string;
  isActive?: boolean;
  ledColor?: "green" | "yellow" | "red";
  className?: string;
}

const LED_COLORS: Record<string, { bg: string; glow: string }> = {
  green: {
    bg: "bg-emerald-400",
    glow: "shadow-[0_0_8px_rgba(52,211,153,0.8)]",
  },
  yellow: {
    bg: "bg-amber-400",
    glow: "shadow-[0_0_8px_rgba(251,191,36,0.8)]",
  },
  red: {
    bg: "bg-red-400",
    glow: "shadow-[0_0_8px_rgba(248,113,113,0.8)]",
  },
};

export function SoundboxSimulator({
  lastMessage,
  isActive = false,
  ledColor = "green",
  className,
}: SoundboxSimulatorProps) {
  const led = LED_COLORS[ledColor] || LED_COLORS.green;

  return (
    <div
      className={cn(
        "relative bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-5 shadow-xl border border-gray-700 max-w-xs mx-auto",
        className
      )}
    >
      {/* Top Bar with LED and Label */}
      <div className="flex items-center justify-between mb-4">
        {/* LED Indicator */}
        <div className="flex items-center gap-2">
          <motion.div
            className={cn("w-3 h-3 rounded-full", led.bg, isActive && led.glow)}
            animate={isActive ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
            transition={
              isActive
                ? { repeat: Infinity, duration: 1.2, ease: "easeInOut" }
                : {}
            }
          />
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            {isActive ? "Active" : "Standby"}
          </span>
        </div>

        {/* Muneem Branding */}
        <span className="text-xs font-bold text-[#00BAF2] tracking-wide">
          Muneem
        </span>
      </div>

      {/* Speaker Grille */}
      <div className="flex items-center justify-center mb-4">
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-600"
            />
          ))}
        </div>
      </div>

      {/* Speaker Icon (pulses when speaking) */}
      <div className="flex justify-center mb-3">
        <motion.div
          animate={
            isActive
              ? { scale: [1, 1.15, 1] }
              : { scale: 1 }
          }
          transition={
            isActive
              ? { repeat: Infinity, duration: 0.8, ease: "easeInOut" }
              : {}
          }
          className="w-12 h-12 rounded-full bg-gray-700/80 flex items-center justify-center"
        >
          <Volume2
            className={cn(
              "w-6 h-6 transition-colors",
              isActive ? "text-[#00BAF2]" : "text-gray-500"
            )}
          />
        </motion.div>
      </div>

      {/* Message Display */}
      <div className="bg-gray-950 rounded-xl px-4 py-3 min-h-[48px] flex items-center justify-center border border-gray-700/50">
        <AnimatePresence mode="wait">
          {lastMessage ? (
            <motion.p
              key={lastMessage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-sm font-medium text-center text-emerald-400 leading-snug"
            >
              {lastMessage}
            </motion.p>
          ) : (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              className="text-xs text-gray-600 text-center"
            >
              Ready for transactions
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Edge Detail */}
      <div className="mt-4 flex justify-center">
        <div className="w-16 h-1 rounded-full bg-gray-700" />
      </div>
    </div>
  );
}
