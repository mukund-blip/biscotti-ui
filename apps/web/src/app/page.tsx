import Link from "next/link";
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

export default function Home() {
  const feat = featured.map((s) => catalog.find((e) => e.slug === s)).filter(Boolean) as typeof catalog;
  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-[1320px] px-5 md:px-8">
        <div className="hidden pt-6 md:block"><HeroRuler /></div>
        <div className="grid items-center gap-12 pb-20 pt-12 md:pt-16 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs uppercase tracking-[0.08em] text-muted">
              <span>Detent 0.1</span><span aria-hidden className="h-px w-6 bg-rule" /><span>{catalog.length} components</span><span aria-hidden className="h-px w-6 bg-rule" /><span>React · Tailwind v4 · Motion</span>
            </p>
            <h1 className="max-w-[760px] text-[clamp(44px,7.4vw,92px)] font-semibold leading-[0.94] tracking-[-0.045em]">
              Interfaces that click into place.
            </h1>
            <p className="mt-7 max-w-[560px] text-[17px] leading-[27px] text-ink-2">
              Twenty interactive components for productivity, creative and AI-native software. Quiet at rest. Delightful in motion. Precise in use.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/components" className="focus-ring inline-flex h-10 items-center gap-2 rounded-sm bg-ink px-4 text-base font-medium text-on-ink transition-transform duration-[90ms] active:translate-y-px">
                Browse components <span aria-hidden>→</span>
              </Link>
              <Link href="/workbench" className="focus-ring inline-flex h-10 items-center rounded-sm bg-raised px-4 text-base text-ink shadow-[inset_0_0_0_1px_var(--dt-edge)] transition-transform duration-[90ms] hover:bg-surface active:translate-y-px">
                Open the workbench
              </Link>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroBench />
          </div>
        </div>
      </section>

      {/* Pencil, then ink */}
      <section className="border-t border-hairline bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-20 md:px-8 lg:grid-cols-[380px_1fr]">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.08em] text-pencil-ink">The idea</p>
            <h2 className="mt-3 text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em]">Pencil, then ink.</h2>
            <p className="mt-5 text-md leading-[26px] text-ink-2">
              AI-era software is full of things that aren’t true yet — streamed text, proposed edits, pending approvals, running tools. Detent draws all of them in the same cobalt pencil, and gives the moment they become real one consistent feel: a detent.
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
            <h2 className="text-[clamp(28px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em]">Every control works.</h2>
            <Link href="/components" className="focus-ring rounded-xs font-mono text-2xs uppercase tracking-[0.08em] text-muted hover:text-ink">All {catalog.length} →</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {feat.map((e) => {
              const P = e.Preview ?? e.Demo;
              return (
                <article key={e.slug} className="flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
                  <div className="flex min-h-[380px] flex-1 flex-col items-center justify-center bg-paper"><P /></div>
                  <Link href={`/components/${e.slug}`} className="focus-ring flex items-baseline gap-3 border-t border-hairline px-4 py-3.5 hover:bg-raised">
                    <span className="tabular font-mono text-2xs text-muted">{e.number}</span>
                    <span className="text-base font-medium">{e.name}</span>
                    <span className="hidden truncate text-sm text-muted sm:inline">{e.summary}</span>
                  </Link>
                </article>
              );
            })}
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
            <p className="mt-5 text-md leading-[26px] text-ink-2">Twelve tiny voices synthesised in your browser and tuned to one pentatonic scale, so they never clash. Off by default, adjustable, and permanently mutable.</p>
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
                      <span aria-hidden className="ml-auto text-muted opacity-0 transition-opacity group-hover:opacity-100">→</span>
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
          <span>Detent 0.1 — MIT</span>
          <Link href="/foundations" className="hover:text-ink">Foundations</Link>
          <a href="/r/registry.json" className="hover:text-ink">Registry</a>
          <span className="ml-auto">Respects prefers-reduced-motion · Sound off by default</span>
        </div>
      </footer>
    </div>
  );
}
