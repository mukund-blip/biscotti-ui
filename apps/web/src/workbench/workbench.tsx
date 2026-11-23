"use client";

/**
 * Ostra Ops — the integrated demo. Every panel is a Biscotti UI component and they drive each other:
 * the palette filters the table, Scout's approval spawns an activity task, bulk actions are undoable.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityStack,
  CommandPaletteDialog,
  FilterBuilder,
  Icon,
  InsightCard,
  Kbd,
  Toaster,
  filterBuilderMatches,
  toast,
  useSoundPrefs,
  type ActivityTask,
  type CommandGroupDef,
  type CommandSource,
  type FilterBuilderCondition,
  type FilterBuilderField,
  type MentionItem,
} from "@biscotti/ui";
import { DataTable, type DataTableColumn, type DataTableSort } from "@biscotti/ui/components/data-table/data-table";
import { formatOrderTime, orderClock, orderMoney, orderStatuses, orderStatusTone, ostraOrders, type OrderStatus, type OstraOrder } from "@/demos/orders-data";
import { ostraAnnotations, preorderInsight, preorderSeries } from "@/demos/insight-card-demo";
import { scoutQuestion } from "@/demos/streaming-response-data";
import { ScoutThread, type ScoutHandle } from "./scout-thread";

/* ── Orders ─────────────────────────────────────────────────────────── */

const countries = [...new Set(ostraOrders.map((o) => o.country))].sort().map((value) => ({ value }));
const fields: readonly FilterBuilderField<OstraOrder>[] = [
  { id: "status", label: "Status", type: "enum", accessor: (r) => r.status, options: orderStatuses.map((value) => ({ value })) },
  { id: "units", label: "Units", type: "number", accessor: (r) => r.units },
  { id: "country", label: "Country", type: "enum", accessor: (r) => r.country, options: countries },
  { id: "retailer", label: "Retailer", type: "text", accessor: (r) => r.retailer },
  { id: "updated", label: "Updated", type: "date", accessor: (r) => r.updated },
];
const getOrderId = (r: OstraOrder) => r.id;
const getOrderLabel = (r: OstraOrder) => `${r.id}, ${r.retailer}`;
const statusFilter = (status: OrderStatus): FilterBuilderCondition[] => [{ id: `status-${status}`, field: "status", operator: "is", value: status }];

/* ── Agent activity (a tiny simulation so pause / cancel / retry really work) ── */

type SimTask = ActivityTask & { workMs: number; failAt?: number; failedOnce?: boolean };
const initialTasks: SimTask[] = [
  { id: "pay", title: "Reconciling pre-order payments", doneTitle: "Reconciled pre-order payments", status: "running", progress: 0.18, elapsedMs: 1200, meta: "412 orders", workMs: 16000 },
  { id: "stock", title: "Syncing retailer stock levels", doneTitle: "Synced retailer stock levels", status: "running", progress: 0.05, elapsedMs: 400, meta: "12 retailers", workMs: 11000, failAt: 0.62 },
  { id: "notes", title: "Drafting firmware 2.4 release notes", doneTitle: "Drafted firmware 2.4 release notes", status: "queued", meta: "firmware/CHANGELOG.md", workMs: 9000 },
  { id: "cl", title: "Indexing the beta forum", doneTitle: "Indexed the beta forum", status: "completed", progress: 1, elapsedMs: 8300, meta: "1,140 posts", workMs: 0 },
  { id: "ex", title: "Exporting March invoices", doneTitle: "Exported March invoices", status: "completed", progress: 1, elapsedMs: 3400, meta: "38 retailers", workMs: 0 },
];
const SLOTS = 2;
const TICK = 250;

