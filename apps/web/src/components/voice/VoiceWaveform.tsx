"use client";

import { useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  isRecording: boolean;
  className?: string;
  barCount?: number;
}

export function VoiceWaveform({
  isRecording,
  className,
  barCount = 24,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const barsRef = useRef<number[]>(new Array(barCount).fill(0.1));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set canvas resolution
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = Math.max(2, (width / barCount) * 0.6);
    const gap = (width - barWidth * barCount) / (barCount - 1);

    ctx.clearRect(0, 0, width, height);

    const bars = barsRef.current;

    for (let i = 0; i < barCount; i++) {
      if (isRecording) {
        // Animate with random targets for natural audio look
        const target = 0.15 + Math.random() * 0.85;
        bars[i] = bars[i] + (target - bars[i]) * 0.3;
      } else {
        // Decay to minimum
        bars[i] = bars[i] * 0.9;
        if (bars[i] < 0.05) bars[i] = 0.05;
      }

      const barHeight = Math.max(3, bars[i] * height * 0.8);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      // Paytm blue gradient
      ctx.fillStyle = "#00BAF2";
      ctx.globalAlpha = 0.5 + bars[i] * 0.5;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [isRecording, barCount]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-12", className)}
      style={{ display: "block" }}
    />
  );
}
