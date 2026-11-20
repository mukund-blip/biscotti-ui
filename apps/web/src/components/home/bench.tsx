"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon, KineticButton, PrecisionToggle, SegmentedControl, SegmentedControlItem } from "@detent/ui";

/** A working instrument: local adjustments stay in pencil until saved. */
export function HeroBench() {
  const [mode, setMode] = useState("filter");
  const [enabled, setEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <div className="hero-instrument w-full max-w-[480px]">
      <div className="mb-3 flex items-center justify-between font-mono text-2xs uppercase tracking-[0.08em] text-muted">
        <span>01 / An interface you can feel</span><Icon name="sliders" size={14} />
      </div>
      <div className="overflow-hidden rounded-xl border border-rule bg-raised shadow-3">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-md border border-hairline bg-surface"><Icon name="activity" size={15} /></span><span className="text-sm font-medium">Studio / OS-1</span></div>
          <span className="font-mono text-2xs text-muted">PATCH 014</span>
        </div>
        <div className="px-5 pb-5 pt-6 sm:px-7 sm:pb-7">
          <div className="flex items-baseline justify-between"><h2 className="text-[24px] font-medium tracking-[-0.03em]">Shape the signal.</h2><span className="font-mono text-2xs text-muted">120 BPM</span></div>
          <div className="instrument-wave my-5 overflow-hidden rounded-md border border-hairline bg-paper px-4 py-3" aria-hidden>
            <svg viewBox="0 0 360 76" className="h-[76px] w-full" fill="none">
              <path d="M0 38h360M0 14h360M0 62h360" stroke="var(--dt-hairline)" />
              {Array.from({ length: 45 }, (_, i) => { const h = enabled ? 8 + Math.abs(Math.sin(i * (mode === "filter" ? 0.41 : mode === "amp" ? 0.22 : 0.67))) * 48 : 2; return <path key={i} d={`M${i * 8 + 4} ${38 - h / 2}v${h}`} stroke={dirty ? "var(--dt-pencil)" : "var(--dt-ink)"} strokeWidth="2" strokeLinecap="round" />; })}
            </svg>
          </div>
          <SegmentedControl aria-label="Signal envelope" value={mode} onValueChange={(v) => { setMode(v); setDirty(true); setSaved(false); }}>
            <SegmentedControlItem value="amp">Amplitude</SegmentedControlItem><SegmentedControlItem value="filter">Filter</SegmentedControlItem><SegmentedControlItem value="mod">Modulation</SegmentedControlItem>
          </SegmentedControl>
          <div className="my-6 border-y border-hairline py-4"><PrecisionToggle label="Arpeggiator" description="A little movement. A precise response." checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); setSaved(false); }} /></div>
          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className={`flex items-center gap-2 text-xs ${dirty ? "text-pencil-ink" : "text-muted"}`}><Icon name={dirty ? "pencil" : "check"} size={13} />{dirty ? "Pencil · unsaved changes" : saved ? "Ink · patch saved" : "Ink · all changes saved"}</p>
            <KineticButton icon="check" onClick={async () => { await new Promise((r) => setTimeout(r, 650)); setDirty(false); setSaved(true); }}>Save patch</KineticButton>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4 text-xs text-muted"><span>Try a control. Feel it settle.</span><Link className="focus-ring inline-flex items-center gap-1.5 rounded-sm hover:text-ink" href="/components/precision-toggle">Explore the toggle <Icon name="arrowRight" size={13} /></Link></div>
    </div>
  );
}
