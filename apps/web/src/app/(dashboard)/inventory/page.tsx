"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatINR, DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import {
  Package,
  Plus,
  X,
  IndianRupee,
  AlertTriangle,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Edit3,
  BarChart3,
  Search,
  Camera,
  Upload,
  FileImage,
} from "lucide-react";

// ---------- Types ----------

interface InventoryItem {
  id: string;
  merchant_id: string;
  item_name: string;
  sku?: string;
  category?: string;
  current_qty: number;
  unit: string;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  hsn_code?: string;
  stock_value?: number;
  potential_revenue?: number;
  stock_status?: "ok" | "low" | "out";
}

// ---------- Component ----------

export default function InventoryPage() {
  const toast = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);

  // Add form state
  const [form, setForm] = useState({
    item_name: "",
    sku: "",
    category: "",
    current_qty: 0,
    unit: "pcs",
    cost_price: 0,
    selling_price: 0,
    reorder_level: 10,
  });
  const [saving, setSaving] = useState(false);

  // OCR import state
  const [showOCR, setShowOCR] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrPreview, setOcrPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Adjust form state
  const [adjustDirection, setAdjustDirection] = useState<"in" | "out">("in");
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("manual");

  // Fetch inventory
  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/${DEMO_MERCHANT_ID}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // empty on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Summary
  const summary = useMemo(() => {
    const totalItems = items.length;
    const stockValue = items.reduce((s, i) => s + (i.stock_value || (i.current_qty || 0) * (i.cost_price || 0)), 0);
    const lowStock = items.filter((i) => (i.stock_status === "low" || i.stock_status === "out") || (i.current_qty || 0) <= (i.reorder_level || 0)).length;
    const outOfStock = items.filter((i) => (i.current_qty || 0) <= 0).length;
    return { totalItems, stockValue, lowStock, outOfStock };
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (i) =>
        (i.item_name || "").toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q) ||
        (i.sku || "").toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  // Add item
  const handleAdd = async () => {
    if (!form.item_name.trim()) {
      toast.error("Item name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, merchant_id: DEMO_MERCHANT_ID }),
      });
      if (res.ok) {
        toast.success("Item added!");
        setShowAdd(false);
        setForm({ item_name: "", sku: "", category: "", current_qty: 0, unit: "pcs", cost_price: 0, selling_price: 0, reorder_level: 10 });
        fetchInventory();
      } else {
        toast.error("Failed to add item");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  // Adjust stock
  const handleAdjust = async () => {
    if (!adjustItem || adjustQty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/${adjustItem.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: adjustDirection,
          qty: adjustQty,
          reason: adjustReason,
        }),
      });
      if (res.ok) {
        toast.success(`Stock ${adjustDirection === "in" ? "added" : "removed"}`);
        setAdjustItem(null);
        setAdjustQty(0);
        fetchInventory();
      }
    } catch {
      toast.error("Failed to adjust stock");
    }
  };

  // Delete item
  const handleDelete = async (itemId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Item deleted");
        fetchInventory();
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  // OCR import
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (JPG, PNG)");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large (max 10MB)");
      return;
    }
    handleOCRUpload(file);
  };

  const handleOCRUpload = async (file: File) => {
    setOcrProcessing(true);
    setOcrResult(null);

    // Show preview
    const previewReader = new FileReader();
    previewReader.onload = (e) => setOcrPreview(e.target?.result as string);
    previewReader.readAsDataURL(file);

    // Convert to base64
    const toBase64 = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          resolve(result.split(",")[1]);
        };
        r.onerror = reject;
        r.readAsDataURL(f);
      });

    try {
      const base64 = await toBase64(file);
      const res = await fetch(`${API_BASE_URL}/api/inventory/import-ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          image_base64: base64,
          extraction_type: "invoice",
        }),
      });

      const data = await res.json();
      setOcrResult(data);

      if (data.success) {
        const total = (data.items_created || 0) + (data.items_updated || 0);
        toast.success(`${total} items imported from invoice`);
        fetchInventory();
      } else {
        toast.error(data.error || "OCR extraction failed — try a clearer image");
      }
    } catch {
      toast.error("Failed to process image");
    } finally {
      setOcrProcessing(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setShowOCR(true);
      processFile(file);
    }
  };

  const getStatusStyle = (item: InventoryItem) => {
    const qty = item.current_qty || 0;
    const reorder = item.reorder_level || 0;
    if (qty <= 0) return { label: "Out of Stock", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
    if (qty <= reorder) return { label: "Low Stock", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
    return { label: "In Stock", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  };

  return (
    <div
      className="space-y-6 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Full-page drop overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#00BAF2]/10 backdrop-blur-sm border-4 border-dashed border-[#00BAF2] rounded-3xl pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3 bg-white rounded-2xl p-8 shadow-xl">
              <Upload className="h-12 w-12 text-[#00BAF2]" />
              <p className="text-lg font-semibold text-gray-800">Drop invoice image here</p>
              <p className="text-sm text-gray-500">AI will extract items automatically</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Track stock, costs, and reorder levels</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOCR(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl font-medium hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Camera className="h-4 w-4" />
            Scan Invoice
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#00BAF2] text-white rounded-xl font-medium hover:bg-[#00BAF2]/90 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Items", value: summary.totalItems.toString(), icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Stock Value", value: formatINR(summary.stockValue), icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Low Stock", value: summary.lowStock.toString(), icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Out of Stock", value: summary.outOfStock.toString(), icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items..."
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30 bg-white"
        />
      </div>

      {/* Item Grid */}
      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading inventory...</div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{searchQuery ? "No items match your search" : "No inventory items yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const status = getStatusStyle(item);
            const isLowOrOut = (item.current_qty || 0) <= (item.reorder_level || 0);
            const stockValue = (item.current_qty || 0) * (item.cost_price || 0);

            return (
              <div
                key={item.id}
                className={cn(
                  "bg-white rounded-2xl border p-4 shadow-sm transition-all",
                  isLowOrOut ? "border-red-200 ring-1 ring-red-100" : "border-gray-100"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{item.item_name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {item.category && (
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {item.category}
                        </span>
                      )}
                      {item.sku && (
                        <span className="text-[10px] text-gray-400">SKU: {item.sku}</span>
                      )}
                    </div>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", status.bg, status.color, status.border)}>
                    {status.label}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-gray-500">Quantity</p>
                    <p className={cn("text-sm font-bold", isLowOrOut ? "text-red-600" : "text-gray-900")}>
                      {item.current_qty} {item.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Cost</p>
                    <p className="text-sm font-medium text-gray-700">{formatINR(item.cost_price)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500">Sell</p>
                    <p className="text-sm font-medium text-gray-700">{formatINR(item.selling_price)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                  <div>
                    <p className="text-[10px] text-gray-500">Stock Value</p>
                    <p className="text-xs font-semibold text-gray-900">{formatINR(stockValue)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setAdjustItem(item); setAdjustDirection("in"); setAdjustQty(0); setAdjustReason("manual"); }}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                      title="Adjust Stock"
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Item Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900 text-lg">Add Inventory Item</h3>
                <button onClick={() => setShowAdd(false)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Item Name *</label>
                  <input
                    type="text"
                    value={form.item_name}
                    onChange={(e) => setForm({ ...form, item_name: e.target.value })}
                    placeholder="Banarasi Silk Saree"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">SKU</label>
                    <input
                      type="text"
                      value={form.sku}
                      onChange={(e) => setForm({ ...form, sku: e.target.value })}
                      placeholder="BNS-001"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Saree"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Quantity</label>
                    <input
                      type="number"
                      value={form.current_qty || ""}
                      onChange={(e) => setForm({ ...form, current_qty: Number(e.target.value) })}
                      min={0}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
                    <select
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    >
                      <option value="pcs">Pieces</option>
                      <option value="kg">Kg</option>
                      <option value="mtr">Meters</option>
                      <option value="ltr">Liters</option>
                      <option value="box">Boxes</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Reorder Level</label>
                    <input
                      type="number"
                      value={form.reorder_level || ""}
                      onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
                      min={0}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Cost Price</label>
                    <input
                      type="number"
                      value={form.cost_price || ""}
                      onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
                      min={0}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Sell Price</label>
                    <input
                      type="number"
                      value={form.selling_price || ""}
                      onChange={(e) => setForm({ ...form, selling_price: Number(e.target.value) })}
                      min={0}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={saving}
                  className="px-5 py-2 bg-[#00BAF2] text-white text-sm font-medium rounded-xl hover:bg-[#00BAF2]/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Adding..." : "Add Item"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Adjust Stock Modal */}
      <AnimatePresence>
        {adjustItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => setAdjustItem(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Adjust Stock</h3>
                <button onClick={() => setAdjustItem(null)} className="p-1 rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-sm font-medium text-gray-900">{adjustItem.item_name}</p>
                  <p className="text-xs text-gray-500">Current: {adjustItem.current_qty} {adjustItem.unit}</p>
                </div>

                {/* Direction toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdjustDirection("in")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                      adjustDirection === "in"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <ArrowUpRight className="h-4 w-4" /> Stock In
                  </button>
                  <button
                    onClick={() => setAdjustDirection("out")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors",
                      adjustDirection === "out"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    )}
                  >
                    <ArrowDownRight className="h-4 w-4" /> Stock Out
                  </button>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Quantity</label>
                  <input
                    type="number"
                    value={adjustQty || ""}
                    onChange={(e) => setAdjustQty(Number(e.target.value))}
                    min={1}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Reason</label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/30"
                  >
                    <option value="sale">Sale</option>
                    <option value="purchase">Purchase</option>
                    <option value="return">Return</option>
                    <option value="damage">Damage</option>
                    <option value="manual">Manual Adjustment</option>
                  </select>
                </div>

                {adjustQty > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600">
                    New quantity: <span className="font-bold text-gray-900">
                      {adjustDirection === "in"
                        ? (adjustItem.current_qty || 0) + adjustQty
                        : Math.max(0, (adjustItem.current_qty || 0) - adjustQty)
                      } {adjustItem.unit}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => setAdjustItem(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  className={cn(
                    "px-5 py-2 text-white text-sm font-medium rounded-xl transition-colors",
                    adjustDirection === "in"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-600 hover:bg-red-700"
                  )}
                >
                  {adjustDirection === "in" ? "Add Stock" : "Remove Stock"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OCR Import Modal */}
      <AnimatePresence>
        {showOCR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => { if (!ocrProcessing) { setShowOCR(false); setOcrResult(null); setOcrPreview(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">Import from Invoice</h3>
                  <p className="text-xs text-gray-500 mt-0.5">AI reads your invoice and adds items to inventory</p>
                </div>
                <button
                  onClick={() => { if (!ocrProcessing) { setShowOCR(false); setOcrResult(null); setOcrPreview(null); } }}
                  className="p-1 rounded-lg hover:bg-gray-100"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Upload / Drop area */}
                {!ocrPreview && (
                  <label
                    className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:border-[#00BAF2] hover:bg-blue-50/20 transition-all group"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#00BAF2]", "bg-blue-50/30"); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-[#00BAF2]", "bg-blue-50/30"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("border-[#00BAF2]", "bg-blue-50/30");
                      const file = e.dataTransfer.files?.[0];
                      if (file) processFile(file);
                    }}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 rounded-full bg-blue-50 group-hover:bg-blue-100 transition-colors">
                        <Camera className="h-8 w-8 text-[#00BAF2]" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-700">
                          Drop invoice image here or <span className="text-[#00BAF2]">click to browse</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">Supports JPG, PNG up to 10MB</p>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <div className="h-1 w-1 rounded-full bg-emerald-400" />
                          OpenAI Vision
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <div className="h-1 w-1 rounded-full bg-blue-400" />
                          Groq Llama 4
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                          <div className="h-1 w-1 rounded-full bg-purple-400" />
                          Gemini Flash
                        </div>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) processFile(file);
                      }}
                    />
                  </label>
                )}

                {/* Image preview + processing */}
                {ocrPreview && (
                  <div className="relative rounded-xl overflow-hidden border border-gray-200">
                    <img
                      src={ocrPreview}
                      alt="Invoice preview"
                      className="w-full max-h-52 object-contain bg-gray-50"
                    />
                    {ocrProcessing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                        <div className="flex flex-col items-center gap-3">
                          <div className="relative">
                            <div className="h-10 w-10 border-[3px] border-[#00BAF2]/30 rounded-full" />
                            <div className="absolute inset-0 h-10 w-10 border-[3px] border-[#00BAF2] border-t-transparent rounded-full animate-spin" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-semibold text-gray-700">Reading invoice...</p>
                            <p className="text-xs text-gray-400 mt-0.5">AI is extracting items, quantities & prices</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {!ocrProcessing && !ocrResult && (
                      <button
                        onClick={() => { setOcrPreview(null); }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 shadow hover:bg-white"
                      >
                        <X className="h-4 w-4 text-gray-500" />
                      </button>
                    )}
                  </div>
                )}

                {/* Results */}
                {ocrResult && !ocrProcessing && (
                  <div className="space-y-3">
                    {ocrResult.success ? (
                      <>
                        {/* Provider + vendor info */}
                        <div className="flex items-center gap-2">
                          {ocrResult.provider && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                              via {ocrResult.provider}
                            </span>
                          )}
                          {ocrResult.vendor && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                              Vendor: {ocrResult.vendor}
                            </span>
                          )}
                        </div>

                        {/* Success summary */}
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
                          <div className="p-1.5 rounded-full bg-emerald-100">
                            <Package className="h-4 w-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-800">
                              {(ocrResult.items_created || 0) + (ocrResult.items_updated || 0)} items imported
                            </p>
                            <p className="text-xs text-emerald-600">
                              {ocrResult.items_created || 0} new, {ocrResult.items_updated || 0} updated
                              {ocrResult.skipped > 0 && `, ${ocrResult.skipped} skipped`}
                            </p>
                          </div>
                        </div>

                        {/* Item list */}
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {ocrResult.items?.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{item.item_name}</p>
                                <p className="text-xs text-gray-500">
                                  Qty: {item.qty_added}
                                  {item.cost_price ? ` | Cost: Rs ${Number(item.cost_price).toLocaleString("en-IN")}` : ""}
                                  {item.new_total ? ` | Total now: ${item.new_total}` : ""}
                                </p>
                              </div>
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2 whitespace-nowrap",
                                item.action === "created"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-blue-100 text-blue-700"
                              )}>
                                {item.action === "created" ? "New" : "Updated"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                        <p className="text-sm font-medium text-red-700 mb-1">Extraction failed</p>
                        <p className="text-xs text-red-500">{ocrResult.error || "Could not read items from this image. Try a clearer photo."}</p>
                        <button
                          onClick={() => { setOcrPreview(null); setOcrResult(null); }}
                          className="mt-3 text-xs font-medium text-red-600 hover:text-red-800 underline"
                        >
                          Try another image
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-100">
                {ocrResult && !ocrProcessing ? (
                  <>
                    {ocrResult.success && (
                      <button
                        onClick={() => { setOcrPreview(null); setOcrResult(null); }}
                        className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                      >
                        Scan Another
                      </button>
                    )}
                    <button
                      onClick={() => { setShowOCR(false); setOcrResult(null); setOcrPreview(null); }}
                      className="px-5 py-2 bg-[#00BAF2] text-white text-sm font-medium rounded-xl hover:bg-[#00BAF2]/90 transition-colors"
                    >
                      Done
                    </button>
                  </>
                ) : !ocrProcessing ? (
                  <button
                    onClick={() => { setShowOCR(false); setOcrPreview(null); }}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
