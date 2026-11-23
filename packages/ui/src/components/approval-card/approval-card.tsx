"use client";
import { AnimatePresence, animate, motion, useMotionValue, type MotionValue, type TargetAndTransition } from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Icon } from "../../icons";
import { Kbd, VisuallyHidden } from "../../lib/primitives";
import { cn, useControllable } from "../../lib/utils";
import { ease, instant, spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { KineticButton } from "../kinetic-button/kinetic-button";

// Bundlers inline `process.env.NODE_ENV`; declared locally so the library needs no Node types.
declare const process: { env: { NODE_ENV?: string } } | undefined;
const isDev = () => typeof process !== "undefined" && process.env.NODE_ENV !== "production";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ── types ────────────────────────────────────────────────── */

export type ApprovalRisk = "low" | "medium" | "high";
export type ApprovalOutcome = "approved" | "changes" | "rejected";

export interface ApprovalDecision {
  outcome: ApprovalOutcome;
  /** The reviewer's note, for `"changes"`. */
  note?: string;
  /** Who decided (taken from `reviewer`). */
  by?: string;
  /** When the decision was made, epoch ms. */
  at: number;
}

export interface ApprovalScopeItem {
  /** The measured quantity, e.g. `214` or `"$4,280"`. Rendered in tabular mono. */
  value: ReactNode;
  /** What it counts, e.g. `"recipients"`. */
  label: ReactNode;
}

export interface ApprovalCardProps {
  /** What the agent wants to do, as one clear sentence. */
  action: ReactNode;
  /**
   * Short form of the action for the receipt line. Defaults to `action` when it is a string, or to the
   * rendered text of `action` (read at decision time) when it is an element. Warns in development if neither yields text.
   */
  summary?: string;
  /** Who is asking. */
  agent?: ReactNode;
  /** The blast radius, e.g. `[{ value: 214, label: "recipients" }]`. */
  scope?: ApprovalScopeItem[];
  /** Risk level. `"high"` turns Approve into a press-and-hold (hold approvals resolve on the latch; see `sound`). */
  risk?: ApprovalRisk;
  /** What will actually happen — an email, a diff, a ledger. Shown as an expandable peek. */
  preview?: ReactNode;
  /** Label above the preview. */
  previewLabel?: string;
  /** Start with the preview fully open. */
  defaultPreviewOpen?: boolean;
  /** Why the agent is asking — rendered as provenance (serif italic). */
  rationale?: ReactNode;
  /** Name shown in the receipt: "Approved by Mara Lind". */
  reviewer?: string;
  /**
   * Controlled decision. `null` = still pending. Storing a re-created copy of the decision passed to
   * `onDecisionChange` (same outcome and note) keeps its undo window; a different decision cancels it.
   */
  decision?: ApprovalDecision | null;
  /** Initial decision when uncontrolled (treated as already committed). */
  defaultDecision?: ApprovalDecision | null;
  /** Fires immediately on approve / request changes / reject, and with `null` on undo. */
  onDecisionChange?: (decision: ApprovalDecision | null) => void;
  /** Fires once the undo window closes (or immediately if the card unmounts during it) — the point of no return. Act on the decision here. */
  onCommit?: (decision: ApprovalDecision) => void;
  /**
   * How long a decision can be undone, in ms. `0` commits immediately. With `expiresAt`, the window is
   * clamped to the time left (`min(undoWindow, deadline − now)`), so a decision always commits by the deadline;
   * a decision made at or after it commits at once with no undo.
   */
  undoWindow?: number;
  /** Hold duration for high-risk approval, in ms. */
  holdDuration?: number;
  /**
   * When the request lapses. Shows a mono countdown; at zero the card becomes an "Expired" receipt.
   * While the reviewer is writing a change request the countdown pauses (shown as "Paused at 3:12") and the
   * deadline moves back by the length of the pause, so an unsent note is never lost to expiry.
   */
  expiresAt?: number | Date;
  /** Fires when `expiresAt` passes without a decision. */
  onExpire?: () => void;
  /** Play the `attention` voice once on mount. Use for requests that arrive while the user is elsewhere. */
  announce?: boolean;
  /**
   * Allow this instance (and its buttons) to play sounds. One outcome voice per decision: a clicked
   * Approve plays `confirm`, Reject `dismiss`, a sent note a softer `confirm`. Hold approvals resolve on the
   * latch: the button's rising ticks and `latch` are the outcome, and no `confirm` is stacked on top.
   */
  sound?: boolean;
  className?: string;
}

/* ── helpers ──────────────────────────────────────────────── */

const RISK: Record<ApprovalRisk, { label: string; level: number; tone: string }> = {
  low: { label: "Low risk", level: 1, tone: "bg-sunken text-ink-2" },
  medium: { label: "Medium risk", level: 2, tone: "bg-warn-soft text-warn" },
  high: { label: "High risk", level: 3, tone: "bg-err-soft text-err" },
};

const clock = (ms: number) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);

const countdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

const PEEK = 104;

/**
 * The fold. The height moves at once on `spring.glide`, in both directions and from wherever it is.
 * Collapsing, the request stays legible while the soft bottom edge clips it, then hands off late: it
 * fades in 30 ms and the receipt arrives only as the height nears its final size. Two text layers never
 * show at once, and the card is never an empty box. Expanding (undo, "show request"), the receipt
 * leaves first and the request fades in behind it as the card opens.
 */
// Rest within 2 px: glide's last pixels creep for ~40 ms and nobody can see them.
const FOLD = { ...spring.glide, restDelta: 2, restSpeed: 80 } as const;
const HANDOFF = {
  /** Collapsing: the request's quick, late exit and the receipt's arrival right after it. */
  foldOut: { duration: 0.03, ease: "linear", delay: 0.105 },
  foldIn: { duration: 0.14, ease: ease.out, delay: 0.13 },
  /** Expanding: the receipt goes at once; the request follows. */
  openOut: { duration: 0.03, ease: "linear" },
  openIn: { duration: 0.16, ease: ease.out, delay: 0.035 },
} as const;
/** While the height moves, its edge is a short fade (shrinking to nothing on arrival) rather than a hard cut through text. */
const SOFT_EDGE = 28;

/** Same decision for undo purposes: outcome and note match (identity and `at` may differ). */
const sameDecision = (a: ApprovalDecision, b: ApprovalDecision) => a.outcome === b.outcome && (a.note ?? "") === (b.note ?? "");

/* ── ApprovalCard ─────────────────────────────────────────── */

