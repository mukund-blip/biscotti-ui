"use client";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon, type IconName } from "../../icons";
import { Spinner, VisuallyHidden } from "../../lib/primitives";
import { cn, fmt, useControllable } from "../../lib/utils";

export type ToolChipKind = "edit" | "search" | "command" | "fetch" | "read";
export type ToolChipStatus = "pending" | "done" | "error";

export interface ToolChipProps {
  /** What the tool does. Picks the icon, the verbs and the metadata format. */
  kind: ToolChipKind;
  /** `pending` is provisional (pencil spinner, present tense); `done` settles to past tense; `error` is marked in err. Default `"done"`. */
  status?: ToolChipStatus;
  /** The tool's subject: a file path, search query, shell command or URL. File paths show their basename in the chip and the full path when expanded. */
  target: string;
  /** Override the verb, e.g. `{ pending: "Patching", done: "Patched" }`. */
  verb?: { pending?: string; done?: string; error?: string };
  /** `edit`: lines added. */
  added?: number;
  /** `edit`: lines removed. */
  removed?: number;
  /** `search`: number of results. */
  results?: number;
  /** `command`: process exit code. Non-zero reads as a failure. */
  exitCode?: number;
  /** `fetch`: HTTP status code. */
  httpStatus?: number;
  /** `read`: line range read, e.g. `[1, 184]`. */
  lines?: [number, number];
  /** Input arguments, shown as a key/value list in the detail card. */
  args?: Record<string, string | number | boolean | null | undefined>;
  /** Tool output. Commands show the last 3 lines until “Show all”; other kinds show 8. Edit output lines starting with `+`/`-` render as a diff. */
  output?: string | string[];
  /** Error message for a failed call, shown in the detail card. */
  error?: string;
  /** Wall time in ms. While pending and expanded a live timer is shown instead. */
  durationMs?: number;
  /** When the call started (epoch ms, e.g. `Date.now()` on your side). The live timer counts from here; without it, it counts from when the chip became pending. */
  startedAt?: number;
  /** Controlled expanded state. */
  open?: boolean;
  /** Initial expanded state when uncontrolled. Default `false`. */
  defaultOpen?: boolean;
  /** Fires when the chip expands or collapses. */
  onOpenChange?: (open: boolean) => void;
  /** Allow this instance to play sounds (still requires global opt-in). Inherits from a surrounding `ToolChipGroup`. */
  sound?: boolean;
  className?: string;
}

const KIND: Record<ToolChipKind, { icon: IconName; pending: string; done: string; noun: string }> = {
  edit: { icon: "pencil", pending: "Editing", done: "Edited", noun: "edit" },
  search: {
    icon: "search",
    pending: "Searching",
    done: "Searched",
    noun: "search",
  },
  command: { icon: "terminal", pending: "Running", done: "Ran", noun: "run" },
  fetch: { icon: "globe", pending: "Fetching", done: "Fetched", noun: "fetch" },
  read: { icon: "file", pending: "Reading", done: "Read", noun: "read" },
};

const TARGET_LABEL: Record<ToolChipKind, string> = {
  edit: "path",
  read: "path",
  fetch: "url",
  search: "pattern",
  command: "command",
};
const isPathKind = (k: ToolChipKind) => k === "edit" || k === "read";
const basename = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;
const plural = (n: number, one: string, many = `${one}s`) => `${fmt.int(n)} ${n === 1 ? one : many}`;
const shortUrl = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** The status-aware verb: "Editing" → "Edited"; failures that still completed keep the past tense. */
function verbFor(p: Pick<ToolChipProps, "kind" | "status" | "verb" | "exitCode" | "httpStatus">) {
  const k = KIND[p.kind];
  const status = p.status ?? "done";
  if (status === "pending") return p.verb?.pending ?? k.pending;
  if (status === "error") {
    if (p.verb?.error) return p.verb.error;
    // A command that exited non-zero, or a fetch that got a response, did run.
    if ((p.kind === "command" && p.exitCode != null) || (p.kind === "fetch" && p.httpStatus != null)) return p.verb?.done ?? k.done;
    return `Couldn’t ${k.noun}`;
  }
  return p.verb?.done ?? k.done;
}

/** Longest the visible target gets (the face caps it at 32ch of mono). */
const TARGET_MAX = 30;

/**
 * Middle truncation for slash-separated targets: keep the first segment (host or root) and as many
 * trailing segments as fit, so "ci.ostra.dev/os-1/firmware/pipelines/412" → "ci.ostra.dev/…/pipelines/412".
 * The end is where the identity is; the start says where it lives.
 */
function truncateMiddle(value: string, max = TARGET_MAX) {
  if (value.length <= max) return value;
  const parts = value.split("/");
  if (parts.length < 3) return value; // nothing to elide in the middle; CSS end-truncates
  const head = parts[0];
  let tail = parts[parts.length - 1];
  for (let i = parts.length - 2; i > 0; i--) {
    const next = `${parts[i]}/${tail}`;
    if (head.length + 3 + next.length > max) break;
    tail = next;
  }
  return `${head}/…/${tail}`;
}

/** The target as written in the face (`short`) or spoken in names and tooltips (full). */
function displayTarget(kind: ToolChipKind, target: string, short = false) {
  if (isPathKind(kind)) return basename(target);
  if (kind === "fetch") return short ? truncateMiddle(shortUrl(target)) : shortUrl(target);
  if (kind === "search") return `“${target}”`;
  return target;
}

/** Spoken metadata (the visual version uses glyphs and colour). */
function metaSentence(p: ToolChipProps) {
  const status = p.status ?? "done";
  if (status === "pending") return "";
  switch (p.kind) {
    case "edit":
      return p.added != null || p.removed != null ? `${plural(p.added ?? 0, "line")} added, ${fmt.int(p.removed ?? 0)} removed` : "";
    case "search":
      return p.results != null ? plural(p.results, "result") : "";
    case "command":
      return p.exitCode != null ? `exit code ${p.exitCode}` : "";
    case "fetch":
      return p.httpStatus != null ? `HTTP ${p.httpStatus}` : "";
    case "read":
      return p.lines ? `lines ${p.lines[0]} to ${p.lines[1]}` : "";
  }
}

