"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import Link from "next/link";
import {
  Truck,
  Package,
  ShoppingCart,
  Zap,
  Wrench,
  MoreHorizontal,
  Calendar,
  Clock,
  AlertTriangle,
  TrendingDown,
  IndianRupee,
  Phone,
  ArrowUpRight,
  ChevronRight,
  Plus,
  X,
  Trash2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";

// ---------- Types ----------

interface Vendor {
  id: string;
  merchant_id: string;
  name: string;
  category: string;
  phone: string | null;
  upi_id?: string | null;
  total_payable: number;
  overdue_amount: number;
  last_payment_date: string | null;
  last_payment_amount: number;
  next_due_date: string | null;
  next_due_amount: number;
  credit_days: number;
  is_active: boolean;
  autopay_active?: boolean;
}

interface UpcomingPayment {
  vendor_id: string;
  vendor_name: string;
  amount: number;
  due_date: string;
  category: string;
  days_until_due: number;
}

interface AgingBucket {
  label: string;
  amount: number;
  color: string;
  bgColor: string;
}

// ---------- Constants ----------

const VENDOR_CATEGORY_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    label: string;
  }
> = {
  raw_material: {
    icon: Package,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    label: "Raw Material",
  },
  supplier: {
    icon: Package,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    label: "Supplier",
  },
  packaging: {
    icon: Package,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    label: "Packaging",
  },
  logistics: {
    icon: Truck,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    label: "Logistics",
  },
  retail: {
    icon: ShoppingCart,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    label: "Retail",
  },
  utility: {
    icon: Zap,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    label: "Utility",
  },
  rent: {
    icon: Zap,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    label: "Rent",
  },
  services: {
    icon: Wrench,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    label: "Services",
  },
  other: {
    icon: MoreHorizontal,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    label: "Other",
  },
};

// ---------- Demo Data ----------

const DEMO_VENDORS: Vendor[] = [
  {
    id: "v_1",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Gupta Fabric Traders",
    category: "raw_material",
    phone: "+91-98765-43210",
    total_payable: 85000,
    overdue_amount: 25000,
    last_payment_date: "2026-03-20",
    last_payment_amount: 40000,
    next_due_date: "2026-04-10",
    next_due_amount: 30000,
    credit_days: 30,
    is_active: true,
  },
  {
    id: "v_2",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Rajesh Transport Co.",
    category: "logistics",
    phone: "+91-98765-11111",
    total_payable: 18000,
    overdue_amount: 0,
    last_payment_date: "2026-04-01",
    last_payment_amount: 12000,
    next_due_date: "2026-04-15",
    next_due_amount: 18000,
    credit_days: 15,
    is_active: true,
  },
  {
    id: "v_3",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Sharma Packaging",
    category: "raw_material",
    phone: "+91-99876-54321",
    total_payable: 42000,
    overdue_amount: 12000,
    last_payment_date: "2026-03-10",
    last_payment_amount: 20000,
    next_due_date: "2026-04-08",
    next_due_amount: 22000,
    credit_days: 30,
    is_active: true,
  },
  {
    id: "v_4",
    merchant_id: DEMO_MERCHANT_ID,
    name: "JVVNL Electricity",
    category: "utility",
    phone: null,
    total_payable: 3500,
    overdue_amount: 0,
    last_payment_date: "2026-03-20",
    last_payment_amount: 3200,
    next_due_date: "2026-04-20",
    next_due_amount: 3500,
    credit_days: 0,
    is_active: true,
  },
  {
    id: "v_5",
    merchant_id: DEMO_MERCHANT_ID,
    name: "Agarwal Dye Works",
    category: "services",
    phone: "+91-91234-56789",
    total_payable: 65000,
    overdue_amount: 35000,
    last_payment_date: "2026-02-28",
    last_payment_amount: 30000,
    next_due_date: "2026-04-05",
    next_due_amount: 30000,
    credit_days: 45,
    is_active: true,
  },
  {
    id: "v_6",
    merchant_id: DEMO_MERCHANT_ID,
    name: "City Courier Services",
    category: "logistics",
    phone: "+91-98000-12345",
    total_payable: 8500,
    overdue_amount: 0,
    last_payment_date: "2026-03-30",
    last_payment_amount: 4500,
    next_due_date: "2026-04-30",
    next_due_amount: 8500,
    credit_days: 30,
    is_active: true,
  },
];

