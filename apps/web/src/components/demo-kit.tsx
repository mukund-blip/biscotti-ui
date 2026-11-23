"use client";
/**
 * Showcase-only helpers for demo state/variant controls.
 * Not part of the library. Deliberately quiet so the component is the hero.
 */
import { useId, type ReactNode } from "react";
import { cn } from "@biscotti/ui";

/** Stage = the component's presentation surface. Size it to the component, not to a grid. */
export function Stage({ children, className, tone = "paper", minH = 280, center = true }: { children: ReactNode; className?: string; tone?: "paper" | "sunken" | "surface"; minH?: number; center?: boolean }) {
  return (
    <div
      className={cn(
        "relative w-full",
        tone === "paper" && "bg-paper",
        tone === "sunken" && "bg-sunken",
        tone === "surface" && "bg-surface",
        center && "flex items-center justify-center",
        className,
      )}
      style={{ minHeight: minH }}
    >
      {children}
    </div>
  );
}

export function Controls({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3 text-sm", className)}>{children}</div>;
}

export function ControlSegment<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[] | { value: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  const opts = (options as (T | { value: T; label: string })[]).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className="flex items-center gap-2">
      <span id={id} className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">{label}</span>
      <div role="radiogroup" aria-labelledby={id} className="flex rounded-sm bg-sunken p-0.5 shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
        {opts.map((o) => (
          <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn("focus-ring h-6 rounded-[3px] px-2 text-xs transition-colors duration-[90ms]", value === o.value ? "bg-raised text-ink shadow-1" : "text-muted hover:text-ink")}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ControlCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--dt-ink)]" />
      {label}
    </label>
  );
}

export function ControlButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="focus-ring h-7 rounded-sm px-2.5 text-xs text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-rule)] hover:bg-sunken hover:text-ink">
      {children}
    </button>
  );
}

/** Small mono readout for showing a component's current value/state. */
export function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 font-mono text-2xs">
      <span className="uppercase tracking-[0.06em] text-muted">{label}</span>
      <span className="tabular text-ink">{children}</span>
    </span>
  );
}

/** Demo layout: stage on top, controls beneath on a hairline. */
export function DemoFrame({ stage, controls, footer }: { stage: ReactNode; controls?: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex w-full flex-1 flex-col self-stretch overflow-hidden [&>*:first-child]:flex-1">
      {stage}
      {controls && <div className="border-t border-hairline bg-surface px-4 py-3">{controls}</div>}
      {footer && <div className="border-t border-hairline bg-surface px-3 py-2">{footer}</div>}
    </div>
  );
}
