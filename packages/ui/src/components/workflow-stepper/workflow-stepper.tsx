"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { VisuallyHidden, useElapsed } from "../../lib/primitives";
import { cn, fmt, useControllable } from "../../lib/utils";

export type WorkflowStepStatus = "pending" | "active" | "done" | "failed" | "skipped";
/** Effective status after dependency analysis: a pending step downstream of a failure is `blocked`. */
export type WorkflowStepState = WorkflowStepStatus | "blocked";

export interface WorkflowStep {
  id: string;
  /** "Order encoders". */
  title: string;
  /** Optional past-tense title once done: "Ordered encoders". */
  doneTitle?: string;
  /** Workflow variant only. Default "pending". Ignored by the wizard variant. */
  status?: WorkflowStepStatus;
  /** Ids this step waits for. If no step declares dependencies, steps run in sequence. */
  dependsOn?: string[];
  /** Who or what owns the step: "Jun Park", "Scout". */
  owner?: string;
  /** Total time once done (ms). */
  durationMs?: number;
  /** Time spent so far while active (ms). Falls back to a local timer. */
  elapsedMs?: number;
  /** What the step produced, shown in the detail panel. */
  output?: ReactNode;
  /** One-line failure reason. */
  error?: string;
  /** Wizard variant: the step's form/content, shown in the panel. */
  content?: ReactNode;
}

export interface WorkflowStepperProps {
  steps: WorkflowStep[];
  /** `workflow` shows externally driven status with dependency lanes; `wizard` is a linear Next/Back flow. */
  variant?: "workflow" | "wizard";
  /** `auto` switches to a vertical lane graph when columns would be narrower than ~110 px. */
  orientation?: "horizontal" | "vertical" | "auto";
  /** Heading shown above the track. */
  title?: ReactNode;
  /** Selected step (controlled). In the workflow variant, defaults to following the run until the user picks a step. */
  selectedId?: string;
  defaultSelectedId?: string;
  onSelectedChange?: (id: string) => void;
  /** Re-run a failed step. Shows Retry on failure when provided. */
  onRetry?: (id: string) => void;
  /** Wizard: index of the current step (controlled). `steps.length` means finished. */
  current?: number;
  defaultCurrent?: number;
  onCurrentChange?: (index: number) => void;
  /** Wizard: whether Next is allowed for the current step. Default true. */
  canAdvance?: boolean;
  /** Wizard: called when Finish is pressed on the last step. */
  onFinish?: () => void;
  /** Wizard: panel content after finishing. */
  completeContent?: ReactNode;
  /** Allow this instance to play sounds. Default true. */
  sound?: boolean;
  className?: string;
}

/* ── graph ───────────────────────────────────────────────── */

interface Placed {
  step: WorkflowStep;
  index: number;
  deps: string[];
  col: number;
  lane: number;
  lanes: number; // steps in this column
  order: number; // reading order (col, lane)
  state: WorkflowStepState;
}

function buildGraph(steps: WorkflowStep[], statusOf: (s: WorkflowStep, i: number) => WorkflowStepStatus) {
  const ids = new Set(steps.map((s) => s.id));
  const explicit = steps.some((s) => s.dependsOn?.length);
  const deps = new Map(steps.map((s, i) => [s.id, explicit ? (s.dependsOn ?? []).filter((d) => ids.has(d)) : i > 0 ? [steps[i - 1].id] : []]));
  const col = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    if (col.has(id)) return col.get(id)!;
    if (visiting.has(id)) return 0; // cycle guard
    visiting.add(id);
    const d = Math.max(-1, ...deps.get(id)!.map(depth)) + 1;
    visiting.delete(id);
    col.set(id, d);
    return d;
  };
  steps.forEach((s) => depth(s.id));
  const byCol = new Map<number, string[]>();
  steps.forEach((s) => {
    const c = col.get(s.id)!;
    byCol.set(c, [...(byCol.get(c) ?? []), s.id]);
  });
  const base = new Map(steps.map((s, i) => [s.id, statusOf(s, i)]));
  const failedUpstream = new Map<string, boolean>();
  const blocked = (id: string, seen = new Set<string>()): boolean => {
    if (failedUpstream.has(id)) return failedUpstream.get(id)!;
    if (seen.has(id)) return false;
    seen.add(id);
    const r = deps.get(id)!.some((d) => base.get(d) === "failed" || blocked(d, seen));
    failedUpstream.set(id, r);
    return r;
  };
  const placed: Placed[] = steps.map((s, index) => {
    const c = col.get(s.id)!;
    const inCol = byCol.get(c)!;
    const st = base.get(s.id)!;
    return {
      step: s,
      index,
      deps: deps.get(s.id)!,
      col: c,
      lane: inCol.indexOf(s.id),
      lanes: inCol.length,
      order: 0,
      state: st === "pending" && blocked(s.id) ? "blocked" : st,
    };
  });
  [...placed].sort((a, b) => a.col - b.col || a.lane - b.lane).forEach((p, i) => (p.order = i));
  const cols = Math.max(0, ...placed.map((p) => p.col)) + 1;
  const maxLanes = Math.max(1, ...placed.map((p) => p.lanes));
  return { placed, cols, maxLanes, byId: new Map(placed.map((p) => [p.step.id, p])) };
}

