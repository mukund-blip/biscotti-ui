"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { VisuallyHidden, useElapsed } from "../../lib/primitives";
import { cn, fmt, useControllable } from "../../lib/utils";

export type ActivityStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface ActivityTask {
  id: string;
  /** Present-progressive while live: "Reconciling pre-order payments". */
  title: string;
  /** Past tense once finished: "Reconciled pre-order payments". Falls back to `title`. */
  doneTitle?: string;
  status: ActivityStatus;
  /** 0–1. Omit for indeterminate work. */
  progress?: number;
  /** Time spent working (running time, not wall time). Falls back to a local timer while running. */
  elapsedMs?: number;
  /** Short secondary text: "412 orders", "3 suppliers". */
  meta?: string;
  /** One-line error, shown when `status` is "failed". */
  error?: string;
}

export interface ActivityStackProps {
  tasks: ActivityTask[];
  /** Heading for the panel. Default "Activity". */
  title?: ReactNode;
  /** Concurrency slots drawn in the capacity bar. Defaults to the number of tasks holding a slot. */
  capacity?: number;
  /** Per-task actions. A button is only rendered when its handler is provided. */
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  /** Makes task titles buttons (e.g. open the task's transcript). */
  onOpen?: (id: string) => void;
  /** Whether the completed deck is fanned out (controlled). */
  deckOpen?: boolean;
  defaultDeckOpen?: boolean;
  onDeckOpenChange?: (open: boolean) => void;
  /** Allow this instance to play sounds. Default true. */
  sound?: boolean;
  className?: string;
}

const RANK: Record<ActivityStatus, number> = { running: 0, failed: 1, paused: 2, queued: 3, completed: 4, cancelled: 4 };
const isFinished = (s: ActivityStatus) => s === "completed" || s === "cancelled";
const time = (ms: number) => (ms < 60000 ? fmt.seconds(ms) : fmt.duration(ms));

/* Deck geometry (px). */
const CARD_H = 34;
const CARD_GAP = 4;
const PEEK = 5;

