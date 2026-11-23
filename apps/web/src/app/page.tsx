import Link from "next/link";
import { Icon } from "@biscotti/ui";
import { REGISTRY_URL, canonicalMetadata } from "@/site";
import { catalog, groups } from "@/catalog";
import { groupId, groupIntro, groupShort, tileLayout } from "@/catalog/group-info";
import { CopyButton } from "@/components/code";
import { ComponentCard } from "@/components/home/component-card";
import { Showcase } from "@/components/home/showcase";
import { IndexBrowser } from "@/components/home/index-browser";

export const metadata = canonicalMetadata();

const install = `npx shadcn@latest add ${REGISTRY_URL}/r/kinetic-button.json`;

/** The homepage is the component index: a headline, two showcase rows, then the full index. */
export default function Home() {
  const sections = groups.map((g) => {
    const order = tileLayout[g] ?? [];
    const rank = (slug: string) => { const i = order.findIndex(([s]) => s === slug); return i < 0 ? order.length : i; };
    const items = catalog.filter((e) => e.group === g).sort((a, b) => rank(a.slug) - rank(b.slug));
    return {
      id: groupId(g),
      node: (
        <section id={groupId(g)} aria-labelledby={`h-${groupId(g)}`} className="mb-12 scroll-mt-36">
          <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pt-2">
            <h2 id={`h-${groupId(g)}`} className="text-[15px] font-semibold leading-[18px] text-ink">{g}</h2>
            <p className="text-[13px] leading-4 text-muted">{groupIntro[g]}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((e) => <ComponentCard key={e.slug} e={e} />)}
          </div>
        </section>
      ),
    };
  });

  return (
    <div className="mx-auto max-w-[1320px] px-5 pb-12 md:px-8">
      <section aria-labelledby="home-h" className="grid gap-8 pb-8 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-end lg:gap-14 lg:pb-10">
        <div className="min-w-0">
          <h1 id="home-h" className="max-w-[760px] text-[clamp(40px,7.4vw,72px)] font-semibold leading-[1] tracking-[-0.035em]">
            Interactive React components.
          </h1>
          <p className="mt-5 max-w-[520px] text-md leading-[26px] text-ink-2">
            Try a component here. Use the shadcn CLI to add its source files to your project.
          </p>
        </div>
        <div className="min-w-0">
          <div className="rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
            <p className="text-sm font-medium text-ink">Install any component with the shadcn CLI</p>
            <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md bg-paper py-1.5 pl-3 pr-1.5 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
              <span aria-hidden className="font-mono text-xs text-muted">$</span>
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink" title={install}>{install}</code>
              <CopyButton text={install} className="shrink-0 bg-ink text-on-ink hover:bg-ink hover:text-on-ink hover:opacity-90" />
            </div>
          </div>
          <Link href="/workbench" className="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-xs text-sm text-ink-2 hover:text-ink">
            Open Workbench <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      </section>

      <Showcase />

      <div className="mt-12">
        <IndexBrowser
          total={catalog.length}
          install={install}
          options={groups.map((g) => ({ id: groupId(g), label: g, short: groupShort[g], count: catalog.filter((e) => e.group === g).length }))}
          sections={sections}
        />
      </div>
    </div>
  );
}
