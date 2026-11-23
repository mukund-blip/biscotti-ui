import Link from "next/link";
import { Icon } from "@detent/ui";
import { GalleryTile } from "@/components/gallery-tile";
import { REPO_URL, publicPath, canonicalMetadata } from "@/site";
import { catalog, groups } from "@/catalog";
import { HeroRuler } from "@/components/home/ruler";
import { HeroBench } from "@/components/home/bench";
import { SoundBoard } from "./foundations/foundations-client";
import { DiffInspectorDemo } from "@/demos/diff-inspector-demo";

const principles = [
  ["Pencil, then ink.", "Provisional state is drawn in cobalt pencil; committed state is ink. Colour never decorates."],
  ["One live mark.", "At most one pencil element moves at a time — the caret, the active step, the latching thumb."],
  ["Respond instantly, settle physically.", "State changes on the input frame. Springs only settle what already happened. Only latches overshoot."],
  ["Finished work shrinks.", "Completed traces, tools and steps collapse into quiet, past-tense summaries."],
  ["Sound marks outcomes.", "Never hover, never per-token, never background. Synthesised, tuned, and off until you choose."],
];

const featured = ["command-palette", "streaming-response", "data-table", "insight-card"];

export const metadata = canonicalMetadata();

export default function Home() {
  const feat = featured.map((s) => catalog.find((e) => e.slug === s)).filter(Boolean) as typeof catalog;
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-[1320px] px-5 md:px-8">
        <div className="hidden pt-6 md:block"><HeroRuler /></div>
        <div className="grid items-center gap-12 pb-14 pt-12 md:pb-20 md:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs uppercase tracking-[0.08em] text-muted">
              <span>Biscotti UI 0.1</span><span aria-hidden className="h-px w-6 bg-rule" /><span>{catalog.length} components</span><span aria-hidden className="h-px w-6 bg-rule" /><span>React · Tailwind v4 · Motion</span>
            </p>
            <h1 className="max-w-[760px] text-[clamp(46px,6.6vw,84px)] font-semibold leading-[0.94] tracking-[-0.045em]">
              Interfaces that<br className="hidden lg:block" /> click into place.
            </h1>
            <p className="mt-7 max-w-[560px] text-[17px] leading-[27px] text-ink-2">
              {catalog.length} interactive React components for productivity, creative and AI-native software. Quiet at rest. Delightful in motion. Precise in use.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/components" className="focus-ring inline-flex h-11 items-center gap-3 rounded-md bg-ink px-4 text-base font-medium text-on-ink transition-transform duration-[90ms] active:translate-y-px">
                Browse components <Icon name="arrowRight" size={16} />
              </Link>
              <Link href="/workbench" className="focus-ring inline-flex h-11 items-center rounded-md bg-raised px-4 text-base text-ink shadow-[inset_0_0_0_1px_var(--dt-edge)] transition-transform duration-[90ms] hover:bg-surface active:translate-y-px">
                Open the workbench
              </Link>
            </div>
            <p className="mt-5 flex items-center gap-2 font-mono text-2xs text-muted"><Icon name="code" size={13} /> Source you copy into your app, not a black-box package</p>
          </div>
          <div className="flex flex-col items-center lg:items-end">
            {/* Biscotti stands on the bench: rendered from the editable Blender model. */}
            <div className="hero-pup -mb-3 w-[min(62vw,240px)] self-center sm:w-[260px] lg:mr-12 lg:self-end">
              {/* eslint-disable-next-line @next/next/no-img-element -- static export serves raw public assets */}
              <img
                src={publicPath("/brand/biscotti-hero-960.webp")}
                srcSet={`${publicPath("/brand/biscotti-hero-480.webp")} 480w, ${publicPath("/brand/biscotti-hero-960.webp")} 960w`}
                sizes="(min-width: 640px) 260px, 62vw"
                width={963} height={1152} fetchPriority="high"
                alt="Biscotti, the Biscotti UI mascot: a cream, velvety Spitz pup standing with a happy smile and its tongue out"
                className="block h-auto w-full select-none"
                draggable={false}
              />
            </div>
            <HeroBench />
          </div>
        </div>
      </section>

      <div className="border-y border-hairline bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-4 px-5 py-5 text-sm text-ink-2 md:grid-cols-3 md:px-8">
          {[["01", "Try the real thing", "Every preview is the shipped component, with its pending, error and undo states."], ["02", "Copy the source", "One shadcn command puts it in components/detent/, ready to edit."], ["03", "Keep one state language", "Pencil while provisional, ink once committed, across all twenty."]].map(([n, title, detail]) => <div key={n} className="flex gap-3"><span className="pt-0.5 font-mono text-2xs text-pencil-ink">{n}</span><p><span className="font-medium text-ink">{title}</span><span className="mt-0.5 block text-xs text-muted">{detail}</span></p></div>)}
        </div>
      </div>
      {/* Pencil, then ink */}
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 md:px-8 lg:grid-cols-[380px_1fr]">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.08em] text-pencil-ink">The idea</p>
            <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em]">Pencil, then ink.</h2>
            <p className="mt-5 text-md leading-[26px] text-ink-2">
              AI-era software is full of things that aren’t true yet — streamed text, proposed edits, pending approvals, running tools. Biscotti UI draws all of them in the same cobalt pencil, and gives the moment they become real one consistent feel: a detent, the click of a part seating into place.
            </p>
            <p className="mt-4 text-md leading-[26px] text-ink-2">Accept a change on the right. Watch the gap close, the rule ink in, and the text settle into the document.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-hairline">
            <DiffInspectorDemo />
          </div>
        </div>
      </section>

      {/* Featured */}
      {feat.length > 0 && (
        <section className="mx-auto max-w-[1320px] px-5 py-20 md:px-8">
          <div className="mb-8 flex items-end justify-between gap-6">
            <div><p className="mb-3 font-mono text-2xs uppercase tracking-[0.08em] text-muted">A few from the collection</p><h2 className="text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em]">Every control works.</h2></div>
            <Link href="/components" className="focus-ring inline-flex shrink-0 items-center gap-2 rounded-xs text-sm text-ink-2 hover:text-ink">View all {catalog.length} <Icon name="arrowRight" size={15} /></Link>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-6">
            {feat.map((e) => <GalleryTile key={e.slug} e={e} cols={3} />)}
          </div>
        </section>
      )}

      {/* Principles */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-[1320px] px-5 py-20 md:px-8">
          <p className="mb-10 font-mono text-2xs uppercase tracking-[0.08em] text-muted">Five principles</p>
          <ol className="grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-5">
            {principles.map(([t, d], i) => (
              <li key={t} className="border-t border-rule pt-4">
                <span className="tabular font-mono text-2xs text-muted">0{i + 1}</span>
                <h3 className="mt-2 text-lg font-medium leading-[24px] tracking-[-0.015em]">{t}</h3>
                <p className="mt-2 text-sm leading-[20px] text-ink-2">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Sound */}
      <section className="border-t border-hairline bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 md:px-8 lg:grid-cols-[380px_1fr]">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.08em] text-muted">Sound</p>
            <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em]">Heard, not noticed.</h2>
            <p className="mt-5 text-md leading-[26px] text-ink-2">Thirteen tiny voices synthesised in your browser and tuned to one pentatonic scale, so they never clash. Off by default, adjustable, and permanently mutable.</p>
          </div>
          <SoundBoard />
        </div>
      </section>

      {/* Index */}
      <section className="mx-auto max-w-[1320px] px-5 py-20 md:px-8">
        <p className="mb-8 font-mono text-2xs uppercase tracking-[0.08em] text-muted">Index</p>
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => (
            <div key={g}>
              <h3 className="border-b border-rule pb-2 text-sm font-medium">{g}</h3>
              <ul>
                {catalog.filter((e) => e.group === g).map((e) => (
                  <li key={e.slug}>
                    <Link href={`/components/${e.slug}`} className="focus-ring group flex items-baseline gap-3 border-b border-hairline py-2 text-sm hover:text-ink">
                      <span className="tabular font-mono text-2xs text-muted">{e.number}</span>
                      <span className="text-ink-2 group-hover:text-ink">{e.name}</span>
                      <span aria-hidden className="ml-auto text-muted transition-colors group-hover:text-ink"><Icon name="arrowRight" size={14} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 font-mono text-2xs text-muted md:px-8">
          <span>Biscotti UI 0.1 — MIT</span>
          <Link href="/foundations" className="hover:text-ink">Foundations</Link>
          <a href={publicPath("/r/registry.json")} className="hover:text-ink">Registry</a>
          <a href={REPO_URL} className="inline-flex items-center gap-1.5 hover:text-ink">Source on GitHub <Icon name="arrowUpRight" size={13} /></a>
          <span className="ml-auto">Respects prefers-reduced-motion · Sound off by default</span>
        </div>
      </footer>
    </div>
  );
}