/* ── geometry ─────────────────────────────────────────────── */

const H = { pad: 68, lane: 82, top: 16, label: 54, gap: 10 };
const V = { pad: 24, lane: 18, row: 44, top: 22, gap: 9 };

type Geo = {
  orientation: "horizontal" | "vertical";
  width: number;
  height: number;
  labelW: number;
  pos: Map<string, { x: number; y: number }>;
  labelX: number;
};

function layout(g: ReturnType<typeof buildGraph>, width: number, want: "horizontal" | "vertical" | "auto"): Geo {
  const pitch = g.cols > 1 ? (width - 2 * H.pad) / (g.cols - 1) : 0;
  const orientation = want === "auto" ? (g.cols > 1 && pitch < 112 ? "vertical" : "horizontal") : want;
  const pos = new Map<string, { x: number; y: number }>();
  if (orientation === "horizontal") {
    const mid = H.top + ((g.maxLanes - 1) / 2) * H.lane;
    for (const p of g.placed) {
      const x = g.cols > 1 ? H.pad + p.col * pitch : width / 2;
      const y = mid + (p.lane - (p.lanes - 1) / 2) * H.lane;
      pos.set(p.step.id, { x, y });
    }
    return {
      orientation,
      width,
      height: H.top + (g.maxLanes - 1) * H.lane + H.label + 8,
      labelW: Math.max(72, Math.min(g.cols > 1 ? pitch - 14 : 200, 156)),
      pos,
      labelX: 0,
    };
  }
  for (const p of g.placed) pos.set(p.step.id, { x: V.pad + p.lane * V.lane, y: V.top + p.order * V.row });
  return { orientation, width, height: V.top + (g.placed.length - 1) * V.row + V.top, labelW: 0, pos, labelX: V.pad + (g.maxLanes - 1) * V.lane + 18 };
}

