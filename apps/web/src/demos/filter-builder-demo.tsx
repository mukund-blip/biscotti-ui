"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Icon, tween, useMotionTokens, VisuallyHidden } from "@detent/ui";
import { FilterBuilder, filterBuilderMatches, type FilterBuilderCondition, type FilterBuilderField } from "@detent/ui/components/filter-builder/filter-builder";
import { ControlButton, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";
import { orderClock, orderNumber, orderStatusDot, orderStatuses, ostraOrders, type OstraOrder } from "./orders-data";

const countries = [...new Set(ostraOrders.map((order) => order.country))].sort().map((value) => ({ value }));
const fields: readonly FilterBuilderField<OstraOrder>[] = [
  { id: "status", label: "Status", type: "enum", accessor: (row) => row.status, options: orderStatuses.map((value) => ({ value })) },
  { id: "units", label: "Units", type: "number", accessor: (row) => row.units },
  { id: "country", label: "Country", type: "enum", accessor: (row) => row.country, options: countries },
  { id: "retailer", label: "Retailer", type: "text", accessor: (row) => row.retailer },
  { id: "updated", label: "Updated", type: "date", accessor: (row) => row.updated },
];

const initial: readonly FilterBuilderCondition[] = [
  { id: "shipped", field: "status", operator: "is", value: "Shipped" },
  { id: "wholesale", field: "units", operator: "gte", value: 50 },
];

function MatchCount({ count }: { count: number }) {
  const m = useMotionTokens();
  const number = useMotionValue(count);
  const display = useTransform(number, (n) => orderNumber.format(Math.round(n)));

  useEffect(() => {
    if (number.get() === count) return;
    const animation = animate(number, count, m.move(tween.drain));
    return () => animation.stop();
  }, [count, number, m.reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div role="status" className="flex shrink-0 items-baseline gap-1.5 text-xs text-muted">
      <VisuallyHidden>{count} of {ostraOrders.length} orders match</VisuallyHidden>
      <motion.span aria-hidden className="tabular min-w-[2ch] text-right font-mono text-md font-medium text-ink">{display}</motion.span>
      <span aria-hidden>of <span className="tabular font-mono">{ostraOrders.length}</span> match</span>
    </div>
  );
}

export function FilterBuilderDemo() {
  const [conditions, setConditions] = useState(initial);
  const matches = useMemo(() => ostraOrders.filter((order) => filterBuilderMatches(order, fields, conditions, orderClock)), [conditions]);

  return (
    <DemoFrame
      stage={
        <Stage tone="sunken" minH={0} className="px-3 py-7 sm:px-8 sm:py-10">
          <div className="flex w-full max-w-[740px] flex-col gap-3">
            <FilterBuilder fields={fields} value={conditions} onChange={setConditions} />
            <section aria-label="Matching retailer orders" className="overflow-hidden rounded-lg border border-hairline bg-raised shadow-2">
              <header className="flex min-h-13 items-center justify-between gap-2 border-b border-hairline px-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="database" size={14} className="text-muted" />Retailer orders</h3>
                <MatchCount count={matches.length} />
              </header>
              <div className="h-40 overflow-auto overscroll-contain">
                <table aria-label="Matching orders" className="w-full border-separate border-spacing-0 whitespace-nowrap text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-surface text-muted">
                    <tr>
                      <th scope="col" className="h-8 w-[16%] border-b border-hairline px-2.5 font-medium sm:px-4">Order</th>
                      <th scope="col" className="w-[39%] border-b border-hairline px-2 font-medium">Retailer</th>
                      <th scope="col" className="w-[13%] border-b border-hairline px-1.5 sm:px-2 font-medium">Country</th>
                      <th scope="col" className="w-[10%] border-b border-hairline px-1.5 text-right sm:px-2 font-medium">Units</th>
                      <th scope="col" className="w-[22%] border-b border-hairline px-2.5 font-medium sm:px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((order) => (
                      <tr key={order.id} className="text-ink">
                        <td className="tabular h-8 border-b border-hairline px-2.5 font-mono sm:px-4 text-2xs text-muted">{order.id}</td>
                        <td className="border-b border-hairline px-2 font-medium">{order.retailer}</td>
                        <td className="tabular border-b border-hairline px-1.5 font-mono sm:px-2 text-2xs text-muted">{order.country}</td>
                        <td className="tabular border-b border-hairline px-1.5 text-right sm:px-2 font-mono text-2xs">{order.units}</td>
                        <td className="border-b border-hairline px-2.5 sm:px-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${orderStatusDot[order.status]}`} />
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!matches.length && <p className="grid h-32 place-items-center px-4 text-center text-sm text-muted">No orders match these filters.</p>}
              </div>
            </section>
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlButton onClick={() => setConditions(initial)}>Reset filters</ControlButton>
          <Readout label="Conditions">{conditions.length}</Readout>
        </Controls>
      }
    />
  );
}
