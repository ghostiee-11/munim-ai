"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Headphones,
  X,
  Send,
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL, DEMO_MERCHANT_ID } from "@/lib/constants";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import Link from "next/link";

interface ChatMessage {
  id: string;
  role: "user" | "muneem";
  text: string;
  action?: string;
  timestamp: number;
}

const WIDGET_STORAGE_KEY = "munim-widget-chat";
const GREETING_TEXT =
  "Namaste! Main aapka digital Muneem hoon. Boliye kya madad karun?";

function loadWidgetHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WIDGET_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ChatMessage[];
  } catch {
    // ignore
  }
  return [];
}

function saveWidgetHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(
      WIDGET_STORAGE_KEY,
      JSON.stringify(msgs.slice(-100))
    );
  } catch {
    // ignore
  }
}

export function VoiceChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const hist = loadWidgetHistory();
    if (hist.length === 0) {
      return [
        {
          id: "widget-greeting",
          role: "muneem" as const,
          text: GREETING_TEXT,
          timestamp: Date.now(),
        },
      ];
    }
    return hist;
  });
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();

  useEffect(() => {
    saveWidgetHistory(messages);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isThinking]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: text.trim(),
        timestamp: Date.now(),
      };
      addMessage(userMsg);
      setInput("");
      setIsThinking(true);

      try {
        const resp = await fetch(`${API_BASE_URL}/api/voice/text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            merchant_id: DEMO_MERCHANT_ID,
            language: "hi",
          }),
        });
        if (!resp.ok) throw new Error("fail");
        const data = await resp.json();
        addMessage({
          id: crypto.randomUUID(),
          role: "muneem",
          text:
            data.response_hindi ||
            data.response ||
            data.reply ||
            "Samajh nahi aaya.",
          action: data.action_summary || data.action || undefined,
          timestamp: Date.now(),
        });
      } catch {
        addMessage({
          id: crypto.randomUUID(),
          role: "muneem",
          text: "Maaf kijiye, kuch gadbad ho gayi.",
          timestamp: Date.now(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [addMessage]
  );

  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (!blob || blob.size === 0) return;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: "Voice message...",
        timestamp: Date.now(),
      };
      addMessage(userMsg);
      setIsThinking(true);

      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        formData.append("merchant_id", DEMO_MERCHANT_ID);
        formData.append("language", "hi");
        const resp = await fetch(
          `${API_BASE_URL}/api/voice/process`,
          { method: "POST", body: formData }
        );
        if (!resp.ok) throw new Error("fail");
        const data = await resp.json();

        if (data.transcription || data.transcript) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userMsg.id
                ? { ...m, text: data.transcription || data.transcript }
                : m
            )
          );
        }

        addMessage({
          id: crypto.randomUUID(),
          role: "muneem",
          text:
            data.response_hindi ||
            data.response ||
            data.reply ||
            "Samajh nahi aaya.",
          action: data.action_summary || data.action || undefined,
          timestamp: Date.now(),
        });
      } catch {
        addMessage({
          id: crypto.randomUUID(),
          role: "muneem",
          text: "Voice command fail hua. Phir try karein.",
          timestamp: Date.now(),
        });
      } finally {
        setIsThinking(false);
      }
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording, addMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendText(input);
  };

  return (
    <div className="fixed bottom-24 right-6 z-50">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="w-[320px] h-[420px] bg-white rounded-2xl shadow-2xl border border-gray-200/60 flex flex-col overflow-hidden mb-3"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-[#002E6E] to-[#00BAF2] text-white">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Muneem AI</p>
                <p className="text-[10px] text-white/70 flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Online
                </p>
              </div>
              <Link
                href="/chat"
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Open full chat"
                title="Open full chat"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close chat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#F8FAFC]"
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                      msg.role === "user"
                        ? "bg-[#00BAF2] text-white rounded-br-sm"
                        : "bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm"
                    )}
                  >
                    <p>{msg.text}</p>
                    {msg.action && (
                      <p className="mt-1 text-[10px] text-emerald-600 font-medium">
                        &#10003; {msg.action}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-200/60 bg-white"
            >
              <button
                type="button"
                onClick={handleVoiceToggle}
                disabled={isThinking}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                  isRecording
                    ? "bg-red-500 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                )}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
              >
                {isRecording ? (
                  <MicOff className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isRecording ? "Sun raha hoon..." : "Type here..."}
                disabled={isThinking || isRecording}
                className="flex-1 h-8 px-3 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#00BAF2]/30 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isThinking}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#002E6E] to-[#00BAF2] text-white disabled:opacity-40 transition-opacity"
                aria-label="Send"
              >
                {isThinking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.9 }}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full shadow-xl transition-colors",
          open
            ? "bg-gray-700 hover:bg-gray-800"
            : "bg-gradient-to-br from-[#002E6E] to-[#00BAF2] hover:shadow-[#00BAF2]/40 shadow-[#00BAF2]/20"
        )}
        aria-label={open ? "Close chat" : "Open chat"}
      >
        {open ? (
          <X className="h-5 w-5 text-white" />
        ) : (
          <Headphones className="h-5 w-5 text-white" />
        )}
      </motion.button>
    </div>
  );
}