function edgePath(geo: Geo, a: { x: number; y: number }, b: { x: number; y: number }, pitch: number) {
  if (geo.orientation === "horizontal") {
    const g = H.gap;
    if (Math.abs(a.y - b.y) < 0.5) return `M${a.x + g} ${a.y}H${b.x - g}`;
    // Travel in the source lane, then change lanes in the gap before the target.
    const xa = Math.max(a.x + g, b.x - pitch + g);
    const xb = b.x - g;
    const mx = (xa + xb) / 2;
    return `M${a.x + g} ${a.y}H${xa}C${mx} ${a.y} ${mx} ${b.y} ${xb} ${b.y}`;
  }
  const g = V.gap;
  if (Math.abs(a.x - b.x) < 0.5) return `M${a.x} ${a.y + g}V${b.y - g}`;
  const c = V.row * 0.72;
  if (b.x > a.x) {
    // Branch out right below the parent, then run down the new lane.
    const y0 = a.y + g;
    return `M${a.x} ${y0}C${a.x} ${y0 + c / 2} ${b.x} ${y0 + c / 2} ${b.x} ${y0 + c}V${b.y - g}`;
  }
  // Merge: run down the parent's lane, fold into the target just above it.
  const y1 = b.y - g;
  return `M${a.x} ${a.y + g}V${y1 - c}C${a.x} ${y1 - c / 2} ${b.x} ${y1 - c / 2} ${b.x} ${y1}`;
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const time = (ms: number) => (ms < 60000 ? fmt.seconds(ms) : fmt.duration(ms));

/* ── component ───────────────────────────────────────────── */

export function WorkflowStepper({
  steps,
  variant = "workflow",
  orientation = "auto",
  title,
  selectedId: selectedProp,
  defaultSelectedId,
  onSelectedChange,
  onRetry,
  current: currentProp,
  defaultCurrent = 0,
  onCurrentChange,
  canAdvance = true,
  onFinish,
  completeContent,
  sound: soundOn = true,
  className,
}: WorkflowStepperProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const uid = useId();
  const wizard = variant === "wizard";
  const [current, setCurrent] = useControllable(currentProp, defaultCurrent, onCurrentChange);
  const [reached, setReached] = useState(current);
  useEffect(() => setReached((r) => Math.max(r, current)), [current]);
  const finished = wizard && current >= steps.length;

  const g = useMemo(
    () =>
      buildGraph(steps, (s, i) =>
        wizard ? (i < current ? "done" : i === current ? "active" : "pending") : s.status ?? "pending",
      ),
    [steps, wizard, current],
  );

  /* width → orientation */
  const trackRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useIsoLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || 640);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const geo = layout(g, width, orientation);
  const pitch = g.cols > 1 ? (width - 2 * H.pad) / (g.cols - 1) : 0;

  /* selection */
  const auto = useMemo(() => {
    const by = [...g.placed].sort((a, b) => a.order - b.order);
    return (
      by.find((p) => p.state === "failed") ??
      [...by].reverse().find((p) => p.state === "active") ??
      [...by].reverse().find((p) => p.state === "done") ??
      by[0]
    )?.step.id;
  }, [g]);
  const [picked, setPicked] = useControllable<string | undefined>(selectedProp, defaultSelectedId, onSelectedChange as (id: string | undefined) => void);
  const selected = wizard ? steps[Math.min(current, steps.length - 1)]?.id : g.byId.has(picked ?? "") ? picked! : auto;
  const sel = selected ? g.byId.get(selected) : undefined;

  // Direction of travel for the panel: by reading order.
  const prevOrder = useRef(sel?.order ?? 0);
  const prevFinished = useRef(finished);
  const dir = (finished && !prevFinished.current) ? 1 : sel ? Math.sign(sel.order - prevOrder.current) || 1 : 1;
  const dirRef = useRef(dir);
  if (sel && (sel.order !== prevOrder.current || finished !== prevFinished.current)) {
    dirRef.current = dir;
    prevOrder.current = sel.order;
    prevFinished.current = finished;
  }

  const canSelect = (p: Placed) => !wizard || p.index <= reached;
  const select = (id: string) => {
    const p = g.byId.get(id);
    if (!p || !canSelect(p)) return;
    if (wizard) setCurrent(p.index);
    else setPicked(id);
  };

  /* keyboard: roving tabs */
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const onTabKey = (e: React.KeyboardEvent, p: Placed) => {
    const list = [...g.placed].sort((a, b) => a.order - b.order).filter(canSelect);
    let next: Placed | undefined;
    const k = e.key;
    if (k === "Home") next = list[0];
    else if (k === "End") next = list.at(-1);
    else if (geo.orientation === "horizontal" && (k === "ArrowRight" || k === "ArrowLeft")) {
      const c = p.col + (k === "ArrowRight" ? 1 : -1);
      const y = geo.pos.get(p.step.id)!.y;
      next = list.filter((q) => q.col === c).sort((a, b) => Math.abs(geo.pos.get(a.step.id)!.y - y) - Math.abs(geo.pos.get(b.step.id)!.y - y))[0];
    } else if (geo.orientation === "horizontal" && (k === "ArrowDown" || k === "ArrowUp")) {
      next = list.find((q) => q.col === p.col && q.lane === p.lane + (k === "ArrowDown" ? 1 : -1));
    } else if (k === "ArrowDown" || k === "ArrowRight") next = list[list.indexOf(p) + 1];
    else if (k === "ArrowUp" || k === "ArrowLeft") next = list[list.indexOf(p) - 1];
    else return;
    e.preventDefault();
    if (!next) return;
    select(next.step.id);
    tabRefs.current.get(next.step.id)?.focus();
  };

  /* announcements */
  const [announce, setAnnounce] = useState("");
  const prevStates = useRef<Map<string, WorkflowStepState> | null>(null);
  useEffect(() => {
    const before = prevStates.current;
    prevStates.current = new Map(g.placed.map((p) => [p.step.id, p.state]));
    if (!before || wizard) return;
    const failed = g.placed.find((p) => p.state === "failed" && before.get(p.step.id) !== "failed");
    if (failed) return setAnnounce(`${failed.step.title} failed${failed.step.error ? `: ${failed.step.error}` : ""}. Dependent steps are blocked.`);
    if (g.placed.every((p) => p.state === "done" || p.state === "skipped") && [...before.values()].some((s) => s !== "done" && s !== "skipped")) setAnnounce("Workflow complete.");
  }, [g, wizard]);

  const counts = {
    done: g.placed.filter((p) => p.state === "done").length,
    active: g.placed.filter((p) => p.state === "active"),
    failed: g.placed.find((p) => p.state === "failed"),
    blocked: g.placed.filter((p) => p.state === "blocked").length,
  };
  const retry = (id: string) => {
    play("tap");
    onRetry?.(id);
  };

  const panelId = `${uid}-panel`;
  const panelKey = finished ? "__finished" : selected ?? "none";

  return (
    <section aria-labelledby={title ? `${uid}-h` : undefined} aria-label={title ? undefined : wizard ? "Steps" : "Workflow"} className={cn("overflow-hidden rounded-lg bg-raised text-base shadow-2", className)}>
      {(title || !wizard) && (
        <header className="flex min-h-12 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pb-2 pt-3.5">
          {title && <h3 id={`${uid}-h`} className="truncate text-base font-medium text-ink">{title}</h3>}
          <p className="tabular ml-auto flex items-baseline gap-1.5 text-sm text-muted">
            {wizard ? (
              <span>Step {Math.min(current + 1, steps.length)} of {steps.length}</span>
            ) : counts.failed ? (
              <>
                <span className="text-err">Stopped at {counts.failed.step.title}</span>
                {counts.blocked > 0 && <span>· {counts.blocked} blocked</span>}
              </>
            ) : (
              <>
                <span>{counts.done} of {steps.length} done</span>
                {counts.active.length > 0 && <span>· {counts.active.length} running</span>}
              </>
            )}
          </p>
        </header>
      )}

      {/* track */}
      <div ref={trackRef} className={cn("relative px-0", wizard && !title ? "pt-4" : "pt-1")}>
        <div
          role="tablist"
          aria-label={wizard ? "Steps" : "Workflow steps"}
          aria-orientation={geo.orientation}
          className="relative"
          style={{ height: geo.height }}
        >
          <svg aria-hidden width={width} height={geo.height} className="pointer-events-none absolute inset-0 overflow-visible">
            {g.placed.flatMap((p) =>
              p.deps.map((d) => {
                const a = g.byId.get(d)!;
                const path = edgePath(geo, geo.pos.get(d)!, geo.pos.get(p.step.id)!, pitch);
                return <Edge key={`${d}>${p.step.id}`} d={path} from={a.state} to={p.state} />;
              }),
            )}
          </svg>
          {g.placed.map((p) => (
            <StepNode
              key={p.step.id}
              p={p}
              geo={geo}
              selected={p.step.id === selected && !finished}
              timed={!wizard}
              disabled={!canSelect(p)}
              panelId={panelId}
              ringId={`${uid}-ring`}
              refCb={(el) => {
                if (el) tabRefs.current.set(p.step.id, el);
                else tabRefs.current.delete(p.step.id);
              }}
              onSelect={() => select(p.step.id)}
              onKeyDown={(e) => onTabKey(e, p)}
            />
          ))}
        </div>
      </div>

      {/* detail */}
      <Panel id={panelId} labelledBy={selected ? `${uid}-tab-${selected}` : undefined} dir={dirRef.current} reduced={m.reduced} panelKey={panelKey}>
        {finished ? (
          <div className="flex items-start gap-3">
            <Icon name="check" size={16} className="mt-0.5 text-ok" />
            <div className="min-w-0 text-sm text-ink-2">{completeContent ?? "All steps complete."}</div>
          </div>
        ) : sel ? (
          <StepDetail
            p={sel}
            g={g}
            wizard={wizard}
            onRetry={onRetry ? retry : undefined}
            onSelect={(id) => {
              select(id);
              tabRefs.current.get(id)?.focus();
            }}
          />
        ) : null}
      </Panel>

      {wizard && (
        <footer className="flex items-center gap-2 px-4 py-3 [box-shadow:inset_0_1px_0_var(--bis-hairline)]">
          {finished ? (
            <button
              type="button"
              onClick={() => { setCurrent(0); setReached(0); }}
              className="focus-ring ml-auto flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-sm text-ink-2 hover:bg-sunken hover:text-ink"
            >
              <Icon name="undo" size={13} />
              Start over
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setCurrent(current - 1)}
                className="focus-ring flex h-7 items-center gap-1 rounded-sm px-2.5 text-sm text-ink-2 hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon name="chevronLeft" size={13} />
                Back
              </button>
              <span className="tabular ml-auto font-mono text-2xs text-muted" aria-hidden>
                {current + 1}/{steps.length}
              </span>
              <button
                type="button"
                aria-disabled={!canAdvance}
                onClick={() => {
                  if (!canAdvance) return;
                  if (current === steps.length - 1) {
                    play("complete");
                    setCurrent(steps.length);
                    onFinish?.();
                  } else {
                    play("tick");
                    setCurrent(current + 1);
                  }
                }}
                className={cn(
                  "focus-ring flex h-7 items-center gap-1 rounded-sm bg-ink px-3 text-sm font-medium text-on-ink transition-[opacity,transform] duration-[90ms] active:translate-y-px",
                  canAdvance ? "hover:opacity-90" : "cursor-not-allowed opacity-40",
                )}
              >
                {current === steps.length - 1 ? "Finish" : "Next"}
                {current < steps.length - 1 && <Icon name="chevronRight" size={13} />}
              </button>
            </>
          )}
        </footer>
      )}
      <VisuallyHidden>
        <span role="status" aria-live="polite">{announce}</span>
      </VisuallyHidden>
    </section>
  );
}

