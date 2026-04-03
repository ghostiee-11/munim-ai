"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Navbar } from "@/components/common/Navbar";
import { BottomNav } from "@/components/common/BottomNav";
import { SoundboxSimulator } from "@/components/voice/SoundboxSimulator";
import { VoiceInput } from "@/components/voice/VoiceInput";
import { formatINR, formatTime, API_BASE_URL, DEMO_MERCHANT_ID } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Mic,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Clock,
  CheckCircle,
  Volume2,
  Lightbulb,
} from "lucide-react";

// ---------- Types ----------
interface VoiceCommand {
  id: string;
  transcript: string;
  action: string;
  category: "income" | "expense" | "udhari" | "query" | "reminder";
  amount?: number;
  timestamp: string;
  sttProvider?: string;
  segments?: Array<{ start?: number; end?: number; text: string }> | null;
}

const STT_PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  openai_whisper: { label: "OpenAI Whisper", color: "bg-green-100 text-green-700" },
  elevenlabs: { label: "ElevenLabs Scribe v2", color: "bg-purple-100 text-purple-700" },
  sarvam: { label: "Sarvam AI", color: "bg-orange-100 text-orange-700" },
  groq_whisper: { label: "Groq Whisper", color: "bg-blue-100 text-blue-700" },
  unknown: { label: "Unknown", color: "bg-gray-100 text-gray-500" },
};

const STT_PROVIDERS = [
  { value: "auto", label: "Auto (Best Available)" },
  { value: "openai_whisper", label: "OpenAI Whisper" },
  { value: "elevenlabs", label: "ElevenLabs Scribe v2" },
  { value: "sarvam", label: "Sarvam AI" },
  { value: "groq_whisper", label: "Groq Whisper" },
];

// ---------- Demo Data ----------
const INITIAL_COMMANDS: VoiceCommand[] = [
  {
    id: "vc1",
    transcript: "Muneem, Rs 5000 rent diya",
    action: "Expense added: Rs 5,000 (Rent)",
    category: "expense",
    amount: 5000,
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "vc2",
    transcript: "Rs 2500 UPI se aaya Sharma ji se",
    action: "Income added: Rs 2,500 (UPI - Sharma ji)",
    category: "income",
    amount: 2500,
    timestamp: new Date(Date.now() - 3000000).toISOString(),
  },
  {
    id: "vc3",
    transcript: "Tripathi ji ka 12000 udhari likh do",
    action: "Udhari created: Rs 12,000 (Tripathi ji)",
    category: "udhari",
    amount: 12000,
    timestamp: new Date(Date.now() - 2400000).toISOString(),
  },
  {
    id: "vc4",
    transcript: "Aaj kitna profit hua?",
    action: "Today's P&L: Income Rs 34,500 | Expense Rs 17,400 | Profit Rs 17,100",
    category: "query",
    timestamp: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "vc5",
    transcript: "Mehra ji ko reminder bhej do",
    action: "Reminder sent to Mehra ji (Rs 5,000 pending)",
    category: "reminder",
    timestamp: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    id: "vc6",
    transcript: "Card se 4200 aaya",
    action: "Income added: Rs 4,200 (Card payment)",
    category: "income",
    amount: 4200,
    timestamp: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: "vc7",
    transcript: "3200 ka stock kharida Rajan Textiles se",
    action: "Expense added: Rs 3,200 (Stock - Rajan Textiles)",
    category: "expense",
    amount: 3200,
    timestamp: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: "vc8",
    transcript: "Patel ji ne 5000 cash diya udhari ka",
    action: "Udhari partial payment: Rs 5,000 from Patel ji",
    category: "udhari",
    amount: 5000,
    timestamp: new Date(Date.now() - 300000).toISOString(),
  },
];

const DEMO_RESPONSES = [
  { transcript: "Rs 1500 bijli ka bill diya", action: "Expense added: Rs 1,500 (Electricity bill)", category: "expense" as const, amount: 1500 },
  { transcript: "Cash se 3000 aaya", action: "Income added: Rs 3,000 (Cash)", category: "income" as const, amount: 3000 },
  { transcript: "Gupta ji ka 8000 udhari", action: "Udhari created: Rs 8,000 (Gupta ji)", category: "udhari" as const, amount: 8000 },
  { transcript: "GST status batao", action: "GST March 2026: Ready to file. Tax: Rs 44,100. Due: 20 April.", category: "query" as const },
  { transcript: "Rs 6000 saree becha", action: "Income added: Rs 6,000 (Saree sale)", category: "income" as const, amount: 6000 },
];

const CATEGORY_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
  income: { icon: TrendingUp, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  expense: { icon: TrendingDown, color: "text-red-500", bgColor: "bg-red-50" },
  udhari: { icon: IndianRupee, color: "text-blue-600", bgColor: "bg-blue-50" },
  query: { icon: Lightbulb, color: "text-purple-600", bgColor: "bg-purple-50" },
  reminder: { icon: Clock, color: "text-amber-600", bgColor: "bg-amber-50" },
};

