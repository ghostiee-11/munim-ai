"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  Receipt,
  Plus,
  X,
  IndianRupee,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  CreditCard,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from "lucide-react";

// ---------- Types ----------

interface InvoiceLineItem {
  name: string;
  description?: string;
  qty: number;
  rate: number;
  hsn_code: string;
  gst_rate: number;
  item_total: number;
  gst_amount: number;
  cgst: number;
  sgst: number;
  total_with_gst: number;
}

interface Invoice {
  id: string;
  merchant_id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone?: string;
  items: string;
  items_parsed?: InvoiceLineItem[];
  subtotal: number;
  gst_total: number;
  total_gst?: number;
  cgst: number;
  sgst: number;
  total: number;
  grand_total?: number;
  amount_paid: number;
  status: "unpaid" | "paid" | "partial";
  payment_mode?: string;
  notes?: string;
  invoice_date: string;
  created_at: string;
}

// ---------- Component ----------

export default function InvoicesPage() {
  const toast = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sharePhone, setSharePhone] = useState("");
  const [sharingId, setSharingId] = useState<string | null>(null);

  // Create form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lineItems, setLineItems] = useState([{ name: "", qty: 1, rate: 0 }]);
  const [discountPct, setDiscountPct] = useState(0);
  const [creating, setCreating] = useState(false);

  // Fetch invoices
  const fetchInvoices = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${DEMO_MERCHANT_ID}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch {
      // Use empty array on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Summary stats
  const summary = useMemo(() => {
    const total = invoices.length;
    const paid = invoices.filter((i) => i.status === "paid").length;
    const unpaid = invoices.filter((i) => i.status !== "paid").length;
    const gstCollected = invoices.reduce((s, i) => s + (i.gst_total || i.total_gst || 0 || 0), 0);
    const totalRevenue = invoices.reduce((s, i) => s + (i.total || i.grand_total || 0 || 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
    return { total, paid, unpaid, gstCollected, totalRevenue, totalPaid };
  }, [invoices]);

  // Create invoice
  const handleCreate = async () => {
    if (!customerName.trim()) {
      toast.error("Customer name required");
      return;
    }
    const validItems = lineItems.filter((i) => i.name.trim() && i.rate > 0);
    if (validItems.length === 0) {
      toast.error("Add at least one item with name and rate");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          customer_name: customerName,
          customer_phone: customerPhone || null,
          items: validItems.map((i) => ({
            name: i.name,
            qty: i.qty,
            rate: i.rate,
          })),
          discount_pct: discountPct,
        }),
      });
      if (res.ok) {
        toast.success("Invoice created successfully!");
        setShowCreate(false);
        setCustomerName("");
        setCustomerPhone("");
        setLineItems([{ name: "", qty: 1, rate: 0 }]);
        setDiscountPct(0);
        fetchInvoices();
      } else {
        toast.error("Failed to create invoice");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCreating(false);
    }
  };

  // Mark paid
  const handlePay = async (invoiceId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        toast.success("Invoice marked as paid");
        fetchInvoices();
      }
    } catch {
      toast.error("Failed to update");
    }
  };

  // Share via WhatsApp
  const handleShare = async (invoiceId: string) => {
    if (!sharePhone.trim()) {
      toast.error("Enter phone number");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/invoices/${invoiceId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: sharePhone }),
      });
      if (res.ok) {
        toast.success("Invoice shared on WhatsApp!");
        setSharingId(null);
        setSharePhone("");
      }
    } catch {
      toast.error("Failed to share");
    }
  };

  // Line item helpers
  const addLineItem = () => setLineItems([...lineItems, { name: "", qty: 1, rate: 0 }]);
  const removeLineItem = (idx: number) => {
    if (lineItems.length > 1) setLineItems(lineItems.filter((_, i) => i !== idx));
  };
  const updateLineItem = (idx: number, field: string, value: string | number) => {
    const updated = [...lineItems];
    (updated[idx] as Record<string, string | number>)[field] = value;
    setLineItems(updated);
  };

  const parseItems = (inv: Invoice): InvoiceLineItem[] => {
    if (inv.items_parsed && inv.items_parsed.length > 0) return inv.items_parsed;
    try {
      return typeof inv.items === "string" ? JSON.parse(inv.items) : inv.items || [];
    } catch {
      return [];
    }
  };

  const statusConfig = {
    paid: { label: "Paid", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: CheckCircle2 },
    partial: { label: "Partial", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: Clock },
    unpaid: { label: "Unpaid", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertCircle },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">Create, manage, and share invoices with GST</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#00BAF2] text-white rounded-xl font-medium hover:bg-[#00BAF2]/90 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create Invoice
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Invoices", value: summary.total.toString(), icon: Receipt, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Paid", value: summary.paid.toString(), icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Unpaid", value: summary.unpaid.toString(), icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
          { label: "GST Collected", value: formatINR(summary.gstCollected), icon: IndianRupee, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-xl", card.bg)}>
                <card.icon className={cn("h-5 w-5", card.color)} />
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-lg font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Invoice List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">All Invoices</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No invoices yet. Create your first one!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {invoices.map((inv) => {
              const sc = statusConfig[inv.status] || statusConfig.unpaid;
              const StatusIcon = sc.icon;
              const items = parseItems(inv);
              const isExpanded = expandedId === inv.id;

              return (
                <div key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                  >
                    <div className={cn("p-2 rounded-lg", sc.bg)}>
                      <StatusIcon className={cn("h-4 w-4", sc.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 text-sm">{inv.invoice_number}</span>
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", sc.bg, sc.color, sc.border)}>
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {inv.customer_name} &middot; {inv.invoice_date?.slice(0, 10)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900 text-sm">{formatINR(inv.total || inv.grand_total || 0)}</p>
                      <p className="text-[10px] text-gray-400">GST: {formatINR(inv.gst_total || inv.total_gst || 0)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {inv.status !== "paid" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePay(inv.id); }}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                          title="Mark Paid"
                        >
                          <CreditCard className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setSharingId(sharingId === inv.id ? null : inv.id); }}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                        title="Share on WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Share input */}
                  <AnimatePresence>
                    {sharingId === inv.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-5 pb-3">
                          <input
                            type="text"
                            placeholder="+91XXXXXXXXXX"
                            value={sharePhone}
                            onChange={(e) => setSharePhone(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                          />
                          <button
                            onClick={() => handleShare(inv.id)}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
                          >
                            <Send className="h-3.5 w-3.5" /> Send
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-4">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-100">
                                <th className="text-left py-2 font-medium">Item</th>
                                <th className="text-right py-2 font-medium">HSN</th>
                                <th className="text-right py-2 font-medium">Qty</th>
                                <th className="text-right py-2 font-medium">Rate</th>
                                <th className="text-right py-2 font-medium">GST%</th>
                                <th className="text-right py-2 font-medium">CGST</th>
                                <th className="text-right py-2 font-medium">SGST</th>
                                <th className="text-right py-2 font-medium">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item, idx) => (
                                <tr key={idx} className="border-b border-gray-50">
                                  <td className="py-2 text-gray-900">{item.name}</td>
                                  <td className="py-2 text-right text-gray-500">{item.hsn_code}</td>
                                  <td className="py-2 text-right">{item.qty}</td>
                                  <td className="py-2 text-right">{formatINR(item.rate)}</td>
                                  <td className="py-2 text-right">{item.gst_rate}%</td>
                                  <td className="py-2 text-right text-gray-500">{formatINR(item.cgst)}</td>
                                  <td className="py-2 text-right text-gray-500">{formatINR(item.sgst)}</td>
                                  <td className="py-2 text-right font-medium">{formatINR(item.total_with_gst)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-3 flex justify-end">
                            <div className="text-xs space-y-1 text-right">
                              <p className="text-gray-500">Subtotal: <span className="text-gray-900 font-medium">{formatINR(inv.subtotal)}</span></p>
                              <p className="text-gray-500">CGST: <span className="text-gray-900">{formatINR(inv.cgst)}</span> | SGST: <span className="text-gray-900">{formatINR(inv.sgst)}</span></p>
                              <p className="text-gray-900 font-bold text-sm">Grand Total: {formatINR(inv.total || inv.grand_total || 0)}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-lg">Create Invoice</h3>
                <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Customer */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Customer Name *</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Sharma ji"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Phone (optional)</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91XXXXXXXXXX"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                </div>

                {/* Items */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-2 block">Items</label>
                  <div className="space-y-2">
                    {lineItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateLineItem(idx, "name", e.target.value)}
                          placeholder="Item name"
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                        />
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) => updateLineItem(idx, "qty", Number(e.target.value))}
                          placeholder="Qty"
                          min={1}
                          className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                        />
                        <input
                          type="number"
                          value={item.rate || ""}
                          onChange={(e) => updateLineItem(idx, "rate", Number(e.target.value))}
                          placeholder="Rate"
                          min={0}
                          className="w-24 px-2 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                        />
                        <button
                          onClick={() => removeLineItem(idx)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={addLineItem}
                    className="mt-2 text-xs text-[#00BAF2] font-medium hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Item
                  </button>
                </div>

                {/* Discount */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Discount %</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={discountPct || ""}
                      onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                      min={0}
                      max={100}
                      placeholder="0"
                      className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                    <div className="flex gap-1">
                      {[5, 10, 15, 20].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDiscountPct(d)}
                          className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                            discountPct === d
                              ? "bg-[#00BAF2] text-white border-[#00BAF2]"
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          {d}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subtotal preview */}
                {(() => {
                  const subtotal = lineItems.reduce((s, i) => s + (i.qty * i.rate), 0);
                  const discAmt = Math.round(subtotal * discountPct / 100);
                  const afterDisc = subtotal - discAmt;
                  return (
                    <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span>
                        <span className="font-medium text-gray-900">{formatINR(subtotal)}</span>
                      </div>
                      {discountPct > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount ({discountPct}%)</span>
                          <span className="font-medium">-{formatINR(discAmt)}</span>
                        </div>
                      )}
                      {discountPct > 0 && (
                        <div className="flex justify-between text-gray-900 pt-1 border-t border-gray-200">
                          <span className="font-medium">After Discount</span>
                          <span className="font-bold">{formatINR(afterDisc)}</span>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">GST will be auto-calculated on {discountPct > 0 ? "discounted" : ""} amount</p>
                    </div>
                  );
                })()}
              </div>

              <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-5 py-2 bg-[#00BAF2] text-white text-sm font-medium rounded-xl hover:bg-[#00BAF2]/90 disabled:opacity-50 transition-colors"
                >
                  {creating ? "Creating..." : "Create Invoice"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
