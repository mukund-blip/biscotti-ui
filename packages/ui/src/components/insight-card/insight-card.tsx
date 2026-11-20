"use client";
import { animate, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { spring, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { Icon } from "../../icons";
import { VisuallyHidden } from "../../lib/primitives";
import { cn, useControllable } from "../../lib/utils";

/* ════════════════════════════════════════════════════════════════
 * Types
 * ════════════════════════════════════════════════════════════════ */

export interface InsightPoint {
  /** ISO date, "2026-03-14". One point per day, ascending. */
  date: string;
  value: number;
}

export interface InsightAnnotation {
  /** ISO date the event happened. */
  date: string;
  /** Short label, e.g. "Launch email". */
  label: string;
  /** One line of detail shown on hover/focus. */
  detail?: ReactNode;
}

export interface InsightContext {
  range: number;
  /** Aggregate for the current window. */
  total: number;
  /** Aggregate for the previous window (null if not enough data). */
  previous: number | null;
  /** Relative change, e.g. 0.124 (null if not computable). */
  delta: number | null;
}

export interface InsightCardProps {
  /** Metric name, e.g. "Pre-orders". */
  title: string;
  /** Daily series, ascending. Provide 2× the largest range to enable comparison. */
  data: InsightPoint[];
  /** Window lengths in days. Default [7, 30, 90]. */
  ranges?: number[];
  range?: number;
  defaultRange?: number;
  onRangeChange?: (range: number) => void;
  /** Show the previous period as a dashed line. */
  compare?: boolean;
  defaultCompare?: boolean;
  onCompareChange?: (compare: boolean) => void;
  /** How the headline summarises the window. Default "sum". */
  aggregate?: "sum" | "mean" | "last";
  /** Intl number format for values (headline, tooltip). Default plain integer. */
  format?: Intl.NumberFormatOptions;
  /** Locale for numbers and dates. Default "en-GB" (stable across server and client). */
  locale?: string;
  /** Which direction is good — colours the delta badge. Default "up". */
  goodDirection?: "up" | "down";
  /** Sentence-level insight. A function receives the current window's figures. */
  insight?: ReactNode | ((ctx: InsightContext) => ReactNode);
  /** Provenance for the insight, e.g. "Scout, from Shopify orders". Rendered in serif italic. */
  source?: ReactNode;
  /** Events marked on the x-axis. Only those inside the window are drawn. */
  annotations?: InsightAnnotation[];
  /** Noun for summaries and the hidden table, e.g. "pre-orders". */
  unitLabel?: string;
  /** Plot height in px. Default 132. */
  chartHeight?: number;
  sound?: boolean;
  className?: string;
}

/* ════════════════════════════════════════════════════════════════
 * Geometry
 * ════════════════════════════════════════════════════════════════ */

type Pt = [number, number];

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function yScale(max: number) {
  const step = niceStep((max || 1) / 3);
  const top = Math.max(step, Math.ceil((max * 1.04) / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 1e-6; v += step) ticks.push(Number(v.toPrecision(12)));
  return { top, ticks };
}

function sampleAt(pts: Pt[], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (x <= x1 + 1e-9) {
      const [x0, y0] = pts[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

/** Resample both polylines at the union of their vertices: exact shapes at both ends of a morph. */
function unionResample(a: Pt[], b: Pt[]): [Pt[], Pt[]] {
  const xs = [...new Set([...a, ...b].map((p) => Math.round(p[0] * 100) / 100))].sort((p, q) => p - q);
  return [xs.map((x) => [x, sampleAt(a, x)] as Pt), xs.map((x) => [x, sampleAt(b, x)] as Pt)];
}

const lerpPts = (a: Pt[], b: Pt[], p: number): Pt[] => a.map(([x, y], i) => [x + (b[i][0] - x) * p, y + (b[i][1] - y) * p]);
const toLine = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("");
const toArea = (pts: Pt[], base: number) =>
  pts.length ? `${toLine(pts)}L${pts[pts.length - 1][0].toFixed(2)} ${base}L${pts[0][0].toFixed(2)} ${base}Z` : "";

const parseDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

/* ════════════════════════════════════════════════════════════════
 * Rolling digits
 * ════════════════════════════════════════════════════════════════ */

export interface InsightNumberProps {
  /** The formatted string to show, e.g. "1,284" or "$12.9K". */
  value: string;
  className?: string;
}

/**
 * Each digit is a column 0–9 that rolls to its new value; columns are aligned
 * from the right so units stay units. Visual only — pair it with real text.
 */
export function InsightNumber({ value, className }: InsightNumberProps) {
  const m = useMotionTokens();
  const chars = [...value];
  return (
    <span aria-hidden className={cn("inline-flex tabular leading-none", className)}>
      {chars.map((c, i) => {
        const fromRight = chars.length - 1 - i;
        const d = c.charCodeAt(0) - 48;
        if (d < 0 || d > 9)
          return (
            <span key={`r${fromRight}-${c}`} className="inline-block h-[1em]">
              {c}
            </span>
          );
        return (
          <span
            key={`r${fromRight}`}
            className="relative inline-block h-[1em] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
          >
            <span className="invisible">0</span>
            <motion.span
              className="absolute top-0 left-0 flex flex-col"
              initial={false}
              animate={{ y: `${-d}em` }}
              transition={m.move(spring.control)}
            >
              {"0123456789".split("").map((n) => (
                <span key={n} className="block h-[1em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════
 * InsightCard
 * ════════════════════════════════════════════════════════════════ */

const PAD_X = 6;
/** Left gutter for y tick labels, so labels never sit on the data. */
const GUTTER = 44;
const TOP = 10;

export function InsightCard({
  title,
  data,
  ranges = [7, 30, 90],
  range: rangeProp,
  defaultRange = 30,
  onRangeChange,
  compare: compareProp,
  defaultCompare = false,
  onCompareChange,
  aggregate = "sum",
  format,
  locale = "en-GB",
  goodDirection = "up",
  insight,
  source,
  annotations = [],
  unitLabel,
  chartHeight = 132,
  sound: soundOn = true,
  className,
}: InsightCardProps) {
  const m = useMotionTokens();
  const play = usePlay(soundOn);
  const uid = useId();
  const [range, setRange] = useControllable(rangeProp, defaultRange, onRangeChange);
  const [compare, setCompare] = useControllable(compareProp, defaultCompare, onCompareChange);
  const [hover, setHover] = useState<number | null>(null);
  const [annotFocus, setAnnotFocus] = useState<number | null>(null);

  /* formatters */
  const nf = useMemo(() => new Intl.NumberFormat(locale, format ?? { maximumFractionDigits: 0 }), [locale, format]);
  const axisNf = useMemo(
    () => new Intl.NumberFormat(locale, { ...(format ?? {}), notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 0 }),
    [locale, format],
  );
  const pctNf = useMemo(() => new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 1, minimumFractionDigits: 1 }), [locale]);
  const dayNf = useMemo(() => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  const longDayNf = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }), [locale]);
  // Past ±999% a percentage stops meaning anything; say it as a multiple.
  const fmtDelta = (d: number) => (Math.abs(d) >= 10 ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(1 + d)}×` : pctNf.format(d));
  const fmtDay = (iso: string) => dayNf.format(parseDay(iso));
  const fmtLongDay = (iso: string) => longDayNf.format(parseDay(iso));

  /* windows */
  const n = Math.min(range, data.length);
  const cur = data.slice(data.length - n);
  const prevRaw = data.length >= n * 2 ? data.slice(data.length - n * 2, data.length - n) : null;
  const agg = (pts: InsightPoint[]) =>
    aggregate === "last" ? (pts.at(-1)?.value ?? 0) : aggregate === "mean" ? pts.reduce((s, p) => s + p.value, 0) / Math.max(1, pts.length) : pts.reduce((s, p) => s + p.value, 0);
  const total = agg(cur);
  const previous = prevRaw ? agg(prevRaw) : null;
  const delta = previous ? (total - previous) / previous : null;
  const ctx: InsightContext = { range, total, previous, delta };
  const rangeLabel = `last ${range} days`;

  /* measure */
  const plotRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(480);
  // Until the first measurement (server HTML, pre-hydration) W is a guess; the plot and marker row
  // are clipped horizontally so that guess can't widen narrow pages.
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    setW(el.clientWidth || 480);
    setMeasured(true);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* geometry */
  const H = chartHeight;
  const base = H - 1;
  const showPrev = compare && !!prevRaw;
  const scale = useMemo(() => {
    const vals = cur.map((p) => p.value);
    if (showPrev && prevRaw) vals.push(...prevRaw.map((p) => p.value));
    return yScale(Math.max(0, ...vals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, n, showPrev]);
  const xAt = (i: number) => GUTTER + (n <= 1 ? 0 : (i / (n - 1)) * (W - GUTTER - PAD_X));
  const yAt = (v: number) => TOP + (1 - v / scale.top) * (base - TOP);
  const target = useMemo(() => {
    const main = cur.map((p, i) => [xAt(i), yAt(p.value)] as Pt);
    // When there's no previous data, the comparison line rests on the baseline.
    const prev = (prevRaw ?? cur).map((p, i) => [xAt(i), prevRaw ? yAt(p.value) : base] as Pt);
    return { main, prev, W };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, n, scale.top, W]);

  /* morph — drawn imperatively so hover re-renders never interrupt it */
  const lineRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const prevRef = useRef<SVGPathElement>(null);
  const endRef = useRef<SVGCircleElement>(null);
  const shown = useRef<{ main: Pt[]; prev: Pt[]; W: number } | null>(null);
  const [initialPaths] = useState(() => ({ line: toLine(target.main), area: toArea(target.main, base), prev: toLine(target.prev), end: target.main.at(-1) ?? ([0, 0] as Pt) }));

  useLayoutEffect(() => {
    const write = (main: Pt[], prev: Pt[]) => {
      lineRef.current?.setAttribute("d", toLine(main));
      areaRef.current?.setAttribute("d", toArea(main, base));
      prevRef.current?.setAttribute("d", toLine(prev));
      const e = main.at(-1);
      if (e && endRef.current) {
        endRef.current.setAttribute("cx", e[0].toFixed(2));
        endRef.current.setAttribute("cy", e[1].toFixed(2));
      }
      shown.current = { main, prev, W: target.W };
    };
    const from = shown.current;
    if (!from || from.W !== target.W || m.reduced || !from.main.length || !target.main.length) {
      write(target.main, target.prev);
      if (from && m.reduced && lineRef.current?.parentElement) {
        // Reduced motion: no travel — a short opacity cue instead.
        lineRef.current.parentElement.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 120, easing: "linear" });
      }
      return;
    }
    const [a, b] = unionResample(from.main, target.main);
    const [pa, pb] = unionResample(from.prev, target.prev);
    const ctrl = animate(0, 1, {
      ...spring.layout,
      onUpdate: (p) => write(lerpPts(a, b, p), lerpPts(pa, pb, p)),
      onComplete: () => write(target.main, target.prev),
    });
    return () => ctrl.stop();
  }, [target, base, m.reduced]);

  /* annotations inside the window */
  const marks = useMemo(() => {
    const idx = new Map(cur.map((p, i) => [p.date, i]));
    return annotations.flatMap((a) => {
      const i = idx.get(a.date);
      return i == null ? [] : [{ ...a, i }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, data, n]);

  /* active point (pointer, keyboard or annotation) */
  const activeIdx = annotFocus != null ? (marks[annotFocus]?.i ?? null) : hover;
  const active = activeIdx != null && activeIdx < cur.length ? cur[activeIdx] : null;
  const activePrev = activeIdx != null && prevRaw ? prevRaw[activeIdx] : null;
  const activeMark = activeIdx != null ? marks.find((mk) => mk.i === activeIdx) : undefined;
  const headline = active ? active.value : total;
  const headDelta = active ? (activePrev && activePrev.value ? (active.value - activePrev.value) / activePrev.value : null) : delta;

  // Clear hover state when the window changes under it.
  useEffect(() => {
    setHover((h) => (h != null && h >= n ? n - 1 : h));
    setAnnotFocus(null);
  }, [n]);

  const indexFromX = (clientX: number) => {
    const r = plotRef.current!.getBoundingClientRect();
    const f = (clientX - r.left - GUTTER) / Math.max(1, r.width - GUTTER - PAD_X);
    return Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))));
  };

  /* summary */
  const unit = unitLabel ?? title.toLowerCase();
  const peak = cur.reduce((a, p) => (p.value > a.value ? p : a), cur[0] ?? { date: "", value: 0 });
  const low = cur.reduce((a, p) => (p.value < a.value ? p : a), cur[0] ?? { date: "", value: 0 });
  const summary =
    `${title}, ${rangeLabel}: ${nf.format(total)}` +
    (delta != null ? `, ${fmtDelta(delta)} versus the previous ${range} days` : "") +
    (cur.length ? `. Peak ${nf.format(peak.value)} on ${fmtDay(peak.date)}; low ${nf.format(low.value)} on ${fmtDay(low.date)}.` : ".") +
    " Use left and right arrow keys to read each day.";

  const good = headDelta == null || Math.abs(headDelta) < 0.0005 ? null : (headDelta > 0) === (goodDirection === "up");
  const tableId = `${uid}-table`;

  // Tooltip placement: flip to the left of the crosshair near the right edge.
  const ax = activeIdx != null ? xAt(activeIdx) : 0;
  const tipLeft = ax > W - 150;

  return (
    <article className={cn("w-full rounded-lg bg-raised p-4 text-ink shadow-2", className)} aria-labelledby={`${uid}-title`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <h3 id={`${uid}-title`} className="flex min-w-0 items-baseline gap-1.5 pt-1 text-sm">
          <span className="font-medium text-ink">{title}</span>
          <span aria-hidden className="text-muted">·</span>
          <span className="truncate text-muted">{active ? `on ${fmtLongDay(active.date)}` : rangeLabel}</span>
        </h3>
        <RangeControl ranges={ranges} value={range} label={`${title} range`} onChange={(r) => {
          if (r === range) return;
          setRange(r);
          setHover(null);
          play("select", { velocity: 0.5 });
        }} />
      </div>

      {/* Headline */}
      <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className="text-2xl font-medium tracking-[-0.02em] text-ink">
          <InsightNumber value={nf.format(headline)} />
          <VisuallyHidden>{`${nf.format(total)} ${rangeLabel}`}</VisuallyHidden>
        </span>
        <span className="flex h-6 items-center gap-1.5 pb-0.5">
          {headDelta != null && (
            <span
              className={cn(
                "inline-flex h-5 items-center gap-0.5 rounded-xs pr-1.5 pl-1 font-mono text-2xs tabular",
                good == null ? "bg-sunken text-muted" : good ? "bg-ok-soft text-ok" : "bg-err-soft text-err",
              )}
            >
              <Icon name={headDelta >= 0 ? "arrowUp" : "arrowDown"} size={12} strokeWidth={1.75} />
              {fmtDelta(headDelta)}
            </span>
          )}
          <span className="text-xs text-muted">
            {active
              ? activePrev
                ? `vs ${nf.format(activePrev.value)} on ${fmtDay(activePrev.date)}`
                : ""
              : previous != null
                ? `vs previous ${range} days`
                : ""}
          </span>
        </span>
      </div>

      {/* Insight */}
      {insight != null && (
        <p className="mt-2 text-sm text-ink-2">
          {typeof insight === "function" ? insight(ctx) : insight}
          {source && <span className="ml-1.5 inline-block font-serif text-sm text-muted italic">— {source}</span>}
        </p>
      )}

      {/* Chart */}
      <div className={cn("relative mt-4", !measured && "overflow-x-clip")}>
        {/* y tick labels sit just above their gridlines */}
        <div
          ref={plotRef}
          role="group"
          tabIndex={0}
          aria-roledescription="chart"
          aria-label={summary}
          aria-describedby={tableId}
          onPointerMove={(e) => {
            if (e.pointerType === "touch" && e.buttons === 0) return;
            setAnnotFocus(null);
            setHover(indexFromX(e.clientX));
          }}
          onPointerDown={(e) => {
            setAnnotFocus(null);
            setHover(indexFromX(e.clientX));
          }}
          onPointerLeave={() => setHover(null)}
          onFocus={(e) => {
            if (e.target === e.currentTarget && hover == null) setHover(n - 1);
          }}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 7 : 1;
            let next = hover ?? n - 1;
            if (e.key === "ArrowRight") next = Math.min(n - 1, next + step);
            else if (e.key === "ArrowLeft") next = Math.max(0, next - step);
            else if (e.key === "Home") next = 0;
            else if (e.key === "End") next = n - 1;
            else if (e.key === "Escape") return void setHover(null);
            else return;
            e.preventDefault();
            setAnnotFocus(null);
            setHover(next);
          }}
          className="focus-ring relative cursor-crosshair touch-pan-y rounded-xs"
          style={{ height: H }}
        >
          <svg width={W} height={H} className="absolute inset-0 block overflow-visible" aria-hidden>
            <motion.g key={scale.top} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={m.fade()}>
              {scale.ticks.map((t) => (
                <line key={t} x1={GUTTER - 6} x2={W} y1={Math.round(yAt(t)) + 0.5} y2={Math.round(yAt(t)) + 0.5} stroke={t === 0 ? "var(--dt-rule)" : "var(--dt-hairline)"} strokeWidth={1} />
              ))}
            </motion.g>
            {/* annotation guides */}
            {marks.map((mk) => (
              <line
                key={mk.date}
                x1={Math.round(xAt(mk.i)) + 0.5}
                x2={Math.round(xAt(mk.i)) + 0.5}
                y1={TOP}
                y2={base}
                stroke="var(--dt-rule)"
                strokeWidth={1}
                opacity={activeMark?.date === mk.date ? 1 : 0.7}
              />
            ))}
            <g>
              <path ref={areaRef} d={initialPaths.area} fill="var(--dt-ink)" fillOpacity={0.055} />
              <path
                ref={prevRef}
                d={initialPaths.prev}
                fill="none"
                stroke="var(--dt-edge)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: showPrev ? 1 : 0, transition: "opacity 140ms ease-out" }}
              />
              <path ref={lineRef} d={initialPaths.line} fill="none" stroke="var(--dt-ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <circle
                ref={endRef}
                cx={initialPaths.end[0]}
                cy={initialPaths.end[1]}
                r={4}
                fill="var(--dt-ink)"
                stroke="var(--dt-raised)"
                strokeWidth={2}
                style={{ opacity: active ? 0 : 1, transition: "opacity 90ms ease-out" }}
              />
            </g>
            {/* crosshair: the one live mark */}
            {active && activeIdx != null && (
              <g>
                <line x1={Math.round(ax) + 0.5} x2={Math.round(ax) + 0.5} y1={0} y2={base} stroke="var(--dt-pencil)" strokeWidth={1} />
                {showPrev && activePrev && <circle cx={ax} cy={yAt(activePrev.value)} r={3.5} fill="var(--dt-raised)" stroke="var(--dt-edge)" strokeWidth={1.5} />}
                <circle cx={ax} cy={yAt(active.value)} r={4} fill="var(--dt-pencil)" stroke="var(--dt-raised)" strokeWidth={2} />
              </g>
            )}
          </svg>
          {/* y labels (HTML for crisp text) */}
          {scale.ticks.map((t) => (
            <span
              key={`${scale.top}-${t}`}
              aria-hidden
              className="pointer-events-none absolute left-0 text-right font-mono text-2xs leading-none tabular text-muted"
              style={{ top: Math.round(yAt(t)) - 5, width: GUTTER - 10 }}
            >
              {axisNf.format(t)}
            </span>
          ))}
          {/* tooltip */}
          {active && activeIdx != null && (
            <div
              aria-hidden
              className={cn("pointer-events-none absolute top-0 z-10 min-w-[112px] rounded-md bg-raised px-2.5 py-2 shadow-2", tipLeft ? "-translate-x-full" : "")}
              style={{ left: tipLeft ? ax - 10 : ax + 10 }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-sm font-medium tabular text-ink">{nf.format(active.value)}</span>
                <span className="text-2xs whitespace-nowrap text-muted">{fmtDay(active.date)}</span>
              </div>
              {showPrev && activePrev && (
                <div className="mt-1 flex items-center gap-1.5">
                  <svg width="12" height="2" aria-hidden className="shrink-0">
                    <line x1="0" x2="12" y1="1" y2="1" stroke="var(--dt-edge)" strokeWidth="1.5" strokeDasharray="3 2" />
                  </svg>
                  <span className="font-mono text-2xs tabular text-ink-2">{nf.format(activePrev.value)}</span>
                  <span className="text-2xs whitespace-nowrap text-muted">{fmtDay(activePrev.date)}</span>
                </div>
              )}
              {activeMark && (
                <div className="mt-1.5 border-t border-hairline pt-1.5 text-2xs">
                  <div className="font-medium text-ink">{activeMark.label}</div>
                  {activeMark.detail && <div className="mt-0.5 max-w-[200px] text-muted">{activeMark.detail}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* x axis: annotations + endpoints */}
        <div className="relative mt-0.5 h-5">
          {marks.map((mk, k) => (
            <button
              key={mk.date}
              type="button"
              aria-label={`${mk.label}, ${fmtDay(mk.date)}`}
              aria-describedby={annotFocus === k ? `${uid}-annot` : undefined}
              onPointerEnter={() => setAnnotFocus(k)}
              onPointerLeave={() => setAnnotFocus(null)}
              onFocus={() => setAnnotFocus(k)}
              onBlur={() => setAnnotFocus(null)}
              className="focus-ring group/mk absolute top-0 flex size-6 -translate-x-1/2 -translate-y-[7px] items-center justify-center rounded-xs"
              style={{ left: xAt(mk.i) }}
            >
              <span
                aria-hidden
                className={cn(
                  "size-[7px] rotate-45 rounded-[1px] shadow-[0_0_0_2px_var(--dt-raised)]",
                  annotFocus === k ? "bg-pencil" : "bg-ink-2 group-hover/mk:bg-ink",
                )}
              />
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between font-mono text-2xs tabular text-muted" style={{ paddingLeft: GUTTER - 2 }} aria-hidden>
          <span>{cur[0] ? fmtDay(cur[0].date) : ""}</span>
          <span>{cur.at(-1) ? fmtDay(cur.at(-1)!.date) : ""}</span>
        </div>
      </div>

      {/* Footer: comparison toggle doubles as the legend */}
      <div className="mt-3 flex min-h-6 items-center justify-between gap-3 border-t border-hairline pt-2.5">
        <button
          type="button"
          aria-pressed={compare}
          disabled={!prevRaw}
          onClick={() => {
            setCompare(!compare);
            play("select", { velocity: 0.4 });
          }}
          className="focus-ring -ml-1 flex h-6 items-center gap-2 rounded-sm px-1 text-xs text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span
            aria-hidden
            className={cn(
              "flex size-3.5 items-center justify-center rounded-[3px] transition-colors duration-[90ms]",
              compare ? "bg-ink text-on-ink" : "shadow-[inset_0_0_0_1px_var(--dt-edge)]",
            )}
          >
            {compare && <Icon name="check" size={12} strokeWidth={2} />}
          </span>
          <svg width="14" height="2" aria-hidden className="shrink-0">
            <line x1="0" x2="14" y1="1" y2="1" stroke="var(--dt-edge)" strokeWidth="1.5" strokeDasharray="3 2" />
          </svg>
          <span className={compare ? "text-ink-2" : undefined}>Previous {range} days</span>
        </button>
        <span className={cn("flex items-center gap-2 text-xs text-ink-2 transition-opacity duration-[120ms]", showPrev ? "opacity-100" : "opacity-0")} aria-hidden={!showPrev}>
          <svg width="14" height="2" aria-hidden className="shrink-0">
            <line x1="0" x2="14" y1="1" y2="1" stroke="var(--dt-ink)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Last {range} days
        </span>
      </div>

      {/* Announcements for keyboard reading */}
      <VisuallyHidden>
        <span role="status" aria-live="polite">
          {active ? `${fmtDay(active.date)}: ${nf.format(active.value)} ${unit}${activeMark ? `. ${activeMark.label}` : ""}` : ""}
        </span>
        {annotFocus != null && marks[annotFocus] && (
          <span id={`${uid}-annot`}>{marks[annotFocus].detail}</span>
        )}
        <table id={tableId}>
          <caption>{`${title}, ${rangeLabel}`}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">{title}</th>
              {prevRaw && <th scope="col">Previous period</th>}
            </tr>
          </thead>
          <tbody>
            {cur.map((p, i) => (
              <tr key={p.date}>
                <th scope="row">{fmtDay(p.date)}</th>
                <td>{nf.format(p.value)}</td>
                {prevRaw && <td>{nf.format(prevRaw[i].value)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </article>
  );
}

/* ════════════════════════════════════════════════════════════════
 * Range control — tiny radiogroup with a gliding indicator
 * ════════════════════════════════════════════════════════════════ */

function RangeControl({ ranges, value, label, onChange }: { ranges: number[]; value: number; label: string; onChange: (r: number) => void }) {
  const m = useMotionTokens();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = Math.max(0, ranges.indexOf(value));
  const go = (i: number) => {
    const j = (i + ranges.length) % ranges.length;
    onChange(ranges[j]);
    refs.current[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="relative grid h-7 shrink-0 rounded-sm bg-sunken p-0.5" style={{ gridTemplateColumns: `repeat(${ranges.length}, 36px)` }}>
      <motion.span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 w-9 rounded-[3px] bg-raised shadow-1"
        initial={false}
        animate={{ x: idx * 36 }}
        transition={m.move(spring.glide)}
      />
      {ranges.map((r, i) => (
        <button
          key={r}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === idx}
          aria-label={`Last ${r} days`}
          tabIndex={i === idx ? 0 : -1}
          onClick={() => onChange(r)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") (e.preventDefault(), go(i + 1));
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") (e.preventDefault(), go(i - 1));
          }}
          className={cn("focus-ring relative z-[1] rounded-[3px] font-mono text-2xs tabular transition-colors duration-[90ms] hover:duration-0", i === idx ? "text-ink" : "text-muted hover:text-ink")}
        >
          {r}D
        </button>
      ))}
    </div>
  );
}
