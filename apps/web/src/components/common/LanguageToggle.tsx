"use client";

import { motion } from "framer-motion";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang } = useLanguage();

  return (
    <button
      onClick={() => setLang(lang === "hi" ? "en" : "hi")}
      className={cn(
        "relative flex h-8 w-[72px] items-center rounded-full bg-gray-100 border border-gray-200 p-0.5 text-xs font-semibold transition-colors hover:bg-gray-150",
        className
      )}
      aria-label={`Switch to ${lang === "hi" ? "English" : "Hindi"}`}
    >
      <motion.div
        className="absolute h-7 w-[34px] rounded-full bg-white shadow-sm border border-gray-200/60"
        animate={{ x: lang === "hi" ? 0 : 34 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
      <span
        className={cn(
          "relative z-10 flex-1 text-center transition-colors",
          lang === "hi" ? "text-[#002E6E]" : "text-gray-400"
        )}
      >
        हिं
      </span>
      <span
        className={cn(
          "relative z-10 flex-1 text-center transition-colors",
          lang === "en" ? "text-[#002E6E]" : "text-gray-400"
        )}
      >
        EN
      </span>
    </button>
  );
}
