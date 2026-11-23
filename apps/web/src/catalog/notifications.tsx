import type { CatalogEntry } from "./types";
import { NotificationsDemo, NotificationsPreview } from "@/demos/notifications-demo";

export const entry: CatalogEntry = {
  slug: "notifications",
  number: "20",
  name: "Notification & Feedback System",
  group: "Information & editing",
  summary: "Stacked toasts with undo countdowns, in-place progress and a persistent Callout.",
  description:
    "A <Toaster /> plus an imperative toast() API. At rest, up to three toasts layer into a compact stack; hover or focus fans them out into a list. Undoable actions draw a pencil countdown hairline that becomes final when it runs out, and progress toasts update in place before settling into success. Timers pause while the stack is hovered or focused and while the window is in the background. Callout is the inline, persistent sibling for conditions that shouldn't time out.",
  useCases: ["Confirming an action with a chance to undo it", "Upload or sync progress that resolves in place", "Error reporting with a retry action", "Persistent warnings on a page (Callout)"],
  scale: "m",
  Demo: NotificationsDemo,
  Preview: NotificationsPreview,
  usage: `import { Toaster, toast } from "@biscotti/ui";

// once, near the root
<Toaster placement="bottom-right" />

// anywhere
toast.success("Preset “Glass Choir” saved");

toast("Archived #2041", {
  undo: { onUndo: () => restore(2041), onCommit: () => purge(2041) },
});

toast.promise(syncRetailers(), {
  loading: "Syncing stock with retailers…",
  success: (n) => \`Stock synced with \${n} retailers\`,
  error: "Couldn’t reach Synth Haus.",
});`,
  props: [
    { name: "placement", type: '"top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"', default: '"bottom-right"', description: "Corner or edge to stack against." },
    { name: "maxVisible", type: "number", default: "3", description: "Toasts shown at once; newer ones push older ones into a queue." },
    { name: "gap", type: "number", default: "8", description: "Gap between toasts when fanned out, in px." },
    { name: "edgeOffset", type: "number", default: "16", description: "Distance from the viewport (or container) edge, in px." },
    { name: "id", type: "string", default: '"default"', description: "Only show toasts sent with { toaster: id }, so several toasters can coexist." },
    { name: "contained", type: "boolean", default: "false", description: "Position inside the nearest positioned ancestor instead of the viewport." },
    { name: "hotkey", type: '"alt+t" | false', default: '"alt+t"', description: "Focuses the newest toast. false disables it." },
    { name: "undoHotkey", type: "boolean", default: "true", description: "⌘Z / Ctrl+Z triggers the newest Undo when focus is not in a text field." },
    { name: "label", type: "string", default: '"Notifications"', description: "Region name for assistive tech (the hotkey is appended)." },
    { name: "width", type: "number", default: "360", description: "Toast width in px." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this toaster to play sounds (still requires global opt-in)." },
    { name: "className", type: "string", description: "Classes for the toaster region." },
  ],
  exports: [
    { name: "toast(title, options?)", description: "Shows a toast and returns its id. Variants: toast.success, .error, .warning, .info and .progress." },
    { name: "ToastOptions", description: "id (reuse to replace in place), description, duration (4 s; warning 6 s; error 7 s; undo 6 s; progress until updated; Infinity to persist), progress (0–1, or omit for a spinner), action { label, onClick }, undo, dismissible (default true), icon, toaster, silent and onDismiss(reason)." },
    { name: "ToastUndo", description: "{ onUndo, onCommit?, label? = \"Undo\", doneTitle? = \"Undone\" }. onCommit fires when the countdown ends without an undo." },
    { name: "toast.update(id, patch)", description: "Patches a toast in place, e.g. { progress: 0.6 } or { type: \"success\", title }. A type change restarts its timer." },
    { name: "toast.promise(promise | () => promise, { loading, success, error, description? }, options?)", description: "One toast that goes from loading to success or error. success and error can be functions of the result. Returns the original promise." },
    { name: "toast.dismiss(id?)", description: "Dismisses one toast, or all of them without an id." },
    { name: "Callout", description: "Inline banner sharing the toast's tones and icons: tone (\"neutral\" | \"info\" | \"success\" | \"warning\" | \"error\", default \"info\"), title, children, action, onDismiss, icon, live and sound." },
    { name: "ToastPlacement, ToastRecord, ToastType, ToastDismissReason, ToastPatch, CalloutProps", description: "Types." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["⌥T"], action: "Focus the newest toast (Alt+T off Mac); focus fans the stack out" },
    { keys: ["Tab"], action: "Move between a toast's buttons and between toasts" },
    { keys: ["Esc"], action: "Dismiss the focused toast" },
    { keys: ["⌘Z"], action: "Undo the newest undoable toast (Ctrl+Z off Mac; ignored in text fields)" },
  ],
  a11y: [
    "The toaster is a labelled region that names its hotkey (“Notifications (⌥T)”).",
    "Announcements go through two visually hidden live regions: errors to role=\"alert\" (assertive), everything else to role=\"status\" (polite). A toast is announced on arrival and again when its type changes (loading → success / error).",
    "In the collapsed stack, the back toasts are aria-hidden and inert. A hidden line says how many more are waiting.",
    "Timers pause on hover, on focus within the stack and while the window is blurred or hidden, so there is time to read and act.",
    "Determinate progress is exposed as role=\"progressbar\" with aria-valuenow. The Undo button declares aria-keyshortcuts.",
    "After a dismissal, focus moves to the neighbouring toast or back to where it came from.",
    "Callout is role=\"note\"; with live it becomes role=\"status\", or role=\"alert\" for errors.",
  ],
  motion: [
    { state: "Rest", behaviour: "Up to three toasts are layered: the ones behind scale to 0.96 / 0.92, sit 8 px further out, take the front toast's height and hide their content." },
    { state: "Fan out", behaviour: "On hover, focus or drag the stack opens into a list on the layout spring, and content fades back in." },
    { state: "Enter", behaviour: "Rises 28 px from the edge on the layout spring and fades in over 200 ms." },
    { state: "Exit", behaviour: "Fades over 140 ms, moving 10 px toward the edge and shrinking to 0.97." },
    { state: "Type change", behaviour: "The icon swaps with a latch-spring scale (0.6 → 1) and the title crossfades in 120 ms." },
    { state: "Progress", behaviour: "A determinate pencil bar fills on the control spring beside a matching ring icon; a spinner shows when indeterminate. On success the bar fills and drains pencil → ink (240 ms), holds for about 0.5 s, then collapses." },
    { state: "Undo countdown", behaviour: "A 1 px pencil hairline along the bottom edge shrinks with the timer and pauses with it." },
    { state: "Swipe", behaviour: "Drag horizontally toward the near edge. Past 40% of the width, or a flick over 500 px/s, it flies out. Otherwise it springs back on the control spring. Dragging the other way rubber-bands." },
    { state: "Hover", behaviour: "The close button appears instantly and fades out over 90 ms. On touch screens it is always shown." },
    { state: "Reduced motion", behaviour: "No travel or scaling: toasts and icons cross-fade in place (120 ms) and the stack re-lays out instantly." },
  ],
  sound: [
    { event: "Toast arrives (not progress, not silent)", voice: "notify" },
    { event: "Error toast, or a promise/progress toast fails", voice: "error" },
    { event: "Progress toast completes", voice: "complete" },
    { event: "Close button, Esc, swipe or action button", voice: "dismiss" },
    { event: "Undo", voice: "confirm" },
    { event: "Callout dismissed", voice: "dismiss" },
  ],
};
