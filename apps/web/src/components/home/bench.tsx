"use client";
import { PrecisionToggle } from "@detent/ui";

/** Hero instrument — replaced with the full composition once the tactile set lands. */
export function HeroBench() {
  return (
    <div className="w-full max-w-[420px] rounded-lg bg-raised p-5 shadow-3">
      <p className="mb-4 font-mono text-2xs uppercase tracking-[0.08em] text-muted">OS-1 · Patch 14</p>
      <div className="grid gap-4">
        <PrecisionToggle label="Arpeggiator" defaultChecked />
        <PrecisionToggle label="Write to device" description="Provisional until the OS-1 confirms." onCheckedChange={() => new Promise((r) => setTimeout(r, 1000))} />
      </div>
    </div>
  );
}