export function ActivityStack({
  tasks,
  title = "Activity",
  capacity,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onOpen,
  deckOpen: deckOpenProp,
  defaultDeckOpen = false,
  onDeckOpenChange,
  sound: soundOn = true,
  className,
}: ActivityStackProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const uid = useId();
  const rootRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const deckButtonRef = useRef<HTMLButtonElement>(null);
  const [deckOpen, setDeckOpen] = useControllable(deckOpenProp, defaultDeckOpen, onDeckOpenChange);

  // Completion order, so the most recently finished card sits on top of the deck.
  const seq = useRef({ n: 0, map: new Map<string, number>() });
  for (const t of tasks) {
    if (isFinished(t.status)) {
      if (!seq.current.map.has(t.id)) seq.current.map.set(t.id, ++seq.current.n);
    } else seq.current.map.delete(t.id);
  }

  const active = useMemo(
    () =>
      tasks
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => !isFinished(t.status))
        .sort((a, b) => RANK[a.t.status] - RANK[b.t.status] || a.i - b.i)
        .map(({ t }) => t),
    [tasks],
  );
  const deck = tasks
    .filter((t) => isFinished(t.status))
    .sort((a, b) => (seq.current.map.get(b.id) ?? 0) - (seq.current.map.get(a.id) ?? 0));

  const count = (s: ActivityStatus) => tasks.filter((t) => t.status === s).length;
  const c = { running: count("running"), paused: count("paused"), failed: count("failed"), queued: count("queued"), completed: count("completed"), cancelled: count("cancelled") };
  const held = c.running + c.paused + c.failed;
  const slots = Math.max(capacity ?? held, held, 1);

  /* ── announcements: outcomes only ───────────────────────── */
  const [announce, setAnnounce] = useState("");
  const prev = useRef<Map<string, ActivityStatus> | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = new Map(tasks.map((t) => [t.id, t.status]));
    if (!before) return;
    const msgs: string[] = [];
    for (const t of tasks) {
      const was = before.get(t.id);
      if (!was || was === t.status) continue;
      if (t.status === "failed") msgs.push(`${t.title} failed${t.error ? `: ${t.error}` : ""}.`);
      else if (t.status === "completed") msgs.push(`${t.doneTitle ?? t.title}.`);
    }
    if (msgs.length) setAnnounce(msgs.join(" "));
  }, [tasks]);

  /* ── focus restoration when the focused control unmounts ─── */
  const lastFocus = useRef<{ id: string; index: number; el: Element } | null>(null);
  useEffect(() => {
    const lf = lastFocus.current;
    const root = rootRef.current;
    if (!lf || !root || lf.el.isConnected) return;
    lastFocus.current = null;
    const ae = document.activeElement;
    if (ae && ae !== document.body) return; // focus already went somewhere on purpose
    const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-activity-row]"));
    const row = rows.find((r) => r.dataset.activityRow === lf.id) ?? rows[Math.min(lf.index, rows.length - 1)];
    const target = row?.querySelector<HTMLElement>("[data-primary]") ?? row?.querySelector<HTMLElement>("button") ?? deckButtonRef.current ?? headingRef.current;
    target?.focus({ preventScroll: true });
  });

  const act = (kind: "pause" | "resume" | "cancel" | "retry", id: string) => {
    if (kind === "pause") { play("unlatch", { velocity: 0.5 }); onPause?.(id); }
    else if (kind === "resume") { play("latch", { velocity: 0.5 }); onResume?.(id); }
    else if (kind === "cancel") { play("dismiss"); onCancel?.(id); }
    else { play("tap"); onRetry?.(id); }
  };

  const summary: { n: number; word: string; tone?: "err" }[] = [
    { n: c.running, word: "running" },
    { n: c.paused, word: "paused" },
    { n: c.failed, word: "failed", tone: "err" },
    { n: c.queued, word: "queued" },
  ].filter((p) => p.n > 0) as { n: number; word: string; tone?: "err" }[];
  const summaryText = summary.length ? summary.map((p) => `${p.n} ${p.word}`).join(" · ") : tasks.length ? "All done" : "Idle";

  const segs: ("running" | "paused" | "failed" | "free")[] = Array.from({ length: slots }, (_, i) =>
    i < c.running ? "running" : i < c.running + c.paused ? "paused" : i < held ? "failed" : "free",
  );

  return (
    <section
      ref={rootRef}
      aria-labelledby={`${uid}-h`}
      className={cn("overflow-hidden rounded-lg bg-raised text-base shadow-2", className)}
    >
      <header className="px-4 pb-3 pt-3.5 hairline-b">
        <div className="flex items-baseline gap-3">
          <h3 ref={headingRef} tabIndex={-1} id={`${uid}-h`} className="truncate text-base font-medium text-ink outline-none">
            {title}
          </h3>
          <p className="tabular ml-auto shrink-0 text-sm text-muted">
            {summary.length
              ? summary.map((p, i) => (
                  <span key={p.word}>
                    {i > 0 && <span aria-hidden className="px-1 text-faint">·</span>}
                    <span className={cn(p.tone === "err" && "text-err")}>{p.n} {p.word}</span>
                  </span>
                ))
              : summaryText}
          </p>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <div
            role="img"
            aria-label={`${held} of ${slots} slots in use`}
            className="flex h-[3px] flex-1 gap-[3px]"
          >
            {segs.map((s, i) => (
              <span
                key={i}
                className={cn(
                  "h-full flex-1 rounded-[1px] transition-colors duration-[240ms] ease-out",
                  s === "running" ? "bg-pencil" : s === "paused" ? "bg-edge" : s === "failed" ? "bg-err" : "bg-hairline",
                )}
              />
            ))}
          </div>
          <span aria-hidden className="tabular shrink-0 font-mono text-2xs text-muted">
            {held}/{slots} slots
          </span>
        </div>
      </header>

      {active.length > 0 ? (
        <ol aria-label="Active tasks" className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {active.map((t, i) => (
              <ActivityRow
                key={t.id}
                task={t}
                first={i === 0}
                queuePos={t.status === "queued" ? active.filter((x) => x.status === "queued").indexOf(t) + 1 : 0}
                onAct={act}
                canPause={Boolean(onPause)}
                canResume={Boolean(onResume)}
                canCancel={Boolean(onCancel)}
                canRetry={Boolean(onRetry)}
                onOpen={onOpen}
                onFocusRow={(el) => { lastFocus.current = { id: t.id, index: i, el }; }}
              />
            ))}
          </AnimatePresence>
        </ol>
      ) : (
        <p className="px-4 py-3.5 text-sm text-muted">{deck.length ? "Nothing running." : "No activity yet."}</p>
      )}

      {deck.length > 0 && (
        <CompletedDeck
          tasks={deck}
          open={deckOpen}
          onToggle={() => setDeckOpen(!deckOpen)}
          onOpen={onOpen}
          buttonRef={deckButtonRef}
          completed={c.completed}
          cancelled={c.cancelled}
          reduced={m.reduced}
        />
      )}
      <VisuallyHidden>
        <span role="status" aria-live="polite">{announce}</span>
      </VisuallyHidden>
    </section>
  );
}

