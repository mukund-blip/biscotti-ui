import type { CatalogEntry } from "./types";
import { InsightCardDemo, InsightCardPreview } from "@/demos/insight-card-demo";

export const entry: CatalogEntry = {
  slug: "insight-card",
  number: "19",
  name: "Insight Card",
  group: "Information & editing",
  summary: "Shows one KPI with animated digits, a scrubbable SVG chart and a one-sentence insight.",
  description:
    "Shows one metric. When the value changes, the headline digits roll to the new value column by column. Scrub the chart with the pointer or the arrow keys. The headline then shows the selected day (“on Sat 14 Mar”) and compares it with the same day of the previous period. Select 7D, 30D or 90D to change the range. The line morphs to the new range and is not redrawn. Events are small markers on the x-axis. Hover or focus a marker to see its details.",
  useCases: ["Dashboards and launch rooms", "Agent-written reports with a headline number", "Sales, sign-up and conversion metrics"],
  scale: "m",
  Demo: InsightCardDemo,
  Preview: InsightCardPreview,
  usage: `import { InsightCard } from "@biscotti/ui";

<InsightCard
  title="Pre-orders"
  data={dailyPreorders}              // [{ date: "2026-03-14", value: 102 }, …]
  annotations={[{ date: "2026-03-12", label: "Launch email", detail: "Sent to 18,400 subscribers" }]}
  unitLabel="pre-orders"
  insight={({ range, delta }) =>
    delta == null ? null : \`\${delta >= 0 ? "Up" : "Down"} \${Math.abs(Math.round(delta * 100))}% on the previous \${range} days.\`}
  source="Scout, from Shopify orders"
/>`,
  props: [
    { name: "title", type: "string", required: true, description: "Metric name." },
    { name: "data", type: "{ date, value }[]", required: true, description: "Daily series, ascending. 2× the largest range enables comparison." },
    { name: "ranges", type: "number[]", default: "[7, 30, 90]", description: "Window lengths in days." },
    { name: "range / defaultRange / onRangeChange", type: "number / number / (days) => void", default: "— / 30 / —", description: "Controlled or uncontrolled window, in days." },
    { name: "compare / defaultCompare / onCompareChange", type: "boolean / boolean / (on) => void", default: "— / false / —", description: "Previous period as a dashed line." },
    { name: "aggregate", type: '"sum" | "mean" | "last"', default: '"sum"', description: "How the headline summarises the window." },
    { name: "format", type: "Intl.NumberFormatOptions", description: "Value format (compact, currency, percent…). The axis uses its compact form." },
    { name: "locale", type: "string", default: '"en-GB"', description: "Numbers and dates. Fixed by default so server and client agree." },
    { name: "goodDirection", type: '"up" | "down"', default: '"up"', description: "Colours the delta badge." },
    { name: "insight", type: "ReactNode | (ctx) => ReactNode", description: "Sentence-level insight. ctx is { range, total, previous, delta }; previous and delta are null when there isn't a full previous window, and delta is relative (0.124 = +12.4 %)." },
    { name: "source", type: "ReactNode", description: "Provenance for the insight, set in serif italic." },
    { name: "annotations", type: "{ date, label, detail? }[]", description: "x-axis event markers; only those inside the current window are drawn." },
    { name: "unitLabel", type: "string", description: "Noun used in announcements and the hidden table." },
    { name: "chartHeight", type: "number", default: "132", description: "Plot height in px; width follows the card." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds (range and compare changes only)." },
  ],
  exports: [{ name: "InsightNumber", description: "The rolling-digits display on its own. Takes value (an already formatted string, e.g. \"$12.9K\") and className. Visual only; pair it with real text for assistive tech." }],
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
