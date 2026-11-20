"use client";
import { useState, type CSSProperties } from "react";
import {
  PropertyBoxModel,
  PropertyColor,
  PropertyEditor,
  PropertyRow,
  PropertyScrub,
  PropertySection,
  PropertySegmented,
  PropertySelect,
  type BoxModelTarget,
  type BoxModelValue,
} from "@detent/ui";
import { cn } from "@detent/ui";
import { ControlCheck, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

const FAMILIES = [
  { value: "sans", label: "Geist", css: "var(--dt-font-sans)" },
  { value: "mono", label: "Geist Mono", css: "var(--dt-font-mono)" },
  { value: "serif", label: "Georgia", css: "Georgia, ui-serif, serif" },
  { value: "system", label: "System UI", css: "system-ui, sans-serif" },
];

type Card = {
  fill: string;
  accent: string;
  radius: number;
  family: string;
  weight: string;
  size: number;
  sizeUnit: string;
  leading: number;
  tracking: number;
  box: BoxModelValue;
};

const BASE: Card = {
  fill: "#ECE8DF",
  accent: "#B84316",
  radius: 14,
  family: "sans",
  weight: "600",
  size: 28,
  sizeUnit: "px",
  leading: 1.1,
  tracking: -0.02,
  box: { margin: [24, 24, 24, 24], padding: [20, 20, 20, 20] },
};

/** Text colour that stays legible on the user's fill (preview content, not chrome). */
function inkFor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35 ? "#18181A" : "#F4F3EF";
}

