"use client";

import { useSpring, type SpringOptions } from "framer-motion";
import { useEffect } from "react";

const defaultSpring: SpringOptions = {
  stiffness: 100,
  damping: 20,
  mass: 1,
};

/**
 * Returns a Framer Motion spring-based animated value
 * that morphs smoothly from old to new when target changes.
 */
export function useAnimatedValue(
  target: number,
  options: SpringOptions = defaultSpring
) {
  const motionValue = useSpring(target, options);

  useEffect(() => {
    motionValue.set(target);
  }, [target, motionValue]);

  return motionValue;
}
