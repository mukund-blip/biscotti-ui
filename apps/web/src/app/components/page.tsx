import { canonicalMetadata } from "@/site";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@detent/ui";
import { catalog, groups } from "@/catalog";
import { GalleryTile } from "@/components/gallery-tile";

export const metadata: Metadata = { ...canonicalMetadata("components"), title: "Components" };

const groupIntro: Record<string, string> = {
  "Tactile controls": "Small parts with real travel, detents and latches.",
  "Commands & composition": "Keyboard-first ways to say what you want.",
  "Agent interactions": "Making provisional, long-running work legible.",
  "Information & editing": "Dense data and direct manipulation, without the noise.",
};

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
      <header className="mb-8">
        <div>
          <p className="mb-3 font-mono text-2xs uppercase tracking-[0.08em] text-muted">Index · React + Tailwind v4 + Motion</p>
          <h1 className="text-[clamp(36px,6vw,64px)] font-semibold leading-[0.98] tracking-[-0.04em]">
            {catalog.length === 20 ? "Twenty" : catalog.length} components, all live.
          </h1>
          <p className="mt-5 max-w-[620px] text-md leading-[26px] text-ink-2">Every tile below is the real component, not a screenshot. Try it here, open its page for the API, keyboard map and states, then copy the source into your project.</p>
        </div>
        <nav aria-label="Groups" className="mt-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {groups.map((g) => (
            <a key={g} href={`#${g.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="focus-ring group flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-3 text-xs sm:px-4 sm:text-sm text-ink-2 transition-colors hover:border-rule hover:bg-raised hover:text-ink">
              {g} <span className="tabular ml-auto font-mono text-2xs text-muted">{String(catalog.filter((e) => e.group === g).length).padStart(2, "0")}</span><Icon name="arrowDown" size={13} className="text-muted" />
            </a>
          ))}
        </nav>
      </header>
      <details className="component-quick-index mb-12 rounded-md border border-hairline">
        <summary className="focus-ring cursor-pointer rounded-md px-4 py-3 text-sm text-ink-2">Looking for something specific? <span className="ml-1 text-muted">Browse the name index</span></summary>
        <nav aria-label="Component names" className="grid gap-1 border-t border-hairline p-3 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.map((e) => <Link key={e.slug} href={`/components/${e.slug}`} className="focus-ring flex items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-surface"><span className="font-mono text-2xs text-muted">{e.number}</span>{e.name}<Icon name="chevronRight" size={12} className="ml-auto text-muted" /></Link>)}
        </nav>
      </details>
      <p className="mb-5 flex items-center gap-2 font-mono text-2xs text-muted"><Icon name="play" size={12} /> Live previews · Click, drag, type. Every control is interactive.</p>
      {groups.map((g, groupIndex) => {
        const order = layout[g] ?? [];
        const rank = (slug: string) => { const i = order.findIndex(([s]) => s === slug); return i < 0 ? order.length : i; };
        const items = catalog.filter((e) => e.group === g).sort((a, b) => rank(a.slug) - rank(b.slug));
        if (!items.length) return null;
        return (
          <section key={g} id={g.toLowerCase().replace(/[^a-z]+/g, "-")} aria-labelledby={`h-${g}`} className="mb-16 scroll-mt-32 md:scroll-mt-24">
            <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-rule pt-5">
              <span aria-hidden className="font-mono text-2xs text-pencil-ink">0{groupIndex + 1}</span>
              <h2 id={`h-${g}`} className="text-[22px] font-medium tracking-[-0.01em]">{g}</h2>
              <p className="text-sm text-muted">{groupIntro[g]}</p>
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
