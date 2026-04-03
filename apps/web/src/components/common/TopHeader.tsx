"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, Mic, Sparkles } from "lucide-react";
import { LiveDot } from "./LiveDot";
import { LanguageToggle } from "./LanguageToggle";
import { useSocket } from "@/hooks/useSocket";
import { NotificationCenter } from "./NotificationCenter";

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Aaj ka hisaab" },
  "/udhari": { title: "Udhari Book", subtitle: "Sabki udhari ek jagah" },
  "/forecast": { title: "Cash Flow Forecast", subtitle: "Aane wale din ka hisaab" },
  "/customers": { title: "Customers", subtitle: "Apne grahak" },
  "/gst": { title: "GST Autopilot", subtitle: "Tax compliance on autopilot" },
  "/schemes": { title: "Government Schemes", subtitle: "Sarkari yojnayein" },
  "/employees": { title: "Employees", subtitle: "Apni team" },
  "/whatsapp": { title: "WhatsApp", subtitle: "Business messaging" },
  "/soundbox": { title: "Soundbox", subtitle: "Payment alerts" },
  "/chat": { title: "AI Chat", subtitle: "MunimAI se baat karein" },
};

export function TopHeader() {
  const pathname = usePathname();
  const { isConnected } = useSocket();
  const page = PAGE_TITLES[pathname] || PAGE_TITLES["/"];

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-gray-200/60 bg-white/80 backdrop-blur-xl px-6 py-3 lg:px-8">
      {/* Left: Page Title */}
      <div className="flex items-center gap-3 min-w-0 pl-12 lg:pl-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#002E6E] tracking-tight">
              {page.title}
            </h1>
            {isConnected && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-semibold">
                <LiveDot />
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 font-medium hidden sm:block">
            {page.subtitle}
          </p>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div className="hidden md:flex flex-1 max-w-md mx-4">
        <div className="relative w-full group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-[#00BAF2] transition-colors" />
          <input
            type="text"
            placeholder="Search transactions, customers, udhari..."
            className="w-full h-9 pl-10 pr-4 rounded-xl border border-gray-200 bg-gray-50/50 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]/40 focus:bg-white transition-all"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-mono text-gray-400 border border-gray-200">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Language Toggle */}
        <LanguageToggle className="hidden sm:flex" />

        {/* AI Sparkle */}
        <button className="hidden sm:flex h-9 items-center gap-1.5 px-3 rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] text-white text-xs font-semibold shadow-lg shadow-[#00BAF2]/20 hover:shadow-[#00BAF2]/40 transition-all hover:scale-[1.02] active:scale-[0.98]">
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Muneem</span>
        </button>

        {/* Voice Input */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#00BAF2]/10 text-[#00BAF2] hover:bg-[#00BAF2]/20 transition-all hover:scale-105 active:scale-95"
          aria-label="Voice input"
        >
          <Mic className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00BAF2] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00BAF2]" />
          </span>
        </button>

        {/* Notifications */}
        <NotificationCenter />

        {/* User Avatar */}
        <div className="hidden sm:flex h-9 w-9 rounded-xl bg-gradient-to-br from-[#002E6E] to-[#00BAF2] items-center justify-center text-white text-xs font-bold cursor-pointer hover:shadow-lg hover:shadow-[#00BAF2]/20 transition-all hover:scale-105">
          SS
        </div>
      </div>
    </header>
  );
}
