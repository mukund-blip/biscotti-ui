import Link from "next/link";
import type { CatalogEntry } from "@/catalog/types";
import { Icon, cn } from "@detent/ui";

const span: Record<CatalogEntry["scale"], string> = {
  s: "md:col-span-2",
  m: "md:col-span-3",
  l: "md:col-span-4",
  xl: "md:col-span-6",
};
const height: Record<CatalogEntry["scale"], string> = {
  // Small controls sit at their natural size; the tile shouldn't dwarf them.
  s: "min-h-[180px]",
  m: "min-h-[340px]",
  l: "min-h-[420px]",
  xl: "min-h-[480px]",
};

const colSpan: Record<number, string> = { 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4", 6: "md:col-span-6" };

/** `cols` (of 6) overrides the span implied by the entry's scale, so a group can tile into full rows. */
export function GalleryTile({ e, cols }: { e: CatalogEntry; cols?: 2 | 3 | 4 | 6 }) {
  const Preview = e.Preview ?? e.Demo;
  return (
    <article className={cn("group/tile col-span-1 flex flex-col overflow-hidden gallery-tile rounded-xl border border-hairline bg-surface", cols ? colSpan[cols] : span[e.scale])}>
      <div className={cn("gallery-preview relative flex min-w-0 flex-1 flex-col items-center justify-center bg-paper", height[e.scale])}>
        <Preview />
      </div>
      <Link
        href={`/components/${e.slug}`}
        className="focus-ring flex items-center gap-3 rounded-b-xl px-4 py-3.5 [box-shadow:inset_0_1px_0_var(--dt-hairline)] hover:bg-raised"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-medium text-ink">{e.name}</span>
          <span className="mt-0.5 block text-sm text-muted">{e.summary}</span>
        </span>
        <Icon name="arrowRight" size={15} className="shrink-0 text-muted transition-transform duration-[120ms] group-hover/tile:translate-x-0.5 group-hover/tile:text-ink" />
      </Link>
    </article>
  );
}
