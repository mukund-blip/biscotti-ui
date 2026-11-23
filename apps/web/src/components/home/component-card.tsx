import Link from "next/link";
import { Icon } from "@biscotti/ui";
import type { CatalogEntry } from "@/catalog/types";

/** Small controls read at their natural size, so they stay live and usable in the card. */
const natural = new Set(["kinetic-button", "precision-toggle", "segmented-control", "interactive-slider"]);
/** Everything else is shown as a live miniature of its preview, scaled to fit the 168 px window. */
const zoom: Record<CatalogEntry["scale"], number> = { s: 1, m: 0.62, l: 0.5, xl: 0.42 };
const PREVIEW_H = 168;

export function ComponentCard({ e }: { e: CatalogEntry }) {
  const Preview = e.Preview ?? e.Demo;
  const live = natural.has(e.slug);
  const k = live ? 1 : zoom[e.scale];
  return (
    <article className="group/card flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-hairline bg-raised">
      <div className="relative shrink-0 overflow-hidden border-b border-hairline bg-paper" style={{ height: PREVIEW_H }}>
        {live ? (
          <div className="flex h-full min-w-0 items-center justify-center px-4">
            <Preview />
          </div>
        ) : (
          // A miniature: laid out at 1/k size, top-aligned like a thumbnail, then scaled down. Inert, so there are no tiny hit targets;
          // the card links to the full demo.
          <div
            inert
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 flex origin-top-left items-start justify-center"
            style={{ width: `${100 / k}%`, height: PREVIEW_H / k, paddingTop: 20 / k, transform: `scale(${k})` }}
          >
            <Preview />
          </div>
        )}
      </div>
      <Link
        href={`/components/${e.slug}`}
        className="focus-ring flex flex-1 flex-col gap-1 rounded-b-[13px] px-4 pb-4 pt-3.5 transition-colors duration-[90ms] hover:bg-surface"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold leading-[18px] text-ink">{e.name}</span>
          <Icon name="arrowRight" size={14} className="shrink-0 text-muted transition-transform duration-[120ms] group-hover/card:translate-x-0.5 group-hover/card:text-ink" />
        </span>
        <span className="text-[13px] leading-[19px] text-muted">{e.summary}</span>
      </Link>
    </article>
  );
}
