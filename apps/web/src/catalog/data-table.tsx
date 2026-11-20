import type { CatalogEntry } from "./types";
import { DataTableDemo } from "@/demos/data-table-demo";

export const entry: CatalogEntry = {
  slug: "data-table",
  number: "15",
  name: "Smart Data Table",
  group: "Information & editing",
  summary: "Sort, inspect, and act on live records without losing your place.",
  description: "A keyboard grid for records that keep changing. Clicking a header cycles ascending, descending, then back to the original order; rows glide to their new place while focus and selection stay attached to stable row IDs. Live updates crossfade status labels and tween numbers in place, with a short pencil underline on the latest change that drains to ink. Selecting rows (Shift extends a range) raises a bulk-action bar in a reserved footer, so the table never jumps.",
  useCases: ["Retailer orders and fulfillment queues", "Reviewing and exporting selected records", "Monitoring live inventory or operational data"],
  scale: "xl",
  Demo: DataTableDemo,
  usage: `import { DataTable, type DataTableColumn } from "@detent/ui";

type Order = { id: string; retailer: string; units: number };
const columns: DataTableColumn<Order>[] = [
  { id: "retailer", label: "Retailer", accessor: row => row.retailer },
  { id: "units", label: "Units", accessor: row => row.units, numeric: true },
];

<DataTable
  title="Retailer orders"
  rows={orders}
  columns={columns}
  getRowId={row => row.id}
  onRowOpen={openOrder}
  bulkActions={[{ label: "Export", icon: "file", onAction: exportOrders }]}
/>`,
  props: [
    { name: "rows", type: "readonly Row[]", required: true, description: "Rows in their original order." },
    { name: "columns", type: "readonly DataTableColumn<Row>[]", required: true, description: "Accessors, labels, formatting, alignment, and optional status tones." },
    { name: "getRowId", type: "(row: Row) => string", required: true, description: "Stable, unique key for each row." },
    { name: "getRowLabel", type: "(row: Row) => string", default: "getRowId", description: "Accessible name used for a row’s selection control." },
    { name: "title / description / toolbar", type: "string / ReactNode / ReactNode", description: "Accessible title, secondary context, and optional title-row controls." },
    { name: "sort / defaultSort", type: "{ column, direction: \"asc\" | \"desc\" } | null", default: "null", description: "Controlled or initial sort. Header clicks cycle asc → desc → null; null restores the original order." },
    { name: "onSortChange", type: "(sort: DataTableSort) => void", description: "Called when the user changes the sort." },
    { name: "selection / defaultSelection", type: "readonly string[]", default: "[]", description: "Controlled or initial selection by row ID." },
    { name: "onSelectionChange", type: "(ids: readonly string[]) => void", description: "Called when the user changes the selection." },
    { name: "onRowOpen", type: "(row: Row) => void", description: "Opens a row on click or Enter." },
    { name: "bulkActions", type: "readonly DataTableBulkAction<Row>[]", description: "Actions to apply to the selected rows in display order." },
    { name: "density", type: '"comfortable" | "compact"', default: '"comfortable"', description: "Adjusts body row height." },
    { name: "loading / error / onRetry", type: "boolean / string / () => void", description: "Skeleton loading, an error message, and an optional retry action." },
    { name: "emptyMessage / emptyDescription", type: "string", description: "Customize the empty state." },
    { name: "viewportClassName / className", type: "string", description: "Style the scroll viewport or root section." },
    { name: "sound", type: "boolean", default: "true", description: "Allows committed interactions to play sounds after global opt-in." },
  ],
  exports: [
    { name: "DataTableColumn", description: "id, label, accessor (also the sort key; return epoch ms for dates), format?, numeric? (right-aligned tabular mono, tweened), mono?, muted?, statusTone? (inline status that crossfades), sortable? (set false to opt out), className?." },
    { name: "DataTableBulkAction", description: "label, icon? (\"check\" | \"file\" | \"trash\" | \"copy\"), primary?, onAction(rows) — rows arrive in current display order." },
    { name: "DataTableProps, DataTableSort, DataTableDensity, DataTableStatusTone", description: "Component configuration and state types." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["←", "→", "↑", "↓"], action: "Move between grid cells and column headers." },
    { keys: ["Home", "End"], action: "Move to either end of the row. Hold Ctrl or ⌘ to move to either end of the grid." },
    { keys: ["Space"], action: "Toggle the focused row’s selection. Hold Shift on a data cell to extend a range." },
    { keys: ["Enter"], action: "Open a focused row or activate the focused header or checkbox." },
  ],
  a11y: [
    "Roving focus keeps the grid to one Tab stop and tracks cells by stable row and column IDs.",
    "Headers expose sort direction. Rows expose selection and the select-all checkbox can be indeterminate.",
    "Animated numbers and status labels expose their settled values to assistive technology.",
    "The selection count is announced through a polite status region. Loading uses aria-busy and errors use an alert.",
  ],
  motion: [
    { state: "Rest / focus", behaviour: "The header stays pinned. Hover and focus respond on the input frame." },
    { state: "Sort", behaviour: "Rows reorder with a position-only layout spring, with no scale change." },
    { state: "Selection", behaviour: "The bulk toolbar rises into a reserved footer. Row selection appears immediately." },
    { state: "Live update", behaviour: "Statuses crossfade and the latest change receives a pencil underline that drains to ink. Numeric values tween in place." },
    { state: "Loading / error", behaviour: "Static skeletons and a pencil progress rule mark loading. Errors use a steady alert and an optional retry button." },
    { state: "Reduced motion", behaviour: "Row and toolbar positions update instantly with a short opacity cue. Values snap to their target." },
  ],
  sound: [
    { event: "Sort or add to selection", voice: "select (quiet)" },
    { event: "Remove or clear selection", voice: "dismiss (quiet)" },
    { event: "Invoke a bulk action", voice: "confirm (quiet)" },
  ],
};
