"use client";
import { useMemo, useState } from "react";
import { ActivityStack, type ActivityTask } from "@biscotti/ui";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

/**
 * A tiny deterministic scheduler: state(t) = simulate(jobs, userEvents ≤ t).
 * The script drives the clock; Pause / Resume / Cancel / Retry are recorded as
 * timestamped events, so they survive scrubbing and replay exactly.
 */
interface Job {
  id: string;
  title: string;
  doneTitle: string;
  meta?: string;
  arrive: number;
  work: number;
  /** Fails after this much work on the first attempt. */
  failAt?: number;
  error?: string;
  indeterminate?: boolean;
}
type Act = { at: number; id: string; kind: "pause" | "resume" | "cancel" | "retry" };

const JOBS: Job[] = [
  { id: "cl", title: "Indexing the firmware changelog", doneTitle: "Indexed the firmware changelog", meta: "1.4.2", arrive: -9000, work: 2100 },
  { id: "ex", title: "Exporting March sales", doneTitle: "Exported March sales", meta: "38 retailers", arrive: -6000, work: 3400 },
  { id: "pay", title: "Reconciling pre-order payments", doneTitle: "Reconciled pre-order payments", meta: "412 orders", arrive: 0, work: 6400 },
  { id: "notes", title: "Drafting OS-1 launch notes", doneTitle: "Drafted OS-1 launch notes", meta: "press/os-1-launch.md", arrive: 0, work: 3600 },
  { id: "enc", title: "Checking encoder stock", doneTitle: "Checked encoder stock", meta: "3 suppliers", arrive: 200, work: 4200, failAt: 2300, error: "Mouser API timed out after 30s (504)" },
  { id: "tix", title: "Triaging support tickets", doneTitle: "Triaged support tickets", meta: "18 open", arrive: 400, work: 2800 },
  { id: "de", title: "Translating the manual to German", doneTitle: "Translated the manual to German", meta: "64 pages", arrive: 1200, work: 5200, indeterminate: true },
  { id: "beta", title: "Summarising beta feedback", doneTitle: "Summarised beta feedback", meta: "27 testers", arrive: 2600, work: 2400 },
];
const SLOTS = 4;
const DT = 50;

function simulate(t: number, acts: Act[]): ActivityTask[] {
  type R = { job: Job; status: ActivityTask["status"]; worked: number; attempts: number };
  const rs: R[] = JOBS.map((job) => ({ job, status: "queued", worked: 0, attempts: 0 }));
  // Pre-history: jobs that arrived before t=0 are already complete.
  for (const r of rs) if (r.job.arrive < 0) { r.status = "completed"; r.worked = r.job.work; }
  const events = acts.filter((a) => a.at <= t);
  let ei = 0;
  for (let now = 0; now <= t; now += DT) {
    while (ei < events.length && events[ei].at <= now) {
      const e = events[ei++];
      const r = rs.find((x) => x.job.id === e.id)!;
      if (e.kind === "pause" && r.status === "running") r.status = "paused";
      else if (e.kind === "resume" && r.status === "paused") r.status = "running";
      else if (e.kind === "cancel" && r.status !== "completed") r.status = "cancelled";
      else if (e.kind === "retry" && r.status === "failed") { r.status = "running"; r.worked = 0; r.attempts++; }
    }
    // Slots are held by running, paused and failed tasks (a failure waits for a decision).
    let held = rs.filter((r) => r.status === "running" || r.status === "paused" || r.status === "failed").length;
    for (const r of rs) {
      if (r.status === "queued" && r.job.arrive <= now && held < SLOTS) { r.status = "running"; held++; }
    }
    if (now === t) break;
    for (const r of rs) {
      if (r.status !== "running") continue;
      r.worked += DT;
      if (r.job.failAt != null && r.attempts === 0 && r.worked >= r.job.failAt) r.status = "failed";
      else if (r.worked >= r.job.work) { r.status = "completed"; r.worked = r.job.work; }
    }
  }
  return rs
    .filter((r) => r.job.arrive <= t)
    .map(({ job, status, worked }) => ({
      id: job.id,
      title: job.title,
      doneTitle: job.doneTitle,
      meta: job.meta,
      status,
      progress: job.indeterminate ? undefined : worked / job.work,
      elapsedMs: worked,
      error: status === "failed" ? job.error : undefined,
    }));
}

const arrivals: Cue<null>[] = JOBS.filter((j) => j.arrive >= 0).map((j) => ({ at: j.arrive, apply: (s) => s, label: j.title }));

export function ActivityStackDemo({ compact = false }: { compact?: boolean }) {
  const [acts, setActs] = useState<Act[]>([]);
  const [deck, setDeck] = useState<"closed" | "open">("closed");
  const [opened, setOpened] = useState<string | null>(null);
  const lastAct = acts.at(-1)?.at ?? 0;
  const script = useScript<null>(null, arrivals, { duration: Math.max(14000, lastAct + 7000) });
  const t = script.t;
  const tasks = useMemo(() => simulate(Math.round(t / DT) * DT, acts), [t, acts]);

  const record = (kind: Act["kind"], id: string) => {
    const at = Math.round(t / DT) * DT;
    // Acting after scrubbing back rewrites the future.
    setActs((a) => [...a.filter((x) => x.at <= at), { at, id, kind }]);
    if (!script.playing && t < script.duration) script.setPlaying(true);
  };

  return (
    <div ref={script.ref}>
      <DemoFrame
        stage={
          <Stage tone="sunken" minH={compact ? 380 : 470} center={false} className="flex justify-center px-4 py-8 sm:px-10">
            <ActivityStack
              className="w-full max-w-[560px] self-start"
              title="Scout · background work"
              capacity={SLOTS}
              tasks={tasks}
              deckOpen={deck === "open"}
              onDeckOpenChange={(o) => setDeck(o ? "open" : "closed")}
              onPause={(id) => record("pause", id)}
              onResume={(id) => record("resume", id)}
              onCancel={(id) => record("cancel", id)}
              onRetry={(id) => record("retry", id)}
              onOpen={(id) => setOpened(JOBS.find((j) => j.id === id)?.title ?? id)}
            />
          </Stage>
        }
        controls={
          compact ? undefined : (
            <Controls>
              <ControlSegment label="Deck" value={deck} options={["closed", "open"] as const} onChange={setDeck} />
              <ControlButton onClick={() => { setActs([]); setOpened(null); script.replay(); }}>Reset run</ControlButton>
              <Readout label="Actions">{acts.length || "—"}</Readout>
              <Readout label="onOpen">{opened ?? "—"}</Readout>
            </Controls>
          )
        }
        footer={<ScriptBar script={script} />}
      />
    </div>
  );
}