/** One-line description of a call, e.g. "Edited encoder.ts, 12 lines added, 3 removed". */
export function describeToolCall(p: ToolChipProps) {
  const meta = metaSentence(p);
  const failed = (p.status ?? "done") === "error" ? ", failed" : "";
  return `${verbFor(p)} ${displayTarget(p.kind, p.target)}${meta ? `, ${meta}` : ""}${failed}`;
}

/**
 * The tick readout leads with the outcome ("Failed · exit 1"), so when the header slot is narrow only the
 * call text truncates, never the result you hovered to see.
 */
function readoutParts(p: ToolChipCall): { outcome: string; call: string; failed: boolean } {
  const status = p.status ?? "done";
  const failed = status === "error";
  let meta = "";
  if (status !== "pending") {
    switch (p.kind) {
      case "edit":
        meta = p.added != null || p.removed != null ? `+${fmt.int(p.added ?? 0)} −${fmt.int(p.removed ?? 0)}` : "";
        break;
      case "search":
        meta = p.results != null ? plural(p.results, "result") : "";
        break;
      case "command":
        meta = p.exitCode != null ? `exit ${p.exitCode}` : "";
        break;
      case "fetch":
        meta = p.httpStatus != null ? `HTTP ${p.httpStatus}` : "";
        break;
      case "read":
        meta = p.lines ? `L${p.lines[0]}–${p.lines[1]}` : "";
        break;
    }
  }
  const outcome = [failed ? "Failed" : status === "pending" ? "Running" : "", meta].filter(Boolean).join(" · ");
  return { outcome, call: `${verbFor(p)} ${displayTarget(p.kind, p.target)}`, failed };
}

const SoundContext = createContext(true);

/** What a chip tells its group (and what `ToolChipGroupStats.active` holds): enough for the summary, ticks, active-call line and jump list. */
export type ToolChipCall = Pick<
  ToolChipProps,
  "kind" | "status" | "target" | "verb" | "added" | "removed" | "results" | "exitCode" | "httpStatus" | "lines" | "durationMs"
>;
interface ToolChipEntry {
  call: ToolChipCall;
  /** Registration sequence: the fallback order before elements exist. */
  seq: number;
  el: () => HTMLElement | null;
  focus: () => void;
}
interface ToolChipGroupContextValue {
  register: (id: string, entry: Omit<ToolChipEntry, "seq">) => void;
  unregister: (id: string) => void;
  /** Chips announce through the group's single live region (theirs may be inert). */
  announce: (message: string) => void;
}
const GroupContext = createContext<ToolChipGroupContextValue | null>(null);

/*
 * One ResizeObserver for every chip on the page; callbacks are fanned out per observed element
 * (chips in one group share a parent list item each, chips inline share their wrapping parent).
 */
const sizeWatchers = new Map<Element, Set<() => void>>();
let sharedObserver: ResizeObserver | null = null;
function watchSize(el: Element, cb: () => void) {
  if (typeof ResizeObserver === "undefined") return () => {};
  sharedObserver ??= new ResizeObserver((entries) => entries.forEach((e) => sizeWatchers.get(e.target)?.forEach((f) => f())));
  let set = sizeWatchers.get(el);
  if (!set) {
    set = new Set();
    sizeWatchers.set(el, set);
    sharedObserver.observe(el);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (!set.size) {
      sizeWatchers.delete(el);
      sharedObserver?.unobserve(el);
    }
  };
}

/* ── 5-cell add/del bar ───────────────────────────────────────── */
/** Always a proportion across all five cells; a non-zero side keeps at least one. */
function toolChipDiffCells(added: number, removed: number) {
  const a = Math.max(0, added);
  const r = Math.max(0, removed);
  if (a + r === 0) return { add: 0, del: 0 };
  if (r === 0) return { add: 5, del: 0 };
  if (a === 0) return { add: 0, del: 5 };
  const add = Math.min(4, Math.max(1, Math.round((5 * a) / (a + r))));
  return { add, del: 5 - add };
}

function DiffCells({ added, removed }: { added: number; removed: number }) {
  const m = useMotionTokens();
  const { add, del } = toolChipDiffCells(added, removed);
  return (
    <span aria-hidden className="flex items-center gap-[2px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ scaleY: m.reduced ? 1 : 0.2, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={
            m.reduced
              ? { duration: 0.12 }
              : {
                  scaleY: { ...spring.control, delay: 0.04 + i * 0.035 },
                  opacity: { duration: 0.1, delay: 0.04 + i * 0.035 },
                }
          }
          data-cell={i < add ? "add" : i < add + del ? "del" : "none"}
          className={cn("h-[8px] w-[5px] rounded-[1px]", i < add ? "bg-ok" : i < add + del ? "bg-err" : "bg-rule")}
        />
      ))}
    </span>
  );
}

function Meta(p: ToolChipProps) {
  const status = p.status ?? "done";
  const err = status === "error";
  const mono = "tabular shrink-0 font-mono text-2xs";
  switch (p.kind) {
    case "edit":
      if (p.added == null && p.removed == null) return null;
      return (
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={cn(mono, "flex gap-1")}>
            <span className="text-ok">+{fmt.int(p.added ?? 0)}</span>
            <span className="text-err">−{fmt.int(p.removed ?? 0)}</span>
          </span>
          <DiffCells added={p.added ?? 0} removed={p.removed ?? 0} />
        </span>
      );
    case "search":
      return p.results != null ? <span className={cn(mono, "text-muted")}>{plural(p.results, "result")}</span> : null;
    case "command":
      return p.exitCode != null ? <span className={cn(mono, p.exitCode !== 0 || err ? "text-err" : "text-muted")}>exit {p.exitCode}</span> : null;
    case "fetch":
      return p.httpStatus != null ? <span className={cn(mono, p.httpStatus >= 400 || err ? "text-err" : "text-muted")}>{p.httpStatus}</span> : null;
    case "read":
      return p.lines ? (
        <span className={cn(mono, "text-muted")}>
          L{p.lines[0]}–{p.lines[1]}
        </span>
      ) : null;
  }
}

