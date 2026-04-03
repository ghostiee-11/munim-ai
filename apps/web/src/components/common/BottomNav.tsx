"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  BookOpen,
  Mic,
  MessageCircle,
  MoreHorizontal,
} from "lucide-react";

export type TabId = "home" | "udhari" | "voice" | "whatsapp" | "more";

interface BottomNavProps {
  activeTab?: TabId;
  onTabChange?: (tab: TabId) => void;
  className?: string;
}

interface NavItem {
  id: TabId;
  label: string;
  hindiLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const navItems: NavItem[] = [
  { id: "home", label: "Home", hindiLabel: "होम", icon: Home, href: "/dashboard" },
  { id: "udhari", label: "Udhari", hindiLabel: "उधारी", icon: BookOpen, href: "/udhari" },
  { id: "voice", label: "Voice", hindiLabel: "आवाज़", icon: Mic, href: "/soundbox" },
  { id: "whatsapp", label: "WhatsApp", hindiLabel: "वॉट्सऐप", icon: MessageCircle, href: "/whatsapp" },
  { id: "more", label: "More", hindiLabel: "और", icon: MoreHorizontal, href: "/forecast" },
];

/**
 * Mobile bottom tab navigation with 5 tabs.
 * The Voice tab has a larger circular mic button.
 * Navigates to actual pages using Next.js router.
 */
export function BottomNav({
  activeTab: controlledTab,
  onTabChange,
  className,
}: BottomNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [internalTab, setInternalTab] = useState<TabId>("home");

  // Determine active tab from URL
  const tabFromPath = navItems.find(item => item.href === pathname)?.id || "home";
  const activeTab = controlledTab ?? tabFromPath;

  function handleTabPress(tab: TabId) {
    setInternalTab(tab);
    onTabChange?.(tab);
    const item = navItems.find(i => i.id === tab);
    if (item) router.push(item.href);
  }

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white pb-safe",
        className
      )}
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-16 max-w-lg items-end justify-around px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const isVoice = item.id === "voice";
          const Icon = item.icon;

          if (isVoice) {
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                aria-label={`${item.label} - ${item.hindiLabel}`}
                onClick={() => handleTabPress(item.id)}
                className="relative -mt-5 flex flex-col items-center"
              >
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-200",
                    isActive
                      ? "bg-munim-primary scale-110 shadow-munim-primary/40"
                      : "bg-munim-primary/90 hover:bg-munim-primary"
                  )}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span
                  className={cn(
                    "mt-1 text-[10px] font-medium",
                    isActive
                      ? "text-munim-primary"
                      : "text-munim-text-secondary"
                  )}
                >
                  {item.hindiLabel}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isActive}
              aria-label={`${item.label} - ${item.hindiLabel}`}
              onClick={() => handleTabPress(item.id)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors duration-200",
                isActive
                  ? "text-munim-primary"
                  : "text-munim-text-secondary hover:text-munim-text-primary"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-munim-primary" : "text-munim-text-secondary"
                )}
              />
              <span className="text-[10px] font-medium">{item.hindiLabel}</span>
              {isActive && (
                <span className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-munim-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
