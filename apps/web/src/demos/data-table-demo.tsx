"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, PrecisionToggle } from "@biscotti/ui";
import { DataTable, type DataTableColumn, type DataTableDensity, type DataTableSort } from "@biscotti/ui/components/data-table/data-table";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";
import { formatOrderTime, orderClock, orderMoney, orderNumber, orderStatuses, orderStatusTone, orderUnitPrice, ostraOrders, type OstraOrder } from "./orders-data";

const sampleStates = [
  { value: "orders", label: "Orders" },
  { value: "loading", label: "Loading" },
  { value: "empty", label: "Empty" },
  { value: "error", label: "Error" },
] as const;
const getOrderId = (row: OstraOrder) => row.id;
const getOrderLabel = (row: OstraOrder) => `${row.id}, ${row.retailer}`;

function exportOrders(rows: readonly OstraOrder[]) {
  const header = ["Order", "Retailer", "Country", "Units", "Value (EUR)", "Status", "Updated"];
  const csv = [
    header.join(","),
    ...rows.map(({ id, retailer, country, units, value, status, updated }) =>
      [id, retailer, country, units, value, status, new Date(updated).toISOString()].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")),
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "ostra-orders.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function DataTableDemo() {
  const [snapshot, setSnapshot] = useState({ rows: ostraOrders, now: orderClock });
  const [mode, setMode] = useState<(typeof sampleStates)[number]["value"]>("orders");
  const [density, setDensity] = useState<DataTableDensity>("comfortable");
  const [simulating, setSimulating] = useState(false);
  const [sort, setSort] = useState<DataTableSort>(null);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [opened, setOpened] = useState<OstraOrder>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activity, setActivity] = useState("—");
  const cursor = useRef(0);
  const detailTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!simulating || mode !== "orders") return;
    const timer = window.setInterval(() => {
      const index = cursor.current++ % ostraOrders.length;
      setSnapshot(({ rows, now }) => {
        const updated = now + 60_000;
        return {
          now: updated,
          rows: rows.map((row, i) => {
            if (i !== index) return row;
            const units = row.units + (row.units === ostraOrders[i].units ? 6 : -6);
            return {
              ...row, units, value: units * orderUnitPrice, updated,
              status: index === 0 && row.status === "In transit" ? "Shipped" : orderStatuses[(orderStatuses.indexOf(row.status) + 1) % orderStatuses.length],
            };
          }),
        };
      });
    }, 1_800);
    return () => window.clearInterval(timer);
  }, [simulating, mode]);

  const columns = useMemo<readonly DataTableColumn<OstraOrder>[]>(() => [
    { id: "id", label: "Order", accessor: (row) => row.id, muted: true, mono: true, className: "w-[12%]" },
    { id: "retailer", label: "Retailer", accessor: (row) => row.retailer, className: "w-[28%]" },
    { id: "country", label: "Country", accessor: (row) => row.country, mono: true, muted: true, className: "w-[10%]" },
    { id: "units", label: "Units", accessor: (row) => row.units, numeric: true, className: "w-[9%]" },
    { id: "value", label: "Value", accessor: (row) => row.value, numeric: true, format: (n) => orderMoney.format(Number(n)), className: "w-[13%]" },
    { id: "status", label: "Status", accessor: (row) => row.status, statusTone: (row) => orderStatusTone[row.status], className: "w-[16%]" },
    { id: "updated", label: "Updated", accessor: (row) => row.updated, format: (n) => formatOrderTime(Number(n), snapshot.now), mono: true, muted: true, className: "w-[12%]" },
  ], [snapshot.now]);

  const markShipped = (rows: readonly OstraOrder[]) => {
    const ids = new Set(rows.filter((row) => row.status !== "Shipped").map((row) => row.id));
    if (!ids.size) { setActivity("Already shipped"); return; }
    setSnapshot(({ rows, now }) => ({
      now, rows: rows.map((row) => ids.has(row.id) ? { ...row, status: "Shipped", updated: now } : row),
    }));
    setActivity(`${ids.size} marked shipped`);
  };

  return (
    <>
      <DemoFrame
        stage={
          <Stage tone="sunken" minH={0} className="px-3 py-7 sm:px-8 sm:py-10">
            <DataTable
              className="w-full max-w-5xl"
              viewportClassName="h-79"
              title="Retailer orders"
              description="OS-1 wholesale · EUR"
              columns={columns}
              rows={mode === "orders" ? snapshot.rows : []}
              getRowId={getOrderId}
              getRowLabel={getOrderLabel}
              density={density}
              loading={mode === "loading"}
              error={mode === "error" ? "Orders couldn’t be loaded" : undefined}
              onRetry={() => setMode("orders")}
              emptyMessage="No retailer orders"
              emptyDescription="New wholesale orders will appear here."
              sort={sort}
              onSortChange={setSort}
              selection={selection}
              onSelectionChange={setSelection}
              onRowOpen={(row) => {
                detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                setOpened(row);
                setDetailsOpen(true);
              }}
              toolbar={<PrecisionToggle size="sm" labelPosition="end" label={<span className="text-xs">Simulate updates</span>}
                sound={false} checked={simulating} onCheckedChange={setSimulating} />}
              bulkActions={[
                { label: "Mark shipped", icon: "check", primary: true, onAction: markShipped },
                { label: "Export", icon: "file", onAction: (rows) => { exportOrders(rows); setActivity(`Exported ${rows.length}`); } },
              ]}
            />
          </Stage>
        }
        controls={
          <Controls>
            <ControlSegment label="Density" value={density} options={[
              { value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" },
            ]} onChange={setDensity} />
            <ControlSegment label="State" value={mode} options={[...sampleStates]} onChange={setMode} />
            <ControlButton onClick={() => {
              setSnapshot({ rows: ostraOrders, now: orderClock });
              setMode("orders");
              setSort(null);
              setSelection([]);
              setSimulating(false);
              setActivity("—");
              cursor.current = 0;
            }}>Reset orders</ControlButton>
            <Readout label="Last action"><span role="status">{activity}</span></Readout>
          </Controls>
        }
      />
      <Dialog.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-[var(--dt-scrim)] transition-opacity duration-(--dt-dur-fade) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Popup
            finalFocus={detailTrigger}
            className="fixed left-1/2 top-1/2 z-50 w-88 max-w-[calc(100vw-2rem)] -translate-1/2 rounded-lg border border-hairline bg-raised p-5 text-ink shadow-3 transition-opacity duration-(--dt-dur-fade) data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
          >
            {opened && <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Dialog.Title className="text-lg font-semibold tracking-tight">{opened.retailer}</Dialog.Title>
                  <Dialog.Description className="tabular mt-0.5 font-mono text-xs text-muted">{opened.id} · {opened.country}</Dialog.Description>
                </div>
                <Dialog.Close aria-label="Close order" className="focus-ring grid size-7 cursor-pointer place-items-center rounded-sm text-muted hover:bg-sunken hover:text-ink"><Icon name="x" size={14} /></Dialog.Close>
              </div>
              <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-hairline pt-4 text-sm">
                <dt className="text-muted">Status</dt><dd className="text-right">{opened.status}</dd>
                <dt className="text-muted">Units</dt><dd className="tabular text-right font-mono text-xs">{orderNumber.format(opened.units)}</dd>
                <dt className="text-muted">Value</dt><dd className="tabular text-right font-mono text-xs">{orderMoney.format(opened.value)}</dd>
              </dl>
            </>}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
