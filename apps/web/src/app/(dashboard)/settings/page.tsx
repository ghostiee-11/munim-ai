"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Store,
  Globe,
  Bell,
  Link as LinkIcon,
  Download,
  Shield,
  Info,
  LogOut,
  Trash2,
  Check,
  ChevronRight,
  Clock,
  MessageSquare,
  Smartphone,
  AlertTriangle,
  X,
  ExternalLink,
  Star,
  HelpCircle,
} from "lucide-react";

/* ─── LANGUAGES ─── */
const LANGUAGES = [
  { id: "hi", label: "Hindi - हिन्दी" },
  { id: "en", label: "English" },
  { id: "ta", label: "Tamil - தமிழ்" },
  { id: "te", label: "Telugu - తెలుగు" },
  { id: "bn", label: "Bengali - বাংলা" },
  { id: "mr", label: "Marathi - मराठी" },
  { id: "gu", label: "Gujarati - ગુજરાતી" },
  { id: "kn", label: "Kannada - ಕನ್ನಡ" },
  { id: "ml", label: "Malayalam - മലയാളം" },
  { id: "pa", label: "Punjabi - ਪੰਜਾਬੀ" },
  { id: "or", label: "Odia - ଓଡ଼ିଆ" },
];

const BUSINESS_TYPES = [
  { id: "textile", label: "Saree / Textile" },
  { id: "kirana", label: "Kirana / Grocery" },
  { id: "restaurant", label: "Restaurant" },
  { id: "electronics", label: "Electronics" },
  { id: "hardware", label: "Hardware" },
  { id: "pharmacy", label: "Pharmacy" },
  { id: "other", label: "Other" },
];

/* ─── TOGGLE COMPONENT ─── */
function Toggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-[#00BAF2]" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

/* ─── TOAST ─── */
function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-[#002E6E] px-5 py-3 text-sm font-medium text-white shadow-xl"
    >
      <Check className="h-4 w-4 text-[#00BAF2]" />
      {message}
    </motion.div>
  );
}

/* ─── SECTION WRAPPER ─── */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <Icon className="h-4 w-4 text-[#00BAF2]" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

/* ─── FIELD ROW ─── */
function FieldRow({
  label,
  children,
  description,
}: {
  label: string;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 first:pt-0 last:pb-0 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="sm:w-64 shrink-0">{children}</div>
    </div>
  );
}

