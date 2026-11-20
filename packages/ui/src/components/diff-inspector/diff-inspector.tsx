"use client";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { Kbd, VisuallyHidden } from "../../lib/primitives";
import { cn } from "../../lib/utils";

export type DiffLine = { type: "context" | "add" | "del"; text: string };
export type HunkDecision = "pending" | "accepted" | "rejected";

export interface DiffHunk {
  id: string;
  /** Where the change lives: "§ Pricing", "L42–48". */
  location?: string;
  lines: DiffLine[];
  /** Why the change was proposed — rendered as provenance (serif italic). */
  rationale?: ReactNode;
}

export interface DiffInspectorProps {
  title?: ReactNode;
  /** e.g. "docs/launch-notes.md" */
  path?: string;
  hunks: DiffHunk[];
  /** Controlled decisions keyed by hunk id. */
  decisions?: Record<string, HunkDecision>;
  defaultDecisions?: Record<string, HunkDecision>;
  onDecisionsChange?: (d: Record<string, HunkDecision>) => void;
  /** Fired once every hunk is decided. */
  onResolve?: (d: Record<string, HunkDecision>) => void;
  /** Monospace for code; proportional for prose. */
  variant?: "code" | "prose";
  /** Single-key shortcuts (J/K/A/R/U) on the focused change. Default true. */
  shortcuts?: boolean;
  sound?: boolean;
  className?: string;
}