/* ── active row ──────────────────────────────────────────── */

interface RowProps {
  task: ActivityTask;
  first: boolean;
  queuePos: number;
  onAct: (kind: "pause" | "resume" | "cancel" | "retry", id: string) => void;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canRetry: boolean;
  onOpen?: (id: string) => void;
  onFocusRow: (el: Element) => void;
}

function ActivityRow({ task: t, first, queuePos, onAct, canPause, canResume, canCancel, canRetry, onOpen, onFocusRow }: RowProps) {
  const m = useMotionTokens();
  const s = t.status;
  const local = useElapsed(s === "running" && t.elapsedMs == null, t.id);
  const elapsed = t.elapsedMs ?? local;
  const pct = t.progress != null ? Math.max(0, Math.min(1, t.progress)) : null;
  const statusWord = s === "running" ? (pct != null ? `${Math.round(pct * 100)}%` : "") : s === "paused" ? "paused" : s === "failed" ? "failed" : `queued${queuePos ? ` · ${queuePos}` : ""}`;
  const srStatus = s === "running" ? `running${pct != null ? `, ${Math.round(pct * 100)} percent` : ""}` : s === "queued" ? `queued, position ${queuePos}` : s;

  return (
    <motion.li
      layout={m.reduced ? false : "position"}
      data-activity-row={t.id}
      onFocusCapture={(e) => onFocusRow(e.target)}
      initial={{ opacity: 0, y: m.reduced ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      // Finished work sinks toward the deck as it leaves.
      exit={{ opacity: 0, y: m.reduced ? 0 : 14, scale: m.reduced ? 1 : 0.985, transition: m.reduced ? { duration: 0.12 } : { duration: 0.22, ease: [0.5, 0, 0.75, 0] } }}
      transition={m.reduced ? { duration: 0.12 } : { ...spring.layout, opacity: { duration: 0.18 } }}
      className={cn("group/row relative flex gap-3 bg-raised py-2.5 pl-4 pr-3", !first && "[box-shadow:inset_0_1px_0_var(--dt-hairline)]")}
    >
      <span aria-hidden className="mt-[2px] grid size-4 shrink-0 place-items-center">
        <StatusMark status={s} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-h-5 items-baseline gap-2">
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className={cn("focus-ring -mx-1 min-w-0 truncate rounded-xs px-1 text-left hover:underline hover:decoration-rule hover:underline-offset-4", titleTone(s))}
            >
              {t.title}
              <VisuallyHidden>, {srStatus}</VisuallyHidden>
            </button>
          ) : (
            <span className={cn("min-w-0 truncate", titleTone(s))}>
              {t.title}
              <VisuallyHidden>, {srStatus}</VisuallyHidden>
            </span>
          )}
          {t.meta && <span className="hidden min-w-0 shrink truncate text-xs text-muted sm:inline">{t.meta}</span>}
          <span aria-hidden className={cn("tabular ml-auto shrink-0 pl-2 font-mono text-2xs", s === "failed" ? "text-err" : "text-muted")}>
            {statusWord}
          </span>
          <span aria-hidden className="tabular w-[5.5ch] shrink-0 text-right font-mono text-2xs text-muted">
            {s === "queued" ? "" : time(elapsed)}
          </span>
        </div>

        {s === "failed" ? (
          <div className="mt-1 flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-err">{t.error ?? "Something went wrong."}</p>
            {canRetry && (
              <button
                type="button"
                data-primary
                onClick={() => onAct("retry", t.id)}
                aria-label={`Retry ${t.title}`}
                className="focus-ring flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-xs text-ink shadow-[inset_0_0_0_1px_var(--dt-edge)] transition-[background-color,transform] duration-[90ms] hover:bg-sunken active:translate-y-px"
              >
                <Icon name="refresh" size={12} />
                Retry
              </button>
            )}
          </div>
        ) : s !== "queued" ? (
          <ProgressTrack status={s} value={pct} label={t.title} />
        ) : (
          <div className="h-[10px]" />
        )}
      </div>

      <div
        className={cn(
          "flex w-[52px] shrink-0 items-start justify-end gap-0.5 self-start transition-opacity duration-[90ms]",
          "[@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-hover/row:duration-0 group-focus-within/row:opacity-100",
        )}
      >
        {/* One element for pause ⇄ resume so focus survives the swap. */}
        {((s === "running" && canPause) || (s === "paused" && canResume)) && (
          <RowButton
            primary
            icon={s === "running" ? "pause" : "play"}
            label={`${s === "running" ? "Pause" : "Resume"} ${t.title}`}
            onClick={() => onAct(s === "running" ? "pause" : "resume", t.id)}
          />
        )}
        {canCancel && <RowButton icon="x" label={s === "failed" ? `Dismiss ${t.title}` : `Cancel ${t.title}`} onClick={() => onAct("cancel", t.id)} />}
      </div>
    </motion.li>
  );
}

