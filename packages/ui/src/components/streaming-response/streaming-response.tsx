"use client";
import { PreviewCard } from "@base-ui/react/preview-card";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { VisuallyHidden } from "../../lib/primitives";
import { cn, fmt, useControllable } from "../../lib/utils";
import { parseMarkdown, toPlainText, type MdBlock, type MdInline } from "./markdown";
import type { TextStream, TextStreamStatus } from "./use-text-stream";

export interface StreamingSource {
  /** Citation number as written in the text: `[1]` → 1. */
  n: number;
  title: string;
  /** Shown in mono, e.g. "digikey.com". */
  domain: string;
  url?: string;
  /** Quoted passage, rendered as provenance (serif italic). */
  quote?: string;
}

export type StreamingFeedback = "up" | "down" | null;

export interface StreamingResponseProps {
  /** The text received so far (markdown). Ignored when `stream` is given. */
  text?: string;
  /** Stream state. Ignored when `stream` is given. */
  status?: TextStreamStatus;
  /** Convenience: pass the result of `useTextStream()` directly. Wires text, status, Stop and Regenerate. */
  stream?: Pick<TextStream, "text" | "status" | "stop" | "restart">;
  /** Sources for inline `[n]` citations. */
  sources?: StreamingSource[];
  /** Follow-up suggestions shown as quiet chips once complete. */
  suggestions?: string[];
  onSuggestion?: (suggestion: string) => void;
  /** Stop button while streaming. Defaults to `stream.stop`. */
  onStop?: () => void;
  /** Regenerate / retry. Defaults to `stream.restart`. */
  onRegenerate?: () => void;
  /** Called after the plain-text answer is copied. */
  onCopy?: (text: string) => void;
  /** Shows a share action when provided. */
  onShare?: () => void;
  feedback?: StreamingFeedback;
  defaultFeedback?: StreamingFeedback;
  onFeedbackChange?: (feedback: StreamingFeedback) => void;
  /** Externally measured duration of the stream (e.g. scripted replays). Falls back to a local clock. */
  elapsedMs?: number;
  /** Cap the body height and scroll; follows new content while the reader is at the bottom. */
  maxHeight?: number;
  /** Accessible name of the response region. */
  label?: string;
  sound?: boolean;
  className?: string;
}

/* ── chunk log: which recently appended ranges should fade in ─────────── */
type Chunk = { start: number; at: number };
const FRESH_MS = 420;

function useChunkLog(text: string) {
  const committed = useRef<{ text: string; log: Chunk[]; gen: number }>({ text: "", log: [], gen: 0 });
  const prev = committed.current;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  let log: Chunk[];
  let gen = prev.gen;
  if (text.startsWith(prev.text)) {
    log = prev.log.filter((c) => now - c.at < FRESH_MS);
    if (text.length > prev.text.length) log = [...log, { start: prev.text.length, at: now }];
  } else {
    log = []; // scrubbed backwards / new answer — nothing animates
    gen++;
  }
  if (!text && prev.text) gen = prev.gen + 1;
  useLayoutEffect(() => {
    committed.current = { text, log, gen };
  });
  return { log, gen };
}

/** Runs once per mounted chunk span: a 160 ms opacity lift on the newly appended text. */
function fadeIn(el: HTMLSpanElement | null) {
  if (!el || el.dataset.lit) return;
  el.dataset.lit = "1";
  const age = performance.now() - Number(el.dataset.at);
  if (age > 140 || typeof el.animate !== "function") return;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: reduced ? 120 : 160, easing: "cubic-bezier(.2,.8,.2,1)" });
}

interface Ctx {
  src: string;
  log: Chunk[];
  sources: Map<number, StreamingSource>;
}

function Txt({ from, to, ctx }: { from: number; to: number; ctx: Ctx }) {
  const { src, log } = ctx;
  const first = log[0]?.start ?? Infinity;
  if (to <= first) return <>{src.slice(from, to)}</>;
  const out: ReactNode[] = [];
  if (from < first) out.push(<Fragment key="settled">{src.slice(from, first)}</Fragment>);
  log.forEach((c, k) => {
    const a = Math.max(from, c.start);
    const b = Math.min(to, log[k + 1]?.start ?? Infinity);
    if (b > a)
      out.push(
        <span key={`c${c.start}`} ref={fadeIn} data-at={c.at}>
          {src.slice(a, b)}
        </span>,
      );
  });
  return <>{out}</>;
}

