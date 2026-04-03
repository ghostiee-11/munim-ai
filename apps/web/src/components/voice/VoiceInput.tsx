"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Mic, Loader2, CheckCircle } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { VoiceWaveform } from "./VoiceWaveform";

interface VoiceInputProps {
  onResult: (blob: Blob) => void;
  isProcessing?: boolean;
  className?: string;
}

type VoiceState = "idle" | "recording" | "processing" | "result";

export function VoiceInput({
  onResult,
  isProcessing = false,
  className,
}: VoiceInputProps) {
  const { isRecording, startRecording, stopRecording, error } = useVoiceRecorder();
  const [state, setState] = useState<VoiceState>("idle");

  const currentState: VoiceState = isProcessing
    ? "processing"
    : isRecording
      ? "recording"
      : state;

  const handlePointerDown = useCallback(async () => {
    setState("recording");
    await startRecording();
  }, [startRecording]);

  const handlePointerUp = useCallback(async () => {
    const blob = await stopRecording();
    if (blob && blob.size > 0) {
      setState("processing");
      onResult(blob);
      // Auto-reset after brief delay
      setTimeout(() => setState("idle"), 3000);
    } else {
      setState("idle");
    }
  }, [stopRecording, onResult]);

  const stateStyles: Record<VoiceState, string> = {
    idle: "bg-[#00BAF2] hover:bg-[#00a5d9] shadow-lg shadow-[#00BAF2]/25",
    recording: "bg-red-500 shadow-lg shadow-red-500/30",
    processing: "bg-[#002E6E] shadow-lg shadow-[#002E6E]/25",
    result: "bg-emerald-500 shadow-lg shadow-emerald-500/25",
  };

  const stateLabels: Record<VoiceState, string> = {
    idle: "Bol ke batao",
    recording: "Sun raha hoon...",
    processing: "Samajh raha hoon...",
    result: "Ho gaya!",
  };

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      {/* Waveform (shown during recording) */}
      <AnimatePresence>
        {currentState === "recording" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 48 }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-[200px] overflow-hidden"
          >
            <VoiceWaveform isRecording={isRecording} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic Button */}
      <div className="relative">
        {/* Pulsing Ring */}
        <AnimatePresence>
          {currentState === "recording" && (
            <motion.div
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full bg-red-400"
            />
          )}
        </AnimatePresence>

        <motion.button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={isRecording ? handlePointerUp : undefined}
          whileTap={{ scale: 0.92 }}
          className={cn(
            "relative w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-300 touch-none select-none",
            stateStyles[currentState]
          )}
          aria-label={stateLabels[currentState]}
          disabled={currentState === "processing"}
        >
          <AnimatePresence mode="wait">
            {currentState === "processing" ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </motion.div>
            ) : currentState === "result" ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <CheckCircle className="w-8 h-8 text-white" />
              </motion.div>
            ) : (
              <motion.div
                key="mic"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Mic className="w-8 h-8 text-white" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* State Label */}
      <motion.p
        key={currentState}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-sm font-medium text-gray-500"
      >
        {stateLabels[currentState]}
      </motion.p>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 text-center max-w-[250px]">{error}</p>
      )}
    </div>
  );
}
