// Turbopack resolves the source subpath. TypeScript needs a declaration for the extensionless export.
declare module "@detent/ui/components/data-table/data-table" {
  export { DataTable } from "@detent/ui";
  export type { DataTableColumn, DataTableDensity, DataTableSort, DataTableStatusTone } from "@detent/ui";
}