function Inlines({ nodes, ctx }: { nodes: MdInline[]; ctx: Ctx }) {
  return (
    <>
      {nodes.map((n) => {
        if (n.t === "text") return <Txt key={`t${n.from}`} from={n.from} to={n.to} ctx={ctx} />;
        if (n.t === "strong")
          return (
            <strong key={`s${n.from}`} className="font-semibold text-ink">
              <Inlines nodes={n.children} ctx={ctx} />
            </strong>
          );
        if (n.t === "em")
          return (
            <em key={`e${n.from}`} className="italic">
              <Inlines nodes={n.children} ctx={ctx} />
            </em>
          );
        if (n.t === "code")
          return (
            <code key={`k${n.from}`} className="rounded-xs bg-sunken px-[5px] py-[1px] font-mono text-[0.86em] text-ink shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
              <Txt from={n.from} to={n.to} ctx={ctx} />
            </code>
          );
        if (n.t === "cite") return <Citation key={`c${n.from}`} n={n.n} source={ctx.sources.get(n.n)} />;
        return null;
      })}
    </>
  );
}

/* ── citations ─────────────────────────────────────────────────────── */
function Citation({ n, source }: { n: number; source?: StreamingSource }) {
  const marker = "inline-grid h-[15px] min-w-[15px] place-items-center rounded-xs px-[3px] font-mono text-[10px] leading-none tabular";
  if (!source)
    return (
      <sup className="ml-[1px]">
        <span className={cn(marker, "text-muted")}>{n}</span>
      </sup>
    );
  return (
    <sup className="ml-[1px] align-[0.38em] leading-none">
      <PreviewCard.Root>
        <PreviewCard.Trigger
          href={source.url}
          target={source.url ? "_blank" : undefined}
          rel="noreferrer"
          delay={160}
          closeDelay={120}
          aria-label={`Source ${n}: ${source.title}, ${source.domain}`}
          className={cn(
            marker,
            "focus-ring bg-sunken text-ink-2 no-underline shadow-[inset_0_0_0_1px_var(--dt-hairline)] hover:bg-well hover:text-ink data-[popup-open]:bg-ink data-[popup-open]:text-on-ink data-[popup-open]:shadow-none",
          )}
        >
          {n}
        </PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Positioner side="top" sideOffset={8} align="start" alignOffset={-12} collisionPadding={12} className="z-50">
            <PreviewCard.Popup
              className={cn(
                "w-[min(320px,calc(100vw-24px))] origin-[var(--transform-origin)] rounded-lg bg-raised p-3 text-left shadow-3",
                "transition-[opacity,transform] duration-200 ease-[cubic-bezier(.16,1,.3,1)] data-[ending-style]:duration-[140ms] data-[ending-style]:ease-[cubic-bezier(.5,0,.75,0)]",
                "data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-0.5 data-[ending-style]:opacity-0",
                "motion-reduce:translate-y-0 motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[ending-style]:translate-y-0 motion-reduce:duration-[120ms]",
              )}
            >
              <SourceCard source={source} />
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    </sup>
  );
}

function SourceCard({ source }: { source: StreamingSource }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5 font-mono text-2xs text-muted">
        <span className="tabular grid h-[15px] min-w-[15px] place-items-center rounded-xs bg-sunken px-[3px] text-[10px] text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-hairline)]">{source.n}</span>
        <span className="truncate">{source.domain}</span>
        {source.url && <Icon name="arrowUpRight" size={11} className="ml-auto shrink-0" />}
      </div>
      <p className="text-sm font-medium leading-[18px] text-ink">{source.title}</p>
      {source.quote && (
        <blockquote className="border-l-2 border-rule pl-2.5 font-serif text-[14.5px] italic leading-[20px] text-ink-2">“{source.quote}”</blockquote>
      )}
    </div>
  );
}

