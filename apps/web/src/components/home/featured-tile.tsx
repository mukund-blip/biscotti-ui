"use client";
import Link from "next/link";
import { Icon, KineticButton } from "@biscotti/ui";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One featured component, live and at a comfortable size. Both buttons reserve their widest state. */
export function FeaturedTile() {
  return (
    <section aria-labelledby="featured-h" className="flex min-h-[300px] flex-col justify-between gap-8 rounded-[18px] bg-[var(--feature-bg)] p-5 md:min-h-[340px] md:p-6">
      <div className="flex items-baseline justify-between gap-4 text-[var(--feature-label)]">
        <p className="text-xs uppercase tracking-[0.08em]">Featured</p>
        <p className="text-sm">Hold the red button to delete</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3.5">
        <KineticButton size="lg" icon="check" pendingLabel="Saving" successLabel="Saved" onClick={() => wait(900)}>
          Save draft
        </KineticButton>
        <KineticButton size="lg" variant="danger" holdToConfirm={1000} pendingLabel="Deleting" successLabel="Deleted" onClick={() => wait(700)}>
          Hold to delete
        </KineticButton>
      </div>
      <Link href="/components/kinetic-button" className="focus-ring group flex items-end justify-between gap-4 rounded-sm">
        <span className="min-w-0">
          <span id="featured-h" className="block text-[20px] font-semibold leading-6 tracking-[-0.01em] text-[var(--feature-ink)]">Kinetic Button</span>
          <span className="mt-0.5 block text-sm text-[var(--feature-text)]">Shows pending, success and error states. Supports hold to confirm.</span>
        </span>
        <Icon name="arrowRight" size={18} className="mb-0.5 shrink-0 text-[var(--feature-ink)] transition-transform duration-[120ms] group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
