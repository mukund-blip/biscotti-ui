"use client";
import { useState } from "react";
import { DiffInspector, type DiffHunk, type HunkDecision } from "@detent/ui";
import { launchNotesHunks } from "@/demos/data";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

const codeHunks: DiffHunk[] = [
  {
    id: "c1",
    location: "L18–21",
    lines: [
      { type: "context", text: "export function readEncoder(pin: Pin) {" },
      { type: "del", text: "  const raw = adc.read(pin);" },
      { type: "add", text: "  const raw = debounce(adc.read(pin), 2);" },
      { type: "context", text: "  return quantize(raw, DETENTS);" },
    ],
    rationale: "Beta testers reported double steps on fast turns (ticket #412).",
  },
  {
    id: "c2",
    location: "L40–42",
    lines: [
      { type: "del", text: "const DETENTS = 20;" },
      { type: "add", text: "const DETENTS = 24;" },
    ],
    rationale: "The PEC11R part ordered for the restock has 24 detents per turn.",
  },
];

export function DiffInspectorDemo() {
  const [variant, setVariant] = useState<"prose" | "code">("prose");
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<Record<string, HunkDecision> | null>(null);
  const hunks = variant === "prose" ? launchNotesHunks : codeHunks;
  return (
    <DemoFrame
      stage={
        <Stage tone="sunken" minH={440} className="px-4 py-10 sm:px-10">
          <DiffInspector
            key={variant + run}
            className="w-full max-w-[640px]"
            title={variant === "prose" ? "Launch notes — edits from Scout" : "Encoder debounce — patch from Scout"}
            path={variant === "prose" ? "press/os-1-launch.md" : "firmware/src/input/encoder.ts"}
            hunks={hunks}
            variant={variant}
            onDecisionsChange={() => setResult(null)}
            onResolve={setResult}
          />
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Content" value={variant} options={["prose", "code"] as const} onChange={(v) => { setVariant(v); setResult(null); }} />
          <ControlButton onClick={() => { setRun((r) => r + 1); setResult(null); }}>Reset decisions</ControlButton>
          <Readout label="onResolve">{result ? Object.values(result).map((d) => d[0].toUpperCase()).join(" ") : "—"}</Readout>
        </Controls>
      }
    />
  );
}
