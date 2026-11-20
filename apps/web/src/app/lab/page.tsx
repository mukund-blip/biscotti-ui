"use client";
import { DiffInspector, PrecisionToggle, ThinkingTimeline, type TimelineStep } from "@detent/ui";
import { launchNotesHunks } from "@/demos/data";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";

type S = { state: "idle" | "running" | "done"; steps: TimelineStep[] };
const set = (id: string, patch: Partial<TimelineStep>) => (s: S): S => ({ ...s, steps: s.steps.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
const add = (step: TimelineStep) => (s: S): S => ({ ...s, steps: [...s.steps, step] });
const initial: S = { state: "idle", steps: [] };
const cues: Cue<S>[] = [
  { at: 0, apply: (s) => ({ ...s, state: "running" }) },
  { at: 0, apply: add({ id: "a", title: "Reading the OS-1 firmware changelog", doneTitle: "Read the OS-1 firmware changelog", status: "running" }) },
  { at: 1100, apply: set("a", { status: "done", meta: "14 entries", durationMs: 1100 }) },
  { at: 1100, apply: add({ id: "b", title: "Searching supplier lead times", doneTitle: "Searched supplier lead times", status: "running" }) },
  { at: 2600, apply: set("b", { status: "done", meta: "6 sources", durationMs: 1500, detail: <ul className="grid gap-1 font-mono text-xs"><li>mouser.com — 12 wk</li><li>digikey.com — 9 wk</li><li>lcsc.com — 4 wk</li></ul> }) },
  { at: 2600, apply: add({ id: "c", title: "Comparing three encoder quotes", doneTitle: "Compared three encoder quotes", status: "running" }) },
  { at: 3900, apply: set("c", { status: "done", meta: "3 quotes", durationMs: 1300 }) },
  { at: 3900, apply: add({ id: "d", title: "Drafting the restock plan", doneTitle: "Drafted the restock plan", status: "running" }) },
  { at: 5200, apply: set("d", { status: "done", durationMs: 1300 }) },
  { at: 5200, apply: (s) => ({ ...s, state: "done" }) },
];

export default function Lab() {
  const script = useScript(initial, cues);
  return (
    <div className="mx-auto grid max-w-3xl gap-10 px-6 py-16">
      <DiffInspector title="Launch notes — edits from Scout" path="press/os-1-launch.md" hunks={launchNotesHunks} />
      <section ref={script.ref} className="rounded-xl bg-surface shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
        <div className="min-h-[260px] p-8"><div className="max-w-md"><ThinkingTimeline steps={script.state.steps} state={script.state.state} /></div></div>
        <div className="border-t border-hairline px-3 py-2"><ScriptBar script={script} /></div>
      </section>
      <section className="grid gap-5 rounded-xl bg-surface p-8 shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
        <div className="flex items-center gap-6">
          <PrecisionToggle aria-label="small" size="sm" />
          <PrecisionToggle aria-label="medium" defaultChecked />
          <PrecisionToggle aria-label="large" size="lg" />
          <PrecisionToggle aria-label="disabled" disabled defaultChecked />
        </div>
        <PrecisionToggle label="Sync to cloud" description="Provisional until the server confirms (1.2s)." onCheckedChange={() => new Promise((r) => setTimeout(r, 1200))} />
        <PrecisionToggle label="Flaky setting" description="Server rejects this change." onCheckedChange={() => new Promise((_, rej) => setTimeout(rej, 900))} />
      </section>
    </div>
  );
}
