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
}

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

  // Mini P&L state
  const [todayIncome, setTodayIncome] = useState(34500);
  const [todayExpense, setTodayExpense] = useState(17400);
  const todayProfit = todayIncome - todayExpense;

  const handleVoiceResult = useCallback(async (blob: Blob) => {
    setIsProcessing(true);
    setSoundboxActive(true);
    setLedColor("yellow");

    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      formData.append("merchant_id", DEMO_MERCHANT_ID);
      formData.append("language", "hi");

      const resp = await fetch(`${API_BASE_URL}/api/voice/process`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error("Voice processing failed");
      const data = await resp.json();

      const transcript = data.transcription || data.transcript || "Voice command";
      const actionText = data.action_summary || data.action || data.response_hindi || data.response || data.reply || "Command processed";
      const amount = data.amount || data.transaction?.amount;

      // Determine category from response
      let category: VoiceCommand["category"] = "query";
      const intentLower = (data.intent || data.action || "").toLowerCase();
      if (intentLower.includes("income") || intentLower.includes("received") || intentLower.includes("aaya")) {
        category = "income";
      } else if (intentLower.includes("expense") || intentLower.includes("paid") || intentLower.includes("diya")) {
        category = "expense";
      } else if (intentLower.includes("udhari") || intentLower.includes("credit")) {
        category = "udhari";
      } else if (intentLower.includes("remind")) {
        category = "reminder";
      }

      const newCommand: VoiceCommand = {
        id: `vc_${Date.now()}`,
        transcript,
        action: actionText,
        category,
        amount: amount ? Number(amount) : undefined,
        timestamp: new Date().toISOString(),
      };

      setCommands((prev) => [newCommand, ...prev].slice(0, 10));
      setSoundboxMessage(actionText.split(":")[0] || actionText);
      setLedColor(category === "expense" ? "red" : "green");

      // Update mini P&L
      if (category === "income" && amount) {
        setTodayIncome((prev) => prev + Number(amount));
      } else if (category === "expense" && amount) {
        setTodayExpense((prev) => prev + Number(amount));
      }

      // Play TTS audio if available
      if (data.audio_url || data.response_audio_url) {
        const audio = new Audio(data.audio_url || data.response_audio_url);
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
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-munim-bg">
      <Navbar shopName="Sunita Saree Shop" payScore={74} />

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 space-y-5 max-w-lg mx-auto w-full">
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

        {/* Voice Input */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col items-center"
        >
          <VoiceInput onResult={handleVoiceResult} isProcessing={isProcessing} />
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
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {formatTime(cmd.timestamp)}
                      </p>
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
