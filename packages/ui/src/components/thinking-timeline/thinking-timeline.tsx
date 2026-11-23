"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { Icon } from "../../icons";
import { Spinner, VisuallyHidden, useElapsed } from "../../lib/primitives";
import { cn, fmt, useControllable } from "../../lib/utils";

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface TimelineStep {
  id: string;
  /** Present-progressive while running ("Reading 4 files"), past tense optional via `doneTitle`. */
  title: string;
  doneTitle?: string;
  status: StepStatus;
  /** Short mono metadata, e.g. "6 sources" or "+42 −3". */
  meta?: string;
  /** Duration in ms, shown once done. */
  durationMs?: number;
  /** Optional disclosure content: sources, snippets, summaries. */
  detail?: ReactNode;
}

export interface ThinkingTimelineProps {
  steps: TimelineStep[];
  /** Overall run state. `running` shows the live header; `done`/`error` the past-tense summary. */
  state: "idle" | "running" | "done" | "error" | "stopped";
  /** Label while running. Defaults to the running step's title. */
  label?: string;
  /** Past-tense label. Default: "Worked for {duration}". */
  doneLabel?: (elapsedMs: number, steps: TimelineStep[]) => string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Collapse automatically on completion unless the user has toggled it. Default true. */
  autoCollapse?: boolean;
  /** Elapsed ms supplied externally (e.g. from server timestamps). Falls back to a local timer. */
  elapsedMs?: number;
  /** Identifies a run; changing it resets the local clock and the user's open/closed override. */
  runId?: string;
  sound?: boolean;
  className?: string;
}