/* ── ToolChip ─────────────────────────────────────────────────── */

/**
 * A compact, inline record of one tool call. Click (or Enter/Space) to morph it
 * in place into a detail card with the call's input, output and duration.
 */
export function ToolChip(props: ToolChipProps) {
  const { kind, status = "done", target, durationMs, startedAt, open: openProp, defaultOpen = false, onOpenChange, sound: soundProp, className } = props;
  const m = useMotionTokens();
  const inherited = useContext(SoundContext);
  const group = useContext(GroupContext);
  const announceToGroup = group?.announce;
  const play = usePlay(soundProp ?? inherited);
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);
  const rootRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLButtonElement>(null);
  const detailId = useId();
  const pending = status === "pending";
  const failed = status === "error";
  const verb = verbFor(props);
  const shown = displayTarget(kind, target, true);
  const sentence = describeToolCall(props);
  const { added, removed, results, exitCode, httpStatus, lines } = props;

  // Tell the nearest group about this call (wrappers, memo and fragments all count), keep it current, and leave on unmount.
  const regId = useId();
  const verbKey = props.verb ? `${props.verb.pending ?? ""}|${props.verb.done ?? ""}|${props.verb.error ?? ""}` : "";
  useLayoutEffect(() => {
    group?.register(regId, {
      call: { kind, status, target, verb: props.verb, added, removed, results, exitCode, httpStatus, lines, durationMs },
      el: () => rootRef.current,
      focus: () => faceRef.current?.focus({ preventScroll: true }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, regId, kind, status, target, verbKey, added, removed, results, exitCode, httpStatus, lines?.[0], lines?.[1], durationMs]);
  useLayoutEffect(() => () => group?.unregister(regId), [group, regId]);

  /*
   * Elapsed time counts from when the call started, open or not: `startedAt` if given, else the
   * moment this chip became pending. Open, the card ticks at 10 Hz; collapsed, a quiet 1 Hz clock
   * appears after 3 s so a long call visibly isn't stuck.
   */
  const [pendingSince, setPendingSince] = useState<number | null>(null);
  useLayoutEffect(() => setPendingSince(pending ? Date.now() : null), [pending]);
  const start = pending ? (startedAt ?? pendingSince) : null;
  const ticking = pending && start != null;
  const [now, setNow] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), open ? 100 : 1000);
    return () => window.clearInterval(id);
  }, [ticking, open]);
  const elapsed = start != null && now != null ? Math.max(0, now - start) : 0;
  const duration = durationMs != null ? fmt.seconds(durationMs) : pending ? fmt.seconds(elapsed) : null;
  const clock = pending && !open && elapsed >= COLLAPSED_CLOCK_AFTER ? clockText(elapsed) : null;

  // Announce only real transitions (not the state a chip mounts in). Inside a group, the group speaks.
  const [announce, setAnnounce] = useState("");
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current === status) return;
    prevStatus.current = status;
    if (status !== "pending") (announceToGroup ?? setAnnounce)(sentence);
  }, [status, sentence, announceToGroup]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      faceRef.current?.focus();
    }
  };

  const reduced = m.reduced;
  const layoutT = reduced ? { duration: 0 } : spring.layout;
  // One spring, both directions, for every travelling part of the morph (width, radius, face height and
  // padding, detail height): width and height fold together, so the clip never outlives its content.
  const morphT = layoutT;

  /*
   * Collapsed width. Motion can't animate "auto" → "auto", so when a closed chip's content changes
   * (Running → Ran + metrics) the width would snap. Measure the face's natural width before paint and
   * spring between pixel values instead; open still targets 100%.
   */
  const [closedWidth, setClosedWidth] = useState<number | "auto">("auto");
  const measureClosed = () => {
    const face = faceRef.current;
    if (!face || open) return;
    // max-w-full would resolve against the container's current width and cap the reading, so lift
    // it while measuring; the container's own max-w-full still clamps the result to the parent.
    // Padding may be mid-spring from a close: measure the resting face, not the frame we happen to be on.
    const saved = face.getAttribute("style");
    Object.assign(face.style, {
      width: "max-content",
      minWidth: "0",
      maxWidth: "none",
      paddingLeft: `${FACE.closed.paddingLeft}px`,
      paddingRight: `${FACE.closed.paddingRight}px`,
    });
    const w = Math.ceil(face.getBoundingClientRect().width);
    if (saved == null) face.removeAttribute("style");
    else face.setAttribute("style", saved);
    setClosedWidth((cur) => (typeof cur === "number" && Math.abs(cur - w) < 0.5 ? cur : w));
  };
  // Re-measure only when something that shapes the collapsed face changes (plus fonts.ready and a
  // leaving metric, below), not on every render: each reading forces a layout.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measureClosed, [open, verb, shown, status, added, removed, results, exitCode, httpStatus, lines?.[0], lines?.[1], clock?.length]);
  // Web fonts change glyph widths after first paint.
  useEffect(() => {
    let live = true;
    document.fonts?.ready.then(() => live && measureClosed());
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Open width. The card's body is laid out once at the width it will settle at (the parent's content
   * box) and clipped by the growing chip, so text never rewraps frame by frame during the morph.
   */
  const [openWidth, setOpenWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const read = () => {
      const cs = getComputedStyle(parent);
      const w = parent.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
      if (w > 0) setOpenWidth((cur) => (cur != null && Math.abs(cur - w) < 0.5 ? cur : w));
    };
    read();
    return watchSize(parent, read);
  }, []);

  /*
   * The chip's width is one motion value in px (closed: the measured face; open: the column), so the
   * face's feather can track the moving clip edge exactly. Toggles and content changes spring; a column
   * resize while open, the first sizing and reduced motion jump.
   */
  const width = useMotionValue(0);
  const [sized, setSized] = useState(false);
  const widthTarget = open ? openWidth : typeof closedWidth === "number" ? closedWidth : null;
  const lastOpen = useRef(open);
  useLayoutEffect(() => {
    if (widthTarget == null) return;
    const toggled = lastOpen.current !== open;
    lastOpen.current = open;
    if (!sized || reduced || (open && !toggled)) {
      width.stop();
      width.jump(widthTarget);
      if (!sized) setSized(true);
      return;
    }
    animate(width, widthTarget, morphT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthTarget, open]);
  // Opaque up to the content's resting end (24 px chevron slot + 6 px face padding in from the edge), clear 10 px later.
  const feather = useTransform(width, (w) => `linear-gradient(to right, #000 ${w - 30}px, transparent ${w - 20}px)`);
  const chip = (
    <motion.div
      ref={rootRef}
      // The morph: real width/height (not a scaled FLIP) so text never distorts and neighbours are pushed, not overlapped.
      initial={false}
      animate={{ borderRadius: open ? 6 : 2 }}
      transition={morphT}
      onKeyDown={onKeyDown}
      // Before the first measurement (and on the server) the chip sizes naturally.
      style={{ width: sized && !(open && openWidth == null) ? width : open ? "100%" : "auto" }}
      data-kind={kind}
      data-status={status}
      data-open={open || undefined}
      className={cn(
        "group/chip relative inline-flex max-w-full flex-col overflow-hidden align-middle",
        // Surface → raised is a material change, not travel: a short cross-dissolve.
        "transition-[background-color,box-shadow] duration-[140ms] ease-out motion-reduce:duration-[120ms]",
        open ? "bg-raised shadow-1" : "bg-surface",
        // The focus ring is drawn on the chip's outer edge (the face is clipped by the morph), and appears instantly.
        "has-[>[data-chip-face]:focus-visible]:[box-shadow:var(--dt-focus)] has-[>[data-chip-face]:focus-visible]:transition-[background-color]",
        className,
      )}
    >
      {/* hairline: a firmer rule while provisional (the spinner is the only live mark), drains to a quiet hairline when settled */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10 rounded-[inherit] transition-[box-shadow] duration-[240ms] ease-out",
          pending && !open
            ? "shadow-[inset_0_0_0_1px_var(--dt-rule)]"
            : open
              ? "shadow-[inset_0_0_0_1px_var(--dt-hairline)]"
              : "shadow-[inset_0_0_0_1px_var(--dt-hairline)] group-hover/chip:shadow-[inset_0_0_0_1px_var(--dt-rule)]",
        )}
      />
      <motion.button
        ref={faceRef}
        type="button"
        data-chip-face=""
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        aria-busy={pending || undefined}
        // Visual pieces are separate, hidden spans (and glyphs); the name is the plain sentence.
        title={isPathKind(kind) || kind === "fetch" || target.length > TARGET_MAX ? target : undefined}
        onClick={() => setOpen(!open)}
        initial={false}
        animate={open ? FACE.open : FACE.closed}
        transition={morphT}
        /*
         * The face keeps its natural width (never narrower than the chip, never wider than the column).
         * While the chip's width springs, the face is clipped and revealed rather than squeezed, so the
         * target never flickers through a truncation on the way to its new size.
         */
        style={{ maxWidth: openWidth ?? "100%" }}
        className={cn(
          "flex w-max min-w-full shrink-0 items-center gap-1.5 text-left text-xs outline-none",
          "transition-colors duration-[90ms] hover:bg-sunken/60",
        )}
      >
        <span className="sr-only">{sentence}</span>
        {/*
         * Visual content behind a soft right edge that tracks the chip's moving clip (the width motion value),
         * so a metric arriving with the width spring emerges through a 10 px feather, never a hard cut. At rest
         * the feather sits in the chevron slot, past the content.
         */}
        <motion.span aria-hidden className="flex min-w-0 items-center gap-1.5" style={sized ? { maskImage: feather, WebkitMaskImage: feather } : undefined}>
          <span aria-hidden className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="relative grid size-3.5 shrink-0 place-items-center">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={pending ? "spin" : failed ? "err" : "icon"}
                  initial={{ opacity: 0, scale: reduced ? 1 : 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.08 } }}
                  transition={reduced ? { duration: 0.12 } : { opacity: { duration: 0.12 }, scale: spring.control }}
                  className="grid place-items-center"
                >
                  {pending ? (
                    <Spinner size={12} />
                  ) : failed ? (
                    <Icon name="alert" size={14} className="text-err" />
                  ) : (
                    <Icon name={KIND[kind].icon} size={14} className="text-muted" />
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className={cn("shrink-0 whitespace-nowrap", pending || failed ? "text-ink" : "text-ink-2")}>{verb}</span>
            {/* Same cap open or closed (nothing reflows on frame 0); the full target is in the card's Input. */}
            <span className={cn("min-w-0 max-w-[32ch] truncate font-mono text-2xs", pending || failed ? "text-ink" : "text-ink-2")}>{shown}</span>
          </span>
          <AnimatePresence initial={false} onExitComplete={() => measureClosed()}>
            {clock && (
              <motion.span
                key="clock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
                transition={m.fade(tween.fade)}
                aria-hidden
                // Reserved tabular width: the face doesn't change width as the seconds tick (only at 10 s and 1 min).
                className="tabular shrink-0 text-right font-mono text-2xs text-muted"
                style={{ minWidth: `${Math.max(3, clock.length)}ch` }}
              >
                {clock}
              </motion.span>
            )}
            {!pending && (
              <motion.span
                key="meta"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.06 } }}
                // Arrives with the width spring and is revealed by the feathered clip edge (see `feather`).
                transition={m.fade(tween.fade)}
                aria-hidden
                // 10 px (gap + pl-1) before every kind's metric, so "…/pipelines/412  200" never reads as one number.
                className="flex shrink-0 items-center pl-1"
              >
                <Meta {...props} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
      </motion.button>
      {/*
       * Chevron (and the open card's duration) pinned to the chip's right edge, in the room the face
       * reserves in its right padding: it rides the moving edge in every frame of a width spring.
       */}
      <motion.span
        aria-hidden
        initial={false}
        animate={open ? CHEVRON.open : CHEVRON.closed}
        transition={morphT}
        className="pointer-events-none absolute top-0 z-[1] flex items-center"
      >
        <AnimatePresence initial={false}>
          {open && duration && (
            <motion.span
              key="duration"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: m.fade({ duration: 0.16, delay: reduced ? 0 : 0.06, ease: [0.2, 0.8, 0.2, 1] }) }}
              // Under reduced motion the chip snaps closed, so a lingering timer would sit on top of the metric.
              exit={{ opacity: 0, transition: reduced ? { duration: 0 } : { duration: 0.06 } }}
              className="tabular absolute inset-y-0 right-full flex items-center whitespace-nowrap pr-2 font-mono text-2xs text-muted"
            >
              {duration}
            </motion.span>
          )}
        </AnimatePresence>
        <motion.span
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={m.move(spring.control)}
          className="grid size-3.5 place-items-center text-faint group-hover/chip:text-muted"
        >
          <Icon name="chevronRight" size={11} />
        </motion.span>
      </motion.span>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            id={detailId}
            role="region"
            aria-label={`${sentence}: details`}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: layoutT,
                opacity: m.fade({
                  duration: 0.18,
                  delay: reduced ? 0 : 0.05,
                  ease: [0.2, 0.8, 0.2, 1],
                }),
              },
            }}
            // Closing: the body stays opaque and is hidden by the folding clip; only the last sliver fades.
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: layoutT,
                opacity: reduced ? m.fade({ duration: 0.1 }) : { duration: 0.08, delay: 0.16, ease: "linear" },
              },
            }}
            className="w-full min-w-0 overflow-hidden"
          >
            <div style={openWidth != null ? { width: openWidth } : undefined}>
              <ChipDetail {...props} status={status} onCopy={() => play("tap", { velocity: 0.5 })} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!announceToGroup && (
        <VisuallyHidden>
          <span role="status" aria-live="polite">
            {announce}
          </span>
        </VisuallyHidden>
      )}
    </motion.div>
  );
  // Inside a group each chip is its own list item, so wrapped or fragmented chips still list correctly.
  return group ? <ToolChipRow>{chip}</ToolChipRow> : chip;
}

