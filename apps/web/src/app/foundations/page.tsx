import type { Metadata } from "next";
import { IconGrid, SoundBoard, Springs } from "./foundations-client";

export const metadata: Metadata = { title: "Foundations" };

const colorGroups = [
  { name: "Surfaces", tokens: ["paper", "surface", "raised", "sunken", "well"] },
  { name: "Ink", tokens: ["ink", "ink-2", "muted", "faint"] },
  { name: "Lines", tokens: ["hairline", "rule", "edge"] },
  { name: "Pencil — provisional", tokens: ["pencil", "pencil-ink", "pencil-soft", "pencil-line"] },
  { name: "Status", tokens: ["ok", "warn", "err"] },
];

function Swatches({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} className="rounded-lg bg-paper p-4 text-ink">
      <p className="mb-3 font-mono text-2xs uppercase tracking-[0.08em] text-muted">{theme}</p>
      <div className="grid gap-4">
        {colorGroups.map((g) => (
          <div key={g.name}>
            <p className="mb-1.5 text-xs text-ink-2">{g.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {g.tokens.map((t) => (
                <div key={t} className="w-[76px]">
                  <div className="h-10 rounded-sm shadow-[inset_0_0_0_1px_var(--dt-hairline)]" style={{ background: `var(--dt-${t})` }} />
                  <p className="mt-1 truncate font-mono text-[10.5px] text-muted">{t}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const typeScale = [
  ["3xl", 64, "Display — homepage only"],
  ["2xl", 40, "Page titles"],
  ["xl", 28, "Section heads"],
  ["lg", 20, "Panel titles"],
  ["md", 16, "Reading text"],
  ["base", 14, "UI default"],
  ["sm", 13, "Secondary UI"],
  ["xs", 12, "Dense metadata"],
  ["2xs", 11, "Mono labels, key caps"],
] as const;

function Section({ id, n, title, intro, children }: { id: string; n: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="border-t border-rule py-12">
      <div className="mb-8 grid gap-2 md:grid-cols-[200px_1fr]">
        <p className="tabular font-mono text-2xs text-muted">{n}</p>
        <div>
          <h2 id={`${id}-h`} className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-2 max-w-[620px] text-base text-ink-2">{intro}</p>
        </div>
      </div>
      <div className="md:pl-[200px]">{children}</div>
    </section>
  );
}

export default function Foundations() {
  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-24 pt-12 md:px-8 md:pt-16">
      <header className="mb-12">
        <p className="mb-3 font-mono text-2xs uppercase tracking-[0.08em] text-muted">Foundations</p>
        <h1 className="max-w-[820px] text-[clamp(34px,5.5vw,56px)] font-semibold leading-[1] tracking-[-0.04em]">Pencil, then ink.</h1>
        <p className="mt-5 max-w-[640px] text-md text-ink-2">
          One rule explains every colour in Detent: anything provisional — streaming, proposed, pending, live — is drawn in pencil. When it becomes true, it’s inked. Everything else is paper, graphite and hairlines.
        </p>
      </header>

      <Section id="color" n="01" title="Colour" intro="Warm paper and graphite, one cobalt pencil, and status colours reserved for status. Every token is a CSS variable you can remap in a host app.">
        <div className="grid gap-3 lg:grid-cols-2">
          <Swatches theme="light" />
          <Swatches theme="dark" />
        </div>
      </Section>

      <Section id="type" n="02" title="Type" intro="Geist for interface, Geist Mono (tabular) for every number, timer, path and key. Newsreader italic appears in exactly one role: provenance — where a claim came from.">
        <div className="grid">
          {typeScale.map(([k, px, use]) => (
            <div key={k} className="grid items-baseline gap-4 border-b border-hairline py-2.5 sm:grid-cols-[90px_1fr_200px]">
              <span className="tabular font-mono text-2xs text-muted">{k} · {px}</span>
              <span className="truncate text-ink" style={{ fontSize: px, letterSpacing: px >= 28 ? "-0.03em" : px >= 20 ? "-0.015em" : undefined, lineHeight: 1.15 }}>OS-1 four-voice synth</span>
              <span className="text-xs text-muted">{use}</span>
            </div>
          ))}
          <div className="grid items-baseline gap-4 py-3 sm:grid-cols-[90px_1fr_200px]">
            <span className="font-mono text-2xs text-muted">serif</span>
            <span className="font-serif text-[17px] italic text-muted">Supplier quotes put the earliest encoder delivery at nine weeks.</span>
            <span className="text-xs text-muted">Provenance only</span>
          </div>
        </div>
      </Section>

      <Section id="shape" n="03" title="Geometry & depth" intro="Small radii that grow with the size of the surface. Depth comes from hairlines and one soft ambient shadow — never glass or glow.">
        <div className="flex flex-wrap items-end gap-5">
          {[["xs", 2, "chips, kbd"], ["sm", 4, "controls"], ["md", 6, "inputs"], ["lg", 10, "panels"], ["xl", 14, "stages"]].map(([k, r, use]) => (
            <div key={k as string} className="text-center">
              <div className="size-20 bg-raised shadow-2" style={{ borderRadius: r as number }} />
              <p className="mt-2 font-mono text-2xs text-ink">{k} · {r}px</p>
              <p className="text-2xs text-muted">{use}</p>
            </div>
          ))}
          <div className="ml-auto flex gap-4">
            {["shadow-1", "shadow-2", "shadow-3", "shadow-press"].map((s) => (
              <div key={s} className="text-center">
                <div className={`size-20 rounded-lg bg-raised ${s}`} />
                <p className="mt-2 font-mono text-2xs text-muted">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section id="motion" n="04" title="Motion" intro="Timing is chosen per interaction class. State changes on the input frame; springs only settle what already happened. Only the latch overshoots. Under reduced motion, travel becomes instant and a 120 ms fade remains.">
        <Springs />
      </Section>

      <Section id="sound" n="05" title="Sound" intro="Thirteen voices synthesised with the Web Audio API — filtered noise transients and pentatonic sine partials through one limiter. Off by default; never on hover, focus or background updates.">
        <SoundBoard />
      </Section>

      <Section id="icons" n="06" title="Icons" intro="Drawn on a 16 px grid with a 1.5 px stroke and round joins, sized to sit on the text baseline. Click to copy a name.">
        <IconGrid />
      </Section>
    </div>
  );
}
