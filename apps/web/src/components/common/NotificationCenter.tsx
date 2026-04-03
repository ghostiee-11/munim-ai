"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Bell,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type NotificationType = "alert" | "insight" | "action" | "info";
type TabKey = "all" | "alert" | "insight" | "action";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timeAgo: string;
  read: boolean;
  href: string;
}

const ICON_MAP: Record<NotificationType, { icon: typeof AlertCircle; color: string; bg: string }> = {
  alert: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
  insight: { icon: Lightbulb, color: "text-yellow-500", bg: "bg-yellow-50" },
  action: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-50" },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "alert", label: "Alerts" },
  { key: "insight", label: "Insights" },
  { key: "action", label: "Actions" },
];

const DEMO_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    type: "alert",
    title: "Cash crunch alert",
    body: "Cash crunch 12 din mein. Rs 45,000 short hoga",
    timeAgo: "2 min ago",
    read: false,
    href: "/forecast",
  },
  {
    id: "2",
    type: "insight",
    title: "PayScore improved",
    body: "PayScore 72 se 74 badha. 6 points aur chahiye loan ke liye",
    timeAgo: "15 min ago",
    read: false,
    href: "/dashboard",
  },
  {
    id: "3",
    type: "action",
    title: "Udhari payment received",
    body: "3 udhari reminders bheje. 1 payment aa gaya Rs 8,000",
    timeAgo: "1 hr ago",
    read: false,
    href: "/udhari",
  },
  {
    id: "4",
    type: "info",
    title: "GSTR-3B deadline",
    body: "GSTR-3B 18 din mein due. Sab ready hai",
    timeAgo: "2 hr ago",
    read: false,
    href: "/gst",
  },
  {
    id: "5",
    type: "alert",
    title: "High expense detected",
    body: "Aaj ka expense Rs 38,000 — average se 45% zyada",
    timeAgo: "3 hr ago",
    read: true,
    href: "/forecast",
  },
  {
    id: "6",
    type: "insight",
    title: "Festival revenue prediction",
    body: "Ram Navami pe Rs 1,20,000 revenue expected. Stock ready rakhein",
    timeAgo: "5 hr ago",
    read: true,
    href: "/forecast",
  },
  {
    id: "7",
    type: "action",
    title: "WhatsApp campaign sent",
    body: "50 customers ko Akshaya Tritiya offer bheja gaya",
    timeAgo: "8 hr ago",
    read: true,
    href: "/whatsapp",
  },
  {
    id: "8",
    type: "info",
    title: "New govt scheme available",
    body: "PMEGP scheme mein Rs 10L tak ka loan available. Check karein",
    timeAgo: "1 day ago",
    read: true,
    href: "/schemes",
  },
  {
    id: "9",
    type: "action",
    title: "Auto-save activated",
    body: "Rs 2,000 auto-saved today from high-revenue period",
    timeAgo: "1 day ago",
    read: true,
    href: "/forecast",
  },
  {
    id: "10",
    type: "insight",
    title: "Weekly trend",
    body: "Is hafte revenue 12% upar gaya last week se. Keep it up!",
    timeAgo: "2 days ago",
    read: true,
    href: "/dashboard",
  },
];

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");
  const [notifications, setNotifications] = useState(DEMO_NOTIFICATIONS);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered =
    tab === "all" ? notifications : notifications.filter((n) => n.type === tab);

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClick = (n: Notification) => {
    markAsRead(n.id);
    setOpen(false);
    router.push(n.href);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 w-[350px] max-h-[500px] bg-white rounded-2xl border border-gray-200 shadow-2xl shadow-black/10 overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] font-semibold text-[#00BAF2] hover:underline"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pb-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors",
                    tab === t.key
                      ? "bg-[#00BAF2]/10 text-[#002E6E]"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto max-h-[380px] divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-xs text-gray-400">
                  No notifications
                </div>
              ) : (
                filtered.map((n) => {
                  const cfg = ICON_MAP[n.type];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={cn(
                        "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors",
                        !n.read && "bg-blue-50/30"
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                          cfg.bg
                        )}
                      >
                        <Icon className={cn("w-4 h-4", cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p
                            className={cn(
                              "text-xs font-semibold truncate",
                              n.read ? "text-gray-500" : "text-gray-900"
                            )}
                          >
                            {n.title}
                          </p>
                          {!n.read && (
                            <span className="h-2 w-2 rounded-full bg-[#00BAF2] shrink-0" />
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-[11px] leading-relaxed mt-0.5",
                            n.read ? "text-gray-400" : "text-gray-600"
                          )}
                        >
                          {n.body}
                        </p>
                        <p className="text-[10px] text-gray-300 mt-1">{n.timeAgo}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
