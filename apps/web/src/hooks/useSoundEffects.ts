"use client";

import { useCallback, useEffect, useRef } from "react";

type SoundType = "income" | "expense" | "alert" | "collection";

const SOUND_PATHS: Record<SoundType, string> = {
  income: "/sounds/income.mp3",
  expense: "/sounds/expense.mp3",
  alert: "/sounds/alert.mp3",
  collection: "/sounds/collection.mp3",
};

/**
 * Audio playback hook for UI sound effects.
 * Preloads audio files and provides typed play functions.
 */
export function useSoundEffects() {
  const audioCache = useRef<Map<SoundType, HTMLAudioElement>>(new Map());

  useEffect(() => {
    // Preload all sounds
    for (const [key, path] of Object.entries(SOUND_PATHS)) {
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.volume = 0.5;
      audioCache.current.set(key as SoundType, audio);
    }

    return () => {
      audioCache.current.forEach((audio) => {
        audio.pause();
        audio.src = "";
      });
      audioCache.current.clear();
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    const audio = audioCache.current.get(type);
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Ignore autoplay restrictions - sound will play on next user interaction
      });
    }
  }, []);

  return {
    playIncome: useCallback(() => play("income"), [play]),
    playExpense: useCallback(() => play("expense"), [play]),
    playAlert: useCallback(() => play("alert"), [play]),
    playCollection: useCallback(() => play("collection"), [play]),
  };
}
