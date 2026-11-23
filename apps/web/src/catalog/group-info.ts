import type { Group } from "./types";

/** One plain line per group: what's in it, not what it aspires to. */
export const groupIntro: Record<Group, string> = {
  "Tactile controls": "Buttons, switches, segments and sliders with real travel and full keyboard support.",
  "Commands & composition": "A command palette, @-mentions, a prompt input and a selection toolbar.",
  "Agent interactions": "Streamed answers, tool calls, approvals with undo, progress traces and multi-step runs.",
  "Information & editing": "A data table, filters, a chart card, a diff reviewer, toasts and a property inspector.",
};

export const groupId = (g: string) => g.toLowerCase().replace(/[^a-z]+/g, "-");

/**
 * Curated tiling (columns of 6) so every group fills complete rows, in reading order.
 * Anything missing here falls back to the span implied by its scale.
 */
export const tileLayout: Record<Group, [slug: string, cols: 2 | 3 | 4 | 6][]> = {
  "Tactile controls": [["kinetic-button", 3], ["precision-toggle", 3], ["segmented-control", 2], ["interactive-slider", 4]],
  "Commands & composition": [["command-palette", 4], ["mention-picker", 2], ["prompt-composer", 3], ["action-toolbar", 3]],
  "Agent interactions": [["streaming-response", 4], ["tool-chip", 2], ["approval-card", 3], ["thinking-timeline", 3], ["activity-stack", 3], ["workflow-stepper", 3]],
  "Information & editing": [["data-table", 6], ["filter-builder", 3], ["insight-card", 3], ["diff-inspector", 4], ["notifications", 2], ["property-editor", 6]],
};

/** Components the Workbench demo actually uses, so their pages can point to it. */
export const inWorkbench = new Set([
  "command-palette", "data-table", "filter-builder", "insight-card", "notifications",
  "activity-stack", "approval-card", "tool-chip", "prompt-composer", "streaming-response",
]);
