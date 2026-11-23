import type { CatalogEntry } from "./types";
import { PrecisionToggleDemo, PrecisionTogglePreview } from "@/demos/precision-toggle-demo";

export const entry: CatalogEntry = {
  slug: "precision-toggle",
  number: "02",
  name: "Precision Toggle",
  group: "Tactile controls",
  summary: "A switch that stays pending in pencil until the save is complete.",
  description:
    "A rectangular switch with an engraved thumb and I/O symbols, so the state is clear without colour. When you press, the thumb moves into its travel. When you release, it latches with a two-stage click. If onCheckedChange returns a Promise, the track stays in pencil until the write is complete, then changes to ink. If the write fails, the thumb returns and the row shakes once.",
  useCases: ["Settings that write to a server or device", "Feature flags with confirmation", "Dense preference panels"],
  scale: "s",
  Demo: PrecisionToggleDemo,
  Preview: PrecisionTogglePreview,
  usage: `import { PrecisionToggle } from "@biscotti/ui";

<PrecisionToggle
  label="Beta firmware channel"
  description="Written to the OS-1 over USB."
  onCheckedChange={(on) => device.setChannel(on ? "beta" : "stable")} // may return a Promise
/>`,
  props: [
    { name: "checked / defaultChecked", type: "boolean", default: "— / false", description: "Controlled or uncontrolled state." },
    { name: "onCheckedChange", type: "(checked) => void | Promise", description: "Return a Promise to make the change provisional until it settles; rejection reverts." },
    { name: "label", type: "ReactNode", description: "Visible label (clickable). Without it, pass aria-label." },
    { name: "description", type: "ReactNode", description: "Secondary text, linked via aria-describedby." },
    { name: "labelPosition", type: '"start" | "end"', default: '"start"', description: "Label before the switch (settings rows) or after (inline)." },
    { name: "size", type: '"sm" | "md" | "lg"', default: '"md"', description: "32×18, 40×22 or 52×28." },
    { name: "disabled", type: "boolean", default: "false", description: "Non-interactive, 45% opacity." },
    { name: "pendingMessage / errorMessage", type: "ReactNode", default: '"Saving…" / "Couldn’t save — try again"', description: "Status line under the label while a Promise is pending, and after it rejects." },
    { name: "name / value", type: "string", default: '— / "on"', description: "Renders a hidden input for native forms." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds." },
  ],
  dependencies: ["motion"],
  keyboard: [{ keys: ["Space", "Enter"], action: "Toggle" }],
  a11y: [
    "role=switch with aria-checked; aria-busy while a Promise is pending; the pending and error messages sit in a role=status line that the switch references through aria-describedby.",
    "On/off is legible without colour: I and O glyphs, thumb position, filled vs recessed track.",
    "Off-state track edge meets 3:1 non-text contrast in both themes.",
    "Synthetic clicks from assistive tech are handled (not only pointer events).",
  ],
  motion: [
    { state: "Rest", behaviour: "Off: recessed channel with an inner shadow. On: solid ink track." },
    { state: "Press", behaviour: "Thumb widens 4 px toward its travel (control spring) — anticipation." },
    { state: "Release / commit", behaviour: "Thumb travels with the latch spring (stiffness 900, damping 42; ≈3% overshoot)." },
    { state: "Drag", behaviour: "Thumb follows the pointer 1:1; release past the midpoint commits, otherwise settles back." },
    { state: "Pending", behaviour: "Track shows a 1.5 px pencil outline and soft pencil fill; grip lines turn pencil." },
    { state: "Error", behaviour: "Thumb springs back to its previous side, then a single 2 px rollback nudge (180 ms) lands after the return; the status line turns err." },
    { state: "Reduced motion", behaviour: "Thumb jumps instantly; no nudge; colour and status-line changes remain." },
  ],
  sound: [
    { event: "Turn on", voice: "latch" },
    { event: "Turn off", voice: "unlatch" },
    { event: "Async rejected (after the thumb springs back)", voice: "error (quiet)" },
  ],
};