/* ── edge ────────────────────────────────────────────────── */

function Edge({ d, from, to }: { d: string; from: WorkflowStepState; to: WorkflowStepState }) {
  const m = useMotionTokens();
  const blocked = to === "blocked" || from === "failed" || from === "blocked";
  const kind = blocked ? "blocked" : to === "active" ? "live" : to === "done" ? "done" : to === "failed" ? "failed" : to === "skipped" ? "done" : "idle";
  const color = kind === "live" ? "var(--bis-pencil)" : kind === "failed" ? "var(--bis-err)" : "var(--bis-muted)";
  const filled = kind === "live" || kind === "done" || kind === "failed";
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={blocked ? "var(--bis-edge)" : "var(--bis-rule)"} strokeWidth={1.25} strokeDasharray={blocked ? "1.5 4" : undefined} />
      <motion.path
        d={d}
        strokeWidth={1.5}
        initial={false}
        animate={{ pathLength: filled ? 1 : 0, opacity: filled ? 1 : 0, stroke: color }}
        transition={
          m.reduced
            ? { pathLength: { duration: 0 }, opacity: { duration: 0.12 }, stroke: { duration: 0.12 } }
            : {
                pathLength: filled ? { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] } : { duration: 0.2, ease: [0.5, 0, 0.75, 0] },
                opacity: { duration: filled ? 0.05 : 0.2, delay: filled ? 0 : 0.05 },
                stroke: tween.drain,
              }
        }
      />
    </g>
  );
}