const EXAMPLE_COMMANDS = [
  "\"Muneem, Rs 5000 rent diya\"",
  "\"Rs 2500 UPI se aaya\"",
  "\"Tripathi ji ka udhari likh do\"",
  "\"Aaj kitna profit hua?\"",
  "\"Mehra ji ko reminder bhej do\"",
  "\"GST status batao\"",
];

export default function SoundboxPage() {
  const [commands, setCommands] = useState<VoiceCommand[]>(INITIAL_COMMANDS);
  const [soundboxMessage, setSoundboxMessage] = useState<string>("Rs 4,200 card se mila");
  const [soundboxActive, setSoundboxActive] = useState(false);
  const [ledColor, setLedColor] = useState<"green" | "yellow" | "red">("green");
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("auto");

  // Mini P&L state
  const [todayIncome, setTodayIncome] = useState(34500);
  const [todayExpense, setTodayExpense] = useState(17400);
  const todayProfit = todayIncome - todayExpense;

  // Flash notification
  const [flash, setFlash] = useState<{ text: string; type: "income" | "expense" | "udhari" | "query" | "reminder" } | null>(null);

  const handleVoiceResult = useCallback(async (blob: Blob) => {
    setIsProcessing(true);
    setSoundboxActive(true);
    setLedColor("yellow");

    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      formData.append("merchant_id", DEMO_MERCHANT_ID);
      formData.append("language", "hi");
      formData.append("source", "soundbox");
      formData.append("stt_provider", selectedProvider);

      const resp = await fetch(`${API_BASE_URL}/api/voice/audio/process`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error("Voice processing failed");
      const data = await resp.json();

      const transcript = data.transcript || "Voice command";
      const actionText = data.response_text || data.action_summary || "Command processed";
      const sttProvider = data.stt_provider || "unknown";
      const segments = data.segments || null;

      // Extract amount from NLU entities
      const nluEntities = data.nlu?.entities || {};
      const amount = nluEntities.amount || data.amount;

      // Determine category from NLU intent
      let category: VoiceCommand["category"] = "query";
      const intent = (data.nlu?.intent || "").toLowerCase();
      if (intent.includes("income") || intent.includes("add_income")) {
        category = "income";
      } else if (intent.includes("expense") || intent.includes("add_expense")) {
        category = "expense";
      } else if (intent.includes("udhari")) {
        category = "udhari";
      } else if (intent.includes("remind")) {
        category = "reminder";
      }

      const newCommand: VoiceCommand = {
        id: `vc_${Date.now()}`,
        transcript,
        action: actionText,
        category,
        amount: amount ? Number(amount) : undefined,
        timestamp: new Date().toISOString(),
        sttProvider,
        segments,
      };

      setCommands((prev) => [newCommand, ...prev].slice(0, 10));
      setSoundboxMessage(actionText);
      setLedColor(category === "expense" ? "red" : "green");

      // Flash notification
      setFlash({ text: actionText, type: category });
      setTimeout(() => setFlash(null), 4000);

      // Update mini P&L
      if (category === "income" && amount) {
        setTodayIncome((prev) => prev + Number(amount));
      } else if (category === "expense" && amount) {
        setTodayExpense((prev) => prev + Number(amount));
      }

      // Play TTS audio if available
      if (data.response_audio_url) {
        const audio = new Audio(data.response_audio_url);
        audio.play().catch(() => {});
      }
    } catch {
      setSoundboxMessage("Error - phir try karein");
      setLedColor("red");
    } finally {
      setIsProcessing(false);

      // Reset soundbox after a while
      setTimeout(() => {
        setSoundboxActive(false);
        setLedColor("green");
      }, 3000);
    }
  }, [selectedProvider]);

  return (
    <div className="flex min-h-dvh flex-col bg-munim-bg">
      <Navbar shopName="Sunita Saree Shop" payScore={74} />

      {/* Flash Notification */}
      <AnimatePresence>
        {flash && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            className={cn(
              "fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-sm font-semibold shadow-lg",
              flash.type === "income" && "bg-emerald-500 text-white",
              flash.type === "expense" && "bg-red-500 text-white",
              flash.type === "udhari" && "bg-blue-500 text-white",
              flash.type === "reminder" && "bg-violet-500 text-white",
              flash.type === "query" && "bg-[#00BAF2] text-white",
            )}
          >
            <div className="flex items-center justify-center gap-2 max-w-2xl mx-auto">
              {flash.type === "income" && <TrendingUp className="w-4 h-4" />}
              {flash.type === "expense" && <TrendingDown className="w-4 h-4" />}
              {flash.type === "udhari" && <IndianRupee className="w-4 h-4" />}
              {flash.type === "query" && <Lightbulb className="w-4 h-4" />}
              <span>{flash.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-5 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-munim-primary-dark">
            Soundbox Simulator
          </h1>
          <p className="text-sm text-munim-text-secondary">
            Voice-first bookkeeping with AI
          </p>
        </div>

        {/* Soundbox Device */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <SoundboxSimulator
            lastMessage={soundboxMessage}
            isActive={soundboxActive}
            ledColor={ledColor}
          />
        </motion.div>

        {/* Voice Input + File Upload */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center gap-4"
        >
          <VoiceInput onResult={handleVoiceResult} isProcessing={isProcessing} />

          {/* Upload Audio File */}
          <div className="flex items-center gap-3 w-full max-w-sm">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">ya audio file upload karein</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <label
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all w-full max-w-sm justify-center",
              isProcessing
                ? "border-gray-200 bg-gray-50 text-gray-400 cursor-wait"
                : "border-blue-200 bg-blue-50/50 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
            )}
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-sm font-medium">Upload Audio File (.wav, .mp3, .ogg, .webm)</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              disabled={isProcessing}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const blob = new Blob([await file.arrayBuffer()], { type: file.type });
                handleVoiceResult(blob);
                e.target.value = "";
              }}
            />
          </label>
        </motion.div>

        {/* STT Provider Selector */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="flex items-center gap-3 w-full max-w-sm mx-auto"
        >
          <label className="text-xs font-medium text-gray-500 whitespace-nowrap">STT Provider:</label>
          <select
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {STT_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </motion.div>

        {/* Instructions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-blue-50 border border-blue-200 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Mic className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-800">
              Bol ke batao - Voice Commands
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_COMMANDS.map((cmd, i) => (
              <span
                key={i}
                className="text-[10px] text-blue-600 bg-white px-2 py-1 rounded-md border border-blue-100"
              >
                {cmd}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Real-time Mini Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            Live P&L Dashboard
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-xl p-3 text-center">
              <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
              <p className="text-xs font-bold text-emerald-700">
                {formatINR(todayIncome)}
              </p>
              <p className="text-[9px] text-emerald-500">Income</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <TrendingDown className="w-4 h-4 text-red-500 mx-auto mb-1" />
              <p className="text-xs font-bold text-red-700">
                {formatINR(todayExpense)}
              </p>
              <p className="text-[9px] text-red-500">Expense</p>
            </div>
            <div
              className={cn(
                "rounded-xl p-3 text-center",
                todayProfit >= 0 ? "bg-blue-50" : "bg-red-50"
              )}
            >
              <IndianRupee className={cn("w-4 h-4 mx-auto mb-1", todayProfit >= 0 ? "text-blue-500" : "text-red-500")} />
              <p className={cn("text-xs font-bold", todayProfit >= 0 ? "text-blue-700" : "text-red-700")}>
                {formatINR(todayProfit)}
              </p>
              <p className={cn("text-[9px]", todayProfit >= 0 ? "text-blue-500" : "text-red-500")}>Profit</p>
            </div>
          </div>
        </motion.div>

        {/* Command History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Voice Command History
            </h3>
            <span className="text-[10px] text-gray-400">
              Last {commands.length} commands
            </span>
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {commands.slice(0, 10).map((cmd) => {
                const config = CATEGORY_CONFIG[cmd.category] || CATEGORY_CONFIG.query;
                const Icon = config.icon;

                return (
                  <motion.div
                    key={cmd.id}
                    layout
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    className="flex items-start gap-3"
                  >
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", config.bgColor)}>
                      <Icon className={cn("w-4 h-4", config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 italic truncate">
                        &quot;{cmd.transcript}&quot;
                      </p>
                      <p className="text-sm font-medium text-gray-900 mt-0.5">
                        {cmd.action}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-gray-400">
                          {formatTime(cmd.timestamp)}
                        </p>
                        {cmd.sttProvider && (
                          <span className={cn(
                            "text-[9px] font-medium px-1.5 py-0.5 rounded-full",
                            STT_PROVIDER_LABELS[cmd.sttProvider]?.color || STT_PROVIDER_LABELS.unknown.color,
                          )}>
                            {STT_PROVIDER_LABELS[cmd.sttProvider]?.label || cmd.sttProvider}
                          </span>
                        )}
                      </div>
                      {cmd.segments && cmd.segments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {cmd.segments.slice(0, 20).map((seg, i) => (
                            <span
                              key={i}
                              title={seg.start != null ? `${seg.start.toFixed(1)}s - ${(seg.end ?? 0).toFixed(1)}s` : undefined}
                              className="text-[9px] text-gray-500 bg-gray-50 px-1 py-0.5 rounded border border-gray-100"
                            >
                              {seg.text}
                            </span>
                          ))}
                          {cmd.segments.length > 20 && (
                            <span className="text-[9px] text-gray-400">+{cmd.segments.length - 20} more</span>
                          )}
                        </div>
                      )}
                    </div>
                    {cmd.amount && (
                      <span className={cn(
                        "text-xs font-bold shrink-0",
                        cmd.category === "income" ? "text-emerald-600" :
                        cmd.category === "expense" ? "text-red-500" : "text-blue-600"
                      )}>
                        {cmd.category === "expense" ? "-" : "+"}{formatINR(cmd.amount)}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
