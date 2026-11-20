import type { DataTableStatusTone } from "@detent/ui/components/data-table/data-table";

export const orderStatuses = ["Packed", "In transit", "Shipped", "Awaiting stock"] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export interface OstraOrder {
  id: string;
  retailer: string;
  country: string;
  units: number;
  value: number;
  status: OrderStatus;
  updated: number;
}

export const orderClock = Date.UTC(2026, 2, 20, 14);
export const orderUnitPrice = 510;
const minute = 60_000;

function order(id: number, retailer: string, country: string, units: number, status: OrderStatus, age: number): OstraOrder {
  return { id: `OS-${id}`, retailer, country, units, status, value: units * orderUnitPrice, updated: orderClock - age * minute };
}

export const ostraOrders: readonly OstraOrder[] = [
  order(1254, "SchneidersLaden", "DE", 72, "In transit", 9),
  order(1253, "Patch Point", "DE", 48, "Packed", 24),
  order(1252, "Modular Moon", "NL", 60, "Shipped", 43),
  order(1251, "Signal Sounds", "GB", 36, "Awaiting stock", 65),
  order(1250, "Klangfarbe", "AT", 84, "Shipped", 102),
  order(1249, "Midi Amsterdam", "NL", 24, "Packed", 140),
  order(1248, "Raw Voltage", "AT", 30, "In transit", 192),
  order(1247, "Modular Square", "FR", 54, "Shipped", 360),
  order(1246, "Elevator Sound", "GB", 42, "Shipped", 1_680),
  order(1245, "Malmö Musikaffär", "SE", 18, "Awaiting stock", 4_380),
  order(1244, "Found Sound", "AU", 28, "Shipped", 12_970),
  order(1243, "Elektronmusikstudion", "SE", 12, "Shipped", 29_100),
];

export const orderStatusTone: Record<OrderStatus, DataTableStatusTone> = {
  "In transit": "neutral",
  "Awaiting stock": "warning",
  "Packed": "neutral",
  "Shipped": "success",
};

export const orderStatusDot: Record<OrderStatus, string> = {
  "In transit": "bg-edge",
  "Awaiting stock": "bg-warn",
  "Packed": "bg-edge",
  "Shipped": "bg-ok",
};

export const orderMoney = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const orderNumber = new Intl.NumberFormat("en");
const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

export function formatOrderTime(updated: number, now: number) {
  const minutes = (updated - now) / minute;
  if (Math.abs(minutes) < 60) return relativeTime.format(Math.round(minutes), "minute");
  if (Math.abs(minutes) < 1_440) return relativeTime.format(Math.round(minutes / 60), "hour");
  return relativeTime.format(Math.round(minutes / 1_440), "day");
}
