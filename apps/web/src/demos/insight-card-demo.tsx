"use client";
import { useMemo, useState } from "react";
import { InsightCard, type InsightAnnotation, type InsightContext, type InsightPoint } from "@detent/ui";
import { ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

/* ── Ostra OS-1 pre-order data: 180 days to 31 Mar 2026, deterministic ── */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const END = Date.UTC(2026, 2, 31);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const at = (d: string) => Date.parse(`${d}T00:00:00Z`);

const OPEN = at("2026-03-03");
const EMAIL = at("2026-03-12");
const PRICE = at("2026-03-24");

type Day = { date: string; orders: number; sessions: number; price: number };

const days: Day[] = (() => {
  const rnd = mulberry32(1290);
  const out: Day[] = [];
  for (let k = 179; k >= 0; k--) {
    const t = END - k * DAY;
    const dow = new Date(t).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.78 : 1;
    const noise = 0.82 + rnd() * 0.36;
    let base: number;
    if (t < OPEN) {
      // Early-bird list for beta testers: a slow trickle that grows.
      const g = (179 - k) / 179;
      base = 3 + g * 9 + (t >= at("2026-02-05") ? 4 : 0);
    } else if (t < EMAIL) base = 22 + (t - OPEN) / DAY;
    else if (t < PRICE) {
      const since = (t - EMAIL) / DAY;
      base = 72 + 150 * Math.exp(-since / 2.2);
    } else {
      const since = (t - PRICE) / DAY;
      base = 84 + 46 * Math.exp(-since / 2.5);
    }
    const orders = Math.max(0, Math.round(base * weekend * noise));
    const sessions = Math.round((t < OPEN ? 900 : t < EMAIL ? 1900 : 3600) * (0.85 + rnd() * 0.3) * (weekend === 1 ? 1 : 1.12));
    out.push({ date: iso(t), orders, sessions, price: t >= PRICE ? 1190 : 1290 });
  }
  return out;
})();

export const ostraAnnotations: InsightAnnotation[] = [
  { date: "2026-02-05", label: "Beta firmware 0.9", detail: "Shared with 40 beta testers; the early-bird list reopened." },
  { date: "2026-03-03", label: "Public pre-orders", detail: "OS-1 store page went live at €1,290." },
  { date: "2026-03-12", label: "Launch email", detail: "Sent to 18,400 subscribers · 41% opened." },
  { date: "2026-03-24", label: "Price drop", detail: "Early-bird price €1,290 → €1,190 until 30 Apr." },
];

type Metric = "orders" | "revenue" | "conversion";
const series: Record<Metric, InsightPoint[]> = {
  orders: days.map((d) => ({ date: d.date, value: d.orders })),
  revenue: days.map((d) => ({ date: d.date, value: d.orders * d.price })),
  conversion: days.map((d) => ({ date: d.date, value: d.orders / d.sessions })),
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const windowOf = (pts: InsightPoint[], range: number) => pts.slice(pts.length - range);

/** Insights computed from the data, so they stay true as the window changes. */
function insightFor(metric: Metric) {
  return function Insight({ range }: InsightContext) {
    const w = windowOf(series[metric === "revenue" ? "revenue" : "orders"], range);
    const emailIn = w.some((p) => p.date === "2026-03-12");
    if (metric === "conversion") {
      const before = mean(windowOf(series.conversion, 180).filter((p) => at(p.date) < EMAIL).slice(-7).map((p) => p.value));
      const after = mean(windowOf(series.conversion, range).filter((p) => at(p.date) >= PRICE).map((p) => p.value));
      return `Conversion rose from ${(before * 100).toFixed(1)}% to ${(after * 100).toFixed(1)}% once the price dropped on 24 Mar.`;
    }
    if (range <= 7) {
      const perDay = Math.round(mean(w.map((p) => p.value)));
      return metric === "revenue"
        ? `Holding at about €${Math.round(perDay / 1000)}K a day since the price drop.`
        : `Holding at about ${perDay} a day since the price drop on 24 Mar.`;
    }
    if (emailIn) {
      const before = mean(w.filter((p) => at(p.date) < EMAIL && at(p.date) >= OPEN).map((p) => p.value));
      const after = mean(w.filter((p) => at(p.date) >= EMAIL).map((p) => p.value));
      const x = after / before;
      return `Up ${x.toFixed(1)}× after the launch email on 12 Mar${metric === "revenue" ? ", despite the lower price" : ""}.`;
    }
    return "Steady growth from the beta-tester list.";
  };
}

export function InsightCardPreview() {
  return (
    <div className="w-full max-w-[460px]">
      <InsightCard
        title="Pre-orders"
        data={series.orders}
        annotations={ostraAnnotations}
        insight={insightFor("orders")}
        source="Scout, from Shopify orders"
        unitLabel="pre-orders"
        chartHeight={110}
      />
    </div>
  );
}

export function InsightCardDemo() {
  const [metric, setMetric] = useState<Metric>("orders");
  const [range, setRange] = useState(30);
  const [compare, setCompare] = useState(false);
  const cfg = useMemo(() => {
    switch (metric) {
      case "revenue":
        return {
          title: "Revenue",
          unitLabel: "euros",
          format: { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 } as Intl.NumberFormatOptions,
          aggregate: "sum" as const,
        };
      case "conversion":
        return {
          title: "Store conversion",
          unitLabel: "conversion",
          format: { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 } as Intl.NumberFormatOptions,
          aggregate: "mean" as const,
        };
      default:
        return { title: "Pre-orders", unitLabel: "pre-orders", format: undefined, aggregate: "sum" as const };
    }
  }, [metric]);
  const Insight = useMemo(() => insightFor(metric), [metric]);

  return (
    <DemoFrame
      stage={
        <Stage minH={460} className="px-6 py-10">
          <div className="w-full max-w-[520px]">
            <InsightCard
              title={cfg.title}
              data={series[metric]}
              format={cfg.format}
              aggregate={cfg.aggregate}
              unitLabel={cfg.unitLabel}
              range={range}
              onRangeChange={setRange}
              compare={compare}
              onCompareChange={setCompare}
              annotations={ostraAnnotations}
              insight={(ctx) => <Insight {...ctx} />}
              source="Scout, from Shopify orders"
            />
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment
            label="Metric"
            value={metric}
            options={[
              { value: "orders", label: "Pre-orders" },
              { value: "revenue", label: "Revenue" },
              { value: "conversion", label: "Conversion" },
            ]}
            onChange={setMetric}
          />
          <Readout label="range">{range}D</Readout>
          <Readout label="compare">{compare ? "on" : "off"}</Readout>
        </Controls>
      }
    />
  );
}

/** Shared with the workbench. */
export const preorderSeries = series.orders;
export const preorderInsight = insightFor("orders");