/* ── node ────────────────────────────────────────────────── */

const STATE_WORD: Record<WorkflowStepState, string> = { pending: "pending", active: "running", done: "done", failed: "failed", skipped: "skipped", blocked: "blocked" };

function StepNode({
  p,
  geo,
  selected,
  timed,
  disabled,
  panelId,
  ringId,
  refCb,
  onSelect,
  onKeyDown,
}: {
  p: Placed;
  geo: Geo;
  selected: boolean;
  /** Show elapsed/duration (workflow) — wizards aren't timed. */
  timed: boolean;
  disabled: boolean;
  panelId: string;
  ringId: string;
  refCb: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const m = useMotionTokens();
  const { x, y } = geo.pos.get(p.step.id)!;
  const s = p.state;
  const local = useElapsed(timed && s === "active" && p.step.elapsedMs == null, p.step.id);
  const elapsed = p.step.elapsedMs ?? local;
  const titleText = s === "done" ? p.step.doneTitle ?? p.step.title : p.step.title;
  const meta =
    !timed && (s === "active" || s === "done") ? "" : s === "active" ? time(elapsed) : s === "done" ? (p.step.durationMs != null ? time(p.step.durationMs) : "") : s === "failed" ? "failed" : s === "blocked" ? "blocked" : s === "skipped" ? "skipped" : "";
  const horizontal = geo.orientation === "horizontal";
  const tabId = `${ringId.replace(/-ring$/, "")}-tab-${p.step.id}`;

  return (
    <motion.button
      ref={refCb}
      id={tabId}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      aria-disabled={disabled || undefined}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      initial={false}
      animate={horizontal ? { left: x - geo.labelW / 2, top: y - 12 } : { left: x - 12, top: y - 14 }}
      transition={m.move(spring.layout)}
      style={horizontal ? { width: geo.labelW } : { right: 8 }}
      className={cn(
        "focus-ring group absolute rounded-sm text-left outline-none",
        horizontal ? "flex flex-col items-center pb-1" : "flex h-7 items-center",
        disabled ? "cursor-default" : "cursor-pointer",
      )}
    >
      <span className={cn("relative grid size-6 shrink-0 place-items-center")}>
        {selected && (
          <motion.span
            layoutId={ringId}
            transition={m.move(spring.glide)}
            className="absolute inset-[3px] rounded-full shadow-[inset_0_0_0_1.25px_var(--bis-ink)]"
          />
        )}
        {!selected && !disabled && <span className="absolute inset-[3px] rounded-full opacity-0 shadow-[inset_0_0_0_1px_var(--bis-rule)] group-hover:opacity-100" />}
        <NodeMark state={s} />
      </span>
      <span
        className={cn(horizontal ? "mt-0.5 flex w-full flex-col items-center px-1 text-center" : "flex min-w-0 flex-1 items-baseline gap-2 pr-1")}
        style={horizontal ? undefined : { marginLeft: geo.labelX - (x - 12) - 24 }}
      >
        <span
          className={cn(
            "text-sm transition-colors duration-[240ms]",
            horizontal ? "line-clamp-2" : "min-w-0 truncate",
            s === "active" || s === "failed" ? "text-ink" : s === "done" ? "text-ink-2" : "text-muted",
            selected && "text-ink",
            !disabled && "group-hover:text-ink",
          )}
        >
          {titleText}
        </span>
        <span aria-hidden className={cn("tabular font-mono text-2xs", horizontal ? "mt-0.5 min-h-[14px]" : "ml-auto shrink-0", s === "active" ? "text-pencil-ink" : s === "failed" ? "text-err" : "text-muted")}>
          {meta}
        </span>
        <VisuallyHidden>, {STATE_WORD[s]}</VisuallyHidden>
      </span>
    </motion.button>
  );
}

function NodeMark({ state }: { state: WorkflowStepState }) {
  const m = useMotionTokens();
  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        key={state}
        aria-hidden
        initial={{ scale: m.reduced ? 1 : 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.08 } }}
        transition={m.reduced ? { duration: 0.12 } : { scale: state === "done" ? spring.latch : spring.control, opacity: { duration: 0.1 } }}
        className={cn(
          "relative block rounded-full",
          state === "active" && "size-[9px] bg-pencil shadow-[0_0_0_3px_var(--bis-pencil-soft)]",
          state === "done" && "size-[7px] bg-ink-2",
          state === "failed" && "size-[9px] bg-err shadow-[0_0_0_3px_var(--bis-err-soft)]",
          state === "pending" && "size-[7px] shadow-[inset_0_0_0_1.25px_var(--bis-faint)]",
          state === "blocked" && "size-[7px] shadow-[inset_0_0_0_1.25px_var(--bis-edge)]",
          state === "skipped" && "h-px w-[7px] rounded-none bg-faint",
        )}
      >
        {state === "blocked" && <span className="absolute left-1/2 top-1/2 h-px w-[9px] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-edge" />}
      </motion.span>
    </AnimatePresence>
  );
}

