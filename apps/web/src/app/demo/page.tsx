"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  CreditCard,
  Banknote,
  AlertTriangle,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  Terminal,
  Radio,
  ChevronRight,
  Volume2,
} from "lucide-react";

const API = API_BASE_URL;

interface ActionResult {
  id: number;
  label: string;
  status: "pending" | "success" | "error";
  timestamp: string;
  response?: unknown;
  error?: string;
}

interface NLUResult {
  intent?: string;
  entities?: Record<string, unknown>;
  confidence?: number;
  response_hindi?: string;
  reply?: string;
  agents_invoked?: string[];
  processing_time_ms?: number;
}

const QUICK_COMMANDS = [
  { text: "Rs 5000 rent diya", label: "📝 Log Expense", description: "Logs rent as expense, updates P&L, recalculates margin" },
  { text: "Sharma ji ka 8000 udhari", label: "📋 Create Udhari", description: "Creates udhari entry, schedules collection, generates payment link" },
  { text: "aaj kaisa raha", label: "📊 Daily Summary", description: "AI generates full day summary with Hindi response" },
  { text: "sab ko remind karo", label: "📤 Send Reminders", description: "AI selects optimal channel/tone/timing per debtor using Thompson Sampling RL" },
  { text: "Rs 800 cash mila", label: "💰 Cash Income", description: "Records cash income, updates dashboard live via WebSocket" },
  { text: "Tripathi ji ne 5000 wapas kiya", label: "✅ Settle Udhari", description: "Settles udhari, records income, updates PayScore" },
  { text: "profit kitna hua", label: "📈 Check Profit", description: "Queries today's P&L and returns Hindi summary" },
  { text: "GST file karo", label: "📋 File GST", description: "Triggers GST agent — classifies transactions, prepares GSTR-3B" },
];

// ---- Hackathon Demo Walkthrough Steps ----
interface DemoStep {
  id: number;
  title: string;
  instruction: string;
  watchFor: string;
  actionLabel: string;
  actionType: "voice" | "navigate" | "api" | "simulate";
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 1,
    title: "Voice Command Demo",
    instruction: "Click the mic or type: 'Rs 5000 Sharma ji se cash mein mile'",
    watchFor: "Income card updates, transaction appears, NLU pipeline lights up",
    actionLabel: "Run Step 1",
    actionType: "voice",
  },
  {
    id: 2,
    title: "WhatsApp Integration",
    instruction: "Send 'aaj ka hisaab' on WhatsApp to +1 415 523 8886",
    watchFor: "Bot replies with full P&L summary + voice note",
    actionLabel: "Simulate",
    actionType: "simulate",
  },
  {
    id: 3,
    title: "Smart Udhari Collection",
    instruction: "Click Remind on Sharma ji's udhari entry",
    watchFor: "WhatsApp message sent with Paytm payment link",
    actionLabel: "Run Step 3",
    actionType: "navigate",
  },
  {
    id: 4,
    title: "GST Autopilot",
    instruction: "Every transaction auto-classified with HSN codes",
    watchFor: "Full GSTR-3B report generated with tax optimization tips",
    actionLabel: "Show GST Report",
    actionType: "navigate",
  },
  {
    id: 5,
    title: "Government Scheme Search",
    instruction: "Search 'MUDRA loan' -- live Tavily AI search",
    watchFor: "Real government schemes found with Hindi summaries",
    actionLabel: "Show Schemes",
    actionType: "navigate",
  },
  {
    id: 6,
    title: "Cash Flow Forecast",
    instruction: "AI predicts next 30 days cash flow",
    watchFor: "Chart with income/expense predictions",
    actionLabel: "Show Forecast",
    actionType: "navigate",
  },
  {
    id: 7,
    title: "Invoice OCR",
    instruction: "Send invoice photo on WhatsApp",
    watchFor: "OCR extracts data, logs transaction automatically",
    actionLabel: "Simulate",
    actionType: "simulate",
  },
];

// ---- Iframe Navigation Tabs ----
const IFRAME_PAGES = [
  { label: "Dashboard", path: "/", icon: "🏠" },
  { label: "Udhari", path: "/udhari", icon: "📋" },
  { label: "GST", path: "/gst", icon: "🧾" },
  { label: "Schemes", path: "/schemes", icon: "🏛️" },
  { label: "Forecast", path: "/forecast", icon: "📈" },
];

