"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LiveDot } from "./LiveDot";
import { useSocket } from "@/hooks/useSocket";
import { PayScoreGauge } from "@/components/dashboard/PayScoreGauge";
import {
  LayoutDashboard,
  BookOpen,
  TrendingUp,
  Users,
  FileText,
  Landmark,
  UserCircle,
  MessageCircle,
  MessageSquare,
  Volume2,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Award,
  RefreshCw,
  Truck,
  Receipt,
  Package,
  LogOut,
} from "lucide-react";
import { clearMunimAuth } from "@/components/common/AuthGuard";

interface NavItem {
  label: string;
  labelHindi: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const navItems: NavItem[] = [
  { label: "Dashboard", labelHindi: "डैशबोर्ड", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Udhari Book", labelHindi: "उधारी बही", icon: BookOpen, href: "/udhari" },
  { label: "Cash Flow", labelHindi: "नकद प्रवाह", icon: TrendingUp, href: "/forecast" },
  { label: "Customers", labelHindi: "ग्राहक", icon: Users, href: "/customers" },
  { label: "GST Autopilot", labelHindi: "जीएसटी", icon: FileText, href: "/gst" },
  { label: "PayScore", labelHindi: "पेस्कोर", icon: Award, href: "/payscore" },
  { label: "Govt Schemes", labelHindi: "सरकारी योजना", icon: Landmark, href: "/schemes" },
  { label: "Employees", labelHindi: "कर्मचारी", icon: UserCircle, href: "/employees" },
  { label: "AutoPay", labelHindi: "ऑटोपे", icon: RefreshCw, href: "/autopay" },
  { label: "Invoices", labelHindi: "बिल/इनवॉइस", icon: Receipt, href: "/invoices" },
  { label: "Inventory", labelHindi: "इन्वेंटरी", icon: Package, href: "/inventory" },
  { label: "Vendor Ledger", labelHindi: "विक्रेता खाता", icon: Truck, href: "/vendors" },
  { label: "WhatsApp", labelHindi: "वॉट्सऐप", icon: MessageCircle, href: "/whatsapp" },
  { label: "Soundbox", labelHindi: "साउंडबॉक्स", icon: Volume2, href: "/soundbox" },
  { label: "Chat with Muneem", labelHindi: "मुनीम से बात", icon: MessageSquare, href: "/chat" },
];

interface SidebarProps {
  payScore?: number;
}

export function Sidebar({ payScore = 74 }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isConnected } = useSocket();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className={cn(
        "flex items-center gap-3 px-5 py-6 border-b border-gray-100/80",
        collapsed && "justify-center px-3"
      )}>
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden shadow-lg">
          <img src="/logo-munim.png" alt="MunimAI" className="h-10 w-10 object-cover" />
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-lg font-bold text-[#002E6E] tracking-tight">
              MunimAI
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400 font-medium">Digital Muneem</span>
              {isConnected && <LiveDot />}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Menu
          </p>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.href}
              onClick={() => {
                router.push(item.href);
                setMobileOpen(false);
              }}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                collapsed && "justify-center px-2",
                active
                  ? "bg-[#00BAF2]/10 text-[#002E6E] shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-[#00BAF2]" />
              )}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  active ? "text-[#00BAF2]" : "text-gray-400 group-hover:text-gray-600"
                )}
              />
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
              {active && !collapsed && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#00BAF2]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section — PayScore + Merchant */}
      <div className={cn(
        "border-t border-gray-100/80 p-4",
        collapsed && "p-2"
      )}>
        {!collapsed ? (
          <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white p-4 border border-gray-100">
            <div className="flex items-center gap-3">
              <PayScoreGauge score={payScore} size="sm" showLabel={false} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900">PayScore</p>
                <p className="text-[11px] text-gray-400">Credit Health</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#002E6E] to-[#00BAF2] flex items-center justify-center text-white text-xs font-bold">
                SS
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">Sunita Saree Shop</p>
                <p className="text-[10px] text-gray-400">Jaipur, Rajasthan</p>
              </div>
            </div>
            <button
              onClick={() => { clearMunimAuth(); router.push("/login"); }}
              className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <PayScoreGauge score={payScore} size="sm" showLabel={false} />
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#002E6E] to-[#00BAF2] flex items-center justify-center text-white text-[10px] font-bold">
              SS
            </div>
            <button
              onClick={() => { clearMunimAuth(); router.push("/login"); }}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Collapse Button — desktop only */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="hidden lg:flex items-center justify-center h-10 border-t border-gray-100/80 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg border border-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 bg-white border-r border-gray-200/60 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.05)] transition-all duration-300",
          collapsed ? "lg:w-[72px]" : "lg:w-64"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Spacer to push main content */}
      <div
        className={cn(
          "hidden lg:block shrink-0 transition-all duration-300",
          collapsed ? "lg:w-[72px]" : "lg:w-64"
        )}
      />
    </>
  );
}
