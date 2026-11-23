import type { CatalogEntry } from "./types";
import { ActivityStackDemo } from "@/demos/activity-stack-demo";

export const entry: CatalogEntry = {
  slug: "activity-stack",
  number: "11",
  name: "Agent Activity Stack",
  group: "Agent interactions",
  summary: "Concurrent agent tasks that sort by urgency and sink into a deck of finished work.",
  description:
    "A live board of everything an agent is doing in the background. Running work sits on top with pencil progress, failures stay in view with their error and a Retry, and paused or queued tasks wait below. When a task finishes it sinks and compresses into a physically layered “N completed” deck at the bottom; click the deck and the cards fan out into a list. A thin segmented bar in the header shows how many concurrency slots are in use and by what.",
  useCases: ["Background agent jobs in a copilot sidebar", "Batch automations with limited concurrency", "Long-running exports, imports and syncs"],
  scale: "l",
  Demo: ActivityStackDemo,
  Preview: () => <ActivityStackDemo compact />,
  usage: `import { ActivityStack } from "@biscotti/ui";

<ActivityStack
  title="Scout · background work"
  capacity={4}
  tasks={jobs.map((j) => ({
    id: j.id,
    title: j.title,            // "Reconciling pre-order payments"
    doneTitle: j.doneTitle,    // "Reconciled pre-order payments"
    status: j.status,          // "queued" | "running" | "paused" | "completed" | "failed" | "cancelled"
    progress: j.progress,      // 0–1, omit for indeterminate
    elapsedMs: j.workedMs,
    meta: "412 orders",
    error: j.error,
  }))}
  onPause={pause}
  onResume={resume}
  onCancel={cancel}
  onRetry={retry}
  onOpen={openTranscript}
/>`,
  props: [
    { name: "tasks", type: "ActivityTask[]", required: true, description: "Tasks in any order; the stack sorts running → failed → paused → queued and moves finished work to the deck." },
    { name: "title", type: "ReactNode", default: '"Activity"', description: "Panel heading." },
    { name: "capacity", type: "number", description: "Concurrency slots drawn in the header bar. Running, paused and failed tasks hold a slot." },
    { name: "onPause / onResume / onCancel / onRetry", type: "(id) => void", description: "Per-task actions. Each button only appears when its handler is provided. Cancel on a failed task reads “Dismiss”." },
    { name: "onOpen", type: "(id) => void", description: "Turns task titles (active and in the deck) into buttons." },
    { name: "deckOpen / defaultDeckOpen / onDeckOpenChange", type: "boolean / boolean / (open) => void", default: "— / false / —", description: "Controlled or uncontrolled deck." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds." },
    { name: "className", type: "string", description: "Applied to the root section." },
  ],
  exports: [{ name: "ActivityTask, ActivityStatus", description: "Task data: id, title, doneTitle? (falls back to title), status, progress? (0–1; omit for indeterminate), elapsedMs? (running time; a local timer fills in while running), meta?, error? (shown when failed)." }],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["Tab"], action: "Moves through task titles, actions, the deck toggle and (when open) finished tasks" },
    { keys: ["Enter", "Space"], action: "Activates the focused action; pause ⇄ resume keeps focus in place" },
  ],
  a11y: [
    "A labelled section with an ordered list of active tasks; each task's status and percentage are part of its accessible name, while ticking timers are aria-hidden.",
    "Each running task exposes a progressbar with its value; the capacity bar is an image labelled “3 of 4 slots in use”.",
    "The deck is a disclosure button (aria-expanded / aria-controls); collapsed cards are inert so they can't be tabbed into.",
    "Failures and completions are announced once through a polite live region. Progress ticks are never announced.",
    "If an action removes the focused control (Retry, Cancel), focus moves to the same task's new primary action or to the neighbouring row.",
    "Row actions are revealed on hover or focus for pointer users and are always visible on touch devices.",
  ],
  motion: [
    { state: "Rest", behaviour: "Static. Running tasks show a pencil node and a pencil progress hairline; nothing loops." },
    { state: "Hover / focus", behaviour: "Row actions appear instantly and fade out over 90 ms." },
    { state: "Reorder", behaviour: "Rows slide to their new rank with the layout spring (stiffness 380, damping 38) when a task fails, pauses or is retried." },
    { state: "Complete", behaviour: "The row sinks 14 px and fades (220 ms ease-in), the rows below close the gap, and a card drops 16 px onto the deck while the cards behind it shift one layer down." },
    { state: "Deck fan-out", behaviour: "Cards spread from a 5 px-offset stack to a list with an 18 ms stagger on the layout spring; their content fades in as they land. Collapsing reverses the order." },
    { state: "Capacity bar", behaviour: "Segments recolour in slot order (pencil running, edge paused, err failed) with a 240 ms drain." },
    { state: "Error", behaviour: "Node and label turn err; the error line and Retry appear in place with no extra motion." },
    { state: "Reduced motion", behaviour: "No travel or stagger: rows and cards change position instantly, with a 120 ms opacity cue." },
  ],
  sound: [
    { event: "Pause", voice: "unlatch (soft)" },
    { event: "Resume", voice: "latch (soft)" },
    { event: "Retry", voice: "tap" },
    { event: "Cancel / dismiss", voice: "dismiss" },
    { event: "Deck open / close, background progress, completion, failure", voice: "— (silent by design)" },
  ],
};
