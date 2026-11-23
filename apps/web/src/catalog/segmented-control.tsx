import type { CatalogEntry } from "./types";
import { SegmentedControlDemo, SegmentedControlPreview } from "@/demos/segmented-control-demo";

export const entry: CatalogEntry = {
  slug: "segmented-control",
  number: "04",
  name: "Segmented Control",
  group: "Tactile controls",
  summary: "Selects one option from a set. The indicator moves its leading edge first.",
  description:
    "The selection indicator moves on two springs. The leading edge moves first on the glide spring. The trailing edge follows on a softer spring. The indicator stretches in the direction of travel. A label highlights only when the indicator reaches it. Use SegmentedPanels to animate the content below in the same direction: panels slide ±8 px and cross-fade over 150 ms.",
  useCases: ["View switchers and filters with counts", "Compact mode toggles in toolbars (icon-only)", "Tab-like content switching with SegmentedPanels"],
  scale: "s",
  Demo: SegmentedControlDemo,
  Preview: SegmentedControlPreview,
  usage: `import { SegmentedControl, SegmentedControlItem, SegmentedPanels } from "@biscotti/ui";

const [cat, setCat] = useState("pads");

<SegmentedControl aria-label="Category" value={cat} onValueChange={setCat}>
  <SegmentedControlItem value="bass" count={24}>Bass</SegmentedControlItem>
  <SegmentedControlItem value="pads" count={31}>Pads</SegmentedControlItem>
  <SegmentedControlItem value="fx" icon="sparkle">FX</SegmentedControlItem>
</SegmentedControl>

<SegmentedPanels value={cat} order={["bass", "pads", "fx"]}>
  {(v) => <PatchList category={v} />}
</SegmentedPanels>`,
  props: [
    { name: "value / defaultValue", type: "string", description: "Controlled or uncontrolled selection." },
    { name: "onValueChange", type: "(value: string) => void", description: "Fires when the user selects a segment." },
    { name: "size", type: '"sm" | "md" | "lg"', default: '"md"', description: "28, 32 or 36 px tall overall." },
    { name: "fullWidth", type: "boolean", default: "false", description: "Stretch to the container with equal segments." },
    { name: "activation", type: '"automatic" | "manual"', default: '"automatic"', description: "Arrow keys select immediately, or only move focus (Space/Enter selects)." },
    { name: "disabled", type: "boolean", default: "false", description: "Disable the whole control (items also accept disabled)." },
    { name: "name", type: "string", description: "Renders a hidden input for native forms." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds." },
    { name: "Item: value, icon, count, disabled", type: "—", description: "SegmentedControlItem props. Icon-only items need aria-label." },
  ],
  exports: [
    { name: "SegmentedControlItem", description: "One segment: label, optional icon and mono count." },
    { name: "SegmentedPanels", description: "Render-prop panel host; slides ±8 px in the direction of travel and crossfades over 150 ms." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["←", "→", "↑", "↓"], action: "Move (and select, in automatic mode); wraps; skips disabled items" },
    { keys: ["Home", "End"], action: "First / last segment" },
    { keys: ["Space", "Enter"], action: "Select the focused segment (manual mode)" },
  ],
  a11y: [
    "radiogroup / radio with aria-checked and a roving tabindex: one tab stop, on the selected item.",
    "Selection state changes on the input frame; only the visuals follow.",
    "Icon-only segments take aria-label; counts are part of the accessible name.",
    "Before hydration, the selected segment draws its own surface, so SSR output already looks finished.",
  ],
  motion: [
    { state: "Rest", behaviour: "Sunken track with a raised plate under the selection; hairline separators between unselected neighbours." },
    { state: "Hover", behaviour: "Label to ink instantly; 90 ms back." },
    { state: "Select", behaviour: "Inchworm: leading edge on glide (520/44), trailing edge on a softer spring (300/34). Measured stretch ≈ 25 px on a 170 px trip." },
    { state: "Label", behaviour: "Lights when the plate covers 72 % of the target — on arrival, not departure." },
    { state: "Panels", behaviour: "Incoming panel enters from ±8 px in the direction of travel; outgoing leaves the other way; 150 ms crossfade." },
    { state: "Reduced motion", behaviour: "Plate and labels jump instantly; panels crossfade with no travel." },
  ],
  sound: [{ event: "Selection change (user)", voice: "select" }],
};
