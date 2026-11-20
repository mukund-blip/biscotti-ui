"use client";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import { ease, spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";

export type SliderValue = number | [number, number];

export interface SliderMark {
  value: number;
  /** Short label under the ruler, e.g. "Recommended". */
  label?: ReactNode;
}

export interface InteractiveSliderProps<T extends SliderValue = number> {
  /** Controlled value — a number, or `[low, high]` for a range. */
  value?: T;
  /** Initial value when uncontrolled; also where double-click / Delete glides back to. */
  defaultValue?: T;
  /** Reset target when controlled without a `defaultValue`. */
  resetValue?: T;
  /** Fires continuously while the value changes (drag, keys). */
  onValueChange?: (value: T) => void;
  /** Fires once the value settles: pointer release, or each keyboard step. */
  onValueCommit?: (value: T) => void;
  min?: number;
  max?: number;
  /** Value granularity (linear scale). Log scale rounds to 3 significant figures. */
  step?: number;
  /** Spacing of the tall, labelled ruler ticks (linear scale). Defaults to a quarter of the range. */
  majorStep?: number;
  /** `log` maps position logarithmically (e.g. 20 Hz – 20 kHz). `min` must be > 0. */
  scale?: "linear" | "log";
  /** Labelled reference points. Marks are detents: the thumb is pulled into them. */
  marks?: SliderMark[];
  /**
   * Magnetic detents. `true` uses marks (or major ticks if there are none) with an 8 px pull;
   * a number sets the pull radius in px. Defaults to on when `marks` are given.
   */
  snap?: boolean | number;
  /** Format the readout and `aria-valuetext`, e.g. `(v) => \`${v} dB\``. */
  formatValue?: (value: number) => string;
  /** Format the short ruler labels. Defaults to compact numbers (1k, 10k). */
  formatTick?: (value: number) => string;
  /** Show the ruler under the track. */
  ruler?: boolean;
  /** Visible label. If omitted, pass `aria-label`. */
  label?: ReactNode;
  /** Accessible names for the two thumbs of a range. */
  thumbLabels?: [string, string];
  disabled?: boolean;
  /** Renders hidden input(s) for native forms. */
  name?: string;
  /** Allow this instance to play sounds. */
  sound?: boolean;
  className?: string;
  "aria-label"?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const decimals = (n: number) => {
  const s = String(n);
  return s.includes(".") ? s.split(".")[1].length : 0;
};
const roundSig = (v: number, sig = 3) => {
  if (v === 0) return 0;
  const p = Math.pow(10, sig - Math.ceil(Math.log10(Math.abs(v))));
  return Math.round(v * p) / p;
};
/** Rounded so server and client render identical style strings. */
const pct = (f: number) => `${(f * 100).toFixed(3)}%`;
const compact = (v: number) =>
  Math.abs(v) >= 1000 ? `${roundSig(v / 1000, 3)}k` : String(roundSig(v, 3));

/** Linear ↔ log mapping between value and track fraction (0–1). */
function useScale(min: number, max: number, step: number, kind: "linear" | "log") {
  return useMemo(() => {
    const log = kind === "log" && min > 0;
    const lr = Math.log(max / min);
    const toFrac = (v: number) => clamp(log ? Math.log(v / min) / lr : (v - min) / (max - min || 1), 0, 1);
    const fromFrac = (f: number) => (log ? min * Math.exp(clamp(f, 0, 1) * lr) : min + clamp(f, 0, 1) * (max - min));
    const dp = decimals(step);
    const quantize = (v: number) => {
      const c = clamp(v, min, max);
      if (log) return clamp(roundSig(c, 3), min, max);
      const q = min + Math.round((c - min) / step) * step;
      return clamp(Number(q.toFixed(dp)), min, max);
    };
    return { log, toFrac, fromFrac, quantize, dp };
  }, [min, max, step, kind]);
}

interface Tick {
  value: number;
  major: boolean;
}

function buildTicks(min: number, max: number, step: number, majorStep: number | undefined, log: boolean): Tick[] {
  if (log) {
    const out: Tick[] = [{ value: min, major: true }];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
      for (let k = 1; k <= 9; k++) {
        const v = k * Math.pow(10, e);
        if (v <= min || v >= max) continue;
        out.push({ value: v, major: k === 1 });
      }
    }
    out.push({ value: max, major: true });
    return out;
  }
  const range = max - min;
  const major = majorStep ?? range / 4;
  const steps = range / step;
  const minor = steps <= 40 ? step : major / 5 >= step ? major / 5 : major;
  const out: Tick[] = [];
  const n = Math.round(range / minor);
  if (n > 120) return [{ value: min, major: true }, { value: max, major: true }];
  for (let i = 0; i <= n; i++) {
    const v = Number((min + i * minor).toFixed(6));
    const isMajor = Math.abs(((v - min) / major) - Math.round((v - min) / major)) < 1e-6;
    out.push({ value: v, major: isMajor || i === 0 || i === n });
  }
  return out;
}

export function InteractiveSlider<T extends SliderValue = number>({
  value: valueProp,
  defaultValue,
  resetValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  majorStep,
  scale: scaleKind = "linear",
  marks,
  snap,
  formatValue,
  formatTick = compact,
  ruler = true,
  label,
  thumbLabels = ["Minimum", "Maximum"],
  disabled = false,
  name,
  sound: soundOn = true,
  className,
  "aria-label": ariaLabel,
}: InteractiveSliderProps<T>) {
  const id = useId();
  const labelId = `${id}-label`;
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const sc = useScale(min, max, step, scaleKind);
  const fmtValue = formatValue ?? ((v: number) => (sc.log ? String(roundSig(v, 3)) : v.toFixed(sc.dp)));

  /* ── value (always handled as an array internally) ── */
  const fallback = (Array.isArray(valueProp ?? defaultValue) ? [min, max] : min) as T;
  const [inner, setInner] = useState<T>(defaultValue ?? fallback);
  const controlled = valueProp !== undefined;
  const current = (controlled ? valueProp : inner) as T;
  const isRange = Array.isArray(current);
  const vals: number[] = isRange ? [...(current as [number, number])] : [current as number];
  const valsRef = useRef(vals);
  valsRef.current = vals;
  const pack = (arr: number[]) => (isRange ? ([arr[0], arr[1]] as T) : (arr[0] as T));
  const emit = (arr: number[]) => {
    const same = arr.every((v, i) => v === valsRef.current[i]);
    if (same) return false;
    valsRef.current = arr;
    if (!controlled) setInner(pack(arr));
    onValueChange?.(pack(arr));
    return true;
  };
  const resetTarget = resetValue ?? defaultValue;

  /* ── detents ── */
  const ticks = useMemo(() => buildTicks(min, max, step, majorStep, sc.log), [min, max, step, majorStep, sc.log]);
  const snapOn = snap === undefined ? !!marks?.length : snap !== false;
  const snapRadius = typeof snap === "number" ? snap : 8;
  const detents = useMemo(
    () => (!snapOn ? [] : marks?.length ? marks.map((mk) => mk.value) : ticks.filter((t) => t.major).map((t) => t.value)),
    [snapOn, marks, ticks],
  );

  /* ── motion: one fraction per thumb ── */
  const f0 = useMotionValue(sc.toFrac(vals[0]));
  const f1 = useMotionValue(sc.toFrac(vals[1] ?? vals[0]));
  const fracs = [f0, f1];
  const targets = useRef<number[]>([sc.toFrac(vals[0]), sc.toFrac(vals[1] ?? vals[0])]);
  const anims = useRef<(ReturnType<typeof animate> | null)[]>([null, null]);
  const moveThumb = (i: number, frac: number, how: "set" | "control" | "glide") => {
    targets.current[i] = frac;
    const mv = fracs[i];
    if (how === "set" || m.reduced) {
      anims.current[i]?.stop();
      anims.current[i] = null;
      mv.set(frac);
      return;
    }
    anims.current[i] = animate(mv, frac, how === "glide" ? spring.glide : spring.control);
  };
  // Outside (controlled) changes glide; our own updates have already set the target.
  useEffect(() => {
    vals.forEach((v, i) => {
      const f = sc.toFrac(v);
      if (Math.abs(f - targets.current[i]) > 1e-6) moveThumb(i, f, "glide");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals.join(","), sc]);

  const fillX = useTransform(() => (isRange ? pct(f0.get()) : "0%"));
  const fillScale = useTransform(() => (isRange ? Math.max(0, f1.get() - f0.get()) : f0.get()));

  /* ── pointer ── */
  const track = useRef<HTMLDivElement>(null);
  const thumbs = useRef<(HTMLDivElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const lastGrab = useRef<number | null>(null);
  const drag = useRef<{
    i: number;
    raw: number;
    offset: number;
    left: number;
    width: number;
    lastX: number;
    lastT: number;
    zone: number | null;
  } | null>(null);

  const bounds = (i: number, arr = valsRef.current) =>
    isRange ? (i === 0 ? [0, sc.toFrac(arr[1])] : [sc.toFrac(arr[0]), 1]) : [0, 1];

  const zoneOf = (raw: number, width: number) => {
    let best: number | null = null;
    let bestD = Infinity;
    detents.forEach((d, k) => {
      const px = Math.abs(sc.toFrac(d) - raw) * width;
      if (px <= snapRadius && px < bestD) {
        best = k;
        bestD = px;
      }
    });
    return best as number | null;
  };

  const applyRaw = (s: NonNullable<typeof drag.current>, raw: number, speed: number, jump: boolean) => {
    const prevRaw = s.raw;
    s.raw = raw;
    const zone = zoneOf(raw, s.width);
    const v = zone !== null ? detents[zone] : sc.quantize(sc.fromFrac(raw));
    // Tick when entering a detent, or when skipping clean over one between frames.
    const crossed =
      (zone !== null && zone !== s.zone) ||
      detents.some((d, k) => k !== s.zone && k !== zone && (sc.toFrac(d) - prevRaw) * (sc.toFrac(d) - raw) < 0);
    if (crossed && !jump) play("tick", { velocity: clamp(0.35 + speed * 0.3, 0.3, 1), pitch: 0.92 + clamp(speed, 0, 2) * 0.08 });
    s.zone = zone;
    const next = [...valsRef.current];
    next[s.i] = v;
    emit(next);
    const f = sc.toFrac(v);
    const gap = Math.abs(f - fracs[s.i].get()) * s.width;
    // Small moves track 1:1; jumps (track click, detent pull/release) settle on the control spring.
    moveThumb(s.i, f, jump || gap > 3 || fracs[s.i].isAnimating() ? "control" : "set");
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0 || !track.current) return;
    e.preventDefault();
    const rect = track.current.getBoundingClientRect();
    const pf = clamp((e.clientX - rect.left) / (rect.width || 1), 0, 1);
    const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-thumb]");
    lastGrab.current = hit ? Number(hit.dataset.thumb) : null;
    let i = hit ? Number(hit.dataset.thumb) : 0;
    if (!hit && isRange) {
      const d0 = Math.abs(pf - f0.get());
      const d1 = Math.abs(pf - f1.get());
      i = d0 < d1 || (d0 === d1 && pf < f0.get()) ? 0 : 1;
    }
    const cur = fracs[i].get();
    const s = { i, raw: cur, offset: hit ? pf - cur : 0, left: rect.left, width: rect.width || 1, lastX: e.clientX, lastT: e.timeStamp, zone: zoneOf(cur, rect.width || 1) };
    drag.current = s;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    // Keep keyboard continuity without drawing a focus ring for a pointer grab.
    thumbs.current[i]?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    setDragging(i);
    if (!hit) {
      const [lo, hi] = bounds(i);
      applyRaw(s, clamp(pf, lo, hi), 0, true);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = drag.current;
    if (!s) return;
    const dx = e.clientX - s.lastX;
    const dt = Math.max(1, e.timeStamp - s.lastT);
    s.lastX = e.clientX;
    s.lastT = e.timeStamp;
    const pf = (e.clientX - s.left) / s.width;
    const [lo, hi] = bounds(s.i);
    let raw: number;
    if (e.shiftKey) {
      // Fine adjust: 10× finer, relative; re-anchor so letting go of Shift doesn't jump.
      raw = clamp(s.raw + (dx / s.width) * 0.1, lo, hi);
      s.offset = pf - raw;
    } else {
      raw = clamp(pf - s.offset, lo, hi);
    }
    if (raw === s.raw) return;
    applyRaw(s, raw, Math.abs(dx) / dt, false);
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(null);
    onValueCommit?.(pack(valsRef.current));
  };

  /* ── keyboard ── */
  const reset = (i?: number) => {
    if (resetTarget === undefined) return;
    const r: number[] = Array.isArray(resetTarget) ? [...resetTarget] : [resetTarget as number];
    const next = i === undefined || !isRange ? r : valsRef.current.map((v, k) => (k === i ? r[k] : v));
    if (emit(next)) {
      next.forEach((v, k) => moveThumb(k, sc.toFrac(v), "glide"));
      play("tick", { velocity: 0.5 });
      onValueCommit?.(pack(next));
    }
  };

  const onThumbKeyDown = (e: KeyboardEvent<HTMLDivElement>, i: number) => {
    if (disabled) return;
    const v = valsRef.current[i];
    const [loF, hiF] = bounds(i);
    const lo = sc.fromFrac(loF);
    const hi = sc.fromFrac(hiF);
    const mult = e.shiftKey ? 10 : 1;
    const page = sc.log ? 0.1 : majorStep ?? (max - min) / 4;
    let next: number | null = null;
    const byFrac = (df: number) => sc.quantize(sc.fromFrac(sc.toFrac(v) + df));
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = sc.log ? byFrac(0.01 * mult) : v + step * mult;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = sc.log ? byFrac(-0.01 * mult) : v - step * mult;
        break;
      case "PageUp":
        next = sc.log ? byFrac(page) : v + page;
        break;
      case "PageDown":
        next = sc.log ? byFrac(-page) : v - page;
        break;
      case "Home":
        next = lo;
        break;
      case "End":
        next = hi;
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        reset(i);
        return;
      default:
        return;
    }
    e.preventDefault();
    const q = clamp(sc.quantize(next), sc.quantize(lo), sc.quantize(hi));
    const arr = [...valsRef.current];
    arr[i] = q;
    if (emit(arr)) {
      moveThumb(i, sc.toFrac(q), "set"); // keyboard moves instantly
      play("tick", { velocity: detents.includes(q) ? 0.6 : 0.32 });
      onValueCommit?.(pack(arr));
    }
  };

  /* ── render ── */
  const nameFor = (i: number) => {
    const base = typeof label === "string" ? label : ariaLabel;
    if (!isRange) return label ? undefined : ariaLabel;
    return base ? `${base} ${thumbLabels[i].toLowerCase()}` : thumbLabels[i];
  };
  const loF = isRange ? sc.toFrac(vals[0]) : 0;
  const hiF = sc.toFrac(isRange ? vals[1] : vals[0]);
  const readout = isRange ? `${fmtValue(vals[0])} – ${fmtValue(vals[1])}` : fmtValue(vals[0]);
  const majorLabels = ticks.filter((t) => t.major);

  return (
    <div className={cn("grid select-none gap-2", disabled && "opacity-45", className)}>
      <div className="flex items-baseline justify-between gap-3 px-1.5">
        {label ? (
          <span id={labelId} className="text-sm text-ink-2">
            {label}
          </span>
        ) : (
          <span />
        )}
        <span
          aria-hidden
          className={cn(
            "font-mono text-sm tabular",
            dragging !== null ? "text-pencil-ink" : "text-ink transition-colors duration-[240ms] ease-out",
          )}
        >
          {readout}
        </span>
      </div>

      <div className="px-1.5">
        {/* track + thumbs (24 px tall hit zone) */}
        <div
          ref={track}
          className={cn("relative h-6 touch-none", disabled ? "cursor-not-allowed" : "cursor-pointer")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          // Pointer capture retargets the dblclick to the track; reset the thumb that was grabbed.
          onDoubleClick={() => lastGrab.current !== null && reset(lastGrab.current)}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-xs bg-sunken shadow-[inset_0_0_0_1px_var(--dt-rule),var(--dt-press)]">
            <motion.div
              className={cn(
                "absolute inset-0 origin-left",
                dragging !== null ? "bg-pencil" : "bg-ink transition-colors duration-[240ms] ease-out",
              )}
              style={{ x: fillX, scaleX: fillScale }}
            />
          </div>
          {/* mark notches on the track */}
          {(marks ?? []).map((mk) => (
            <span
              key={`n${mk.value}`}
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-edge"
              style={{ left: pct(sc.toFrac(mk.value)) }}
            />
          ))}
          {vals.map((v, i) => (
            <Thumb
              key={i}
              index={i}
              frac={fracs[i]}
              thumbRef={(el) => (thumbs.current[i] = el)}
              label={nameFor(i)}
              labelledBy={label && !isRange ? labelId : undefined}
              value={v}
              valueText={fmtValue(v)}
              min={isRange && i === 1 ? vals[0] : min}
              max={isRange && i === 0 ? vals[1] : max}
              disabled={disabled}
              dragging={dragging === i}
              reduced={m.reduced}
              onKeyDown={(e) => onThumbKeyDown(e, i)}
            />
          ))}
        </div>

        {ruler && (
          <div aria-hidden className="relative mt-1 h-2">
            {ticks.map((t) => {
              const f = sc.toFrac(t.value);
              const passed = f >= loF - 1e-6 && f <= hiF + 1e-6;
              return (
                <span
                  key={t.value}
                  className={cn("absolute top-0 w-px", t.major ? "h-2" : "h-1", passed ? "bg-ink-2" : "bg-rule")}
                  style={{ left: pct(f) }}
                />
              );
            })}
          </div>
        )}
        {ruler && (
          <div aria-hidden className="relative mt-1 h-4 font-mono text-2xs tabular text-muted">
            {majorLabels.map((t) => (
              <RulerLabel key={t.value} frac={sc.toFrac(t.value)}>
                {formatTick(t.value)}
              </RulerLabel>
            ))}
          </div>
        )}
        {marks?.some((mk) => mk.label) && (
          <div aria-hidden className="relative h-4 text-2xs text-ink-2">
            {marks.map((mk) =>
              mk.label ? (
                <MarkLabel key={mk.value} frac={sc.toFrac(mk.value)}>
                  {mk.label}
                </MarkLabel>
              ) : null,
            )}
          </div>
        )}
      </div>

      {name &&
        vals.map((v, i) => <input key={i} type="hidden" name={name} value={v} disabled={disabled} />)}
    </div>
  );
}

function RulerLabel({ frac, children, className }: { frac: number; children: ReactNode; className?: string }) {
  // Edge labels align inward so they never overhang the instrument.
  const align = frac < 0.04 ? "translate-x-0" : frac > 0.96 ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span className={cn("absolute top-0 whitespace-nowrap leading-4", align, className)} style={{ left: pct(frac) }}>
      {children}
    </span>
  );
}

/** A pointer caret sits exactly under the mark; the text runs inward from it. */
function MarkLabel({ frac, children }: { frac: number; children: ReactNode }) {
  const flip = frac > 0.7;
  const caret = <span className="inline-block size-0 shrink-0 border-x-[3px] border-b-[4px] border-x-transparent border-b-edge" />;
  return (
    <span
      className={cn("absolute top-0 flex items-center gap-1 whitespace-nowrap leading-4", flip && "flex-row-reverse")}
      style={{ left: pct(frac), transform: flip ? "translateX(calc(-100% + 3px))" : "translateX(-3px)" }}
    >
      {caret}
      {children}
    </span>
  );
}

interface ThumbProps {
  index: number;
  frac: MotionValue<number>;
  thumbRef: (el: HTMLDivElement | null) => void;
  label?: string;
  labelledBy?: string;
  value: number;
  valueText: string;
  min: number;
  max: number;
  disabled: boolean;
  dragging: boolean;
  reduced: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}

function Thumb({ index, frac, thumbRef, label, labelledBy, value, valueText, min, max, disabled, dragging, reduced, onKeyDown }: ThumbProps) {
  // A zero-width carriage riding along the track.
  const left = useTransform(frac, pct);
  return (
    <motion.div className="pointer-events-none absolute inset-y-0 w-0" style={{ left }}>
      <div
        ref={thumbRef}
        role="slider"
        data-thumb={index}
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-labelledby={label ? undefined : labelledBy}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "focus-ring pointer-events-auto absolute left-0 top-1/2 h-5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] outline-none",
          // ≥24 px hit area without changing the cap
          "before:absolute before:-inset-x-1.5 before:-inset-y-0.5 before:content-['']",
          "bg-thumb shadow-[0_0_0_0.5px_var(--dt-thumb-edge),0_1px_2px_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.14)]",
          disabled ? "cursor-not-allowed" : dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {/* engraved index line */}
        <span className={cn("absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2", dragging ? "bg-pencil" : "bg-edge/60 transition-colors duration-[240ms]")} />
        <AnimatePresence>
          {dragging && (
            <motion.span
              key="bubble"
              aria-hidden
              className="absolute bottom-full left-1/2 mb-2 flex h-5 -translate-x-1/2 items-center whitespace-nowrap rounded-xs bg-raised px-1.5 font-mono text-2xs tabular text-pencil-ink shadow-[0_0_0_1px_var(--dt-pencil-line),0_4px_10px_-4px_rgb(0_0_0/0.18)]"
              initial={{ opacity: 0, y: reduced ? 0 : 3 }}
              animate={{ opacity: 1, y: 0, transition: { opacity: reduced ? tween.fade : { duration: 0.09 }, y: reduced ? { duration: 0 } : spring.control } }}
              exit={{ opacity: 0, y: reduced ? 0 : 2, transition: { duration: 0.14, ease: ease.in } }}
            >
              {valueText}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
