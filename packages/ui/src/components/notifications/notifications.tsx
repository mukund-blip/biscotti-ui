"use client";
import { AnimatePresence, animate, motion, useMotionValue, type PanInfo } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { Kbd, Spinner, VisuallyHidden } from "../../lib/primitives";
import { cn, isMac } from "../../lib/utils";
import { _dismiss, toast, toastStore, type ToastDismissReason, type ToastRecord, type ToastType } from "./store";

export { toast, type ToastOptions, type ToastRecord, type ToastType, type ToastUndo, type ToastDismissReason, type ToastPatch } from "./store";

/* ── shared visuals (toasts + callouts) ─────────────────────── */

type Tone = "neutral" | "info" | "success" | "warning" | "error";

function ToneIcon({ tone, size = 16 }: { tone: Tone; size?: number }) {
  if (tone === "success") return <Icon name="check" size={size} className="text-ok" />;
  if (tone === "error") return <Icon name="alert" size={size} className="text-err" />;
  if (tone === "warning") return <Icon name="alert" size={size} className="text-warn" />;
  if (tone === "info") return <Icon name="info" size={size} className="text-muted" />;
  return null;
}

/** Static pencil arc for a determinate value (does not spin: the bar is the live mark). */
function ProgressRing({ value }: { value: number }) {
  const r = 5.25;
  const c = 2 * Math.PI * r;
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden className="shrink-0 -rotate-90 text-pencil">
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.02, Math.min(1, value)))} style={{ transition: "stroke-dashoffset 240ms cubic-bezier(.2,.8,.2,1)" }} />
    </svg>
  );
}

/* ── Toaster ────────────────────────────────────────────────── */

export type ToastPlacement = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface ToasterProps {
  /** Corner or edge to stack against. Default "bottom-right". */
  placement?: ToastPlacement;
  /** Toasts shown at once; the rest wait their turn. Default 3. */
  maxVisible?: number;
  /** Gap between toasts when fanned out. Default 8. */
  gap?: number;
  /** Distance from the viewport (or container) edge in px. Default 16. */
  edgeOffset?: number;
  /** Only show toasts sent with `{ toaster: id }`. Default "default". */
  id?: string;
  /** Position inside the nearest positioned ancestor instead of the viewport. */
  contained?: boolean;
  /** Focus the newest toast. Default "alt+t". Pass false to disable. */
  hotkey?: "alt+t" | false;
  /** ⌘Z / Ctrl+Z triggers the newest Undo (outside text fields). Default true. */
  undoHotkey?: boolean;
  /** Region name for assistive tech. Default "Notifications". */
  label?: string;
  /** Toast width in px. Default 360. */
  width?: number;
  /** Allow sounds (notify, error, dismiss, confirm). */
  sound?: boolean;
  className?: string;
}

