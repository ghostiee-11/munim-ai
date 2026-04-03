"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/common/Navbar";
import { BottomNav } from "@/components/common/BottomNav";
import ChatWindow from "@/components/whatsapp/ChatWindow";
import type { Message } from "@/components/whatsapp/MessageBubble";
import QuickReplyButtons, {
  type QuickReplyOption,
} from "@/components/whatsapp/QuickReplyButtons";
import { DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";
import { Skeleton } from "@/components/common/Skeleton";

// ---------- Demo Messages ----------
const now = new Date();
function timeAgo(mins: number) {
  return new Date(now.getTime() - mins * 60000).toISOString();
}

const DEMO_MESSAGES: Message[] = [
  {
    id: "m1",
    direction: "inbound",
    content:
      "Good Morning Sunita ji! Aapki aaj ki briefing:\n\nKal ka P&L: Income Rs 34,500 | Expense Rs 12,400 | Profit Rs 22,100\n\nUdhari Alert: Tripathi ji ka Rs 12,000 - 32 din ho gaye. Reminder bhejein?\n\nGST: March filing ready hai. 18 din baaki.\n\nPayScore: 74 (Good)\n\nAaj ka tip: Akshaya Tritiya aa raha hai - gold jewelry sarees ka stock badhayein!",
    message_type: "text",
    sent_at: timeAgo(120),
    status: "read",
  },
  {
    id: "m2",
    direction: "outbound",
    content: "Good morning Muneem! Haan Tripathi ji ko reminder bhej do",
    message_type: "text",
    sent_at: timeAgo(118),
    status: "read",
  },
  {
    id: "m3",
    direction: "inbound",
    content:
      "Tripathi ji ko reminder bhej diya hai WhatsApp pe. Payment link bhi attach kiya hai Rs 12,000 ka.",
    message_type: "text",
    sent_at: timeAgo(117),
    status: "read",
  },
  {
    id: "m4",
    direction: "inbound",
    content: "Tripathi ji ko payment link bheja:",
    message_type: "payment_link",
    sent_at: timeAgo(117),
    status: "read",
    payment_link: {
      amount: 12000,
      url: "https://paytm.me/sunita-shop/12000",
      status: "pending",
    },
  },
  {
    id: "m5",
    direction: "outbound",
    content: "",
    message_type: "voice",
    sent_at: timeAgo(90),
    status: "read",
  },
  {
    id: "m6",
    direction: "inbound",
    content:
      "Samajh gaya! Rs 5,000 rent expense add kar diya March ka. Aapka updated P&L:\nIncome: Rs 34,500\nExpense: Rs 17,400\nProfit: Rs 17,100",
    message_type: "text",
    sent_at: timeAgo(89),
    status: "read",
  },
  {
    id: "m7",
    direction: "outbound",
    content: "Mehra ji ka udhari kitna hai?",
    message_type: "text",
    sent_at: timeAgo(60),
    status: "read",
  },
  {
    id: "m8",
    direction: "inbound",
    content:
      "Mehra ji ka udhari:\nTotal: Rs 5,000\nDin: 15 din\nReminders: 1 bheja\nRisk Score: Low\n\nReminder bhejein ya payment link?",
    message_type: "text",
    sent_at: timeAgo(59),
    status: "read",
  },
  {
    id: "m9",
    direction: "outbound",
    content: "Payment link bhej do",
    message_type: "text",
    sent_at: timeAgo(55),
    status: "read",
  },
  {
    id: "m10",
    direction: "inbound",
    content: "Mehra ji ko payment link bheja:",
    message_type: "payment_link",
    sent_at: timeAgo(54),
    status: "read",
    payment_link: {
      amount: 5000,
      url: "https://paytm.me/sunita-shop/5000",
      status: "paid",
    },
  },
  {
    id: "m11",
    direction: "inbound",
    content:
      "Mehra ji ne Rs 5,000 pay kar diya! Udhari settled.\nAapka total pending udhari ab Rs 1,67,000 hai.",
    message_type: "text",
    sent_at: timeAgo(30),
    status: "read",
  },
  {
    id: "m12",
    direction: "outbound",
    content: "Bahut badhiya! Aaj kitni sale hui ab tak?",
    message_type: "text",
    sent_at: timeAgo(15),
    status: "delivered",
  },
  {
    id: "m13",
    direction: "inbound",
    content:
      "Aaj ab tak ki sale:\n3 UPI payments: Rs 8,200\n1 Card: Rs 4,500\n2 Cash: Rs 3,100\nTotal: Rs 15,800\n\nKal se 12% zyada hai. Achi chal rahi hai dukaan!",
    message_type: "text",
    sent_at: timeAgo(14),
    status: "read",
  },
  {
    id: "m14",
    direction: "outbound",
    content: "",
    message_type: "voice",
    sent_at: timeAgo(5),
    status: "delivered",
  },
  {
    id: "m15",
    direction: "inbound",
    content:
      "Rs 2,500 stock kharcha add kar diya. Supplier: Rajan Textiles.\nAaj ka expense: Rs 19,900\nAaj ka profit ab tak: Rs -4,100\n\nDhyaan rakhein - expense zyada ho raha hai aaj.",
    message_type: "text",
    sent_at: timeAgo(4),
    status: "read",
  },
];

const QUICK_REPLIES: QuickReplyOption[] = [
  { label: "Aaj ka P&L", value: "pnl_today", variant: "primary" },
  { label: "Udhari list", value: "udhari_list", variant: "default" },
  { label: "GST status", value: "gst_status", variant: "default" },
  { label: "Remind overdue", value: "remind_overdue", variant: "danger" },
  { label: "Customer pulse", value: "customer_pulse", variant: "default" },
  { label: "Cash forecast", value: "cash_forecast", variant: "primary" },
];

export default function WhatsAppPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [composeText, setComposeText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendingBriefing, setSendingBriefing] = useState(false);
  const toPhone = "+91 9876543210";

  const fetchMessages = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/${DEMO_MERCHANT_ID}/messages`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: Message[] = (Array.isArray(json) ? json : json.data ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        direction: d.direction as "inbound" | "outbound",
        content: (d.content ?? "") as string,
        message_type: (d.message_type || "text") as Message["message_type"],
        sent_at: d.sent_at as string,
        status: (d.status || "sent") as Message["status"],
        payment_link: d.payment_link as Message["payment_link"],
      }));
      setMessages(list);
    } catch (err) {
      console.error("WhatsApp fetch failed, using fallback:", err);
      setFetchError((err as Error).message);
      if (showLoading) setMessages(DEMO_MESSAGES);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { fetchMessages(); }, []);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchMessages(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMessage = async () => {
    if (!composeText.trim()) return;
    setSendingMessage(true);

    // Add optimistic outbound message
    const optimisticMsg: Message = {
      id: `opt_${Date.now()}`,
      direction: "outbound",
      content: composeText,
      message_type: "text",
      sent_at: new Date().toISOString(),
      status: "sent",
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    const msgText = composeText;
    setComposeText("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: DEMO_MERCHANT_ID,
          to_phone: toPhone,
          message: msgText,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Update the optimistic message status
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id ? { ...m, status: "delivered" } : m
        )
      );
    } catch (err) {
      console.error("Failed to send message:", err);
      // Mark as failed but keep in UI
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id ? { ...m, status: "sent" } : m
        )
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendBriefing = async () => {
    setSendingBriefing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/briefing/${DEMO_MERCHANT_ID}/send`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh messages to show the briefing
      await fetchMessages(false);
    } catch (err) {
      console.error("Failed to send briefing:", err);
      // Add a local fallback briefing message
      const briefingMsg: Message = {
        id: `briefing_${Date.now()}`,
        direction: "inbound",
        content: "Morning Briefing request sent! It will appear shortly.",
        message_type: "text",
        sent_at: new Date().toISOString(),
        status: "read",
      };
      setMessages((prev) => [...prev, briefingMsg]);
    } finally {
      setSendingBriefing(false);
    }
  };

  const handleQuickReply = useCallback(
    (value: string) => {
      const replyMap: Record<string, string> = {
        pnl_today:
          "Aaj ka P&L:\nIncome: Rs 15,800\nExpense: Rs 19,900\nProfit: Rs -4,100\n\nDhyaan rakhein - aaj loss mein chal raha hai.",
        udhari_list:
          "Top 5 Udhari:\n1. Patel ji - Rs 20,000 (45d)\n2. Gupta ji - Rs 10,000 (22d)\n3. Tripathi ji - Rs 12,000 (32d)\n4. Sharma ji - Rs 8,000 (1d)\n5. Mehra ji - SETTLED\n\nTotal pending: Rs 1,67,000",
        gst_status:
          "GST Status:\nMarch 2026 - Ready to File\nDue: 20 April\nTax payable: Rs 44,100\nITC available: Rs 13,200\nNet: Rs 30,900\n\nFile karein?",
        remind_overdue:
          "8 overdue customers ko reminder bhej raha hoon...\nDone! 8 reminders sent with payment links.",
        customer_pulse:
          "Customer Pulse:\nChampions: 25\nLoyal: 45\nAt Risk: 45 (Alert!)\nChurned: 30\n\nMeena Devi 35 din se nahi aayi - winback bhejein?",
        cash_forecast:
          "Next 30 days forecast:\nPredicted Income: Rs 9,20,000\nPredicted Expense: Rs 6,10,000\nNet: Rs 3,10,000\n\nAlert: May first week mein cash crunch possible. Rs 1.2L reserve rakhein.",
      };

      const userMsg: Message = {
        id: `u_${Date.now()}`,
        direction: "outbound",
        content:
          QUICK_REPLIES.find((q) => q.value === value)?.label || value,
        message_type: "text",
        sent_at: new Date().toISOString(),
        status: "sent",
      };

      setMessages((prev) => [...prev, userMsg]);

      setTimeout(() => {
        const reply: Message = {
          id: `r_${Date.now()}`,
          direction: "inbound",
          content: replyMap[value] || "Main samajh nahi paaya. Dobara bolein?",
          message_type: "text",
          sent_at: new Date().toISOString(),
          status: "read",
        };
        setMessages((prev) => [...prev, reply]);
      }, 1200);
    },
    []
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-munim-bg">
        <Navbar shopName="Sunita Saree Shop" payScore={74} />
        <main className="flex-1 flex flex-col px-4 pt-4 pb-24 max-w-3xl mx-auto w-full">
          <div className="mb-3">
            <Skeleton className="h-7 w-36 mb-1" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex-1 space-y-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                <Skeleton className={`h-16 rounded-2xl ${i % 2 === 0 ? "w-3/4" : "w-1/2"}`} />
              </div>
            ))}
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-munim-bg">
      <Navbar shopName="Sunita Saree Shop" payScore={74} />

      <main className="flex-1 flex flex-col px-4 pt-4 pb-24 max-w-3xl mx-auto w-full">
        {/* Error banner */}
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between mb-3">
            <p className="text-xs text-red-700">API unavailable, showing demo data</p>
            <button onClick={() => fetchMessages()} className="text-xs font-semibold text-red-700 flex items-center gap-1">
              Retry
            </button>
          </div>
        )}
        {/* Page Title */}
        <div className="mb-3">
          <h1 className="text-xl font-bold text-munim-primary-dark">
            MunimAI Chat
          </h1>
          <p className="text-sm text-munim-text-secondary">
            WhatsApp-style conversation with your AI muneem
          </p>
        </div>

        {/* Send Briefing Button */}
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={handleSendBriefing}
            disabled={sendingBriefing}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {sendingBriefing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <span className="text-sm">{"\u2600\uFE0F"}</span>
                Send Morning Briefing
              </>
            )}
          </button>
          <span className="text-[10px] text-gray-400">Get your daily business summary</span>
        </div>

        {/* Chat Window */}
        <div className="flex-1 min-h-0">
          <ChatWindow messages={messages} merchantName="MunimAI - Aapka Digital Muneem" />
        </div>

        {/* Compose Box */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            disabled={sendingMessage}
          />
          <button
            onClick={handleSendMessage}
            disabled={sendingMessage || !composeText.trim()}
            className="h-10 w-10 flex items-center justify-center bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {sendingMessage ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            )}
          </button>
        </div>

        {/* Quick Reply Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-3"
        >
          <p className="text-[10px] text-gray-400 px-1 mb-1.5">Quick Actions</p>
          <QuickReplyButtons options={QUICK_REPLIES} onSelect={handleQuickReply} />
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