function useAgentActivity() {
  const [tasks, setTasks] = useState<SimTask[]>(initialTasks);
  useEffect(() => {
    const id = window.setInterval(() => {
      setTasks((ts) => {
        let running = ts.filter((t) => t.status === "running").length;
        return ts.map((t) => {
          if (t.status === "queued" && running < SLOTS) {
            running++;
            return { ...t, status: "running", progress: 0, elapsedMs: 0 };
          }
          if (t.status !== "running") return t;
          const progress = Math.min(1, (t.progress ?? 0) + TICK / t.workMs);
          const elapsedMs = (t.elapsedMs ?? 0) + TICK;
          if (t.failAt && !t.failedOnce && progress >= t.failAt) {
            running--;
            return { ...t, progress, elapsedMs, status: "failed", failedOnce: true, error: "Patch Point’s API timed out after 30 s." };
          }
          if (progress >= 1) {
            running--;
            return { ...t, progress: 1, elapsedMs, status: "completed" };
          }
          return { ...t, progress, elapsedMs };
        });
      });
    }, TICK);
    return () => window.clearInterval(id);
  }, []);

  const set = useCallback((id: string, patch: (t: SimTask) => Partial<SimTask>) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch(t) } : t))), []);
  const actions = useMemo(() => ({
    onPause: (id: string) => set(id, () => ({ status: "paused" })),
    onResume: (id: string) => set(id, () => ({ status: "queued" })),
    onCancel: (id: string) => set(id, () => ({ status: "cancelled" })),
    onRetry: (id: string) => set(id, () => ({ status: "queued", progress: 0, error: undefined })),
  }), [set]);
  const add = useCallback((task: SimTask) => setTasks((ts) => [task, ...ts.filter((t) => t.id !== task.id)]), []);
  return { tasks, actions, add };
}

/* ── Layout helpers ─────────────────────────────────────────────────── */

