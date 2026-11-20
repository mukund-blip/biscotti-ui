type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, boolean | null | undefined>;

/** Tiny classnames joiner (no tailwind-merge; components avoid conflicting classes). */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue) => {
    if (!v) return;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const k in v) if (v[k]) out.push(k);
  };
  inputs.forEach(walk);
  return out.join(" ");
}

export { useControllable } from "./hooks";

/** Number formatting helpers — always tabular, locale-aware. */
export const fmt = {
  int: (n: number, locale?: string) => new Intl.NumberFormat(locale).format(Math.round(n)),
  compact: (n: number, locale?: string) =>
    new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n),
  pct: (n: number, digits = 1, locale?: string) =>
    new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n),
  signedPct: (n: number, digits = 1, locale?: string) =>
    new Intl.NumberFormat(locale, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n),
  currency: (n: number, currency = "USD", locale?: string) =>
    new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: n >= 1000 ? 0 : 2 }).format(n),
  seconds: (ms: number) => `${(ms / 1000).toFixed(1)}s`,
  duration: (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  },
};

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

let idCounter = 0;
export const uid = (p = "dt") => `${p}-${++idCounter}`;
