"use client";

/**
 * Scout's thread in the workbench: composer → tool calls → a real network stream (/api/stream)
 * → a human approval for the purchase order it recommends.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  ApprovalCard,
  ToolChip,
  ToolChipGroup,
  type ToolChipProps,
  PromptComposer,
  StreamingResponse,
  toast,
  useTextStream,
  type MentionItem,
} from "@detent/ui";
import { scoutSources, scoutSuggestions } from "@/demos/streaming-response-data";

export interface ScoutHandle {
  /** Ask Scout a question (as if it were typed and sent). */
  ask: (question: string) => void;
  /** Move focus to the prompt. */
  focus: () => void;
}

export interface PurchaseOrder {
  id: string;
  units: number;
}

type Phase = "idle" | "tools" | "streaming" | "answered" | "stopped" | "error";
type Turn = { id: number; question: string };

/** The tool calls Scout makes before answering, with their durations (ms). */
const TOOL_PLAN: (ToolChipProps & { id: string; ms: number })[] = [
  { id: "plan", ms: 700, kind: "read", target: "ops/production-plan-q1.md", lines: [1, 64], durationMs: 640, output: ["Run A: 600 units, mid-March.", "Run B: 600 units, early April.", "Same encoder BOM for both."] },
  { id: "search", ms: 1100, kind: "search", target: "PEC11R-4220F lead time", results: 3, durationMs: 1040, args: { suppliers: "digikey, mouser, lcsc" } },
  { id: "fetch", ms: 800, kind: "fetch", target: "digikey.com/product/PEC11R-4220F-S0024", httpStatus: 200, durationMs: 760, output: "Factory lead time 9 weeks. Non-cancellable once scheduled." },
];

const PO: PurchaseOrder & { supplier: string; amount: string } = { id: "po-0419", units: 1200, supplier: "Digi-Key", amount: "$2,208.00" };

export function ScoutThread({ ref, mentions, onApproved }: { ref?: Ref<ScoutHandle>; mentions: MentionItem[]; onApproved: (po: PurchaseOrder) => void }) {
  const [turn, setTurn] = useState<Turn | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [toolsDone, setToolsDone] = useState(0);
  /** The network stream only starts once the tool calls finish (and never if Stop came first). */
  const [streamed, setStreamed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const turnId = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const stream = useTextStream(
    turn && streamed ? (signal: AbortSignal) => fetch("/api/stream?speed=1.5", { signal }) : null,
    { key: turn?.id },
  );

  useEffect(() => {
    if (phase !== "streaming") return;
    if (stream.status === "done") setPhase("answered");
    else if (stream.status === "error") setPhase("error");
  }, [phase, stream.status]);

  const ask = useCallback((question: string) => {
    clearTimers();
    const id = ++turnId.current;
    setTurn({ id, question });
    setToolsDone(0);
    setStreamed(false);
    setPhase("tools");
    let at = 0;
    TOOL_PLAN.forEach((tool, i) => {
      at += tool.ms;
      timers.current.push(window.setTimeout(() => setToolsDone(i + 1), at));
    });
    timers.current.push(window.setTimeout(() => { setStreamed(true); setPhase("streaming"); }, at + 200));
    root.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    stream.stop();
    setPhase("stopped");
  }, [stream]);

  const focus = useCallback(() => {
    const el = root.current?.querySelector<HTMLElement>('[contenteditable="true"], textarea');
    root.current?.scrollIntoView({ block: "nearest" });
    el?.focus();
  }, []);

  useImperativeHandle(ref, () => ({ ask, focus }), [ask, focus]);

  const generating = phase === "tools" || phase === "streaming";

  return (
    <div ref={root} className="flex flex-col gap-4">
      {turn && (
        <div className="flex flex-col gap-4">
          <div className="ml-8 rounded-md bg-sunken px-3 py-2.5 text-base leading-[21px] text-ink shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
            <span className="sr-only">You asked: </span>{turn.question}
          </div>

          <ToolChipGroup>
            {TOOL_PLAN.slice(0, Math.min(TOOL_PLAN.length, toolsDone + (phase === "tools" ? 1 : 0))).map(({ id, ms: _ms, ...call }, i) => (
              <ToolChip key={id} {...call} {...(i < toolsDone ? { status: "done" as const } : phase === "tools" ? { status: "pending" as const } : { status: "error" as const, error: "Stopped before it finished." })} />
            ))}
          </ToolChipGroup>

          {streamed && (
            <StreamingResponse
              stream={stream}
              onStop={stop}
              onRegenerate={() => turn && ask(turn.question)}
              sources={scoutSources}
              suggestions={scoutSuggestions}
              onSuggestion={(s) => ask(s)}
              maxHeight={440}
              label="Scout’s answer"
            />
          )}

          {phase === "answered" && (
            <ApprovalCard
              key={turn.id}
              action={<>Place a {PO.supplier} order for {PO.units.toLocaleString("en")} PEC11R encoders.</>}
              summary={`${PO.supplier} PO · ${PO.amount}`}
              risk="high"
              scope={[{ value: PO.amount, label: "total" }, { value: PO.units.toLocaleString("en"), label: "units" }, { value: "9 wk", label: "lead time" }]}
              previewLabel="Purchase order"
              preview={<PoPreview />}
              rationale="Digi-Key is the only quote that keeps the March pre-order date; the order covers production runs A and B."
              reviewer="Mara Lind"
              onCommit={(d) => {
                if (d.outcome !== "approved") return;
                onApproved(PO);
                toast.success("Purchase order sent", { description: `${PO.supplier} · ${PO.amount} · PO-0419` });
              }}
            />
          )}
        </div>
      )}

      <PromptComposer
        aria-label="Message Scout"
        placeholder="Ask Scout about orders, suppliers or firmware…"
        defaultValue={{ text: "We're short on encoders for the OS-1 restock. Which supplier should we order from?", tokens: [] }}
        mentions={mentions}
        generating={generating}
        onStop={stop}
        onSubmit={(submission) => ask(submission.draft.text.trim() || "Which supplier should we order from?")}
      />
    </div>
  );
}

const PO_LINES = [
  ["PEC11R-4220F-S0024", "1,200", "$1.84", "$2,208.00"],
] as const;

function PoPreview() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex justify-between gap-3 text-muted"><span>Digi-Key · Net 30</span><span className="font-mono tabular text-2xs">PO-0419</span></div>
      <table className="w-full text-left">
        <thead className="text-2xs text-muted"><tr><th className="py-1 font-normal">Part</th><th className="py-1 text-right font-normal">Qty</th><th className="py-1 text-right font-normal">Unit</th><th className="py-1 text-right font-normal">Total</th></tr></thead>
        <tbody>
          {PO_LINES.map(([part, qty, unit, total]) => (
            <tr key={part} className="border-t border-hairline font-mono tabular text-xs">
              <td className="py-1.5">{part}</td><td className="py-1.5 text-right">{qty}</td><td className="py-1.5 text-right">{unit}</td><td className="py-1.5 text-right">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted">Ship to Ostra Studio, Lisbon. Non-cancellable once scheduled.</p>
    </div>
  );
}
