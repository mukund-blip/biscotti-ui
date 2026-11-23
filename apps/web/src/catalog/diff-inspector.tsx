import type { CatalogEntry } from "./types";
import { DiffInspectorDemo } from "@/demos/diff-inspector-demo";

export const entry: CatalogEntry = {
  slug: "diff-inspector",
  number: "17",
  name: "Interactive Diff Inspector",
  group: "Information & editing",
  summary: "Reviews proposed edits one hunk at a time. Applies accepted changes to the document.",
  description:
    "A reviewer for edits that an AI proposes to prose or code. Each pending hunk has a pencil rule with a gap. Accept a hunk to close the gap and apply the change. The removed text collapses, so the document reads correctly. Word-level highlights show each change. The agent's reason is shown beside each hunk. Decide on one change at a time from the keyboard, or use Accept all and Reject all (“rest” after the first decision). Press U to undo the most recent decision.",
  useCases: ["Reviewing an agent's edits to a document or file", "Partial acceptance of a suggested rewrite", "Copy review before publishing"],
  scale: "l",
  Demo: DiffInspectorDemo,
  usage: `import { DiffInspector } from "@biscotti/ui";

<DiffInspector
  title="Launch notes — edits from Scout"
  path="press/os-1-launch.md"
  hunks={[
    {
      id: "h1",
      location: "§ Headline",
      lines: [
        { type: "del", text: "The most powerful synth we have made." },
        { type: "add", text: "A four-voice synth you can learn in an afternoon." },
      ],
      rationale: "Superlatives tested poorly in the last two launches.",
    },
  ]}
  onResolve={(decisions) => apply(decisions)}
/>`,
  props: [
    { name: "hunks", type: "DiffHunk[]", required: true, description: "Changes to review. Each has an id, optional location, lines (context/add/del) and optional rationale." },
    { name: "title", type: "ReactNode", default: '"Proposed changes"', description: "Heading for the review." },
    { name: "path", type: "string", description: "File or document path, shown in mono under the title." },
    { name: "variant", type: '"prose" | "code"', default: '"prose"', description: "Proportional text for documents, monospace with +/− gutters for code." },
    { name: "decisions", type: "Record<string, HunkDecision>", description: "Controlled decisions keyed by hunk id." },
    { name: "defaultDecisions", type: "Record<string, HunkDecision>", description: "Initial decisions when uncontrolled." },
    { name: "onDecisionsChange", type: "(d) => void", description: "Fires on every accept, reject or undo." },
    { name: "onResolve", type: "(d) => void", description: "Fires when the last pending hunk is decided. After an undo it can fire again once everything is decided again." },
    { name: "shortcuts", type: "boolean", default: "true", description: "Single-key shortcuts (J/K/A/R/U) on the focused change. Arrows, Home/End and Enter always work." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds (still requires global opt-in)." },
  ],
  exports: [{ name: "DiffHunk, DiffLine, HunkDecision", description: "Types for hunks, lines and decisions." }],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["J", "↓"], action: "Next change" },
    { keys: ["K", "↑"], action: "Previous change" },
    { keys: ["Home", "End"], action: "First / last change" },
    { keys: ["A", "Enter"], action: "Accept the focused change, then move to the next one" },
    { keys: ["R"], action: "Reject the focused change, then move to the next one" },
    { keys: ["U"], action: "Undo the most recent decision" },
  ],
  a11y: [
    "Changes are a list; the focused change is the single tab stop (roving tabindex) and its label states its position, location and decision.",
    "Added and removed lines are announced with visually hidden “Added:” / “Removed:” prefixes; meaning never relies on colour alone (strike-through, +/− gutters).",
    "Decisions are announced through a polite live region.",
    "Single-key shortcuts only work while a change has focus, and can be turned off with shortcuts={false} (WCAG 2.1.4).",
  ],
  motion: [
    { state: "Rest", behaviour: "Pending hunks show a pencil rule with a 5 px gap near the top." },
    { state: "Accept", behaviour: "The gap closes with the latch spring (≈3% overshoot) and the rule drains pencil→ink over 240 ms; removed lines collapse with the layout spring." },
    { state: "Reject", behaviour: "Additions collapse; the rule fades to rule-grey. The original text remains." },
    { state: "Undo", behaviour: "Collapsed lines re-expand with the layout spring; the gap reopens." },
    { state: "Navigate", behaviour: "Focus moves instantly; the progress ruler's pencil notch follows." },
    { state: "Reduced motion", behaviour: "No travel or height spring — lines swap with a 120 ms fade; colours still change." },
  ],
  sound: [
    { event: "Accept", voice: "latch" },
    { event: "Reject", voice: "dismiss" },
    { event: "Undo", voice: "unlatch (soft)" },
    { event: "Last change decided, or Accept / Reject all (replaces the decision's own voice)", voice: "complete" },
    { event: "Navigation", voice: "none" },
  ],
};