const DEMO_AGING: AgingBucket[] = [
  { label: "0-30 days", amount: 148500, color: "text-emerald-700", bgColor: "bg-emerald-50" },
  { label: "31-60 days", amount: 47000, color: "text-amber-700", bgColor: "bg-amber-50" },
  { label: "61-90 days", amount: 25000, color: "text-orange-700", bgColor: "bg-orange-50" },
  { label: "90+ days", amount: 0, color: "text-red-700", bgColor: "bg-red-50" },
];

// ---------- Helpers ----------

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ---------- Modal Shell ----------

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

// ---------- Sub-Components ----------

function VendorCategoryIcon({
  category,
  size = "md",
}: {
  category: string;
  size?: "sm" | "md" | "lg";
}) {
  const config = VENDOR_CATEGORY_CONFIG[category] || VENDOR_CATEGORY_CONFIG.other;
  const Icon = config.icon;
  const sizeClasses = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" };
  const iconSizeClasses = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" };
  return (
    <div
      className={cn(
        "rounded-xl flex items-center justify-center",
        sizeClasses[size],
        config.bgColor
      )}
    >
      <Icon className={cn(iconSizeClasses[size], config.color)} />
    </div>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  iconBg,
  trend,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  trend?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {title}
          </p>
          <p className="text-2xl font-bold text-[#002E6E] mt-1">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div
          className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
      {trend && (
        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
          <TrendingDown className="h-3 w-3" />
          {trend}
        </p>
      )}
    </motion.div>
  );
}