function Panel({ id, label, meta, children, className }: { id: string; label: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} tabIndex={-1} className={`scroll-mt-20 outline-none ${className ?? ""}`}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <h2 id={`${id}-h`} className="font-mono text-2xs uppercase tracking-[0.08em] text-muted">{label}</h2>
        {meta && <div className="font-mono text-2xs text-muted">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

const jump = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
};

const mentions: MentionItem[] = [
  { id: "ines", type: "person", label: "Ines Duarte", detail: "Firmware" },
  { id: "theo", type: "person", label: "Theo Okafor", detail: "Hardware" },
  { id: "jun", type: "person", label: "Jun Park", detail: "Ops" },
  { id: "bom", type: "file", label: "os-1-bom.csv", detail: "ops/" },
  { id: "plan", type: "file", label: "production-plan-q1.md", detail: "ops/" },
  { id: "digikey", type: "tool", label: "Digi-Key", detail: "Supplier API" },
];

/* ── Workbench ──────────────────────────────────────────────────────── */

export function Workbench() {
  const [rows, setRows] = useState<readonly OstraOrder[]>(ostraOrders);
  const [now, setNow] = useState(orderClock);
  const [conditions, setConditions] = useState<readonly FilterBuilderCondition[]>([]);
  const [sort, setSort] = useState<DataTableSort>(null);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const activity = useAgentActivity();
  const scout = useRef<ScoutHandle>(null);
  const soundPrefs = useSoundPrefs();

  const visible = useMemo(() => rows.filter((r) => filterBuilderMatches(r, fields, conditions, now)), [rows, conditions, now]);
  const columns = useMemo<readonly DataTableColumn<OstraOrder>[]>(() => [
    { id: "id", label: "Order", accessor: (r) => r.id, muted: true, mono: true, className: "w-[14%]" },
    { id: "retailer", label: "Retailer", accessor: (r) => r.retailer, className: "w-[30%]" },
    { id: "country", label: "Ctry", accessor: (r) => r.country, mono: true, muted: true, className: "w-[9%]" },
    { id: "units", label: "Units", accessor: (r) => r.units, numeric: true, className: "w-[10%]" },
    { id: "value", label: "Value", accessor: (r) => r.value, numeric: true, format: (n) => orderMoney.format(Number(n)), className: "w-[13%]" },
    { id: "status", label: "Status", accessor: (r) => r.status, statusTone: (r) => orderStatusTone[r.status], className: "w-[16%]" },
    { id: "updated", label: "Updated", accessor: (r) => r.updated, format: (n) => formatOrderTime(Number(n), now), mono: true, muted: true, className: "w-[11%]" },
  ], [now]);

  const markShipped = useCallback((targets: readonly OstraOrder[]) => {
    const ids = new Set(targets.filter((r) => r.status !== "Shipped").map((r) => r.id));
    if (!ids.size) {
      toast.info("Already shipped", { description: "Every selected order is marked shipped." });
      return;
    }
    const before = rows;
    const at = now + 60_000;
    setNow(at);
    setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, status: "Shipped", updated: at } : r)));
    setSelection([]);
    toast.success(`${ids.size} ${ids.size === 1 ? "order" : "orders"} marked shipped`, {
      description: "Retailers get tracking links when the countdown ends.",
      undo: { onUndo: () => setRows(before), doneTitle: "Shipping reverted" },
    });
  }, [rows, now]);

  const filterTo = useCallback((next: FilterBuilderCondition[]) => {
    setConditions(next);
    jump("orders");
  }, []);

  /* ── Command palette ── */
  const groups = useMemo<CommandGroupDef[]>(() => {
    const selected = rows.filter((r) => selection.includes(r.id));
    return [
      {
        id: "suggested",
        label: "Suggestions",
        items: [
          { id: "ask", title: "Ask Scout about the encoder shortage", icon: "sparkle", keywords: ["supplier", "pec11r", "ai"], onSelect: () => scout.current?.ask(scoutQuestion) },
          { id: "awaiting", title: "Show orders awaiting stock", icon: "filter", keywords: ["filter", "blocked", "backorder"], onSelect: () => filterTo(statusFilter("Awaiting stock")) },
        ],
      },
      {
        id: "go",
        label: "Navigation",
        items: [
          { id: "go-orders", title: "Orders", subtitle: "Retailer orders", icon: "database", keywords: ["table"], onSelect: () => jump("orders") },
          { id: "go-preorders", title: "Pre-orders", subtitle: "Last 30 days", icon: "chart", keywords: ["insight", "kpi"], onSelect: () => jump("preorders") },
          { id: "go-scout", title: "Scout", subtitle: "Agent thread", icon: "sparkle", keywords: ["ai", "agent", "chat"], onSelect: () => scout.current?.focus() },
          { id: "go-activity", title: "Agent activity", icon: "activity", onSelect: () => jump("activity") },
        ],
      },
      {
        id: "actions",
        label: "Actions",
        items: [
          {
            id: "status",
            title: "Filter orders by status",
            icon: "layers",
            page: {
              id: "status",
              title: "Status",
              placeholder: "Pick a status…",
              groups: [{ id: "statuses", label: "Statuses", items: orderStatuses.map((s) => ({ id: s, title: s, icon: "circle" as const, onSelect: () => filterTo(statusFilter(s)) })) }],
            },
          },
          { id: "clear", title: "Clear order filters", icon: "x", disabled: conditions.length === 0, onSelect: () => setConditions([]) },
          {
            id: "ship",
            title: selected.length ? `Mark ${selected.length} selected ${selected.length === 1 ? "order" : "orders"} shipped` : "Mark selected orders shipped",
            subtitle: selected.length ? undefined : "Select rows first",
            icon: "check",
            disabled: selected.length === 0,
            onSelect: () => markShipped(selected),
          },
          {
            id: "retry",
            title: "Retry failed agent tasks",
            icon: "refresh",
            disabled: !activity.tasks.some((t) => t.status === "failed"),
            onSelect: () => activity.tasks.filter((t) => t.status === "failed").forEach((t) => activity.actions.onRetry(t.id)),
          },
          { id: "sound", title: soundPrefs.enabled ? "Turn sounds off" : "Turn sounds on", icon: "speaker", keywords: ["audio", "mute"], keepOpen: true, onSelect: () => soundPrefs.toggle() },
        ],
      },
    ];
  }, [rows, selection, conditions.length, activity.tasks, activity.actions, soundPrefs, markShipped, filterTo]);

  const sources = useMemo<CommandSource[]>(() => [{
    id: "orders",
    label: "Orders",
    loadingLabel: "Searching orders…",
    search: async (q, signal) => {
      await new Promise((r) => setTimeout(r, 260));
      if (signal.aborted) return [];
      const needle = q.toLowerCase();
      return rows
        .filter((r) => r.id.toLowerCase().includes(needle) || r.retailer.toLowerCase().includes(needle))
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          title: r.retailer,
          subtitle: `${r.id} · ${r.status}`,
          icon: "file" as const,
          onSelect: () => filterTo([{ id: `retailer-${r.id}`, field: "retailer", operator: "contains", value: r.retailer }]),
        }));
    },
  }], [rows, filterTo]);

  const counts = useMemo(() => {
    const awaiting = rows.filter((r) => r.status === "Awaiting stock");
    return { awaiting: awaiting.length, awaitingUnits: awaiting.reduce((n, r) => n + r.units, 0) };
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-8 md:px-8">
      {/* Masthead */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-hairline pb-6">
        <div className="min-w-0">
          <p className="font-mono text-2xs uppercase tracking-[0.08em] text-muted">Workbench · Ostra Ops</p>
          <h1 className="mt-2 text-[clamp(28px,3.6vw,40px)] font-semibold leading-[1.05] tracking-[-0.03em]">The encoder shortage</h1>
          <p className="mt-2 max-w-[640px] text-base leading-[22px] text-ink-2">
            {counts.awaiting} retailer orders ({counts.awaitingUnits} units) wait for PEC11R encoders. Ask Scout for a plan, approve the purchase order, then ship the orders that you can. Each panel is a Biscotti UI component. The panels update each other.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="focus-ring inline-flex h-9 items-center gap-2.5 rounded-sm bg-raised pl-3 pr-1.5 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-edge)] hover:bg-surface hover:text-ink"
        >
          <Icon name="command" size={14} />
          Commands
          <span className="flex gap-0.5"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
        </button>
      </header>

      <div className="grid items-start gap-x-6 gap-y-10 xl:grid-cols-[minmax(0,1fr)_472px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-10">
          <Panel id="preorders" label="Pre-orders" meta="OS-1 · Shopify">
            <InsightCard
              title="Pre-orders"
              data={preorderSeries}
              defaultRange={30}
              annotations={ostraAnnotations}
              insight={preorderInsight}
              source="Scout, from Shopify orders"
              unitLabel="pre-orders"
              chartHeight={120}
            />
          </Panel>

          <Panel id="orders" label="Retailer orders" meta={`${visible.length} of ${rows.length}`}>
            <div className="flex flex-col gap-3">
              <FilterBuilder fields={fields} value={conditions} onChange={setConditions} title="Filter orders" />
              <DataTable
                className="w-full"
                viewportClassName="max-h-[460px]"
                title="Wholesale"
                description="OS-1 · EUR"
                columns={columns}
                rows={visible}
                getRowId={getOrderId}
                getRowLabel={getOrderLabel}
                density="compact"
                sort={sort}
                onSortChange={setSort}
                selection={selection}
                onSelectionChange={setSelection}
                emptyMessage="No orders match"
                emptyDescription="Loosen a filter, or clear them from the command palette."
                bulkActions={[{ label: "Mark shipped", icon: "check", primary: true, onAction: markShipped }]}
              />
            </div>
          </Panel>
        </div>

        {/* Scout rail */}
        <aside className="flex min-w-0 flex-col gap-10 xl:sticky xl:top-20">
          <Panel id="activity" label="Agent activity">
            <ActivityStack tasks={activity.tasks} title="Scout is working on" capacity={SLOTS} {...activity.actions} />
          </Panel>
          <Panel id="scout" label="Ask Scout">
            <ScoutThread ref={scout} mentions={mentions} onApproved={(po) => {
              activity.add({ id: po.id, title: "Placing the Digi-Key order", doneTitle: "Placed the Digi-Key order", status: "queued", meta: `${po.units.toLocaleString("en")} × PEC11R`, workMs: 5200 });
              jump("activity");
            }} />
          </Panel>
        </aside>
      </div>

      <CommandPaletteDialog
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={groups}
        sources={sources}
        placeholder="Search commands and orders…"
      />
      <Toaster placement="bottom-left" />
    </div>
  );
}