export function ThinkingTimeline({
  steps,
  state,
  label,
  doneLabel = (ms) => `Worked for ${ms < 60000 ? fmt.seconds(ms) : fmt.duration(ms)}`,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  autoCollapse = true,
  elapsedMs,
  runId,
  sound: _sound = true,
  className,
}: ThinkingTimelineProps) {
  const m = useMotionTokens();
  const bodyId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const userTouched = useRef(false);
  const run = runId ?? steps[0]?.id;
  const localElapsed = useElapsed(state === "running", run);
  const elapsed = elapsedMs ?? localElapsed;
  const running = state === "running";
  const active = steps.find((s) => s.status === "running");
  const doneCount = steps.filter((s) => s.status === "done").length;

  // Auto-open while running, auto-collapse on completion — unless the user took control.
  const prevState = useRef(state);
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = state;
    if (userTouched.current) return;
    if (state === "running" && prev !== "running") setOpen(true);
    if (autoCollapse && prev === "running" && state === "done") {
      // Hold long enough to read "done", and never collapse under the user's focus.
      const t = window.setTimeout(() => {
        if (rootRef.current?.contains(document.activeElement) && document.activeElement !== rootRef.current.querySelector("button")) return;
        setOpen(false);
      }, 450);
      return () => window.clearTimeout(t);
    }
  }, [state, autoCollapse, setOpen]);
  useEffect(() => {
    userTouched.current = false;
  }, [run]);

  const position = steps.findIndex((s) => s.status === "running") + 1;
  // Expanded: the running row names the step, so the header summarises. Collapsed: the header names it.
  const headerText = running
    ? open
      ? `${label ?? "Working"}${position ? ` · step ${position} of ${steps.length}` : ""}`
      : label ?? active?.title ?? "Working"
    : state === "done"
      ? doneLabel(elapsed, steps)
      : state === "error"
        ? "Stopped on an error"
        : state === "stopped"
          ? `Stopped after ${fmt.duration(elapsed)}`
          : label ?? "Ready";

  // Announce meaningful transitions only.
  const announcement = useMemo(() => {
    if (state === "done") return `${headerText}. ${doneCount} steps completed.`;
    if (state === "error") return "The run stopped on an error.";
    if (active) return active.title;
    return "";
  }, [state, active, headerText, doneCount]);

  // index of the furthest reached step (for the pencil portion of the rail)
  const reached = steps.reduce((acc, s, i) => (s.status !== "pending" ? i : acc), -1);

  return (
    <div ref={rootRef} className={cn("w-full text-base", className)} data-state={state}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          userTouched.current = true;
          setOpen(!open);
        }}
        className="focus-ring group -mx-1.5 flex max-w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left"
      >
        <span className="relative grid size-4 shrink-0 place-items-center">
          {running && !open ? (
            <Spinner size={13} />
          ) : running ? (
            <span className="size-[7px] rounded-full bg-pencil" />
          ) : state === "error" ? (
            <Icon name="alert" size={14} className="text-err" />
          ) : (
            <Icon name="check" size={14} className={state === "done" ? "text-ink-2" : "text-faint"} />
          )}
        </span>
        <span className="sr-only">{headerText}</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            aria-hidden
            key={running ? (open ? "run-open" : `run-${active?.id ?? "x"}`) : state}
            initial={{ opacity: 0, y: m.reduced ? 0 : 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: m.reduced ? 0 : -3 }}
            transition={m.fade({ duration: 0.15, ease: [0.2, 0.8, 0.2, 1] })}
            className={cn("truncate", running ? "text-ink" : "text-ink-2 group-hover:text-ink")}
          >
            {headerText}
          </motion.span>
        </AnimatePresence>
        <span aria-hidden className={cn("tabular shrink-0 font-mono text-2xs text-muted", running && "min-w-[5ch]")}>
          {running ? fmt.seconds(elapsed) : state === "done" ? `${doneCount} steps` : ""}
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={m.move(spring.control)}
          className="grid size-4 shrink-0 place-items-center text-muted group-hover:text-ink"
        >
          <Icon name="chevronDown" size={12} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && steps.length > 0 && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={m.reduced ? { height: { duration: 0 }, opacity: { duration: 0.12 } } : { height: spring.layout, opacity: { duration: 0.16 } }}
            className="overflow-hidden"
          >
            <ol className="relative mt-1.5 pb-1 pl-[7px]">
              {steps.map((s, i) => (
                <StepRow key={s.id} step={s} index={i} last={i === steps.length - 1} pencil={i < reached && running} runDone={!running} />
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {announcement}
        </span>
      </VisuallyHidden>
    </div>
  );
}

function StepRow({ step, last, pencil }: { step: TimelineStep; index: number; last: boolean; pencil: boolean; runDone: boolean }) {
  const m = useMotionTokens();
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const s = step.status;
  const title = s === "done" ? step.doneTitle ?? step.title : step.title;
  const hasDetail = Boolean(step.detail);

  return (
    <motion.li
      layout={m.reduced ? false : "position"}
      initial={{ opacity: 0, y: m.reduced ? 0 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.reduced ? { duration: 0.12 } : { ...spring.layout, opacity: { duration: 0.18 } }}
      className="relative pb-0.5 pl-5"
    >
      {/* rail segment to next node: pencil while the run is moving through it, then ink-faint */}
      {!last && (
        <span aria-hidden className="absolute bottom-[-7px] left-[-0.5px] top-[16px] w-px overflow-hidden bg-hairline">
          <motion.span
            className="absolute inset-0 origin-top"
            initial={false}
            animate={{
              scaleY: s === "pending" ? 0 : 1,
              backgroundColor: pencil ? "var(--bis-pencil)" : "var(--bis-rule)",
            }}
            transition={m.reduced ? { duration: 0 } : { scaleY: { duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }, backgroundColor: tween.drain }}
          />
        </span>
      )}
      {/* node */}
      <span aria-hidden className="absolute left-[-4px] top-[7px] grid size-[9px] place-items-center">
        {s === "running" ? (
          <span className="size-[9px] rounded-full bg-pencil shadow-[0_0_0_3px_var(--bis-pencil-soft)]" />
        ) : s === "done" ? (
          <span className="size-[7px] rounded-full bg-ink-2" />
        ) : s === "error" ? (
          <span className="size-[9px] rounded-full bg-err shadow-[0_0_0_3px_var(--bis-err-soft)]" />
        ) : s === "skipped" ? (
          <span className="h-px w-[7px] bg-faint" />
        ) : (
          <span className="size-[7px] rounded-full shadow-[inset_0_0_0_1.25px_var(--bis-faint)]" />
        )}
      </span>

      <div className="flex min-h-[22px] items-baseline gap-2 py-[2px]">
        {hasDetail ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((o) => !o)}
            className="focus-ring -mx-1 flex min-w-0 items-baseline gap-1 rounded-xs px-1 text-left"
          >
            <StepTitle status={s} title={title} />
            <VisuallyHidden>{statusWord(s)}</VisuallyHidden>
          </button>
        ) : (
          <>
            <StepTitle status={s} title={title} />
            <VisuallyHidden>{statusWord(s)}</VisuallyHidden>
          </>
        )}
        {step.meta && <span className="tabular shrink-0 font-mono text-2xs text-muted">{step.meta}</span>}
        <span className="tabular ml-auto shrink-0 pl-2 font-mono text-2xs text-muted">
          {s === "done" && step.durationMs != null ? fmt.seconds(step.durationMs) : s === "skipped" ? "skipped" : ""}
        </span>
        {hasDetail && (
          <Icon aria-hidden onClick={() => setOpen((o) => !o)} name="chevronDown" size={11} className={cn("cursor-pointer shrink-0 translate-y-[2px] text-muted transition-transform duration-150", !open && "-rotate-90")} />
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && hasDetail && (
          <motion.div
            id={detailId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={m.reduced ? { height: { duration: 0 }, opacity: { duration: 0.12 } } : { height: spring.layout, opacity: { duration: 0.14 } }}
            className="overflow-hidden"
          >
            <div className="pb-2 pt-1 text-sm text-ink-2">{step.detail}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function StepTitle({ status, title }: { status: StepStatus; title: string }) {
  return (
    <span
      className={cn(
        "min-w-0 truncate transition-colors duration-[240ms]",
        status === "running" && "bis-live-text",
        status === "done" && "text-ink-2",
        status === "pending" && "text-faint",
        status === "skipped" && "text-faint line-through decoration-faint",
        status === "error" && "text-err",
      )}
    >
      {title}
    </span>
  );
}

function statusWord(s: StepStatus) {
  return { pending: ", pending", running: ", in progress", done: ", done", error: ", failed", skipped: ", skipped" }[s];
}
