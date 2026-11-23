"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Icon, InteractiveSlider, KineticButton, PrecisionToggle, SegmentedControl, SegmentedControlItem, ToolChip, cn, useTextStream,
} from "@biscotti/ui";
import { announceIndexHash } from "@/components/home/index-browser";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Respect reduced motion for the looping previews. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(q.matches);
    set(); q.addEventListener("change", set);
    return () => q.removeEventListener("change", set);
  }, []);
  return reduced;
}

/* ── Tiles ─────────────────────────────────────────────────────────────── */

/** A small tile: a live control at the top, a link with the name and one hint at the bottom. */
function Tile({ slug, name, hint, children }: { slug: string; name: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[132px] min-[480px]:min-h-[172px] min-w-0 flex-col justify-between gap-5 rounded-[14px] border border-hairline bg-raised p-4">
      <div className="min-w-0">{children}</div>
      <Link href={`/components/${slug}`} className="focus-ring group -m-1 flex min-w-0 flex-col gap-0.5 rounded-sm p-1">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold leading-[18px] text-ink">
          {name}
          <Icon name="arrowRight" size={13} className="shrink-0 text-muted transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-ink" />
        </span>
        <span className="text-[13px] leading-4 text-muted">{hint}</span>
      </Link>
    </div>
  );
}

/** A dashed tile that links to the rest of a group in the index below. */
function GroupLink({ group, title, hint }: { group: string; title: string; hint: string }) {
  return (
    <Link
      href={`/#${group}`}
      onClick={() => announceIndexHash(group)}
      className="focus-ring group flex min-h-[132px] min-[480px]:min-h-[172px] min-w-0 flex-col justify-end gap-0.5 rounded-[14px] border border-dashed border-rule p-4 transition-colors duration-[90ms] hover:bg-surface"
    >
      <span className="flex items-center gap-1.5 text-[15px] font-semibold leading-[18px] text-ink">
        {title} <Icon name="arrowRight" size={13} className="shrink-0 transition-transform duration-[120ms] group-hover:translate-x-0.5" />
      </span>
      <span className="text-[13px] leading-4 text-muted">{hint}</span>
    </Link>
  );
}

/** A large tile: label and hint, a live demo in the middle, then the linked name and summary. */
function Lead({ slug, name, summary, hint, tone, labelledBy, children }: {
  slug: string; name: string; summary: string; hint: string; tone: "cream" | "dark"; labelledBy: string; children: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "flex min-h-[300px] min-w-0 flex-col justify-between gap-8 rounded-[18px] p-5 lg:min-h-[360px]",
        dark ? "bg-[var(--showcase-dark-bg)] shadow-[inset_0_0_0_1px_var(--showcase-dark-edge)]" : "bg-[var(--feature-bg)]",
      )}
    >
      <div className={cn("flex items-baseline justify-between gap-4", dark ? "text-[#bdbbb3]" : "text-[var(--feature-label)]")}>
        <p className="text-xs uppercase tracking-[0.08em]">Featured</p>
        <p className="text-right text-[13px]">{hint}</p>
      </div>
      <div className="flex min-w-0 justify-center">{children}</div>
      <Link href={`/components/${slug}`} className="focus-ring group flex items-end justify-between gap-4 rounded-sm">
        <span className="min-w-0">
          <span id={labelledBy} className={cn("block text-[20px] font-semibold leading-6 tracking-[-0.01em]", dark ? "text-white" : "text-[var(--feature-ink)]")}>{name}</span>
          <span className={cn("mt-0.5 block text-sm", dark ? "text-[#bdbbb3]" : "text-[var(--feature-text)]")}>{summary}</span>
        </span>
        <Icon name="arrowRight" size={18} className={cn("mb-0.5 shrink-0 transition-transform duration-[120ms] group-hover:translate-x-0.5", dark ? "text-white" : "text-[var(--feature-ink)]")} />
      </Link>
    </section>
  );
}

/* ── Live compact demos ────────────────────────────────────────────────── */

function SegmentDemo() {
  const [v, setV] = useState("week");
  return (
    <SegmentedControl aria-label="Range" size="sm" value={v} onValueChange={setV}>
      <SegmentedControlItem value="day">Day</SegmentedControlItem>
      <SegmentedControlItem value="week">Week</SegmentedControlItem>
      <SegmentedControlItem value="month">Month</SegmentedControlItem>
    </SegmentedControl>
  );
}

/** A tool call that runs, completes, then repeats. Click the chip to open its detail. */
function ToolChipDemo() {
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<"pending" | "done">("done");
  useEffect(() => {
    if (reduced) return;
    let alive = true;
    const loop = async () => {
      while (alive) {
        setStatus("pending"); await wait(1400); if (!alive) return;
        setStatus("done"); await wait(4200);
      }
    };
    loop();
    return () => { alive = false; };
  }, [reduced]);
  return (
    <ToolChip kind="search" status={status} target="search_docs" results={7} durationMs={240}
      args={{ query: "launch date", path: "docs/" }} output={["docs/launch.md:12  Launch moves to March", "docs/faq.md:4  Pre-orders open in March"]} sound={false} />
  );
}

const STREAM = ["The ", "launch ", "moves ", "to ", "March."];
/** A short answer read through useTextStream, with the pencil caret, then repeated. */
function StreamDemo() {
  const reduced = useReducedMotion();
  const [round, setRound] = useState(0);
  const stream = useTextStream(
    (async function* () { for (const w of STREAM) { await wait(reduced ? 0 : 260); yield w; } })(),
    { key: round, onDone: () => { if (!reduced) setTimeout(() => setRound((r) => r + 1), 3200); } },
  );
  const live = stream.status === "streaming" || stream.status === "idle";
  return (
    <p className="text-[13px] leading-[19px] text-ink" aria-live="off">
      {stream.text || " "}
      <span aria-hidden className={cn("ml-px inline-block h-[13px] w-[2px] translate-y-[2px] bg-pencil", !live && "opacity-0")} />
    </p>
  );
}

