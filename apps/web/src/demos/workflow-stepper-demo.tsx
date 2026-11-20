"use client";
import { useMemo, useState } from "react";
import { WorkflowStepper, type WorkflowStep, type WorkflowStepStatus } from "@detent/ui";
import { cn } from "@detent/ui";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ControlCheck, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

/* ── workflow: OS-1 restock, batch 7 ───────────────────────── */

type Run = Record<string, { status: WorkflowStepStatus; startedAt?: number; durationMs?: number; error?: string }>;

const BASE: (Omit<WorkflowStep, "status"> & { work: number })[] = [
  { id: "bom", title: "Finalise BOM", doneTitle: "BOM finalised", owner: "Theo Okafor", work: 1200, output: <p>Rev C locks the PEC11R encoder (24 detents) and the 2.0 mm keybed spacer. 112 line items, $184.20 per unit.</p> },
  { id: "pcb", title: "Order PCBs", doneTitle: "PCBs ordered", owner: "Jun Park", dependsOn: ["bom"], work: 1900, output: <p>JLCPCB order <span className="font-mono text-xs">#JL-88213</span> · 50 boards, 4-layer, ENIG. Arrives in 9 days.</p> },
  { id: "enc", title: "Order encoders", doneTitle: "Encoders ordered", owner: "Scout", dependsOn: ["bom"], work: 2500, output: <p>Mouser PO <span className="font-mono text-xs">4471-0932</span> · 240 × PEC11R-4220F-S0024 at $1.86.</p> },
  { id: "fw", title: "Build firmware 1.4.2", doneTitle: "Firmware 1.4.2 built", owner: "Ines Duarte", dependsOn: ["bom"], work: 1500, output: <p>Signed image <span className="font-mono text-xs">os1-1.4.2.bin</span> (412 KB) with the encoder debounce fix from ticket #412.</p> },
  { id: "asm", title: "Assemble 40 units", doneTitle: "40 units assembled", owner: "Theo Okafor", dependsOn: ["pcb", "enc"], work: 1700, output: <p>40 of 40 units passed first power-on. Two keybeds reseated.</p> },
  { id: "qa", title: "QA & burn-in", doneTitle: "QA passed", owner: "Theo Okafor", dependsOn: ["asm", "fw"], work: 1500, output: <p>24 h burn-in at 35 °C. No encoder skips across 1.2 M simulated turns.</p> },
  { id: "ship", title: "Ship to retailers", doneTitle: "Shipped to retailers", owner: "Jun Park", dependsOn: ["qa"], work: 1100, output: <p>Three pallets booked: Thomann, Perfect Circuit, Juno Records.</p> },
];
const ENC_ERROR = "Mouser rejected the PO: PEC11R-4220F out of stock until 14 May.";
const FAIL_AT = 2100;

/** Builds cues by running a tiny scheduler: a step starts when all its deps are done. */
function cuesFor(fail: boolean, retryAt: number | null): Cue<Run>[] {
  const cues: Cue<Run>[] = [];
  const done = new Map<string, number>();
  const failed = new Set<string>();
  const start = (id: string, at: number) => cues.push({ at, apply: (r) => ({ ...r, [id]: { status: "active", startedAt: at } }) });
  const finish = (id: string, at: number, dur: number) => cues.push({ at, apply: (r) => ({ ...r, [id]: { status: "done", durationMs: dur } }) });
  const startedAt = new Map<string, number>();
  // Resolve in topological order (BASE is already ordered).
  for (const s of BASE) {
    const deps = s.dependsOn ?? [];
    if (deps.some((d) => failed.has(d) || !done.has(d))) continue;
    const at = Math.max(0, ...deps.map((d) => done.get(d)!));
    startedAt.set(s.id, at);
    start(s.id, at);
    if (fail && s.id === "enc") {
      const fAt = at + FAIL_AT;
      cues.push({ at: fAt, apply: (r) => ({ ...r, enc: { status: "failed", error: ENC_ERROR } }), label: "Encoder order fails" });
      if (retryAt == null) { failed.add("enc"); continue; }
      start("enc", retryAt);
      done.set("enc", retryAt + s.work);
      finish("enc", retryAt + s.work, s.work);
      continue;
    }
    done.set(s.id, at + s.work);
    finish(s.id, at + s.work, s.work);
  }
  // A failure can't unstart steps that were already running in other lanes, so recompute nothing else.
  return cues;
}

export function WorkflowStepperDemo({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"workflow" | "wizard">("workflow");
  return mode === "workflow" || compact ? (
    <WorkflowDemo compact={compact} mode={mode} setMode={setMode} />
  ) : (
    <WizardDemo setMode={setMode} />
  );
}

function WorkflowDemo({ compact, mode, setMode }: { compact: boolean; mode: "workflow" | "wizard"; setMode: (m: "workflow" | "wizard") => void }) {
  const [fail, setFail] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<"auto" | "horizontal" | "vertical">("auto");
  const cues = useMemo(() => cuesFor(fail, retryAt), [fail, retryAt]);
  const script = useScript<Run>({}, cues);
  const run = script.state;
  const steps: WorkflowStep[] = BASE.map(({ work: _w, ...s }) => {
    const r = run[s.id];
    const status = r?.status ?? "pending";
    return {
      ...s,
      status,
      elapsedMs: status === "active" && r?.startedAt != null ? Math.max(0, script.t - r.startedAt) : undefined,
      durationMs: r?.durationMs,
      error: r?.error,
      output: status === "done" ? s.output : undefined,
    };
  });

  return (
    <div ref={script.ref}>
      <DemoFrame
        stage={
          <Stage tone="sunken" minH={compact ? 360 : 470} center={false} className="flex justify-center px-4 py-8 sm:px-8">
            <WorkflowStepper
              className="w-full max-w-[760px] self-start"
              title="OS-1 restock · batch 7"
              steps={steps}
              orientation={orientation}
              onRetry={() => {
                setRetryAt(Math.round(script.t));
                script.setPlaying(true);
              }}
            />
          </Stage>
        }
        controls={
          compact ? undefined : (
            <Controls>
              <ControlSegment label="Mode" value={mode} options={["workflow", "wizard"] as const} onChange={setMode} />
              <ControlCheck label="Fail “Order encoders”" checked={fail} onChange={(v) => { setFail(v); setRetryAt(null); script.replay(); }} />
              <ControlSegment label="Layout" value={orientation} options={["auto", "horizontal", "vertical"] as const} onChange={setOrientation} />
              <Readout label="Retried at">{retryAt != null ? `${(retryAt / 1000).toFixed(1)}s` : "—"}</Readout>
            </Controls>
          )
        }
        footer={<ScriptBar script={script} />}
      />
    </div>
  );
}

/* ── wizard: OS-1 pre-order ─────────────────────────────── */

const FINISHES = ["Graphite", "Paper", "Cobalt (limited)"] as const;
const REGIONS = ["EU", "UK", "US", "Japan"] as const;

function Choice<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "focus-ring h-8 rounded-sm px-3 text-sm transition-colors duration-[90ms]",
            value === o ? "bg-raised text-ink shadow-[inset_0_0_0_1.5px_var(--dt-ink)]" : "text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-rule)] hover:bg-sunken hover:text-ink",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function WizardDemo({ setMode }: { setMode: (m: "workflow" | "wizard") => void }) {
  const [current, setCurrent] = useState(0);
  const [finish, setFinish] = useState<(typeof FINISHES)[number] | null>(null);
  const [region, setRegion] = useState<(typeof REGIONS)[number] | null>(null);
  const [owner, setOwner] = useState(false);
  const [email, setEmail] = useState("");
  const price = owner ? 599 : 649;
  const steps: WorkflowStep[] = [
    { id: "finish", title: "Finish", content: <><p className="mb-3 text-sm text-muted">Every OS-1 ships with a matching walnut end-cheek.</p><Choice label="Finish" options={FINISHES} value={finish} onChange={setFinish} /></> },
    { id: "region", title: "Shipping", content: <><p className="mb-3 text-sm text-muted">Batch 7 ships 9–10 weeks after pre-orders close.</p><Choice label="Region" options={REGIONS} value={region} onChange={setRegion} /></> },
    {
      id: "owner",
      title: "OS-0 trade-in",
      content: (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
          <input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} className="mt-0.5 accent-[var(--dt-ink)]" />
          <span>I own an OS-0 <span className="block text-muted">Existing owners pay $599 instead of $649.</span></span>
        </label>
      ),
    },
    {
      id: "confirm",
      title: "Confirm",
      content: (
        <div className="grid gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Finish</dt><dd className="text-ink">{finish}</dd>
            <dt className="text-muted">Ships to</dt><dd className="text-ink">{region}</dd>
            <dt className="text-muted">Price</dt><dd className="tabular font-mono text-ink">${price}</dd>
          </dl>
          <label className="grid gap-1 text-sm text-ink-2">
            Email for the receipt
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="mara@ostra.studio"
              className="focus-ring h-8 max-w-[280px] rounded-md bg-raised px-2.5 text-sm text-ink shadow-[inset_0_0_0_1px_var(--dt-rule)] placeholder:text-muted" />
          </label>
        </div>
      ),
    },
  ];
  const can = [finish != null, region != null, true, /.+@.+\..+/.test(email)][current] ?? true;
  return (
    <DemoFrame
      stage={
        <Stage tone="sunken" minH={470} center={false} className="flex justify-center px-4 py-8 sm:px-8">
          <WorkflowStepper
            variant="wizard"
            className="w-full max-w-[560px] self-start"
            title="Pre-order the OS-1"
            steps={steps}
            current={current}
            onCurrentChange={setCurrent}
            canAdvance={can}
            completeContent={<p>Pre-order placed: <span className="text-ink">{finish} OS-1</span> to {region}, <span className="tabular font-mono">${price}</span>. A receipt is on its way to {email}.</p>}
          />
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Mode" value="wizard" options={["workflow", "wizard"] as const} onChange={setMode} />
          <Readout label="current">{current}</Readout>
          <Readout label="Next allowed">{can ? "yes" : "no"}</Readout>
        </Controls>
      }
    />
  );
}
