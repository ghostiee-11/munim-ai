"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone,
  ShieldCheck,
  ArrowRight,
  Mic,
  BookOpen,
  TrendingUp,
  Users,
  Loader2,
  CheckCircle2,
  Sparkles,
  Home,
} from "lucide-react";
import Link from "next/link";
import { DEMO_MERCHANT_ID } from "@/lib/constants";

const FEATURES = [
  {
    icon: Mic,
    title: "Voice-first Bookkeeping",
    titleHi: "बोलकर हिसाब रखें",
    desc: "Just speak naturally — MunimAI understands Hindi, English and more",
  },
  {
    icon: BookOpen,
    title: "Smart Udhari Tracking",
    titleHi: "स्मार्ट उधारी बही",
    desc: "Never lose track of credit. Automatic reminders via WhatsApp",
  },
  {
    icon: TrendingUp,
    title: "Cash Flow Forecasting",
    titleHi: "नकद प्रवाह पूर्वानुमान",
    desc: "AI predicts your cash flow 30 days ahead with 90%+ accuracy",
  },
  {
    icon: Users,
    title: "Customer Intelligence",
    titleHi: "ग्राहक बुद्धिमत्ता",
    desc: "Know which customers are at risk of churning before it happens",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check if already logged in
  useEffect(() => {
    try {
      const raw = localStorage.getItem("munim_auth");
      if (!raw) return;
      const auth = JSON.parse(raw);
      if (auth?.merchant_id && auth?.onboarded) {
        router.replace("/dashboard");
      } else if (auth?.merchant_id && !auth?.onboarded) {
        router.replace("/onboarding");
      }
    } catch {
      // invalid auth data, stay on login
    }
  }, [router]);

  const handleSendOtp = useCallback(async () => {
    if (phone.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }
    setError("");
    setLoading(true);

    // Simulate OTP verification (auto-bypass for hackathon demo)
    await new Promise((r) => setTimeout(r, 1500));
    setSuccess(true);

    const auth = {
      phone: `+91${phone}`,
      merchant_id: DEMO_MERCHANT_ID,
      token: "paytm-token-" + Date.now(),
      onboarded: true,
    };
    localStorage.setItem("munim_auth", JSON.stringify(auth));

    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    router.push("/dashboard");
  }, [phone, router]);

  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      if (!/^\d*$/.test(value)) return;
      const newOtp = [...otp];
      newOtp[index] = value.slice(-1);
      setOtp(newOtp);
      if (value && index < 3) {
        otpRefs.current[index + 1]?.focus();
      }
    },
    [otp]
  );

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !otp[index] && index > 0) {
        otpRefs.current[index - 1]?.focus();
      }
    },
    [otp]
  );

  const handleVerify = useCallback(async () => {
    const code = otp.join("");
    if (code.length !== 4) {
      setError("Please enter the 4-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    // Mock: any OTP works
    setSuccess(true);
    const auth = {
      phone: `+91${phone}`,
      merchant_id: DEMO_MERCHANT_ID,
      token: "mock-token-" + Date.now(),
      onboarded: false,
    };
    localStorage.setItem("munim_auth", JSON.stringify(auth));
    await new Promise((r) => setTimeout(r, 800));
    router.push("/onboarding");
  }, [otp, phone, router]);

  const handleDemoLogin = useCallback(async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    const auth = {
      phone: "+919876543210",
      merchant_id: DEMO_MERCHANT_ID,
      token: "demo-token-" + Date.now(),
      onboarded: true,
    };
    localStorage.setItem("munim_auth", JSON.stringify(auth));
    localStorage.setItem("merchant_name", "Sunita Sharma");
    localStorage.setItem("shop_name", "Sunita Saree Shop");
    setSuccess(true);
    await new Promise((r) => setTimeout(r, 600));
    router.push("/dashboard");
  }, [router]);

  return (
    <div className="flex min-h-dvh">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-[60%] relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#002E6E] via-[#003d8f] to-[#00BAF2]" />

        {/* Decorative circles */}
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute top-1/4 right-0 h-64 w-64 rounded-full bg-white/5 translate-x-1/2" />
        <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-[#00BAF2]/10" />
        <div className="absolute bottom-10 right-10 h-48 w-48 rounded-full bg-white/5" />

        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          {/* Top — Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-4"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl overflow-hidden bg-white/15 backdrop-blur-sm border border-white/20 shadow-lg">
              <img src="/logo-munim.png" alt="MunimAI" className="h-14 w-14 object-cover" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">
                MunimAI
              </h1>
              <p className="text-sm text-white/60 font-medium">
                Powered by Paytm
              </p>
            </div>
          </motion.div>

          {/* Center — Tagline */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
            >
              <h2
                className="text-5xl xl:text-6xl font-bold text-white leading-tight mb-4"
                lang="hi"
              >
                आपका डिजिटल
                <br />
                <span className="text-[#00BAF2] drop-shadow-[0_0_20px_rgba(0,186,242,0.4)]">
                  मुनीम
                </span>
              </h2>
              <p className="text-lg text-white/70 leading-relaxed max-w-md">
                Your AI-powered voice-first bookkeeper. Speak naturally, manage
                everything — sales, udhari, GST, and more.
              </p>
            </motion.div>

            {/* Features */}
            <div className="mt-12 space-y-5">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 + i * 0.12 }}
                  className="flex items-start gap-4 group"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/10 group-hover:bg-white/15 transition-colors">
                    <f.icon className="h-5 w-5 text-[#00BAF2]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {f.title}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bottom */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-xs text-white/30"
          >
            Trusted by 10,000+ Indian shopkeepers
          </motion.p>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:w-[40%] bg-white relative">
        {/* Home button */}
        <Link
          href="/"
          className="absolute top-6 right-6 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 hover:text-gray-700 transition-colors z-10"
        >
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>

        {/* Mobile branding */}
        <div className="absolute top-6 left-6 lg:hidden flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#002E6E] to-[#00BAF2] shadow-lg shadow-[#00BAF2]/20">
            <span className="text-base font-bold text-white">M</span>
          </div>
          <span className="text-lg font-bold text-[#002E6E]">MunimAI</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#002E6E]">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-1">
              Login to your MunimAI account
            </p>
          </div>

          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-12"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                  }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50"
                >
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </motion.div>
                <p className="mt-4 text-lg font-semibold text-[#002E6E]">
                  Login Successful!
                </p>
                <p className="text-sm text-gray-400 mt-1">Redirecting...</p>
              </motion.div>
            ) : !otpSent ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                {/* Phone Input */}
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Mobile Number
                </label>
                <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/50 focus-within:border-[#00BAF2] focus-within:ring-2 focus-within:ring-[#00BAF2]/10 transition-all overflow-hidden">
                  <div className="flex items-center gap-1.5 pl-4 pr-3 py-3.5 border-r border-gray-200 bg-gray-50">
                    <span className="text-lg leading-none">🇮🇳</span>
                    <span className="text-sm font-semibold text-gray-700">
                      +91
                    </span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Enter your mobile number"
                    value={phone}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setPhone(val);
                      setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                    className="flex-1 px-4 py-3.5 text-sm font-medium text-gray-900 placeholder-gray-400 bg-transparent outline-none"
                    autoFocus
                  />
                  {phone.length === 10 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="pr-3"
                    >
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    </motion.div>
                  )}
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-xs text-red-500 font-medium"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  onClick={handleSendOtp}
                  disabled={loading || phone.length !== 10}
                  className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl hover:shadow-[#00BAF2]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Phone className="h-4 w-4" />
                      Send OTP
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </button>

                <p className="mt-4 text-center text-xs text-gray-400">
                  We&apos;ll send a 4-digit verification code via SMS
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center gap-2 mb-6 text-sm text-gray-500">
                  <ShieldCheck className="h-4 w-4 text-[#00BAF2]" />
                  <span>
                    OTP sent to{" "}
                    <span className="font-semibold text-gray-800">
                      +91 {phone}
                    </span>
                  </span>
                  <button
                    onClick={() => {
                      setOtpSent(false);
                      setOtp(["", "", "", ""]);
                      setError("");
                    }}
                    className="ml-auto text-xs font-semibold text-[#00BAF2] hover:underline"
                  >
                    Change
                  </button>
                </div>

                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Enter OTP
                </label>
                <div className="flex gap-3 justify-center">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        otpRefs.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="h-14 w-14 rounded-xl border-2 border-gray-200 bg-gray-50/50 text-center text-xl font-bold text-[#002E6E] outline-none focus:border-[#00BAF2] focus:ring-2 focus:ring-[#00BAF2]/10 transition-all"
                    />
                  ))}
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 text-xs text-red-500 font-medium text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <button
                  onClick={handleVerify}
                  disabled={loading || otp.join("").length !== 4}
                  className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#002E6E] to-[#00BAF2] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#00BAF2]/20 hover:shadow-xl hover:shadow-[#00BAF2]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Verify &amp; Login
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setOtpSent(false);
                    setOtp(["", "", "", ""]);
                  }}
                  className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Didn&apos;t receive OTP? Resend
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider + Demo */}
          {!success && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <p className="mt-8 text-center text-[11px] text-gray-400 leading-relaxed">
                By continuing, you agree to MunimAI&apos;s{" "}
                <span className="text-gray-500 hover:underline cursor-pointer">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="text-gray-500 hover:underline cursor-pointer">
                  Privacy Policy
                </span>
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
