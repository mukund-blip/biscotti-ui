"use client";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import {
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { spring, surfaceVariants, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon, type IconName } from "../../icons";
import { Kbd, Spinner, VisuallyHidden } from "../../lib/primitives";
import { cn, isMac, useControllable } from "../../lib/utils";
import { fuzzyMatch } from "./fuzzy";

export { fuzzyMatch, type FuzzyResult } from "./fuzzy";

/* ── types ───────────────────────────────────────────────────── */

export interface CommandItem {
  /** Unique within its page. */
  id: string;
  title: string;
  /** Secondary text shown after the title (muted). Also searched. */
  subtitle?: string;
  /** An icon name from the Detent set, or any node (avatar, swatch). */
  icon?: IconName | ReactNode;
  /** Extra search terms that don't appear on screen. */
  keywords?: string[];
  /** Key hints shown right-aligned, e.g. ["⌘", "⇧", "P"]. Display only. */
  shortcut?: string[];
  disabled?: boolean;
  /** Runs the command. The palette flashes the row in ink and closes. */
  onSelect?: () => void;
  /** Push a nested page instead of running. Functions are resolved lazily. */
  page?: CommandPageDef | (() => CommandPageDef);
  /** Keep the palette open after running (toggles, repeated actions). */
  keepOpen?: boolean;
}

export interface CommandGroupDef {
  id: string;
  label: string;
  items: CommandItem[];
  /**
   * `idle`: only while the query is empty (Suggestions, Recent).
   * `searching`: only while there is a query. Default `always`.
   */
  showWhen?: "always" | "idle" | "searching";
}

export interface CommandSource {
  id: string;
  /** Group label, e.g. "Orders". */
  label: string;
  /** Shown with a spinner while searching, e.g. "Searching orders…". */
  loadingLabel?: string;
  /** Shown (muted) when the search rejects. Default "Couldn’t search {label}". */
  errorLabel?: string;
  /** Minimum query length before searching. Default 1. */
  minQuery?: number;
  /** Debounce in ms. Default 140. */
  debounce?: number;
  search: (query: string, signal: AbortSignal) => Promise<CommandItem[]>;
}

export interface CommandPageDef {
  id: string;
  /** Shown as the breadcrumb chip in the input. */
  title: string;
  placeholder?: string;
  groups: CommandGroupDef[];
  sources?: CommandSource[];
}

export interface CommandPaletteProps {
  /** Root groups. Order is the resting order; a query re-ranks by match quality. */
  groups: CommandGroupDef[];
  /** Async result groups (searched after local groups). */
  sources?: CommandSource[];
  placeholder?: string;
  /** Controlled query for the current page. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Fired after any command runs, with the path of page titles that led to it. */
  onRun?: (item: CommandItem, path: string[]) => void;
  /** Escape at the root page. The dialog closes; inline palettes usually ignore it. */
  onDismiss?: () => void;
  /** Called after the execute flash, when the palette should close. */
  onDone?: () => void;
  /** Shown when nothing matches. Receives the query. */
  emptyState?: ReactNode | ((query: string) => ReactNode);
  /** Focus the input on mount. Default false (the dialog turns it on). */
  autoFocus?: boolean;
  /** Visible list height cap in px. Default 360. */
  maxListHeight?: number;
  /** Show the key-hint footer. Default true. */
  footer?: boolean;
  /** Allow this instance to play sounds. */
  sound?: boolean;
  className?: string;
  /** @internal set by CommandPaletteDialog */
  inDialog?: boolean;
}

/* ── model ───────────────────────────────────────────────────── */

type Row = { item: CommandItem; indices: number[]; subIndices: number[]; score: number };
type Section = { id: string; label: string; rows: Row[]; loading?: string; error?: string; async?: boolean };
type SourceState = { status: "idle" | "loading" | "done" | "error"; query: string; items: CommandItem[] };
type Frame = { page: CommandPageDef; query: string; activeId: string | null };

function rankGroups(groups: CommandGroupDef[], query: string): Section[] {
  const q = query.trim();
  const searching = q.length > 0;
  const sections: (Section & { best: number; order: number })[] = [];
  groups.forEach((g, order) => {
    if (g.showWhen === "idle" && searching) return;
    if (g.showWhen === "searching" && !searching) return;
    const rows: Row[] = [];
    for (const item of g.items) {
      if (!searching) { rows.push({ item, indices: [], subIndices: [], score: 0 }); continue; }
      const t = fuzzyMatch(q, item.title);
      const s = item.subtitle ? fuzzyMatch(q, item.subtitle) : null;
      let kw: number | null = null;
      for (const k of item.keywords ?? []) {
        const r = fuzzyMatch(q, k);
        if (r && (kw == null || r.score > kw)) kw = r.score;
      }
      const cands = [t ? t.score : null, s ? s.score * 0.6 : null, kw != null ? kw * 0.75 : null].filter((x): x is number => x != null);
      if (!cands.length) continue;
      const score = Math.max(...cands);
      // Only underline the field that actually won (or the title if it matched at all).
      rows.push({ item, indices: t ? t.indices : [], subIndices: !t && s ? s.indices : [], score });
    }
    if (!rows.length) return;
    if (searching) rows.sort((a, b) => b.score - a.score);
    sections.push({ id: g.id, label: g.label, rows, best: rows[0].score, order });
  });
  if (searching) {
    sections.sort((a, b) => b.best - a.best || a.order - b.order);
    // The same command can live in two groups (e.g. Recent + Actions); show it once.
    const seen = new Set<string>();
    for (const s of sections) s.rows = s.rows.filter((r) => (seen.has(r.item.id) ? false : (seen.add(r.item.id), true)));
    return sections.filter((s) => s.rows.length > 0);
  }
  return sections;
}

const slug = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/* ── highlighted text ───────────────────────────────────────── */

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>;
  const set = new Set(indices);
  const out: ReactNode[] = [];
  let run = "";
  let runOn = set.has(0);
  for (let i = 0; i < text.length; i++) {
    const on = set.has(i);
    if (on !== runOn) {
      out.push(runOn ? <mark key={i} className="bg-transparent text-current underline decoration-pencil decoration-[1.5px] underline-offset-[3px]">{run}</mark> : <Fragment key={i}>{run}</Fragment>);
      run = "";
      runOn = on;
    }
    run += text[i];
  }
  out.push(runOn ? <mark key="end" className="bg-transparent text-current underline decoration-pencil decoration-[1.5px] underline-offset-[3px]">{run}</mark> : <Fragment key="end">{run}</Fragment>);
  return <>{out}</>;
}