function titleTone(s: ActivityStatus) {
  return s === "running" || s === "failed" ? "text-ink" : s === "paused" ? "text-ink-2" : "text-muted";
}

function StatusMark({ status }: { status: ActivityStatus }) {
  switch (status) {
    case "running":
      return <span className="size-[7px] rounded-full bg-pencil shadow-[0_0_0_3px_var(--dt-pencil-soft)]" />;
    case "paused":
      return (
        <span className="flex h-[8px] gap-[2px]">
          <span className="w-[2px] rounded-[1px] bg-ink-2" />
          <span className="w-[2px] rounded-[1px] bg-ink-2" />
        </span>
      );
    case "failed":
      return <span className="size-[7px] rounded-full bg-err shadow-[0_0_0_3px_var(--dt-err-soft)]" />;
    case "queued":
      return <span className="size-[7px] rounded-full shadow-[inset_0_0_0_1.25px_var(--dt-faint)]" />;
    case "cancelled":
      return <span className="h-px w-[7px] bg-faint" />;
    default:
      return <Icon name="check" size={12} className="text-muted" />;
  }
}

function ProgressTrack({ status, value, label }: { status: ActivityStatus; value: number | null; label: string }) {
  const m = useMotionTokens();
  const live = status === "running";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value != null ? Math.round(value * 100) : undefined}
      className="relative mt-2 h-[2px] overflow-hidden rounded-[1px] bg-hairline"
    >
      {value != null ? (
        <motion.span
          className="absolute inset-y-0 left-0 w-full origin-left rounded-[1px]"
          initial={false}
          animate={{ scaleX: value, backgroundColor: live ? "var(--dt-pencil)" : "var(--dt-edge)" }}
          transition={{ scaleX: m.reduced ? { duration: 0 } : { duration: 0.18, ease: "linear" }, backgroundColor: m.fade(tween.drain) }}
        />
      ) : (
        // Indeterminate: a measured ruler, not a looping shimmer.
        <span aria-hidden className={cn("absolute inset-0 bg-[repeating-linear-gradient(90deg,currentColor_0_1px,transparent_1px_6px)]", live ? "text-pencil-line" : "text-rule")} />
      )}
    </div>
  );
}

function RowButton({ icon, label, onClick, primary }: { icon: "pause" | "play" | "x"; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-primary={primary ? "" : undefined}
      onClick={onClick}
      className="focus-ring grid size-6 place-items-center rounded-sm text-muted transition-[background-color,color] duration-[90ms] hover:bg-sunken hover:text-ink hover:duration-0 active:translate-y-px"
    >
      <Icon name={icon} size={icon === "x" ? 12 : 13} />
    </button>
  );
}

/* ── completed deck ──────────────────────────────────────── */