/* ── panel ───────────────────────────────────────────────── */

function Panel({ id, labelledBy, dir, reduced, panelKey, children }: { id: string; labelledBy?: string; dir: number; reduced: boolean; panelKey: string; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">("auto");
  useIsoLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const d = reduced ? 0 : 20 * dir;
  return (
    <motion.div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      initial={false}
      animate={{ height: h }}
      transition={reduced ? { duration: 0 } : spring.layout}
      className="relative overflow-hidden bg-surface [box-shadow:inset_0_1px_0_var(--bis-hairline)]"
    >
      <div ref={inner} className="relative">
        <AnimatePresence initial={false} mode="popLayout" custom={d}>
          <motion.div
            key={panelKey}
            custom={d}
            variants={{
              enter: (dd: number) => ({ x: dd, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (dd: number) => ({ x: -dd, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduced ? { duration: 0.12 } : { x: spring.glide, opacity: { duration: 0.16 } }}
            className="px-4 py-3.5"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StepDetail({ p, g, wizard, onRetry, onSelect }: { p: Placed; g: ReturnType<typeof buildGraph>; wizard: boolean; onRetry?: (id: string) => void; onSelect: (id: string) => void }) {
  const s = p.state;
  const step = p.step;
  const local = useElapsed(s === "active" && step.elapsedMs == null, step.id);
  if (wizard) {
    return (
      <div>
        <h4 className="mb-2.5 text-base font-medium text-ink">{step.title}</h4>
        {step.content}
      </div>
    );
  }
  const failedDep = s === "blocked" ? findFailedAncestor(p, g) : undefined;
  const dur = s === "done" ? step.durationMs : s === "active" ? step.elapsedMs ?? local : undefined;
  return (
    <div className="grid gap-3">
      <div className="flex items-baseline gap-2.5">
        <h4 className="min-w-0 truncate text-base font-medium text-ink">{s === "done" ? step.doneTitle ?? step.title : step.title}</h4>
        <span className={cn("font-mono text-2xs", s === "active" ? "text-pencil-ink" : s === "failed" ? "text-err" : "text-muted")}>{STATE_WORD[s]}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm sm:flex sm:flex-wrap sm:gap-x-6">
        <Field label="Owner">
          {step.owner ? (
            <span className="flex items-center gap-1.5 text-ink-2">
              <span aria-hidden className="grid size-[18px] place-items-center rounded-full bg-sunken font-mono text-[9px] text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
                {initials(step.owner)}
              </span>
              {step.owner}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Field>
        <Field label={s === "active" ? "Elapsed" : "Duration"}>
          <span aria-hidden={s === "active" || undefined} className="tabular font-mono text-xs text-ink-2">{dur != null ? time(dur) : "—"}</span>
        </Field>
        <Field label="After">
          {p.deps.length ? (
            <span className="flex flex-wrap gap-1">
              {p.deps.map((d) => {
                const q = g.byId.get(d)!;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onSelect(d)}
                    className={cn(
                      "focus-ring flex h-5 items-center gap-1 rounded-xs px-1.5 text-xs shadow-[inset_0_0_0_1px_var(--bis-hairline)] hover:bg-sunken hover:text-ink",
                      q.state === "failed" ? "text-err" : "text-ink-2",
                    )}
                  >
                    {q.step.title}
                  </button>
                );
              })}
            </span>
          ) : (
            <span className="text-muted">Start</span>
          )}
        </Field>
      </dl>
      {s === "failed" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-err-soft px-3 py-2">
          <Icon name="alert" size={14} className="shrink-0 text-err" />
          <p className="min-w-0 flex-1 text-sm text-err">{step.error ?? "This step failed."}</p>
          {onRetry && (
            <button
              type="button"
              onClick={() => onRetry(step.id)}
              className="focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-sm bg-raised px-2.5 text-sm text-ink shadow-[inset_0_0_0_1px_var(--bis-edge)] transition-transform duration-[90ms] hover:bg-sunken active:translate-y-px"
            >
              <Icon name="refresh" size={13} />
              Retry step
            </button>
          )}
        </div>
      )}
      {s === "blocked" && failedDep && (
        <p className="text-sm text-muted">
          Waiting on{" "}
          <button type="button" onClick={() => onSelect(failedDep.step.id)} className="focus-ring rounded-xs text-ink-2 underline decoration-rule underline-offset-4 hover:text-ink">
            {failedDep.step.title}
          </button>
          , which failed. It will start once that step succeeds.
        </p>
      )}
      {step.output && <div className="text-sm text-ink-2">{step.output}</div>}
      {!step.output && s === "pending" && <p className="text-sm text-muted">Not started. Runs when {p.deps.length > 1 ? "its dependencies finish" : p.deps.length ? "the previous step finishes" : "the workflow starts"}.</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents sm:flex sm:items-baseline sm:gap-2">
      <dt className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function findFailedAncestor(p: Placed, g: ReturnType<typeof buildGraph>): Placed | undefined {
  for (const d of p.deps) {
    const q = g.byId.get(d)!;
    if (q.state === "failed") return q;
    const r = findFailedAncestor(q, g);
    if (r) return r;
  }
  return undefined;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