/* ── the palette (inline) ───────────────────────────────────── */

export function CommandPalette({
  groups,
  sources,
  placeholder = "Search commands…",
  query: queryProp,
  defaultQuery = "",
  onQueryChange,
  onRun,
  onDismiss,
  onDone,
  emptyState,
  autoFocus = false,
  maxListHeight = 360,
  footer = true,
  sound: soundOn = true,
  className,
  inDialog = false,
}: CommandPaletteProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const uid = useId().replace(/:/g, "");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useControllable(queryProp, defaultQuery, onQueryChange);
  const [stack, setStack] = useState<Frame[]>([]);
  const [dir, setDir] = useState<1 | -1>(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [srcState, setSrcState] = useState<Record<string, SourceState>>({});
  const [announce, setAnnounce] = useState("");
  const scrollOnChange = useRef(false);
  const pageChangedAt = useRef(0);

  const root: CommandPageDef = useMemo(() => ({ id: "__root", title: "", placeholder, groups, sources }), [placeholder, groups, sources]);
  const page = stack.length ? stack[stack.length - 1].page : root;
  const depth = stack.length;
  const path = stack.map((f) => f.page.title);

  /* async sources ---------------------------------------------- */
  const pageSources = page.sources ?? [];
  useEffect(() => {
    if (!pageSources.length) return;
    const q = query.trim();
    const ctrls: AbortController[] = [];
    const timers: number[] = [];
    for (const src of pageSources) {
      const key = `${page.id}/${src.id}`;
      if (q.length < (src.minQuery ?? 1)) {
        setSrcState((s) => (s[key]?.status === "idle" ? s : { ...s, [key]: { status: "idle", query: q, items: [] } }));
        continue;
      }
      setSrcState((s) => ({ ...s, [key]: { status: "loading", query: q, items: [] } }));
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      timers.push(
        window.setTimeout(() => {
          src.search(q, ctrl.signal).then(
            (items) => { if (!ctrl.signal.aborted) setSrcState((s) => ({ ...s, [key]: { status: "done", query: q, items } })); },
            () => { if (!ctrl.signal.aborted) setSrcState((s) => ({ ...s, [key]: { status: "error", query: q, items: [] } })); },
          );
        }, src.debounce ?? 140),
      );
    }
    return () => { ctrls.forEach((c) => c.abort()); timers.forEach((t) => window.clearTimeout(t)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page.id, pageSources]);

  /* sections + flat option list --------------------------------- */
  const sections = useMemo(() => {
    const local = rankGroups(page.groups, query);
    const q = query.trim();
    for (const src of pageSources) {
      const st = srcState[`${page.id}/${src.id}`];
      if (!st || st.status === "idle" || q.length < (src.minQuery ?? 1)) continue;
      if (st.status === "loading") local.push({ id: `src-${src.id}`, label: src.label, rows: [], loading: src.loadingLabel ?? `Searching ${src.label.toLowerCase()}…`, async: true });
      else if (st.status === "error") local.push({ id: `src-${src.id}`, label: src.label, rows: [], error: src.errorLabel ?? `Couldn’t search ${src.label.toLowerCase()}`, async: true });
      else if (st.items.length)
        local.push({
          id: `src-${src.id}`,
          label: src.label,
          async: true,
          rows: st.items.map((item) => ({ item, indices: fuzzyMatch(q, item.title)?.indices ?? [], subIndices: [], score: 0 })),
        });
    }
    return local;
  }, [page, query, srcState, pageSources]);

  const options = useMemo(() => sections.flatMap((s) => s.rows.map((r) => r.item)), [sections]);
  const enabled = useMemo(() => options.filter((o) => !o.disabled), [options]);
  const activeItem = enabled.find((o) => o.id === activeId) ?? enabled[0] ?? null;
  const activeIdx = activeItem ? options.indexOf(activeItem) : -1;
  const optId = (i: number) => `${uid}-${depth}-o-${i}`;
  const anyLoading = sections.some((s) => s.loading);

  /* announcements (debounced so typing isn't chattered) --------- */
  useEffect(() => {
    if (anyLoading) return;
    const t = window.setTimeout(() => {
      const n = options.length;
      const where = depth ? `${page.title}. ` : "";
      setAnnounce(query.trim() || depth ? `${where}${n === 0 ? "No results" : `${n} ${n === 1 ? "result" : "results"}`}` : "");
    }, depth && !query ? 60 : 400);
    return () => window.clearTimeout(t);
  }, [options.length, query, depth, page.title, anyLoading]);

  /* keep keyboard highlight visible ----------------------------- */
  useEffect(() => {
    if (!scrollOnChange.current) return;
    scrollOnChange.current = false;
    if (activeIdx < 0) return;
    document.getElementById(optId(activeIdx))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  /* height between pages: spring; between queries: instant ------ */
  const height = useMotionValue<number | "auto">("auto");
  const measureRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      const prev = height.get();
      const recentPage = performance.now() - pageChangedAt.current < 450;
      if (prev === "auto" || !recentPage || m.reduced) { height.jump(h); return; }
      animate(height, h, spring.layout);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height, m.reduced]);

  /* actions ------------------------------------------------------ */
  const move = (to: number) => {
    if (!enabled.length) return;
    const cur = activeItem ? enabled.indexOf(activeItem) : 0;
    const n = enabled.length;
    const next = to === Infinity ? n - 1 : to === -Infinity ? 0 : (((cur + to) % n) + n) % n;
    scrollOnChange.current = true;
    setActiveId(enabled[next].id);
  };

  const changeQuery = (q: string) => {
    setQuery(q);
    setActiveId(null);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const push = (item: CommandItem) => {
    const next = typeof item.page === "function" ? item.page() : item.page!;
    pageChangedAt.current = performance.now();
    setDir(1);
    setStack((s) => [...s, { page: next, query, activeId: item.id }]);
    setQuery("");
    setActiveId(null);
  };

  const pop = () => {
    if (!stack.length) return;
    const top = stack[stack.length - 1];
    pageChangedAt.current = performance.now();
    setDir(-1);
    setStack((s) => s.slice(0, -1));
    setQuery(top.query);
    setActiveId(top.activeId);
    scrollOnChange.current = true;
  };

  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const run = (item: CommandItem | null) => {
    if (!item || item.disabled || flashId) return;
    if (item.page) { push(item); return; }
    // State changes on the input frame; the flash only confirms it.
    item.onSelect?.();
    onRun?.(item, path);
    play("confirm");
    setFlashId(item.id);
    resetTimer.current = window.setTimeout(() => {
      setFlashId(null);
      if (item.keepOpen) return;
      if (onDone) onDone();
      else {
        // Inline palettes return to the root, ready for the next command.
        pageChangedAt.current = depth ? performance.now() : 0;
        setDir(-1);
        setStack([]);
        setQuery("");
        setActiveId(null);
      }
    }, m.reduced ? 160 : 140);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    switch (true) {
      case e.key === "ArrowDown" || (ctrl && e.key === "n"):
        e.preventDefault(); move(1); break;
      case e.key === "ArrowUp" || (ctrl && e.key === "p"):
        e.preventDefault(); move(-1); break;
      case e.key === "PageDown":
        e.preventDefault(); move(5); break;
      case e.key === "PageUp":
        e.preventDefault(); move(-5); break;
      case e.key === "Home" && (e.metaKey || e.ctrlKey):
        e.preventDefault(); move(-Infinity); break;
      case e.key === "End" && (e.metaKey || e.ctrlKey):
        e.preventDefault(); move(Infinity); break;
      case e.key === "Enter":
        e.preventDefault(); run(activeItem); break;
      case e.key === "Backspace" && depth > 0 && e.currentTarget.value === "" :
        e.preventDefault(); pop(); break;
      case e.key === "Escape":
        e.preventDefault();
        e.stopPropagation();
        if (depth > 0) pop();
        else onDismiss?.();
        break;
      case e.key === "Tab" && inDialog:
        // The input is the only stop inside the dialog.
        e.preventDefault(); break;
    }
  };

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  // Keep focus in the input across page changes.
  useEffect(() => {
    if (document.activeElement && listRef.current?.contains(document.activeElement)) inputRef.current?.focus();
  }, [depth]);

  /* render ------------------------------------------------------- */
  const listId = `${uid}-list-${depth}`;
  const placeholderNow = page.placeholder ?? (depth ? `Search ${page.title.toLowerCase()}…` : placeholder);
  const searching = query.trim().length > 0;
  const empty = !sections.length;
  let optIndex = -1;

  const pageVariants = {
    enter: (d: number) => ({ opacity: 0, x: m.reduced ? 0 : d * 14 }),
    center: { opacity: 1, x: 0, transition: { x: m.move(spring.glide), opacity: m.fade(tween.fade) } },
    exit: (d: number) => ({ opacity: 0, x: m.reduced ? 0 : d * -14, transition: { x: m.move(spring.glide), opacity: m.fade({ duration: 0.09, ease: "linear" }) } }),
  };

  const actionLabel = activeItem?.page ? "Open" : "Run";

  return (
    <div
      className={cn("flex w-full flex-col overflow-hidden rounded-lg bg-raised text-ink", inDialog ? "shadow-3" : "shadow-2", className)}
      data-detent="command-palette"
    >
      {/* input row */}
      <div className="flex h-12 shrink-0 items-center gap-2 px-3.5 [box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
        <AnimatePresence initial={false} mode="popLayout">
          {depth === 0 ? (
            <motion.span key="search" className="flex shrink-0 text-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.fade()}>
              <Icon name="search" size={16} />
            </motion.span>
          ) : (
            <motion.span key="crumbs" className="flex shrink-0 items-center gap-1" initial={{ opacity: 0, x: m.reduced ? 0 : -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ x: m.move(spring.glide), opacity: m.fade() }}>
              {stack.map((f, i) => (
                <button
                  key={f.page.id + i}
                  type="button"
                  tabIndex={-1}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    // Jump back to this level.
                    pageChangedAt.current = performance.now();
                    setDir(-1);
                    const target = stack[i + 1];
                    setStack((s) => s.slice(0, i + 1));
                    if (target) { setQuery(target.query); setActiveId(target.activeId); }
                    inputRef.current?.focus();
                  }}
                  className={cn(
                    "flex h-6 max-w-[180px] items-center gap-1 truncate rounded-xs px-1.5 text-xs transition-colors duration-[90ms]",
                    i === stack.length - 1 ? "bg-[color-mix(in_srgb,var(--dt-ink)_6%,transparent)] text-ink shadow-[inset_0_0_0_1px_var(--dt-hairline)]" : "text-muted hover:text-ink",
                  )}
                >
                  {i === 0 && <Icon name="chevronLeft" size={12} className="-ml-0.5 text-muted" />}
                  <span className="truncate">{f.page.title}</span>
                </button>
              ))}
              {/* the depth separator lives in the input's padding */}
            </motion.span>
          )}
        </AnimatePresence>
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeIdx >= 0 ? optId(activeIdx) : undefined}
          aria-autocomplete="list"
          aria-label={depth ? `${page.title}: search` : "Search commands"}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          placeholder={placeholderNow}
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-muted"
        />
        {inDialog && <Kbd aria-hidden className="shrink-0">esc</Kbd>}
      </div>

      {/* results */}
      <motion.div style={{ height }} className="relative overflow-hidden">
        <div ref={measureRef}>
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            <motion.div key={`${depth}-${page.id}`} custom={dir} variants={pageVariants} initial="enter" animate="center" exit="exit" className="w-full">
              <div
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={depth ? page.title : "Commands"}
                className="overflow-y-auto overscroll-contain px-1.5 pb-1.5"
                style={{ maxHeight: maxListHeight }}
              >
                {empty ? (
                  <EmptyState query={query} content={emptyState} />
                ) : (
                  sections.map((sec) => (
                    <div key={sec.id} role="group" aria-labelledby={`${uid}-${depth}-g-${slug(sec.id)}`}>
                      <div
                        id={`${uid}-${depth}-g-${slug(sec.id)}`}
                        className="sticky top-0 z-10 -mx-1.5 flex h-8 items-end bg-raised px-3.5 pb-1.5 font-mono text-2xs uppercase tracking-[0.06em] text-muted"
                      >
                        {sec.label}
                      </div>
                      {sec.loading && (
                        <div role="presentation" className="flex h-10 items-center gap-3 rounded-md px-2.5 text-sm text-muted">
                          <span className="flex size-6 items-center justify-center"><Spinner size={14} /></span>
                          <span>{sec.loading}</span>
                        </div>
                      )}
                      {sec.error && (
                        <div role="presentation" className="flex h-10 items-center gap-3 rounded-md px-2.5 text-sm text-muted">
                          <span className="flex size-6 items-center justify-center"><Icon name="alert" size={14} className="text-warn" /></span>
                          <span>{sec.error}</span>
                        </div>
                      )}
                      {sec.rows.map((row) => {
                        optIndex++;
                        const i = optIndex;
                        const item = row.item;
                        const active = activeItem?.id === item.id && !item.disabled;
                        const flashing = flashId === item.id;
                        return (
                          <div
                            key={item.id}
                            id={optId(i)}
                            role="option"
                            aria-selected={active}
                            aria-disabled={item.disabled || undefined}
                            aria-haspopup={item.page ? "listbox" : undefined}
                            onPointerMove={() => { if (!item.disabled && activeId !== item.id && !flashId) setActiveId(item.id); }}
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => run(item)}
                            className={cn(
                              "group/opt relative flex h-10 scroll-mt-8 items-center gap-3 rounded-md px-2.5 text-base",
                              item.disabled ? "cursor-default text-muted opacity-60" : "cursor-pointer",
                              flashing
                                ? "bg-ink text-on-ink"
                                : active
                                  ? "bg-[color-mix(in_srgb,var(--dt-ink)_6%,transparent)] text-ink"
                                  : "text-ink-2 transition-colors duration-[90ms]",
                            )}
                          >
                            {/* the highlight's pencil tick: selected, not yet committed */}
                            <span aria-hidden className={cn("absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full", active && !flashing ? "bg-pencil" : "bg-transparent")} />
                            <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center", flashing ? "text-on-ink" : active ? "text-ink" : "text-muted")}>
                              {typeof item.icon === "string" ? <Icon name={item.icon as IconName} size={16} /> : isValidElement(item.icon) ? item.icon : null}
                            </span>
                            <span className="flex min-w-0 flex-1 items-baseline gap-2">
                              <span className={cn("truncate", flashing ? "text-on-ink" : active ? "text-ink" : undefined)}>
                                <Highlight text={item.title} indices={row.indices} />
                              </span>
                              {item.subtitle && (
                                <span className={cn("truncate text-sm", flashing ? "text-on-ink/70" : "text-muted")}>
                                  <Highlight text={item.subtitle} indices={row.subIndices} />
                                </span>
                              )}
                            </span>
                            {item.shortcut && (
                              <span aria-hidden className="flex shrink-0 items-center gap-0.5">
                                {item.shortcut.map((k, ki) => <Kbd key={ki} className={flashing ? "bg-transparent text-on-ink" : undefined}>{k}</Kbd>)}
                              </span>
                            )}
                            {item.page && <Icon aria-hidden name="chevronRight" size={14} className={cn("shrink-0", flashing ? "text-on-ink" : active ? "text-ink-2" : "text-muted")} />}
                            {item.shortcut && <VisuallyHidden>{`, shortcut ${item.shortcut.join(" ")}`}</VisuallyHidden>}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {footer && (
        <div className="flex h-9 shrink-0 items-center gap-4 px-3.5 text-2xs text-muted [box-shadow:inset_0_1px_0_var(--dt-hairline)]">
          <span className="tabular min-w-0 flex-1 truncate font-mono">
            {anyLoading ? "" : searching ? `${options.length} ${options.length === 1 ? "result" : "results"}` : depth ? path.join(" › ") : ""}
          </span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> <span className="w-7">{actionLabel}</span></span>
          <span className="hidden items-center gap-1 sm:flex"><Kbd>↑</Kbd><Kbd>↓</Kbd> Move</span>
          {depth > 0 ? (
            <span className="flex items-center gap-1"><Kbd>⌫</Kbd> Back</span>
          ) : inDialog ? (
            <span className="flex items-center gap-1"><Kbd>esc</Kbd> Close</span>
          ) : null}
        </div>
      )}
      <VisuallyHidden><span role="status" aria-live="polite" aria-atomic="true">{announce}</span></VisuallyHidden>
    </div>
  );
}

function EmptyState({ query, content }: { query: string; content: CommandPaletteProps["emptyState"] }) {
  const custom = typeof content === "function" ? content(query) : content;
  return (
    <div className="flex flex-col items-center gap-1 px-6 pb-7 pt-8 text-center">
      {custom ?? (
        <>
          <p className="text-base text-ink">No commands match “{query.trim()}”</p>
          <p className="text-sm text-muted">Try fewer letters, or a word from the command’s name.</p>
        </>
      )}
    </div>
  );
}

/* ── dialog wrapper ─────────────────────────────────────────── */

export interface CommandPaletteDialogProps extends Omit<CommandPaletteProps, "onDismiss" | "onDone" | "inDialog" | "autoFocus"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Global shortcut that toggles the palette. `"mod+k"` = ⌘K on Mac, Ctrl+K elsewhere.
   * Pass `false` to bind it yourself. Default `"mod+k"`.
   */
  hotkey?: string | false;
  /** Accessible name of the dialog. Default "Command palette". */
  label?: string;
  /** Render into this element instead of document.body. */
  container?: HTMLElement | null;
}

function matchHotkey(e: KeyboardEvent, combo: string) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop();
  const want = new Set(parts);
  const mod = want.has("mod");
  const metaWanted = want.has("meta") || (mod && isMac());
  const ctrlWanted = want.has("ctrl") || (mod && !isMac());
  return (
    e.key.toLowerCase() === key &&
    e.metaKey === metaWanted &&
    e.ctrlKey === ctrlWanted &&
    e.altKey === want.has("alt") &&
    e.shiftKey === want.has("shift")
  );
}

/** ⌘K modal palette: scrim, focus containment, focus restore, scroll lock. */
export function CommandPaletteDialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  hotkey = "mod+k",
  label = "Command palette",
  container,
  sound: soundOn = true,
  ...palette
}: CommandPaletteDialogProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const [open, setOpenRaw] = useControllable(openProp, defaultOpen, onOpenChange);
  const [mounted, setMounted] = useState(false);
  const restoreRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => setMounted(true), []);

  const setOpen = useCallback(
    (next: boolean, voice: "open" | "close" | null) => {
      if (next === openRef.current) return;
      if (next) restoreRef.current = document.activeElement as HTMLElement | null;
      if (voice) play(voice);
      setOpenRaw(next);
    },
    [play, setOpenRaw],
  );

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || !matchHotkey(e, hotkey)) return;
      e.preventDefault();
      setOpen(!openRef.current, openRef.current ? "close" : "open");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkey, setOpen]);

  // Remember the opener when opened from outside (controlled), and lock page scroll.
  useEffect(() => {
    if (!open) return;
    if (!restoreRef.current) restoreRef.current = document.activeElement as HTMLElement | null;
    const html = document.documentElement;
    const prev = html.style.overflow;
    const prevPad = html.style.paddingRight;
    const gap = window.innerWidth - html.clientWidth;
    html.style.overflow = "hidden";
    if (gap > 0) html.style.paddingRight = `${gap}px`;
    return () => { html.style.overflow = prev; html.style.paddingRight = prevPad; };
  }, [open]);

  const restoreFocus = () => {
    const el = restoreRef.current;
    restoreRef.current = null;
    if (el && el.isConnected && typeof el.focus === "function") el.focus({ preventScroll: true });
  };

  if (!mounted) return null;
  const v = surfaceVariants("top", m.reduced);
  return createPortal(
    <AnimatePresence onExitComplete={restoreFocus}>
      {open && (
        <div key="cp" className="fixed inset-0 z-[90]" data-detent="command-palette-dialog">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-[var(--dt-scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: m.fade(tween.surfaceIn) }}
            exit={{ opacity: 0, transition: m.fade(tween.surfaceOut) }}
            onPointerDown={() => setOpen(false, "close")}
          />
          <div className="pointer-events-none absolute inset-x-0 top-[min(18vh,140px)] flex justify-center px-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              className="pointer-events-auto w-full max-w-[620px]"
              // Clicks on chrome (labels, footer) must not pull focus out of the input.
              onPointerDown={(e) => { if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault(); }}
              variants={v}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <CommandPalette
                {...palette}
                sound={soundOn}
                inDialog
                autoFocus
                onDismiss={() => setOpen(false, "close")}
                onDone={() => setOpen(false, null)}
              />
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    container ?? document.body,
  );
}
