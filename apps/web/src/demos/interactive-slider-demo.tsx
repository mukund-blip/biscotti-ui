"use client";
import { useState } from "react";
import { InteractiveSlider } from "@detent/ui";
import { ControlCheck, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} kHz` : `${Math.round(v)} Hz`);
const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v} ms`);
const db = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} dB`;

export function InteractiveSliderPreview() {
  return (
    <div className="w-[280px]">
      <InteractiveSlider
        label="Resonance"
        defaultValue={35}
        majorStep={25}
        marks={[{ value: 35, label: "Recommended" }]}
        formatValue={(v) => `${v}%`}
      />
    </div>
  );
}

export function InteractiveSliderDemo() {
  const [cutoff, setCutoff] = useState(1200);
  const [disabled, setDisabled] = useState(false);
  const [commit, setCommit] = useState("—");
  return (
    <DemoFrame
      stage={
        <Stage minH={420}>
          <div className="w-full max-w-[440px] rounded-lg bg-raised px-5 pb-4 pt-5 shadow-2">
            <div className="mb-5 flex items-baseline justify-between">
              <h3 className="text-sm font-medium text-ink">OS-1 · Voice 1</h3>
              <span className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">Patch 042 · Glass Choir</span>
            </div>
            <div className="grid gap-6">
              <InteractiveSlider
                label="Filter cutoff"
                scale="log"
                min={20}
                max={20000}
                value={cutoff}
                defaultValue={1200}
                onValueChange={setCutoff}
                onValueCommit={(v) => setCommit(`cutoff ${hz(v)}`)}
                formatValue={hz}
                disabled={disabled}
              />
              <InteractiveSlider
                label="Resonance"
                defaultValue={20}
                majorStep={25}
                marks={[{ value: 35, label: "Recommended" }]}
                formatValue={(v) => `${v}%`}
                onValueCommit={(v) => setCommit(`resonance ${v}%`)}
                disabled={disabled}
              />
              <InteractiveSlider
                label="Drive"
                min={-12}
                max={12}
                step={0.5}
                majorStep={6}
                defaultValue={0}
                snap
                formatValue={db}
                formatTick={(v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0")}
                onValueCommit={(v) => setCommit(`drive ${db(v)}`)}
                disabled={disabled}
              />
              <InteractiveSlider
                label="Release"
                min={0}
                max={2000}
                step={10}
                majorStep={500}
                defaultValue={[120, 900] as [number, number]}
                formatValue={ms}
                formatTick={(v) => (v >= 1000 ? `${v / 1000}s` : `${v}`)}
                thumbLabels={["start", "end"]}
                onValueCommit={(v) => setCommit(`release ${ms(v[0])} – ${ms(v[1])}`)}
                disabled={disabled}
              />
            </div>
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlCheck label="Disabled" checked={disabled} onChange={setDisabled} />
          <Readout label="committed">{commit}</Readout>
          <span className="text-xs text-muted">Shift-drag for fine adjust · double-click a thumb to reset</span>
        </Controls>
      }
    />
  );
}