/** A collapsed pending chip shows its elapsed time once the call has run this long. */
const COLLAPSED_CLOCK_AFTER = 3000;

/** Whole seconds, floored so the clock never runs ahead: "3s", "59s", "1m 02s". */
function clockText(ms: number) {
  const s = Math.floor(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
/** Chevron slot: 14 px glyph + 6 px gap, reserved in the face's right padding. */
const CHEVRON_SLOT = 20;

/** Face geometry, closed (h-6 chip) and open (h-8 card header). Animated with the width so nothing snaps on frame 0. */
const FACE = {
  closed: { height: 24, paddingLeft: 6, paddingRight: 4 + CHEVRON_SLOT },
  open: { height: 32, paddingLeft: 10, paddingRight: 8 + CHEVRON_SLOT },
} as const;
const CHEVRON = {
  closed: { height: 24, right: 4 },
  open: { height: 32, right: 8 },
} as const;

/* ── detail card body ─────────────────────────────────────────── */

function ChipDetail({ kind, status, target, args, output, error, onCopy }: ToolChipProps & { onCopy: () => void }) {
  const lines = useMemo(() => (output == null ? [] : Array.isArray(output) ? output : output.replace(/\n$/, "").split("\n")), [output]);
  const limit = kind === "command" ? 3 : 8;
  const [all, setAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const hidden = all ? 0 : Math.max(0, lines.length - limit);
  // Commands keep the tail (where the verdict is); everything else keeps the head.
  const visible = hidden === 0 ? lines : kind === "command" ? lines.slice(-limit) : lines.slice(0, limit);
  const entries = Object.entries(args ?? {}).filter(([, v]) => v != null && v !== "");
  // Without args, the full target is the input (the face caps it at 32ch).
  const showFullTarget = !entries.length;
  const pending = status === "pending";

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(lines.join("\n"));
      setCopied(true);
      onCopy();
    } catch {
      /* clipboard unavailable: leave the button as is */
    }
  };

  const label = "font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted";

  return (
    <div className="grid gap-3 px-2.5 pb-2.5 pt-2 [box-shadow:inset_0_1px_0_var(--dt-hairline)]">
      {(entries.length > 0 || showFullTarget) && (
        <section>
          <h4 className={cn(label, "mb-1.5")}>Input</h4>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-0.5 font-mono text-2xs leading-[18px]">
            {showFullTarget ? (
              <>
                <dt className="text-muted">{TARGET_LABEL[kind]}</dt>
                <dd className="break-all text-ink-2">{target}</dd>
              </>
            ) : (
              entries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all text-ink-2">{String(v)}</dd>
                </div>
              ))
            )}
          </dl>
        </section>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-err">
          <Icon name="alert" size={14} className="mt-[1px] shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {(lines.length > 0 || pending) && (
        <section>
          <div className="flex h-5 items-center justify-between gap-2">
            <h4 className={label}>Output</h4>
            {lines.length > 0 && (
              <button
                type="button"
                onClick={copy}
                aria-label={copied ? "Output copied" : "Copy output"}
                className="focus-ring -mr-1 flex h-6 w-[64px] items-center justify-end gap-1 rounded-sm px-1 text-2xs text-muted transition-colors duration-[90ms] hover:text-ink"
              >
                <Icon name={copied ? "check" : "copy"} size={12} />
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <div className="mt-1 overflow-hidden rounded-sm bg-sunken px-2 py-1.5 font-mono text-2xs leading-[18px] shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
            {hidden > 0 && kind === "command" && <MoreLines n={hidden} onClick={() => setAll(true)} where="earlier" />}
            {visible.length === 0 && pending ? (
              <span className="text-muted">Waiting for output…</span>
            ) : (
              <ol aria-label="Output lines">
                {visible.map((line, i) => (
                  <OutputLine key={i} kind={kind} line={line} />
                ))}
              </ol>
            )}
            {hidden > 0 && kind !== "command" && <MoreLines n={hidden} onClick={() => setAll(true)} where="more" />}
          </div>
        </section>
      )}
    </div>
  );
}

function MoreLines({ n, onClick, where }: { n: number; onClick: () => void; where: "earlier" | "more" }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring -mx-1 flex h-6 items-center gap-1 rounded-xs px-1 text-muted hover:text-ink">
      {where === "earlier" ? "…" : "+"} {plural(n, `${where} line`)}
      <span className="ml-1.5 text-ink-2 underline decoration-rule underline-offset-2">Show all</span>
    </button>
  );
}

