"use client";
import { useReducedMotion, type Transition } from "motion/react";

/**
 * Motion tokens — chosen per interaction class, not one global duration.
 * Springs are expressed for `motion` (stiffness/damping/mass).
 */
export const spring = {
  /** Thumbs, small indicators. ζ≈0.85, no visible overshoot. */
  control: { type: "spring", stiffness: 700, damping: 45, mass: 1 },
  /** Mechanical latch — the only token allowed to overshoot (~3–4%). */
  latch: { type: "spring", stiffness: 900, damping: 42, mass: 1 },
  /** Height/collapse/reorder. Near-critical. */
  layout: { type: "spring", stiffness: 380, damping: 38, mass: 1 },
  /** Travelling selection indicators. */
  glide: { type: "spring", stiffness: 520, damping: 44, mass: 1 },
  /** Soft settle for large surfaces entering. */
  surface: { type: "spring", stiffness: 420, damping: 36, mass: 0.9 },
} as const satisfies Record<string, Transition>;

export const ease = {
  out: [0.2, 0.8, 0.2, 1],
  surface: [0.16, 1, 0.3, 1],
  in: [0.5, 0, 0.75, 0],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const duration = {
  micro: 0.09,
  fade: 0.12,
  surfaceIn: 0.2,
  surfaceOut: 0.14,
  drain: 0.24,
} as const;

export const tween = {
  fade: { duration: duration.fade, ease: ease.out },
  micro: { duration: duration.micro, ease: ease.out },
  surfaceIn: { duration: duration.surfaceIn, ease: ease.surface },
  surfaceOut: { duration: duration.surfaceOut, ease: ease.in },
  drain: { duration: duration.drain, ease: ease.out },
} as const satisfies Record<string, Transition>;

/** Reduced-motion substitute: a short opacity cue, no travel. */
export const reduced: Transition = { duration: 0.12, ease: "linear" };
export const instant: Transition = { duration: 0 };

/**
 * Returns a transition picker that swaps any spring/tween for its
 * reduced-motion equivalent. Travel → instant; opacity → 120ms fade.
 */
export function useMotionTokens() {
  const prefersReduced = useReducedMotion() ?? false;
  return {
    reduced: prefersReduced,
    /** For transforms (x/y/scale/width): instant under reduced motion. */
    move: (t: Transition): Transition => (prefersReduced ? instant : t),
    /** For opacity/colour: keep a short cue under reduced motion. */
    fade: (t: Transition = tween.fade): Transition => (prefersReduced ? reduced : t),
  };
}

/** Surface enter/exit variants (popovers, palettes, toolbars). */
export const surfaceVariants = (from: "top" | "bottom" = "bottom", reducedMotion = false) => {
  const dy = reducedMotion ? 0 : from === "bottom" ? 4 : -4;
  return {
    initial: { opacity: 0, y: dy, scale: reducedMotion ? 1 : 0.985 },
    animate: { opacity: 1, y: 0, scale: 1, transition: reducedMotion ? reduced : tween.surfaceIn },
    exit: { opacity: 0, y: dy / 2, scale: reducedMotion ? 1 : 0.99, transition: reducedMotion ? reduced : tween.surfaceOut },
  };
};
