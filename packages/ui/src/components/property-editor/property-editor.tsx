"use client";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type Ref,
  type ReactNode,
} from "react";
import { spring, surfaceVariants, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { cn, useControllable } from "../../lib/utils";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/* ════════════════════════════════════════════════════════════════
 * Number helpers
 * ════════════════════════════════════════════════════════════════ */

const decimalsOf = (n: number) => {
  const s = String(n);
  if (s.includes("e-")) return Number(s.split("e-")[1]);
  return (s.split(".")[1] ?? "").length;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const roundTo = (v: number, decimals: number) => {
  const r = Number(v.toFixed(Math.min(10, decimals)));
  return Object.is(r, -0) ? 0 : r;
};
/** Trimmed display: 1.50 → "1.5", 16 → "16", −0.02 → "-0.02". */
export const formatPropertyNumber = (v: number, decimals: number) => String(roundTo(v, decimals));

/**
 * Evaluates a tiny arithmetic expression: numbers, + − * / ×, parentheses, unary minus.
 * No `eval`. Returns null for anything it cannot parse.
 * `evaluatePropertyExpression("16*1.5") === 24`
 */
export function evaluatePropertyExpression(src: string): number | null {
  const s = src.replace(/\s+/g, "").replace(/×/g, "*").replace(/−/g, "-").replace(/,/g, ".");
  if (!s) return null;
  let i = 0;
  const fail = (): never => {
    throw new Error("parse");
  };
  const expr = (): number => {
    let v = term();
    while (s[i] === "+" || s[i] === "-") {
      const op = s[i++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const term = (): number => {
    let v = factor();
    while (s[i] === "*" || s[i] === "/") {
      const op = s[i++];
      const r = factor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const factor = (): number => {
    if (s[i] === "-") return i++, -factor();
    if (s[i] === "+") return i++, factor();
    if (s[i] === "(") {
      i++;
      const v = expr();
      if (s[i++] !== ")") fail();
      return v;
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) fail();
    i += m![0].length;
    return Number(m![0]);
  };
  try {
    const v = expr();
    if (i !== s.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Parse "24", "16*1.5", "1.2em", "50 %" against a set of allowed units. */
function parseWithUnits(src: string, units: string[]): { value: number; unit?: string } | null {
  let unit: string | undefined;
  const sorted = [...units].sort((a, b) => b.length - a.length);
  let body = src.trim();
  if (sorted.length) {
    const re = new RegExp(`(${sorted.map((u) => u.replace(/[.*+?^${}()|[\]\\%]/g, "\\$&")).join("|")})`, "gi");
    body = body.replace(re, (m) => {
      unit = sorted.find((u) => u.toLowerCase() === m.toLowerCase());
      return "";
    });
  }
  if (/[a-z%]/i.test(body)) return null; // a unit we don't support
  const value = evaluatePropertyExpression(body);
  return value == null ? null : { value, unit };
}

/** Make the whole document show `cursor` and stop text selection while dragging. */
function lockBodyForDrag(cursor: string) {
  const root = document.documentElement;
  const prevCursor = root.style.cursor;
  const prevSelect = root.style.userSelect;
  root.style.cursor = cursor;
  root.style.userSelect = "none";
  return () => {
    root.style.cursor = prevCursor;
    root.style.userSelect = prevSelect;
  };
}

/* ════════════════════════════════════════════════════════════════
 * Editor context — counts modified fields, powers "Reset all"
 * ════════════════════════════════════════════════════════════════ */

interface EditorCtx {
  report: (id: string, reset: (() => void) | null) => void;
  sound: boolean;
}
const PropertyEditorContext = createContext<EditorCtx | null>(null);

/** Registers a field's modified state (and how to reset it) with the enclosing editor. */
function useModified(modified: boolean, reset: () => void) {
  const ctx = useContext(PropertyEditorContext);
  const id = useId();
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const report = ctx?.report;
  useEffect(() => {
    if (!report) return;
    report(id, modified ? () => resetRef.current() : null);
  }, [report, id, modified]);
  useEffect(() => () => report?.(id, null), [report, id]);
}

function useFieldSound(sound: boolean | undefined) {
  const ctx = useContext(PropertyEditorContext);
  return usePlay((sound ?? true) && (ctx?.sound ?? true));
}

export interface PropertyEditorProps {
  /** Panel heading, e.g. the selected layer's name. */
  title: ReactNode;
  /** Secondary line under the title, e.g. the element type. */
  subtitle?: ReactNode;
  children: ReactNode;
  /** Show the "n modified · Reset all" control in the header. Default true. */
  showResetAll?: boolean;
  /** Allow this editor and every field inside it to play sounds. */
  sound?: boolean;
  className?: string;
}

/**
 * The inspector panel. Fields inside report whether they differ from their
 * baseline, so the header can count changes and reset them together.
 */
export function PropertyEditor({ title, subtitle, children, showResetAll = true, sound: soundOn = true, className }: PropertyEditorProps) {
  const resets = useRef(new Map<string, () => void>());
  const [count, setCount] = useState(0);
  const play = usePlay(soundOn);
  const headingId = useId();
  const report = useCallback((id: string, reset: (() => void) | null) => {
    if (reset) resets.current.set(id, reset);
    else resets.current.delete(id);
    setCount(resets.current.size);
  }, []);
  const ctx = useMemo(() => ({ report, sound: soundOn }), [report, soundOn]);
  const panelRef = useRef<HTMLElement>(null);

  const resetAll = () => {
    const fns = [...resets.current.values()];
    fns.forEach((fn) => fn());
    play("dismiss", { velocity: 0.55 });
    // The button disappears; keep focus inside the panel.
    requestAnimationFrame(() => panelRef.current?.focus());
  };

  return (
    <PropertyEditorContext.Provider value={ctx}>
      <section
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className={cn("w-[288px] rounded-lg bg-raised text-ink shadow-2 outline-none", className)}
      >
        <header className="flex min-h-11 items-center justify-between gap-3 px-3.5 pt-2.5 pb-2">
          <div className="min-w-0">
            <h3 id={headingId} className="truncate text-sm font-medium text-ink">
              {title}
            </h3>
            {subtitle && <p className="truncate font-mono text-2xs text-muted">{subtitle}</p>}
          </div>
          {showResetAll && (
            <div className="flex h-6 shrink-0 items-center gap-2" aria-live="polite">
              <span className={cn("flex items-center gap-1.5 font-mono text-2xs tabular text-muted transition-opacity duration-[120ms]", count ? "opacity-100" : "opacity-0")}>
                <span aria-hidden className="size-1.5 rounded-full bg-pencil" />
                {count} modified
              </span>
              {count > 0 && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="focus-ring h-6 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-sunken hover:text-ink"
                >
                  Reset all
                </button>
              )}
            </div>
          )}
        </header>
        <div className="divide-y divide-hairline border-t border-hairline">{children}</div>
      </section>
    </PropertyEditorContext.Provider>
  );
}

export interface PropertySectionProps {
  title: ReactNode;
  /** Trailing header content, e.g. a small action. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A titled group of fields inside a PropertyEditor. */
export function PropertySection({ title, action, children, className }: PropertySectionProps) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className={cn("px-3.5 pt-2.5 pb-3.5", className)}>
      <div className="mb-2 flex h-5 items-center justify-between">
        <h4 id={id} className="text-xs font-medium text-ink-2">
          {title}
        </h4>
        {action}
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

export interface PropertyRowProps {
  /** Left-column label. Pass a string, or a node with its own label element. */
  label: ReactNode;
  /** id of the control the label names (makes the label clickable). */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/** Two-column row: a fixed label column and a control. */
export function PropertyRow({ label, htmlFor, children, className }: PropertyRowProps) {
  return (
    <div className={cn("grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="truncate text-xs text-muted">
          {label}
        </label>
      ) : (
        <span className="truncate text-xs text-muted">{label}</span>
      )}
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Shared bits: field chrome + the modified dot that is also "reset"
 * ════════════════════════════════════════════════════════════════ */

const fieldChrome = cn(
  "relative flex h-7 min-w-0 items-center rounded-md bg-field",
  "transition-[box-shadow] duration-[90ms] ease-out hover:shadow-[inset_0_0_0_1px_var(--dt-rule)] hover:duration-0",
  "focus-within:shadow-[inset_0_0_0_1px_var(--dt-pencil),0_0_0_3px_var(--dt-pencil-soft)] focus-within:hover:shadow-[inset_0_0_0_1px_var(--dt-pencil),0_0_0_3px_var(--dt-pencil-soft)]",
);

/**
 * A pencil dot that marks a modified value. It is also the reset button:
 * hover or focus turns it into an undo glyph. Space is always reserved.
 */
function ModifiedReset({ modified, label, onReset, className }: { modified: boolean; label: string; onReset: () => void; className?: string }) {
  return (
    <span className={cn("relative flex h-full w-5 shrink-0 items-center justify-center", className)}>
      {modified && (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={onReset}
          onPointerDown={(e) => e.stopPropagation()}
          className="focus-ring group/reset relative flex size-5 items-center justify-center rounded-xs before:absolute before:-inset-0.5 before:content-['']"
        >
          <span aria-hidden className="size-1.5 rounded-full bg-pencil group-hover/reset:opacity-0 group-focus-visible/reset:opacity-0" />
          <Icon
            name="undo"
            size={12}
            className="absolute text-ink-2 opacity-0 group-hover/reset:opacity-100 group-focus-visible/reset:opacity-100"
          />
        </button>
      )}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════
 * PropertyScrub — numeric field with a scrubbable label
 * ════════════════════════════════════════════════════════════════ */

export interface PropertyScrubProps {
  /** Short visible label. Drag it horizontally to scrub; click it to type. */
  label: ReactNode;
  /** Accessible name when the visible label is an abbreviation or icon. */
  "aria-label"?: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** The unmodified value. Differing from it shows the pencil dot; reset returns to it. Defaults to the initial value. */
  baseline?: number;
  min?: number;
  max?: number;
  /** Keyboard and scrub increment. Shift ×10, Alt ×0.1. Default 1. */
  step?: number;
  /** Unit suffix shown after the number, e.g. "px". */
  unit?: string;
  /** Allowed units. With more than one, the suffix becomes a button that cycles them, and typing "1.2em" switches. */
  units?: string[];
  onUnitChange?: (unit: string) => void;
  /** Pointer travel (px) per step while scrubbing. Default 2. */
  pixelsPerStep?: number;
  /** Play a quiet tick each time the value crosses a multiple of this. Default 4 × step. */
  tickEvery?: number;
  /** Fires when a scrub gesture starts and ends. */
  onScrubChange?: (scrubbing: boolean) => void;
  disabled?: boolean;
  id?: string;
  sound?: boolean;
  className?: string;
}

export function PropertyScrub({
  label,
  "aria-label": ariaLabel,
  value: valueProp,
  defaultValue = 0,
  onValueChange,
  baseline: baselineProp,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  units,
  onUnitChange,
  pixelsPerStep = 2,
  tickEvery: tickEveryProp,
  onScrubChange,
  disabled,
  id: idProp,
  sound,
  className,
}: PropertyScrubProps) {
  const autoId = useId();
  const id = idProp ?? `dt-scrub-${autoId}`;
  const play = useFieldSound(sound);
  const m = useMotionTokens();
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const [initial] = useState(() => valueProp ?? defaultValue);
  const baseline = baselineProp ?? initial;
  const modified = roundTo(value, 8) !== roundTo(baseline, 8);
  const decimals = decimalsOf(step);
  const tickEvery = tickEveryProp ?? step * 4;
  const unitList = units ?? (unit ? [unit] : []);

  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // After an arrow step or Enter, select the field so the next keystroke replaces the value. Committing a new
  // value rewrites `input.value` (which drops the selection), so re-select right after that commit instead of
  // in a later animation frame, which could land between the user's keystrokes and swallow what they typed.
  const selectPending = useRef(false);
  const selectAfterCommit = () => {
    selectPending.current = true;
    inputRef.current?.select(); // covers the no-re-render case (e.g. already at a limit)
  };
  useIsoLayoutEffect(() => {
    if (!selectPending.current) return;
    selectPending.current = false;
    if (inputRef.current && document.activeElement === inputRef.current) inputRef.current.select();
  });

  const display = formatPropertyNumber(value, Math.max(decimals, decimalsOf(roundTo(value, decimals + 1))));
  const name = ariaLabel ?? (typeof label === "string" ? label : undefined);

  const set = (next: number, playTicks = false) => {
    const prev = valueRef.current;
    const v = clamp(next, min, max);
    if (v === prev) return;
    valueRef.current = v;
    setValue(v);
    if (playTicks) {
      if ((v === min || v === max) && prev !== v) play("tick", { velocity: 0.6, pitch: 0.75 });
      else if (Math.floor(v / tickEvery + 1e-9) !== Math.floor(prev / tickEvery + 1e-9)) play("tick", { velocity: 0.28 });
    }
  };

  const commitDraft = () => {
    if (draft == null) return true;
    const parsed = parseWithUnits(draft, unitList);
    if (!parsed) {
      setInvalid(true);
      return false;
    }
    if (parsed.unit && parsed.unit !== unit) {
      // New unit, new limits: the host converts and re-clamps.
      onUnitChange?.(parsed.unit);
      setValue(roundTo(parsed.value, 3));
    } else set(roundTo(parsed.value, Math.max(decimals, 3)));
    setDraft(null);
    setInvalid(false);
    return true;
  };

  /* — scrub gesture on the label — */
  const drag = useRef<{ x: number; base: number; mod: number; moved: boolean; release?: () => void } | null>(null);
  const suppressClick = useRef(false);
  const modOf = (e: { shiftKey: boolean; altKey: boolean }) => (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLLabelElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault(); // no text selection; click still focuses the input
    if (draft != null) commitDraft();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, base: valueRef.current, mod: modOf(e), moved: false };
  };
  const onLabelPointerMove = (e: ReactPointerEvent<HTMLLabelElement>) => {
    const s = drag.current;
    if (!s) return;
    if (!s.moved) {
      if (Math.abs(e.clientX - s.x) < 3) return;
      s.moved = true;
      s.x = e.clientX; // start counting from here so the first step isn't a jump
      s.release = lockBodyForDrag("ew-resize");
      setScrubbing(true);
      onScrubChange?.(true);
      inputRef.current?.blur();
    }
    const mod = modOf(e);
    if (mod !== s.mod) {
      // Re-anchor so changing precision mid-drag never jumps the value.
      s.base = valueRef.current;
      s.x = e.clientX;
      s.mod = mod;
    }
    const inc = step * mod;
    const steps = Math.round((e.clientX - s.x) / pixelsPerStep);
    set(roundTo(s.base + steps * inc, decimalsOf(inc)), true);
  };
  const endScrub = () => {
    const s = drag.current;
    drag.current = null;
    if (!s?.moved) return;
    s.release?.();
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    setScrubbing(false);
    onScrubChange?.(false);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = draft != null ? (parseWithUnits(draft, unitList)?.value ?? valueRef.current) : valueRef.current;
      const inc = step * modOf(e);
      set(roundTo(base + (e.key === "ArrowUp" ? inc : -inc), decimalsOf(inc)));
      setDraft(null);
      setInvalid(false);
      selectAfterCommit();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (commitDraft()) selectAfterCommit();
    } else if (e.key === "Escape") {
      if (draft != null) {
        e.preventDefault();
        e.stopPropagation();
        setDraft(null);
        setInvalid(false);
      } else inputRef.current?.blur();
    }
  };

  const reset = () => {
    set(baseline);
    setDraft(null);
    setInvalid(false);
  };
  useModified(modified, reset);

  // Ruler geometry: one tick per audible tick, a major tick every fifth.
  const spacing = Math.max(4, pixelsPerStep * (tickEvery / step));
  const major = spacing * 5;
  const offset = -(((value / tickEvery) * spacing) % major);

  return (
    <div
      className={cn(fieldChrome, invalid && "shadow-[inset_0_0_0_1px_var(--dt-err)] hover:shadow-[inset_0_0_0_1px_var(--dt-err)]", scrubbing && "shadow-[inset_0_0_0_1px_var(--dt-pencil-line)] hover:shadow-[inset_0_0_0_1px_var(--dt-pencil-line)]", disabled && "opacity-45", "overflow-hidden", className)}
      data-scrubbing={scrubbing || undefined}
      data-modified={modified || undefined}
    >
      <label
        htmlFor={id}
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onLostPointerCapture={endScrub}
        onClick={(e) => {
          if (suppressClick.current) e.preventDefault();
        }}
        className={cn(
          "flex h-full shrink-0 touch-none select-none items-center pr-1.5 pl-2 text-xs",
          disabled ? "cursor-not-allowed text-muted" : "cursor-ew-resize",
          scrubbing ? "text-pencil-ink" : "text-muted hover:text-ink",
        )}
      >
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        role="spinbutton"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        aria-valuetext={`${display}${unit ? ` ${unit}` : ""}`}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={draft ?? display}
        onChange={(e) => {
          selectPending.current = false; // the user is typing: never select over their input
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          selectPending.current = false;
          if (!commitDraft()) {
            setDraft(null);
            setInvalid(false);
          }
        }}
        onKeyDown={onKeyDown}
        className="h-full w-full min-w-0 flex-1 bg-transparent font-mono text-xs tabular text-ink outline-none selection:bg-pencil-soft disabled:cursor-not-allowed"
      />
      {unit &&
        (unitList.length > 1 ? (
          <button
            type="button"
            disabled={disabled}
            aria-label={`Unit ${unit}${name ? ` for ${name}` : ""}. Change unit`}
            onClick={() => {
              const next = unitList[(unitList.indexOf(unit) + 1) % unitList.length];
              onUnitChange?.(next);
              play("select", { velocity: 0.4 });
            }}
            className="focus-ring h-6 min-w-6 shrink-0 rounded-xs px-1 font-mono text-2xs text-muted hover:bg-well hover:text-ink"
          >
            {unit}
          </button>
        ) : (
          <span aria-hidden className="shrink-0 pr-0.5 font-mono text-2xs text-muted">
            {unit}
          </span>
        ))}
      <ModifiedReset
        modified={modified}
        label={`Reset ${name ?? "value"} to ${formatPropertyNumber(baseline, decimals)}${unit ?? ""}`}
        onReset={() => {
          reset();
          play("dismiss", { velocity: 0.4 });
          inputRef.current?.focus();
        }}
      />
      {/* Ruler: appears only while scrubbing; it measures what the pointer is doing. */}
      <motion.svg
        aria-hidden
        initial={false}
        animate={{ opacity: scrubbing ? 1 : 0 }}
        transition={m.fade({ duration: scrubbing ? 0.06 : 0.14 })}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[5px] w-full text-edge"
      >
        <defs>
          <pattern id={`${id}-ruler`} width={major} height={5} patternUnits="userSpaceOnUse" x={offset}>
            <rect x={0} y={0} width={1} height={5} fill="currentColor" />
            {[1, 2, 3, 4].map((k) => (
              <rect key={k} x={k * spacing} y={2.5} width={1} height={2.5} fill="currentColor" opacity={0.7} />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height={5} fill={`url(#${id}-ruler)`} />
      </motion.svg>
      {scrubbing && <span aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-[7px] w-px -translate-x-1/2 bg-pencil" />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 * PropertySelect — native select, styled
 * ════════════════════════════════════════════════════════════════ */

export interface PropertySelectOption {
  value: string;
  label: string;
}

export interface PropertySelectProps {
  options: PropertySelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  baseline?: string;
  /** Accessible name (or use with PropertyRow's htmlFor). */
  "aria-label"?: string;
  id?: string;
  /** Render each option's label in this font (e.g. the family it names). */
  optionStyle?: (option: PropertySelectOption) => CSSProperties | undefined;
  disabled?: boolean;
  sound?: boolean;
  className?: string;
}

export function PropertySelect({ options, value: valueProp, defaultValue, onValueChange, baseline: baselineProp, "aria-label": ariaLabel, id, optionStyle, disabled, sound, className }: PropertySelectProps) {
  const play = useFieldSound(sound);
  const [value, setValue] = useControllable(valueProp, defaultValue ?? options[0]?.value ?? "", onValueChange);
  const [initial] = useState(() => valueProp ?? defaultValue ?? options[0]?.value ?? "");
  const baseline = baselineProp ?? initial;
  const modified = value !== baseline;
  const ref = useRef<HTMLSelectElement>(null);
  useModified(modified, () => setValue(baseline));
  const current = options.find((o) => o.value === value);
  return (
    <div className={cn(fieldChrome, disabled && "opacity-45", className)} data-modified={modified || undefined}>
      <select
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          play("select", { velocity: 0.45 });
        }}
        style={current ? optionStyle?.(current) : undefined}
        className="h-full w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-5 pl-2 text-xs text-ink outline-none disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={optionStyle?.(o)}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={12} className="pointer-events-none absolute right-6 text-muted" />
      <ModifiedReset
        modified={modified}
        label={`Reset to ${options.find((o) => o.value === baseline)?.label ?? baseline}`}
        onReset={() => {
          setValue(baseline);
          play("dismiss", { velocity: 0.4 });
          ref.current?.focus();
        }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 * PropertySegmented — compact radiogroup with a gliding indicator
 * ════════════════════════════════════════════════════════════════ */

export interface PropertySegmentedOption {
  value: string;
  /** Visible content; keep it short ("400", "Md"). */
  label: ReactNode;
  /** Accessible name if `label` is terse. */
  name?: string;
}

export interface PropertySegmentedProps {
  options: PropertySegmentedOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  baseline?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
  sound?: boolean;
  className?: string;
}

export function PropertySegmented({ options, value: valueProp, defaultValue, onValueChange, baseline: baselineProp, "aria-label": ariaLabel, "aria-labelledby": labelledBy, disabled, sound, className }: PropertySegmentedProps) {
  const play = useFieldSound(sound);
  const m = useMotionTokens();
  const [value, setValue] = useControllable(valueProp, defaultValue ?? options[0]?.value ?? "", onValueChange);
  const [initial] = useState(() => valueProp ?? defaultValue ?? options[0]?.value ?? "");
  const baseline = baselineProp ?? initial;
  const modified = value !== baseline;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  useModified(modified, () => setValue(baseline));

  const choose = (i: number, focus = false) => {
    const o = options[i];
    if (!o || disabled) return;
    if (o.value !== value) {
      setValue(o.value);
      play("select", { velocity: 0.5 });
    }
    if (focus) refs.current[i]?.focus();
  };

  return (
    <div className={cn("flex h-7 min-w-0 items-center rounded-md bg-field", disabled && "opacity-45", className)} data-modified={modified || undefined}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-disabled={disabled || undefined}
        className="relative grid h-full min-w-0 flex-1 p-0.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        <motion.span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0.5 rounded-sm bg-raised shadow-1"
          style={{ width: `calc((100% - 4px) / ${options.length})` }}
          initial={false}
          animate={{ x: `${idx * 100}%` }}
          transition={m.move(spring.glide)}
        />
        {options.map((o, i) => {
          const on = i === idx;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.name}
              tabIndex={on ? 0 : -1}
              disabled={disabled}
              onClick={() => choose(i)}
              onKeyDown={(e) => {
                const k = e.key;
                if (k === "ArrowRight" || k === "ArrowDown") (e.preventDefault(), choose((i + 1) % options.length, true));
                else if (k === "ArrowLeft" || k === "ArrowUp") (e.preventDefault(), choose((i - 1 + options.length) % options.length, true));
                else if (k === "Home") (e.preventDefault(), choose(0, true));
                else if (k === "End") (e.preventDefault(), choose(options.length - 1, true));
              }}
              className={cn(
                "focus-ring relative z-[1] h-full min-w-0 rounded-sm font-mono text-2xs tabular transition-colors duration-[90ms] hover:duration-0",
                on ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <ModifiedReset
        modified={modified}
        label="Reset to original"
        onReset={() => {
          setValue(baseline);
          play("dismiss", { velocity: 0.4 });
          const bi = options.findIndex((o) => o.value === baseline);
          requestAnimationFrame(() => refs.current[bi]?.focus());
        }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Colour — swatch + hex + popover (SV plane, hue strip, recents)
 * ════════════════════════════════════════════════════════════════ */

type HSV = { h: number; s: number; v: number };

export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}
function hexToHsv(hex: string): HSV {
  const n = normalizeHex(hex) ?? "#000000";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}
function hsvToHex({ h, s, v }: HSV): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

export interface PropertyColorProps {
  /** Hex colour, "#rrggbb". */
  value?: string;
  defaultValue?: string;
  onValueChange?: (hex: string) => void;
  baseline?: string;
  /** Accessible name, e.g. "Fill". */
  "aria-label": string;
  /** Recently used colours (most recent first). Uncontrolled after mount. */
  defaultRecents?: string[];
  /** Max recent swatches kept. Default 8. */
  maxRecents?: number;
  disabled?: boolean;
  sound?: boolean;
  className?: string;
}

export function PropertyColor({
  value: valueProp,
  defaultValue = "#000000",
  onValueChange,
  baseline: baselineProp,
  "aria-label": name,
  defaultRecents = [],
  maxRecents = 8,
  disabled,
  sound,
  className,
}: PropertyColorProps) {
  const play = useFieldSound(sound);
  const m = useMotionTokens();
  const [value, setValue] = useControllable(valueProp, normalizeHex(defaultValue) ?? "#000000", onValueChange);
  const [initial] = useState(() => valueProp ?? defaultValue);
  const baseline = normalizeHex(baselineProp ?? initial) ?? "#000000";
  const hex = normalizeHex(value) ?? "#000000";
  const modified = hex !== baseline;
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState(() => defaultRecents.map((c) => normalizeHex(c)).filter(Boolean) as string[]);
  const rootRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const hexRef = useRef<HTMLInputElement>(null);
  const openedWith = useRef(hex);
  const popId = useId();
  const planeRef = useRef<HTMLDivElement>(null);
  useModified(modified, () => setValue(baseline));

  // Keep HSV locally so hue survives greys/black while dragging.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(hex));
  useEffect(() => {
    if (hsvToHex(hsv) !== hex) setHsv(hexToHsv(hex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);
  const setFromHsv = (next: HSV) => {
    setHsv(next);
    setValue(hsvToHex(next));
  };

  const valueRefHex = useRef(hex);
  valueRefHex.current = hex;
  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      const now = normalizeHex(valueRefHex.current);
      if (now && now !== openedWith.current) setRecents((r) => [now, ...r.filter((c) => c !== now)].slice(0, maxRecents));
      if (returnFocus) swatchRef.current?.focus();
    },
    [maxRecents],
  );
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, close]);

  const commitHex = () => {
    if (draft == null) return;
    const n = normalizeHex(draft);
    if (n) setValue(n);
    setDraft(null);
  };

  return (
    <div
      ref={rootRef}
      className={cn("relative min-w-0", className)}
      data-modified={modified || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
      }}
      onBlur={(e) => {
        // Tabbing out of the field and its popover closes the popover.
        if (open && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) close(false);
      }}
    >
      <div className={cn(fieldChrome, disabled && "opacity-45")}>
        <button
          ref={swatchRef}
          type="button"
          disabled={disabled}
          aria-label={`${name}: ${hex.toUpperCase()}. Open colour picker`}
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          aria-haspopup="dialog"
          onClick={() => {
            if (open) return close(false);
            openedWith.current = hex;
            setHsv(hexToHsv(hex));
            setOpen(true);
            // Move focus into the dialog so arrows and Escape work at once.
            requestAnimationFrame(() => planeRef.current?.focus());
          }}
          className="focus-ring ml-1 flex size-5 shrink-0 items-center justify-center rounded-xs"
        >
          <span aria-hidden className="size-4 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: hex }} />
        </button>
        <span aria-hidden className="pl-1.5 font-mono text-xs text-muted">#</span>
        <input
          ref={hexRef}
          type="text"
          aria-label={`${name} hex`}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          disabled={disabled}
          value={draft ?? hex.slice(1).toUpperCase()}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.preventDefault(), commitHex(), requestAnimationFrame(() => hexRef.current?.select()));
            if (e.key === "Escape" && draft != null) (e.preventDefault(), setDraft(null));
          }}
          className="h-full w-full min-w-0 flex-1 bg-transparent font-mono text-xs tabular text-ink uppercase outline-none selection:bg-pencil-soft"
        />
        <ModifiedReset
          modified={modified}
          label={`Reset ${name} to ${baseline.toUpperCase()}`}
          onReset={() => {
            setValue(baseline);
            setDraft(null);
            play("dismiss", { velocity: 0.4 });
            hexRef.current?.focus();
          }}
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id={popId}
            role="dialog"
            aria-label={`${name} colour`}
            {...surfaceVariants("top", m.reduced)}
            className="absolute top-[calc(100%+6px)] right-0 z-40 w-[236px] origin-top-right rounded-lg bg-raised p-2.5 shadow-3"
          >
            <SVPlane ref={planeRef} hsv={hsv} onChange={setFromHsv} name={name} />
            <HueStrip hsv={hsv} onChange={setFromHsv} />
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-2xs text-muted">Recent</span>
              <span className="font-mono text-2xs tabular text-muted">{hex.toUpperCase()}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-8 gap-1" role="group" aria-label="Recent colours">
              {Array.from({ length: maxRecents }, (_, i) => {
                const c = recents[i];
                if (!c) return <span key={`empty-${i}`} aria-hidden className="aspect-square rounded-xs shadow-[inset_0_0_0_1px_var(--dt-hairline)]" />;
                const on = c === hex;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Use ${c.toUpperCase()}`}
                    aria-pressed={on}
                    onClick={() => {
                      setValue(c);
                      setHsv(hexToHsv(c));
                      play("select", { velocity: 0.45 });
                    }}
                    className={cn(
                      "focus-ring relative aspect-square rounded-xs shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]",
                      "before:absolute before:-inset-0.5 before:content-['']",
                      on && "outline outline-1 outline-offset-1 outline-ink",
                    )}
                    style={{ background: c }}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function usePlaneDrag(onPoint: (fx: number, fy: number) => void) {
  const release = useRef<(() => void) | null>(null);
  const handle = (e: ReactPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPoint(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1));
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      release.current = lockBodyForDrag("default");
      handle(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) handle(e);
    },
    onLostPointerCapture: () => {
      release.current?.();
      release.current = null;
    },
  };
}

function SVPlane({ ref, hsv, onChange, name }: { ref?: Ref<HTMLDivElement>; hsv: HSV; onChange: (h: HSV) => void; name: string }) {
  const drag = usePlaneDrag((fx, fy) => onChange({ h: hsv.h, s: fx, v: 1 - fy }));
  const pct = (n: number) => Math.round(n * 100);
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={`${name} saturation and brightness`}
      aria-roledescription="2D slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct(hsv.s)}
      aria-valuetext={`Saturation ${pct(hsv.s)}%, brightness ${pct(hsv.v)}%`}
      {...drag}
      onKeyDown={(e) => {
        const d = (e.shiftKey ? 10 : 1) / 100;
        const k = e.key;
        let { s, v } = hsv;
        if (k === "ArrowRight") s += d;
        else if (k === "ArrowLeft") s -= d;
        else if (k === "ArrowUp") v += d;
        else if (k === "ArrowDown") v -= d;
        else return;
        e.preventDefault();
        onChange({ h: hsv.h, s: clamp(s, 0, 1), v: clamp(v, 0, 1) });
      }}
      className="focus-ring relative h-[132px] w-full cursor-crosshair touch-none rounded-md"
      style={{
        background: `linear-gradient(to top, rgb(0 0 0), rgb(0 0 0 / 0)), linear-gradient(to right, rgb(255 255 255), rgb(255 255 255 / 0)), hsl(${hsv.h} 100% 50%)`,
      }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" />
      <span
        aria-hidden
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_2px_rgb(255_255_255),0_0_0_3px_rgb(0_0_0/0.28),0_1px_3px_1px_rgb(0_0_0/0.25)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }}
      />
    </div>
  );
}

function HueStrip({ hsv, onChange }: { hsv: HSV; onChange: (h: HSV) => void }) {
  const drag = usePlaneDrag((fx) => onChange({ ...hsv, h: Math.min(359.9, fx * 360) }));
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext={`Hue ${Math.round(hsv.h)}°`}
      {...drag}
      onKeyDown={(e) => {
        const d = e.shiftKey ? 15 : 1;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange({ ...hsv, h: (hsv.h + d) % 360 });
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange({ ...hsv, h: (hsv.h - d + 360) % 360 });
        else return;
        e.preventDefault();
      }}
      className="focus-ring relative mt-2.5 h-3 w-full cursor-ew-resize touch-none rounded-sm"
      style={{
        background:
          "linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))",
      }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)]" />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] shadow-[0_0_0_2px_rgb(255_255_255),0_0_0_3px_rgb(0_0_0/0.28),0_1px_3px_rgb(0_0_0/0.25)]"
        style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 * PropertyBoxModel — margin / padding diagram with draggable edges
 * ════════════════════════════════════════════════════════════════ */

/** [top, right, bottom, left] */
export type BoxSides = [number, number, number, number];
export interface BoxModelValue {
  margin: BoxSides;
  padding: BoxSides;
}
export type BoxModelTarget = { box: "margin" | "padding"; side: 0 | 1 | 2 | 3 };

const SIDE_NAMES = ["top", "right", "bottom", "left"] as const;

export interface PropertyBoxModelProps {
  value?: BoxModelValue;
  defaultValue?: BoxModelValue;
  onValueChange?: (value: BoxModelValue) => void;
  baseline?: BoxModelValue;
  min?: number;
  max?: number;
  /** Pointer travel (px) per unit while dragging an edge. Default 2. */
  pixelsPerUnit?: number;
  /** Text in the content box, e.g. "288 × auto". */
  contentLabel?: ReactNode;
  /** Fires with the hovered/dragged/focused edge — use it to highlight the preview. */
  onActiveChange?: (target: BoxModelTarget | null) => void;
  disabled?: boolean;
  sound?: boolean;
  className?: string;
}

const ZERO: BoxModelValue = { margin: [0, 0, 0, 0], padding: [0, 0, 0, 0] };

export function PropertyBoxModel({
  value: valueProp,
  defaultValue = ZERO,
  onValueChange,
  baseline: baselineProp,
  min = 0,
  max = 240,
  pixelsPerUnit = 2,
  contentLabel = "content",
  onActiveChange,
  disabled,
  sound,
  className,
}: PropertyBoxModelProps) {
  const play = useFieldSound(sound);
  const [value, setValue] = useControllable(valueProp, defaultValue, onValueChange);
  const [initial] = useState(() => valueProp ?? defaultValue);
  const baseline = baselineProp ?? initial;
  const valueRef = useRef(value);
  valueRef.current = value;
  const modified = (["margin", "padding"] as const).some((b) => value[b].some((v, i) => v !== baseline[b][i]));
  useModified(modified, () => setValue(baseline));

  const [hover, setHover] = useState<BoxModelTarget | null>(null);
  const [focus, setFocus] = useState<BoxModelTarget | null>(null);
  const [dragging, setDragging] = useState<BoxModelTarget | null>(null);
  const [editing, setEditing] = useState<BoxModelTarget | null>(null);
  const active = dragging ?? hover ?? focus;
  const activeKey = active ? `${active.box}-${active.side}` : "";
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;
  useEffect(() => {
    onActiveRef.current?.(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  const setSide = (t: BoxModelTarget, raw: number, mirror = false, withTicks = false) => {
    const prevV = valueRef.current;
    const v = clamp(Math.round(raw), min, max);
    const prev = prevV[t.box][t.side];
    if (v === prev && !mirror) return;
    const sides = [...prevV[t.box]] as BoxSides;
    sides[t.side] = v;
    if (mirror) sides[(t.side + 2) % 4] = v;
    const next = { ...prevV, [t.box]: sides };
    valueRef.current = next;
    setValue(next);
    if (withTicks && v !== prev) {
      if (v === min || v === max) play("tick", { velocity: 0.6, pitch: 0.75 });
      else if (Math.floor(v / 4) !== Math.floor(prev / 4)) play("tick", { velocity: 0.28 });
    }
  };

  return (
    <div className={cn("relative select-none", disabled && "pointer-events-none opacity-45", className)} data-modified={modified || undefined}>
      <div className="relative h-[156px] rounded-md bg-ink/[0.045] shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
        <span className="pointer-events-none absolute top-1.5 left-2 font-mono text-[10px] leading-3 tracking-[0.06em] text-muted uppercase">margin</span>
        <div className="absolute inset-[28px] rounded-sm bg-raised shadow-[inset_0_0_0_1px_var(--dt-rule)]">
          <span className="pointer-events-none absolute top-1.5 left-2 font-mono text-[10px] leading-3 tracking-[0.06em] text-muted uppercase">padding</span>
          <div className="absolute inset-[26px] flex items-center justify-center rounded-xs bg-ink/[0.045] shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
            <span className="font-mono text-2xs tabular text-muted">{contentLabel}</span>
          </div>
        </div>
        {(["margin", "padding"] as const).map((box) =>
          ([0, 1, 2, 3] as const).map((side) => {
            const t: BoxModelTarget = { box, side };
            const key = `${box}-${side}`;
            return (
              <BoxEdge
                key={key}
                target={t}
                value={value[box][side]}
                baseline={baseline[box][side]}
                min={min}
                max={max}
                active={activeKey === key}
                dragging={dragging?.box === box && dragging.side === side}
                editing={editing?.box === box && editing.side === side}
                pixelsPerUnit={pixelsPerUnit}
                getValue={() => valueRef.current[box][side]}
                onSet={(v, mirror, ticks) => setSide(t, v, mirror, ticks)}
                onHover={(on) => setHover(on ? t : null)}
                onFocusChange={(on) => setFocus(on ? t : null)}
                onDragChange={(on) => setDragging(on ? t : null)}
                onEditChange={(on) => setEditing(on ? t : null)}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

/** Geometry of each band inside the 156px-tall diagram (outer inset 28, inner inset 26). */
function edgeStyle(box: "margin" | "padding", side: number): CSSProperties {
  const o = box === "margin" ? 0 : 28; // band's outer offset
  const t = box === "margin" ? 28 : 26; // band thickness
  const inner = o + t;
  // Top/bottom bands stay clear of the corner labels.
  const span = box === "margin" ? "26%" : "38%";
  switch (side) {
    case 0:
      return { top: o, left: span, right: span, height: t };
    case 2:
      return { bottom: o, left: span, right: span, height: t };
    case 1:
      return { right: o, top: inner, bottom: inner, width: t };
    default:
      return { left: o, top: inner, bottom: inner, width: t };
  }
}

function BoxEdge({
  target,
  value,
  baseline,
  min,
  max,
  active,
  dragging,
  editing,
  pixelsPerUnit,
  getValue,
  onSet,
  onHover,
  onFocusChange,
  onDragChange,
  onEditChange,
}: {
  target: BoxModelTarget;
  value: number;
  baseline: number;
  min: number;
  max: number;
  active: boolean;
  dragging: boolean;
  editing: boolean;
  pixelsPerUnit: number;
  getValue: () => number;
  onSet: (v: number, mirror: boolean, ticks: boolean) => void;
  onHover: (on: boolean) => void;
  onFocusChange: (on: boolean) => void;
  onDragChange: (on: boolean) => void;
  onEditChange: (on: boolean) => void;
}) {
  const { box, side } = target;
  const vertical = side === 0 || side === 2; // top/bottom bands are dragged vertically
  const sign = side === 0 || side === 3 ? -1 : 1; // dragging outward increases
  const label = `${box === "margin" ? "Margin" : "Padding"} ${SIDE_NAMES[side]}`;
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ p: number; base: number; moved: boolean; release?: () => void } | null>(null);
  const [draft, setDraft] = useState("");
  const modified = value !== baseline;

  const pos = (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX);

  const commitEdit = (keep: boolean) => {
    if (keep) {
      const v = evaluatePropertyExpression(draft.replace(/px/gi, ""));
      if (v != null) onSet(v, false, false);
    }
    onEditChange(false);
    requestAnimationFrame(() => ref.current?.focus());
  };

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${value} px`}
      data-active={active || undefined}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={(e) => e.target === e.currentTarget && onFocusChange(true)}
      onBlur={(e) => e.target === e.currentTarget && onFocusChange(false)}
      onPointerDown={(e) => {
        if (editing || e.button !== 0) return;
        // No preventDefault: the native mousedown focuses the band without a keyboard focus ring.
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { p: pos(e), base: getValue(), moved: false };
      }}
      onPointerMove={(e) => {
        const s = drag.current;
        if (!s) return;
        const d = (pos(e) - s.p) * sign;
        if (!s.moved) {
          if (Math.abs(d) < 2) return;
          s.moved = true;
          s.p = pos(e);
          s.release = lockBodyForDrag(vertical ? "ns-resize" : "ew-resize");
          onDragChange(true);
          return;
        }
        let v = s.base + Math.round(d / pixelsPerUnit);
        if (e.shiftKey) v = Math.round(v / 4) * 4; // snap to the 4px grid
        onSet(v, e.altKey, true);
      }}
      onPointerUp={() => {
        const s = drag.current;
        drag.current = null;
        if (s?.moved) {
          s.release?.();
          onDragChange(false);
        }
      }}
      onLostPointerCapture={() => {
        const s = drag.current;
        drag.current = null;
        if (s?.moved) {
          s.release?.();
          onDragChange(false);
        }
      }}
      onDoubleClick={() => {
        setDraft(String(value));
        onEditChange(true);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const inc = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowUp" || e.key === "ArrowRight") onSet(value + inc, e.altKey, false);
        else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onSet(value - inc, e.altKey, false);
        else if (e.key === "Home") onSet(min, false, false);
        else if (e.key === "End") onSet(max, false, false);
        else if (e.key === "Enter" || e.key === "F2") {
          setDraft(String(value));
          onEditChange(true);
        } else if (/^[0-9]$/.test(e.key)) {
          setDraft(e.key);
          onEditChange(true);
          requestAnimationFrame(() => {
            const el = inputRef.current;
            if (el) el.setSelectionRange(el.value.length, el.value.length);
          });
        } else return;
        e.preventDefault();
      }}
      style={edgeStyle(box, side)}
      className={cn(
        "group/edge focus-ring absolute flex items-center justify-center rounded-[3px] outline-none",
        vertical ? "cursor-ns-resize" : "cursor-ew-resize",
        active ? "bg-pencil-soft" : "",
      )}
    >
      {/* The edge itself: a hairline on the band's outer side, inked in pencil when live. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bg-pencil transition-opacity duration-[90ms]",
          side === 0 && "inset-x-1 top-0 h-px",
          side === 2 && "inset-x-1 bottom-0 h-px",
          side === 1 && "inset-y-1 right-0 w-px",
          side === 3 && "inset-y-1 left-0 w-px",
          dragging ? "opacity-100" : active ? "opacity-50" : "opacity-0",
        )}
      />
      {editing ? (
        <input
          ref={inputRef}
          aria-label={`${label} value`}
          value={draft}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commitEdit(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (e.preventDefault(), commitEdit(true));
            else if (e.key === "Escape") (e.preventDefault(), commitEdit(false));
          }}
          className="h-5 w-9 rounded-xs bg-raised text-center font-mono text-2xs tabular text-ink shadow-[inset_0_0_0_1px_var(--dt-pencil)] outline-none"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "font-mono text-2xs tabular",
            dragging || modified ? "text-pencil-ink" : value === 0 ? "text-muted" : "text-ink-2",
            active && !dragging && !modified && "text-ink",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