/**
 * Only real failure signals turn a line err: a test-runner mark (✗ ×), FAIL, an `Error:` (or
 * `TypeError:` etc.) at the start of a line, npm ERR!, or an exit summary ("1 failed", "exit code 2").
 * Prose that merely mentions errors ("No errors found", "0 failed") stays ink.
 */
function isFailureLine(line: string) {
  const t = line.trim();
  return (
    /^[✗×✘]/.test(t) ||
    /\bFAIL(ED)?\b/.test(t) ||
    /^([A-Z][A-Za-z]*)?Error:/.test(t) ||
    /^npm ERR!/.test(t) ||
    /(^|[\s|,(])[1-9]\d*\s+(failed|failing|errors?)\b/i.test(t) ||
    /\bexit(ed)?( with)?( code| status)?:?\s+[1-9]\d*\b/i.test(t)
  );
}

function OutputLine({ kind, line }: { kind: ToolChipKind; line: string }) {
  if (kind === "edit" && /^[+-]/.test(line)) {
    const add = line[0] === "+";
    return (
      <li className={cn("whitespace-pre-wrap break-all", add ? "text-ink" : "text-muted")}>
        <span aria-hidden className={cn("mr-2 inline-block w-2 select-none", add ? "text-ok" : "text-err")}>
          {add ? "+" : "−"}
        </span>
        <VisuallyHidden>{add ? "Added: " : "Removed: "}</VisuallyHidden>
        {line.slice(1)}
      </li>
    );
  }
  if (kind === "edit" && line.startsWith("@@")) return <li className="whitespace-pre-wrap text-muted">{line}</li>;
  const loc = kind === "search" ? /^(\S+:\d+)\s+(.*)$/.exec(line) : null;
  if (loc)
    return (
      <li className="flex gap-3 whitespace-pre-wrap">
        <span className="shrink-0 text-muted">{loc[1]}</span>
        <span className="min-w-0 break-all text-ink-2">{loc[2]}</span>
      </li>
    );
  const verdict = kind === "command" && isFailureLine(line);
  return <li className={cn("whitespace-pre-wrap break-all", verdict ? "text-err" : "text-ink-2")}>{line || " "}</li>;
}

/* ── ToolChipGroup ────────────────────────────────────────────── */

export interface ToolChipGroupStats {
  /** Number of tool calls. */
  total: number;
  pending: number;
  failed: number;
  /** Distinct files with a completed edit. */
  filesChanged: number;
  /** Sum of known durations. */
  durationMs: number;
  /** The most recent pending call, if any. */
  active?: ToolChipCall;
}

export interface ToolChipGroupProps {
  /**
   * The run's `ToolChip`s, in call order. Chips register with the group through context, so they can
   * be wrapped, memoised or returned from fragments; each renders as its own list item.
   */
  children: ReactNode;
  /** Controlled expanded state. */
  open?: boolean;
  /** Initial expanded state when uncontrolled. Default `false`. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Replace the settled summary ("4 tool calls · 2 files changed"). */
  summary?: (stats: ToolChipGroupStats) => ReactNode;
  /** Allow this group and its chips to play sounds (still requires global opt-in). */
  sound?: boolean;
  className?: string;
}

/** Collapse a run of tool calls into one summary line that expands to the list. */
export function ToolChipGroup({ children, open: openProp, defaultOpen = false, onOpenChange, summary, sound = true, className }: ToolChipGroupProps) {
  const m = useMotionTokens();
  const bodyId = useId();
  const [open, setOpen] = useControllable(openProp, defaultOpen, onOpenChange);

  /* Registry: chips report themselves; the group re-renders when any report changes. */
  const registry = useRef(new Map<string, ToolChipEntry>());
  const seq = useRef(0);
  const [, bump] = useState(0);
  // One polite live region for the whole group: chips inside a collapsed (inert, aria-hidden) body can't speak.
  const [said, setSaid] = useState("");
  const ctx = useMemo<ToolChipGroupContextValue>(
    () => ({
      register: (id, entry) => {
        const prev = registry.current.get(id);
        if (prev && shallowEqual(prev.call, entry.call)) {
          prev.el = entry.el;
          prev.focus = entry.focus;
          return;
        }
        registry.current.set(id, { ...entry, seq: prev?.seq ?? seq.current++ });
        bump((n) => n + 1);
      },
      unregister: (id) => {
        if (registry.current.delete(id)) bump((n) => n + 1);
      },
      announce: (message) => setSaid(message),
    }),
    [],
  );

  // Document order (falls back to registration order before elements exist).
  const entries = [...registry.current.entries()].sort(([, a], [, b]) => {
    const ea = a.el();
    const eb = b.el();
    if (ea && eb && ea !== eb) return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    return a.seq - b.seq;
  });
  const calls = entries.map(([, e]) => e.call);

  // Cheap enough to derive every render.
  const pendingCalls = calls.filter((c) => c.status === "pending");
  const stats: ToolChipGroupStats = {
    total: calls.length,
    pending: pendingCalls.length,
    failed: calls.filter((c) => c.status === "error").length,
    filesChanged: new Set(calls.filter((c) => c.kind === "edit" && (c.status ?? "done") === "done").map((c) => c.target)).size,
    durationMs: calls.reduce((a, c) => a + (c.durationMs ?? 0), 0),
    active: pendingCalls.at(-1),
  };

  const empty = stats.total === 0;
  const running = stats.pending > 0;
  const last = calls.at(-1);
  const endedInError = !running && last?.status === "error";
  const defaultSummary = `${plural(stats.total, "tool call")}${stats.filesChanged ? ` · ${plural(stats.filesChanged, "file")} changed` : ""}`;
  const settledText = summary?.(stats) ?? defaultSummary;
  const showActive = running && !open && stats.active != null;
  // While a call is active, failures belong to other calls: the text never pins them on the active one
  // (visually they live in the ticks only; the name says which).
  const headLabel =
    showActive && stats.active
      ? `${describeToolCall(stats.active)}, ${plural(stats.total, "tool call")} so far` +
        (stats.failed > 0 ? `, ${stats.failed === 1 ? "1 earlier call" : `${fmt.int(stats.failed)} earlier calls`} failed` : "")
      : (typeof settledText === "string" ? settledText : defaultSummary) + (stats.failed > 0 ? ` · ${stats.failed} failed` : "");
  const activeId = stats.active ? entries[calls.indexOf(stats.active)]?.[0] : undefined;
  const headKey = showActive ? `active:${activeId}` : "summary";
  const headRow = "relative -mx-1.5 flex max-w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left text-sm";

  /* Tick readout (visual): the hovered or focused tick's call, shown in the header's text slot. */
  const [preview, setPreview] = useState<string | null>(null);
  const previewEntry = preview ? registry.current.get(preview) : undefined;
  const previewParts = previewEntry ? readoutParts(previewEntry.call) : null;
  const previewText = previewParts ? `${previewParts.outcome}${previewParts.outcome ? " · " : ""}${previewParts.call}` : null;
  const lastPreview = useRef<ReturnType<typeof readoutParts> | null>(null);
  if (previewParts) lastPreview.current = previewParts;
  const shownPreview = previewParts ?? lastPreview.current;

  /* Jump list: a tick expands the group if needed, then scrolls its chip into view and focuses it. */
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const jump = (id: string) => {
    setJumpTo(id);
    if (!open) setOpen(true);
  };
  useEffect(() => {
    if (!jumpTo || !open) return;
    const entry = registry.current.get(jumpTo);
    setJumpTo(null);
    if (!entry) return;
    entry.focus();
    entry.el()?.scrollIntoView?.({ block: "nearest", behavior: m.reduced ? "auto" : "smooth" });
  }, [jumpTo, open, m.reduced]);

  return (
    <div className={cn("w-full text-base", className)} data-state={empty ? "idle" : running ? "running" : endedInError ? "error" : "done"}>
      {empty ? (
        // Nothing to disclose yet: a quiet, inert line until the first call arrives.
        <div className={headRow}>
          <span aria-hidden className="grid size-4 shrink-0 place-items-center">
            <Icon name="tool" size={14} className="text-faint" />
          </span>
          <span className="text-muted">Starting…</span>
        </div>
      ) : (
        // The disclosure button's ::after covers the whole row (so the duration and chevron click through to
        // it); the jump-list ruler sits above it as its own toolbar, not nested inside the button.
        <div className={cn("group/head", headRow)}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={headLabel}
            onClick={() => setOpen(!open)}
            className="flex min-w-0 items-center gap-2 text-left outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:[box-shadow:var(--dt-focus)]"
          >
            <span aria-hidden className="relative grid size-4 shrink-0 place-items-center">
              {running && !open ? (
                <Spinner size={12} />
              ) : endedInError && !running ? (
                <Icon name="alert" size={14} className="text-err" />
              ) : (
                // Expanded while running: the chip's own spinner is the one live mark; the header holds still, in ink.
                <Icon name="tool" size={14} className={running ? "text-ink" : "text-muted"} />
              )}
            </span>
            <span className="relative flex min-w-0">
              {/*
               * Sequenced, not crossfaded: the old line leaves in 60 ms, then the new one arrives, so the two
               * never share a frame. The failure count travels with the summary line so it can't sit next to
               * a still-fading active call.
               */}
              <span
                className={cn("flex min-w-0 transition-opacity motion-reduce:duration-0", previewText ? "opacity-0 duration-0" : "opacity-100 duration-[90ms]")}
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.span
                    key={headKey}
                    data-head-text=""
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: m.fade(tween.fade) }}
                    exit={{ opacity: 0, transition: m.reduced ? { duration: 0 } : { duration: 0.06, ease: "linear" } }}
                    className="min-w-0 truncate whitespace-pre"
                  >
                    {showActive && stats.active ? (
                      <span className="text-ink">
                        {verbFor(stats.active)} <span className="font-mono text-xs">{displayTarget(stats.active.kind, stats.active.target, true)}</span>
                      </span>
                    ) : (
                      <>
                        <span className={cn(running ? "text-ink" : "text-ink-2 group-hover/head:text-ink")}>{settledText}</span>
                        {stats.failed > 0 && <span className="text-muted"> · {stats.failed} failed</span>}
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              {/*
               * Tick readout: hovering or focusing a tick shows that call in the summary's slot (in instantly,
               * 90 ms out). Absolutely placed over the slot, so nothing shifts; visual only (the tick's own
               * accessible name says the same), so it stays out of the live region.
               */}
              <span
                aria-hidden
                data-tick-readout={previewText ? "on" : "off"}
                className={cn(
                  "pointer-events-none absolute inset-0 flex min-w-0 items-center whitespace-pre text-ink transition-opacity motion-reduce:duration-0",
                  previewText ? "opacity-100 duration-0" : "opacity-0 duration-[90ms]",
                )}
              >
                {shownPreview && (
                  <>
                    {shownPreview.outcome && (
                      <span className={cn("shrink-0", shownPreview.failed && "text-err")}>
                        {shownPreview.outcome}
                        <span className="text-muted"> · </span>
                      </span>
                    )}
                    <span className="min-w-0 truncate">{shownPreview.call}</span>
                  </>
                )}
              </span>
            </span>
          </button>
          <ToolChipRuler entries={entries} onJump={jump} onPreview={setPreview} />
          {!running && stats.durationMs > 0 && (
            <span aria-hidden className="tabular shrink-0 font-mono text-2xs text-muted">
              {fmt.seconds(stats.durationMs)}
            </span>
          )}
          <motion.span
            aria-hidden
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={m.move(spring.control)}
            className="grid size-4 shrink-0 place-items-center text-muted group-hover/head:text-ink"
          >
            <Icon name="chevronDown" size={12} />
          </motion.span>
        </div>
      )}

      {/* Always mounted (chips must mount to register); kept mounted while collapsed (inert) so each chip remembers whether it was open. */}
      <motion.div
        id={bodyId}
        initial={false}
        animate={open && !empty ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
        transition={m.reduced ? { height: { duration: 0 }, opacity: { duration: 0.12 } } : { height: spring.layout, opacity: { duration: open ? 0.16 : 0.1 } }}
        inert={!open || empty}
        aria-hidden={!open || empty || undefined}
        // Padding keeps the chips' focus rings inside the clip.
        className="-mx-1 overflow-hidden px-1"
      >
        <SoundContext.Provider value={sound}>
          <GroupContext.Provider value={ctx}>
            <ul aria-label="Tool calls" className="flex flex-col items-start gap-1 pb-1 pl-6 pt-1">
              {children}
            </ul>
          </GroupContext.Provider>
        </SoundContext.Provider>
      </motion.div>
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {said}
        </span>
      </VisuallyHidden>
    </div>
  );
}

function shallowEqual(a: ToolChipCall, b: ToolChipCall) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof ToolChipCall>;
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (x === y) continue;
    if (k === "lines" || k === "verb") {
      if (JSON.stringify(x) === JSON.stringify(y)) continue;
    }
    return false;
  }
  return true;
}

