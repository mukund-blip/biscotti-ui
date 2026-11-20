import type { Group } from "./types";

/** One plain line per group: what's in it, not what it aspires to. */
export const groupIntro: Record<Group, string> = {
  "Tactile controls": "Buttons, switches, segments and sliders with real travel and full keyboard support.",
  "Commands & composition": "A command palette, @-mentions, a prompt input and a selection toolbar.",
  "Agent interactions": "Streamed answers, tool calls, approvals with undo, progress traces and multi-step runs.",
  "Information & editing": "A data table, filters, a chart card, a diff reviewer, toasts and a property inspector.",
};

export const groupId = (g: string) => g.toLowerCase().replace(/[^a-z]+/g, "-");
