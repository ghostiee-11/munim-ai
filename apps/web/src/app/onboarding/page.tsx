"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
  Smartphone,
  Wrench,
  Pill,
  Building,
  CheckCircle2,
  Loader2,
  Upload,
  Camera,
  Mic,
  PartyPopper,
  Sparkles,
  Link as LinkIcon,
} from "lucide-react";

/* ─── TYPES ─── */
interface Language {
  id: string;
  name: string;
  script: string;
  flag: string;
}

interface BusinessType {
  id: string;
  label: string;
  labelHi: string;
  icon: React.ElementType;
}

/* ─── DATA ─── */
const LANGUAGES: Language[] = [
  { id: "hi", name: "Hindi", script: "हिन्दी", flag: "🇮🇳" },
  { id: "en", name: "English", script: "English", flag: "🇬🇧" },
  { id: "ta", name: "Tamil", script: "தமிழ்", flag: "🇮🇳" },
  { id: "te", name: "Telugu", script: "తెలుగు", flag: "🇮🇳" },
  { id: "bn", name: "Bengali", script: "বাংলা", flag: "🇮🇳" },
  { id: "mr", name: "Marathi", script: "मराठी", flag: "🇮🇳" },
  { id: "gu", name: "Gujarati", script: "ગુજરાતી", flag: "🇮🇳" },
  { id: "kn", name: "Kannada", script: "ಕನ್ನಡ", flag: "🇮🇳" },
  { id: "ml", name: "Malayalam", script: "മലയാളം", flag: "🇮🇳" },
  { id: "pa", name: "Punjabi", script: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { id: "or", name: "Odia", script: "ଓଡ଼ିଆ", flag: "🇮🇳" },
];

const BUSINESS_TYPES: BusinessType[] = [
  { id: "textile", label: "Saree / Textile", labelHi: "साड़ी / टेक्सटाइल", icon: ShoppingBag },
  { id: "kirana", label: "Kirana / Grocery", labelHi: "किराना / ग्रॉसरी", icon: ShoppingCart },
  { id: "restaurant", label: "Restaurant", labelHi: "रेस्टोरेंट", icon: UtensilsCrossed },
  { id: "electronics", label: "Electronics", labelHi: "इलेक्ट्रॉनिक्स", icon: Smartphone },
  { id: "hardware", label: "Hardware", labelHi: "हार्डवेयर", icon: Wrench },
  { id: "pharmacy", label: "Pharmacy", labelHi: "फार्मेसी", icon: Pill },
  { id: "other", label: "Other", labelHi: "अन्य", icon: Building },
];

const STEP_TITLES = [
  "भाषा चुनें",
  "व्यापार का प्रकार",
  "दुकान की जानकारी",
  "Paytm कनेक्ट करें",
  "उधारी इम्पोर्ट",
  "पहला वॉइस कमांड",
];

/* ─── CONFETTI ─── */
function ConfettiEffect() {
  const colors = ["#00BAF2", "#002E6E", "#22C55E", "#F59E0B", "#EF4444", "#7C3AED", "#EC4899"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 60 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 1.5 + Math.random() * 2;
        const size = 6 + Math.random() * 8;
        const color = colors[i % colors.length];
        const rotation = Math.random() * 360;
        return (
          <motion.div
            key={i}
            className="absolute rounded-sm"
            style={{
              left: `${left}%`,
              top: -20,
              width: size,
              height: size * 0.6,
              backgroundColor: color,
              rotate: rotation,
            }}
            initial={{ y: -20, opacity: 1 }}
            animate={{
              y: typeof window !== "undefined" ? window.innerHeight + 20 : 900,
              opacity: [1, 1, 0],
              rotate: rotation + 360 * (Math.random() > 0.5 ? 1 : -1),
              x: (Math.random() - 0.5) * 200,
            }}
            transition={{
              duration,
              delay,
              ease: "easeIn",
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── MAIN ─── */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Step 1
  const [selectedLang, setSelectedLang] = useState("hi");
  // Step 2
  const [selectedBiz, setSelectedBiz] = useState("");
  // Step 3
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [rent, setRent] = useState("");
  const [employees, setEmployees] = useState("");
  // Step 4
  const [paytmConnecting, setPaytmConnecting] = useState(false);
  const [paytmConnected, setPaytmConnected] = useState(false);
  // Step 5
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  // Step 6
  const [showConfetti, setShowConfetti] = useState(false);
  const [wizardDone, setWizardDone] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("munim_auth");
      if (!raw) {
        router.replace("/login");
        return;
      }
      const auth = JSON.parse(raw);
      if (!auth?.merchant_id) {
        router.replace("/login");
        return;
      }
      if (auth.onboarded) {
        router.replace("/dashboard");
      }
    } catch {
      router.replace("/login");
    }
  }, [router]);

  const goNext = useCallback(() => {
    if (step < 5) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }, [step]);

  const handleConnectPaytm = useCallback(async () => {
    setPaytmConnecting(true);
    await new Promise((r) => setTimeout(r, 2000));
    setPaytmConnecting(false);
    setPaytmConnected(true);
  }, []);

  const handleFileUpload = useCallback(async () => {
    setUploading(true);
    await new Promise((r) => setTimeout(r, 2500));
    setUploading(false);
    setUploaded(true);
  }, []);

  const handleFinish = useCallback(() => {
    setShowConfetti(true);
    setWizardDone(true);
    // Save onboarding data — update munim_auth to mark onboarded
    try {
      const raw = localStorage.getItem("munim_auth");
      if (raw) {
        const auth = JSON.parse(raw);
        auth.onboarded = true;
        localStorage.setItem("munim_auth", JSON.stringify(auth));
      }
    } catch {
      // fallback: create auth entry
    }
    localStorage.setItem("preferred_language", selectedLang);
    localStorage.setItem("business_type", selectedBiz);
    if (shopName) localStorage.setItem("shop_name", shopName);
    if (ownerName) localStorage.setItem("merchant_name", ownerName);
    if (city) localStorage.setItem("city", city);
    if (pincode) localStorage.setItem("pincode", pincode);
    localStorage.setItem("paytm_connected", String(paytmConnected));
    setTimeout(() => {
      router.push("/dashboard");
    }, 3000);
  }, [selectedLang, selectedBiz, shopName, ownerName, city, pincode, paytmConnected, router]);

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedLang;
      case 1: return !!selectedBiz;
      case 2: return !!(shopName && ownerName && city);
      default: return true;
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {showConfetti && <ConfettiEffect />}

      {/* Top Bar */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#002E6E] to-[#00BAF2] shadow-lg shadow-[#00BAF2]/20">
            <span className="text-base font-bold text-white">M</span>
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-400 font-medium">
              Step {step + 1} of 6 &mdash; {STEP_TITLES[step]}
            </p>
            {/* Progress bar */}
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#002E6E] to-[#00BAF2]"
                initial={false}
                animate={{ width: `${((step + 1) / 6) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait" custom={direction}>
            {/* ────── Step 1: Language ────── */}
            {step === 0 && (
              <motion.div
                key="lang"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h2 className="text-2xl font-bold text-[#002E6E] mb-2">
                  अपनी भाषा चुनें
                </h2>
                <p className="text-sm text-gray-500 mb-8">
                  Choose your preferred language for MunimAI
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => setSelectedLang(lang.id)}
                      className={`relative flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-5 transition-all hover:shadow-md ${
                        selectedLang === lang.id
                          ? "border-[#00BAF2] bg-[#00BAF2]/5 shadow-md shadow-[#00BAF2]/10"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      {selectedLang === lang.id && (
                        <motion.div
                          layoutId="langCheck"
                          className="absolute top-2 right-2"
                        >
                          <CheckCircle2 className="h-4 w-4 text-[#00BAF2]" />
                        </motion.div>
                      )}
                      <span className="text-2xl">{lang.flag}</span>
                      <span className="text-base font-semibold text-gray-900">
                        {lang.script}
                      </span>
                      <span className="text-xs text-gray-400">{lang.name}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ────── Step 2: Business Type ────── */}
            {step === 1 && (
              <motion.div
                key="biz"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h2 className="text-2xl font-bold text-[#002E6E] mb-2">
                  आपका व्यापार कैसा है?
                </h2>
                <p className="text-sm text-gray-500 mb-8">
                  Select your business type
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {BUSINESS_TYPES.map((biz) => (
                    <button
                      key={biz.id}
                      onClick={() => setSelectedBiz(biz.id)}
                      className={`relative flex flex-col items-center gap-3 rounded-xl border-2 px-4 py-6 transition-all hover:shadow-md ${
                        selectedBiz === biz.id
                          ? "border-[#00BAF2] bg-[#00BAF2]/5 shadow-md shadow-[#00BAF2]/10"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      {selectedBiz === biz.id && (
                        <motion.div
                          layoutId="bizCheck"
                          className="absolute top-2 right-2"
                        >
                          <CheckCircle2 className="h-4 w-4 text-[#00BAF2]" />
                        </motion.div>
                      )}
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                          selectedBiz === biz.id
                            ? "bg-[#00BAF2]/10"
                            : "bg-gray-100"
                        }`}
                      >
                        <biz.icon
                          className={`h-6 w-6 ${
                            selectedBiz === biz.id ? "text-[#00BAF2]" : "text-gray-500"
                          }`}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-900">
                          {biz.labelHi}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {biz.label}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ────── Step 3: Shop Details ────── */}
            {step === 2 && (
              <motion.div
                key="shop"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h2 className="text-2xl font-bold text-[#002E6E] mb-2">
                  दुकान की जानकारी
                </h2>
                <p className="text-sm text-gray-500 mb-8">
                  Tell us about your shop
                </p>
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                      दुकान का नाम <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="e.g. Sunita Saree Shop"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                      मालिक का नाम <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Sunita Sharma"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                        शहर <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="e.g. Lucknow"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                        पिनकोड
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={pincode}
                        onChange={(e) =>
                          setPincode(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="226001"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                        मासिक किराया (optional)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={rent}
                        onChange={(e) =>
                          setRent(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="Rs 15,000"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                        कर्मचारी
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={employees}
                        onChange={(e) =>
                          setEmployees(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder="e.g. 3"
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ────── Step 4: Connect Paytm ────── */}
            {step === 3 && (
              <motion.div
                key="paytm"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h2 className="text-2xl font-bold text-[#002E6E] mb-2">
                  Paytm कनेक्ट करें
                </h2>
                <p className="text-sm text-gray-500 mb-8">
                  Link your Paytm Merchant Account for seamless integration
                </p>
                <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                  {/* Paytm Logo */}
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#00BAF2]/10">
                    <span className="text-3xl font-extrabold text-[#00BAF2]">
                      P
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Paytm Merchant Account
                  </h3>
                  <p className="text-sm text-gray-500 mb-8 max-w-sm mx-auto">
                    Connect your Paytm merchant account to automatically sync
                    transactions, UPI payments, and QR collections.
                  </p>
                  {paytmConnected ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <p className="text-sm font-semibold text-emerald-600">
                        Successfully Connected!
                      </p>
                    </motion.div>
                  ) : (
                    <button
                      onClick={handleConnectPaytm}
                      disabled={paytmConnecting}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#00BAF2] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-70"
                    >
                      {paytmConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <LinkIcon className="h-4 w-4" />
                          Connect Paytm
                        </>
                      )}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ────── Step 5: Import Udhari ────── */}
            {step === 4 && (
              <motion.div
                key="udhari"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <h2 className="text-2xl font-bold text-[#002E6E] mb-2">
                  उधारी बही इम्पोर्ट करें
                </h2>
                <p className="text-sm text-gray-500 mb-8">
                  Upload your existing udhari notebook to digitize it
                </p>
                <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  {uploaded ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      </div>
                      <p className="text-sm font-semibold text-emerald-600">
                        12 entries found!
                      </p>
                      <p className="text-xs text-gray-400">
                        Your udhari entries have been digitized successfully
                      </p>
                    </motion.div>
                  ) : uploading ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <Loader2 className="h-10 w-10 text-[#00BAF2] animate-spin" />
                      <p className="text-sm font-medium text-gray-600">
                        Processing your notebook...
                      </p>
                      <p className="text-xs text-gray-400">
                        AI is reading your handwritten entries
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100">
                        <Upload className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-600 mb-6">
                        Upload a photo of your udhari notebook
                      </p>
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#002E6E] px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                        >
                          <Camera className="h-4 w-4" />
                          Camera
                        </button>
                        <button
                          onClick={() => fileRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                        >
                          <Upload className="h-4 w-4" />
                          Upload File
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {!uploading && !uploaded && (
                  <button
                    onClick={goNext}
                    className="mt-4 w-full text-center text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors py-2"
                  >
                    Skip for now &rarr;
                  </button>
                )}
              </motion.div>
            )}

            {/* ────── Step 6: First Voice Command ────── */}
            {step === 5 && (
              <motion.div
                key="voice"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                {wizardDone ? (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="flex flex-col items-center py-8"
                  >
                    <motion.div
                      initial={{ rotate: -20, scale: 0 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.2 }}
                    >
                      <PartyPopper className="h-16 w-16 text-[#00BAF2] mb-4" />
                    </motion.div>
                    <h2 className="text-3xl font-bold text-[#002E6E] mb-2 text-center">
                      Aapka MunimAI ready hai! {"\ud83c\udf89"}
                    </h2>
                    <p className="text-sm text-gray-500">
                      Redirecting to your dashboard...
                    </p>
                  </motion.div>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-[#002E6E] mb-2 text-center">
                      पहला वॉइस कमांड दें
                    </h2>
                    <p className="text-sm text-gray-500 mb-12 text-center">
                      Try your first voice command with MunimAI
                    </p>
                    <div className="flex flex-col items-center">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleFinish}
                        className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-[#002E6E] to-[#00BAF2] shadow-2xl shadow-[#00BAF2]/30 transition-shadow hover:shadow-[#00BAF2]/50"
                      >
                        {/* Pulse rings */}
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-[#00BAF2]/30"
                          animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        />
                        <motion.div
                          className="absolute inset-0 rounded-full border-2 border-[#00BAF2]/20"
                          animate={{ scale: [1, 1.7], opacity: [0.3, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                        />
                        <Mic className="h-12 w-12 text-white" />
                      </motion.button>
                      <div className="mt-8 rounded-xl bg-gray-50 border border-gray-200 px-6 py-4 text-center max-w-sm">
                        <p className="text-xs text-gray-400 mb-1">बोलिए:</p>
                        <p className="text-base font-semibold text-[#002E6E]">
                          &ldquo;Muneem, Rs 500 cash mila&rdquo;
                        </p>
                      </div>
                      <button
                        onClick={handleFinish}
                        className="mt-6 text-sm font-medium text-[#00BAF2] hover:underline"
                      >
                        <Sparkles className="inline h-4 w-4 mr-1" />
                        Skip &mdash; Take me to Dashboard
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ────── Navigation Buttons ────── */}
          {step < 5 && (
            <div className="mt-10 flex items-center justify-between">
              <button
                onClick={goBack}
                disabled={step === 0}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-0 disabled:pointer-events-none transition-all"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                onClick={goNext}
                disabled={!canProceed()}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl hover:shadow-[#00BAF2]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {step === 0 ? "Aagey Badhein" : "Next"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
