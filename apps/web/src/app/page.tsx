import Link from "next/link";
import { Icon } from "@biscotti/ui";
import { REGISTRY_URL, canonicalMetadata } from "@/site";
import { catalog, groups } from "@/catalog";
import { groupId, groupIntro, tileLayout } from "@/catalog/group-info";
import { CopyButton } from "@/components/code";
import { GalleryTile } from "@/components/gallery-tile";
import { IndexFilter } from "@/components/home/index-filter";

export const metadata = canonicalMetadata();

const install = `npx shadcn@latest add ${REGISTRY_URL}/r/kinetic-button.json`;

/** The homepage is the component index: a short intro, the install line, then every component live. */
export default function Home() {
  const sections = groups.map((g) => {
    const order = tileLayout[g] ?? [];
    const rank = (slug: string) => { const i = order.findIndex(([s]) => s === slug); return i < 0 ? order.length : i; };
    const items = catalog.filter((e) => e.group === g).sort((a, b) => rank(a.slug) - rank(b.slug));
    return {
      id: groupId(g),
      node: (
        <section id={groupId(g)} aria-labelledby={`h-${groupId(g)}`} className="mb-14 scroll-mt-32">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id={`h-${groupId(g)}`} className="text-[22px] font-semibold tracking-[-0.015em]">{g}</h2>
            <span className="tabular font-mono text-2xs text-muted">{items.length}</span>
            <p className="w-full max-w-[640px] text-sm text-muted">{groupIntro[g]}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-5">
            {items.map((e) => <GalleryTile key={e.slug} e={e} cols={order.find(([s]) => s === e.slug)?.[1]} />)}
          </div>
        </section>
      ),
    };
  });

  return (
    <div className="mx-auto max-w-[1320px] px-5 md:px-8">
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

      <IndexFilter
        total={catalog.length}
        options={groups.map((g) => ({ id: groupId(g), label: g, count: catalog.filter((e) => e.group === g).length }))}
        sections={sections}
      />
    </div>
  );
}
