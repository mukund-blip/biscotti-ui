import Link from "next/link";
import { Icon } from "@biscotti/ui";
import { REPO_URL, REGISTRY_URL, publicPath, canonicalMetadata } from "@/site";
import { catalog, groups } from "@/catalog";
import { groupId, groupIntro } from "@/catalog/group-info";
import { CopyButton } from "@/components/code";
import { TactileTray } from "@/components/home/tactile-tray";
import { DiffInspector } from "@biscotti/ui";
import { launchNotesHunks } from "@/demos/data";

export const metadata = canonicalMetadata();

const install = `npx shadcn@latest add ${REGISTRY_URL}/r/precision-toggle.json`;

export default function Home() {
  return (
    <div>
      {/* Hero: what it is, the two ways in, and real controls at natural size. */}
      <section className="mx-auto max-w-[1320px] px-5 md:px-8">
        <div className="grid gap-10 pb-16 pt-12 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:items-center lg:gap-16 lg:pb-24 lg:pt-20">
          <div className="min-w-0">
            <h1 className="max-w-[640px] text-[clamp(34px,5.4vw,64px)] font-semibold leading-[1.02] tracking-[-0.04em]">
              Interactive React components
            </h1>
            <p className="mt-5 max-w-[480px] text-md leading-[26px] text-ink-2">
              Try controls, editors and agent workflows, then copy the source into your app.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/components" className="focus-ring inline-flex h-11 items-center gap-3 rounded-md bg-ink px-4 text-base font-medium text-on-ink transition-transform duration-[90ms] active:translate-y-px">
                Browse components <Icon name="arrowRight" size={16} />
              </Link>
              <Link href="/workbench" className="focus-ring inline-flex h-11 items-center rounded-md bg-raised px-4 text-base text-ink shadow-[inset_0_0_0_1px_var(--bis-edge)] transition-transform duration-[90ms] hover:bg-surface active:translate-y-px">
                Open the workbench
              </Link>
            </div>
            <div className="mt-8 max-w-[540px]">
              <p className="text-sm text-muted">Install any component with the shadcn CLI:</p>
              <div className="mt-2 flex min-w-0 items-center gap-2 rounded-md bg-surface py-1 pl-3 pr-1 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={install}>{install}</code>
                <CopyButton text={install} />
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col">
            {/* Biscotti stands on the tray: rendered from the editable Blender model. */}
            <div className="hero-pup -mb-2 w-[min(46vw,190px)] self-end mr-4 sm:w-[210px] lg:mr-8">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export serves raw public assets */}
              <img
                src={publicPath("/brand/biscotti-hero-480.webp")}
                srcSet={`${publicPath("/brand/biscotti-hero-480.webp")} 480w, ${publicPath("/brand/biscotti-hero-960.webp")} 960w`}
                sizes="(min-width: 640px) 210px, 46vw"
                width={963} height={1152} fetchPriority="high"
                alt="Biscotti, the Biscotti UI mascot: a cream, velvety Spitz pup standing with a happy smile and its tongue out"
                className="block h-auto w-full select-none"
                draggable={false}
              />
            </div>
            <TactileTray />
          </div>
        </div>
      </section>

      {/* One substantive example with room to use it. */}
      <section aria-labelledby="example-h" className="border-y border-hairline bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-16">
          <div className="min-w-0 lg:pt-2">
            <h2 id="example-h" className="text-[clamp(24px,3vw,34px)] font-semibold leading-[1.1] tracking-[-0.025em]">Review an agent’s edits</h2>
            <p className="mt-4 text-base leading-[24px] text-ink-2">
              Scout proposed four changes to a launch note. Accept or reject each one, or all of them at once.
            </p>
            <p className="mt-3 text-base leading-[24px] text-ink-2">
              From the keyboard, J and K move between changes, A accepts, R rejects and U undoes the last decision.
            </p>
            <Link href="/components/diff-inspector" className="focus-ring mt-6 inline-flex items-center gap-1.5 rounded-xs text-sm text-ink-2 hover:text-ink">
              Diff Inspector docs <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          <DiffInspector
            className="w-full min-w-0 max-w-[720px]"
            title="Launch notes, edits from Scout"
            path="press/os-1-launch.md"
            hunks={launchNotesHunks}
          />
        </div>
      </section>

      {/* Everything else, by what you're building. */}
      <section aria-labelledby="groups-h" className="mx-auto max-w-[1320px] px-5 py-14 md:px-8 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 id="groups-h" className="text-[clamp(24px,3vw,34px)] font-semibold leading-[1.1] tracking-[-0.025em]">All {catalog.length} components</h2>
          <Link href="/components" className="focus-ring inline-flex items-center gap-1.5 rounded-xs text-sm text-ink-2 hover:text-ink">
            Live previews of each <Icon name="arrowRight" size={14} />
          </Link>
        </div>
        <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => (
            <div key={g} className="min-w-0">
              <h3 className="text-base font-medium">
                <Link href={`/components#${groupId(g)}`} className="focus-ring rounded-xs hover:text-pencil-ink">{g}</Link>
              </h3>
              <p className="mt-1.5 text-sm leading-[20px] text-muted">{groupIntro[g]}</p>
              <ul className="mt-4 border-t border-hairline">
                {catalog.filter((e) => e.group === g).map((e) => (
                  <li key={e.slug}>
                    <Link href={`/components/${e.slug}`} className="focus-ring group flex items-center justify-between gap-3 border-b border-hairline py-2.5 text-sm text-ink-2 hover:text-ink">
                      {e.name}
                      <Icon name="chevronRight" size={13} className="shrink-0 text-faint transition-colors group-hover:text-ink" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-xs text-muted md:px-8">
          <span>MIT licence</span>
          <Link href="/foundations" className="hover:text-ink">Foundations</Link>
          <a href={publicPath("/r/registry.json")} className="hover:text-ink">Registry</a>
          <a href={REPO_URL} className="inline-flex items-center gap-1 hover:text-ink">Source <Icon name="arrowUpRight" size={12} /></a>
        </div>
      </footer>
    </div>
  );
}
