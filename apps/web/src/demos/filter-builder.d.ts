// Turbopack resolves the source subpath. TypeScript needs a declaration for the extensionless export.
declare module "@biscotti/ui/components/filter-builder/filter-builder" {
  export { FilterBuilder, filterBuilderMatches } from "@biscotti/ui";
  export type { FilterBuilderCondition, FilterBuilderField } from "@biscotti/ui";
}