export function Toaster({
  placement = "bottom-right",
  maxVisible = 3,
  gap = 8,
  edgeOffset = 16,
  id: toasterId = "default",
  contained = false,
  hotkey = "alt+t",
  undoHotkey = true,
  label = "Notifications",
  width = 360,
  sound: soundOn = true,
  className,
}: ToasterProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const all = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getServerSnapshot);
  const mine = useMemo(() => all.filter((t) => (t.toaster ?? "default") === toasterId), [all, toasterId]);
  // index 0 = newest, at the front of the stack
  const visible = useMemo(() => mine.slice(-maxVisible).reverse(), [mine, maxVisible]);
  const waiting = Math.max(0, mine.length - maxVisible);

  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLOListElement>(null);
  const lastOutside = useRef<HTMLElement | null>(null);

  const expanded = hovered || focusWithin || dragging;
  const paused = expanded || blurred;
  const bottom = placement.startsWith("bottom");
  const sign = bottom ? -1 : 1;
  const side: "left" | "right" | "center" = placement.endsWith("left") ? "left" : placement.endsWith("right") ? "right" : "center";

  /* window blur / hidden pauses every timer */
  useEffect(() => {
    const sync = () => setBlurred(!document.hasFocus() || document.visibilityState === "hidden");
    window.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { window.removeEventListener("blur", sync); window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync); };
  }, []);

  /* sounds + live announcements on arrival and on outcome changes */
  const seen = useRef(new Map<string, ToastType>());
  const [polite, setPolite] = useState<{ key: string; node: ReactNode } | null>(null);
  const [assertive, setAssertive] = useState<{ key: string; node: ReactNode } | null>(null);
  useEffect(() => {
    const prev = seen.current;
    const next = new Map<string, ToastType>();
    for (const t of mine) {
      next.set(t.id, t.type);
      const before = prev.get(t.id);
      if (before === t.type) continue;
      const node = <>{t.title}{t.description ? <>. {t.description}</> : null}</>;
      if (t.type === "error") setAssertive({ key: `${t.id}:${t.type}`, node });
      else setPolite({ key: `${t.id}:${t.type}`, node });
      if (t.silent) continue;
      if (t.type === "error") play("error");
      else if (before == null) { if (t.type !== "progress") play("notify"); }
      else if (before === "progress" && t.type === "success") play("complete");
    }
    seen.current = next;
  }, [mine, play]);

  /* focus bookkeeping */
  const onFocusIn = (e: React.FocusEvent) => {
    setFocusWithin(true);
    const from = e.relatedTarget as HTMLElement | null;
    if (from && !listRef.current?.contains(from)) lastOutside.current = from;
  };
  const onFocusOut = (e: React.FocusEvent) => {
    if (!listRef.current?.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
  };

  const focusToast = (id: string | undefined) => {
    if (!id) return false;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-toast-id="${id}"] button`);
    el?.focus({ preventScroll: true });
    return !!el;
  };

  /** User-initiated dismissal: sound + keep focus somewhere sensible. */
  const userDismiss = useCallback(
    (id: string, reason: ToastDismissReason) => {
      const hadFocus = !!listRef.current?.querySelector(`[data-toast-id="${id}"]`)?.contains(document.activeElement);
      const idx = visible.findIndex((t) => t.id === id);
      const neighbour = visible[idx + 1] ?? visible[idx - 1];
      if (reason !== "undo") play("dismiss");
      _dismiss(id, reason);
      if (!hadFocus) return;
      requestAnimationFrame(() => {
        if (focusToast(neighbour?.id)) return;
        const back = lastOutside.current;
        if (back?.isConnected) back.focus({ preventScroll: true });
        else (document.activeElement as HTMLElement | null)?.blur?.();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, play],
  );

  const undo = useCallback(
    (t: ToastRecord) => {
      if (!t.undo) return;
      t.undo.onUndo();
      play("confirm");
      toast.update(t.id, { type: "success", title: t.undo.doneTitle ?? "Undone", description: undefined, undo: undefined, action: undefined, duration: 2200, silent: true });
    },
    [play],
  );

  /* hotkeys: Alt+T focuses the newest toast; ⌘Z undoes the newest undoable toast */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hotkey && e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyT") {
        if (focusToast(visible[0]?.id)) e.preventDefault();
        return;
      }
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (!undoHotkey || !mod || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z" || e.defaultPrevented) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const t = visible.find((x) => x.undo);
      if (!t) return;
      e.preventDefault();
      undo(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotkey, undoHotkey, visible, undo]);

  /* geometry */
  const h = (id: string) => heights[id] ?? 64;
  const frontH = visible[0] ? h(visible[0].id) : 0;
  const layout = visible.map((t, i) => {
    if (expanded) {
      let off = 0;
      for (let k = 0; k < i; k++) off += h(visible[k].id) + gap;
      return { y: sign * off, scale: 1, height: h(t.id), content: 1, opacity: 1 };
    }
    const depth = Math.min(i, 3);
    return {
      y: sign * 8 * Math.min(i, 2),
      scale: 1 - 0.04 * Math.min(i, 2),
      height: i === 0 ? h(t.id) : frontH,
      content: i === 0 ? 1 : 0,
      opacity: depth >= 3 ? 0 : 1,
    };
  });
  const stackH = expanded
    ? visible.reduce((s, t, i) => s + h(t.id) + (i ? gap : 0), 0)
    : visible.length ? frontH + 8 * (Math.min(visible.length, 3) - 1) : 0;

  const pos: React.CSSProperties = {
    width,
    maxWidth: `calc(100% - ${edgeOffset * 2}px)`,
    [bottom ? "bottom" : "top"]: edgeOffset,
    ...(side === "left" ? { left: edgeOffset } : side === "right" ? { right: edgeOffset } : { left: "50%", translate: "-50% 0" }),
  };

  return (
    <section
      aria-label={`${label}${hotkey ? ` (${isMac() ? "⌥" : "Alt+"}T)` : ""}`}
      tabIndex={-1}
      className={cn(contained ? "absolute" : "fixed", "z-[85] outline-none", visible.length === 0 && "pointer-events-none", className)}
      style={pos}
      data-detent="toaster"
    >
      <ol
        ref={listRef}
        className="relative m-0 list-none p-0"
        style={{ height: stackH }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse" && !dragging) setHovered(false); }}
        onPointerDown={(e) => { if (e.pointerType !== "mouse") setHovered(true); }}
        onFocus={onFocusIn}
        onBlur={onFocusOut}
      >
        <AnimatePresence initial={false}>
          {visible.map((t, i) => (
            <ToastItem
              key={t.id}
              toast={t}
              index={i}
              layout={layout[i]}
              bottom={bottom}
              side={side}
              paused={paused}
              interactive={expanded || i === 0}
              onHeight={(px) => setHeights((s) => (s[t.id] === px ? s : { ...s, [t.id]: px }))}
              onDismiss={(reason) => userDismiss(t.id, reason)}
              onTimeout={() => {
                t.undo?.onCommit?.();
                _dismiss(t.id, "timeout");
              }}
              onUndo={() => undo(t)}
              onDragState={setDragging}
              reduced={m.reduced}
            />
          ))}
        </AnimatePresence>
      </ol>
      {waiting > 0 && (
        <VisuallyHidden>{`${waiting} more ${waiting === 1 ? "notification" : "notifications"} waiting`}</VisuallyHidden>
      )}
      <VisuallyHidden>
        <span role="status" aria-live="polite" aria-atomic="true">{polite && <span key={polite.key}>{polite.node}</span>}</span>
        <span role="alert" aria-live="assertive" aria-atomic="true">{assertive && <span key={assertive.key}>{assertive.node}</span>}</span>
      </VisuallyHidden>
    </section>
  );
}

/* ── a single toast ─────────────────────────────────────────── */

interface ToastItemProps {
  toast: ToastRecord;
  index: number;
  layout: { y: number; scale: number; height: number; content: number; opacity: number };
  bottom: boolean;
  side: "left" | "right" | "center";
  paused: boolean;
  interactive: boolean;
  reduced: boolean;
  onHeight: (px: number) => void;
  onDismiss: (reason: ToastDismissReason) => void;
  onTimeout: () => void;
  onUndo: () => void;
  onDragState: (d: boolean) => void;
}

function ToastItem({ toast: t, index, layout, bottom, side, paused, interactive, reduced, onHeight, onDismiss, onTimeout, onUndo, onDragState }: ToastItemProps) {
  const m = useMotionTokens();
  const innerRef = useRef<HTMLDivElement>(null);
  const liRef = useRef<HTMLLIElement>(null);
  const x = useMotionValue(0);
  const countdown = useMotionValue(1);
  const remaining = useRef(t.duration);
  const [completing, setCompleting] = useState(false);
  const prevType = useRef(t.type);

  /* measure natural height */
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    onHeight(el.offsetHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* progress → success: hold the full bar in ink for a beat, then collapse it */
  useEffect(() => {
    const was = prevType.current;
    prevType.current = t.type;
    if (was === "progress" && t.type === "success" && t.progress != null) {
      setCompleting(true);
      const id = window.setTimeout(() => setCompleting(false), reduced ? 200 : 520);
      return () => window.clearTimeout(id);
    }
  }, [t.type, t.progress, reduced]);

  /* timer: restarts on timerKey, pauses while hovered/focused/blurred */
  useEffect(() => { remaining.current = t.duration; countdown.set(1); }, [t.timerKey, t.duration, countdown]);
  useEffect(() => {
    if (paused || !Number.isFinite(t.duration)) return;
    const start = performance.now();
    const left = remaining.current;
    const id = window.setTimeout(onTimeout, Math.max(0, left));
    let raf = 0;
    if (t.undo) {
      const tick = () => {
        const now = left - (performance.now() - start);
        countdown.set(Math.max(0, now / t.duration));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(raf);
      remaining.current = left - (performance.now() - start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, t.timerKey, t.duration, !!t.undo]);

  /* swipe */
  const dir = side === "left" ? -1 : 1;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    onDragState(false);
    const w = liRef.current?.offsetWidth ?? 360;
    const dx = info.offset.x;
    const vx = info.velocity.x;
    const toward = side === "center" ? Math.sign(dx || vx) || 1 : dir;
    const far = dx * toward > w * 0.4;
    const fast = vx * toward > 500 && dx * toward > 12;
    if (far || fast) {
      animate(x, toward * (w + 48), { type: "spring", stiffness: 520, damping: 44, velocity: vx }).then(() => onDismiss("swipe"));
    } else {
      animate(x, 0, spring.control);
    }
  };

  const tone: Tone = t.type === "default" || t.type === "progress" ? "neutral" : t.type;
  const showBar = (t.type === "progress" && t.progress != null) || completing;
  const icon =
    t.icon ??
    (t.type === "progress" ? (
      t.progress != null ? <ProgressRing value={t.progress} /> : <Spinner size={14} />
    ) : tone !== "neutral" ? (
      <ToneIcon tone={tone} />
    ) : null);
  const iconKey = t.icon ? "custom" : t.type === "progress" ? (t.progress != null ? "ring" : "spin") : t.type;
  const exitY = layout.y + (bottom ? 10 : -10);

  return (
    <motion.li
      ref={liRef}
      data-toast-id={t.id}
      data-type={t.type}
      aria-hidden={layout.content === 0 ? true : undefined}
      inert={!interactive || undefined}
      className={cn("absolute inset-x-0 overflow-visible", bottom ? "bottom-0" : "top-0")}
      style={{ zIndex: 50 - index, x, transformOrigin: bottom ? "50% 0%" : "50% 100%", touchAction: "pan-y" }}
      initial={{ opacity: 0, y: reduced ? 0 : (bottom ? 1 : -1) * 28, scale: 1 }}
      animate={{ opacity: layout.opacity, y: layout.y, scale: layout.scale }}
      exit={{ opacity: 0, y: reduced ? layout.y : exitY, scale: reduced ? 1 : layout.scale * 0.97, transition: m.fade(tween.surfaceOut) }}
      transition={{ y: m.move(spring.layout), scale: m.move(spring.layout), opacity: m.fade(tween.surfaceIn) }}
      drag={t.dismissible !== false && interactive ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={side === "center" ? 0.9 : side === "right" ? { left: 0.08, right: 0.9 } : { left: 0.9, right: 0.08 }}
      dragMomentum={false}
      onDragStart={() => onDragState(true)}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (e.key === "Escape" && t.dismissible !== false) { e.stopPropagation(); onDismiss("escape"); }
      }}
    >
      <motion.div
        className="group/toast relative overflow-hidden rounded-lg bg-raised shadow-3"
        initial={false}
        animate={{ height: layout.height }}
        transition={m.move(spring.layout)}
      >
        <motion.div ref={innerRef} initial={false} animate={{ opacity: layout.content }} transition={m.fade(tween.fade)}>
          <div className="flex items-start gap-3 py-3 pl-3.5 pr-2.5">
            {icon && (
              <span className="relative flex size-5 shrink-0 items-center justify-center">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={iconKey}
                    className="flex"
                    initial={{ opacity: 0, scale: reduced ? 1 : 0.6 }}
                    animate={{ opacity: 1, scale: 1, transition: { scale: m.move(spring.latch), opacity: m.fade(tween.fade) } }}
                    exit={{ opacity: 0, scale: reduced ? 1 : 0.6, transition: m.fade({ duration: 0.09, ease: "linear" }) }}
                  >
                    {icon}
                  </motion.span>
                </AnimatePresence>
              </span>
            )}
            <div className="min-w-0 flex-1 pt-px">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.p
                  key={`${iconKey}`}
                  className="text-base text-ink"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={m.fade(tween.fade)}
                >
                  {t.title}
                </motion.p>
              </AnimatePresence>
              {t.description && <p className="mt-0.5 text-sm text-muted">{t.description}</p>}
              <AnimatePresence initial={false}>
                {showBar && (
                  <motion.div
                    key="bar"
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ height: m.move(spring.layout), opacity: m.fade(tween.fade) }}
                  >
                    <div className="flex items-center gap-2.5 pt-2">
                      <div className="relative h-[3px] flex-1 overflow-hidden rounded-[1px] bg-sunken" aria-hidden>
                        <motion.div
                          className="absolute inset-y-0 left-0 w-full origin-left"
                          initial={false}
                          animate={{
                            scaleX: completing ? 1 : Math.max(0, Math.min(1, t.progress ?? 0)),
                            backgroundColor: completing ? "var(--dt-ink)" : "var(--dt-pencil)",
                          }}
                          transition={{ scaleX: m.move(spring.control), backgroundColor: m.fade(tween.drain) }}
                        />
                      </div>
                      <span className="tabular w-9 text-right font-mono text-2xs text-muted">
                        {Math.round((completing ? 1 : t.progress ?? 0) * 100)}%
                      </span>
                      <VisuallyHidden>
                        <span role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((completing ? 1 : t.progress ?? 0) * 100)} />
                      </VisuallyHidden>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {(t.undo || t.action) && (
              <div className="flex shrink-0 items-center gap-1">
                {t.action && (
                  <button type="button" onClick={() => { t.action!.onClick(); onDismiss("close"); }}
                    className="focus-ring h-7 rounded-sm px-2 text-sm text-ink-2 transition-colors duration-[90ms] hover:bg-sunken hover:text-ink hover:duration-0">
                    {t.action.label}
                  </button>
                )}
                {t.undo && (
                  <button type="button" onClick={onUndo} aria-keyshortcuts={isMac() ? "Meta+Z" : "Control+Z"}
                    className="focus-ring flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--dt-rule)] transition-colors duration-[90ms] hover:bg-sunken hover:duration-0 active:translate-y-px">
                    <Icon name="undo" size={14} className="text-ink-2" />
                    {t.undo.label ?? "Undo"}
                    <Kbd aria-hidden className="ml-0.5 hidden h-4 min-w-4 bg-transparent text-[10px] shadow-none sm:inline-flex">⌘Z</Kbd>
                  </button>
                )}
              </div>
            )}
            {t.dismissible !== false && (
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => onDismiss("close")}
                className="focus-ring -my-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted opacity-0 transition-[opacity,color,background-color] duration-[90ms] hover:bg-sunken hover:text-ink focus-visible:opacity-100 group-hover/toast:opacity-100 group-hover/toast:duration-0 [@media(hover:none)]:opacity-100"
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        </motion.div>
        {/* undo countdown: provisional until it runs out */}
        {t.undo && (
          <motion.span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px origin-left bg-pencil"
            style={{ scaleX: countdown }}
          />
        )}
      </motion.div>
    </motion.li>
  );
}

/* ── Callout: the persistent, inline sibling ─────────────────── */

export interface CalloutProps {
  /** Semantic tone. Default "info". */
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons or links, right-aligned (stacked under the text when narrow). */
  action?: ReactNode;
  /** Show a dismiss button. */
  onDismiss?: () => void;
  /** Replace the tone icon (or `null` for none). */
  icon?: ReactNode | null;
  /** Announce when it appears (for callouts inserted in response to something). */
  live?: boolean;
  /** Allow the dismiss sound. */
  sound?: boolean;
  className?: string;
}

const calloutTone: Record<Tone, string> = {
  neutral: "bg-surface shadow-[inset_0_0_0_1px_var(--dt-hairline)]",
  info: "bg-surface shadow-[inset_0_0_0_1px_var(--dt-hairline)]",
  success: "bg-ok-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--dt-ok)_22%,transparent)]",
  warning: "bg-warn-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--dt-warn)_24%,transparent)]",
  error: "bg-err-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--dt-err)_22%,transparent)]",
};

/** An inline banner for persistent conditions. Shares the toast's icon set and type. */
export function Callout({ tone = "info", title, children, action, onDismiss, icon, live = false, sound: soundOn = true, className }: CalloutProps) {
  const play = usePlay(soundOn);
  const glyph = icon === undefined ? <ToneIcon tone={tone} /> : icon;
  return (
    <div
      role={live ? (tone === "error" ? "alert" : "status") : "note"}
      className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md py-3 pl-3.5 pr-2.5", calloutTone[tone], className)}
      data-detent="callout"
      data-tone={tone}
    >
      {glyph && <span className="flex size-5 shrink-0 items-center justify-center">{glyph}</span>}
      <div className="min-w-[12rem] flex-1 pt-px">
        {title && <p className="text-base font-medium text-ink">{title}</p>}
        {children && <div className={cn("text-sm text-ink-2", title ? "mt-0.5" : undefined)}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5 self-center">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => { play("dismiss"); onDismiss(); }}
          className="focus-ring -my-0.5 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted transition-colors duration-[90ms] hover:bg-sunken hover:text-ink hover:duration-0"
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}