function VendorCard({
  vendor,
  onDelete,
  onPayNow,
  onSetAutoPay,
  onWhatsAppNotify,
}: {
  vendor: Vendor;
  onDelete: (vendor: Vendor) => void;
  onPayNow: (vendor: Vendor) => void;
  onSetAutoPay: (vendor: Vendor) => void;
  onWhatsAppNotify: (vendor: Vendor) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config =
    VENDOR_CATEGORY_CONFIG[vendor.category] || VENDOR_CATEGORY_CONFIG.other;
  const days = vendor.next_due_date ? daysUntil(vendor.next_due_date) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-lg transition-all"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <VendorCategoryIcon category={vendor.category} size="lg" />
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              {vendor.name}
            </h4>
            <p className="text-xs text-gray-400">{config.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {vendor.autopay_active && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <RefreshCw className="h-2.5 w-2.5" />
              AutoPay
            </span>
          )}
          {vendor.overdue_amount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              Overdue
            </span>
          )}
          <button
            onClick={() => onDelete(vendor)}
            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
            title="Delete vendor"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-2xl font-bold text-[#002E6E]">
          {formatINR(vendor.total_payable)}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Total Payable</p>
      </div>

      {vendor.overdue_amount > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>
            {formatINR(vendor.overdue_amount)} overdue
          </span>
        </div>
      )}

      {vendor.next_due_date && days !== null && (
        <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
          <Calendar className="h-3.5 w-3.5" />
          <span>
            Next: {formatShortDate(vendor.next_due_date)} -{" "}
            {formatINR(vendor.next_due_amount)}
          </span>
          <span
            className={cn(
              "ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full",
              days <= 3
                ? "bg-red-50 text-red-600"
                : days <= 7
                ? "bg-amber-50 text-amber-600"
                : "bg-gray-50 text-gray-500"
            )}
          >
            {days === 0
              ? "Today"
              : days === 1
              ? "Tomorrow"
              : days < 0
              ? `${Math.abs(days)}d overdue`
              : `${days}d`}
          </span>
        </div>
      )}

      {vendor.last_payment_date && (
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
          <Clock className="h-3.5 w-3.5" />
          <span>
            Last paid: {formatINR(vendor.last_payment_amount)} on{" "}
            {formatShortDate(vendor.last_payment_date)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full",
            config.bgColor,
            config.color
          )}
        >
          {config.label}
        </span>
        {vendor.credit_days > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
            {vendor.credit_days}d credit
          </span>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
        {vendor.phone && (
          <a
            href={`tel:${vendor.phone}`}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#002E6E] transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
            Call
          </a>
        )}

        {vendor.total_payable > 0 && (
          <button
            onClick={() => onPayNow(vendor)}
            className="flex items-center gap-1 text-xs font-medium text-white bg-[#002E6E] hover:bg-[#003d8f] px-3 py-1.5 rounded-lg transition-colors"
          >
            <IndianRupee className="h-3 w-3" />
            Pay Now
          </button>
        )}

        <button
          onClick={() => onSetAutoPay(vendor)}
          className="flex items-center gap-1 text-xs font-medium text-[#00BAF2] hover:text-[#002E6E] border border-[#00BAF2]/30 hover:border-[#002E6E]/30 px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          {vendor.autopay_active ? "Edit AutoPay" : "Set AutoPay"}
        </button>

        {vendor.total_payable > 0 && (
          <button
            onClick={() => onWhatsAppNotify(vendor)}
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors ml-auto"
            title="Send WhatsApp reminder"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#002E6E] transition-colors ml-auto"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
          {expanded ? "Hide" : "Details"}
        </button>
      </div>

      {/* Expandable Details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-gray-400">Phone:</span> {vendor.phone || "N/A"}</div>
            <div><span className="text-gray-400">Category:</span> {config.label}</div>
            <div><span className="text-gray-400">Credit:</span> {vendor.credit_days > 0 ? `${vendor.credit_days} days` : "COD"}</div>
            <div><span className="text-gray-400">Outstanding:</span> <span className="font-semibold text-gray-900">{formatINR(vendor.total_payable)}</span></div>
            {vendor.overdue_amount > 0 && (
              <div><span className="text-gray-400">Overdue:</span> <span className="font-semibold text-red-500">{formatINR(vendor.overdue_amount)}</span></div>
            )}
            {vendor.last_payment_date && (
              <div><span className="text-gray-400">Last Paid:</span> {formatINR(vendor.last_payment_amount)} on {formatShortDate(vendor.last_payment_date)}</div>
            )}
          </div>
          {vendor.autopay_active && (
            <div className="bg-emerald-50 rounded-lg px-3 py-2 text-emerald-700 text-[11px]">
              AutoPay active — linked to recurring payments
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------- Main Page ----------

export default function VendorLedgerPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [aging, setAging] = useState<AgingBucket[]>(DEMO_AGING);
  const toast = useToast();

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showAutoPayModal, setShowAutoPayModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  // Add Vendor form state
  const [addForm, setAddForm] = useState({
    name: "",
    phone: "",
    upi_id: "",
    category: "supplier",
    payment_terms: "COD",
    amount: "",
  });
  const [addLoading, setAddLoading] = useState(false);

  // Pay Now form state
  const [payForm, setPayForm] = useState({ amount: "", mode: "UPI" });
  const [payLoading, setPayLoading] = useState(false);

  // AutoPay form state
  const [autoPayForm, setAutoPayForm] = useState({
    amount: "",
    frequency: "monthly",
    auto_approve: false,
    start_date: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
  });
  const [autoPayLoading, setAutoPayLoading] = useState(false);

  // Fetch from Supabase via API
  const fetchVendors = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/vendors/${DEMO_MERCHANT_ID}`);
      if (res.ok) {
        const data = await res.json();
        // Map API fields to frontend interface
        const mapped = data.map((v: Record<string, unknown>) => ({
          ...v,
          total_payable: Number(v.outstanding || v.total_payable || 0),
          overdue_amount: Number(v.overdue || v.overdue_amount || 0),
          last_payment_date: v.last_payment_date || null,
          last_payment_amount: Number(v.last_payment_amount || 0),
          next_due_date: v.next_due_date || null,
          next_due_amount: Number(v.next_due_amount || 0),
          credit_days: Number(v.credit_days || (v.payment_terms === "30_days" ? 30 : v.payment_terms === "15_days" ? 15 : 0)),
          autopay_active: v.has_autopay || false,
        }));
        setVendors(mapped);
      }
    } catch {
      setVendors(DEMO_VENDORS);
    }
  };

  useEffect(() => {
    fetchVendors();
    async function fetchAging() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/vendors/payables/${DEMO_MERCHANT_ID}/aging`);
        if (res.ok) {
          const data = await res.json();
          // API returns {current, 0_30, 30_60, 60_90, 90_plus} — transform to AgingBucket[]
          const buckets: AgingBucket[] = [
            { label: "0-30 days", amount: (data.current || 0) + (data["0_30"] || 0), color: "text-emerald-600", bgColor: "bg-emerald-500" },
            { label: "31-60 days", amount: data["30_60"] || 0, color: "text-amber-600", bgColor: "bg-amber-500" },
            { label: "61-90 days", amount: data["60_90"] || 0, color: "text-orange-600", bgColor: "bg-orange-500" },
            { label: "90+ days", amount: data["90_plus"] || 0, color: "text-red-600", bgColor: "bg-red-500" },
          ];
          setAging(buckets);
        }
      } catch {
        // fallback
      }
    }
    fetchAging();
  }, []);

  // Compute upcoming payments (next 14 days)
  const upcomingPayments: UpcomingPayment[] = useMemo(() => {
    return vendors
      .filter((v) => v.is_active && v.next_due_date)
      .map((v) => ({
        vendor_id: v.id,
        vendor_name: v.name,
        amount: v.next_due_amount,
        due_date: v.next_due_date!,
        category: v.category,
        days_until_due: daysUntil(v.next_due_date!),
      }))
      .filter((p) => p.days_until_due >= -7 && p.days_until_due <= 14)
      .sort((a, b) => a.days_until_due - b.days_until_due);
  }, [vendors]);

  // Summary stats
  const totalPayable = useMemo(
    () => vendors.filter((v) => v.is_active).reduce((s, v) => s + v.total_payable, 0),
    [vendors]
  );
  const totalOverdue = useMemo(
    () => vendors.filter((v) => v.is_active).reduce((s, v) => s + v.overdue_amount, 0),
    [vendors]
  );
  const activeVendorCount = vendors.filter((v) => v.is_active).length;

  // AP Aging total for progress bars
  const agingTotal = useMemo(
    () => aging.reduce((s, b) => s + b.amount, 0),
    [aging]
  );

  // ---------- Handlers ----------

  const handleAddVendor = async () => {
    if (!addForm.name.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vendors/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          name: addForm.name,
          phone: addForm.phone || null,
          upi_id: addForm.upi_id || null,
          category: addForm.category,
          payment_terms: addForm.payment_terms,
        }),
      });
      if (res.ok) {
        const newVendor = await res.json();
        // If amount provided, create a payable too
        const amt = parseFloat(addForm.amount);
        if (amt > 0) {
          try {
            await fetch(`${API_BASE_URL}/api/vendors/payables/`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                merchant_id: DEMO_MERCHANT_ID,
                vendor_name: addForm.name,
                vendor_id: newVendor.id,
                amount: amt,
                description: `Opening balance - ${addForm.name}`,
              }),
            });
          } catch { /* payable creation failed silently */ }
        }
        await fetchVendors(); // Refetch to get updated outstanding
        toast.success(`${addForm.name} added!`);
      } else {
        // Add locally if API fails
        const localVendor: Vendor = {
          id: `v_${Date.now()}`,
          merchant_id: DEMO_MERCHANT_ID,
          name: addForm.name,
          category: addForm.category,
          phone: addForm.phone || null,
          upi_id: addForm.upi_id || null,
          total_payable: 0,
          overdue_amount: 0,
          last_payment_date: null,
          last_payment_amount: 0,
          next_due_date: null,
          next_due_amount: 0,
          credit_days: addForm.payment_terms === "30 days" ? 30 : addForm.payment_terms === "15 days" ? 15 : 0,
          is_active: true,
        };
        setVendors((prev) => [...prev, localVendor]);
        toast.success(`${addForm.name} added locally!`);
      }
    } catch {
      // Add locally on network failure
      const localVendor: Vendor = {
        id: `v_${Date.now()}`,
        merchant_id: DEMO_MERCHANT_ID,
        name: addForm.name,
        category: addForm.category,
        phone: addForm.phone || null,
        upi_id: addForm.upi_id || null,
        total_payable: 0,
        overdue_amount: 0,
        last_payment_date: null,
        last_payment_amount: 0,
        next_due_date: null,
        next_due_amount: 0,
        credit_days: addForm.payment_terms === "30 days" ? 30 : addForm.payment_terms === "15 days" ? 15 : 0,
        is_active: true,
      };
      setVendors((prev) => [...prev, localVendor]);
      toast.success(`${addForm.name} added locally!`);
    } finally {
      setAddLoading(false);
      setShowAddModal(false);
      setAddForm({ name: "", phone: "", upi_id: "", category: "supplier", payment_terms: "COD", amount: "" });
    }
  };

  const handleDeleteVendor = async (vendor: Vendor) => {
    if (!confirm(`Delete ${vendor.name}?`)) return;
    try {
      await fetch(`${API_BASE_URL}/api/vendors/${vendor.id}`, {
        method: "DELETE",
      });
    } catch {
      // Remove locally regardless
    }
    setVendors((prev) => prev.filter((v) => v.id !== vendor.id));
    toast.success(`${vendor.name} removed`);
  };

  const handlePayNow = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setPayForm({ amount: String(vendor.total_payable), mode: "UPI" });
    setShowPayModal(true);
  };

  const handlePaySubmit = async () => {
    if (!selectedVendor || !payForm.amount) return;
    setPayLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/vendors/payables/${selectedVendor.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          amount: Number(payForm.amount),
          payment_mode: payForm.mode,
        }),
      });
    } catch {
      // Update locally regardless
    }
    const paidAmount = Number(payForm.amount);
    setVendors((prev) =>
      prev.map((v) =>
        v.id === selectedVendor.id
          ? {
              ...v,
              total_payable: Math.max(0, v.total_payable - paidAmount),
              overdue_amount: Math.max(0, v.overdue_amount - paidAmount),
              last_payment_date: new Date().toISOString().split("T")[0],
              last_payment_amount: paidAmount,
            }
          : v
      )
    );
    toast.success(`${formatINR(paidAmount)} paid to ${selectedVendor.name}!`);
    setPayLoading(false);
    setShowPayModal(false);
    setSelectedVendor(null);
  };

  const handleSetAutoPay = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setAutoPayForm({
      amount: String(vendor.next_due_amount || vendor.total_payable),
      frequency: "monthly",
      auto_approve: false,
      start_date: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    });
    setShowAutoPayModal(true);
  };

  const handleAutoPaySubmit = async () => {
    if (!selectedVendor || !autoPayForm.amount) return;
    setAutoPayLoading(true);
    try {
      await fetch(`${API_BASE_URL}/api/vendors/${selectedVendor.id}/set-autopay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          amount: Number(autoPayForm.amount),
          frequency: autoPayForm.frequency,
          auto_approve: autoPayForm.auto_approve,
        }),
      });
    } catch {
      // Update locally regardless
    }
    setVendors((prev) =>
      prev.map((v) =>
        v.id === selectedVendor.id ? { ...v, autopay_active: true } : v
      )
    );
    toast.success(`AutoPay set for ${selectedVendor.name}!`);
    setAutoPayLoading(false);
    setShowAutoPayModal(false);
    setSelectedVendor(null);
  };

  const handleWhatsAppNotify = async (vendor: Vendor) => {
    try {
      await fetch(`${API_BASE_URL}/api/vendors/${vendor.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          type: "payment_reminder",
        }),
      });
    } catch {
      // Show toast regardless
    }
    toast.success("Reminder sent!");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#002E6E] to-[#00BAF2] flex items-center justify-center shadow-lg shadow-[#00BAF2]/20">
              <Truck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#002E6E]">
                Vendor Ledger
              </h1>
              <p className="text-sm text-gray-500">
                Accounts Payable &amp; Vendor Management
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Track vendor payments, overdue amounts, and AP aging at a glance.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#002E6E] text-white text-sm font-semibold hover:bg-[#003d8f] shadow-lg shadow-[#002E6E]/20 transition-all"
        >
          <Plus className="h-4 w-4" />
          Add Vendor
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Payable"
          value={formatINR(totalPayable)}
          subtitle="Across all active vendors"
          icon={IndianRupee}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <SummaryCard
          title="Overdue"
          value={formatINR(totalOverdue)}
          subtitle={
            totalOverdue > 0
              ? `${vendors.filter((v) => v.overdue_amount > 0).length} vendors with overdue`
              : "No overdue payments"
          }
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          trend={totalOverdue > 0 ? "Needs attention" : undefined}
        />
        <SummaryCard
          title="Active Vendors"
          value={String(activeVendorCount)}
          subtitle="Vendors with open balances"
          icon={Truck}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
      </div>

      {/* Upcoming Payments + AP Aging side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Payments */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#00BAF2]" />
              Upcoming Payments
            </h2>
            <span className="text-xs text-gray-400">Next 14 days</span>
          </div>
          <div className="space-y-3">
            {upcomingPayments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No upcoming payments
              </p>
            ) : (
              upcomingPayments.map((p) => (
                <div
                  key={p.vendor_id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <VendorCategoryIcon category={p.category} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.vendor_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatShortDate(p.due_date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-[#002E6E]">
                      {formatINR(p.amount)}
                    </p>
                    <span
                      className={cn(
                        "text-[11px] font-medium px-2 py-0.5 rounded-full",
                        p.days_until_due <= 0
                          ? "bg-red-50 text-red-600"
                          : p.days_until_due <= 3
                          ? "bg-amber-50 text-amber-600"
                          : "bg-blue-50 text-blue-600"
                      )}
                    >
                      {p.days_until_due === 0
                        ? "Today"
                        : p.days_until_due < 0
                        ? `${Math.abs(p.days_until_due)}d overdue`
                        : p.days_until_due === 1
                        ? "Tomorrow"
                        : `${p.days_until_due}d`}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
              ))
            )}
          </div>
        </motion.div>

        {/* AP Aging */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-gray-200 bg-white p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-[#00BAF2]" />
              AP Aging Summary
            </h2>
            <span className="text-xs text-gray-400">
              Total: {formatINR(agingTotal)}
            </span>
          </div>
          <div className="space-y-4">
            {aging.map((bucket) => {
              const pct = agingTotal > 0 ? (bucket.amount / agingTotal) * 100 : 0;
              return (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-700">
                      {bucket.label}
                    </span>
                    <span className={cn("text-sm font-bold", bucket.color)}>
                      {formatINR(bucket.amount)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                      className={cn("h-full rounded-full", bucket.bgColor.replace("bg-", "bg-"))}
                      style={{
                        backgroundColor:
                          bucket.label === "0-30 days"
                            ? "#34d399"
                            : bucket.label === "31-60 days"
                            ? "#fbbf24"
                            : bucket.label === "61-90 days"
                            ? "#fb923c"
                            : "#f87171",
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {pct.toFixed(0)}% of total payable
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Vendor Cards */}
      <div>
        <h2 className="text-lg font-semibold text-[#002E6E] mb-4">
          All Vendors ({activeVendorCount})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors
            .filter((v) => v.is_active)
            .map((vendor) => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                onDelete={handleDeleteVendor}
                onPayNow={handlePayNow}
                onSetAutoPay={handleSetAutoPay}
                onWhatsAppNotify={handleWhatsAppNotify}
              />
            ))}
        </div>
      </div>

      {/* ===== Modals ===== */}
      <AnimatePresence>
        {/* Add Vendor Modal */}
        {showAddModal && (
          <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Vendor">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddVendor();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Vendor name"
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Phone</label>
                <input
                  type="text"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91-XXXXX-XXXXX"
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">UPI ID (optional)</label>
                <input
                  type="text"
                  value={addForm.upi_id}
                  onChange={(e) => setAddForm((f) => ({ ...f, upi_id: e.target.value }))}
                  placeholder="vendor@upi"
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Category</label>
                <select
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                >
                  <option value="supplier">Supplier</option>
                  <option value="packaging">Packaging</option>
                  <option value="logistics">Logistics</option>
                  <option value="rent">Rent</option>
                  <option value="services">Services</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Payment Terms</label>
                <select
                  value={addForm.payment_terms}
                  onChange={(e) => setAddForm((f) => ({ ...f, payment_terms: e.target.value }))}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                >
                  <option value="COD">COD</option>
                  <option value="15 days">15 days</option>
                  <option value="30 days">30 days</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Opening Balance (Rs)</label>
                <input
                  type="number"
                  placeholder="0 (if no dues)"
                  value={addForm.amount}
                  onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Amount owed to this vendor</p>
              </div>
              <button
                type="submit"
                disabled={addLoading}
                className="w-full h-11 rounded-xl bg-[#002E6E] text-white font-semibold text-sm hover:bg-[#003d8f] transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {addLoading ? "Adding..." : "Add Vendor"}
              </button>
            </form>
          </Modal>
        )}

        {/* Pay Now Modal */}
        {showPayModal && selectedVendor && (
          <Modal
            open={showPayModal}
            onClose={() => {
              setShowPayModal(false);
              setSelectedVendor(null);
            }}
            title={`Pay ${selectedVendor.name}`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handlePaySubmit();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Amount (Rs)</label>
                <input
                  type="number"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">
                  Outstanding: {formatINR(selectedVendor.total_payable)}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Payment Mode</label>
                <select
                  value={payForm.mode}
                  onChange={(e) => setPayForm((f) => ({ ...f, mode: e.target.value }))}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                >
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank Transfer</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={payLoading}
                className="w-full h-11 rounded-xl bg-[#002E6E] text-white font-semibold text-sm hover:bg-[#003d8f] transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {payLoading ? "Processing..." : `Pay ${payForm.amount ? formatINR(Number(payForm.amount)) : ""}`}
              </button>
            </form>
          </Modal>
        )}

        {/* Set AutoPay Modal */}
        {showAutoPayModal && selectedVendor && (
          <Modal
            open={showAutoPayModal}
            onClose={() => {
              setShowAutoPayModal(false);
              setSelectedVendor(null);
            }}
            title={`AutoPay - ${selectedVendor.name}`}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAutoPaySubmit();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Amount (Rs)</label>
                <input
                  type="number"
                  value={autoPayForm.amount}
                  onChange={(e) => setAutoPayForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Frequency</label>
                <select
                  value={autoPayForm.frequency}
                  onChange={(e) => setAutoPayForm((f) => ({ ...f, frequency: e.target.value }))}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Start Date</label>
                <input
                  type="date"
                  value={autoPayForm.start_date}
                  onChange={(e) => setAutoPayForm((f) => ({ ...f, start_date: e.target.value }))}
                  className="w-full h-10 px-4 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]"
                />
              </div>
              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-medium text-gray-700">Auto-approve payments</label>
                <button
                  type="button"
                  onClick={() => setAutoPayForm((f) => ({ ...f, auto_approve: !f.auto_approve }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    autoPayForm.auto_approve ? "bg-[#00BAF2]" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm",
                      autoPayForm.auto_approve ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
              <button
                type="submit"
                disabled={autoPayLoading}
                className="w-full h-11 rounded-xl bg-[#002E6E] text-white font-semibold text-sm hover:bg-[#003d8f] transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {autoPayLoading ? "Setting up..." : "Enable AutoPay"}
              </button>
              <Link
                href="/autopay"
                className="block w-full text-center text-xs font-medium text-[#00BAF2] hover:underline mt-1"
              >
                Manage all AutoPay settings
              </Link>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
