"use client";
import { useState } from "react";
import { SegmentedControl, SegmentedControlItem, SegmentedPanels } from "@detent/ui";
import { ControlCheck, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

const CATS = ["all", "bass", "pads", "leads", "fx"] as const;
type Cat = (typeof CATS)[number];
const PATCHES: Record<Exclude<Cat, "all">, { id: string; name: string; by: string }[]> = {
  bass: [
    { id: "007", name: "Sub Floor", by: "Theo Okafor" },
    { id: "012", name: "Rubber Band", by: "Mara Lind" },
    { id: "019", name: "Night Drive", by: "Ines Duarte" },
  ],
  pads: [
    { id: "042", name: "Glass Choir", by: "Mara Lind" },
    { id: "044", name: "Slow Tide", by: "Ines Duarte" },
    { id: "051", name: "Paper Lanterns", by: "Jun Park" },
  ],
  leads: [
    { id: "066", name: "Copper Wire", by: "Theo Okafor" },
    { id: "071", name: "Signal Flare", by: "Sam Reyes" },
    { id: "078", name: "Tin Whistle", by: "Mara Lind" },
  ],
  fx: [
    { id: "101", name: "Tape Stop", by: "Ines Duarte" },
    { id: "108", name: "Radio Static", by: "Jun Park" },
    { id: "115", name: "Spring Tank", by: "Theo Okafor" },
  ],
};
const COUNTS: Record<Cat, number> = { all: 128, bass: 24, pads: 31, leads: 19, fx: 12 };
const LABEL: Record<Cat, string> = { all: "All", bass: "Bass", pads: "Pads", leads: "Leads", fx: "FX" };

export function SegmentedControlPreview() {
  return (
    <SegmentedControl aria-label="Envelope" defaultValue="filter">
      <SegmentedControlItem value="amp">Amp</SegmentedControlItem>
      <SegmentedControlItem value="filter">Filter</SegmentedControlItem>
      <SegmentedControlItem value="mod">Mod</SegmentedControlItem>
    </SegmentedControl>
  );
}

function PatchList({ cat }: { cat: Cat }) {
  const rows = cat === "all" ? [PATCHES.pads[0], PATCHES.bass[0], PATCHES.leads[1]] : PATCHES[cat];
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((p) => (
        <li key={p.id} className="flex items-baseline gap-3 py-2.5">
          <span className="font-mono text-2xs tabular text-muted">{p.id}</span>
          <span className="text-base text-ink">{p.name}</span>
          <span className="ml-auto text-xs text-muted">{p.by}</span>
        </li>
      ))}
    </ul>
  );
}

export function SegmentedControlDemo() {
  const [cat, setCat] = useState<Cat>("pads");
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [activation, setActivation] = useState<"automatic" | "manual">("automatic");
  const [full, setFull] = useState(true);
  const [view, setView] = useState("list");
  return (
    <DemoFrame
      stage={
        <Stage minH={340}>
          <div className="w-full max-w-[460px] rounded-lg bg-raised p-4 shadow-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="seg-demo-title" className="text-sm font-medium text-ink">OS-1 patch browser</h3>
              <SegmentedControl aria-label="View" size="sm" value={view} onValueChange={setView}>
                <SegmentedControlItem value="list" icon="layers" aria-label="List view" />
                <SegmentedControlItem value="chart" icon="chart" aria-label="Usage chart" />
                <SegmentedControlItem value="tune" icon="sliders" aria-label="Macro view" disabled />
              </SegmentedControl>
            </div>
            <SegmentedControl
              aria-labelledby="seg-demo-title"
              size={size}
              fullWidth={full}
              activation={activation}
              value={cat}
              onValueChange={(v) => setCat(v as Cat)}
              name="category"
            >
              {CATS.map((c) => (
                <SegmentedControlItem key={c} value={c} count={COUNTS[c]}>
                  {LABEL[c]}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <SegmentedPanels value={cat} order={CATS} className="mt-2 min-h-[130px]">
              {(v) => <PatchList cat={v as Cat} />}
            </SegmentedPanels>
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Size" value={size} options={["sm", "md", "lg"] as const} onChange={setSize} />
          <ControlSegment label="Keys" value={activation} options={["automatic", "manual"] as const} onChange={setActivation} />
          <ControlCheck label="Full width" checked={full} onChange={setFull} />
          <Readout label="value">{cat}</Readout>
        </Controls>
      }
    />
  );
}
