"use client";
import { AnimatePresence, animate, motion, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import {
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { spring, surfaceVariants, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon, type IconName } from "../../icons";
import { Kbd } from "../../lib/primitives";
import { cn, isMac } from "../../lib/utils";

/* ── types ───────────────────────────────────────────────────── */

export interface ToolbarAction {
  id: string;
  /** Accessible name and tooltip text. */
  label: string;
  icon?: IconName | ReactNode;
  /** Visible text beside the icon (e.g. "Ask Scout"). Icon-only when omitted. */
  text?: string;
  /** Display hint, e.g. "⌘B". When it is ⌘+letter the toolbar also binds it inside the target. */
  shortcut?: string;
  /** Morph the toolbar into an inline input (Link, Comment). */
  input?: {
    placeholder: string;
    /** Prefill, e.g. the current href when editing a link. */
    initialValue?: (range: Range) => string;
    /** Label for the Enter hint. Default "Apply". */
    submitLabel?: string;
  };
  /** Pressed state for the current selection. */
  isActive?: (range: Range) => boolean;
  /** Draw a hairline divider before this action. */
  separated?: boolean;
}

export interface ToolbarActionContext {
  /** The selection the action applies to (a live Range; mutate the DOM through it). */
  range: Range;
  /** Selected text. */
  text: string;
  /** Submitted input value for input actions. */
  value?: string;
  /** Whether the action was pressed (for toggles). */
  active: boolean;
}

export interface ActionToolbarProps {
  /** The text region to watch: a contentEditable or a read-only article. */
  target: RefObject<HTMLElement | null>;
  /** Defaults to Bold, Italic, Link, Comment and Ask Scout. */
  actions?: ToolbarAction[];
  onAction: (id: string, ctx: ToolbarActionContext) => void;
  /** Preferred side. Flips automatically when there is no room. Default "top". */
  placement?: "top" | "bottom";
  /** Gap between selection and toolbar in px. Default 8. */
  offset?: number;
  /** Keep this far from viewport edges (e.g. `{ top: 64 }` under a sticky header). Default 8. */
  collisionPadding?: number | Partial<Record<"top" | "right" | "bottom" | "left", number>>;
  /** Accessible name of the toolbar. Default "Text actions". */
  label?: string;
  /** Allow this instance to play sounds. */
  sound?: boolean;
  className?: string;
}

/* ── DOM helpers (exported for hosts) ───────────────────────── */

/** Closest ancestor of the range's start matching `selector`, inside `root`. */
export function rangeClosest(range: Range, selector: string, root?: Node | null): HTMLElement | null {
  let n: Node | null = range.startContainer;
  if (n.nodeType === Node.TEXT_NODE && range.startOffset === (n as Text).length && n.nextSibling) n = n.nextSibling;
  const el = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
  const hit = el?.closest(selector) as HTMLElement | null;
  if (!hit) return null;
  if (root && !root.contains(hit)) return null;
  return hit;
}

/** Selects the contents of `el` and returns the new range. */
export function selectContents(el: Node): Range {
  const r = document.createRange();
  r.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  return r;
}

/**
 * Wrap the range in a new element (`<strong>`, `<em>`, `<a href>`, `<mark>`…),
 * select the wrapped text and return the element.
 */
export function wrapRange(range: Range, tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.appendChild(range.extractContents());
  // Drop nested duplicates (bolding text that already contains bold).
  el.querySelectorAll(tag).forEach((inner) => inner.replaceWith(...Array.from(inner.childNodes)));
  range.insertNode(el);
  el.parentNode?.normalize();
  selectContents(el);
  return el;
}

/** Replace an element with its children, keeping them selected. */
export function unwrapElement(el: HTMLElement): Range {
  const first = el.firstChild;
  const last = el.lastChild;
  const parent = el.parentNode!;
  el.replaceWith(...Array.from(el.childNodes));
  const r = document.createRange();
  if (first && last) { r.setStartBefore(first); r.setEndAfter(last); }
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  return r;
}

export const defaultToolbarActions: ToolbarAction[] = [
  { id: "bold", label: "Bold", icon: "bold", shortcut: "⌘B", isActive: (r) => !!rangeClosest(r, "strong, b") },
  { id: "italic", label: "Italic", icon: "italic", shortcut: "⌘I", isActive: (r) => !!rangeClosest(r, "em, i") },
  {
    id: "link",
    label: "Link",
    icon: "link",
    isActive: (r) => !!rangeClosest(r, "a[href]"),
    input: { placeholder: "Paste or type a link", initialValue: (r) => rangeClosest(r, "a[href]")?.getAttribute("href") ?? "" },
  },
  { id: "comment", label: "Comment", icon: "comment", input: { placeholder: "Add a comment", submitLabel: "Comment" } },
  { id: "ask", label: "Ask Scout about this", icon: "sparkle", text: "Ask Scout", separated: true },
];

/* ── geometry ───────────────────────────────────────────────── */

type Pad = { top: number; right: number; bottom: number; left: number };
const toPad = (p: ActionToolbarProps["collisionPadding"]): Pad =>
  typeof p === "number" || p == null
    ? { top: p ?? 8, right: p ?? 8, bottom: p ?? 8, left: p ?? 8 }
    : { top: p.top ?? 8, right: p.right ?? 8, bottom: p.bottom ?? 8, left: p.left ?? 8 };

function rangeGeometry(range: Range) {
  if (typeof range.getBoundingClientRect !== "function") return null;
  const all = Array.from(range.getClientRects?.() ?? []).filter((r) => r.width > 0.5 && r.height > 0);
  const box = range.getBoundingClientRect();
  if (!all.length && box.width === 0 && box.height === 0) return null;
  const first = all[0] ?? box;
  const last = all[all.length - 1] ?? box;
  return { top: box.top, bottom: box.bottom, firstCx: first.left + first.width / 2, lastCx: last.left + last.width / 2 };
}

type Pos = { x: number; y: number; side: "top" | "bottom"; offscreen: boolean };

function computePos(range: Range, size: { w: number; h: number }, pref: "top" | "bottom", offset: number, pad: Pad): Pos | null {
  const g = rangeGeometry(range);
  if (!g) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aboveY = g.top - offset - size.h;
  const belowY = g.bottom + offset;
  const fitsAbove = aboveY >= pad.top;
  const fitsBelow = belowY + size.h <= vh - pad.bottom;
  const side: "top" | "bottom" = pref === "top" ? (fitsAbove || !fitsBelow ? "top" : "bottom") : fitsBelow || !fitsAbove ? "bottom" : "top";
  const cx = side === "top" ? g.firstCx : g.lastCx;
  const x = Math.min(Math.max(cx - size.w / 2, pad.left), Math.max(pad.left, vw - pad.right - size.w));
  const y = side === "top" ? aboveY : belowY;
  const offscreen = g.bottom < pad.top || g.top > vh - pad.bottom;
  return { x, y, side, offscreen };
}

/* ── highlight for the selection while focus is in the toolbar ─ */

const HL = "biscotti-toolbar-selection";
function paintSelection(range: Range | null) {
  const css = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS;
  const H = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!css?.highlights || !H) return;
  if (range) css.highlights.set(HL, new H(range));
  else css.highlights.delete(HL);
}
const HL_STYLE = `::highlight(${HL}){background-color:color-mix(in srgb,var(--bis-pencil) 22%,transparent);color:inherit}`;

/* ── component ──────────────────────────────────────────────── */

export function ActionToolbar({
  target,
  actions = defaultToolbarActions,
  onAction,
  placement = "top",
  offset = 8,
  collisionPadding,
  label = "Text actions",
  sound: soundOn = true,
  className,
}: ActionToolbarProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<Range | null>(null);
  const [suspended, setSuspended] = useState(false); // pointer is dragging a new selection
  const [offscreen, setOffscreen] = useState(false);
  const [mode, setMode] = useState<string | null>(null); // id of the input action, or null
  const [value, setValue] = useState("");
  const [roving, setRoving] = useState(0);
  const [btnW, setBtnW] = useState<number | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rangeRef = useRef<Range | null>(null);
  const dragging = useRef(false);
  const visibleRef = useRef(false);
  const sideRef = useRef<"top" | "bottom">(placement);
  const sizeRef = useRef({ w: 0, h: 40 });
  const anims = useRef<AnimationPlaybackControls[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const flipOpacity = useMotionValue(1);
  const pad = toPad(collisionPadding);
  const padKey = `${pad.top},${pad.right},${pad.bottom},${pad.left}`;

  rangeRef.current = range;
  visibleRef.current = !!range;
  useEffect(() => setMounted(true), []);

  const focusInside = () => !!toolbarRef.current && toolbarRef.current.contains(document.activeElement);

  /** Move to the current range. `how`: spring (selection changed) or jump (scroll/resize/first show). */
  const place = useCallback(
    (how: "spring" | "jump") => {
      const r = rangeRef.current;
      if (!r) return;
      const p = computePos(r, sizeRef.current, placement, offset, pad);
      if (!p) return;
      setOffscreen(p.offscreen);
      const flipped = p.side !== sideRef.current;
      sideRef.current = p.side;
      anims.current.forEach((a) => a.stop());
      anims.current = [];
      if (how === "jump" || flipped || m.reduced) {
        x.jump(p.x);
        y.jump(p.y);
        // Never travel *through* the selection when flipping sides: re-enter instead.
        if (flipped && how === "spring") {
          flipOpacity.jump(0);
          anims.current.push(animate(flipOpacity, 1, m.fade(tween.surfaceIn)));
        }
        return;
      }
      anims.current.push(animate(x, p.x, spring.glide), animate(y, p.y, spring.glide));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placement, offset, padKey, m.reduced, x, y, flipOpacity],
  );

  /* selection tracking ------------------------------------------- */
  const evaluate = useCallback(() => {
    const root = target.current;
    if (!root) return;
    if (focusInside()) return; // the toolbar owns the selection while focused
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      if (!dragging.current) { setRange(null); setMode(null); }
      return;
    }
    const r = sel.getRangeAt(0);
    if (!root.contains(r.commonAncestorContainer) || !r.toString().trim()) {
      if (!dragging.current) { setRange(null); setMode(null); }
      return;
    }
    if (dragging.current) return; // wait for pointerup
    const wasVisible = visibleRef.current;
    const next = r.cloneRange();
    rangeRef.current = next;
    setRange(next);
    if (wasVisible) place("spring");
    // first show is placed in a layout effect once the toolbar has a size
  }, [target, place]);

  useEffect(() => {
    const onSel = () => evaluate();
    const onDown = (e: PointerEvent) => {
      const root = target.current;
      if (!root || !root.contains(e.target as Node)) return;
      if (e.button !== 0) return;
      dragging.current = true;
      if (visibleRef.current) setSuspended(true);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      // Selection is final after mouseup; read it on the next tick.
      window.setTimeout(() => { setSuspended(false); evaluate(); }, 0);
    };
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    return () => {
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
    };
  }, [evaluate, target]);

  // Scroll / resize: stay glued to the text (no spring lag).
  useEffect(() => {
    if (!range) return;
    let raf = 0;
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => place("jump")); };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [range, place]);

  // Measure the toolbar; keep it centred while its width morphs.
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const measure = (how: "spring" | "jump") => {
      sizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };
      place(how);
    };
    measure("jump"); // first show: position before paint, then the surface enters
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure("jump"));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!range, mounted]);

  useLayoutEffect(() => {
    if (range && rowRef.current && btnW == null) setBtnW(rowRef.current.scrollWidth);
  }, [range, btnW]);
  // Actions may change (labels, count); re-measure the resting width.
  useEffect(() => { setBtnW(null); }, [actions]);

  // Paint the selection while the toolbar has focus (native selection greys out or is lost).
  useEffect(() => {
    if (!range) { paintSelection(null); return; }
    const onFocusIn = () => { if (focusInside()) paintSelection(rangeRef.current); };
    const onFocusOut = (e: FocusEvent) => {
      const to = e.relatedTarget as Node | null;
      if (to && toolbarRef.current?.contains(to)) return;
      paintSelection(null);
      // Focus left for somewhere else entirely: leave input mode and re-read the selection.
      window.setTimeout(() => {
        if (focusInside()) return;
        setMode(null);
        evaluate();
      }, 0);
    };
    const el = toolbarRef.current;
    el?.addEventListener("focusin", onFocusIn);
    el?.addEventListener("focusout", onFocusOut);
    return () => { el?.removeEventListener("focusin", onFocusIn); el?.removeEventListener("focusout", onFocusOut); };
  }, [range, evaluate]);
  useEffect(() => () => paintSelection(null), []);

  /* actions ------------------------------------------------------- */
  const restoreSelection = (r: Range | null) => {
    const root = target.current;
    if (!r || !root) return;
    if (root.isContentEditable) root.focus({ preventScroll: true });
    else if (returnFocus.current && returnFocus.current.isConnected && returnFocus.current !== document.body) returnFocus.current.focus({ preventScroll: true });
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    returnFocus.current = null;
  };

  const runAction = (a: ToolbarAction, val?: string) => {
    const r = rangeRef.current;
    if (!r) return;
    const active = a.isActive?.(r) ?? false;
    // Keyboard users (toolbar buttons focused) keep focus in the toolbar so actions chain and
    // the Enter keystroke can't leak into the editor. Pointer users and input submits return to the text.
    const stayInToolbar = focusInside() && !a.input;
    const sel = window.getSelection();
    if (stayInToolbar) { sel?.removeAllRanges(); sel?.addRange(r); }
    else restoreSelection(r);
    onAction(a.id, { range: r, text: r.toString(), value: val, active });
    // Adopt whatever the host selected afterwards (helpers select the wrapped text).
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      const next = sel.getRangeAt(0).cloneRange();
      rangeRef.current = next;
      setRange(next);
      place("spring");
      if (stayInToolbar) paintSelection(next);
    }
    // Chrome moves focus into an editing host when its selection is set; take it back.
    if (stayInToolbar) btnRefs.current[roving]?.focus({ preventScroll: true });
    if (a.input) play("confirm");
    else if (a.isActive) play("tick", { velocity: 0.6 });
    else play("tap");
  };

  const openInput = (a: ToolbarAction, idx: number) => {
    const r = rangeRef.current;
    if (!r) return;
    if (!returnFocus.current) returnFocus.current = target.current?.isContentEditable ? target.current : (document.activeElement as HTMLElement | null);
    setRoving(idx);
    setValue(a.input?.initialValue?.(r) ?? "");
    setMode(a.id);
    paintSelection(r);
  };

  const closeInput = (focusButton: boolean) => {
    const idx = actions.findIndex((a) => a.id === mode);
    setMode(null);
    if (focusButton) requestAnimationFrame(() => btnRefs.current[idx]?.focus({ preventScroll: true }));
  };

  const enterToolbar = () => {
    if (!rangeRef.current) return false;
    if (!focusInside()) returnFocus.current = document.activeElement as HTMLElement | null;
    paintSelection(rangeRef.current);
    btnRefs.current[Math.min(roving, actions.length - 1)]?.focus({ preventScroll: true });
    return true;
  };

  // Alt+F10 / ⌘/ moves focus into the toolbar; ⌘B/⌘I apply inside the target.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if ((e.altKey && e.key === "F10") || (mod && e.key === "/")) {
        if (rangeRef.current && enterToolbar()) e.preventDefault();
        return;
      }
      const root = target.current;
      if (!mod || e.altKey || !rangeRef.current || !root || !root.contains(document.activeElement)) return;
      const a = actions.find((x) => x.shortcut && /^⌘[A-Z]$/.test(x.shortcut) && x.shortcut[1].toLowerCase() === e.key.toLowerCase() && !e.shiftKey);
      if (!a) return;
      e.preventDefault();
      if (a.input) openInput(a, actions.indexOf(a));
      else runAction(a);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const onToolbarKeyDown = (e: React.KeyboardEvent) => {
    if (mode) return;
    const n = actions.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (roving + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (roving - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      e.preventDefault();
      paintSelection(null);
      restoreSelection(rangeRef.current);
      return;
    }
    if (next != null) {
      e.preventDefault();
      setRoving(next);
      btnRefs.current[next]?.focus();
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const a = actions.find((x) => x.id === mode);
    if (!a) return;
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const v = value.trim();
      setMode(null);
      paintSelection(null);
      if (v || a.id === "link") runAction(a, v);
      else restoreSelection(rangeRef.current);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeInput(true);
    }
  };

  /* render -------------------------------------------------------- */
  if (!mounted) return null;
  const visible = !!range;
  const inputAction = actions.find((a) => a.id === mode);
  const v = surfaceVariants(sideRef.current === "top" ? "bottom" : "top", m.reduced);
  const INPUT_W = 320;
  const width = mode ? INPUT_W : btnW ?? "auto";

  return createPortal(
    <>
    <AnimatePresence>
      {visible && (
        <motion.div
          key="toolbar"
          className="fixed left-0 top-0 z-[80]"
          style={{ x, y, opacity: flipOpacity, pointerEvents: suspended || offscreen ? "none" : undefined }}
          data-biscotti="action-toolbar"
        >
          <motion.div
            variants={v}
            initial="initial"
            animate={suspended || offscreen ? { opacity: 0, transition: m.fade(tween.micro) } : "animate"}
            exit="exit"
          >
            <motion.div
              ref={toolbarRef}
              role="toolbar"
              aria-label={label}
              aria-orientation="horizontal"
              onKeyDown={onToolbarKeyDown}
              initial={false}
              animate={{ width }}
              transition={m.move(spring.layout)}
              className={cn("relative h-10 overflow-hidden rounded-lg bg-raised shadow-3", className)}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {!inputAction ? (
                  <motion.div
                    key="buttons"
                    ref={rowRef}
                    className="flex h-10 w-max items-center gap-0.5 p-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: m.fade({ ...tween.fade, delay: m.reduced ? 0 : 0.06 }) }}
                    exit={{ opacity: 0, transition: m.fade({ duration: 0.08, ease: "linear" }) }}
                  >
                    {actions.map((a, i) => {
                      const pressed = range && a.isActive ? a.isActive(range) : undefined;
                      return (
                        <div key={a.id} className="flex items-center gap-0.5">
                          {a.separated && <span aria-hidden className="mx-1 h-4 w-px bg-hairline" />}
                          <ToolbarButton
                            ref={(el) => { btnRefs.current[i] = el; }}
                            action={a}
                            pressed={a.isActive ? !!pressed : undefined}
                            tabIndex={i === roving ? 0 : -1}
                            onFocus={() => setRoving(i)}
                            onClick={() => (a.input ? openInput(a, i) : runAction(a))}
                          />
                        </div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="input"
                    className="flex h-10 items-center gap-2 pl-3 pr-1.5"
                    style={{ width: INPUT_W }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: m.fade({ ...tween.fade, delay: m.reduced ? 0 : 0.08 }) }}
                    exit={{ opacity: 0, transition: m.fade({ duration: 0.08, ease: "linear" }) }}
                  >
                    <span aria-hidden className="flex shrink-0 text-muted">
                      {typeof inputAction.icon === "string" ? <Icon name={inputAction.icon as IconName} size={14} /> : null}
                    </span>
                    <input
                      ref={inputRef}
                      autoFocus
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      onKeyDown={onInputKeyDown}
                      aria-label={inputAction.label}
                      placeholder={inputAction.input!.placeholder}
                      spellCheck={inputAction.id !== "link"}
                      inputMode={inputAction.id === "link" ? "url" : undefined}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
                    />
                    <span aria-hidden className="flex shrink-0 items-center gap-1 text-2xs text-muted">
                      <Kbd>↵</Kbd>
                      <span>{inputAction.input!.submitLabel ?? "Apply"}</span>
                    </span>
                    <button
                      type="button"
                      aria-label="Cancel"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => closeInput(true)}
                      className="focus-ring flex size-7 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-ink"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    <style>{HL_STYLE}</style>
    </>,
    document.body,
  );
}

function ToolbarButton({
  action,
  pressed,
  tabIndex,
  onFocus,
  onClick,
  ref,
}: {
  action: ToolbarAction;
  pressed?: boolean;
  tabIndex: number;
  onFocus: () => void;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const icon = typeof action.icon === "string" ? <Icon name={action.icon as IconName} size={16} /> : isValidElement(action.icon) ? action.icon : null;
  const tip = action.shortcut ? `${action.label} (${action.shortcut.replace("⌘", isMac() ? "⌘" : "Ctrl+")})` : action.label;
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={tabIndex}
      aria-label={action.text ? undefined : action.label}
      aria-pressed={pressed}
      aria-keyshortcuts={action.shortcut ? action.shortcut.replace("⌘", isMac() ? "Meta+" : "Control+") : undefined}
      title={tip}
      onFocus={onFocus}
      // Keep focus (and the native selection) in the text on pointer use.
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "focus-ring relative flex h-8 items-center justify-center gap-1.5 rounded-sm text-sm active:translate-y-px",
        action.text ? "px-2.5" : "w-8",
        pressed ? "bg-[color-mix(in_srgb,var(--bis-ink)_9%,transparent)] text-ink shadow-press" : "text-ink-2 hover:bg-[color-mix(in_srgb,var(--bis-ink)_6%,transparent)] hover:text-ink",
        "transition-[background-color,color] duration-[90ms] hover:duration-0",
      )}
    >
      {icon}
      {action.text && <span>{action.text}</span>}
    </button>
  );
}
