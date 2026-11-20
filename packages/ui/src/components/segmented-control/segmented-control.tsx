"use client";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../../icons";
import { cn, useControllable } from "../../lib/utils";
import { ease, spring, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type SegmentedControlSize = "sm" | "md" | "lg";

/** The trailing edge follows on a softer spring than `glide`, so travel direction is felt. */
const TRAIL = { type: "spring", stiffness: 300, damping: 34, mass: 1 } as const;
/** Fraction of an item the indicator must cover before its label lights up. */
const ARRIVE = 0.72;

const SIZE: Record<SegmentedControlSize, { h: number; px: number; text: string; icon: number; gap: number }> = {
  sm: { h: 24, px: 8, text: "text-xs", icon: 14, gap: 5 },
  md: { h: 28, px: 12, text: "text-sm", icon: 14, gap: 6 },
  lg: { h: 32, px: 14, text: "text-base", icon: 16, gap: 7 },
};

interface Ctx {
  value: string | undefined;
  lit: string | undefined;
  focusable: string | undefined;
  ready: boolean;
  size: SegmentedControlSize;
  fullWidth: boolean;
  disabled: boolean;
  select: (v: string) => void;
  onItemKeyDown: (e: KeyboardEvent<HTMLButtonElement>, v: string) => void;
}
const SegCtx = createContext<Ctx | null>(null);

export interface SegmentedControlProps {
  /** Controlled selected value. */
  value?: string;
  /** Initial value when uncontrolled. Defaults to the first enabled item. */
  defaultValue?: string;
  /** Fires when the user selects a segment. */
  onValueChange?: (value: string) => void;
  /** `SegmentedControlItem`s. */
  children: ReactNode;
  /** 28, 32 or 36 px tall overall. */
  size?: SegmentedControlSize;
  /** Stretch to the container; segments share the width equally. */
  fullWidth?: boolean;
  /**
   * automatic: arrow keys move focus and select (default).
   * manual: arrow keys move focus only; Space/Enter selects.
   */
  activation?: "automatic" | "manual";
  /** Disable every segment. */
  disabled?: boolean;
  /** Renders a hidden input for native forms. */
  name?: string;
  /** Allow this instance to play sounds. */
  sound?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function SegmentedControl({
  value: valueProp,
  defaultValue,
  onValueChange,
  children,
  size = "md",
  fullWidth = false,
  activation = "automatic",
  disabled = false,
  name,
  sound: soundOn = true,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SegmentedControlProps) {
  const [value, setValue] = useControllable<string | undefined>(valueProp, defaultValue, onValueChange as (v: string | undefined) => void);
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [lit, setLit] = useState<string | undefined>(value);
  const [boundaries, setBoundaries] = useState<{ x: number; between: [string, string] }[]>([]);
  const [firstEnabled, setFirstEnabled] = useState<string | undefined>(undefined);

  const left = useMotionValue(0);
  const right = useMotionValue(0);
  const width = useTransform(() => Math.max(0, right.get() - left.get()));
  const rects = useRef(new Map<string, [number, number]>());
  const target = useRef<string | undefined>(value);

  const items = () =>
    root.current ? Array.from(root.current.querySelectorAll<HTMLButtonElement>(":scope > [data-seg-item]")) : [];

  const measure = useCallback(() => {
    const map = new Map<string, [number, number]>();
    const els = items();
    els.forEach((el) => map.set(el.dataset.segItem!, [el.offsetLeft, el.offsetLeft + el.offsetWidth]));
    rects.current = map;
    setBoundaries(
      els.slice(1).map((el, i) => ({ x: el.offsetLeft, between: [els[i].dataset.segItem!, el.dataset.segItem!] as [string, string] })),
    );
    setFirstEnabled(els.find((el) => !el.disabled)?.dataset.segItem);
    return map;
  }, []);

  // Which label is lit: the target, once the indicator has (mostly) arrived over it.
  const updateLit = useCallback(() => {
    const t = target.current;
    if (t === undefined) return setLit(undefined);
    const r = rects.current.get(t);
    if (!r) return setLit(t);
    const l = left.get();
    const rr = right.get();
    const cover = Math.max(0, Math.min(rr, r[1]) - Math.max(l, r[0])) / Math.max(1, r[1] - r[0]);
    if (cover >= ARRIVE) setLit(t);
  }, [left, right]);

  useEffect(() => {
    const a = left.on("change", updateLit);
    const b = right.on("change", updateLit);
    return () => (a(), b());
  }, [left, right, updateLit]);

  // Place (first time / resize) or travel (value change).
  const placed = useRef(false);
  useIsoLayoutEffect(() => {
    target.current = value;
    const map = rects.current.size ? rects.current : measure();
    const r = value !== undefined ? map.get(value) : undefined;
    if (!r) {
      setLit(undefined);
      return;
    }
    if (!placed.current || m.reduced) {
      placed.current = true;
      left.set(r[0]);
      right.set(r[1]);
      setLit(value);
      setReady(true);
      return;
    }
    const goingRight = r[0] > left.get();
    // Inchworm: the leading edge sets off on `glide`, the trailing edge follows on a softer spring.
    const lead = spring.glide;
    const c1 = animate(right, r[1], goingRight ? lead : TRAIL);
    const c2 = animate(left, r[0], goingRight ? TRAIL : lead);
    return () => {
      c1.stop();
      c2.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Re-measure on resize and snap the indicator (no travel for layout changes).
  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const map = measure();
      const r = target.current !== undefined ? map.get(target.current) : undefined;
      if (r && !left.isAnimating() && !right.isAnimating()) {
        left.set(r[0]);
        right.set(r[1]);
      }
    });
    ro.observe(el);
    items().forEach((i) => ro.observe(i));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  const select = (v: string) => {
    if (disabled || v === value) return;
    play("select");
    setValue(v);
  };

  const onItemKeyDown = (e: KeyboardEvent<HTMLButtonElement>, v: string) => {
    const els = items().filter((el) => !el.disabled);
    const i = els.findIndex((el) => el.dataset.segItem === v);
    let next: HTMLButtonElement | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = els[(i + 1) % els.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = els[(i - 1 + els.length) % els.length];
    else if (e.key === "Home") next = els[0];
    else if (e.key === "End") next = els[els.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
    if (activation === "automatic") select(next.dataset.segItem!);
  };

  const [focused, setFocused] = useState<string | undefined>(undefined);
  const focusable = value ?? focused ?? firstEnabled;

  return (
    <SegCtx.Provider value={{ value, lit, focusable, ready, size, fullWidth, disabled, select, onItemKeyDown }}>
      <div
        ref={root}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-disabled={disabled || undefined}
        onFocus={(e) => {
          const v = (e.target as HTMLElement).dataset?.segItem;
          if (v) setFocused(v);
        }}
        className={cn(
          "relative isolate items-stretch rounded-sm bg-sunken p-0.5 shadow-[inset_0_0_0_1px_var(--dt-hairline),var(--dt-press)]",
          fullWidth ? "flex w-full" : "inline-flex",
          disabled && "opacity-45",
          className,
        )}
      >
        {/* hairline separators between unlit neighbours */}
        {boundaries.map((b) => (
          <span
            key={b.between.join("|")}
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-rule transition-opacity duration-[120ms]",
              b.between.includes(lit ?? "") || b.between.includes(value ?? "") ? "opacity-0" : "opacity-100",
            )}
            style={{ left: b.x }}
          />
        ))}
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0.5 left-0 z-[1] rounded-[3px] bg-raised",
            "shadow-[0_0_0_0.5px_var(--dt-thumb-edge),0_1px_2px_rgb(0_0_0/0.08),inset_0_1px_0_var(--dt-highlight)]",
            ready && value !== undefined ? "opacity-100" : "opacity-0",
          )}
          style={{ x: left, width }}
        />
        {children}
        {name && value !== undefined && <input type="hidden" name={name} value={value} />}
      </div>
    </SegCtx.Provider>
  );
}

export interface SegmentedControlItemProps {
  /** The value this segment selects. */
  value: string;
  /** Visible label. Omit for an icon-only segment (then pass `aria-label`). */
  children?: ReactNode;
  /** Leading icon — an icon name or any node. */
  icon?: IconName | ReactNode;
  /** Optional count, shown in mono after the label. */
  count?: number | string;
  /** Disable this segment. */
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

export function SegmentedControlItem({ value, children, icon, count, disabled: itemDisabled, "aria-label": ariaLabel, className }: SegmentedControlItemProps) {
  const ctx = useContext(SegCtx);
  if (!ctx) throw new Error("SegmentedControlItem must be used inside SegmentedControl");
  const d = SIZE[ctx.size];
  const selected = ctx.value === value;
  const lit = ctx.lit === value;
  const disabled = ctx.disabled || itemDisabled;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      tabIndex={ctx.focusable === value ? 0 : -1}
      data-seg-item={value}
      data-lit={lit || undefined}
      onClick={() => ctx.select(value)}
      onKeyDown={(e) => ctx.onItemKeyDown(e, value)}
      style={{ height: d.h, paddingInline: children ? d.px : 0, minWidth: d.h, gap: d.gap }}
      className={cn(
        "focus-ring relative z-[2] inline-flex select-none items-center justify-center whitespace-nowrap rounded-[3px] font-medium",
        ctx.fullWidth && "flex-1",
        d.text,
        // labels light on arrival (instant); they dim and un-hover over 90 ms
        lit ? "text-ink" : "text-muted transition-colors duration-[90ms] ease-out hover:text-ink hover:duration-0",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        itemDisabled && !ctx.disabled && "opacity-45",
        // Before the indicator is measured (SSR), the lit segment draws its own surface.
        !ctx.ready && lit && "bg-raised shadow-1",
        className,
      )}
    >
      {icon && (
        <span className="inline-flex shrink-0" aria-hidden>
          {typeof icon === "string" ? <Icon name={icon as IconName} size={d.icon} /> : icon}
        </span>
      )}
      {children}
      {count !== undefined && (
        <span className={cn("font-mono tabular text-2xs transition-colors duration-[90ms]", lit ? "text-ink-2" : "text-muted")}>{count}</span>
      )}
    </button>
  );
}

/* ── Panels ─────────────────────────────────────────────────── */

export interface SegmentedPanelsProps {
  /** The currently selected value (same as the control's). */
  value: string;
  /** Segment values in visual order — used to work out the direction of travel. */
  order: readonly string[];
  /** Render the panel for a value. */
  children: (value: string) => ReactNode;
  className?: string;
}

/** Direction-aware content below a SegmentedControl: slides ±8 px the way the indicator went and crossfades over 150 ms. */
export function SegmentedPanels({ value, order, children, className }: SegmentedPanelsProps) {
  const m = useMotionTokens();
  const [state, setState] = useState({ value, dir: 0 });
  if (state.value !== value) {
    setState({ value, dir: Math.sign(order.indexOf(value) - order.indexOf(state.value)) });
  }
  const dir = state.dir;
  const t = { duration: 0.15, ease: ease.out };
  return (
    <div className={cn("relative grid", className)}>
      <AnimatePresence initial={false} custom={dir}>
        <motion.div
          key={value}
          custom={dir}
          className="col-start-1 row-start-1 min-w-0"
          variants={{
            enter: (d: number) => ({ opacity: 0, x: m.reduced ? 0 : d * 8 }),
            center: { opacity: 1, x: 0, pointerEvents: "auto", transition: { opacity: m.fade(t), x: m.move(t) } },
            // the outgoing panel never captures clicks mid-fade
            exit: (d: number) => ({ opacity: 0, x: m.reduced ? 0 : -d * 8, pointerEvents: "none", transition: { opacity: m.fade(t), x: m.move(t) } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {children(value)}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
