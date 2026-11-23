import Link from "next/link";
import { Icon } from "@biscotti/ui";
import { REGISTRY_URL, canonicalMetadata } from "@/site";
import { catalog, groups } from "@/catalog";
import { groupId, groupIntro, tileLayout } from "@/catalog/group-info";
import { CopyButton } from "@/components/code";
import { GalleryTile } from "@/components/gallery-tile";

export const metadata = canonicalMetadata();

const install = `npx shadcn@latest add ${REGISTRY_URL}/r/kinetic-button.json`;

/**
 * The homepage is the component index: a short intro and the install line, then every component live.
 * The index below keeps the existing /components presentation (group chips, A–Z, curated tiles)
 * until a new index layout is chosen.
 */
export default function Home() {
  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-24 md:px-8">
      <section aria-labelledby="home-h" className="grid gap-8 pb-10 pt-10 md:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:items-end lg:gap-16 lg:pb-12">
        <div className="min-w-0">
          <h1 id="home-h" className="max-w-[640px] text-[clamp(32px,5vw,56px)] font-semibold leading-[1.02] tracking-[-0.04em]">
            Interactive React components
          </h1>
          <p className="mt-4 max-w-[520px] text-md leading-[26px] text-ink-2">
            {catalog.length} components you can use right here. Pick one, then copy its source into your app.
          </p>
          <Link href="/workbench" className="focus-ring mt-5 inline-flex items-center gap-1.5 rounded-xs text-sm text-ink-2 hover:text-ink">
            See ten of them working together in the Workbench <Icon name="arrowRight" size={14} />
          </Link>
        </div>
        <div className="min-w-0 rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
          <p className="text-sm font-medium text-ink">Install any component with the shadcn CLI</p>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-paper py-1.5 pl-3 pr-1.5 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
            <span aria-hidden className="font-mono text-xs text-muted">$</span>
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={install}>{install}</code>
            <CopyButton text={install} className="shrink-0 bg-ink text-on-ink hover:bg-ink hover:text-on-ink hover:opacity-90" />
          </div>
          <p className="mt-2.5 text-xs text-muted">Every component page has its own command. Source lands in <code className="font-mono">components/biscotti/</code>.</p>
        </div>
      </section>

      <div className="mb-10 flex flex-wrap items-start gap-2 md:mb-14">
        <nav aria-label="Groups" className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <a key={g} href={`#${groupId(g)}`} className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-surface px-3 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)] transition-colors hover:bg-raised hover:text-ink">
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

      {groups.map((g) => {
        const order = tileLayout[g] ?? [];
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
