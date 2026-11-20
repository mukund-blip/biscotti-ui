import type { CatalogEntry } from "./types";
import { InteractiveSliderDemo, InteractiveSliderPreview } from "@/demos/interactive-slider-demo";

export const entry: CatalogEntry = {
  slug: "interactive-slider",
  number: "03",
  name: "Interactive Slider",
  group: "Tactile controls",
  summary: "A precision fader with a measuring ruler, magnetic detents and fine adjust.",
  description:
    "Built as an instrument rather than a styled range input. A ruler of major and minor ticks sits under the track (decades on a log scale), and labelled marks act as magnetic detents that pull the thumb in from 8 px away, with a tick whose brightness follows your speed. While you drag, the value is provisional: the fill and readouts draw in pencil and drain to ink when you let go. Hold Shift for 10× precision. Double-click or press Delete to glide back to the default.",
  useCases: ["Synth, audio and colour parameters", "Settings with a recommended value", "Range selection (two thumbs)"],
  scale: "m",
  Demo: InteractiveSliderDemo,
  Preview: InteractiveSliderPreview,
  usage: `import { InteractiveSlider } from "@detent/ui";

<InteractiveSlider
  label="Filter cutoff"
  scale="log" min={20} max={20000}
  defaultValue={1200}
  formatValue={(v) => (v >= 1000 ? \`\${(v / 1000).toFixed(2)} kHz\` : \`\${Math.round(v)} Hz\`)}
  onValueCommit={(hz) => synth.set("cutoff", hz)}
/>

<InteractiveSlider label="Resonance" defaultValue={20}
  marks={[{ value: 35, label: "Recommended" }]} formatValue={(v) => \`\${v}%\`} />

<InteractiveSlider label="Release" defaultValue={[120, 900]} max={2000} step={10} />`,
  props: [
    { name: "value / defaultValue", type: "number | [number, number]", description: "A tuple makes it a range. defaultValue is also the reset target." },
    { name: "onValueChange", type: "(value) => void", description: "Continuous, while dragging or stepping." },
    { name: "onValueCommit", type: "(value) => void", description: "Once per gesture (pointer release) or keyboard step." },
    { name: "min / max / step", type: "number", default: "0 / 100 / 1", description: "Bounds and granularity. Log scale rounds to 3 significant figures." },
    { name: "majorStep", type: "number", default: "range / 4", description: "Tall, labelled ruler ticks; also PageUp/PageDown distance." },
    { name: "scale", type: '"linear" | "log"', default: '"linear"', description: "Log maps position logarithmically (min > 0)." },
    { name: "marks", type: "{ value, label? }[]", description: "Labelled reference points; they are detents." },
    { name: "snap", type: "boolean | number", default: "on with marks", description: "Magnetic detents (marks, else major ticks); a number sets the pull radius in px (default 8)." },
    { name: "formatValue / formatTick", type: "(v) => string", description: "Readout + aria-valuetext / short ruler labels." },
    { name: "resetValue", type: "number | [number, number]", description: "Reset target when controlled without defaultValue." },
    { name: "ruler", type: "boolean", default: "true", description: "Show ticks and labels." },
    { name: "label / aria-label / thumbLabels", type: "ReactNode / string / [string, string]", description: "Naming. Range thumbs become “Release minimum / maximum” by default." },
    { name: "disabled / name / sound", type: "boolean / string / boolean", description: "Disabled state, hidden inputs for forms, per-instance sound." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["←", "→", "↑", "↓"], action: "One step (log scale: 1 % of travel)" },
    { keys: ["Shift + arrows"], action: "Ten steps" },
    { keys: ["PageUp", "PageDown"], action: "One major step (log: 10 % of travel)" },
    { keys: ["Home", "End"], action: "Minimum / maximum (bounded by the other thumb in a range)" },
    { keys: ["Delete", "Backspace"], action: "Glide back to the default" },
    { keys: ["Shift (while dragging)"], action: "Fine adjust: 10× slower" },
  ],
  a11y: [
    "Each thumb is role=slider with aria-valuenow/min/max and formatted aria-valuetext; range thumbs bound each other’s min/max.",
    "24 px tall track hit zone and ≥24 px thumb hit area; clicking anywhere on the track jumps the nearest thumb.",
    "Grabbing a thumb focuses it (without drawing a focus ring) so keyboard adjustment continues seamlessly.",
    "Provisional vs committed is shown by colour and by the floating readout that exists only while dragging.",
  ],
  motion: [
    { state: "Rest", behaviour: "Recessed track, ink fill, fader cap with an engraved index line; ticks inside the fill read darker." },
    { state: "Drag", behaviour: "Thumb tracks 1:1; fill, index line and readouts switch to pencil instantly; a mono bubble rises 3 px above the thumb." },
    { state: "Detent", behaviour: "Within 8 px of a mark the thumb is pulled in on the control spring; leaving releases it the same way." },
    { state: "Release", behaviour: "Bubble drops 2 px and fades (140 ms); pencil drains to ink over 240 ms; onValueCommit fires." },
    { state: "Track click / reset", behaviour: "Jump uses the control spring; reset glides on the glide spring." },
    { state: "Keyboard", behaviour: "Moves instantly — no animation." },
    { state: "Reduced motion", behaviour: "Thumb jumps; bubble fades with no rise." },
  ],
  sound: [
    { event: "Pass / enter a detent while dragging", voice: "tick (velocity and pitch follow drag speed)" },
    { event: "Keyboard step", voice: "tick (quiet; brighter on a detent)" },
    { event: "Reset to default", voice: "tick" },
  ],
};
