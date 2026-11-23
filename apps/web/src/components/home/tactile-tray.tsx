"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon, InteractiveSlider, KineticButton, PrecisionToggle, SegmentedControl, SegmentedControlItem } from "@biscotti/ui";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One cell: the control at its natural size, and the component it is. */
function Cell({ slug, name, hint, children }: { slug: string; name: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-5 rounded-lg bg-surface p-4 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
      <div className="flex min-h-[64px] items-center">{children}</div>
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/components/${slug}`} className="focus-ring group inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xs text-sm font-medium text-ink">
          {name}
          <Icon name="arrowRight" size={13} className="text-muted transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-ink" />
        </Link>
        <span className="truncate text-xs text-muted">{hint}</span>
      </div>
    </div>
  );
}

/** Four tactile components, live and at the size they ship at. */
export function TactileTray() {
  const [range, setRange] = useState("week");
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2">
      <Cell slug="kinetic-button" name="Kinetic Button" hint="Hold the red one">
        <div className="flex flex-wrap gap-2">
          <KineticButton icon="check" pendingLabel="Saving" successLabel="Saved" onClick={() => wait(900)}>
            Save draft
          </KineticButton>
          <KineticButton variant="danger" holdToConfirm={1000} onClick={() => wait(600)}>
            Hold to delete
          </KineticButton>
        </div>
      </Cell>
      <Cell slug="precision-toggle" name="Precision Toggle" hint="Pending until saved">
        <div className="w-full">
          <PrecisionToggle label="Sync to cloud" description="Takes a second to confirm." onCheckedChange={() => wait(900)} />
        </div>
      </Cell>
      <Cell slug="segmented-control" name="Segmented Control" hint="Arrow keys work">
        <SegmentedControl aria-label="Range" value={range} onValueChange={setRange}>
          <SegmentedControlItem value="day">Day</SegmentedControlItem>
          <SegmentedControlItem value="week">Week</SegmentedControlItem>
          <SegmentedControlItem value="month">Month</SegmentedControlItem>
        </SegmentedControl>
      </Cell>
      <Cell slug="interactive-slider" name="Interactive Slider" hint="Shift drags finely">
        <div className="w-full">
          <InteractiveSlider label="Volume" defaultValue={60} marks={[{ value: 75, label: "Default" }]} formatValue={(v) => `${v}%`} />
        </div>
      </Cell>
    </div>
  );
}
