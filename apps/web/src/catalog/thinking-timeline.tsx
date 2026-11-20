import type { CatalogEntry } from "./types";
import { ThinkingTimelineDemo } from "@/demos/thinking-timeline-demo";

export const entry: CatalogEntry = {
  slug: "thinking-timeline",
  number: "09",
  name: "Thinking Timeline",
  group: "Agent interactions",
  summary: "An agent's progress as user-facing steps that shrink into a past-tense summary.",
  description:
    "Shows what an agent is doing — not invented private reasoning — as a vertical run of steps. A pencil rail draws toward the active step while the header names it with a live elapsed timer. When the run finishes, the rail drains to ink, the header turns past tense (“Worked for 5s · 4 steps”) and the trace collapses unless the user has taken control of it.",
  useCases: ["Agent or copilot progress in chat", "Long-running background jobs with discrete stages", "Audit trail of what an automation did"],
  scale: "m",
  Demo: ThinkingTimelineDemo,
  Preview: () => <ThinkingTimelineDemo compact />,
  usage: `import { ThinkingTimeline } from "@detent/ui";

<ThinkingTimeline
  state={run.status}           // "running" | "done" | "error" | ...
  elapsedMs={run.elapsedMs}
  steps={run.steps.map((s) => ({
    id: s.id,
    title: s.title,            // "Searching supplier lead times"
    doneTitle: s.doneTitle,    // "Searched supplier lead times"
    status: s.status,          // "pending" | "running" | "done" | "error" | "skipped"
    meta: s.meta,              // "6 sources"
    durationMs: s.durationMs,
    detail: <Sources items={s.sources} />,
  }))}
/>`,
  props: [
    { name: "steps", type: "TimelineStep[]", required: true, description: "Ordered steps with id, title, optional doneTitle, status, meta, durationMs and detail." },
    { name: "state", type: '"idle" | "running" | "done" | "error" | "stopped"', required: true, description: "Overall run state; drives the header, rail and auto-collapse." },
    { name: "label", type: "string", description: "Header label while running. Defaults to the running step's title." },
    { name: "doneLabel", type: "(elapsedMs, steps) => string", default: "Worked for {duration}", description: "Past-tense header once done." },
    { name: "elapsedMs", type: "number", description: "Externally supplied elapsed time (e.g. server timestamps). Falls back to a local timer." },
    { name: "open / defaultOpen / onOpenChange", type: "boolean / boolean / (open) => void", default: "— / true / —", description: "Controlled or uncontrolled disclosure." },
    { name: "autoCollapse", type: "boolean", default: "true", description: "Collapse 700 ms after completion unless the user has toggled it." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds." },
  ],
  exports: [{ name: "TimelineStep, StepStatus", description: "Step data types." }],
  dependencies: ["motion"],
  a11y: [
    "The header is a disclosure button (aria-expanded / aria-controls) whose name is the visible status text.",
    "Step transitions and completion are announced once through a polite live region — not every timer tick.",
    "Status is conveyed by text and node shape (filled, ring, bar, dot), not colour alone.",
  ],
  motion: [
    { state: "Running", behaviour: "Header label sweeps (pencil passes across ink, 1.8 s); the active node pings; elapsed counts in tabular mono so digits don't jitter." },
    { state: "Step enter", behaviour: "New steps fade in from −4 px with the layout spring; the rail segment draws downward over 320 ms." },
    { state: "Header change", behaviour: "Label swaps with a 6 px vertical slide + 2 px blur (200 ms)." },
    { state: "Complete", behaviour: "Rail drains pencil→ink (240 ms); header turns past tense; collapses after 700 ms with the layout spring." },
    { state: "Error", behaviour: "Failed node turns err with a soft halo; header reads “Stopped on an error”; no collapse." },
    { state: "Reduced motion", behaviour: "No sweep, ping or slide — static ink label and instant rail; 120 ms opacity cues only." },
  ],
  sound: [
    { event: "User expands / collapses", voice: "tick (quiet)" },
    { event: "Automatic step updates", voice: "— (silent by design)" },
  ],
};