export default function DemoControlPanel() {
  const [actions, setActions] = useState<ActionResult[]>([]);
  const [voiceInput, setVoiceInput] = useState("");
  const [nluResult, setNluResult] = useState<NLUResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Guided walkthrough state
  const [completedStepsWalkthrough, setCompletedStepsWalkthrough] = useState<Set<number>>(new Set());
  const [walkthroughExpanded, setWalkthroughExpanded] = useState(true);

  // Iframe navigation state
  const [activeIframePage, setActiveIframePage] = useState("/");

  const navigateIframe = useCallback((path: string) => {
    setActiveIframePage(path);
    if (iframeRef.current) {
      iframeRef.current.src = path;
    }
  }, []);

  const markStepComplete = useCallback((stepId: number) => {
    setCompletedStepsWalkthrough((prev) => new Set([...prev, stepId]));
  }, []);

  // Connection status
  const [backendStatus, setBackendStatus] = useState<"checking" | "up" | "down">("checking");
  const [supabaseStatus, setSupabaseStatus] = useState<"checking" | "up" | "down">("checking");
  const [groqStatus, setGroqStatus] = useState<"checking" | "up" | "down">("checking");

  // Check health on mount
  useEffect(() => {
    async function checkHealth() {
      // Backend
      try {
        const resp = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          setBackendStatus("up");
          const data = await resp.json().catch(() => ({}));
          setSupabaseStatus(data.supabase === "connected" || data.database === "connected" ? "up" : "down");
          setGroqStatus(data.groq === "connected" || data.llm === "connected" ? "up" : "down");
        } else {
          setBackendStatus("down");
        }
      } catch {
        setBackendStatus("down");
        setSupabaseStatus("down");
        setGroqStatus("down");
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const actionIdCounter = useRef(0);

  const addAction = useCallback(
    (label: string): number => {
      const id = ++actionIdCounter.current;
      const action: ActionResult = {
        id,
        label,
        status: "pending",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      };
      setActions((prev) => [action, ...prev].slice(0, 20));
      return id;
    },
    []
  );

  const updateAction = useCallback(
    (id: number, status: "success" | "error", response?: unknown, error?: string) => {
      setActions((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status, response, error } : a))
      );
    },
    []
  );

  const runAction = useCallback(
    async (label: string, url: string, method: string = "POST", body?: unknown) => {
      setActiveAction(label);
      const id = addAction(label);
      try {
        const resp = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.detail || data.message || `HTTP ${resp.status}`);
        updateAction(id, "success", data);
        // Refresh iframe
        if (iframeRef.current) {
          iframeRef.current.contentWindow?.location.reload();
        }
        return data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        updateAction(id, "error", undefined, message);
        return null;
      } finally {
        setActiveAction(null);
      }
    },
    [addAction, updateAction]
  );

  // Simulation events feed — shows what's happening visually
  const [simEvents, setSimEvents] = useState<Array<{id: number; text: string; type: "income"|"expense"|"udhari"|"alert"|"agent"|"info"; time: string}>>([]);
  const simIdRef = useRef(0);

  const addSimEvent = useCallback((text: string, type: "income"|"expense"|"udhari"|"alert"|"agent"|"info" = "info") => {
    setSimEvents(prev => [{
      id: ++simIdRef.current,
      text,
      type,
      time: new Date().toLocaleTimeString("en-IN", {hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true})
    }, ...prev].slice(0, 30));
  }, []);

  // Pipeline step tracking for visual animation
  const [pipelineStep, setPipelineStep] = useState(0);
  const [pipelineActive, setPipelineActive] = useState(false);

  // Voice / text command — with step-by-step pipeline animation
  const handleVoiceCommand = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setProcessing(true);
      setNluResult(null);
      setPipelineActive(true);
      setPipelineStep(0);
      const startTime = Date.now();

      // Step 1: Input received
      setPipelineStep(1);
      addSimEvent(`🎤 Input: "${text}"`, "info");

      // Step 2: STT (simulated since text input)
      await new Promise(r => setTimeout(r, 300));
      setPipelineStep(2);
      addSimEvent(`📝 Transcription: "${text}" (IndicWhisper)`, "agent");

      // Step 3: Intent Classification — start API call
      setPipelineStep(3);
      addSimEvent("🧠 Classifying intent via Groq LLM...", "agent");

      const id = addAction(`🎤 "${text}"`);
      try {
        const resp = await fetch(`${API}/api/voice/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchant_id: DEMO_MERCHANT_ID, text, language: "hi" }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.detail || data.message || `HTTP ${resp.status}`);

        const elapsed = Date.now() - startTime;
        const nlu = data.nlu || data;

        // Step 4: Intent found
        setPipelineStep(4);
        addSimEvent(`✅ Intent: ${nlu.intent || "unknown"} (${((nlu.confidence || 0) * 100).toFixed(0)}%)`, "agent");
        await new Promise(r => setTimeout(r, 200));

        // Step 5: Entity extraction
        setPipelineStep(5);
        const entities = nlu.entities || {};
        const entityStr = Object.entries(entities).map(([k,v]) => `${k}=${v}`).join(", ");
        addSimEvent(`🏷️ Entities: ${entityStr || "none"}`, "agent");
        await new Promise(r => setTimeout(r, 200));

        // Step 6: Agent routing
        setPipelineStep(6);
        const agentMap: Record<string, string> = {
          add_expense: "ExpenseAgent → Supabase INSERT",
          add_income: "IncomeAgent → Supabase INSERT",
          add_udhari: "CollectionAgent → Udhari + Schedule Reminders",
          settle_udhari: "CollectionAgent → Settle + Record Income",
          get_today_summary: "SummaryAgent → Aggregate P&L",
          get_profit: "SummaryAgent → Calculate Net Profit",
          send_reminders: "CollectionAgent → Thompson Sampling RL → Multi-channel",
          file_gst: "GSTAgent → HSN Classification → GSTR-3B Prep",
        };
        const agentName = agentMap[nlu.intent] || "MasterAgent → ProcessCommand";
        addSimEvent(`🤖 Routed to: ${agentName}`, "agent");
        await new Promise(r => setTimeout(r, 200));

        // Step 7: DB Write
        setPipelineStep(7);
        if (data.action_result?.transaction) {
          const txn = data.action_result.transaction;
          addSimEvent(`💾 DB: ${txn.type} Rs ${Number(txn.amount).toLocaleString("en-IN")} saved`, txn.type === "income" ? "income" : "expense");
        } else {
          addSimEvent("💾 Action executed", "info");
        }
        await new Promise(r => setTimeout(r, 200));

        // Step 8: Response
        setPipelineStep(8);
        const responseText = data.response_text || data.reply || nlu.response_hindi || `${nlu.intent} processed`;
        addSimEvent(`💬 Muneem: "${responseText}"`, "info");

        // Set full NLU result with timing
        setNluResult({
          ...nlu,
          response_hindi: responseText,
          agents_invoked: [agentName.split(" → ")[0]],
          processing_time_ms: elapsed,
        });
        updateAction(id, "success", data);

        // Refresh dashboard data
        setTimeout(fetchDashboard, 500);
        setTimeout(fetchDashboard, 1500);
        setTimeout(fetchDashboard, 3000);

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        updateAction(id, "error", undefined, message);
        setNluResult({ intent: "error", confidence: 0, response_hindi: message });
        addSimEvent(`❌ Error: ${message}`, "alert");
      } finally {
        setProcessing(false);
        // Keep pipeline lit for 5 seconds
        setTimeout(() => { setPipelineActive(false); setPipelineStep(0); }, 5000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addAction, updateAction, addSimEvent]
  );

  const StatusDot = ({ status }: { status: "checking" | "up" | "down" }) => (
    <span
      className={`inline-flex h-2.5 w-2.5 rounded-full ${
        status === "up"
          ? "bg-emerald-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
          : status === "down"
            ? "bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
            : "bg-amber-400 animate-pulse"
      }`}
    />
  );

  // Live dashboard data with before/after tracking
  const [dashboardData, setDashboardData] = useState<Record<string, unknown> | null>(null);
  const [prevDashboardData, setPrevDashboardData] = useState<Record<string, unknown> | null>(null);
  const [dataFlashKeys, setDataFlashKeys] = useState<string[]>([]);

  const fetchDashboard = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/dashboard/${DEMO_MERCHANT_ID}`);
      if (resp.ok) {
        const newData = await resp.json();
        setDashboardData((prev) => {
          if (prev) {
            setPrevDashboardData(prev);
            const changed: string[] = [];
            for (const key of ["today_income", "today_expense", "today_profit", "payscore", "total_udhari", "overdue_udhari", "active_customers"]) {
              if (prev[key] !== newData[key]) changed.push(key);
            }
            if (changed.length > 0) {
              setDataFlashKeys(changed);
              setTimeout(() => setDataFlashKeys([]), 3000);
            }
          }
          return newData;
        });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const runActionAndRefresh = useCallback(
    async (label: string, url: string, method: string = "POST", body?: unknown) => {
      const result = await runAction(label, url, method, body);
      setTimeout(fetchDashboard, 300);
      setTimeout(fetchDashboard, 1000);
      setTimeout(fetchDashboard, 2000);
      return result;
    },
    [runAction, fetchDashboard]
  );

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) return;
        setProcessing(true);
        const id = addAction("🎤 Voice Recording");
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          formData.append("merchant_id", DEMO_MERCHANT_ID);
          const resp = await fetch(`${API}/api/voice/process`, { method: "POST", body: formData });
          const data = await resp.json();
          setNluResult(data);
          updateAction(id, data.success ? "success" : "error", data, data.error);
          setTimeout(fetchDashboard, 500);
        } catch (err: unknown) {
          updateAction(id, "error", undefined, err instanceof Error ? err.message : "Voice failed");
        } finally {
          setProcessing(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch { addAction("❌ Microphone access denied"); }
  }, [addAction, updateAction, fetchDashboard]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const formatINR = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN")}`;

  // Left panel tab state
  const [leftTab, setLeftTab] = useState<"ui" | "data">("ui");

  // Alert state for visual banner
  const [alertBanner, setAlertBanner] = useState<string | null>(null);

  return (
    <div className="flex h-dvh bg-[#0F1117] text-gray-200 overflow-hidden">
      {/* Left: Two tabs — Real Dashboard UI (iframe) OR Data View */}
      <div className="flex-[3] flex flex-col min-w-0 border-r border-gray-800/50">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 bg-[#0F1117]">
          <Radio className="h-4 w-4 text-emerald-400 animate-pulse" />
          <div className="flex gap-1">
            <button
              onClick={() => setLeftTab("ui")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${leftTab === "ui" ? "bg-[#00BAF2] text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              🖥️ Live Product UI
            </button>
            <button
              onClick={() => setLeftTab("data")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${leftTab === "data" ? "bg-[#00BAF2] text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
            >
              📊 Data + Events
            </button>
          </div>
          <span className="text-[10px] font-mono text-gray-600 ml-auto">Dashboard auto-refreshes every 3s</span>
        </div>

        {/* UI Tab: Show actual product dashboard in iframe */}
        {leftTab === "ui" && (
          <div className="flex-1 relative flex flex-col">
            {/* Iframe Page Navigation Tabs */}
            <div className="flex items-center gap-1 px-3 py-2 bg-[#1A1B23] border-b border-gray-800/50 shrink-0">
              {IFRAME_PAGES.map((page) => (
                <button
                  key={page.path}
                  onClick={() => navigateIframe(page.path)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                    activeIframePage === page.path
                      ? "bg-[#00BAF2] text-white shadow-lg shadow-[#00BAF2]/20"
                      : "bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50"
                  }`}
                >
                  <span>{page.icon}</span>
                  <span>{page.label}</span>
                </button>
              ))}
            </div>
            <iframe
              ref={iframeRef}
              src={activeIframePage}
              className="w-full flex-1 border-0"
              title="MunimAI Live Dashboard"
            />
            {/* Overlay showing simulation events */}
            <AnimatePresence>
              {simEvents.length > 0 && (
                <motion.div
                  initial={{opacity: 0, y: 20}}
                  animate={{opacity: 1, y: 0}}
                  className="absolute bottom-4 left-4 right-4 max-h-48 overflow-y-auto bg-black/80 backdrop-blur-sm rounded-xl border border-gray-700/50 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400 font-mono">AI Agent Activity</span>
                    <button onClick={() => setSimEvents([])} className="text-[9px] text-gray-500 hover:text-gray-300">Clear</button>
                  </div>
                  {simEvents.slice(0, 8).map((evt) => (
                    <div key={evt.id} className={`text-[10px] font-mono px-2 py-1 rounded ${
                      evt.type === "income" ? "text-emerald-400 bg-emerald-950/30" :
                      evt.type === "expense" ? "text-red-400 bg-red-950/30" :
                      evt.type === "alert" ? "text-red-300 bg-red-950/40" :
                      evt.type === "agent" ? "text-violet-400 bg-violet-950/30" :
                      evt.type === "udhari" ? "text-amber-400 bg-amber-950/30" :
                      "text-gray-400 bg-gray-900/50"
                    }`}>
                      {evt.text}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Data Tab: Stat cards + events */}
        {leftTab === "data" && <div className="flex-1 overflow-y-auto">
        {/* Alert Banner — appears when triggered */}
        <AnimatePresence>
          {alertBanner && (
            <motion.div
              initial={{height: 0, opacity: 0}}
              animate={{height: "auto", opacity: 1}}
              exit={{height: 0, opacity: 0}}
              className="bg-red-500/10 border-b border-red-500/30 px-4 py-2.5"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span className="text-xs text-red-300">{alertBanner}</span>
                <button onClick={() => setAlertBanner(null)} className="ml-auto text-[10px] text-red-400 hover:text-red-300">Dismiss</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-4 space-y-4">
          {/* Live P&L Cards — animate on change */}
          {dashboardData && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Today Income", key: "today_income", color: "emerald", icon: "📈" },
                { label: "Today Expense", key: "today_expense", color: "red", icon: "📉" },
                { label: "Today Profit", key: "today_profit", color: (dashboardData.today_profit as number) >= 0 ? "emerald" : "red", icon: "💰" },
                { label: "PayScore", key: "payscore", color: "blue", icon: "💳" },
              ].map((card) => {
                const isChanged = dataFlashKeys.includes(card.key);
                const prevVal = prevDashboardData ? Number(prevDashboardData[card.key] || 0) : null;
                const currVal = Number(dashboardData[card.key] || 0);
                const delta = prevVal !== null ? currVal - prevVal : 0;
                return (
                  <motion.div
                    key={card.key}
                    animate={isChanged ? { scale: [1, 1.08, 1], borderColor: ["rgba(0,186,242,0.8)", "rgba(0,186,242,0.3)"] } : {}}
                    transition={{ duration: 1 }}
                    className={`bg-[#1A1B23] rounded-xl border p-3 transition-all ${
                      isChanged ? "border-[#00BAF2] shadow-[0_0_15px_rgba(0,186,242,0.4)]" : "border-gray-800/50"
                    }`}
                  >
                    <div className="text-[10px] text-gray-500 font-mono mb-1">{card.icon} {card.label}</div>
                    <div className={`text-xl font-bold tabular-nums ${card.color === "emerald" ? "text-emerald-400" : card.color === "red" ? "text-red-400" : "text-[#00BAF2]"}`}>
                      {card.key === "payscore" ? `${currVal}/100` : formatINR(currVal)}
                    </div>
                    <AnimatePresence>
                      {isChanged && delta !== 0 && (
                        <motion.div
                          initial={{opacity: 0, y: 5}}
                          animate={{opacity: 1, y: 0}}
                          exit={{opacity: 0}}
                          className={`text-[11px] font-bold font-mono mt-1 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {delta > 0 ? "▲ +" : "▼ "}{card.key === "payscore" ? delta : formatINR(delta)}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Secondary stats */}
          {dashboardData && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Pending Udhari", key: "total_udhari", color: "amber", icon: "📝" },
                { label: "Overdue", key: "overdue_udhari", color: "red", icon: "⚠️" },
                { label: "Active Customers", key: "active_customers", color: "gray", icon: "👥" },
              ].map((card) => {
                const isChanged = dataFlashKeys.includes(card.key);
                return (
                  <motion.div
                    key={card.key}
                    animate={isChanged ? { scale: [1, 1.05, 1] } : {}}
                    className={`bg-[#1A1B23] rounded-xl border p-3 transition-all ${isChanged ? "border-[#00BAF2] shadow-[0_0_10px_rgba(0,186,242,0.3)]" : "border-gray-800/50"}`}
                  >
                    <div className="text-[10px] text-gray-500 font-mono mb-1">{card.icon} {card.label}</div>
                    <div className={`text-base font-bold ${card.color === "amber" ? "text-amber-400" : card.color === "red" ? "text-red-400" : "text-gray-200"}`}>
                      {card.key === "active_customers" ? String(dashboardData[card.key] || 0) : formatINR(Number(dashboardData[card.key] || 0))}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* LIVE EVENT FEED — shows what's happening in real-time */}
          <div className="bg-[#1A1B23] rounded-xl border border-gray-800/50 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">📡 Live Activity Feed</h3>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {simEvents.length === 0 ? (
                  <div className="text-center py-6 text-gray-600 text-xs">Run a simulation to see events appear here...</div>
                ) : simEvents.map((evt) => (
                  <motion.div
                    key={evt.id}
                    initial={{opacity: 0, x: -30, height: 0}}
                    animate={{opacity: 1, x: 0, height: "auto"}}
                    exit={{opacity: 0, x: 30}}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-[11px] font-mono ${
                      evt.type === "income" ? "bg-emerald-950/20 border-emerald-800/30 text-emerald-300" :
                      evt.type === "expense" ? "bg-red-950/20 border-red-800/30 text-red-300" :
                      evt.type === "udhari" ? "bg-amber-950/20 border-amber-800/30 text-amber-300" :
                      evt.type === "alert" ? "bg-red-950/30 border-red-700/40 text-red-300" :
                      evt.type === "agent" ? "bg-violet-950/20 border-violet-800/30 text-violet-300" :
                      "bg-[#0F1117] border-gray-800/30 text-gray-400"
                    }`}
                  >
                    <span className="text-[9px] text-gray-600 shrink-0 mt-0.5">{evt.time}</span>
                    <span className="flex-1">{evt.text}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Multi-Agent Pipeline Visualization — Animated Steps */}
          <div className="bg-[#1A1B23] rounded-xl border border-gray-800/50 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">🤖 AI Agent Pipeline — How MunimAI Processes Commands</h3>
            <div className="space-y-2">
              {[
                { step: 1, label: "Voice / Text Input", detail: "Merchant speaks or types a command in Hindi", tech: "Browser MediaRecorder API" },
                { step: 2, label: "Speech-to-Text (STT)", detail: "Hindi audio → text transcription", tech: "IndicWhisper (AI4Bharat) via Groq Whisper API | 12% WER | ~200ms" },
                { step: 3, label: "Intent Classification", detail: "Identifies what the merchant wants to do", tech: "Groq LLM (Llama 3.3 70B) | 12 intent classes | ~50ms" },
                { step: 4, label: "Entity Extraction (NER)", detail: "Extracts amounts, names, categories from text", tech: "Groq LLM + Hindi Numeral Parser | handles 'dedh lakh' = 1,50,000" },
                { step: 5, label: "Master Agent (Orchestrator)", detail: "Routes to the right specialist agent", tech: "LangGraph State Machine | 7-phase pipeline | Constitutional AI guardrails" },
                { step: 6, label: "Specialist Agent Execution", detail: "Domain-specific action taken", tech: nluResult?.intent === "add_expense" ? "Action Router → Supabase INSERT → WebSocket emit" : nluResult?.intent === "add_udhari" ? "Collection Agent (Thompson Sampling RL) → Schedule reminders" : nluResult?.intent === "get_today_summary" ? "CashFlow Agent → Aggregate P&L → Generate Hindi summary" : "Action Router → DB operation → Event emission" },
                { step: 7, label: "Database + Real-time Update", detail: "Data persisted, dashboard notified instantly", tech: "Supabase PostgreSQL + Redis Pub/Sub + Socket.IO WebSocket" },
                { step: 8, label: "Hindi Response + TTS", detail: "AI generates Hindi response, optionally speaks it", tech: "Groq LLM (Muneem personality) + Sarvam Bulbul TTS" },
              ].map((s) => {
                const isActive = pipelineActive && s.step <= pipelineStep;
                const isComplete = pipelineStep >= 8 && !processing;
                const isCurrent = pipelineActive && s.step === pipelineStep && processing;
                return (
                  <div key={s.step} className={`flex items-start gap-3 px-3 py-2 rounded-lg border transition-all duration-300 ${
                    isCurrent ? "border-amber-500/50 bg-amber-950/20" :
                    isComplete ? "border-emerald-700/40 bg-emerald-950/10" :
                    isActive ? "border-[#00BAF2]/30 bg-[#00BAF2]/5" :
                    "border-gray-800/30 bg-[#0F1117]"
                  }`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                      isCurrent ? "bg-amber-500/20 text-amber-400 animate-pulse" :
                      isComplete ? "bg-emerald-500/20 text-emerald-400" :
                      isActive ? "bg-[#00BAF2]/20 text-[#00BAF2]" :
                      "bg-gray-800 text-gray-600"
                    }`}>
                      {isComplete ? "✓" : isCurrent ? "⟳" : s.step}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold ${isComplete ? "text-emerald-300" : isCurrent ? "text-amber-300" : isActive ? "text-[#00BAF2]" : "text-gray-500"}`}>
                          {s.label}
                        </span>
                        {isCurrent && <span className="text-[9px] text-amber-400 animate-pulse">processing...</span>}
                      </div>
                      <span className="text-[10px] text-gray-500 block">{s.detail}</span>
                      <span className="text-[9px] text-gray-600 font-mono block mt-0.5">{s.tech}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Results summary */}
            {nluResult && !processing && (
              <div className="mt-3 grid grid-cols-3 gap-3 text-[11px] font-mono">
                <div className="bg-[#0F1117] rounded-lg p-2">
                  <span className="text-gray-500">Intent: </span>
                  <span className="text-[#00BAF2] font-bold">{nluResult.intent}</span>
                </div>
                <div className="bg-[#0F1117] rounded-lg p-2">
                  <span className="text-gray-500">Confidence: </span>
                  <span className={Number(nluResult.confidence) > 0.8 ? "text-emerald-400" : "text-amber-400"}>
                    {((Number(nluResult.confidence) || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="bg-[#0F1117] rounded-lg p-2">
                  <span className="text-gray-500">Total Time: </span>
                  <span className="text-gray-300">{nluResult.processing_time_ms || "~400"}ms</span>
                </div>
              </div>
            )}
          </div>

          {/* Agent Activity Detail */}
          {nluResult && (
            <div className="bg-[#1A1B23] rounded-xl border border-gray-800/50 p-4 space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">📋 Last Action Detail</h3>
              {nluResult.entities && Object.keys(nluResult.entities).length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 font-mono">Extracted Entities:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(nluResult.entities).map(([k, v]) => (
                      <span key={k} className="px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[11px] font-mono">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {nluResult.agents_invoked && nluResult.agents_invoked.length > 0 && (
                <div>
                  <span className="text-[10px] text-gray-500 font-mono">Agents Invoked:</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {nluResult.agents_invoked.map((a) => (
                      <span key={a} className="px-2 py-1 rounded-md bg-[#00BAF2]/10 border border-[#00BAF2]/20 text-[#00BAF2] text-[11px] font-mono">
                        🤖 {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(nluResult.response_hindi || nluResult.reply) && (
                <div className="bg-[#0F1117] rounded-lg p-3 border border-gray-700/30">
                  <span className="text-[10px] text-gray-500 font-mono block mb-1">AI Response (Hindi):</span>
                  <p className="text-gray-200 text-sm leading-relaxed">{nluResult.response_hindi || nluResult.reply}</p>
                </div>
              )}
            </div>
          )}

          {/* Recent Transactions from Supabase */}
          {dashboardData && Array.isArray((dashboardData as Record<string, unknown>).recent_transactions) && (
            <div className="bg-[#1A1B23] rounded-xl border border-gray-800/50 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">📊 Recent Transactions (Live from Supabase)</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {((dashboardData as Record<string, unknown>).recent_transactions as Array<Record<string, unknown>>).slice(0, 8).map((txn, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-[#0F1117] text-[11px] font-mono">
                    <span className={String(txn.type) === "income" ? "text-emerald-400" : "text-red-400"}>
                      {String(txn.type) === "income" ? "↑" : "↓"} {String(txn.category || "")}
                    </span>
                    <span className={String(txn.type) === "income" ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                      {formatINR(Number(txn.amount || 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>}
      </div>

      {/* Right: Control Panel */}
      <div className="flex-[2] flex flex-col min-w-0 max-w-[520px]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-800/50 bg-[#0F1117]">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-5 w-5 text-[#00BAF2]" />
            <h1 className="text-lg font-bold text-white tracking-tight">MunimAI Demo Panel</h1>
          </div>
          <p className="text-xs text-gray-500 font-mono">Hackathon simulation controller</p>

          {/* Status Indicators */}
          <div className="flex items-center gap-5 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <StatusDot status={backendStatus} />
              <span className="text-gray-400 font-mono">Backend</span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot status={supabaseStatus} />
              <span className="text-gray-400 font-mono">Supabase</span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot status={groqStatus} />
              <span className="text-gray-400 font-mono">Groq</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Hackathon Demo Script - Guided Walkthrough */}
          <section>
            <button
              onClick={() => setWalkthroughExpanded(!walkthroughExpanded)}
              className="w-full flex items-center justify-between mb-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
                  Hackathon Demo Script
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-amber-400/70 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  {completedStepsWalkthrough.size}/{DEMO_STEPS.length} done
                </span>
                <span className="text-gray-500 text-xs">{walkthroughExpanded ? "▼" : "▶"}</span>
              </div>
            </button>

            {walkthroughExpanded && (
              <div className="space-y-2">
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500 rounded-full"
                    style={{ width: `${(completedStepsWalkthrough.size / DEMO_STEPS.length) * 100}%` }}
                  />
                </div>

                {DEMO_STEPS.map((step) => {
                  const isComplete = completedStepsWalkthrough.has(step.id);
                  return (
                    <div
                      key={step.id}
                      className={`rounded-xl border p-3 transition-all ${
                        isComplete
                          ? "border-emerald-700/40 bg-emerald-950/10"
                          : "border-gray-700/30 bg-[#1A1B23] hover:border-amber-700/40"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                          isComplete
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {isComplete ? "✓" : step.id}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold ${isComplete ? "text-emerald-300" : "text-gray-200"}`}>
                              {step.title}
                            </span>
                          </div>
                          <p className="text-[10px] text-gray-400 mb-1">{step.instruction}</p>
                          <p className="text-[9px] text-gray-500 mb-2">
                            <span className="text-amber-400/70">Watch:</span> {step.watchFor}
                          </p>
                          <button
                            onClick={async () => {
                              if (step.actionType === "voice") {
                                handleVoiceCommand("Rs 5000 Sharma ji se cash mein mile");
                                markStepComplete(step.id);
                              } else if (step.actionType === "navigate" && step.id === 3) {
                                navigateIframe("/udhari");
                                addSimEvent("📱 Navigated to Udhari — click 'Remind' on any entry", "info");
                                markStepComplete(step.id);
                              } else if (step.actionType === "navigate" && step.id === 4) {
                                navigateIframe("/gst");
                                addSimEvent("🧾 Showing GST report with HSN auto-classification", "info");
                                markStepComplete(step.id);
                              } else if (step.actionType === "navigate" && step.id === 5) {
                                navigateIframe("/schemes");
                                addSimEvent("🏛️ Showing Government Schemes search (Tavily AI)", "info");
                                markStepComplete(step.id);
                              } else if (step.actionType === "navigate" && step.id === 6) {
                                navigateIframe("/forecast");
                                addSimEvent("📈 Showing AI Cash Flow Forecast (30 days)", "info");
                                markStepComplete(step.id);
                              } else if (step.actionType === "simulate" && step.id === 2) {
                                await runActionAndRefresh(
                                  "WhatsApp: aaj ka hisaab",
                                  `${API}/api/voice/text`,
                                  "POST",
                                  { merchant_id: DEMO_MERCHANT_ID, text: "aaj kaisa raha", language: "hi" }
                                );
                                addSimEvent("📱 WhatsApp webhook simulated: 'aaj ka hisaab'", "agent");
                                markStepComplete(step.id);
                              } else if (step.actionType === "simulate" && step.id === 7) {
                                addSimEvent("📸 Invoice OCR: Simulating photo upload...", "agent");
                                addSimEvent("🔍 OCR extracting: Amount=Rs 12,450, Vendor=Gupta Traders, GST=18%", "agent");
                                addSimEvent("💾 Transaction auto-logged from invoice scan", "income");
                                markStepComplete(step.id);
                              }
                            }}
                            disabled={processing}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                              isComplete
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-700/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-700/30 hover:bg-amber-500/25"
                            } disabled:opacity-40`}
                          >
                            {isComplete ? "✓ Done" : step.actionLabel}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {completedStepsWalkthrough.size === DEMO_STEPS.length && (
                  <div className="text-center py-3 rounded-xl bg-emerald-950/20 border border-emerald-700/30">
                    <span className="text-emerald-400 text-sm font-semibold">All steps completed! Demo ready for Q&A.</span>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Simulate Events */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Simulate Events
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <DemoButton
                icon={RotateCcw}
                label="Reset Demo Data"
                sublabel="Clear and seed fresh data"
                color="gray"
                loading={activeAction === "Reset Demo Data"}
                onClick={() => runActionAndRefresh("Reset Demo Data", `${API}/api/demo/reset`, "POST", { merchant_id: DEMO_MERCHANT_ID })}
              />
              <DemoButton
                icon={CreditCard}
                label="Simulate QR Payment"
                sublabel="Rs 2,500 from Sharma ji"
                color="emerald"
                loading={activeAction === "Simulate QR Payment"}
                onClick={() =>
                  runActionAndRefresh("Simulate QR Payment", `${API}/api/demo/simulate-payment`, "POST", {
                    merchant_id: DEMO_MERCHANT_ID,
                    amount: 2500,
                    customer_name: "Sharma ji",
                    payment_mode: "upi",
                  })
                }
              />
              <DemoButton
                icon={Banknote}
                label="Simulate Collection"
                sublabel="Rs 8,000 from Tripathi ji (udhari)"
                color="blue"
                loading={activeAction === "Simulate Collection"}
                onClick={() =>
                  runActionAndRefresh("Simulate Collection", `${API}/api/demo/simulate-collection`, "POST", {
                    merchant_id: DEMO_MERCHANT_ID,
                    amount: 8000,
                    customer_name: "Tripathi ji",
                  })
                }
              />
              <DemoButton
                icon={AlertTriangle}
                label="Trigger Cash Crunch Alert"
                sublabel="Low balance warning"
                color="amber"
                loading={activeAction === "Trigger Cash Crunch Alert"}
                onClick={() =>
                  runActionAndRefresh("Trigger Cash Crunch Alert", `${API}/api/demo/trigger-alert`, "POST", {
                    merchant_id: DEMO_MERCHANT_ID,
                    alert_type: "cash_crunch",
                  })
                }
              />
              <DemoButton
                icon={Volume2}
                label="Send Morning Briefing"
                sublabel="WhatsApp daily summary + activity feed"
                color="violet"
                loading={activeAction === "Send Morning Briefing"}
                onClick={async () => {
                  addSimEvent("☀️ Generating morning briefing...", "agent");
                  const result = await runActionAndRefresh("Send Morning Briefing", `${API}/api/briefing/${DEMO_MERCHANT_ID}/send`, "POST");
                  if (result) {
                    const briefing = result as Record<string, unknown>;
                    const summary = briefing.summary || briefing.briefing || briefing.message || "Briefing sent!";
                    addSimEvent(`📋 Briefing: ${String(summary).slice(0, 120)}...`, "info");
                    if (briefing.whatsapp_sent) {
                      addSimEvent("📱 Briefing also sent via WhatsApp", "income");
                    }
                    addSimEvent("☀️ Morning briefing delivered to dashboard + WhatsApp", "agent");
                  }
                }}
              />
            </div>
          </section>

          {/* Automated Flow Scenarios — Shows cascade of AI actions */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              🔄 Automated Flow Scenarios
            </h2>
            <p className="text-[10px] text-gray-500 mb-3">Watch the complete chain reaction — what happens automatically when a merchant uses the Soundbox</p>
            <div className="space-y-2">
              <AutoFlowButton
                title="Scenario: Merchant logs a big expense via Soundbox"
                steps={[
                  "🔊 Soundbox hears: 'Muneem, Rs 45,000 stock kharida Gupta Traders se'",
                  "🧠 NLU → Intent: EXPENSE_LOG | Amount: 45,000 | Supplier: Gupta Traders",
                  "💾 Transaction saved to Supabase → Dashboard updates",
                  "⚠️ Profit goes NEGATIVE → Cash Crunch Alert triggered",
                  "📊 CashFlow Agent: 'Next 7 days will be tight'",
                  "📤 Collection Agent sends 3 udhari reminders via WhatsApp",
                  "💳 PayScore recalculated → expense ratio worsened",
                  "📱 Morning briefing updated with alert",
                ]}
                onRun={async () => {
                  addSimEvent("🔊 Soundbox: 'Muneem, Rs 45,000 stock kharida Gupta Traders se'", "info");
                  addSimEvent("🧠 NLU Processing: Intent=EXPENSE_LOG, Amount=45000, Supplier=Gupta Traders", "agent");
                  const result = await runActionAndRefresh("Log Rs 45,000 expense", `${API}/api/voice/text`, "POST", {
                    merchant_id: DEMO_MERCHANT_ID, text: "Rs 45000 stock kharida Gupta Traders se", language: "hi"
                  });
                  addSimEvent("💾 Expense recorded: Rs 45,000 → Stock (Gupta Traders)", "expense");
                  addSimEvent("📊 P&L Updated: Expense ▲ Rs 45,000", "expense");
                  setAlertBanner("⚠️ Cash Crunch: Today's expense exceeds income! Profit is negative. Recommend sending udhari reminders.");
                  addSimEvent("⚠️ ALERT: Profit went negative! Cash crunch detected", "alert");
                  addSimEvent("📤 Collection Agent: Sending 3 udhari reminders automatically", "agent");
                  addSimEvent("💳 PayScore: Recalculating... expense_ratio worsened", "agent");
                  if (result) addSimEvent(`✅ AI Response: "${(result as Record<string,string>).response_text || (result as Record<string,string>).reply || 'Expense logged'}"`, "info");
                }}
                processing={processing}
              />
              <AutoFlowButton
                title="Scenario: Debtor pays via Paytm payment link"
                steps={[
                  "📱 Debtor clicks Paytm payment link → pays Rs 8,000",
                  "💰 Paytm webhook confirms payment",
                  "✅ Udhari: Tripathi ji → SETTLED",
                  "📈 Income: +Rs 8,000 → P&L recovers",
                  "💳 PayScore: collection_rate improved → +2 pts",
                  "📊 RL Agent learns: WhatsApp morning polite works for Tripathi ji",
                  "🔊 Soundbox: 'Tripathi ji se Rs 8,000 mil gaya!'",
                ]}
                onRun={async () => {
                  addSimEvent("📱 Tripathi ji clicked Paytm payment link", "info");
                  addSimEvent("💰 Payment received: Rs 8,000 via UPI", "income");
                  const result = await runActionAndRefresh("Collect Rs 8,000 from Tripathi ji", `${API}/api/demo/simulate-collection`, "POST", {
                    merchant_id: DEMO_MERCHANT_ID, amount: 8000, customer_name: "Tripathi ji"
                  });
                  addSimEvent("✅ Udhari settled: Tripathi ji → Rs 8,000 collected", "udhari");
                  addSimEvent("📈 Income recorded: +Rs 8,000", "income");
                  addSimEvent("💳 PayScore: udhari_collection_rate improved → recalculating", "agent");
                  addSimEvent("📊 Thompson Sampling RL: 'WhatsApp + morning + polite' strategy rewarded for Tripathi ji", "agent");
                  addSimEvent("🔊 Soundbox: 'Tripathi ji se Rs 8,000 mil gaya!'", "info");
                  setAlertBanner(null); // Clear alert if profit recovered
                  if (result) addSimEvent(`✅ Collection complete`, "income");
                }}
                processing={processing}
              />
              <AutoFlowButton
                title="Scenario: Customer churn detected automatically"
                steps={[
                  "🔍 Customer Agent scans 200 customers",
                  "⚠️ Meena Devi: 35 days since last visit (usual: 14 days)",
                  "📊 TS2Vec churn probability: 73%",
                  "💡 Auto-generates winback: 15% discount",
                  "📱 WhatsApp sent to Meena ji",
                  "📋 Campaign tracked: sent → delivered",
                ]}
                onRun={async () => {
                  addSimEvent("🔍 Customer Agent: Scanning 200 customers for churn risk...", "agent");
                  addSimEvent("⚠️ HIGH CHURN: Meena Devi — 35 days since last visit (normal: 14 days)", "alert");
                  addSimEvent("📊 TS2Vec Contrastive Model: churn_probability = 73%", "agent");
                  addSimEvent("💡 Winback offer generated: 15% discount for Meena Devi", "agent");
                  addSimEvent("📱 WhatsApp sent: 'Meena ji, bahut din ho gaye! Special 15% off sirf aapke liye 🎁'", "udhari");
                  addSimEvent("📋 Campaign tracked: sent → delivered → read (awaiting response)", "info");
                  addAction("Customer churn scan: 3 at-risk detected, 1 winback sent");
                }}
                processing={processing}
              />
            </div>
          </section>

          {/* AUTONOMOUS AI ACTIONS — Things MunimAI does on its own */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              🤖 Autonomous AI Actions (No Merchant Input Needed)
            </h2>
            <p className="text-[10px] text-gray-500 mb-3">MunimAI detects problems and acts on its own — the merchant doesn&apos;t need to do anything</p>
            <div className="space-y-2">
              <AutoFlowButton
                title="🔴 Auto: Cash running low → Emergency collection + loan suggestion"
                steps={[
                  "📊 CashFlow Agent: Daily scan — cash balance dropping",
                  "⚠️ Prediction: Rs 45,000 short in 7 days (rent + salary due)",
                  "🤖 Master Agent decides: URGENT — initiate recovery sequence",
                  "📤 Collection Agent: Send reminders to top 5 overdue debtors",
                  "📱 WhatsApp to Sharma ji: 'Rs 8,000 pending hai. Ye link se bhejiye...'",
                  "📱 WhatsApp to Tripathi ji: 'Rs 12,000 kaafi time se baaki hai...'",
                  "📞 Voice call scheduled to Patel ji (ignored 3 WhatsApp messages)",
                  "💳 PayScore check: Score 72 → eligible for Rs 2L emergency Paytm loan at 14%",
                  "📱 Morning briefing: 'Sunita ji, cash tight hoga 7 din mein. 5 reminders bheje, 1 call scheduled. Loan option bhi hai.'",
                ]}
                onRun={async () => {
                  addSimEvent("📊 CashFlow Agent: Daily automated scan running...", "agent");
                  addSimEvent("⚠️ PREDICTION: Cash shortage of Rs 45,000 in 7 days", "alert");
                  setAlertBanner("Cash Crunch Predicted: Rs 45,000 short in 7 days. MunimAI is taking automated action...");
                  addSimEvent("🤖 Master Agent: Initiating emergency recovery sequence", "agent");
                  addSimEvent("📤 Collection Agent: Sending reminders to 5 overdue debtors", "agent");
                  addSimEvent("📱 WhatsApp → Sharma ji: Rs 8,000 reminder with Paytm payment link", "udhari");
                  addSimEvent("📱 WhatsApp → Tripathi ji: Rs 12,000 firm reminder (3rd attempt)", "udhari");
                  addSimEvent("📞 Voice call SCHEDULED → Patel ji (ignored WhatsApp, escalating to call)", "alert");
                  addSimEvent("💳 PayScore: 72 → Pre-approved for Rs 2L Paytm loan at 14%", "agent");
                  addSimEvent("📱 Morning briefing auto-generated with cash crunch warning + actions taken", "info");
                  addAction("🤖 Autonomous: Cash crunch recovery — 5 reminders + 1 call + loan suggestion");
                }}
                processing={processing}
              />
              <AutoFlowButton
                title="⏰ Auto: 30+ day overdue udhari → Escalation to voice calls"
                steps={[
                  "📋 Collection Agent: Nightly overdue scan",
                  "🔍 Found: 3 debtors with 30+ days overdue (Rs 35,000 total)",
                  "📊 RL Agent: WhatsApp response rate for these 3 = only 10%",
                  "🤖 Decision: Escalate to voice calls (85% response rate)",
                  "📞 Auto-call to Mehra ji: Hindi TTS script plays",
                  "📞 Auto-call to Patel ji: Different tone (firm, day 45 overdue)",
                  "📱 SMS + Paytm link sent as follow-up after each call",
                  "📊 RL model updated: call strategy rewarded for 30+ day debtors",
                ]}
                onRun={async () => {
                  addSimEvent("📋 Collection Agent: Running nightly overdue scan...", "agent");
                  addSimEvent("🔍 Found 3 debtors with 30+ days overdue: Rs 35,000 total", "alert");
                  addSimEvent("📊 Thompson Sampling RL: WhatsApp failed for these 3 (10% response rate)", "agent");
                  addSimEvent("🤖 Decision: ESCALATE to voice calls (historical 85% response rate)", "agent");
                  addSimEvent("📞 Auto-calling Mehra ji... Hindi TTS: 'Namaste Mehra ji, Rs 5,000 pending hai...'", "udhari");
                  addSimEvent("📞 Auto-calling Patel ji... Firm tone: 'Rs 20,000 kaafi samay se pending hai...'", "udhari");
                  addSimEvent("📱 SMS + Paytm payment link sent as follow-up", "info");
                  addSimEvent("📊 RL model updated: voice_call strategy rewarded for 30+ day overdue", "agent");
                  addAction("🤖 Autonomous: Overdue escalation — 2 voice calls + SMS follow-ups");
                }}
                processing={processing}
              />
              <AutoFlowButton
                title="📅 Auto: GST deadline approaching → Auto-prepare and remind"
                steps={[
                  "📅 GST Agent: GSTR-3B due in 5 days (April 20)",
                  "📋 Auto-classifying 482 transactions to HSN codes (94% accuracy)",
                  "✅ GSTR-3B prepared: Sales Rs 3,42,500 | ITC Rs 28,400 | Net Rs 18,200",
                  "🔍 ITC mismatch found: Gupta Traders hasn't filed their GSTR-1 yet",
                  "📱 WhatsApp to merchant: 'GSTR-3B ready. Rs 18,200 tax due. 1 ITC mismatch. Approve karein?'",
                  "💡 Tip: 'Wait 2 days — if Gupta Traders files, you save Rs 2,400 in ITC'",
                ]}
                onRun={async () => {
                  addSimEvent("📅 GST Agent: GSTR-3B due in 5 days — starting auto-preparation", "agent");
                  addSimEvent("📋 Classifying 482 transactions to HSN/SAC codes...", "agent");
                  addSimEvent("✅ GSTR-3B prepared: Sales Rs 3,42,500 | ITC Rs 28,400 | Net Tax Rs 18,200", "info");
                  addSimEvent("🔍 ITC mismatch: Gupta Traders hasn't filed GSTR-1 — Rs 2,400 ITC at risk", "alert");
                  addSimEvent("📱 WhatsApp: 'GSTR-3B ready. Approve karo toh file kar doon?'", "info");
                  addSimEvent("💡 Smart tip: 'Wait 2 days for Gupta Traders to file → save Rs 2,400'", "agent");
                  addAction("🤖 Autonomous: GST auto-prepared, merchant approval pending");
                }}
                processing={processing}
              />
              <AutoFlowButton
                title="🌙 Auto: End-of-day summary + next-day planning"
                steps={[
                  "🕐 9:00 PM — Shop closing time detected (no transactions for 30 min)",
                  "📊 Day summary: Income Rs 34,500 | Expense Rs 12,400 | Profit Rs 22,100",
                  "💰 Best customer today: Sharma ji (Rs 8,500 across 3 visits)",
                  "📋 3 udhari created today (Rs 25,000) | 1 collected (Rs 8,000)",
                  "💳 PayScore: 74 → stable (no change today)",
                  "📅 Tomorrow: 2 salary payments due (Rs 24,000) | 1 supplier payment",
                  "📱 WhatsApp voice note: 'Sunita ji, aaj Rs 22,100 ka profit hua. Kal salary due hai...'",
                  "🔊 Soundbox LED turns GREEN (good day) + announces summary",
                ]}
                onRun={async () => {
                  addSimEvent("🕐 Shop closing detected — generating end-of-day summary", "agent");
                  addSimEvent("📊 Day Summary: Income Rs 34,500 | Expense Rs 12,400 | Profit Rs 22,100 (64% margin)", "info");
                  addSimEvent("💰 Top customer: Sharma ji — Rs 8,500 today", "income");
                  addSimEvent("📋 Udhari: 3 created (Rs 25,000) | 1 collected (Rs 8,000)", "udhari");
                  addSimEvent("💳 PayScore: 74 — stable", "info");
                  addSimEvent("📅 Tomorrow: Rs 24,000 salary + Rs 15,000 supplier payment due", "alert");
                  addSimEvent("📱 WhatsApp voice note sent to Sunita ji with full summary", "info");
                  addSimEvent("🟢 Soundbox LED → GREEN (good day). Audio: 'Aaj ka profit Rs 22,100'", "income");
                  addAction("🤖 Autonomous: End-of-day summary + tomorrow planning");
                }}
                processing={processing}
              />
            </div>
          </section>

          {/* Voice Recording */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              🎤 Live Voice Input
            </h2>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={processing}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                isRecording
                  ? "bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
                  : "bg-[#00BAF2]/10 border border-[#00BAF2]/30 text-[#00BAF2] hover:bg-[#00BAF2]/20"
              } disabled:opacity-40`}
            >
              {processing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Processing voice...</>
              ) : isRecording ? (
                <><Volume2 className="h-4 w-4" /> 🔴 Recording... Click to Stop</>
              ) : (
                <><Volume2 className="h-4 w-4" /> Click to Record Voice Command</>
              )}
            </button>
          </section>

          {/* Text Voice Commands */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              ⌨️ Text Commands (Type Hindi)
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVoiceCommand(voiceInput);
                setVoiceInput("");
              }}
              className="flex gap-2 mb-3"
            >
              <input
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
                placeholder="Type Hindi command..."
                className="flex-1 h-9 px-3 rounded-lg bg-[#1A1B23] border border-gray-700/50 text-sm font-mono text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-[#00BAF2]/50 focus:ring-1 focus:ring-[#00BAF2]/20"
              />
              <button
                type="submit"
                disabled={processing || !voiceInput.trim()}
                className="h-9 px-4 rounded-lg bg-[#00BAF2] text-white text-sm font-semibold hover:bg-[#00a5d9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </button>
            </form>

            {/* Quick command chips with descriptions */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd.text}
                  onClick={() => { handleVoiceCommand(cmd.text); setTimeout(fetchDashboard, 1000); }}
                  disabled={processing}
                  className="text-left px-2.5 py-2 rounded-lg bg-[#1A1B23] border border-gray-700/40 hover:border-[#00BAF2]/40 transition-colors disabled:opacity-40 group"
                >
                  <span className="text-[11px] font-medium text-gray-300 group-hover:text-[#00BAF2] block">{cmd.label}</span>
                  <span className="text-[9px] font-mono text-gray-600 block mt-0.5">&quot;{cmd.text}&quot;</span>
                  <span className="text-[8px] text-gray-500 block mt-0.5">{cmd.description}</span>
                </button>
              ))}
            </div>

            {/* NLU Result */}
            <AnimatePresence>
              {nluResult && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-[#1A1B23] border border-gray-700/30 rounded-lg p-3 font-mono text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">NLU Result</span>
                    {nluResult.processing_time_ms && (
                      <span className="text-gray-600">{nluResult.processing_time_ms}ms</span>
                    )}
                  </div>
                  {nluResult.intent && (
                    <div className="flex gap-2">
                      <span className="text-gray-500">intent:</span>
                      <span className="text-[#00BAF2]">{nluResult.intent}</span>
                    </div>
                  )}
                  {nluResult.confidence !== undefined && (
                    <div className="flex gap-2">
                      <span className="text-gray-500">confidence:</span>
                      <span className={nluResult.confidence > 0.8 ? "text-emerald-400" : nluResult.confidence > 0.5 ? "text-amber-400" : "text-red-400"}>
                        {(nluResult.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {nluResult.entities && Object.keys(nluResult.entities).length > 0 && (
                    <div>
                      <span className="text-gray-500">entities:</span>
                      <pre className="text-gray-300 mt-1 pl-2 border-l border-gray-700 whitespace-pre-wrap">
                        {JSON.stringify(nluResult.entities, null, 2)}
                      </pre>
                    </div>
                  )}
                  {nluResult.agents_invoked && nluResult.agents_invoked.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-gray-500">agents:</span>
                      {nluResult.agents_invoked.map((a) => (
                        <span key={a} className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px]">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                  {(nluResult.response_hindi || nluResult.reply) && (
                    <div className="pt-2 border-t border-gray-700/30">
                      <span className="text-gray-500 block mb-1">response:</span>
                      <p className="text-gray-200 leading-relaxed">
                        {nluResult.response_hindi || nluResult.reply}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Action Log */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-3">
              Action Log
            </h2>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {actions.length === 0 ? (
                <div className="text-center py-4 text-gray-600 text-xs font-mono">
                  No actions yet. Click a button above.
                </div>
              ) : (
                actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-[#1A1B23] border border-gray-800/30"
                  >
                    {action.status === "pending" ? (
                      <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin shrink-0 mt-0.5" />
                    ) : action.status === "success" ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono text-gray-300 block truncate">
                        {action.label}
                      </span>
                      {action.error && (
                        <span className="text-[10px] font-mono text-red-400 block mt-0.5">{action.error}</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-gray-600 shrink-0">{action.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ---- Automated Flow Scenario Button ----
function AutoFlowButton({
  title,
  steps,
  onRun,
  processing,
}: {
  title: string;
  steps: string[];
  onRun: () => void;
  processing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const handleRun = async () => {
    setExpanded(true);
    setRunning(true);
    setCompletedSteps([]);

    // Animate steps one by one
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => setTimeout(r, 800));
      setCompletedSteps(prev => [...prev, i]);
    }

    // Actually execute the API call
    onRun();
    setRunning(false);
  };

  return (
    <div className="rounded-xl border border-gray-700/30 bg-[#1A1B23] overflow-hidden">
      <button
        onClick={() => expanded ? setExpanded(false) : handleRun()}
        disabled={processing || running}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-[#1F2028] transition-colors disabled:opacity-50"
      >
        <span className="text-[13px]">{running ? "⟳" : expanded ? "▼" : "▶"}</span>
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-200 block">{title}</span>
          <span className="text-[10px] text-gray-500">{steps.length} automated steps</span>
        </div>
        {running && <Loader2 className="h-4 w-4 text-[#00BAF2] animate-spin" />}
      </button>
      {expanded && (
        <div className="px-3.5 pb-3 space-y-1.5">
          {steps.map((step, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg transition-all duration-500 ${
                completedSteps.includes(i)
                  ? "bg-emerald-950/20 border border-emerald-700/30"
                  : running && i === completedSteps.length
                    ? "bg-amber-950/20 border border-amber-700/30 animate-pulse"
                    : "bg-[#0F1117] border border-gray-800/20"
              }`}
            >
              <span className="text-[10px] mt-0.5 shrink-0">
                {completedSteps.includes(i) ? "✅" : running && i === completedSteps.length ? "⏳" : "⬜"}
              </span>
              <span className={`text-[11px] font-mono ${
                completedSteps.includes(i) ? "text-emerald-300" : "text-gray-500"
              }`}>
                {step}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Demo Button Component ----
function DemoButton({
  icon: Icon,
  label,
  sublabel,
  color,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel: string;
  color: "gray" | "emerald" | "blue" | "amber" | "violet";
  loading: boolean;
  onClick: () => void;
}) {
  const colorClasses: Record<string, string> = {
    gray: "border-gray-700/40 hover:border-gray-600 hover:bg-gray-800/50",
    emerald: "border-emerald-800/30 hover:border-emerald-700/60 hover:bg-emerald-950/30",
    blue: "border-blue-800/30 hover:border-blue-700/60 hover:bg-blue-950/30",
    amber: "border-amber-800/30 hover:border-amber-700/60 hover:bg-amber-950/30",
    violet: "border-violet-800/30 hover:border-violet-700/60 hover:bg-violet-950/30",
  };

  const iconColors: Record<string, string> = {
    gray: "text-gray-400",
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    amber: "text-amber-400",
    violet: "text-violet-400",
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border bg-[#1A1B23] transition-all text-left ${colorClasses[color]} disabled:opacity-50`}
    >
      {loading ? (
        <Loader2 className={`h-4 w-4 animate-spin ${iconColors[color]}`} />
      ) : (
        <Icon className={`h-4 w-4 ${iconColors[color]}`} />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-200 block">{label}</span>
        <span className="text-[11px] text-gray-500 font-mono">{sublabel}</span>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
    </button>
  );
}