/**
 * The tick ruler as a jump list: one tick per call, each a button ("Go to call 4: Ran pnpm test, failed").
 * A toolbar with one tab stop; arrows, Home and End move between ticks. Each tick keeps its 2 × 10 px
 * mark; the hit area is the full row height and the tick's share of the ruler. Silent: it's navigation.
 */
function ToolChipRuler({
  entries,
  onJump,
  onPreview,
}: {
  entries: [string, ToolChipEntry][];
  onJump: (id: string) => void;
  onPreview: (id: string | null) => void;
}) {
  const m = useMotionTokens();
  const [focusIndex, setFocusIndex] = useState(-1);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  // Roving tab stop: the last focused tick, else the active call, else the latest call.
  const pendingAt = entries.findLastIndex(([, e]) => e.call.status === "pending");
  const stop = focusIndex >= 0 && focusIndex < entries.length ? focusIndex : pendingAt >= 0 ? pendingAt : entries.length - 1;

  const move = (to: number) => {
    const i = Math.max(0, Math.min(entries.length - 1, to));
    setFocusIndex(i);
    refs.current.get(entries[i][0])?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: stop + 1,
      ArrowDown: stop + 1,
      ArrowLeft: stop - 1,
      ArrowUp: stop - 1,
      Home: 0,
      End: entries.length - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    move(keys[e.key]);
  };

  return (
    <div
      role="toolbar"
      aria-label="Jump to call"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="relative z-[1] -my-1 flex shrink-0 self-stretch pl-0.5"
    >
      <AnimatePresence initial={false}>
        {entries.map(([id, e], i) => {
          const c = e.call;
          return (
            <motion.button
              key={id}
              ref={(el: HTMLButtonElement | null) => {
                if (el) refs.current.set(id, el);
                else refs.current.delete(id);
              }}
              type="button"
              tabIndex={i === stop ? 0 : -1}
              aria-label={`Go to call ${i + 1}: ${describeToolCall(c)}`}
              title={describeToolCall(c)}
              onFocus={() => {
                setFocusIndex(i);
                onPreview(id);
              }}
              onBlur={() => onPreview(null)}
              onPointerEnter={() => onPreview(id)}
              onPointerLeave={() => onPreview(null)}
              onClick={() => onJump(id)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={m.fade({ duration: 0.1 })}
              className="group/tick flex h-full w-1 items-center justify-center rounded-[1px] outline-none focus-visible:[box-shadow:var(--dt-focus)]"
            >
              <motion.span
                aria-hidden
                initial={{ scaleY: m.reduced ? 1 : 0 }}
                animate={{ scaleY: 1 }}
                transition={m.reduced ? { duration: 0 } : spring.control}
                className={cn(
                  "h-[10px] w-[2px] origin-bottom rounded-[1px] transition-colors duration-[240ms] group-hover/tick:bg-ink group-hover/tick:duration-0",
                  c.status === "pending" ? "bg-ink-2" : c.status === "error" ? "bg-err" : "bg-rule",
                )}
              />
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function ToolChipRow({ children }: { children: ReactNode }) {
  const m = useMotionTokens();
  return (
    <motion.li
      initial={{ opacity: 0, y: m.reduced ? 0 : -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.reduced ? { duration: 0.12 } : { y: spring.layout, opacity: { duration: 0.16 } }}
      className="flex w-full min-w-0"
    >
      {children}
    </motion.li>
  );
}
