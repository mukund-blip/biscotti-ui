import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { bySlug, catalog } from "@/catalog";
import { StageShell } from "@/components/stage-shell";
import { Code } from "@/components/code";
import { Icon, Kbd } from "@biscotti/ui";
import { canonicalMetadata, siteUrl, REGISTRY_IS_LOCAL, REGISTRY_URL, componentSourceUrl, originComment } from "@/site";

export function generateStaticParams() {
  return catalog.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const e = bySlug(slug);
  if (!e) return {};
  const title = `${e.name} — ${e.group}`;
  return {
    ...canonicalMetadata(`components/${slug}`),
    title: e.name,
    description: e.summary,
    openGraph: { url: siteUrl(`components/${slug}`), title, description: e.summary, type: "article", siteName: "Biscotti UI" },
    twitter: { card: "summary", title, description: e.summary },
  };
}

/** A numbered section with a real heading, so the page outline reads cleanly. */
function Section({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-hairline pb-2 pt-8 md:pt-10">
      <div className="mb-5 flex items-baseline gap-3">
        <span aria-hidden className="tabular font-mono text-2xs text-pencil-ink">{n}</span>
        <h2 id={`${id}-h`} className="text-lg font-semibold tracking-[-0.015em]">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Dash() {
  return <span aria-hidden className="mt-[10px] h-px w-3 shrink-0 bg-rule" />;
}

export default async function ComponentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = bySlug(slug);
  if (!e) notFound();
  const idx = catalog.indexOf(e);
  const prev = catalog[idx - 1];
  const next = catalog[idx + 1];
  const Demo = e.Demo;
  const install = `npx shadcn@latest add ${REGISTRY_URL}/r/${e.slug}.json`;
  const source = componentSourceUrl(e.slug);
  const usage = `${originComment(e.slug, e.name)}\n${e.usage}`;

  // States worth knowing about before you adopt it: everything but the resting state.
  const states = e.motion.map((m) => m.state).filter((s) => !/^rest\b/i.test(s));

  const toc = [
    { id: "about", label: "About" },
    { id: "install", label: "Install" },
    { id: "usage", label: "Usage" },
    { id: "props", label: "API" },
    ...(e.keyboard ? [{ id: "keyboard", label: "Keyboard" }] : []),
    { id: "motion", label: "States & motion" },
    { id: "sound", label: "Sound" },
    { id: "a11y", label: "Accessibility" },
  ];
  const num = (id: string) => String(toc.findIndex((t) => t.id === id) + 1).padStart(2, "0");

  return (
    <article className="mx-auto max-w-[1180px] px-5 pb-24 pt-8 md:px-8 md:pt-12">
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 font-mono text-2xs text-muted">
          <li><Link href="/components" className="focus-ring rounded-xs hover:text-ink">Components</Link></li>
          <li aria-hidden><Icon name="chevronRight" size={11} /></li>
          <li><Link href={`/components#${e.group.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="focus-ring rounded-xs hover:text-ink">{e.group}</Link></li>
          <li aria-hidden><Icon name="chevronRight" size={11} /></li>
          <li aria-current="page" className="text-ink-2">{e.name}</li>
        </ol>
      </nav>

      <header className="mb-8 grid gap-8 md:mb-10 lg:grid-cols-[1fr_300px] lg:items-end">
        <div>
          <p className="mb-3 flex items-center gap-2.5 font-mono text-2xs uppercase tracking-[0.08em] text-muted">
            <span className="tabular text-pencil-ink">{e.number}</span>
            <span aria-hidden className="h-px w-5 bg-rule" />
            <span>{e.group}</span>
          </p>
          <h1 className="text-[clamp(32px,5vw,52px)] font-semibold leading-[1.02] tracking-[-0.035em]">{e.name}</h1>
          <p className="mt-4 max-w-[640px] text-md leading-[26px] text-ink-2">{e.summary}</p>
        </div>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-hairline text-sm shadow-[inset_0_0_0_1px_var(--bis-hairline)] sm:grid-cols-4 lg:grid-cols-2">
          {[
            ["Props", String(e.props.length)],
            ["Shortcuts", e.keyboard ? String(e.keyboard.length) : "—"],
            ["Requires", e.dependencies.length ? e.dependencies.join(", ") : "react"],
            ["Sound", e.sound.some((s) => !/^(none|—)/.test(s.voice)) ? "Opt-in" : "Silent"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-3.5 py-2.5">
              <dt className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">{k}</dt>
              <dd className="tabular mt-0.5 truncate font-mono text-xs text-ink" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <StageShell number={e.number} label={e.name}>
        <Demo />
      </StageShell>

      {states.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="mr-1 font-mono text-2xs uppercase tracking-[0.06em] text-muted">Covers</span>
          {states.map((s) => (
            <a key={s} href="#motion" className="focus-ring rounded-xs bg-sunken px-2 py-[3px] text-xs text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)] hover:text-ink">
              {s}
            </a>
          ))}
        </div>
      )}

      <div className="mt-12 grid gap-10 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 font-mono text-2xs uppercase tracking-[0.08em] text-muted">On this page</p>
            <ol className="grid gap-0.5 border-l border-hairline">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="focus-ring -ml-px flex items-baseline gap-2 border-l border-transparent py-1 pl-3 text-sm text-ink-2 hover:border-pencil hover:text-ink">
                    <span className="tabular font-mono text-2xs text-muted">{num(t.id)}</span>
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
            <a href={source} className="focus-ring mt-6 inline-flex items-center gap-1.5 rounded-xs text-sm text-ink-2 hover:text-ink">
              <Icon name="code" size={14} /> View source <Icon name="external" size={12} className="text-muted" />
            </a>
          </div>
        </nav>

        <div className="min-w-0">
          <Section id="about" n={num("about")} title="About">
            <p className="max-w-[680px] text-md leading-[26px] text-ink">{e.description}</p>
            <h3 className="mt-6 font-mono text-2xs uppercase tracking-[0.06em] text-muted">Use it for</h3>
            <ul className="mt-2 grid gap-1.5 text-base text-ink-2">
              {e.useCases.map((u) => (
                <li key={u} className="flex gap-2.5"><Dash />{u}</li>
              ))}
            </ul>
          </Section>

          <Section id="install" n={num("install")} title="Install">
            <div className="grid gap-5">
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Copy the source with the shadcn CLI</h3>
                <Code lang="sh" title="Terminal" code={install} />
                <p className="max-w-[680px] text-sm text-muted [overflow-wrap:anywhere]">
                  Adds the component and the shared <span className="font-mono text-ink-2">biscotti-foundation</span> (tokens, springs, sound engine, icons) under <span className="font-mono text-ink-2">components/biscotti/</span>
                  {e.dependencies.length > 0 && <>, and installs <span className="font-mono text-ink-2">{e.dependencies.join(" ")}</span></>}. Then import the styles after Tailwind in your global CSS: <span className="font-mono text-ink-2">@import &quot;./components/biscotti/styles/index.css&quot;;</span>
                </p>
                {REGISTRY_IS_LOCAL && (
                  <p className="flex max-w-[680px] gap-2 rounded-md bg-pencil-soft px-3 py-2 text-sm text-ink-2">
                    <Icon name="info" size={14} className="mt-[3px] shrink-0 text-pencil-ink" />
                    <span>This command points at the local registry, so it works while <span className="font-mono">pnpm dev</span> is running in the Biscotti UI repo. Set <span className="font-mono">NEXT_PUBLIC_REGISTRY_URL</span> when you host <span className="font-mono">public/r</span> elsewhere.</span>
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <h3 className="text-sm font-medium">Or import it inside this monorepo</h3>
                <Code lang="tsx" title="workspace" code={`import { ${componentImport(e.usage)} } from "@biscotti/ui";`} />
              </div>
              <a href={source} className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-xs text-sm text-ink-2 hover:text-ink lg:hidden">
                <Icon name="code" size={14} /> View source on GitHub <Icon name="external" size={12} className="text-muted" />
              </a>
            </div>
          </Section>

          <Section id="usage" n={num("usage")} title="Usage">
            <Code code={usage} title={`${e.slug}.tsx`} />
          </Section>

          <Section id="props" n={num("props")} title="API">
            {/* Wide screens: a table. Narrow screens: one card per prop, so nothing scrolls sideways. */}
            <table className="hidden w-full border-collapse text-left text-sm md:table">
              <thead>
                <tr className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">
                  <th scope="col" className="w-[24%] pb-2 font-normal">Prop</th>
                  <th scope="col" className="w-[26%] pb-2 font-normal">Type</th>
                  <th scope="col" className="w-[13%] pb-2 font-normal">Default</th>
                  <th scope="col" className="pb-2 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                {e.props.map((p) => (
                  <tr key={p.name} className="border-t border-hairline align-top">
                    <th scope="row" className="break-words py-2.5 pr-3 font-mono text-xs font-normal text-ink">
                      {p.name}{p.required && <span className="text-pencil-ink" title="Required"> *</span>}
                    </th>
                    <td className="break-words py-2.5 pr-3 font-mono text-xs text-ink-2">{p.type}</td>
                    <td className="break-words py-2.5 pr-3 font-mono text-xs text-muted">{p.default ?? "—"}</td>
                    <td className="py-2.5 text-ink-2">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="grid gap-0 md:hidden">
              {e.props.map((p) => (
                <li key={p.name} className="grid gap-1 border-t border-hairline py-3">
                  <p className="break-words font-mono text-xs text-ink">
                    {p.name}{p.required && <span className="text-pencil-ink"> * required</span>}
                  </p>
                  <p className="break-words font-mono text-2xs text-ink-2">
                    {p.type}{p.default && <span className="text-muted"> = {p.default}</span>}
                  </p>
                  <p className="text-sm text-ink-2">{p.description}</p>
                </li>
              ))}
            </ul>
            {e.exports && (
              <>
                <h3 className="mt-8 font-mono text-2xs uppercase tracking-[0.06em] text-muted">Also exported</h3>
                <dl className="mt-2 grid gap-0">
                  {e.exports.map((x) => (
                    <div key={x.name} className="grid gap-1 border-t border-hairline py-2.5 text-sm md:grid-cols-[minmax(0,240px)_1fr] md:gap-4">
                      <dt className="break-words font-mono text-xs text-ink">{x.name}</dt>
                      <dd className="text-ink-2">{x.description}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Section>

          {e.keyboard && (
            <Section id="keyboard" n={num("keyboard")} title="Keyboard">
              <dl className="grid gap-0">
                {e.keyboard.map((k) => (
                  <div key={k.action + k.keys.join()} className="grid gap-1.5 border-t border-hairline py-2.5 text-sm first:border-0 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-4">
                    <dt className="flex flex-wrap gap-1">{k.keys.map((x) => <Kbd key={x}>{x}</Kbd>)}</dt>
                    <dd className="text-ink-2">{k.action}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <Section id="motion" n={num("motion")} title="States & motion">
            <dl className="grid gap-0">
              {e.motion.map((mo) => (
                <div key={mo.state} className="grid gap-1 border-t border-hairline py-2.5 text-sm first:border-0 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-4">
                  <dt className="font-medium text-ink">{mo.state}</dt>
                  <dd className="text-ink-2">{mo.behaviour}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="sound" n={num("sound")} title="Sound">
            <dl className="grid gap-0">
              {e.sound.map((s) => (
                <div key={s.event} className="grid gap-1 border-t border-hairline py-2.5 text-sm first:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-ink-2">{s.event}</dt>
                  <dd className="font-mono text-xs text-ink sm:pt-px">{s.voice}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 max-w-[680px] text-sm text-muted">
              Sound stays off until the person using your app turns it on, and never plays on hover, focus or background updates. Pass <span className="font-mono text-ink-2">sound={"{false}"}</span> to silence one instance.
            </p>
          </Section>

          <Section id="a11y" n={num("a11y")} title="Accessibility">
            <ul className="grid max-w-[720px] gap-2.5 text-base text-ink-2">
              {e.a11y.map((a) => (
                <li key={a} className="flex gap-2.5"><Dash />{a}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <nav aria-label="More components" className="mt-14 grid grid-cols-2 gap-3 border-t border-hairline pt-6">
        {prev ? (
          <Link href={`/components/${prev.slug}`} className="focus-ring group flex items-center gap-3 rounded-md p-3 hover:bg-surface">
            <Icon name="chevronLeft" size={16} className="shrink-0 text-muted transition-transform duration-[120ms] group-hover:-translate-x-0.5 group-hover:text-ink" />
            <span className="min-w-0">
              <span className="tabular block font-mono text-2xs text-muted">Previous · {prev.number}</span>
              <span className="mt-0.5 block truncate text-base text-ink">{prev.name}</span>
            </span>
          </Link>
        ) : <span />}
        {next && (
          <Link href={`/components/${next.slug}`} className="focus-ring group flex items-center justify-end gap-3 rounded-md p-3 text-right hover:bg-surface">
            <span className="min-w-0">
              <span className="tabular block font-mono text-2xs text-muted">Next · {next.number}</span>
              <span className="mt-0.5 block truncate text-base text-ink">{next.name}</span>
            </span>
            <Icon name="chevronRight" size={16} className="shrink-0 text-muted transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-ink" />
          </Link>
        )}
      </nav>
    </article>
  );
}

/** The named imports from the usage example's `@biscotti/ui` line, so the workspace snippet matches it. */
function componentImport(usage: string) {
  const m = usage.match(/import\s*\{([^}]+)\}\s*from\s*"@biscotti\/ui"/);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}
