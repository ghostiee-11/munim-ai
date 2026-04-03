"use client";

import { cn } from "@/lib/utils";

export interface QuickReplyOption {
  label: string;
  value: string;
  variant?: "default" | "primary" | "danger";
}

interface QuickReplyButtonsProps {
  options: QuickReplyOption[];
  onSelect?: (value: string) => void;
}

export default function QuickReplyButtons({
  options,
  onSelect,
}: QuickReplyButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-3 py-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect?.(option.value)}
          className={cn(
            "px-4 py-2 rounded-full text-sm font-medium border transition-colors active:scale-95",
            option.variant === "primary" &&
              "border-[#00BAF2] text-[#00BAF2] bg-blue-50 hover:bg-[#00BAF2] hover:text-white",
            option.variant === "danger" &&
              "border-red-400 text-red-500 bg-red-50 hover:bg-red-500 hover:text-white",
            (!option.variant || option.variant === "default") &&
              "border-gray-300 text-gray-700 bg-white hover:bg-gray-100"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
