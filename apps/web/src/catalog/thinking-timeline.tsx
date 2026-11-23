import type { CatalogEntry } from "./types";
import { ThinkingTimelineDemo } from "@/demos/thinking-timeline-demo";

export const entry: CatalogEntry = {
  slug: "thinking-timeline",
  number: "09",
  name: "Thinking Timeline",
  group: "Agent interactions",
  summary: "Shows agent progress as steps. Collapses into a past-tense summary when the run ends.",
  description:
    "Shows what an agent does, not invented private reasoning, as a vertical list of steps. A pencil rail extends to the active step. The header names the step and shows a live elapsed time. When the run ends, the rail changes to ink and the header changes to past tense (“Worked for 5s · 4 steps”). The trace then collapses, unless the user expanded or collapsed it.",
  useCases: ["Agent or copilot progress in chat", "Long-running background jobs with discrete stages", "Audit trail of what an automation did"],
  scale: "m",
  Demo: ThinkingTimelineDemo,
  Preview: () => <ThinkingTimelineDemo compact />,
  usage: `import { ThinkingTimeline } from "@biscotti/ui";

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
    { name: "autoCollapse", type: "boolean", default: "true", description: "Collapse 450 ms after completion unless the user has toggled it." },
    { name: "runId", type: "string", description: "Identifies a run. Changing it resets the local clock and forgets the user's open/closed override." },
    { name: "sound", type: "boolean", default: "true", description: "Accepted for consistency with the rest of the library; the timeline itself plays no sounds." },
  ],
  exports: [{ name: "TimelineStep, StepStatus", description: "Step data: id, title, doneTitle?, status (\"pending\" | \"running\" | \"done\" | \"error\" | \"skipped\"), meta?, durationMs?, detail?. Steps with detail get their own disclosure." }],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["Enter", "Space"], action: "On the header: show or hide the trace. Once toggled, the timeline stops auto-collapsing for that run" },
    { keys: ["Tab"], action: "Reach steps that have detail; Enter or Space expands one" },
  ],
  a11y: [
    "The header is a disclosure button (aria-expanded / aria-controls) whose name is the visible status text.",
    "Step transitions and completion are announced once through a polite live region — not every timer tick.",
    "Status is conveyed by text (each step carries a visually hidden “in progress”, “done”, “failed” or “skipped”) and node shape (ring, filled dot, bar), not colour alone.",
  ],
  motion: [
    { state: "Running", behaviour: "Collapsed, the header names the running step beside a pencil spinner; expanded, it reads “Working · step 2 of 4”. The running step's title carries the pencil sweep (1.8 s loop) and its node a soft pencil halo. Elapsed time counts in tabular mono so digits don't jitter." },
    { state: "Step enter", behaviour: "New steps fade in from −4 px on the layout spring; the rail segment below a started step draws downward over 320 ms." },
    { state: "Header change", behaviour: "The label crossfades with a 3 px vertical shift over 150 ms." },
    { state: "Complete", behaviour: "Rail segments drain pencil→rule (240 ms), done nodes shrink to small ink dots, the header turns past tense (“Worked for 5s”, with “4 steps” in mono) and the trace collapses 450 ms later on the layout spring — unless the user has toggled it or focus is inside a step." },
    { state: "Error", behaviour: "The failed node turns err with a soft halo; the header reads “Stopped on an error”; no auto-collapse." },
    { state: "Reduced motion", behaviour: "No sweep, slide or rail draw: the label is static, the rail and height change instantly, and 120 ms opacity cues remain." },
  ],
  sound: [
    { event: "Expand / collapse, step updates, completion", voice: "none (the timeline is silent; the sound prop is accepted for API consistency)" },
  ],
};