/** Three dependent steps that complete in order, then restart. */
function StepsDemo() {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(2);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setDone((d) => (d + 1) % 4), 1100);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <div className="flex gap-1" role="img" aria-label={`${done} of 3 steps complete`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("h-1 w-10 rounded-[2px] transition-colors duration-300", i < done ? "bg-ink" : i === done ? "bg-pencil" : "bg-rule")} />
      ))}
    </div>
  );
}

/** A compact approval: decide, see the receipt, undo. Pinned to the light theme so it reads on the dark tile. */
function ApprovalDemo() {
  const [decision, setDecision] = useState<"approved" | "denied" | null>(null);
  // The control that had focus unmounts on each decision, so hand focus on explicitly
  // (as ApprovalCard does): to Undo after a decision, back to Approve after Undo.
  const approveRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<"undo" | "approve" | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "undo") undoRef.current?.focus();
    else if (target === "approve") approveRef.current?.focus();
  }, [decision]);
  const decide = (d: "approved" | "denied") => { pendingFocus.current = "undo"; setDecision(d); };
  const undo = () => { pendingFocus.current = "approve"; setDecision(null); };
  return (
    <div data-theme="light" className="flex w-full max-w-[300px] flex-col gap-3 rounded-[12px] bg-raised p-4 text-ink shadow-2">
      <p className="text-[15px] font-medium leading-[18px]">Send 3 emails to the beta list?</p>
      {decision ? (
        <div className="flex items-center justify-between gap-3 text-[13px]" role="status">
          <span className="flex items-center gap-1.5 text-ink-2">
            <Icon name={decision === "approved" ? "check" : "x"} size={14} /> {decision === "approved" ? "Approved" : "Denied"} · 3 emails
          </span>
          <button ref={undoRef} type="button" onClick={undo} className="focus-ring rounded-sm px-1.5 py-0.5 text-ink-2 underline-offset-2 hover:text-ink hover:underline">Undo</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <KineticButton ref={approveRef} size="sm" sound={false} onClick={() => decide("approved")}>Approve</KineticButton>
          <KineticButton size="sm" variant="secondary" sound={false} onClick={() => decide("denied")}>Deny</KineticButton>
        </div>
      )}
    </div>
  );
}

/* ── Showcase ──────────────────────────────────────────────────────────── */

/**
 * Two alternating rows: a cream lead (Kinetic Button) with four tactile tiles, then four agent tiles
 * with a dark lead (Human Approval Card). On narrow screens each lead comes first.
 */
export function Showcase() {
  return (
    <div className="border-b border-hairline">
      <div className="grid gap-4 border-t border-hairline py-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-6">
        <Lead slug="kinetic-button" name="Kinetic Button" labelledBy="lead-kinetic-h" tone="cream"
          hint="Hold the red button to delete" summary="Shows pending, success and error states. Supports hold to confirm.">
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            <KineticButton size="lg" icon="check" pendingLabel="Saving" successLabel="Saved" onClick={() => wait(900)}>Save draft</KineticButton>
            <KineticButton size="lg" variant="danger" holdToConfirm={1000} pendingLabel="Deleting" successLabel="Deleted" onClick={() => wait(700)}>Hold to delete</KineticButton>
          </div>
        </Lead>
        <div className="grid gap-4 min-[480px]:grid-cols-2">
          <Tile slug="precision-toggle" name="Precision Toggle" hint="Pending until saved">
            <PrecisionToggle size="sm" labelPosition="end" label={<span className="sr-only">Sync to cloud</span>} onCheckedChange={() => wait(900)} />
          </Tile>
          <Tile slug="segmented-control" name="Segmented Control" hint="Arrow keys select">
            <SegmentDemo />
          </Tile>
          <Tile slug="interactive-slider" name="Interactive Slider" hint="Hold Shift for fine control">
            <InteractiveSlider label={<span className="sr-only">Volume</span>} ruler={false} defaultValue={60} formatValue={(v) => `${Math.round(v)}%`} />
          </Tile>
          <GroupLink group="tactile-controls" title="All tactile controls" hint="Compare the four controls" />
        </div>
      </div>

      <div className="grid gap-4 border-t border-hairline py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-6">
        <div className="order-2 grid gap-4 min-[480px]:grid-cols-2 lg:order-1">
          <Tile slug="tool-chip" name="Tool Execution Chip" hint="One line per tool call">
            <ToolChipDemo />
          </Tile>
          <Tile slug="streaming-response" name="Streaming Response" hint="Renders text while it streams">
            <StreamDemo />
          </Tile>
          <Tile slug="workflow-stepper" name="Workflow Stepper" hint="Runs steps in dependency order">
            <StepsDemo />
          </Tile>
          <GroupLink group="agent-interactions" title="+2 more" hint="Thinking Timeline, Activity Stack" />
        </div>
        <div className="order-1 lg:order-2">
          <Lead slug="approval-card" name="Human Approval Card" labelledBy="lead-approval-h" tone="dark"
            hint="Select Approve or Deny" summary="Asks for approval before an agent acts. You can undo a decision.">
            <ApprovalDemo />
          </Lead>
        </div>
      </div>
    </div>
  );
}