/* ── blocks ────────────────────────────────────────────────────────── */
function CodeBlock({ block, ctx, caret, sound }: { block: Extract<MdBlock, { t: "code" }>; ctx: Ctx; caret: ReactNode; sound: boolean }) {
  const play = usePlay(sound);
  const [copied, setCopied] = useState(false);
  const to = ctx.src[block.to - 1] === "\n" ? block.to - 1 : block.to;
  const code = ctx.src.slice(block.from, to);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <div className="my-3 overflow-hidden rounded-md bg-sunken shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
      <div className="flex h-8 items-center justify-between pl-3 pr-1 [box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
        <span className="font-mono text-2xs text-muted">{block.lang || "text"}</span>
        <button
          type="button"
          disabled={!block.closed}
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => {});
            play("tap", { velocity: 0.5 });
            setCopied(true);
          }}
          aria-label={copied ? "Copied" : "Copy code"}
          className="focus-ring flex h-6 items-center gap-1 rounded-sm px-1.5 text-2xs text-muted transition-colors duration-[90ms] hover:bg-well hover:text-ink disabled:pointer-events-none disabled:opacity-0"
        >
          <Icon name={copied ? "check" : "copy"} size={12} />
          <span className="w-[38px] text-left">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre tabIndex={0} className="focus-ring overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-5 text-ink">
        <code>
          <Txt from={block.from} to={to} ctx={ctx} />
          {caret}
        </code>
      </pre>
    </div>
  );
}

