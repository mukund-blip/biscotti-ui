import type { ComponentType } from "react";

export type Group = "Tactile controls" | "Commands & composition" | "Agent interactions" | "Information & editing";

export interface PropDoc {
  name: string;
  type: string;
  default?: string;
  description: string;
  required?: boolean;
}

export interface CatalogEntry {
  slug: string;
  /** "01"…"20" */
  number: string;
  name: string;
  group: Group;
  /** One line, ≤ 90 chars. Shown in the gallery. */
  summary: string;
  /** 2–4 sentences. What it is and what makes it distinctive. */
  description: string;
  useCases: string[];
  /**
   * Gallery presentation. `scale` drives the tile size in the index grid:
   *  s = small control (1 col), m = medium (2 cols), l = wide (3 cols), xl = full width.
   */
  scale: "s" | "m" | "l" | "xl";
  /** Main interactive demo — includes its own state/variant controls (use demo-kit). */
  Demo: ComponentType;
  /** Compact preview for the gallery index (no controls). Defaults to Demo. */
  Preview?: ComponentType;
  /** Copyable usage example (TSX). */
  usage: string;
  props: PropDoc[];
  /** Extra named exports worth documenting, e.g. sub-components or hooks. */
  exports?: { name: string; description: string }[];
  /** npm deps beyond react (e.g. "motion", "@base-ui/react"). */
  dependencies: string[];
  keyboard?: { keys: string[]; action: string }[];
  a11y: string[];
  /** Motion spec: rest, hover/focus, press, enter/exit, loading/complete, error, gesture, reduced motion. */
  motion: { state: string; behaviour: string }[];
  /** Sound map: which event plays which voice. */
  sound: { event: string; voice: string }[];
}
