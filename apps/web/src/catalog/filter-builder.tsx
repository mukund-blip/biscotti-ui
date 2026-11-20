import type { CatalogEntry } from "./types";
import { FilterBuilderDemo } from "@/demos/filter-builder-demo";

export const entry: CatalogEntry = {
  slug: "filter-builder",
  number: "16",
  name: "Visual Filter Builder",
  group: "Information & editing",
  summary: "Build readable filters with typed editors, editable clauses, and live results.",
  description: "Each condition is a three-part chip with separate editors for field, operator, and value. Choose enum options, enter a number or text, or pick a date window. AND and OR connect the chips, and committed edits update the order list and matching count.",
  useCases: ["Ad hoc searches over structured records", "Filtering orders by status, market, and volume", "Building a reusable query from typed conditions"],
  scale: "l",
  Demo: FilterBuilderDemo,
  usage: `import { FilterBuilder, filterBuilderMatches, type FilterBuilderCondition, type FilterBuilderField } from "@detent/ui";

type Order = { units: number };
const fields: FilterBuilderField<Order>[] = [
  { id: "units", label: "Units", type: "number", accessor: row => row.units },
];

const [filters, setFilters] = useState<readonly FilterBuilderCondition[]>([]);
const matches = orders.filter(row => filterBuilderMatches(row, fields, filters, now));

<FilterBuilder fields={fields} value={filters} onChange={setFilters} />`,
  props: [
    { name: "fields", type: "readonly FilterBuilderField<Row>[]", required: true, description: "Field schema and row accessors. Date fields return epoch milliseconds." },
    { name: "value / defaultValue", type: "readonly FilterBuilderCondition[]", default: "[]", description: "Controlled or initial condition list. Each condition after the first may carry an AND or OR join." },
    { name: "onChange", type: "(conditions: readonly FilterBuilderCondition[]) => void", description: "Called for committed edits, join changes, removals, and clears." },
    { name: "title", type: "string", default: '"Filters"', description: "Visible title and accessible section name." },
    { name: "sound", type: "boolean", default: "true", description: "Allows committed edits to play sounds after global opt-in." },
    { name: "className", type: "string", description: "Style the outer section." },
  ],
  exports: [
    { name: "filterBuilderMatches", description: "Matches a row against typed conditions and a supplied clock. AND binds before OR." },
    { name: "FilterBuilderProps, FilterBuilderField, FilterBuilderOption", description: "Component and schema types." },
    { name: "FilterBuilderCondition, FilterBuilderOperator, FilterBuilderJoin, FilterBuilderDatePreset", description: "Condition, operator, connective, and date-window types." },
  ],
  dependencies: ["@base-ui/react", "motion"],
  keyboard: [
    { keys: ["Tab", "Shift+Tab"], action: "Move through chip parts, connective tokens, and editor controls." },
    { keys: ["Enter", "Space"], action: "Open a chip editor or activate a choice." },
    { keys: ["↑", "↓"], action: "Move among field, operator, or single-value choices." },
    { keys: ["⌫"], action: "Remove the focused condition." },
    { keys: ["Esc"], action: "Dismiss the editor and restore focus to its trigger." },
  ],
  a11y: [
    "Each chip part has its own button and accessible name. Each popup has a title that matches the current editing step.",
    "Enum multiselect uses labeled checkboxes. Text and number inputs have field-specific labels.",
    "Removing a focused chip returns focus to a neighboring chip or the add button.",
    "The demo announces the settled result count once per committed change.",
  ],
  motion: [
    { state: "Rest / focus", behaviour: "Hairlines separate the three chip parts. The open trigger is marked in pencil." },
    { state: "Editor", behaviour: "The anchored editor fades with 4 px of travel on entry and 2 px on exit." },
    { state: "Add / remove", behaviour: "Chip width opens or collapses with the layout spring as adjacent chips reposition." },
    { state: "Results", behaviour: "Results refresh immediately and the tabular match count tweens to the new total." },
    { state: "Reduced motion", behaviour: "Chip widths and editor positions update immediately with short opacity cues. The count snaps." },
  ],
  sound: [
    { event: "Commit a condition", voice: "confirm (quiet)" },
    { event: "Change AND or OR", voice: "select (quiet)" },
    { event: "Remove a condition or clear all", voice: "dismiss (quiet)" },
  ],
};
