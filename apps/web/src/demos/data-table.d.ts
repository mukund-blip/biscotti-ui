// Turbopack resolves the source subpath. TypeScript needs a declaration for the extensionless export.
declare module "@biscotti/ui/components/data-table/data-table" {
  export { DataTable } from "@biscotti/ui";
  export type { DataTableColumn, DataTableDensity, DataTableSort, DataTableStatusTone } from "@biscotti/ui";
}