function Block({ block, ctx, caret, sound }: { block: MdBlock; ctx: Ctx; caret: ReactNode; sound: boolean }) {
  switch (block.t) {
    case "p":
      return (
        <p className="my-3 first:mt-0 last:mb-0">
          <Inlines nodes={block.inl} ctx={ctx} />
          {caret}
        </p>
      );
    case "h":
      return (
        <p role="heading" aria-level={Math.min(6, block.level + 2)} className="mb-1.5 mt-5 text-md font-semibold first:mt-0">
          <Inlines nodes={block.inl} ctx={ctx} />
          {caret}
        </p>
      );
    case "ul":
    case "ol": {
      const List = block.t === "ul" ? "ul" : "ol";
      return (
        <List start={block.t === "ol" && block.start !== 1 ? block.start : undefined} className="my-3 grid gap-1.5 first:mt-0 last:mb-0">
          {block.items.map((it, k) => (
            <li key={it.key} className="relative pl-6">
              <span aria-hidden className={cn("absolute left-0 top-0 select-none text-muted", block.t === "ol" ? "tabular w-[18px] text-right font-mono text-xs leading-[22px]" : "left-[6px] top-[10px] h-px w-[7px] bg-ink-2")}>
                {block.t === "ol" ? `${block.start + k}.` : null}
              </span>
              <Inlines nodes={it.inl} ctx={ctx} />
              {k === block.items.length - 1 && caret}
            </li>
          ))}
        </List>
      );
    }
    case "code":
      return <CodeBlock block={block} ctx={ctx} caret={caret} sound={sound} />;
    case "table": {
      const cols = Math.max(block.head.length, ...block.rows.map((r) => r.cells.length));
      const alignCls = (c: number) => (block.align[c] === "right" ? "text-right tabular" : block.align[c] === "center" ? "text-center" : "text-left");
      return (
        <div className="my-3 overflow-x-auto rounded-md shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface">
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} scope="col" className={cn("h-8 px-3 font-mono text-2xs font-normal uppercase tracking-[0.04em] text-muted [box-shadow:inset_0_-1px_0_var(--dt-rule)]", alignCls(c))}>
                    {block.head[c] && <Inlines nodes={block.head[c]} ctx={ctx} />}
                    {!block.rows.length && c === block.head.length - 1 && caret}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={r.key} className="[&:not(:last-child)]:[box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className={cn("h-8 px-3 text-ink", alignCls(c), c === 0 && "text-ink-2")}>
                      {r.cells[c] && <Inlines nodes={r.cells[c]} ctx={ctx} />}
                      {ri === block.rows.length - 1 && c === r.cells.length - 1 && caret}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

/* ── inline glyphs not in the shared icon set ──────────────────────── */
function Glyph({ d, size = 14, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className}>
      <path d={d} />
    </svg>
  );
}
const THUMB = "M5.5 7.25v6.25H3V7.25h2.5zm0 0L8.1 2.6c.5-.9 1.9-.5 1.9.5v2.9h2.6c.9 0 1.5.8 1.3 1.6l-1 4.6c-.2.8-.8 1.3-1.6 1.3H5.5";
const SHARE = "M8 9.5V2.5M5.25 5.25L8 2.5l2.75 2.75M3.5 8.5v4a1 1 0 001 1h7a1 1 0 001-1v-4";

function ActionButton({ label, onClick, children, pressed }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "focus-ring grid size-7 place-items-center rounded-sm transition-colors duration-[90ms] active:translate-y-px",
        pressed ? "bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--dt-hairline)]" : "text-muted hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ── component ─────────────────────────────────────────────────────── */
export function StreamingResponse({
  text: textProp = "",
  status: statusProp = "idle",
  stream,
  sources = [],
  suggestions = [],
  onSuggestion,
  onStop,
  onRegenerate,
  onCopy,
  onShare,
  feedback: feedbackProp,
  defaultFeedback = null,
  onFeedbackChange,
  elapsedMs,
  maxHeight,
  label = "Response",
  sound: soundOn = true,
  className,
}: StreamingResponseProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const text = stream ? stream.text : textProp;
  const status = stream ? stream.status : statusProp;
  const stop = onStop ?? stream?.stop;
  const regenerate = onRegenerate ?? stream?.restart;
  const streaming = status === "streaming";
  const settled = status === "done" || status === "stopped" || status === "error";
  const [feedback, setFeedback] = useControllable<StreamingFeedback>(feedbackProp, defaultFeedback, onFeedbackChange);

  // Only a finished answer is parsed strictly; a stopped or broken one keeps the lenient (optimistic) reading.
  const final = status === "done";
  const doc = useMemo(() => parseMarkdown(text, final), [text, final]);
  const { log, gen } = useChunkLog(text.slice(0, doc.end));
  const sourceMap = useMemo(() => new Map(sources.map((s) => [s.n, s])), [sources]);
  const cited = useMemo(() => {
    const ns = new Set<number>();
    for (const mt of text.matchAll(/\[(\d{1,3})\]/g)) ns.add(Number(mt[1]));
    return sources.filter((s) => ns.has(s.n));
  }, [text, sources]);
  const ctx: Ctx = { src: text, log, sources: sourceMap };

  /* local clock (first chunk → settle) */
  const clock = useRef<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [localElapsed, setLocalElapsed] = useState(0);
  useEffect(() => {
    if (streaming) {
      clock.current = { start: performance.now(), end: null };
      setLocalElapsed(0);
    } else if (settled && clock.current.start != null && clock.current.end == null) {
      clock.current.end = performance.now();
      setLocalElapsed(clock.current.end - clock.current.start);
    }
  }, [streaming, settled, gen]);
  const elapsed = elapsedMs ?? localElapsed;

  /* caret: steady while text flows, blinks while waiting */
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    setWaiting(false);
    if (!streaming) return;
    const t = window.setTimeout(() => setWaiting(true), 550);
    return () => window.clearTimeout(t);
  }, [text, streaming]);
  const caret = streaming ? (
    <span
      aria-hidden
      data-caret=""
      className={cn(
        "relative ml-[1px] inline-block h-[1.05em] w-[2px] translate-y-[0.17em] rounded-[1px] bg-pencil",
        waiting && "motion-safe:animate-[dt-caret_1.05s_ease-in-out_infinite]",
      )}
    />
  ) : status === "stopped" ? (
    <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 whitespace-nowrap rounded-xs bg-sunken px-1.5 py-px align-middle font-mono text-2xs text-muted shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
      <span aria-hidden className="size-[6px] rounded-[1px] bg-muted" />
      Stopped
    </span>
  ) : null;

  /* scroll anchoring */
  const viewport = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const measureEdges = () => {
    const el = viewport.current;
    if (!el) return;
    const next = { top: el.scrollTop > 2, bottom: el.scrollHeight - el.scrollTop - el.clientHeight > 2 };
    setEdges((e) => (e.top === next.top && e.bottom === next.bottom ? e : next));
  };
  const atBottom = () => {
    const el = viewport.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el || !maxHeight) return;
    if (stuck.current) el.scrollTop = el.scrollHeight;
    else if (!atBottom() && text) setUnseen(true);
    measureEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, status, maxHeight]);
  useEffect(() => {
    if (!text) {
      stuck.current = true;
      setUnseen(false);
    }
  }, [text]);
  const lastTop = useRef(0);
  const onScroll = () => {
    const el = viewport.current;
    if (!el) return;
    measureEdges();
    const up = el.scrollTop < lastTop.current - 1;
    lastTop.current = el.scrollTop;
    // Moving up always releases the anchor; arriving at the bottom while moving down re-attaches it.
    if (up) stuck.current = false;
    else if (atBottom()) {
      stuck.current = true;
      setUnseen(false);
    }
  };
  const release = (e: React.WheelEvent | React.TouchEvent | React.KeyboardEvent) => {
    if ("deltaY" in e && e.deltaY >= 0) return;
    if ("key" in e && !["ArrowUp", "PageUp", "Home"].includes(e.key)) return;
    stuck.current = false;
  };
  const jump = () => {
    stuck.current = true;
    setUnseen(false);
    viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: m.reduced ? "auto" : "smooth" });
  };

  /* copy */
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);
  const copyAll = () => {
    const plain = toPlainText(text);
    navigator.clipboard?.writeText(plain).catch(() => {});
    play("tap", { velocity: 0.5 });
    setCopied(true);
    onCopy?.(plain);
  };

  /* focus: Stop unmounts when the stream settles — hand focus to the action row. */
  const rowRef = useRef<HTMLDivElement>(null);
  const stopFocused = useRef(false);
  useEffect(() => {
    if (!streaming && stopFocused.current) {
      stopFocused.current = false;
      requestAnimationFrame(() => rowRef.current?.querySelector<HTMLElement>("button")?.focus());
    }
  }, [streaming]);

  const announcement =
    status === "done" ? "Response complete." : status === "stopped" ? "Response stopped. Partial answer kept." : status === "error" ? "The response was interrupted. Partial answer kept." : "";
  const metaLabel =
    status === "done" ? `Wrote for ${fmt.seconds(elapsed)}` : status === "stopped" ? `Stopped after ${fmt.seconds(elapsed)}` : "";

  const body = (
    <div className="text-base leading-[22px] text-ink [overflow-wrap:anywhere]">
      {doc.blocks.length === 0 && streaming ? (
        <p className="m-0">{caret}</p>
      ) : (
        doc.blocks.map((b, k) => <Block key={`${b.t}${b.key}`} block={b} ctx={ctx} caret={k === doc.blocks.length - 1 ? caret : null} sound={soundOn} />)
      )}
    </div>
  );

  return (
    <div className={cn("w-full", className)} data-status={status}>
      <div className="relative">
        <article
          ref={viewport}
          aria-label={label}
          aria-busy={streaming}
          tabIndex={maxHeight ? 0 : undefined}
          onScroll={maxHeight ? onScroll : undefined}
          onWheel={maxHeight ? release : undefined}
          onTouchMove={maxHeight ? release : undefined}
          onKeyDown={maxHeight ? release : undefined}
          className={cn(maxHeight && "focus-ring -mx-2 overflow-y-auto overscroll-contain rounded-sm px-2 [overflow-anchor:none]")}
          style={
            maxHeight
              ? {
                  maxHeight,
                  // Functional edge fades: only where content is actually clipped.
                  maskImage: edges.top || edges.bottom ? `linear-gradient(to bottom, transparent 0, #000 ${edges.top ? 16 : 0}px, #000 calc(100% - ${edges.bottom ? 24 : 0}px), transparent 100%)` : undefined,
                }
              : undefined
          }
        >
          {body}
        </article>
        <AnimatePresence>
          {maxHeight && unseen && (
            <motion.button
              type="button"
              key="jump"
              onClick={jump}
              initial={{ opacity: 0, y: m.reduced ? 0 : 4 }}
              animate={{ opacity: 1, y: 0, transition: m.fade(tween.surfaceIn) }}
              exit={{ opacity: 0, y: m.reduced ? 0 : 2, transition: m.fade(tween.surfaceOut) }}
              className="focus-ring absolute bottom-2 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-md bg-raised pl-2 pr-2.5 text-xs text-ink-2 shadow-3 hover:text-ink"
            >
              <Icon name="arrowDown" size={12} />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Reserved action row — never shifts the text above. */}
      <div ref={rowRef} className="mt-3 flex min-h-8 items-center gap-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {streaming && stop ? (
            <motion.button
              key="stop"
              type="button"
              onFocus={() => (stopFocused.current = true)}
              onBlur={() => (stopFocused.current = false)}
              onClick={() => {
                play("tap", { velocity: 0.6 });
                stop();
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: m.fade({ duration: 0.09 }) }}
              transition={m.fade()}
              className="focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-rule)] transition-colors duration-[90ms] hover:bg-sunken hover:text-ink active:translate-y-px"
            >
              <span aria-hidden className="size-[7px] rounded-[1.5px] bg-current" />
              Stop
            </motion.button>
          ) : status === "error" ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.fade()} className="flex items-center gap-2">
              <Icon name="alert" size={14} className="text-err" />
              <span className="text-sm text-err">Connection lost</span>
              <span className="text-sm text-muted">Partial answer kept.</span>
              {regenerate && (
                <button
                  type="button"
                  onClick={() => {
                    play("tap", { velocity: 0.5 });
                    regenerate();
                  }}
                  className="focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-rule)] hover:bg-sunken hover:text-ink"
                >
                  <Icon name="refresh" size={12} />
                  Retry
                </button>
              )}
            </motion.div>
          ) : settled ? (
            <motion.div
              key="actions"
              initial="hidden"
              animate="shown"
              exit={{ opacity: 0 }}
              variants={{ hidden: {}, shown: { transition: { staggerChildren: m.reduced ? 0 : 0.03 } } }}
              className="flex w-full items-center gap-0.5"
            >
              {[
                <ActionButton key="copy" label={copied ? "Copied" : "Copy response"} onClick={copyAll}>
                  <Icon name={copied ? "check" : "copy"} size={14} />
                </ActionButton>,
                regenerate ? (
                  <ActionButton
                    key="regen"
                    label="Regenerate"
                    onClick={() => {
                      play("tap", { velocity: 0.5 });
                      regenerate();
                    }}
                  >
                    <Icon name="refresh" size={14} />
                  </ActionButton>
                ) : null,
                status === "done" ? (
                  <ActionButton
                    key="up"
                    label="Good response"
                    pressed={feedback === "up"}
                    onClick={() => {
                      play("select", { velocity: 0.5 });
                      setFeedback(feedback === "up" ? null : "up");
                    }}
                  >
                    <Glyph d={THUMB} />
                  </ActionButton>
                ) : null,
                status === "done" ? (
                  <ActionButton
                    key="down"
                    label="Bad response"
                    pressed={feedback === "down"}
                    onClick={() => {
                      play("select", { velocity: 0.5 });
                      setFeedback(feedback === "down" ? null : "down");
                    }}
                  >
                    <Glyph d={THUMB} className="rotate-180 -scale-x-100" />
                  </ActionButton>
                ) : null,
                onShare ? (
                  <ActionButton
                    key="share"
                    label="Share"
                    onClick={() => {
                      play("tap", { velocity: 0.5 });
                      onShare();
                    }}
                  >
                    <Glyph d={SHARE} />
                  </ActionButton>
                ) : null,
              ]
                .filter(Boolean)
                .map((node, k) => (
                  <motion.span
                    key={k}
                    className="inline-flex"
                    variants={{ hidden: { opacity: 0, y: m.reduced ? 0 : 3 }, shown: { opacity: 1, y: 0, transition: m.reduced ? { duration: 0.12 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] } } }}
                  >
                    {node}
                  </motion.span>
                ))}
              <motion.span
                variants={{ hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.24 } } }}
                aria-hidden={!metaLabel}
                className="tabular ml-auto pl-3 font-mono text-2xs text-muted"
              >
                {metaLabel}
              </motion.span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* sources + follow-ups appear once the answer has settled */}
      <AnimatePresence initial={false}>
        {settled && (cited.length > 0 || (status === "done" && suggestions.length > 0)) && (
          <motion.div
            key="after"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={m.reduced ? { duration: 0.12 } : { height: { type: "spring", stiffness: 380, damping: 38 }, opacity: { duration: 0.2, delay: 0.06 } }}
            className="overflow-hidden"
          >
            {cited.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 font-mono text-2xs uppercase tracking-[0.06em] text-muted">Sources</span>
                {cited.map((s) => (
                  <a
                    key={s.n}
                    href={s.url}
                    target={s.url ? "_blank" : undefined}
                    rel="noreferrer"
                    title={s.title}
                    className="focus-ring flex h-6 max-w-[240px] items-center gap-1.5 rounded-xs px-1.5 text-xs text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-hairline)] transition-colors duration-[90ms] hover:bg-sunken hover:text-ink"
                  >
                    <span className="tabular font-mono text-[10px] text-muted">{s.n}</span>
                    <span className="truncate font-mono text-2xs">{s.domain}</span>
                  </a>
                ))}
              </div>
            )}
            {status === "done" && suggestions.length > 0 && (
              <ul aria-label="Suggested follow-ups" className="mt-3 flex flex-wrap gap-1.5 pb-0.5">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => {
                        play("tap", { velocity: 0.45 });
                        onSuggestion?.(s);
                      }}
                      className="focus-ring group flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-hairline)] transition-colors duration-[90ms] hover:bg-sunken hover:text-ink active:translate-y-px"
                    >
                      <Icon name="corner" size={12} className="text-muted group-hover:text-ink-2" />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {announcement}
          {copied ? " Copied to clipboard." : ""}
        </span>
      </VisuallyHidden>
    </div>
  );
}
