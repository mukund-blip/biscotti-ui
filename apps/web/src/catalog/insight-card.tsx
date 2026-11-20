import type { CatalogEntry } from "./types";
import { InsightCardDemo, InsightCardPreview } from "@/demos/insight-card-demo";

export const entry: CatalogEntry = {
  slug: "insight-card",
  number: "19",
  name: "Insight Card",
  group: "Information & editing",
  summary: "A KPI with rolling digits, a scrubbable SVG chart and an insight sentence worth reading.",
  description:
    "One metric, told well. The headline digits roll column by column to each new value. Scrub the chart by pointer or arrow keys and the headline becomes that day (“on Sat 14 Mar”), compared with the same day of the previous period. Switching 7D/30D/90D morphs the line rather than redrawing it: both shapes are resampled at the union of their vertices, so each end of the morph is exact. Events sit on the x-axis as small markers with detail on hover or focus.",
  useCases: ["Dashboards and launch rooms", "Agent-written reports with a headline number", "Sales, sign-ups, conversion at a glance"],
  scale: "m",
  Demo: InsightCardDemo,
  Preview: InsightCardPreview,
  usage: `import { InsightCard } from "@detent/ui";

<InsightCard
  title="Pre-orders"
  data={dailyPreorders}              // [{ date: "2026-03-14", value: 102 }, …]
  annotations={[{ date: "2026-03-12", label: "Launch email", detail: "Sent to 18,400 subscribers" }]}
  insight={({ delta }) => \`Up 3× after the launch email on 12 Mar.\`}
  source="Scout, from Shopify orders"
/>`,
  props: [
    { name: "title", type: "string", required: true, description: "Metric name." },
    { name: "data", type: "{ date, value }[]", required: true, description: "Daily series, ascending. 2× the largest range enables comparison." },
    { name: "ranges", type: "number[]", default: "[7, 30, 90]", description: "Window lengths in days." },
    { name: "range / defaultRange / onRangeChange", type: "number", default: "— / 30", description: "Controlled or uncontrolled window." },
    { name: "compare / defaultCompare / onCompareChange", type: "boolean", default: "— / false", description: "Previous period as a dashed line." },
    { name: "aggregate", type: '"sum" | "mean" | "last"', default: '"sum"', description: "How the headline summarises the window." },
    { name: "format", type: "Intl.NumberFormatOptions", description: "Value format (compact, currency, percent…). The axis uses its compact form." },
    { name: "locale", type: "string", default: '"en-GB"', description: "Numbers and dates. Fixed by default so server and client agree." },
    { name: "goodDirection", type: '"up" | "down"', default: '"up"', description: "Colours the delta badge." },
    { name: "insight", type: "ReactNode | (ctx) => ReactNode", description: "Sentence-level insight; receives range, total, previous, delta." },
    { name: "source", type: "ReactNode", description: "Provenance for the insight, set in serif italic." },
    { name: "annotations", type: "{ date, label, detail? }[]", description: "x-axis event markers." },
    { name: "unitLabel", type: "string", description: "Noun used in announcements and the hidden table." },
    { name: "chartHeight", type: "number", default: "132", description: "Plot height in px; width follows the card." },
    { name: "sound", type: "boolean", default: "true", description: "Allow sounds." },
  ],
  exports: [{ name: "InsightNumber", description: "The rolling-digits display on its own (visual only; pair with real text)." }],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["←", "→"], action: "Move the crosshair a day (Shift: a week)" },
    { keys: ["Home", "End"], action: "First / last day" },
    { keys: ["Esc"], action: "Clear the crosshair" },
    { keys: ["←", "→"], action: "On the range control: change range" },
  ],
  a11y: [
    "The chart is a focusable group with an aria-label summary: total, delta, peak and low.",
    "All values are in a visually hidden table (with the previous period when available) linked via aria-describedby.",
    "Keyboard reading announces “14 Mar: 102 pre-orders” through a polite status region.",
    "Annotation markers are buttons with 24 px targets; their detail is the accessible description.",
    "Delta direction is shown by an arrow glyph as well as colour; very large changes read as “34×”, not +3,300%.",
  ],
  motion: [
    { state: "Rest", behaviour: "Ink line, 5.5% ink wash, hairline grid, end dot with a surface ring." },
    { state: "Hover / scrub", behaviour: "Pencil crosshair snaps to the nearest day immediately; digits roll (control spring); tooltip has no transition." },
    { state: "Range change", behaviour: "Line, area and comparison morph with the layout spring (≈400 ms); range indicator glides; grid labels cross-fade." },
    { state: "Compare toggle", behaviour: "Dashed line fades in over 160 ms; the scale morphs if the previous period is taller." },
    { state: "Reduced motion", behaviour: "No morph or roll: the new shape appears with a 120 ms opacity cue; digits change in place." },
  ],
  sound: [
    { event: "Range change", voice: "select" },
    { event: "Compare toggle", voice: "select (quiet)" },
    { event: "Crosshair / hover / annotations", voice: "none" },
  ],
};
