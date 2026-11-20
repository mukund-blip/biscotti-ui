// Turbopack resolves the source subpath. TypeScript needs a declaration for the extensionless export.
declare module "@detent/ui/components/filter-builder/filter-builder" {
  export { FilterBuilder, filterBuilderMatches } from "@detent/ui";
  export type { FilterBuilderCondition, FilterBuilderField } from "@detent/ui";
}
