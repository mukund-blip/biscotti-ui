import { canonicalMetadata } from "@/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@detent/ui";
import { catalog, groups } from "@/catalog";
import { GalleryTile } from "@/components/gallery-tile";
import { groupId, groupIntro } from "@/catalog/group-info";

export const metadata: Metadata = { ...canonicalMetadata("components"), title: "Components" };

/**
 * Curated tiling (columns of 6) so every group fills complete rows, in reading order.
 * Anything missing here falls back to the span implied by its scale.
 */
const layout: Record<string, [slug: string, cols: 2 | 3 | 4 | 6][]> = {
  "Tactile controls": [["kinetic-button", 3], ["precision-toggle", 3], ["segmented-control", 2], ["interactive-slider", 4]],
  "Commands & composition": [["command-palette", 4], ["mention-picker", 2], ["prompt-composer", 3], ["action-toolbar", 3]],
  "Agent interactions": [["streaming-response", 4], ["tool-chip", 2], ["approval-card", 3], ["thinking-timeline", 3], ["activity-stack", 3], ["workflow-stepper", 3]],
  "Information & editing": [["data-table", 6], ["filter-builder", 3], ["insight-card", 3], ["diff-inspector", 4], ["notifications", 2], ["property-editor", 6]],
};

export default function ComponentsIndex() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <header className="mb-10 md:mb-14">
        <h1 className="text-[clamp(32px,5vw,52px)] font-semibold leading-[1.02] tracking-[-0.035em]">Components</h1>
        <p className="mt-4 max-w-[600px] text-md leading-[26px] text-ink-2">
          Every preview is the real component. Use it here, then open its page for the props, keyboard map and install command.
        </p>
        <div className="mt-7 flex flex-wrap items-start gap-2">
          <nav aria-label="Groups" className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <a key={g} href={`#${groupId(g)}`} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-surface px-3 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-hairline)] transition-colors hover:bg-raised hover:text-ink">
              {g} <span className="tabular font-mono text-2xs text-muted">{catalog.filter((e) => e.group === g).length}</span>
            </a>
          ))}
          </nav>
          <details className="group/names relative">
            <summary className="focus-ring inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md px-3 text-sm text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              A–Z<span className="sr-only">: all components by name</span> <Icon name="chevronDown" size={13} className="transition-transform group-open/names:rotate-180" />
            </summary>
            <nav aria-label="All components by name" className="mt-2 grid w-[min(92vw,640px)] gap-x-4 rounded-lg bg-raised p-2 shadow-3 sm:grid-cols-2 md:absolute md:left-0 md:z-20">
              {[...catalog].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                <Link key={e.slug} href={`/components/${e.slug}`} className="focus-ring rounded-sm px-2 py-1.5 text-sm text-ink-2 hover:bg-surface hover:text-ink">{e.name}</Link>
              ))}
            </nav>
          </details>
        </div>
      </header>
      {groups.map((g) => {
        const order = layout[g] ?? [];
        const rank = (slug: string) => { const i = order.findIndex(([s]) => s === slug); return i < 0 ? order.length : i; };
        const items = catalog.filter((e) => e.group === g).sort((a, b) => rank(a.slug) - rank(b.slug));
        if (!items.length) return null;
        return (
          <section key={g} id={groupId(g)} aria-labelledby={`h-${groupId(g)}`} className="mb-16 scroll-mt-32 md:scroll-mt-24">
            <div className="mb-5 border-t border-rule pt-5">
              <h2 id={`h-${groupId(g)}`} className="text-[22px] font-semibold tracking-[-0.015em]">{g}</h2>
              <p className="mt-1 max-w-[640px] text-sm text-muted">{groupIntro[g]}</p>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-6">
              {items.map((e) => <GalleryTile key={e.slug} e={e} cols={order.find(([s]) => s === e.slug)?.[1]} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