export function ApprovalCard({
  action,
  summary,
  agent = "Scout",
  scope,
  risk = "medium",
  preview,
  previewLabel = "Preview",
  defaultPreviewOpen = false,
  rationale,
  reviewer,
  decision: decisionProp,
  defaultDecision = null,
  onDecisionChange,
  onCommit,
  undoWindow = 5000,
  holdDuration = 1000,
  expiresAt,
  onExpire,
  announce = false,
  sound: soundOn = true,
  className,
}: ApprovalCardProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const uid = useId();
  const [decision, setDecision] = useControllable<ApprovalDecision | null>(decisionProp, defaultDecision, onDecisionChange);

  const [composing, setComposing] = useState(false);
  /** The receipt's disclosure: the original request, read-only. */
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  /** The open undo window: an internal id, the decision it guards and its (deadline-clamped) length. */
  const [win, setWin] = useState<{ id: number; d: ApprovalDecision; ms: number } | null>(null);
  const winSeq = useRef(0);
  const [expired, setExpired] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("");
  /** Receipt text captured from the rendered action when `action` is not a string and no `summary` is given. */
  const [capturedLabel, setCapturedLabel] = useState<string | null>(null);

  const rootRef = useRef<HTMLElement>(null);
  const actionRef = useRef<HTMLHeadingElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const changesRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<(() => HTMLElement | null) | null>(null);

  const label = summary ?? (typeof action === "string" ? action : capturedLabel ?? "Request");
  /** Resolve the receipt text now, reading the action's rendered text if it is an element. */
  const resolveLabel = () => {
    if (summary != null || typeof action === "string") return label;
    const text = actionRef.current?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text && isDev()) {
      console.warn("ApprovalCard: `action` has no text content; pass `summary` so the receipt can say what was decided.");
    }
    if (text) setCapturedLabel(text);
    return text || "Request";
  };
  const view: "pending" | "receipt" = decision || expired ? "receipt" : "pending";
  // Back to pending for any reason (undo, a controlled parent clearing or revising the decision):
  // the next decision must fold to a line, not land already expanded.
  useEffect(() => {
    if (view === "pending") setExpanded(false);
  }, [view]);
  const undoable = !!win && !!decision && sameDecision(decision, win.d);
  const high = risk === "high";

  useEffect(() => setMounted(true), []);

  /* attention, once */
  const announced = useRef(false);
  useEffect(() => {
    if (!announce || announced.current || decision) return;
    announced.current = true;
    play("attention");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* expiry countdown — client only. Paused (and the deadline pushed back by the pause) while a note is being written. */
  const deadlineProp = expiresAt == null ? null : typeof expiresAt === "number" ? expiresAt : expiresAt.getTime();
  const [pausedFor, setPausedFor] = useState(0);
  const pauseStart = useRef<number | null>(null);
  useEffect(() => setPausedFor(0), [deadlineProp]);
  const paused = composing && deadlineProp != null && !decision && !expired;
  useEffect(() => {
    if (!paused) return;
    const start = Date.now();
    pauseStart.current = start;
    return () => {
      pauseStart.current = null;
      setPausedFor((p) => p + (Date.now() - start));
    };
  }, [paused]);
  const deadline = deadlineProp == null ? null : deadlineProp + pausedFor;
  /** The deadline as of this instant, including a pause still in progress. */
  const liveDeadline = () =>
    deadline == null ? null : deadline + (pauseStart.current != null ? Date.now() - pauseStart.current : 0);
  const [now, setNow] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    if (deadline == null || decision || expired || paused) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) {
        setExpired(true);
        setStatus(`Request expired. ${resolveLabel()} was not carried out.`);
        onExpireRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, decision, expired, paused]);
  useEffect(() => {
    if (deadlineProp != null && deadlineProp > Date.now()) setExpired(false);
  }, [deadlineProp]);
  // While paused the interval is stopped, so `now` (and with it the remaining time) holds still.
  const remaining = deadline != null && now != null ? deadline - now : null;

  /* undo window → commit */
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  /** A decision inside its undo window: committed when the window closes, or at once on unmount. */
  const uncommitted = useRef<{ id: number; d: ApprovalDecision } | null>(null);
  const commit = (d: ApprovalDecision) => onCommitRef.current?.(d);
  // Undo is a grace period, not a cancellation: if the card unmounts mid-window (navigation, a list
  // re-keying), the reviewer's decision still stands, so commit it rather than dropping it silently.
  useEffect(() => () => {
    const u = uncommitted.current;
    uncommitted.current = null;
    if (u) onCommitRef.current?.(u.d);
  }, []);
  useEffect(() => {
    if (!win) return;
    const id = window.setTimeout(() => {
      setWin(null);
      const u = uncommitted.current;
      if (u && u.id === win.id) {
        uncommitted.current = null;
        commit(u.d);
        // The Undo button is about to unmount — keep focus in the card.
        if (document.activeElement === undoRef.current) pendingFocus.current = () => receiptRef.current;
      }
    }, win.ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win]);

  // A genuinely different decision from outside (controlled) cancels the window. A parent that merely
  // re-creates the same decision (new object, new `at`) keeps it — the window is keyed on our own id.
  useEffect(() => {
    if (win && (!decision || !sameDecision(decision, win.d))) {
      uncommitted.current = null;
      setWin(null);
    }
  }, [decision, win]);

  /* focus hand-off after view changes */
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const id = requestAnimationFrame(() => target()?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  });

  const focusInside = () => {
    const a = typeof document !== "undefined" ? document.activeElement : null;
    return !a || a === document.body || !!rootRef.current?.contains(a);
  };

  const decide = (outcome: ApprovalOutcome, viaHold = false) => {
    if (decision || expired) return;
    const t = Date.now();
    const d: ApprovalDecision = { outcome, at: t, by: reviewer, ...(outcome === "changes" ? { note: note.trim() } : null) };
    const subject = resolveLabel();
    setDecision(d);
    setComposing(false);
    // One outcome voice per decision. A hold already spoke through the button's latch.
    if (outcome === "approved") {
      if (!viaHold) play("confirm");
    } else if (outcome === "rejected") play("dismiss");
    else play("confirm", { velocity: 0.5, pitch: 0.94 });
    const verb = outcome === "approved" ? "Approved" : outcome === "rejected" ? "Rejected" : "Changes requested";
    // The undo window never outlives the request's deadline.
    const dl = liveDeadline();
    const ms = dl == null ? undoWindow : Math.min(undoWindow, dl - t);
    if (ms > 0) {
      const id = ++winSeq.current;
      uncommitted.current = { id, d };
      setWin({ id, d, ms });
      setStatus(`${verb}: ${subject}. Undo available for ${Math.max(1, Math.ceil(ms / 1000))} seconds.`);
    } else {
      setStatus(`${verb}: ${subject}.`);
      commit(d);
    }
    if (focusInside()) pendingFocus.current = () => undoRef.current ?? receiptRef.current;
  };

  const undo = () => {
    if (!decision || !undoable) return;
    const dl = liveDeadline();
    if (dl != null && Date.now() >= dl) return; // the window is closing at the deadline; the decision stands
    const prev = decision;
    uncommitted.current = null;
    setWin(null);
    setDecision(null);
    setExpanded(false);
    play("unlatch", { velocity: 0.5 });
    setStatus("Decision undone. Request is pending again.");
    if (prev.outcome === "changes") {
      setNote(prev.note ?? "");
      setComposing(true);
      pendingFocus.current = () => textareaRef.current;
    } else {
      pendingFocus.current = () => (prev.outcome === "approved" ? approveRef.current : rejectRef.current);
    }
  };

  const openCompose = () => {
    setComposing(true);
    pendingFocus.current = () => textareaRef.current;
  };
  const cancelCompose = () => {
    setComposing(false);
    pendingFocus.current = () => changesRef.current;
  };
  const sendChanges = () => {
    if (!note.trim()) {
      textareaRef.current?.focus();
      return;
    }
    decide("changes");
  };
  const onTextareaKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendChanges();
    } else if (e.key === "Escape") {
      // Handled here: don't let it also close a host dialog or popover.
      e.preventDefault();
      e.stopPropagation();
      cancelCompose();
    }
  };

  /* height: animate only the pending ⇄ receipt fold; otherwise follow content */
  const innerRef = useRef<HTMLDivElement>(null);
  const foldRef = useRef<HTMLDivElement>(null);
  const lastH = useRef(0);
  const height = useMotionValue<number | "auto">("auto");
  const firstView = useRef(true);
  useIsoLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    lastH.current = el.offsetHeight;
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (height.get() === "auto") lastH.current = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);
  useIsoLayoutEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const el = innerRef.current;
    if (!el) return;
    // Start from what is on screen: mid-fold that is the animated height, not the last target.
    const live = height.get();
    const from = typeof live === "number" ? live : lastH.current;
    const to = el.offsetHeight;
    lastH.current = to;
    if (m.reduced || !from || Math.abs(from - to) < 0.5) {
      height.set("auto");
      return;
    }
    height.set(from);
    const box = foldRef.current;
    const edge = (px: number) => {
      if (!box) return;
      const v = px >= 0.5 ? `linear-gradient(to bottom, black calc(100% - ${px.toFixed(1)}px), transparent)` : "";
      box.style.maskImage = v;
      box.style.webkitMaskImage = v;
    };
    edge(Math.min(SOFT_EDGE, Math.abs(to - from)));
    const ctrl = animate(height as unknown as MotionValue<number>, to, {
      ...FOLD,
      onUpdate: (v) => edge(Math.min(SOFT_EDGE, Math.abs(to - v))),
      onComplete: () => {
        height.set("auto");
        edge(0);
      },
    });
    return () => {
      ctrl.stop();
      edge(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, expanded]);

  const settled = view === "receipt" && !undoable;

  /** Risk, scope, preview and rationale — shared by the request and the receipt's read-only detail. */
  const facts = (
    <>
      {/* risk + scope */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pt-2.5">
        <RiskBadge risk={risk} />
        {scope?.map((s, i) => (
          <span key={i} className="flex items-baseline gap-1 text-sm text-muted">
            <span className="tabular font-mono text-[12.5px] font-medium text-ink">{s.value}</span>
            {s.label}
          </span>
        ))}
      </div>
      {/* preview */}
      {preview && (
        <PreviewPeek label={previewLabel} defaultOpen={defaultPreviewOpen} className="mx-5 mt-3.5">
          {preview}
        </PreviewPeek>
      )}
      {/* why */}
      {rationale && <p className="px-5 pt-3 font-serif text-[14.5px] italic leading-[20px] text-muted [text-wrap:pretty]">{rationale}</p>}
    </>
  );
  // Out: gone in 50 ms, eased out. In: only once the outgoing view is gone. Reduced motion: the
  // outgoing view leaves at once and the incoming one carries the 120 ms opacity cue.
  // Reduced motion: the outgoing view leaves at once and the incoming one carries the 120 ms opacity cue.
  const pick = (k: keyof typeof HANDOFF) => (m.reduced ? (k.endsWith("Out") ? instant : m.fade()) : HANDOFF[k]);

  return (
    <motion.section
      ref={rootRef}
      aria-labelledby={`${uid}-${view}`}
      data-status={decision?.outcome ?? (expired ? "expired" : "pending")}
      initial={{ opacity: 0, y: m.reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0, transition: { opacity: m.fade(tween.surfaceIn), y: m.move(spring.surface) } }}
      className={cn(
        "relative isolate overflow-hidden rounded-lg transition-[background-color,box-shadow] duration-[240ms] ease-out",
        view === "pending" || undoable ? "bg-raised shadow-2" : "bg-surface shadow-[inset_0_0_0_1px_var(--bis-hairline)]",
        className,
      )}
    >
      <PendingRule state={view === "pending" ? "asking" : undoable ? "decided" : decision?.outcome === "approved" ? "committed" : "closed"} />
      <motion.div ref={foldRef} style={{ height }} className="relative">
        <div ref={innerRef} className="relative">
          <AnimatePresence mode="popLayout" initial={false}>
            {view === "pending" ? (
              <motion.div
                key="pending"
                className="w-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: pick("openIn") }}
                exit={{ opacity: 0, transition: pick("foldOut") }}
              >
                {/* header */}
                <div className="flex min-h-6 items-center gap-2 px-5 pt-3.5 text-xs text-muted">
                  <Icon name="sparkle" size={14} className="shrink-0 text-ink-2" />
                  <span>
                    <span className="font-medium text-ink-2">{agent}</span> needs your approval
                  </span>
                  {remaining != null && (
                    <span
                      data-paused={paused || undefined}
                      className={cn(
                        "ml-auto flex shrink-0 items-center gap-1 font-mono text-2xs transition-colors duration-[240ms]",
                        !paused && remaining <= 60_000 ? "text-warn" : "text-muted",
                      )}
                    >
                      <Icon name={paused ? "pause" : "clock"} size={12} />
                      <span aria-hidden className="tabular">
                        {paused ? "Paused at" : "Expires in"} {countdown(remaining)}
                      </span>
                      {mounted && deadline != null && (
                        <VisuallyHidden>{paused ? "Expiry paused while you write" : `Expires at ${clock(deadline)}`}</VisuallyHidden>
                      )}
                    </span>
                  )}
                </div>

                {/* what */}
                <h3 ref={actionRef} id={`${uid}-pending`} className="px-5 pt-2 text-md font-medium leading-[22px] text-ink [text-wrap:pretty]">
                  {action}
                </h3>

                {facts}

                {/* request changes */}
                <AnimatePresence initial={false}>
                  {composing && (
                    <motion.div
                      key="compose"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={m.reduced ? { duration: 0.12 } : { height: spring.layout, opacity: { duration: 0.14 } }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pt-3.5">
                        <label htmlFor={`${uid}-note`} className="mb-1.5 block text-xs font-medium text-ink-2">
                          What should {agent} change?
                        </label>
                        <textarea
                          id={`${uid}-note`}
                          ref={textareaRef}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          onKeyDown={onTextareaKey}
                          rows={2}
                          placeholder="e.g. Lead with the arpeggiator fix and drop the discount line."
                          aria-describedby={`${uid}-hint`}
                          className="focus-ring block max-h-40 min-h-[60px] w-full resize-none rounded-md bg-field px-2.5 py-2 text-base leading-5 text-ink shadow-[inset_0_0_0_1px_var(--bis-rule)] placeholder:text-muted [field-sizing:content] focus-visible:shadow-[inset_0_0_0_1px_var(--bis-pencil),var(--bis-focus)]"
                        />
                        <p id={`${uid}-hint`} className="mt-1.5 flex items-center gap-1 text-2xs text-muted">
                          <Kbd>⌘</Kbd>
                          <Kbd>↵</Kbd>
                          <span className="ml-0.5">to send</span>
                          <span aria-hidden className="mx-1 text-faint">·</span>
                          <Kbd>Esc</Kbd>
                          <span className="ml-0.5">to cancel</span>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* actions */}
                <div className="relative mt-4 flex items-center gap-2 px-5 py-3">
                  {/* Inset to the content column, so it never crosses the pencil rule in the gutter. */}
                  <span aria-hidden className="absolute inset-x-5 top-0 h-px bg-hairline" />
                  <AnimatePresence mode="popLayout" initial={false}>
                    {composing ? (
                      <motion.div
                        key="compose-actions"
                        className="flex flex-1 items-center gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: m.fade({ duration: 0.14, delay: 0.04 }) }}
                        exit={{ opacity: 0, transition: m.fade({ duration: 0.09 }) }}
                      >
                        <KineticButton variant="quiet" sound={false} onClick={cancelCompose}>
                          Cancel
                        </KineticButton>
                        <KineticButton className="ml-auto" icon="send" sound={false} disabled={!note.trim()} onClick={sendChanges}>
                          Send to {typeof agent === "string" ? agent : "agent"}
                        </KineticButton>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="decide-actions"
                        className="flex flex-1 items-center gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: m.fade({ duration: 0.14, delay: 0.04 }) }}
                        exit={{ opacity: 0, transition: m.fade({ duration: 0.09 }) }}
                      >
                        <KineticButton ref={rejectRef} variant="quiet" icon="x" sound={false} onClick={() => decide("rejected")}>
                          Reject
                        </KineticButton>
                        <KineticButton
                          ref={changesRef}
                          variant="secondary"
                          icon="comment"
                          sound={false}
                          onClick={openCompose}
                        >
                          Request changes
                        </KineticButton>
                        <KineticButton
                          ref={approveRef}
                          className="ml-auto"
                          icon="check"
                          // Clicks speak once, through decide(); a hold keeps the button's ticks and latch.
                          sound={high ? soundOn : false}
                          holdToConfirm={high ? holdDuration : undefined}
                          onClick={() => decide("approved", high)}
                        >
                          {high ? "Hold to approve" : "Approve"}
                        </KineticButton>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="receipt"
                className="relative w-full"
                initial={{ opacity: 0, y: m.reduced ? 0 : 4 }}
                animate={{ opacity: 1, y: 0, transition: { opacity: pick("foldIn"), y: m.reduced ? instant : { ...spring.control, delay: HANDOFF.foldIn.delay } } }}
                exit={{ opacity: 0, transition: pick("openOut") }}
              >
                <h3 id={`${uid}-receipt`} className="sr-only">
                  {label}
                </h3>
                <div className="relative">
                  <Receipt
                    ref={receiptRef}
                    decision={decision}
                    expired={expired && !decision}
                    expiredAt={deadline}
                    summary={label}
                    mounted={mounted}
                    settled={settled}
                    reducedMotion={m.reduced}
                    expanded={expanded}
                    onToggle={() => setExpanded((e) => !e)}
                    detailId={`${uid}-detail`}
                    undo={
                      <AnimatePresence>
                        {undoable && decision && (
                          <motion.span
                            key="undo"
                            className="ml-auto shrink-0"
                            exit={{ opacity: 0, transition: m.fade({ duration: 0.14 }) }}
                          >
                            <UndoButton
                              ref={undoRef}
                              outcome={decision.outcome}
                              onClick={undo}
                            />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    }
                  />
                  <AnimatePresence>
                    {undoable && win && (
                      <UndoDrain key={win.id} ms={win.ms} reduced={m.reduced} exit={{ opacity: 0, transition: m.fade({ duration: 0.14 }) }} />
                    )}
                  </AnimatePresence>
                </div>
                {/* The original request, read-only: the receipt is an expandable summary. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  {expanded && (
                    <motion.div
                      key="detail"
                      id={`${uid}-detail`}
                      role="group"
                      aria-label="Original request"
                      className="w-full pb-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: pick("openIn") }}
                      exit={{ opacity: 0, transition: pick("foldOut") }}
                    >
                      {/* While the undo meter runs it already divides the line from the detail; one rule, not two. */}
                      <div aria-hidden className={cn("mx-5 h-px transition-colors duration-[240ms]", undoable ? "bg-transparent" : "bg-hairline")} />
                      <p className="px-5 pt-3 text-base font-medium leading-[22px] text-ink-2 [text-wrap:pretty]">{action}</p>
                      {facts}
                      {decision?.outcome === "changes" && decision.note && (
                        <div className="mx-5 mt-3 rounded-md bg-surface px-3 py-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
                          <p className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">Your note</p>
                          <p className="mt-1 text-sm leading-5 text-ink-2 [text-wrap:pretty]">{decision.note}</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {status}
        </span>
      </VisuallyHidden>
    </motion.section>
  );
}

/* ── pending rule: pencil with a gap → closes on decision → settles ── */

function PendingRule({ state }: { state: "asking" | "decided" | "committed" | "closed" }) {
  const m = useMotionTokens();
  const color =
    state === "asking" || state === "decided" ? "var(--bis-pencil)" : state === "committed" ? "var(--bis-rule)" : "var(--bis-hairline)";
  const t = m.fade(tween.drain);
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-3.5 left-[9px] top-3.5 z-10 w-[2px]">
      <motion.span
        className="absolute inset-x-0 top-0 h-[10px] rounded-t-full"
        initial={false}
        animate={{ backgroundColor: color }}
        transition={t}
      />
      <motion.span
        className="absolute inset-x-0 bottom-0 rounded-b-full"
        initial={false}
        animate={{ top: state === "asking" ? 15 : 10, backgroundColor: color }}
        transition={{ top: m.move(spring.latch), backgroundColor: t }}
      />
    </span>
  );
}

/* ── risk badge: text + meter glyph, never colour alone ── */

function RiskBadge({ risk }: { risk: ApprovalRisk }) {
  const r = RISK[risk];
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-xs pl-1.5 pr-2 text-xs font-medium", r.tone)}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={1 + i * 3.75}
            y={9 - (i + 1) * 2.5 + 1}
            width="2.5"
            height={(i + 1) * 2.5 + 1}
            rx="0.5"
            fill="currentColor"
            opacity={i < r.level ? 1 : 0.28}
          />
        ))}
      </svg>
      {r.label}
    </span>
  );
}

/* ── preview peek ── */

function PreviewPeek({ label, defaultOpen, className, children }: { label: string; defaultOpen: boolean; className?: string; children: ReactNode }) {
  const m = useMotionTokens();
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [full, setFull] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    setFull(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFull(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Before measuring (SSR, tests) assume it needs a peek.
  const needsPeek = full === 0 || full > PEEK + 24;
  const clipped = needsPeek && !open;

  return (
    <div className={cn("overflow-hidden rounded-md bg-surface shadow-[inset_0_0_0_1px_var(--bis-hairline)]", className)}>
      <div className="flex h-8 items-center gap-2 pl-3 pr-1 [box-shadow:inset_0_-1px_0_var(--bis-hairline)]">
        <span className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">{label}</span>
        {needsPeek && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            aria-label={`${open ? "Collapse" : "Expand"} ${label.toLowerCase()}`}
            onClick={() => setOpen((o) => !o)}
            className="focus-ring ml-auto flex h-6 items-center gap-1 rounded-sm px-2 text-xs text-ink-2 transition-colors duration-[90ms] hover:bg-sunken hover:text-ink hover:duration-0"
          >
            {open ? "Collapse" : "Expand"}
            <motion.span
              aria-hidden
              className="inline-flex"
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={m.move(spring.control)}
            >
              <Icon name="chevronDown" size={12} />
            </motion.span>
          </button>
        )}
      </div>
      <motion.div
        id={id}
        initial={false}
        animate={{ height: clipped ? PEEK : full || "auto" }}
        transition={m.reduced ? { duration: 0 } : spring.layout}
        className={cn(
          "relative overflow-hidden",
          clipped && "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
        )}
        // While clipped, the peek is a picture of the preview: nothing below the fold can take focus.
        // Expand to read or interact with it (the toggle says so).
        inert={clipped}
      >
        <div ref={content}>{children}</div>
      </motion.div>
    </div>
  );
}

/* ── receipt line ── */

function Receipt({
  decision,
  expired,
  expiredAt,
  summary,
  mounted,
  settled,
  reducedMotion,
  undo,
  expanded,
  onToggle,
  detailId,
  ref,
}: {
  decision: ApprovalDecision | null;
  expired: boolean;
  expiredAt: number | null;
  summary: string;
  mounted: boolean;
  /** Committed (or expired): no undo left. */
  settled: boolean;
  reducedMotion: boolean;
  undo: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  detailId: string;
  ref?: Ref<HTMLDivElement>;
}) {
  const m = useMotionTokens();
  const outcome = decision?.outcome;
  const at = decision?.at ?? expiredAt;
  const by = decision?.by;
  const head =
    outcome === "approved" ? "Approved" : outcome === "rejected" ? "Rejected" : outcome === "changes" ? "Changes requested" : "Expired";
  const icon = outcome === "approved" ? "check" : outcome === "rejected" ? "x" : outcome === "changes" ? "comment" : "clock";

  return (
    <div ref={ref} tabIndex={-1} className="focus-ring flex min-h-11 items-center gap-2 py-2 pl-5 pr-2 text-sm outline-none">
      {/* Provisional (pencil) while it can be undone; the outcome colour only once committed, draining with the rule. */}
      <span
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center transition-colors duration-[240ms]",
          !settled ? "text-pencil" : outcome === "approved" ? "text-ok" : "text-muted",
        )}
      >
        {outcome === "approved" ? <DrawnCheck reduced={reducedMotion} /> : <Icon name={icon} size={14} />}
      </span>
      <p className="flex min-w-0 flex-1 items-center gap-2">
        <span className={cn("shrink-0 font-medium transition-colors duration-[240ms]", settled ? "text-ink-2" : "text-ink")}>{head}</span>
        <span aria-hidden className="-mx-0.5 shrink-0 text-muted">
          ·
        </span>
        {/* The subject comes first and truncates last: it is what the reviewer is deciding whether to undo. */}
        {outcome === "changes" && decision?.note ? (
          <span className="min-w-0 truncate text-ink-2" title={decision.note}>
            <VisuallyHidden>Note: </VisuallyHidden>“{decision.note}”
          </span>
        ) : (
          <span className="min-w-0 truncate text-muted" title={summary}>
            {summary}
          </span>
        )}
        {/* Attribution only once committed; it gives way before the subject does. */}
        <AnimatePresence initial={false}>
          {settled && mounted && (by || at != null) && (
            <motion.span
              key="meta"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: m.fade(tween.drain) }}
              className="ml-auto min-w-0 shrink-[8] truncate pl-1 text-muted"
            >
              {by && <>by {by}</>}
              {by && at != null && (
                <span aria-hidden className="mx-1.5">
                  ·
                </span>
              )}
              {at != null && (
                <>
                  <VisuallyHidden>{by ? " at " : "at "}</VisuallyHidden>
                  <time dateTime={new Date(at).toISOString()} className="tabular font-mono text-2xs">
                    {clock(at)}
                  </time>
                </>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </p>
      {undo}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={expanded ? "Hide request" : "Show request"}
        onClick={onToggle}
        className="focus-ring flex size-7 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-[90ms] hover:bg-sunken hover:text-ink hover:duration-0"
      >
        <motion.span aria-hidden className="inline-flex" initial={false} animate={{ rotate: expanded ? 180 : 0 }} transition={m.move(spring.control)}>
          <Icon name="chevronDown" size={12} />
        </motion.span>
      </button>
    </div>
  );
}

function UndoButton({
  outcome,
  onClick,
  ref,
}: {
  outcome: ApprovalOutcome;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
}) {
  const noun = outcome === "approved" ? "approval" : outcome === "rejected" ? "rejection" : "change request";
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={`Undo ${noun}`}
      className="focus-ring flex h-7 items-center gap-1 rounded-sm px-2 text-xs text-ink-2 transition-colors duration-[90ms] hover:bg-sunken hover:text-ink hover:duration-0"
    >
      <Icon name="undo" size={12} />
      Undo
    </button>
  );
}

/**
 * The undo window as a meter along the receipt's bottom edge: a faint track with the pencil bar
 * draining over it — time, not a link. The card's one live mark.
 */
function UndoDrain({ ms, reduced, exit }: { ms: number; reduced: boolean; exit: TargetAndTransition }) {
  const steps = Math.max(1, Math.round(ms / 1000));
  return (
    <motion.span
      aria-hidden
      // Appears once the fold has landed, so it never draws across a half-folded card.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: reduced ? { duration: 0.12 } : { duration: 0.12, delay: 0.26 } }}
      exit={exit}
      className="pointer-events-none absolute inset-x-5 bottom-1.5 h-px bg-rule"
    >
      <motion.span
        className="absolute inset-0 origin-left bg-pencil"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{
          type: "tween",
          duration: ms / 1000,
          // Reduced motion: step once a second instead of sweeping.
          ease: reduced ? (t: number) => Math.floor(t * steps) / steps : "linear",
        }}
      />
    </motion.span>
  );
}

function DrawnCheck({ reduced }: { reduced: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" aria-hidden>
      <motion.path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.28, ease: ease.out, delay: 0.14 }}
      />
    </svg>
  );
}

/* ── email preview ── */

export interface ApprovalEmailPreviewProps {
  /** Sender line, e.g. "Ostra <beta@ostra.studio>". */
  from: ReactNode;
  /** Recipient line, e.g. "Beta testers (214)". */
  to: ReactNode;
  subject: ReactNode;
  /** The message body. */
  children: ReactNode;
  className?: string;
}

/** A plain, honest rendering of an outgoing email for `ApprovalCard`'s `preview`. */
export function ApprovalEmailPreview({ from, to, subject, children, className }: ApprovalEmailPreviewProps) {
  return (
    <div className={cn("text-sm", className)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 pb-2 pt-2.5">
        <dt className="font-mono text-2xs leading-[18px] text-muted">From</dt>
        <dd className="min-w-0 truncate text-ink-2">{from}</dd>
        <dt className="font-mono text-2xs leading-[18px] text-muted">To</dt>
        <dd className="min-w-0 truncate text-ink-2">{to}</dd>
        <dt className="font-mono text-2xs leading-[18px] text-muted">Subject</dt>
        <dd className="min-w-0 font-medium text-ink">{subject}</dd>
      </dl>
      <div className="mx-3 h-px bg-hairline" />
      <div className="space-y-2 px-3 pb-3 pt-2.5 leading-[20px] text-ink-2 [text-wrap:pretty]">{children}</div>
    </div>
  );
}