function SynthGlyph({ accent, ink }: { accent: string; ink: string }) {
  return (
    <svg viewBox="0 0 220 84" className="block w-full" aria-hidden>
      <rect x="1" y="1" width="218" height="82" rx="8" fill="none" stroke={ink} strokeOpacity="0.22" />
      <rect x="10" y="10" width="70" height="22" rx="3" fill={ink} fillOpacity="0.85" />
      <text x="16" y="25" fontFamily="var(--dt-font-mono)" fontSize="9" fill={accent}>
        OSC 1 · SAW
      </text>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${96 + i * 30} 21)`}>
          <circle r="9" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="1.5" />
          <line x1="0" y1="0" x2={Math.cos(-2 + i * 0.9) * 7} y2={Math.sin(-2 + i * 0.9) * 7} stroke={i === 1 ? accent : ink} strokeWidth="1.75" strokeLinecap="round" />
        </g>
      ))}
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={10 + i * 15.4} y="44" width="13.4" height="30" rx="2" fill={ink} fillOpacity={[1, 3, 6, 8, 10].includes(i) ? 0.75 : 0.1} />
      ))}
    </svg>
  );
}

function Highlight({ sides, show }: { sides: [number, number, number, number]; show: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 border-solid transition-opacity duration-[90ms]", show ? "opacity-100" : "opacity-0")}
      style={{ borderColor: "color-mix(in srgb, var(--dt-pencil) 16%, transparent)", borderWidth: sides.map((s) => `${s}px`).join(" "), borderRadius: "inherit" }}
    />
  );
}

export function PropertyEditorDemo({ compact = false }: { compact?: boolean }) {
  const [c, setC] = useState<Card>(BASE);
  const [target, setTarget] = useState<BoxModelTarget | null>(null);
  const [guides, setGuides] = useState(true);
  const [scrubbing, setScrubbing] = useState<string | null>(null);
  const set = <K extends keyof Card>(k: K) => (v: Card[K]) => setC((p) => ({ ...p, [k]: v }));
  const family = FAMILIES.find((f) => f.value === c.family) ?? FAMILIES[0];
  const ink = inkFor(c.fill);

  const changed = (Object.keys(BASE) as (keyof Card)[]).filter((k) => JSON.stringify(c[k]) !== JSON.stringify(BASE[k]) && k !== "sizeUnit");
  const fontSize = c.sizeUnit === "em" ? `${c.size}em` : `${c.size}px`;
  const cssLines: [string, string, boolean][] = [
    ["background", c.fill.toUpperCase(), changed.includes("fill")],
    ["border-radius", `${c.radius}px`, changed.includes("radius")],
    ["margin", c.box.margin.map((v) => `${v}px`).join(" "), JSON.stringify(c.box.margin) !== JSON.stringify(BASE.box.margin)],
    ["padding", c.box.padding.map((v) => `${v}px`).join(" "), JSON.stringify(c.box.padding) !== JSON.stringify(BASE.box.padding)],
    ["--accent", c.accent.toUpperCase(), changed.includes("accent")],
    ["h1 font", `${c.weight} ${fontSize}/${c.leading} ${family.label}`, ["family", "weight", "size", "leading"].some((k) => changed.includes(k as keyof Card))],
    ["h1 letter-spacing", `${c.tracking}em`, changed.includes("tracking")],
  ];

  const cardStyle: CSSProperties = {
    background: c.fill,
    color: ink,
    borderRadius: c.radius,
    padding: c.box.padding.map((v) => `${v}px`).join(" "),
  };

  const preview = (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5">
      {/* Margin is drawn as the wrapper's padding so it can be highlighted. */}
      <div
        className="relative rounded-[2px] shadow-[inset_0_0_0_1px_var(--dt-hairline)]"
        style={{ padding: c.box.margin.map((v) => `${v}px`).join(" ") }}
      >
        <Highlight sides={c.box.margin} show={guides && target?.box === "margin"} />
        <div className="relative w-[268px] shadow-2" style={cardStyle}>
          <Highlight sides={c.box.padding} show={guides && target?.box === "padding"} />
          <SynthGlyph accent={c.accent} ink={ink} />
          <h1
            className="mt-4"
            style={{ fontFamily: family.css, fontWeight: Number(c.weight), fontSize, lineHeight: c.leading, letterSpacing: `${c.tracking}em` }}
          >
            OS-1
          </h1>
          <p className="mt-1.5 text-sm" style={{ opacity: 0.72 }}>
            Four-voice desktop synthesizer. Learn it in an afternoon.
          </p>
          <div className="mt-4 flex items-center justify-between">
            <span className="font-mono text-sm tabular">€1,290</span>
            <span className="inline-flex h-8 items-center rounded-[6px] px-3 text-sm font-medium" style={{ background: c.accent, color: inkFor(c.accent) }}>
              Pre-order
            </span>
          </div>
        </div>
      </div>
      {!compact && (
        <pre className="w-full max-w-[340px] rounded-md bg-surface px-3 py-2.5 font-mono text-2xs leading-[18px] shadow-[inset_0_0_0_1px_var(--dt-hairline)]" aria-label="Generated CSS">
          {cssLines.map(([k, v, mod]) => (
            <div key={k} className="flex gap-2">
              <span aria-hidden className={cn("mt-[7px] size-1 shrink-0 rounded-full", mod ? "bg-pencil" : "bg-transparent")} />
              <span className="text-muted">{k}:</span>
              <span className={cn("truncate tabular", mod ? "text-pencil-ink" : "text-ink-2")}>{v};</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );

  const editor = (
    <PropertyEditor title="Product card" subtitle="OS-1 / card.tsx">
      <PropertySection title="Appearance">
        <PropertyRow label="Fill">
          <PropertyColor aria-label="Fill" value={c.fill} baseline={BASE.fill} onValueChange={set("fill")} defaultRecents={["#F4F3EF", "#16171A", "#E4DCCB", "#2D54F0"]} />
        </PropertyRow>
        <PropertyRow label="Accent">
          <PropertyColor aria-label="Accent" value={c.accent} baseline={BASE.accent} onValueChange={set("accent")} defaultRecents={["#B84316", "#1D7650", "#2D54F0", "#16171A"]} />
        </PropertyRow>
        <PropertyRow label="Radius">
          <PropertyScrub label="R" aria-label="Corner radius" value={c.radius} baseline={BASE.radius} onValueChange={set("radius")} min={0} max={40} unit="px" onScrubChange={(s) => setScrubbing(s ? "radius" : null)} />
        </PropertyRow>
      </PropertySection>
      <PropertySection title="Typography">
        <PropertySelect
          aria-label="Font family"
          options={FAMILIES.map(({ value, label }) => ({ value, label }))}
          value={c.family}
          baseline={BASE.family}
          onValueChange={set("family")}
          optionStyle={(o) => ({ fontFamily: FAMILIES.find((f) => f.value === o.value)?.css })}
        />
        <PropertySegmented
          aria-label="Font weight"
          options={["400", "500", "600", "700"].map((w) => ({ value: w, label: w, name: `Weight ${w}` }))}
          value={c.weight}
          baseline={BASE.weight}
          onValueChange={set("weight")}
        />
        <div className="grid grid-cols-2 gap-2">
          <PropertyScrub
            label="Size"
            aria-label="Font size"
            value={c.size}
            baseline={BASE.size}
            onValueChange={set("size")}
            min={c.sizeUnit === "em" ? 0.5 : 8}
            max={c.sizeUnit === "em" ? 6 : 96}
            step={c.sizeUnit === "em" ? 0.1 : 1}
            unit={c.sizeUnit}
            units={["px", "em"]}
            onUnitChange={(u) =>
              setC((p) => ({ ...p, sizeUnit: u, size: u === p.sizeUnit ? p.size : u === "em" ? Math.round((p.size / 16) * 10) / 10 : Math.round(p.size * 16) }))
            }
            onScrubChange={(s) => setScrubbing(s ? "size" : null)}
          />
          <PropertyScrub label="Line" aria-label="Line height" value={c.leading} baseline={BASE.leading} onValueChange={set("leading")} min={0.8} max={2.4} step={0.05} tickEvery={0.1} pixelsPerStep={3} />
        </div>
        <PropertyScrub label="Tracking" aria-label="Letter spacing" value={c.tracking} baseline={BASE.tracking} onValueChange={set("tracking")} min={-0.1} max={0.3} step={0.01} unit="em" pixelsPerStep={4} tickEvery={0.02} />
      </PropertySection>
      <PropertySection title="Spacing">
        <PropertyBoxModel value={c.box} baseline={BASE.box} onValueChange={set("box")} max={96} contentLabel="268 × auto" onActiveChange={setTarget} />
      </PropertySection>
    </PropertyEditor>
  );

  if (compact)
    return (
      <div className="flex w-full items-start justify-center gap-6 overflow-hidden">
        {preview}
        <div className="hidden shrink-0 sm:block">{editor}</div>
      </div>
    );

  return (
    <DemoFrame
      stage={
        <Stage minH={720} center={false} tone="sunken" className="flex flex-col items-stretch gap-8 p-6 md:flex-row md:items-start md:justify-center md:p-10">
          {preview}
          <div className="shrink-0 self-center md:self-start">{editor}</div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlCheck label="Show spacing guides in preview" checked={guides} onChange={setGuides} />
          <Readout label="modified">{changed.length}</Readout>
          <Readout label="scrubbing">{scrubbing ?? "—"}</Readout>
          <Readout label="edge">{target ? `${target.box} ${["top", "right", "bottom", "left"][target.side]}` : "—"}</Readout>
        </Controls>
      }
    />
  );
}
