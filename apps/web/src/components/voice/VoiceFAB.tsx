"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { DEMO_MERCHANT_ID, API_BASE_URL } from "@/lib/constants";

type FABState = "idle" | "recording" | "processing";

export function VoiceFAB() {
  const [state, setState] = useState<FABState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const toast = useToast();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await processAudio(blob);
      };

      mediaRecorder.start();
      setState("recording");
    } catch {
      toast.error("Mic access denied. Please allow microphone.");
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setState("processing");
    }
  }, []);

  const processAudio = async (blob: Blob) => {
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
      toast.success(data.response_hindi || data.reply || "Command processed");
    } catch {
      toast.error("Voice command fail hua. Phir try karein.");
    } finally {
      setState("idle");
    }
  };

  const handleClick = () => {
    if (state === "idle") startRecording();
    else if (state === "recording") stopRecording();
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {state === "recording" && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg"
          >
            Bol rahe hain... tap to stop
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={handleClick}
        disabled={state === "processing"}
        whileTap={{ scale: 0.9 }}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-colors ${
          state === "recording"
            ? "bg-red-500 hover:bg-red-600 shadow-red-500/30"
            : state === "processing"
              ? "bg-gray-400 cursor-wait"
              : "bg-gradient-to-br from-[#002E6E] to-[#00BAF2] hover:shadow-[#00BAF2]/40 shadow-[#00BAF2]/20"
        }`}
        aria-label="Voice input"
      >
        {state === "recording" && (
          <motion.div
            className="absolute inset-0 rounded-full bg-red-500/30"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}
        {state === "processing" ? (
          <Loader2 className="h-6 w-6 text-white animate-spin" />
        ) : state === "recording" ? (
          <MicOff className="h-6 w-6 text-white" />
        ) : (
          <Mic className="h-6 w-6 text-white" />
        )}
      </motion.button>
    </div>
  );
}
