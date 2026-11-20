import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { bySlug, catalog } from "@/catalog";
import { StageShell } from "@/components/stage-shell";
import { Code } from "@/components/code";
import { Kbd } from "@detent/ui";

export function generateStaticParams() {
  return catalog.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = bySlug(slug);
  return e ? { title: e.name, description: e.summary } : {};
}

function Row({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid gap-3 border-t border-hairline py-8 md:grid-cols-[200px_1fr] md:gap-8">
      <h2 id={`${id}-h`} className="font-mono text-2xs uppercase tracking-[0.08em] text-muted md:pt-1">{label}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default async function ComponentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = bySlug(slug);
  if (!e) notFound();
  const idx = catalog.indexOf(e);
  const prev = catalog[idx - 1];
  const next = catalog[idx + 1];
  const Demo = e.Demo;
  const base = (process.env.NEXT_PUBLIC_REGISTRY_URL ?? "http://localhost:3410").replace(/\/$/, "");
  const install = `npx shadcn@latest add ${base}/r/${e.slug}.json`;

  return (
    <article className="mx-auto max-w-[1180px] px-5 pb-24 pt-10 md:px-8 md:pt-14">
      <nav aria-label="Breadcrumb" className="mb-8 flex items-center gap-2 font-mono text-2xs text-muted">
        <Link href="/components" className="focus-ring rounded-xs hover:text-ink">Components</Link>
        <span aria-hidden>/</span>
        <span>{e.group}</span>
      </nav>
      <header className="mb-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="tabular mb-3 font-mono text-sm text-pencil-ink">{e.number}</p>
          <h1 className="text-[clamp(32px,5vw,52px)] font-semibold leading-[1.02] tracking-[-0.035em]">{e.name}</h1>
          <p className="mt-4 max-w-[640px] text-md text-ink-2">{e.summary}</p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-2xs text-muted md:justify-end">
          {e.dependencies.map((d) => <li key={d}>+ {d}</li>)}
          <li>{e.props.length} props</li>
          {e.keyboard && <li>{e.keyboard.length} shortcuts</li>}
        </ul>
      </header>

      <StageShell number={e.number} label={e.name}>
        <Demo />
      </StageShell>

      <div className="mt-14">
        <Row id="about" label="About">
          <p className="max-w-[680px] text-md leading-[26px] text-ink">{e.description}</p>
          <ul className="mt-5 grid gap-1.5 text-base text-ink-2">
            {e.useCases.map((u) => (
              <li key={u} className="flex gap-2.5"><span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-rule" />{u}</li>
            ))}
          </ul>
        </Row>
        <Row id="install" label="Install">
          <div className="grid gap-3">
            <Code lang="sh" title="shadcn registry" code={install} />
            <p className="text-sm text-muted">
              Installs the component and the shared <span className="font-mono text-ink-2">detent-foundation</span> (tokens, motion, sound, icons) into <span className="font-mono text-ink-2">components/detent/</span>. Then add <span className="font-mono text-ink-2">@import "./components/detent/styles/index.css";</span> after Tailwind in your global CSS.
            </p>
          </div>
        </Row>
        <Row id="usage" label="Usage">
          <Code code={e.usage} title={`${e.slug}.tsx`} />
        </Row>
        <Row id="props" label="Props">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">
                  <th className="w-[26%] pb-2 font-normal">Prop</th>
                  <th className="w-[26%] pb-2 font-normal">Type</th>
                  <th className="w-[12%] pb-2 font-normal">Default</th>
                  <th className="pb-2 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                {e.props.map((p) => (
                  <tr key={p.name} className="border-t border-hairline align-top">
                    <td className="py-2.5 pr-3 font-mono text-xs text-ink">{p.name}{p.required && <span className="text-pencil-ink">*</span>}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-ink-2">{p.type}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-muted">{p.default ?? "—"}</td>
                    <td className="py-2.5 text-ink-2">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {e.exports && (
            <ul className="mt-5 grid gap-1.5 text-sm">
              {e.exports.map((x) => (
                <li key={x.name}><span className="font-mono text-xs text-ink">{x.name}</span> <span className="text-muted">— {x.description}</span></li>
              ))}
            </ul>
          )}
        </Row>
        {e.keyboard && (
          <Row id="keyboard" label="Keyboard">
            <dl className="grid gap-2 sm:grid-cols-2">
              {e.keyboard.map((k) => (
                <div key={k.action} className="flex items-center gap-3 text-sm">
                  <dt className="flex min-w-[88px] gap-1">{k.keys.map((x) => <Kbd key={x}>{x}</Kbd>)}</dt>
                  <dd className="text-ink-2">{k.action}</dd>
                </div>
              ))}
            </dl>
          </Row>
        )}
        <Row id="motion" label="Motion">
          <dl className="grid gap-0">
            {e.motion.map((mo) => (
              <div key={mo.state} className="grid gap-1 border-b border-hairline py-2.5 text-sm last:border-0 sm:grid-cols-[150px_1fr] sm:gap-4">
                <dt className="font-medium text-ink">{mo.state}</dt>
                <dd className="text-ink-2">{mo.behaviour}</dd>
              </div>
            ))}
          </dl>
        </Row>
        <Row id="sound" label="Sound">
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {e.sound.map((s) => (
              <div key={s.event} className="flex items-baseline justify-between gap-3 border-b border-dashed border-hairline pb-2 text-sm">
                <dt className="text-ink-2">{s.event}</dt>
                <dd className="font-mono text-xs text-ink">{s.voice}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-muted">All sound is off until you opt in, and never plays on hover, focus or background updates. Pass <span className="font-mono text-ink-2">sound={"{false}"}</span> to silence one instance.</p>
        </Row>
        <Row id="a11y" label="Accessibility">
          <ul className="grid max-w-[720px] gap-2.5 text-base text-ink-2">
            {e.a11y.map((a) => (
              <li key={a} className="flex gap-2.5"><span aria-hidden className="mt-[9px] h-px w-3 shrink-0 bg-rule" />{a}</li>
            ))}
          </ul>
        </Row>
      </div>

      <nav aria-label="More components" className="mt-10 grid grid-cols-2 gap-3 border-t border-hairline pt-8">
        {prev ? (
          <Link href={`/components/${prev.slug}`} className="focus-ring group rounded-md p-3 hover:bg-surface">
            <span className="font-mono text-2xs text-muted">← {prev.number}</span>
            <span className="mt-1 block text-base text-ink">{prev.name}</span>
          </Link>
        ) : <span />}
        {next && (
          <Link href={`/components/${next.slug}`} className="focus-ring group rounded-md p-3 text-right hover:bg-surface">
            <span className="font-mono text-2xs text-muted">{next.number} →</span>
            <span className="mt-1 block text-base text-ink">{next.name}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}
