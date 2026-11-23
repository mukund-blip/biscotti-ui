import type { CatalogEntry } from "./types";
import { KineticButtonDemo, KineticButtonPreview } from "@/demos/kinetic-button-demo";

export const entry: CatalogEntry = {
  slug: "kinetic-button",
  number: "01",
  name: "Kinetic Button",
  group: "Tactile controls",
  summary: "A button that shows pending, success and error states. Supports hold to confirm.",
  description:
    "When you press the button, it moves down 1 px. When you release it, it springs back. It has no hover lift. If onClick returns a Promise, the button changes state by itself: idle, pending, then success or error. Pending shows a spinner and the present-progressive label. Success shows a check and the past-tense label. Error shows a short shake and an error edge. A button with a lifecycle keeps the width of its widest state, so the buttons next to it do not move. Destructive actions can require a hold. The hold fills in pencil, ticks at each quarter and then runs the action.",
  useCases: ["Export, sync and publish actions that take a moment", "Destructive actions that need a hold to confirm", "Toolbars of attached actions"],
  scale: "s",
  Demo: KineticButtonDemo,
  Preview: KineticButtonPreview,
  usage: `import { KineticButton, KineticButtonGroup } from "@biscotti/ui";

<KineticButton
  icon="arrowDown"
  pendingLabel="Exporting"
  successLabel="Exported"
  errorLabel="Retry export"
  onClick={() => api.exportBank()} // a Promise drives the lifecycle
>
  Export bank
</KineticButton>

<KineticButton variant="danger" holdToConfirm={1200} onClick={deletePatch}>
  Hold to delete
</KineticButton>`,
  props: [
    { name: "variant", type: '"primary" | "secondary" | "quiet" | "danger"', default: '"primary"', description: "Ink, edge outline on raised, no surface, or err tint." },
    { name: "size", type: '"sm" | "md" | "lg"', default: '"md"', description: "28, 32 or 40 px tall." },
    { name: "icon", type: "IconName | ReactNode", description: "Leading icon; swapped for spinner / check / retry glyph while busy." },
    { name: "onClick", type: "(event) => void | Promise", description: "Return a Promise to run the async lifecycle automatically." },
    { name: "state", type: '"idle" | "pending" | "success" | "error"', description: "Controlled lifecycle state. Omit to let the Promise drive it." },
    { name: "onStateChange", type: "(state) => void", description: "Every lifecycle transition, including the automatic success → idle revert." },
    { name: "pendingLabel / successLabel / errorLabel", type: "ReactNode", default: '— / — / "Retry"', description: "Present-progressive, past-tense and retry copy." },
    { name: "successDuration", type: "number", default: "1600", description: "ms the success state holds before reverting." },
    { name: "holdToConfirm", type: "number", description: "ms of press-and-hold (pointer, Space or Enter) required before the action runs." },
    { name: "disabled", type: "boolean", default: "false", description: "Native disabled, 45% opacity." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds." },
    { name: "reserveWidth", type: "boolean", default: "on with a lifecycle", description: "Hold the widest state's width (idle, pending, success, error) from the start so nothing reflows. On by default when holdToConfirm, pendingLabel, successLabel or state is set; false morphs between label widths instead." },
  ],
  exports: [{ name: "KineticButtonGroup", description: "Attached row of buttons sharing one outline; sets default variant/size; pressed buttons sink without scaling so seams stay aligned." }],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["Enter", "Space"], action: "Activate" },
    { keys: ["Space (hold)", "Enter (hold)"], action: "Hold-to-confirm buttons: fill while held, drain if released early" },
  ],
  a11y: [
    "Native <button>; aria-busy while pending, aria-invalid after failure; it stays focusable while busy (aria-disabled), so focus is never lost.",
    "The accessible name follows the visible label (Export bank → Exporting → Exported), and a polite status region announces each transition.",
    "Hold buttons carry aria-description “Press and hold to confirm”; keyboard holds work the same way as pointer holds.",
    "Buttons with a lifecycle keep the width of their widest state, so neighbours never reflow; reserveWidth={false} morphs instead.",
  ],
  motion: [
    { state: "Rest", behaviour: "Flat. Secondary has a hairline outline with a darker bottom edge. No hover lift." },
    { state: "Hover", behaviour: "Surface tone only: instant in, 90 ms out." },
    { state: "Press", behaviour: "On the input frame: translateY 1 px, scale 0.985, inset press shadow. Release springs back (control spring). In groups, sink only." },
    { state: "Label change", behaviour: "Old label lifts 5 px and fades over 90 ms; the new one rises in; button width follows on the control spring." },
    { state: "Pending", behaviour: "Spinner replaces the icon (the one live mark)." },
    { state: "Success", behaviour: "Check draws via stroke-dashoffset (260 ms) with the past-tense label; reverts after 1.6 s." },
    { state: "Error", behaviour: "1.5 px err edge plus one damped 2 px horizontal nudge (260 ms); the icon becomes a retry glyph and the label the errorLabel copy." },
    { state: "Hold", behaviour: "Pencil fill sweeps left→right linearly, with label inverted under the fill; early release drains back in ≤340 ms; completion seats with the latch spring then the pencil drains (240 ms)." },
    { state: "Reduced motion", behaviour: "No press travel, nudge or draw; label swaps crossfade over 120 ms; the hold fill steps by quarters." },
  ],
  sound: [
    { event: "Press", voice: "tap" },
    { event: "Hold passes 25 / 50 / 75 %", voice: "tick (rising pitch)" },
    { event: "Hold completes", voice: "latch" },
    { event: "Async success", voice: "confirm" },
    { event: "Async failure", voice: "error" },
  ],
};
