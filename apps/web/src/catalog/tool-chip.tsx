import type { CatalogEntry } from "./types";
import { ToolChipDemo } from "@/demos/tool-chip-demo";

export const entry: CatalogEntry = {
  slug: "tool-chip",
  number: "12",
  name: "Tool Execution Chip",
  group: "Agent interactions",
  summary: "One quiet inline chip per tool call that opens in place into its input and output.",
  description:
    "Records each tool an agent calls as a single line: verb, target in mono, and the one number that matters (+12 −3 with a five-cell diff bar, 7 results, exit 1, 200). While a call runs it is present tense with one pencil spinner; when it lands it settles to quiet past tense, or err for a failure. Clicking a chip widens it into a detail card in place, with the arguments, output (a command's last three lines first) and duration. ToolChipGroup folds a whole run into “7 tool calls · 2 files changed” with one tick per call, and the ticks double as a jump list: click one (or arrow to it) to open the group at that call.",
  useCases: ["Coding-agent transcripts (reads, searches, edits, test runs)", "Audit trail of what an assistant touched", "Compact tool-use log under a chat reply"],
  scale: "m",
  Demo: ToolChipDemo,
  Preview: () => <ToolChipDemo compact />,
  usage: `import { ToolChip, ToolChipGroup } from "@detent/ui";

<ToolChipGroup defaultOpen>
  <ToolChip kind="read" target="firmware/src/input/encoder.ts" lines={[1, 184]} />
  <ToolChip kind="edit" target="firmware/src/input/encoder.ts" added={12} removed={3} />
  <ToolChip
    kind="command"
    status={run.status}            // "pending" | "done" | "error"
    target="pnpm test src/input"
    exitCode={run.exitCode}
    output={run.lines}
    durationMs={run.ms}
  />
</ToolChipGroup>`,
  props: [
    { name: "kind", type: '"edit" | "search" | "command" | "fetch" | "read"', required: true, description: "Picks the icon, the verbs (Editing → Edited, Running → Ran…) and the metadata format." },
    { name: "target", type: "string", required: true, description: "File path, query, command or URL. Paths show their basename in the chip and the full path when expanded." },
    { name: "status", type: '"pending" | "done" | "error"', default: '"done"', description: "Pending is pencil + present tense; done settles to past tense; error is marked in err." },
    { name: "added / removed", type: "number", description: "edit: line counts, drawn as +12 −3 and a five-cell bar that always splits the add/del proportion across all five cells (a non-zero side keeps at least one)." },
    { name: "results", type: "number", description: "search: result count." },
    { name: "exitCode", type: "number", description: "command: exit code; non-zero reads as a failure." },
    { name: "httpStatus", type: "number", description: "fetch: HTTP status." },
    { name: "lines", type: "[number, number]", description: "read: the line range read." },
    { name: "args", type: "Record<string, string | number | boolean | null | undefined>", description: "Input arguments, listed as key/value pairs in the detail card." },
    { name: "output", type: "string | string[]", description: "Tool output. Commands show the last 3 lines (others 8) until “Show all”; edit lines beginning +/− render as a diff." },
    { name: "error", type: "string", description: "Failure message shown in the detail card." },
    { name: "durationMs", type: "number", description: "Wall time. While pending, an open card shows a live timer instead; a collapsed chip shows a quiet 1 Hz clock after 3 s." },
    { name: "startedAt", type: "number (epoch ms)", description: "When the call started. The live timer counts from here; without it, from when the chip became pending. Either way it counts while collapsed, so opening mid-run shows the true elapsed time." },
    { name: "verb", type: "{ pending?, done?, error? }", description: "Override the verbs for custom tools." },
    { name: "open / defaultOpen / onOpenChange", type: "boolean / boolean / (open) => void", default: "false", description: "Controlled or uncontrolled expanded state." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds (inherits from a ToolChipGroup; still requires global opt-in)." },
  ],
  exports: [
    { name: "ToolChipGroup", description: "Summary line (“4 tool calls · 2 files changed”, one tick per call) that expands to the list of chips. Props: children, open, defaultOpen, onOpenChange, summary(stats), sound. Chips register through context, so they may be wrapped, memoised or returned from fragments; order is document order. The tick ruler is a jump list (toolbar). With no calls yet it shows a quiet, non-interactive “Starting…” line." },
    { name: "describeToolCall(props)", description: "The plain-language sentence used as a chip's accessible name, e.g. “Edited encoder.ts, 12 lines added, 3 removed”." },
    { name: "ToolChipProps, ToolChipKind, ToolChipStatus, ToolChipCall, ToolChipGroupProps, ToolChipGroupStats", description: "Types." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["←", "→", "Home", "End"], action: "Move between ticks in a group's jump list (one tab stop)" },
    { keys: ["Enter on a tick"], action: "Open the group, scroll to that call and focus its chip" },
    { keys: ["Enter", "Space"], action: "Expand or collapse the focused chip or group" },
    { keys: ["Esc"], action: "Collapse an open card and return focus to its chip" },
    { keys: ["Tab"], action: "Move between chips, then into an open card's buttons" },
  ],
  a11y: [
    "The group's tick ruler is a toolbar (“Jump to call”) with a roving tab stop; each tick is a button named “Go to call 4: Ran pnpm test src/input, exit code 1, failed”. Ticks keep their 2 × 10 px mark; the hit area is the full 28 px row height and the tick's 4 px share of the ruler, and the whole ruler is contiguous so a click always lands on the nearest tick.",
    "Long URLs are truncated in the middle (ci.ostra.dev/…/pipelines/412); the full target stays in the accessible name and the tooltip.",
    "Each chip is a native button with aria-expanded/aria-controls; its accessible name is one plain sentence (“Ran pnpm test src/input, exit code 1, failed”), so glyphs, colours and the diff bar are never the only signal.",
    "Pending chips set aria-busy and announce only real transitions to done or failed, never the state they mount in. A standalone chip has its own polite live region; inside a ToolChipGroup the group owns one live region, so outcomes are still spoken while the group is collapsed (and its body inert).",
    "The ticking duration in an open pending card is aria-hidden; names never contain timers.",
    "The detail card is a labelled region; Escape inside it collapses the card and returns focus to the chip.",
    "Focus ring is drawn on the chip's outer edge so it stays visible during the morph.",
  ],
  motion: [
    { state: "Rest", behaviour: "Static: hairline chip on surface. Done chips are ink-2, quieter than running ones." },
    { state: "Hover", behaviour: "Instant: face tints sunken, hairline darkens to rule, chevron to muted. 90 ms out." },
    { state: "Pending", behaviour: "One live mark: the pencil spinner in place of the icon. Everything else stays ink: the chip's hairline firms to rule, the group's tick for the running call is ink, an open group's header shows its tool icon in ink, and a collapsed chip running past 3 s shows a muted 1 Hz clock in a reserved tabular slot. A group shows the spinner in its header only while collapsed." },
    { state: "Complete", behaviour: "Spinner swaps for the kind icon (120 ms fade, control-spring scale); the firmer rule edge drains back to a quiet hairline over 240 ms; the five diff cells grow in left to right, 35 ms apart." },
    { state: "Error", behaviour: "Icon becomes an err alert and the metric (exit 1, 503) turns err. No shake." },
    { state: "Expand", behaviour: "The chip itself becomes the card: width, face height (24→32) and padding animate together on the layout spring, radius 2→6, so neighbours are pushed rather than overlapped and nothing snaps on frame 0. Surface→raised and the shadow cross-dissolve over 140 ms. The body is laid out once at its final width and revealed by the growing clip, so text never rewraps or scales. Body and duration fade in 50–60 ms behind." },
    { state: "Collapse", behaviour: "Height folds on the layout spring while width tucks back on the stiffer control spring so it doesn't trail." },
    { state: "Group", behaviour: "Body opens with the layout spring; each new call adds a tick that grows from the baseline. The header crossfades (120 ms, pop layout) between the active call and the settled summary." },
    { state: "Reduced motion", behaviour: "No width/height/padding travel or cell growth; card, duration, header text and icons swap with a 120 ms opacity cue." },
  ],
  sound: [
    { event: "Copy output", voice: "tap (honours `sound` on the chip, else its group)" },
    { event: "Expand / collapse", voice: "none (disclosure is silent)" },
    { event: "Call starts, completes or fails", voice: "none (agent activity, not a user action)" },
  ],
};