/* ─── CONFIRM DIALOG ─── */
function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-500 mb-6">{description}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── MAIN ─── */
export default function SettingsPage() {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Profile
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState("textile");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");

  // Preferences
  const [language, setLanguage] = useState("hi");
  const [briefingTime, setBriefingTime] = useState("09:00");
  const [aggressiveness, setAggressiveness] = useState<"conservative" | "moderate" | "aggressive">("moderate");

  // Connected Accounts
  const [paytmConnected, setPaytmConnected] = useState(false);

  // Notifications
  const [whatsappAlerts, setWhatsappAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [dailyBriefing, setDailyBriefing] = useState(true);
  const [cashCrunchAlerts, setCashCrunchAlerts] = useState(true);
  const [collectionUpdates, setCollectionUpdates] = useState(true);

  // Load from localStorage
  useEffect(() => {
    setShopName(localStorage.getItem("shop_name") || "");
    setOwnerName(localStorage.getItem("merchant_name") || "");
    try {
      const auth = JSON.parse(localStorage.getItem("munim_auth") || "{}");
      setPhone(auth.phone || "+919876543210");
    } catch { setPhone("+919876543210"); }
    setBusinessType(localStorage.getItem("business_type") || "textile");
    setCity(localStorage.getItem("city") || "");
    setPincode(localStorage.getItem("pincode") || "");
    setLanguage(localStorage.getItem("preferred_language") || "hi");
    setPaytmConnected(localStorage.getItem("paytm_connected") === "true");

    // Load notifications prefs
    const notifs = localStorage.getItem("notification_prefs");
    if (notifs) {
      try {
        const p = JSON.parse(notifs);
        if (p.whatsappAlerts !== undefined) setWhatsappAlerts(p.whatsappAlerts);
        if (p.smsAlerts !== undefined) setSmsAlerts(p.smsAlerts);
        if (p.dailyBriefing !== undefined) setDailyBriefing(p.dailyBriefing);
        if (p.cashCrunchAlerts !== undefined) setCashCrunchAlerts(p.cashCrunchAlerts);
        if (p.collectionUpdates !== undefined) setCollectionUpdates(p.collectionUpdates);
      } catch {
        // ignore
      }
    }
  }, []);

  const saveProfile = useCallback(() => {
    localStorage.setItem("shop_name", shopName);
    localStorage.setItem("merchant_name", ownerName);
    localStorage.setItem("business_type", businessType);
    localStorage.setItem("city", city);
    localStorage.setItem("pincode", pincode);
    setToast("Profile saved successfully!");
  }, [shopName, ownerName, businessType, city, pincode]);

  const savePreferences = useCallback(() => {
    localStorage.setItem("preferred_language", language);
    localStorage.setItem("briefing_time", briefingTime);
    localStorage.setItem("collection_aggressiveness", aggressiveness);
    setToast("Preferences updated!");
  }, [language, briefingTime, aggressiveness]);

  const saveNotifications = useCallback(() => {
    localStorage.setItem(
      "notification_prefs",
      JSON.stringify({ whatsappAlerts, smsAlerts, dailyBriefing, cashCrunchAlerts, collectionUpdates })
    );
    setToast("Notification preferences saved!");
  }, [whatsappAlerts, smsAlerts, dailyBriefing, cashCrunchAlerts, collectionUpdates]);

  const handleExport = useCallback((type: string) => {
    setToast(`${type} PDF downloading...`);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.clear();
    router.push("/login");
  }, [router]);

  const handleDeleteAccount = useCallback(() => {
    localStorage.clear();
    router.push("/login");
  }, [router]);

  const inputClass =
    "w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all";
  const selectClass =
    "w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all appearance-none cursor-pointer";

  return (
    <>
      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#002E6E]">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your account, preferences, and connected services
          </p>
        </div>

        <div className="space-y-6">
          {/* ────── Profile + Preferences (side by side on desktop) ────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ────── Profile ────── */}
          <Section icon={User} title="Profile">
            <div className="space-y-1">
              <FieldRow label="Shop Name" description="Your business display name">
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder="Enter shop name"
                  className={inputClass}
                />
              </FieldRow>
              <FieldRow label="Owner Name">
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Enter owner name"
                  className={inputClass}
                />
              </FieldRow>
              <FieldRow label="Phone Number" description="Cannot be changed">
                <input
                  type="text"
                  value={phone}
                  readOnly
                  className="w-full rounded-xl border border-gray-100 bg-gray-100 px-4 py-2.5 text-sm text-gray-400 cursor-not-allowed"
                />
              </FieldRow>
              <FieldRow label="Business Type">
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className={selectClass}
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {bt.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="City">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Enter city"
                  className={inputClass}
                />
              </FieldRow>
              <FieldRow label="Pincode">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter pincode"
                  className={inputClass}
                />
              </FieldRow>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={saveProfile}
                className="rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl transition-all active:scale-[0.98]"
              >
                Save Profile
              </button>
            </div>
          </Section>

          {/* ────── Preferences ────── */}
          <Section icon={Globe} title="Preferences">
            <div className="space-y-1">
              <FieldRow label="Language" description="MunimAI will respond in this language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className={selectClass}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow
                label="Morning Briefing Time"
                description="Daily summary of your business"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <input
                    type="time"
                    value={briefingTime}
                    onChange={(e) => setBriefingTime(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </FieldRow>
              <div className="py-3 border-b border-gray-50 last:border-0">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Collection Aggressiveness
                </p>
                <p className="text-xs text-gray-400 mb-4">
                  How actively should MunimAI remind customers about pending payments?
                </p>
                <div className="space-y-3">
                  {(
                    [
                      {
                        value: "conservative",
                        label: "Conservative",
                        labelHi: "नम्र",
                        desc: "Gentle reminders only after due date, max once a week",
                      },
                      {
                        value: "moderate",
                        label: "Moderate",
                        labelHi: "संतुलित",
                        desc: "Reminders before and after due date, twice a week",
                      },
                      {
                        value: "aggressive",
                        label: "Aggressive",
                        labelHi: "सख्त",
                        desc: "Frequent reminders with escalation, daily if overdue",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                        aggressiveness === opt.value
                          ? "border-[#00BAF2] bg-[#00BAF2]/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="aggressiveness"
                        value={opt.value}
                        checked={aggressiveness === opt.value}
                        onChange={() => setAggressiveness(opt.value)}
                        className="mt-0.5 accent-[#00BAF2]"
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {opt.label}{" "}
                          <span className="text-gray-400 font-normal">
                            ({opt.labelHi})
                          </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {opt.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={savePreferences}
                className="rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl transition-all active:scale-[0.98]"
              >
                Save Preferences
              </button>
            </div>
          </Section>
          </div>

          {/* ────── Connected Accounts + Notifications (side by side) ────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ────── Connected Accounts ────── */}
          <Section icon={LinkIcon} title="Connected Accounts">
            <div className="space-y-4">
              {/* Paytm */}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00BAF2]/10">
                    <span className="text-lg font-extrabold text-[#00BAF2]">P</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Paytm</p>
                    <p className="text-xs text-gray-400">Merchant Account</p>
                  </div>
                </div>
                {paytmConnected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
                    <Check className="h-3 w-3" />
                    Connected
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setPaytmConnected(true);
                      localStorage.setItem("paytm_connected", "true");
                      setToast("Paytm connected!");
                    }}
                    className="rounded-xl bg-[#00BAF2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#00a8d9] transition-colors"
                  >
                    Connect
                  </button>
                )}
              </div>

              {/* Bank Account */}
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
                    <Shield className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Bank Account
                    </p>
                    <p className="text-xs text-gray-400">
                      Via Account Aggregator
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
                  Coming Soon
                </span>
              </div>

              {/* WhatsApp Business */}
              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
                    <MessageSquare className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      WhatsApp Business
                    </p>
                    <p className="text-xs text-gray-400">
                      Send reminders & invoices
                    </p>
                  </div>
                </div>
                <button className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  Connect
                </button>
              </div>
            </div>
          </Section>

          {/* ────── Notifications ────── */}
          <Section icon={Bell} title="Notifications">
            <div className="space-y-1">
              <FieldRow label="WhatsApp Alerts" description="Payment & reminder notifications via WhatsApp">
                <div className="flex justify-end">
                  <Toggle enabled={whatsappAlerts} onChange={(v) => { setWhatsappAlerts(v); }} />
                </div>
              </FieldRow>
              <FieldRow label="SMS Alerts" description="Fallback SMS when WhatsApp is unavailable">
                <div className="flex justify-end">
                  <Toggle enabled={smsAlerts} onChange={(v) => { setSmsAlerts(v); }} />
                </div>
              </FieldRow>
              <FieldRow label="Daily Briefing" description="Morning summary of yesterday's business">
                <div className="flex justify-end">
                  <Toggle enabled={dailyBriefing} onChange={(v) => { setDailyBriefing(v); }} />
                </div>
              </FieldRow>
              <FieldRow label="Cash Crunch Alerts" description="Get warned when cash flow is predicted to dip">
                <div className="flex justify-end">
                  <Toggle enabled={cashCrunchAlerts} onChange={(v) => { setCashCrunchAlerts(v); }} />
                </div>
              </FieldRow>
              <FieldRow label="Collection Updates" description="Status updates on pending collections">
                <div className="flex justify-end">
                  <Toggle enabled={collectionUpdates} onChange={(v) => { setCollectionUpdates(v); }} />
                </div>
              </FieldRow>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={saveNotifications}
                className="rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl transition-all active:scale-[0.98]"
              >
                Save Notifications
              </button>
            </div>
          </Section>
          </div>

          {/* ────── Data Export + About (side by side) ────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ────── Data Export ────── */}
          <Section icon={Download} title="Data Export">
            <div className="space-y-3">
              {[
                { label: "Export Monthly P&L", desc: "Profit & Loss statement as PDF" },
                { label: "Export GST Summary", desc: "GST-ready tax summary" },
                { label: "Export Customer Data", desc: "All customer records as CSV" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => handleExport(item.label.replace("Export ", ""))}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-5 py-3.5 hover:bg-gray-50 hover:border-gray-300 transition-all group"
                >
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {item.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <Download className="h-4 w-4 text-gray-400 group-hover:text-[#00BAF2] transition-colors" />
                </button>
              ))}
            </div>
          </Section>

          {/* ────── About ────── */}
          <Section icon={Info} title="About">
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <p className="text-sm text-gray-600">MunimAI Version</p>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-mono font-semibold text-gray-600">
                  v1.0.0
                </span>
              </div>
              <div className="border-t border-gray-100" />
              <button className="w-full flex items-center justify-between py-2 text-sm text-gray-700 hover:text-[#00BAF2] transition-colors group">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Help & Support
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#00BAF2]" />
              </button>
              <button className="w-full flex items-center justify-between py-2 text-sm text-gray-700 hover:text-[#00BAF2] transition-colors group">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Rate Us
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#00BAF2]" />
              </button>
            </div>
          </Section>
          </div>

          {/* ────── Danger Zone ────── */}
          <div className="rounded-2xl border-2 border-red-100 bg-red-50/30 overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-red-100">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-semibold text-red-600">
                Danger Zone
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Log Out</p>
                  <p className="text-xs text-gray-400">
                    Sign out of your MunimAI account on this device
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </button>
              </div>
              <div className="border-t border-red-100" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-red-600">
                    Delete Account
                  </p>
                  <p className="text-xs text-gray-400">
                    Permanently delete your account and all data. This cannot be
                    undone.
                  </p>
                </div>
                <button
                  onClick={() => setDeleteDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom spacing */}
        <div className="h-12" />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast message={toast} onClose={() => setToast("")} />}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Account"
        description="Are you sure you want to delete your account? All your data including transactions, customer records, and settings will be permanently deleted. This action cannot be undone."
        confirmLabel="Yes, Delete My Account"
        onConfirm={() => {
          setDeleteDialogOpen(false);
          handleDeleteAccount();
        }}
        onCancel={() => setDeleteDialogOpen(false)}
      />
    </>
  );
}