function CompletedDeck({
  tasks,
  open,
  onToggle,
  onOpen,
  buttonRef,
  completed,
  cancelled,
  reduced,
}: {
  tasks: ActivityTask[];
  open: boolean;
  onToggle: () => void;
  onOpen?: (id: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  completed: number;
  cancelled: number;
  reduced: boolean;
}) {
  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const n = tasks.length;
  const total = tasks.reduce((a, t) => a + (t.status === "completed" ? t.elapsedMs ?? 0 : 0), 0);
  const height = open ? n * CARD_H + (n - 1) * CARD_GAP : CARD_H + Math.min(n - 1, 2) * PEEK;

  // Collapsing under the user's focus: hand focus back to the toggle.
  useEffect(() => {
    if (!open && listRef.current?.contains(document.activeElement)) buttonRef.current?.focus({ preventScroll: true });
  }, [open, buttonRef]);

  return (
    <div className="bg-surface px-3 pb-3 pt-1.5 [box-shadow:inset_0_1px_0_var(--dt-hairline)]">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className="focus-ring group -mx-1 mb-1.5 flex w-[calc(100%+8px)] items-center gap-2 rounded-sm px-2 py-1 text-left"
      >
        <span className="tabular text-sm text-ink-2 group-hover:text-ink">
          {completed} completed
          {cancelled > 0 && <span className="text-muted"> · {cancelled} cancelled</span>}
        </span>
        {total > 0 && <span aria-hidden className="tabular font-mono text-2xs text-muted">{time(total)} of work</span>}
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : spring.control}
          className="ml-auto grid size-4 place-items-center text-muted group-hover:text-ink"
        >
          <Icon name="chevronDown" size={12} />
        </motion.span>
      </button>

      <motion.div
        initial={false}
        animate={{ height }}
        transition={reduced ? { duration: 0 } : spring.layout}
        className={cn("relative", !open && "cursor-pointer")}
        onClick={open ? undefined : onToggle}
      >
        <ol ref={listRef} id={listId} aria-label="Finished tasks" inert={!open} className="absolute inset-0">
          <AnimatePresence initial={false}>
            {tasks.map((t, i) => (
              <DeckCard key={t.id} task={t} index={i} count={n} open={open} reduced={reduced} onOpen={onOpen} />
            ))}
          </AnimatePresence>
        </ol>
      </motion.div>
    </div>
  );
}

function DeckCard({ task: t, index: i, count, open, reduced, onOpen }: { task: ActivityTask; index: number; count: number; open: boolean; reduced: boolean; onOpen?: (id: string) => void }) {
  const depth = Math.min(i, 2);
  const target = open
    ? { y: i * (CARD_H + CARD_GAP), scale: 1, opacity: 1 }
    : { y: depth * PEEK, scale: 1 - depth * 0.035, opacity: i > 2 ? 0 : 1 - depth * 0.12 };
  const delay = reduced ? 0 : open ? Math.min(i, 8) * 0.018 : Math.min(count - 1 - i, 8) * 0.01;
  const cancelled = t.status === "cancelled";
  const label = cancelled ? t.title : t.doneTitle ?? t.title;

  return (
    <motion.li
      initial={reduced ? { ...target, opacity: 0 } : { ...target, y: target.y - 16, opacity: 0 }}
      animate={target}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={reduced ? { duration: 0.12 } : { ...spring.layout, delay, opacity: { duration: 0.2, delay } }}
      style={{ zIndex: count - i, transformOrigin: "50% 100%" }}
      className="absolute inset-x-0 top-0 flex items-center gap-2.5 rounded-sm bg-raised px-3 shadow-[inset_0_0_0_1px_var(--dt-hairline),var(--dt-shadow-1)]"
    >
      <motion.div
        className="flex min-w-0 flex-1 items-center gap-2.5"
        style={{ height: CARD_H }}
        initial={false}
        animate={{ opacity: open || i === 0 ? 1 : 0 }}
        transition={reduced ? { duration: 0.12 } : { duration: 0.14, delay: open ? delay + 0.08 : 0 }}
      >
        <span aria-hidden className="grid size-4 shrink-0 place-items-center">
          <StatusMark status={t.status} />
        </span>
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(t.id)}
            className={cn("focus-ring -mx-1 min-w-0 truncate rounded-xs px-1 text-left text-sm hover:text-ink", cancelled ? "text-muted" : "text-ink-2")}
          >
            {label}
            <VisuallyHidden>{cancelled ? ", cancelled" : ", completed"}</VisuallyHidden>
          </button>
        ) : (
          <span className={cn("min-w-0 truncate text-sm", cancelled ? "text-muted" : "text-ink-2")}>
            {label}
            <VisuallyHidden>{cancelled ? ", cancelled" : ", completed"}</VisuallyHidden>
          </span>
        )}
        {t.meta && !cancelled && <span className="hidden min-w-0 shrink truncate text-xs text-muted sm:inline">{t.meta}</span>}
        <span className="tabular ml-auto shrink-0 font-mono text-2xs text-muted">
          {cancelled ? "cancelled" : t.elapsedMs != null ? time(t.elapsedMs) : ""}
        </span>
      </motion.div>
    </motion.li>
  );
}
