"use client";
import { useState } from "react";
import { ThinkingTimeline, type TimelineStep } from "@biscotti/ui";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ControlCheck, ControlSegment, Controls, DemoFrame, Stage } from "@/components/demo-kit";

type S = { state: "idle" | "running" | "done" | "error"; steps: TimelineStep[]; startedAt: number; endedAt?: number };
const set = (id: string, patch: Partial<TimelineStep>) => (s: S): S => ({ ...s, steps: s.steps.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
const add = (step: TimelineStep) => (s: S): S => ({ ...s, steps: [...s.steps, step] });
const initial: S = { state: "idle", steps: [], startedAt: 0 };

const sources = (
  <ul className="grid gap-1">
    {[["mouser.com", "PEC11R encoder", "12 wk"], ["digikey.com", "PEC11R encoder", "9 wk"], ["lcsc.com", "EC11E clone", "4 wk"]].map(([d, p, w]) => (
      <li key={d} className="flex items-baseline gap-2">
        <span className="font-mono text-2xs text-muted">{d}</span>
        <span className="text-ink-2">{p}</span>
        <span className="tabular ml-auto font-mono text-2xs text-ink-2">{w}</span>
      </li>
    ))}
  </ul>
);

function cuesFor(outcome: "success" | "error"): Cue<S>[] {
  const base: Cue<S>[] = [
    { at: 0, apply: (s) => ({ ...s, state: "running", startedAt: 0 }) },
    { at: 0, apply: add({ id: "a", title: "Reading the OS-1 firmware changelog", doneTitle: "Read the OS-1 firmware changelog", status: "running" }) },
    { at: 1100, apply: set("a", { status: "done", meta: "14 entries", durationMs: 1100 }) },
    { at: 1100, apply: add({ id: "b", title: "Searching supplier lead times", doneTitle: "Searched supplier lead times", status: "running" }) },
    { at: 2600, apply: set("b", { status: "done", meta: "3 sources", durationMs: 1500, detail: sources }) },
    { at: 2600, apply: add({ id: "c", title: "Comparing encoder quotes", doneTitle: "Compared encoder quotes", status: "running" }) },
  ];
  if (outcome === "error")
    return [
      ...base,
      { at: 3900, apply: set("c", { status: "error", meta: "quote expired" }) },
      { at: 3900, apply: (s) => ({ ...s, state: "error", endedAt: 3900 }) },
    ];
  return [
    ...base,
    { at: 3900, apply: set("c", { status: "done", meta: "3 quotes", durationMs: 1300 }) },
    { at: 3900, apply: add({ id: "d", title: "Drafting the restock plan", doneTitle: "Drafted the restock plan", status: "running" }) },
    { at: 5200, apply: set("d", { status: "done", durationMs: 1300 }) },
    { at: 5200, apply: (s) => ({ ...s, state: "done", endedAt: 5200 }) },
  ];
}

export function ThinkingTimelineDemo({ compact = false }: { compact?: boolean }) {
  const [outcome, setOutcome] = useState<"success" | "error">("success");
  const [autoCollapse, setAutoCollapse] = useState(true);
  const script = useScript(initial, cuesFor(outcome));
  const { state } = script;
  const elapsed = state.state === "running" ? script.t - state.startedAt : (state.endedAt ?? 0) - state.startedAt;
  return (
    <div ref={script.ref} className="flex w-full flex-1 flex-col self-stretch">
      <DemoFrame
        stage={
          <Stage minH={compact ? 220 : 300} center={false} className="px-6 py-8 sm:px-10">
            <div className="w-full max-w-[460px]">
              <ThinkingTimeline key={outcome + String(autoCollapse)} steps={state.steps} state={state.state} elapsedMs={elapsed} autoCollapse={autoCollapse} />
            </div>
          </Stage>
        }
        controls={
          compact ? undefined : (
            <Controls>
              <ControlSegment label="Outcome" value={outcome} options={["success", "error"] as const} onChange={(v) => { setOutcome(v); script.replay(); }} />
              <ControlCheck label="Auto-collapse when done" checked={autoCollapse} onChange={setAutoCollapse} />
            </Controls>
          )
        }
        footer={<ScriptBar script={script} />}
      />
    </div>
  );
}
