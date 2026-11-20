"use client";
import { motion, useAnimate } from "motion/react";
import { useMemo, useState } from "react";
import { Icon, iconNames, cn, sound, spring, useSoundPrefs, type SoundName } from "@detent/ui";

/* ── Springs: simulate x'' = −k(x−1) − c x' (mass m) and plot ───────── */
function simulate({ stiffness, damping, mass }: { stiffness: number; damping: number; mass: number }, ms = 600) {
  const pts: [number, number][] = [];
  let x = 0, v = 0;
  const dt = 1 / 1000;
  for (let t = 0; t <= ms; t++) {
    const a = (-stiffness * (x - 1) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    if (t % 4 === 0) pts.push([t, x]);
  }
  return pts;
}

const springRows = [
  { name: "control", use: "Thumbs, small indicators", s: spring.control },
  { name: "latch", use: "Commit moments — the only overshoot", s: spring.latch },
  { name: "glide", use: "Travelling selection indicators", s: spring.glide },
  { name: "layout", use: "Collapse, insert, reorder", s: spring.layout },
  { name: "surface", use: "Large surfaces entering", s: spring.surface },
] as const;

function SpringRow({ name, use, s }: (typeof springRows)[number]) {
  const pts = useMemo(() => simulate(s), [s]);
  const W = 220, H = 64;
  const max = Math.max(1.06, ...pts.map((p) => p[1]));
  const d = pts.map(([t, x], i) => `${i ? "L" : "M"}${((t / 600) * W).toFixed(1)},${(H - (x / max) * (H - 6)).toFixed(1)}`).join("");
  const settle = pts.find(([, x], i) => i > 0 && pts.slice(i).every(([, y]) => Math.abs(y - 1) < 0.005))?.[0] ?? 600;
  const overshoot = Math.max(0, (Math.max(...pts.map((p) => p[1])) - 1) * 100);
  const [scope, animate] = useAnimate();
  return (
    <div className="grid items-center gap-4 border-t border-hairline py-4 md:grid-cols-[160px_220px_1fr_auto]">
      <div>
        <p className="font-mono text-sm text-ink">spring.{name}</p>
        <p className="text-xs text-muted">{use}</p>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label={`${name} spring curve`} className="overflow-visible">
        <line x1={0} x2={W} y1={H - (1 / max) * (H - 6)} y2={H - (1 / max) * (H - 6)} stroke="var(--dt-hairline)" strokeDasharray="2 3" />
        <path d={d} fill="none" stroke={name === "latch" ? "var(--dt-pencil)" : "var(--dt-ink)"} strokeWidth="1.5" />
      </svg>
      <div className="relative h-8 rounded-sm bg-sunken shadow-[inset_0_0_0_1px_var(--dt-hairline)]" ref={scope}>
        <span data-dot className="absolute left-1 top-1 size-6 rounded-[3px] bg-thumb shadow-1" />
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular font-mono text-2xs text-muted">k{s.stiffness} c{s.damping} · {settle}ms · {overshoot.toFixed(1)}%</span>
        <button
          onClick={async () => {
            const el = scope.current as HTMLElement;
            const w = el.clientWidth - 32;
            await animate("[data-dot]", { x: w }, s);
            await animate("[data-dot]", { x: 0 }, { ...s });
          }}
          className="focus-ring h-7 rounded-sm px-2.5 text-xs text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-edge)] hover:bg-sunken hover:text-ink"
        >
          Run
        </button>
      </div>
    </div>
  );
}

export function Springs() {
  return <div>{springRows.map((r) => <SpringRow key={r.name} {...r} />)}</div>;
}

/* ── Sound board ───────────────────────────────────────────────────── */
const voices: { name: SoundName; use: string }[] = [
  { name: "tick", use: "Detents, steps" },
  { name: "tap", use: "Button press" },
  { name: "latch", use: "Switch on, accept" },
  { name: "unlatch", use: "Switch off, undo" },
  { name: "select", use: "Choice change" },
  { name: "confirm", use: "Submit, approve" },
  { name: "complete", use: "Multi-step done" },
  { name: "attention", use: "Needs a decision" },
  { name: "error", use: "Failure" },
  { name: "dismiss", use: "Close, remove" },
  { name: "notify", use: "Toast arrives" },
  { name: "open", use: "Palette opens" },
  { name: "close", use: "Palette closes" },
];

export function SoundBoard() {
  const prefs = useSoundPrefs();
  const [last, setLast] = useState<SoundName | null>(null);
  return (
    <div>
      {!prefs.enabled && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-pencil-soft px-3.5 py-2.5 text-sm text-ink">
          <Icon name="speakerOff" size={14} className="text-pencil-ink" />
          Sound is off. Every voice below is synthesised live — nothing plays until you turn it on.
          <button onClick={() => prefs.enable()} disabled={prefs.disabledPermanently}
            className="focus-ring ml-auto h-7 rounded-sm bg-ink px-2.5 text-xs font-medium text-on-ink disabled:opacity-50">
            {prefs.disabledPermanently ? "Disabled on this device" : "Turn sound on"}
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {voices.map((v) => (
          <button
            key={v.name}
            onPointerDown={() => { sound.play(v.name); setLast(v.name); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sound.play(v.name); setLast(v.name); } }}
            className={cn(
              "focus-ring group flex items-center gap-3 rounded-md bg-raised p-3 text-left shadow-1 transition-[transform,box-shadow] duration-[90ms] active:translate-y-px active:shadow-press",
              "shadow-[inset_0_0_0_1px_var(--dt-hairline)]",
            )}
          >
            <span className="relative grid size-8 shrink-0 place-items-center rounded-sm bg-sunken">
              <Icon name="play" size={12} className="text-ink-2" />
              {last === v.name && (
                <motion.span key={Date.now()} initial={{ opacity: 0.6, scale: 1 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 0.4 }}
                  className="absolute inset-0 rounded-sm shadow-[inset_0_0_0_1.5px_var(--dt-pencil)]" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-sm text-ink"><span className="sr-only">Play </span>{v.name}</span>
              <span className="block truncate text-xs text-muted">{v.use}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function IconGrid() {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-4 gap-1 sm:grid-cols-8 lg:grid-cols-12">
      {iconNames.map((n) => (
        <button key={n} title={n} aria-label={`Copy icon name ${n}`}
          onClick={() => { navigator.clipboard?.writeText(n); setCopied(n); setTimeout(() => setCopied(null), 1000); }}
          className="focus-ring group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-sm text-ink hover:bg-raised hover:shadow-1">
          <Icon name={copied === n ? "check" : n} size={16} />
          <span className="max-w-full truncate px-1 font-mono text-[9.5px] text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{n}</span>
        </button>
      ))}
    </div>
  );
}
