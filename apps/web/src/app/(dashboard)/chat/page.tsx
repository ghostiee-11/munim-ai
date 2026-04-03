"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  Play,
  Pause,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL, DEMO_MERCHANT_ID } from "@/lib/constants";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

// --------------- Types ---------------
interface ChatMessage {
  id: string;
  role: "user" | "muneem";
  text: string;
  action?: string;
  isAction?: boolean;
  audioUrl?: string;
  isVoice?: boolean;
  timestamp: number;
}

const STORAGE_KEY = "munim-chat-history";
const GREETING: ChatMessage = {
  id: "greeting",
  role: "muneem",
  text: "Namaste! Main aapka digital Muneem hoon. Boliye kya madad karun?",
  timestamp: Date.now(),
};

const QUICK_CHIPS = [
  "Aaj ka hisaab",
  "Udhari list",
  "GST status",
  "Cash forecast",
];

// --------------- Helpers ---------------
function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [GREETING];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[];
      return parsed.length > 0 ? parsed : [GREETING];
    }
  } catch {
    // ignore
  }
  return [GREETING];
}

function saveHistory(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-200)));
  } catch {
    // ignore
  }
}

// --------------- Component ---------------
export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isRecording, startRecording, stopRecording } = useVoiceRecorder();

  // Persist messages
  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isThinking]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // ---------- Send text ----------
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
        const resp = await fetch(`${API_BASE_URL}/api/voice/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            merchant_id: DEMO_MERCHANT_ID,
            language: "hi",
          }),
        });

        if (!resp.ok) throw new Error("Request failed");
        const data = await resp.json();

        const muneemMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "muneem",
          text: data.reply || data.response_hindi || data.response || "Samajh nahi aaya, phir boliye.",
          action: data.is_action ? data.action_taken : undefined,
          isAction: data.is_action || false,
          audioUrl: data.audio_url || undefined,
          timestamp: Date.now(),
        };
        addMessage(muneemMsg);

        // Auto-play TTS if available
        if (muneemMsg.audioUrl) {
          playAudio(muneemMsg.id, muneemMsg.audioUrl);
        }
      } catch {
        addMessage({
          id: crypto.randomUUID(),
          role: "muneem",
          text: "Maaf kijiye, kuch gadbad ho gayi. Phir try karein.",
          timestamp: Date.now(),
        });
      } finally {
        setIsThinking(false);
      }
    },
    [addMessage]
  );

  // ---------- Send voice ----------
  const handleVoiceToggle = useCallback(async () => {
    if (isRecording) {
      const blob = await stopRecording();
      if (!blob || blob.size === 0) return;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: "Voice message...",
        isVoice: true,
        timestamp: Date.now(),
      };
      addMessage(userMsg);
      setIsThinking(true);

      try {
        // Step 1: Transcribe audio via /process
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");
        formData.append("merchant_id", DEMO_MERCHANT_ID);
        formData.append("language", "hi");

        const sttResp = await fetch(
          `${API_BASE_URL}/api/voice/process`,
          { method: "POST", body: formData }
        );

        if (!sttResp.ok) throw new Error("Voice processing failed");
        const sttData = await sttResp.json();
        const transcript = sttData.transcript || sttData.transcription || "";

        // Update user message with transcription
        if (transcript) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userMsg.id
                ? { ...m, text: transcript }
                : m
            )
          );
        }

        // Step 2: Send transcript to /chat for conversational response
        const chatResp = await fetch(`${API_BASE_URL}/api/voice/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: transcript || "voice message",
            merchant_id: DEMO_MERCHANT_ID,
            language: "hi",
          }),
        });

        if (!chatResp.ok) throw new Error("Chat request failed");
        const chatData = await chatResp.json();

        const muneemMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "muneem",
          text: chatData.reply || chatData.response_hindi || "Samajh nahi aaya.",
          action: chatData.is_action ? chatData.action_taken : undefined,
          isAction: chatData.is_action || false,
          audioUrl: chatData.audio_url || undefined,
          timestamp: Date.now(),
        };
        addMessage(muneemMsg);

        if (muneemMsg.audioUrl) {
          playAudio(muneemMsg.id, muneemMsg.audioUrl);
        }
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

  // ---------- Audio playback ----------
  const playAudio = (msgId: string, url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(msgId);
    audio.play().catch(() => {});
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
  };

  const toggleAudio = (msgId: string, url: string) => {
    if (playingId === msgId) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      playAudio(msgId, url);
    }
  };

  // ---------- Handle submit ----------
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendText(input);
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-5rem)] -mx-4 -my-6 sm:-mx-6 lg:-mx-8">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200/60 bg-white">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#002E6E] to-[#00BAF2] shadow-md">
          <Sparkles className="h-5 w-5 text-white" />
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#002E6E]">Muneem AI</h2>
          <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Online
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-[#F8FAFC]"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "bg-[#00BAF2] text-white rounded-br-md"
                    : "bg-white text-gray-800 border border-gray-100 rounded-bl-md"
                )}
              >
                {msg.isVoice && msg.role === "user" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Volume2 className="h-3.5 w-3.5 opacity-70" />
                    <span className="text-[10px] opacity-70">Voice</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Action badge */}
                {msg.action && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg w-fit">
                    <span>&#9989;</span>
                    <span>{msg.action.replace(/_/g, " ")}</span>
                  </div>
                )}

                {/* Audio play button */}
                {msg.audioUrl && (
                  <button
                    onClick={() => toggleAudio(msg.id, msg.audioUrl!)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-[#00BAF2] hover:text-[#002E6E] transition-colors"
                  >
                    {playingId === msg.id ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    <span>{playingId === msg.id ? "Pause" : "Play audio"}</span>
                  </button>
                )}

                <p
                  className={cn(
                    "text-[10px] mt-1",
                    msg.role === "user"
                      ? "text-white/60"
                      : "text-gray-400"
                  )}
                >
                  {new Date(msg.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                <motion.span
                  className="h-2 w-2 rounded-full bg-gray-400"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                />
                <motion.span
                  className="h-2 w-2 rounded-full bg-gray-400"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                />
                <motion.span
                  className="h-2 w-2 rounded-full bg-gray-400"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Quick chips */}
      <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-white border-t border-gray-100">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => sendText(chip)}
            disabled={isThinking}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-[#002E6E] bg-[#00BAF2]/10 rounded-full hover:bg-[#00BAF2]/20 transition-colors disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-3 bg-white border-t border-gray-200/60"
      >
        {/* Mic button */}
        <motion.button
          type="button"
          onClick={handleVoiceToggle}
          disabled={isThinking}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
            isRecording
              ? "bg-red-500 text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          )}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording && (
            <motion.div
              className="absolute inset-0 rounded-full bg-red-500/30"
              animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          )}
          {isRecording ? (
            <MicOff className="h-4 w-4 relative z-10" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </motion.button>

        {/* Text input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isRecording
              ? "Sun raha hoon..."
              : "Type your message..."
          }
          disabled={isThinking || isRecording}
          className="flex-1 h-10 px-4 rounded-xl border border-gray-200 bg-gray-50/50 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00BAF2]/20 focus:border-[#00BAF2]/40 transition-all disabled:opacity-50"
        />

        {/* Send button */}
        <motion.button
          type="submit"
          disabled={!input.trim() || isThinking}
          whileTap={{ scale: 0.9 }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#002E6E] to-[#00BAF2] text-white shadow-md disabled:opacity-40 disabled:shadow-none transition-opacity"
          aria-label="Send message"
        >
          {isThinking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </motion.button>
      </form>
    </div>
  );
}
