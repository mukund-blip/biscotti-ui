import type { CatalogEntry } from "./types";
import { PropertyEditorDemo } from "@/demos/property-editor-demo";

export const entry: CatalogEntry = {
  slug: "property-editor",
  number: "18",
  name: "Inline Property Editor",
  group: "Information & editing",
  summary: "An inspector with scrubbable numbers, a colour picker and a box model you drag directly.",
  description:
    "A compact inspector for editing a live element. Drag any numeric label to scrub (Shift ×10, Alt ×0.1) and a hairline ruler appears under the field, one tick per audible tick. Type 16*1.5 and it evaluates. Margin and padding edges in the box-model diagram are handles you drag. Every changed value carries a pencil dot that is also its reset, and the header counts changes and resets them together.",
  useCases: ["Design and layout tools", "Theme and component customisers", "No-code editors and CMS block settings"],
  scale: "l",
  Demo: PropertyEditorDemo,
  Preview: () => <PropertyEditorDemo compact />,
  usage: `import { PropertyEditor, PropertySection, PropertyRow, PropertyScrub, PropertyColor, PropertyBoxModel } from "@detent/ui";

<PropertyEditor title="Product card" subtitle="OS-1 / card.tsx">
  <PropertySection title="Appearance">
    <PropertyRow label="Fill">
      <PropertyColor aria-label="Fill" value={fill} onValueChange={setFill} />
    </PropertyRow>
    <PropertyScrub label="Size" value={size} onValueChange={setSize} min={8} max={96} unit="px" />
  </PropertySection>
  <PropertySection title="Spacing">
    <PropertyBoxModel value={box} onValueChange={setBox} onActiveChange={highlightInPreview} />
  </PropertySection>
</PropertyEditor>`,
  props: [
    { name: "PropertyEditor.title / subtitle", type: "ReactNode", description: "Panel heading (the selected element) and a mono secondary line." },
    { name: "PropertyEditor.showResetAll", type: "boolean", default: "true", description: "Header shows “n modified · Reset all” for every field inside." },
    { name: "value / defaultValue / onValueChange", type: "per field", description: "Every field is controlled or uncontrolled." },
    { name: "baseline", type: "per field", default: "initial value", description: "The unmodified value. A difference shows the pencil dot; reset returns to it." },
    { name: "PropertyScrub.min / max / step", type: "number", default: "−∞ / ∞ / 1", description: "Limits and increment. Shift ×10, Alt ×0.1 for keys and scrubbing." },
    { name: "PropertyScrub.unit / units / onUnitChange", type: "string / string[]", description: "Suffix; with several units the suffix cycles and typing “1.5em” switches." },
    { name: "PropertyScrub.pixelsPerStep / tickEvery", type: "number", default: "2 / 4 × step", description: "Scrub sensitivity and how often the quiet tick plays (and the ruler ticks)." },
    { name: "PropertyScrub.onScrubChange", type: "(scrubbing) => void", description: "Gesture start/end, e.g. to show guides." },
    { name: "PropertyColor.defaultRecents / maxRecents", type: "string[] / number", default: "[] / 8", description: "Recent swatches; a colour is added when the picker closes on a new value." },
    { name: "PropertySelect.options / optionStyle", type: "{value,label}[] / fn", description: "Native select; optionStyle can render families in their own face." },
    { name: "PropertySegmented.options", type: "{value,label,name?}[]", description: "Compact radiogroup with a gliding indicator." },
    { name: "PropertyBoxModel.value", type: "{ margin: [t,r,b,l], padding: [t,r,b,l] }", description: "Box model in px." },
    { name: "PropertyBoxModel.onActiveChange", type: "(target | null) => void", description: "Hovered, focused or dragged edge, to highlight the preview." },
    { name: "sound", type: "boolean", default: "true", description: "Allow sounds. Set on PropertyEditor to silence every field inside." },
  ],
  exports: [
    { name: "PropertyEditor, PropertySection, PropertyRow", description: "Panel, titled group, label/control row." },
    { name: "PropertyScrub", description: "Numeric field with scrubbable label, expressions, units." },
    { name: "PropertyColor", description: "Swatch + hex input + SV plane / hue strip / recents popover." },
    { name: "PropertySelect, PropertySegmented", description: "Family select and weight-style segmented control." },
    { name: "PropertyBoxModel", description: "Margin/padding diagram with draggable edges." },
    { name: "evaluatePropertyExpression, normalizeHex, formatPropertyNumber", description: "The parsing helpers, for reuse." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["↑", "↓"], action: "Step a number (Shift ×10, Alt ×0.1)" },
    { keys: ["Enter"], action: "Commit a typed value or expression; on a box-model edge, type a value" },
    { keys: ["Esc"], action: "Revert the typed value; close the colour picker" },
    { keys: ["0–9"], action: "On a box-model edge, start typing a value" },
    { keys: ["←", "→"], action: "Segmented: move selection · Colour plane: saturation" },
    { keys: ["Alt", "↑"], action: "Box model: change both opposite sides" },
  ],
  a11y: [
    "Numbers are role=spinbutton with aria-valuenow/min/max and a valuetext that includes the unit.",
    "Labels are real <label>s: clicking one focuses its input; dragging it scrubs.",
    "Each box-model edge is its own focusable spinbutton (“Margin top”), operable without a pointer.",
    "Colour picker is a non-modal dialog: focus moves to the 2D slider on open and back to the swatch on Escape.",
    "The pencil dot that marks a change is a button named “Reset Size to 28px”; hit targets are ≥ 24 px.",
  ],
  motion: [
    { state: "Rest", behaviour: "Quiet sunken fields with no borders; values in mono." },
    { state: "Hover / focus", behaviour: "Hover draws a hairline instantly; focus draws a pencil ring." },
    { state: "Scrub", behaviour: "Label turns pencil; a 5 px ruler fades in (60 ms) and slides with the value under a pencil index. No easing — value follows the pointer each frame." },
    { state: "Box-model drag", behaviour: "The band fills pencil-soft and its outer edge inks in pencil; the preview highlights the same area." },
    { state: "Segmented", behaviour: "Indicator glides (glide spring)." },
    { state: "Colour popover", behaviour: "Surface in/out (200/140 ms, 4 px travel)." },
    { state: "Reduced motion", behaviour: "Indicator and popover change instantly (opacity cue only); scrubbing is unchanged because it is direct manipulation." },
  ],
  sound: [
    { event: "Scrub/drag crosses a tick (every tickEvery units)", voice: "tick (very quiet, rate-limited)" },
    { event: "Scrub hits min or max", voice: "tick (lower, firmer)" },
    { event: "Choose weight / family / unit / recent swatch", voice: "select" },
    { event: "Reset a field / reset all", voice: "dismiss" },
  ],
};
