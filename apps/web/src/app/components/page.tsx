import type { Metadata } from "next";
import { catalog, groups } from "@/catalog";
import { GalleryTile } from "@/components/gallery-tile";

export const metadata: Metadata = { title: "Components" };

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
      <header className="mb-14 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="mb-3 font-mono text-2xs uppercase tracking-[0.08em] text-muted">Index</p>
          <h1 className="text-[clamp(36px,6vw,64px)] font-semibold leading-[0.98] tracking-[-0.04em]">
            {catalog.length === 20 ? "Twenty" : catalog.length} components.
          </h1>
        </div>
        <nav aria-label="Groups" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {groups.map((g) => (
            <a key={g} href={`#${g.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="focus-ring rounded-xs text-ink-2 hover:text-ink">
              {g} <span className="tabular font-mono text-2xs text-muted">{catalog.filter((e) => e.group === g).length}</span>
            </a>
          ))}
        </nav>
      </header>
      {groups.map((g) => {
        const order = layout[g] ?? [];
        const rank = (slug: string) => { const i = order.findIndex(([s]) => s === slug); return i < 0 ? order.length : i; };
        const items = catalog.filter((e) => e.group === g).sort((a, b) => rank(a.slug) - rank(b.slug));
        if (!items.length) return null;
        return (
          <section key={g} id={g.toLowerCase().replace(/[^a-z]+/g, "-")} aria-labelledby={`h-${g}`} className="mb-16 scroll-mt-20">
            <div className="mb-5 flex items-baseline gap-4 border-t border-rule pt-4">
              <h2 id={`h-${g}`} className="text-lg font-medium tracking-[-0.01em]">{g}</h2>
              <p className="text-sm text-muted">{groupIntro[g]}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
              {items.map((e) => <GalleryTile key={e.slug} e={e} cols={order.find(([s]) => s === e.slug)?.[1]} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