/* ── word-level diff (LCS on tokens) ─────────────────────────── */
type Seg = { text: string; changed: boolean };
function wordDiff(a: string, b: string): [Seg[], Seg[]] {
  const ta = a.split(/(\s+|[.,;:!?()[\]{}"'`])/).filter(Boolean);
  const tb = b.split(/(\s+|[.,;:!?()[\]{}"'`])/).filter(Boolean);
  const n = ta.length, m = tb.length;
  if (n * m > 40000) return [[{ text: a, changed: true }], [{ text: b, changed: true }]];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const A: Seg[] = [], B: Seg[] = [];
  const push = (arr: Seg[], text: string, changed: boolean) => {
    const last = arr.at(-1);
    if (last && last.changed === changed) last.text += text;
    else arr.push({ text, changed });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) { push(A, ta[i], false); push(B, tb[j], false); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push(A, ta[i++], true);
    else push(B, tb[j++], true);
  }
  while (i < n) push(A, ta[i++], true);
  while (j < m) push(B, tb[j++], true);
  return [merge(A), merge(B)];
}

/** Fold whitespace-only gaps between changed runs so phrases highlight as one. */
function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  segs.forEach((s, k) => {
    const bridging = !s.changed && /^\s+$/.test(s.text) && segs[k - 1]?.changed && segs[k + 1]?.changed;
    const seg = bridging ? { text: s.text, changed: true } : s;
    const last = out.at(-1);
    if (last && last.changed === seg.changed) last.text += seg.text;
    else out.push({ ...seg });
  });
  return out;
}

/** Pair consecutive del/add runs so modified lines get word highlights. */
function annotate(lines: DiffLine[]) {
  const out: { line: DiffLine; segs?: Seg[] }[] = lines.map((line) => ({ line }));
  for (let i = 0; i < lines.length; ) {
    if (lines[i].type !== "del") { i++; continue; }
    let d = i; while (d < lines.length && lines[d].type === "del") d++;
    let a = d; while (a < lines.length && lines[a].type === "add") a++;
    const dels = d - i, adds = a - d;
    for (let k = 0; k < Math.min(dels, adds); k++) {
      const [x, y] = wordDiff(lines[i + k].text, lines[d + k].text);
      out[i + k].segs = x;
      out[d + k].segs = y;
    }
    i = a;
  }
  return out;
}

export function DiffInspector({
  title = "Proposed changes",
  path,
  hunks,
  decisions: decisionsProp,
  defaultDecisions,
  onDecisionsChange,
  onResolve,
  variant = "prose",
  shortcuts = true,
  sound: soundOn = true,
  className,
}: DiffInspectorProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const uid = useId();
  const initial = useMemo(() => Object.fromEntries(hunks.map((h) => [h.id, defaultDecisions?.[h.id] ?? "pending"])) as Record<string, HunkDecision>, [hunks, defaultDecisions]);
  const [inner, setInner] = useState(initial);
  const decisions = decisionsProp ?? inner;
  const [focusIdx, setFocusIdx] = useState(0);
  const [announce, setAnnounce] = useState("");
  const history = useRef<Record<string, HunkDecision>[]>([]);
  const hunkRefs = useRef<(HTMLElement | null)[]>([]);
  const resolvedFired = useRef(false);

  // Keep decisions for hunks that survive a refresh; new hunks start pending.
  useEffect(() => {
    if (decisionsProp) return;
    setInner((prev) => Object.fromEntries(hunks.map((h) => [h.id, prev[h.id] ?? initial[h.id] ?? "pending"])) as Record<string, HunkDecision>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hunks]);
  const get = (id: string): HunkDecision => decisions[id] ?? "pending";

  const counts = useMemo(() => {
    const c = { pending: 0, accepted: 0, rejected: 0 };
    hunks.forEach((h) => c[get(h.id)]++);
    return c;
  }, [hunks, decisions]);

  const update = useCallback(
    (next: Record<string, HunkDecision>, sfx: "accept" | "reject" | "undo" | "bulk") => {
      if (sfx !== "undo") history.current.push(decisions);
      if (!decisionsProp) setInner(next);
      onDecisionsChange?.(next);
      const pending = hunks.filter((h) => (next[h.id] ?? "pending") === "pending").length;
      if (pending > 0) resolvedFired.current = false;
      if (pending === 0 && !resolvedFired.current) {
        resolvedFired.current = true;
        onResolve?.(next);
        play("complete");
      } else if (sfx === "accept") play("latch");
      else if (sfx === "reject") play("dismiss");
      else if (sfx === "undo") play("unlatch", { velocity: 0.5 });
      else play("confirm");
    },
    [decisions, decisionsProp, hunks, onDecisionsChange, onResolve, play],
  );

  const decide = (id: string, d: HunkDecision, advance = true) => {
    const idx = hunks.findIndex((h) => h.id === id);
    update({ ...decisions, [id]: d }, d === "accepted" ? "accept" : d === "rejected" ? "reject" : "undo");
    setAnnounce(`Change ${idx + 1} ${d === "pending" ? "returned to review" : d}.`);
    if (advance && d !== "pending") {
      // move focus to the next pending hunk
      const order = [...hunks.slice(idx + 1), ...hunks.slice(0, idx)];
      const nextH = order.find((h) => get(h.id) === "pending" && h.id !== id);
      if (nextH) focusHunk(hunks.indexOf(nextH));
    }
  };

  const focusHunk = (i: number) => {
    const clamped = Math.max(0, Math.min(hunks.length - 1, i));
    setFocusIdx(clamped);
    const el = hunkRefs.current[clamped];
    el?.focus({ preventScroll: true });
    // Let a collapsing neighbour settle first so the page doesn't move twice.
    window.setTimeout(() => el?.scrollIntoView({ block: "nearest", behavior: m.reduced ? "auto" : "smooth" }), m.reduced ? 0 : 260);
  };

  const summaryRef = useRef<HTMLParagraphElement>(null);
  const bulk = (d: "accepted" | "rejected") => {
    const n = counts.pending;
    update(Object.fromEntries(hunks.map((h) => [h.id, get(h.id) === "pending" ? d : get(h.id)])), "bulk");
    setAnnounce(`${n} ${n === 1 ? "change" : "changes"} ${d}. All changes decided.`);
    // The bulk buttons unmount; keep focus in the component.
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  /** Undo the most recent action (a bulk action is one transaction). */
  const undoLast = () => {
    const prev = history.current.pop();
    if (!prev) return;
    update(prev, "undo");
    setAnnounce("Last decision undone.");
  };

  // Handled on the hunk itself only — keys pressed on its buttons keep native behaviour.
  const onHunkKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.target !== e.currentTarget || e.metaKey || e.ctrlKey || e.altKey) return;
    const h = hunks[i];
    const k = e.key.toLowerCase();
    if (e.key === "ArrowDown" || (shortcuts && k === "j")) { e.preventDefault(); focusHunk(i + 1); }
    else if (e.key === "ArrowUp" || (shortcuts && k === "k")) { e.preventDefault(); focusHunk(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusHunk(0); }
    else if (e.key === "End") { e.preventDefault(); focusHunk(hunks.length - 1); }
    else if (get(h.id) === "pending" && (e.key === "Enter" || (shortcuts && k === "a"))) { e.preventDefault(); decide(h.id, "accepted"); }
    else if (get(h.id) === "pending" && shortcuts && k === "r") { e.preventDefault(); decide(h.id, "rejected"); }
    else if (shortcuts && k === "u") { e.preventDefault(); undoLast(); }
  };

  const total = hunks.length;
  const allDone = counts.pending === 0;

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={cn("overflow-hidden rounded-lg bg-raised shadow-2", className)}
    >
      {/* header */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 pt-3.5 [box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
        <div className="min-w-0 flex-1">
          <h3 id={`${uid}-title`} className="truncate text-base font-medium text-ink">{title}</h3>
          {path && <p className="truncate font-mono text-2xs text-muted">{path}</p>}
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {allDone ? (
            <motion.p key="done" ref={summaryRef} tabIndex={-1} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={m.fade(tween.surfaceIn)}
              className="tabular rounded-xs font-mono text-2xs text-ink-2 outline-none">
              Applied {counts.accepted} · Rejected {counts.rejected}
            </motion.p>
          ) : (
            <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.fade()} className="flex items-center gap-1.5">
              <button type="button" onClick={() => bulk("rejected")}
                className="focus-ring h-7 rounded-sm px-2.5 text-sm text-ink-2 hover:bg-sunken hover:text-ink">
                Reject {counts.pending === total ? "all" : "rest"}
              </button>
              <button type="button" onClick={() => bulk("accepted")}
                className="focus-ring h-7 rounded-sm bg-ink px-2.5 text-sm font-medium text-on-ink hover:opacity-90 active:translate-y-px">
                Accept {counts.pending === total ? "all" : "rest"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* progress ruler — one notch per hunk */}
        <div
          className="flex w-full items-center gap-2"
          role="progressbar"
          aria-label="Changes reviewed"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={total - counts.pending}
          aria-valuetext={`${total - counts.pending} of ${total} reviewed: ${counts.accepted} accepted, ${counts.rejected} rejected`}
        >
          <div className="flex flex-1 gap-[3px]">
            {hunks.map((h, i) => {
              const d = get(h.id);
              return (
                <span key={h.id} aria-hidden onClick={() => focusHunk(i)}
                  className={cn("h-[3px] flex-1 cursor-pointer rounded-[1px] transition-colors duration-[240ms]",
                    d === "accepted" ? "bg-ink" : d === "rejected" ? "bg-rule" : i === focusIdx ? "bg-pencil" : "bg-pencil-line")} />
              );
            })}
          </div>
          <span className="tabular font-mono text-2xs text-muted">
            {total - counts.pending}/{total}
          </span>
        </div>
      </header>

      {/* hunks */}
      <div role="list" aria-label="Changes" className={cn("py-1", variant === "code" ? "font-mono text-[12.5px] leading-[20px]" : "text-base leading-[22px]")}>
        {hunks.map((h, i) => (
          <Hunk
            key={h.id}
            ref={(el) => { hunkRefs.current[i] = el; }}
            hunk={h}
            index={i}
            total={total}
            decision={get(h.id)}
            focused={i === focusIdx}
            onFocus={() => setFocusIdx(i)}
            onKeyDown={(e) => onHunkKeyDown(e, i)}
            onDecide={(d) => decide(h.id, d)}
            variant={variant}
          />
        ))}
      </div>

      <footer className="flex items-center gap-3 px-4 py-2 text-2xs text-muted [box-shadow:inset_0_1px_0_var(--dt-hairline)]">
        <span className="flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
        <span className="flex items-center gap-1"><Kbd>A</Kbd> accept</span>
        <span className="flex items-center gap-1"><Kbd>R</Kbd> reject</span>
        <span className="hidden items-center gap-1 sm:flex"><Kbd>U</Kbd> undo last</span>
      </footer>
      <VisuallyHidden><span role="status" aria-live="polite">{announce}</span></VisuallyHidden>
    </section>
  );
}

interface HunkProps {
  hunk: DiffHunk;
  index: number;
  total: number;
  decision: HunkDecision;
  focused: boolean;
  onFocus: () => void;
  onDecide: (d: HunkDecision) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  variant: "code" | "prose";
  ref?: React.Ref<HTMLDivElement>;
}

function Hunk({ hunk, index, total, decision, focused, onFocus, onDecide, onKeyDown, variant, ref }: HunkProps) {
  const m = useMotionTokens();
  const rows = useMemo(() => annotate(hunk.lines), [hunk.lines]);
  const pending = decision === "pending";

  return (
    <div
      ref={ref}
      role="listitem"
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      aria-label={`Change ${index + 1} of ${total}${hunk.location ? `, ${hunk.location}` : ""}, ${decision}`}
      className="group/hunk relative px-4 py-2 outline-none transition-colors duration-[90ms] focus-visible:bg-pencil-soft focus-visible:shadow-[inset_0_0_0_1px_var(--dt-pencil-line)]"
    >
      {/* The signature rule: pencil with a gap while pending; the gap closes on accept. */}
      <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-[2px]">
        {(() => {
          // Accept: pencil → ink at the latch, then recede to a hairline ("finished work shrinks").
          const color =
            decision === "accepted"
              ? m.reduced ? "var(--dt-rule)" : ["var(--dt-pencil)", "var(--dt-ink)", "var(--dt-ink)", "var(--dt-rule)"]
              : decision === "rejected" ? "var(--dt-hairline)" : "var(--dt-pencil)";
          const colorT = m.reduced
            ? { duration: 0.12 }
            : decision === "accepted"
              ? { duration: 1.0, times: [0, 0.2, 0.55, 1], ease: "easeOut" as const }
              : tween.drain;
          return (
            <>
              <motion.span className="absolute inset-x-0 top-0 h-[14px] rounded-t-full" initial={false} animate={{ backgroundColor: color }} transition={colorT} />
              <motion.span
                className="absolute inset-x-0 bottom-0 rounded-b-full"
                initial={false}
                animate={{ top: decision === "accepted" ? 14 : 20, backgroundColor: color }}
                transition={m.reduced ? { duration: 0 } : { top: spring.latch, backgroundColor: colorT }}
              />
            </>
          );
        })()}
      </span>

      <div className="mb-1 flex min-h-6 items-center gap-2">
        {hunk.location && <span className="font-mono text-2xs text-muted">{hunk.location}</span>}
        <span className={cn("font-mono text-2xs transition-colors duration-200",
          decision === "accepted" ? "text-ink-2" : decision === "rejected" ? "text-muted" : "text-pencil-ink")}>
          {decision === "pending" ? "proposed" : decision}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {pending ? (
            <>
              <HunkButton tab={focused} label={`Reject change ${index + 1}${hunk.location ? `, ${hunk.location}` : ""}`} onClick={() => onDecide("rejected")} icon="x">Reject</HunkButton>
              <HunkButton tab={focused} label={`Accept change ${index + 1}${hunk.location ? `, ${hunk.location}` : ""}`} onClick={() => onDecide("accepted")} icon="check" strong={focused}>Accept</HunkButton>
            </>
          ) : (
            <HunkButton tab={focused} label={`Undo decision on change ${index + 1}`} onClick={() => onDecide("pending")} icon="undo" quiet>Undo</HunkButton>
          )}
        </div>
      </div>

      <div className={cn(variant === "code" ? "whitespace-pre" : "whitespace-pre-wrap", "overflow-x-auto")}>
        {rows.map(({ line, segs }, li) => {
          // Settled view: accepted hides deletions; rejected hides additions.
          const hidden = (decision === "accepted" && line.type === "del") || (decision === "rejected" && line.type === "add");
          const marked = pending && line.type !== "context";
          return (
            <AnimatePresence key={li} initial={false}>
              {!hidden && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={m.reduced ? { duration: 0.12 } : { height: spring.layout, opacity: { duration: 0.14 } }}
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "relative -mx-1 rounded-xs px-1 transition-colors duration-[240ms]",
                      line.type === "context" && (pending ? "text-ink-2" : "text-ink"),
                      marked && line.type === "add" && "text-ink",
                      marked && line.type === "del" && "text-muted",
                      !marked && line.type !== "context" && "text-ink",
                    )}
                  >
                    {variant === "code" && (
                      <span aria-hidden className={cn("mr-2 inline-block w-3 select-none text-center", marked ? (line.type === "add" ? "text-ok" : "text-err") : "text-transparent")}>
                        {line.type === "add" ? "+" : line.type === "del" ? "−" : " "}
                      </span>
                    )}
                    {marked && <VisuallyHidden>{line.type === "add" ? "Added: " : "Removed: "}</VisuallyHidden>}
                    {segs && marked
                      ? segs.map((s, si) => (
                          <Fragment key={si}>
                            {s.changed ? (
                              <span className={cn(line.type === "add" ? "rounded-[2px] bg-ok-soft shadow-[0_1px_0_var(--dt-ok)]" : "line-through decoration-err decoration-1")}>{s.text}</span>
                            ) : (
                              s.text
                            )}
                          </Fragment>
                        ))
                      : marked
                        ? <span className={cn(line.type === "add" ? "rounded-[2px] bg-ok-soft shadow-[0_1px_0_var(--dt-ok)]" : "line-through decoration-err decoration-1")}>{line.text}</span>
                        : line.text || "\u00a0"}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {hunk.rationale && pending && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={m.reduced ? { duration: 0.12 } : { height: spring.layout, opacity: { duration: 0.14 } }}
            className="overflow-hidden font-serif text-[14.5px] italic leading-[20px] text-muted"
          >
            <span className="block pt-1.5">{hunk.rationale}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function HunkButton({ children, onClick, icon, label, strong, quiet, tab }: { children: ReactNode; onClick: () => void; icon: "check" | "x" | "undo"; label: string; strong?: boolean; quiet?: boolean; tab: boolean }) {
  return (
    <button
      type="button"
      tabIndex={tab ? 0 : -1}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "focus-ring flex h-6 items-center gap-1 rounded-sm px-2 font-sans text-xs transition-[background-color,color,transform] duration-[90ms] active:translate-y-px",
        strong
          ? "bg-ink text-on-ink shadow-[inset_0_0_0_1px_var(--dt-ink)] hover:opacity-90"
          : quiet
            ? "text-muted hover:bg-sunken hover:text-ink"
            : "text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-edge)] hover:bg-sunken hover:text-ink",
      )}
    >
      <Icon name={icon} size={12} />
      {children}
    </button>
  );
}
