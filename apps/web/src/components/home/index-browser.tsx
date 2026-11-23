"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@biscotti/ui";

export type CategoryOption = { id: string; label: string; short: string; count: number };

/** Fired by in-app links to the homepage, so the index can reset even though Next's pushState fires no hashchange. */
export const INDEX_HASH_EVENT = "biscotti:index-hash";
/** Call from a link's onClick when it navigates to the index; `hash` is the target, "" meaning All. */
export const announceIndexHash = (hash = "") => dispatchEvent(new CustomEvent(INDEX_HASH_EVENT, { detail: hash }));

type NavigationLike = EventTarget & { currentEntry?: { url?: string } | null };

/**
 * The component index: a sticky category sidebar on desktop, a compact tab row at 768 px and below,
 * and server-rendered group sections. Sections are hidden, not unmounted, so live previews keep
 * their state. The choice is mirrored in the URL hash (/#agent-interactions).
 */
export function IndexBrowser({ options, total, install, sections }: {
  options: CategoryOption[]; total: number; install: string; sections: { id: string; node: ReactNode }[];
}) {
  const [active, setActive] = useState("all");
  const top = useRef<HTMLDivElement>(null);
  // The category last applied, and whether the index should be scrolled into place once it renders.
  const applied = useRef("all");
  const scrollPending = useRef(false);

  // Hiding the groups above a deep-linked section moves it up. Chrome and Firefox hide that jump with
  // scroll anchoring; Safari has none, so re-align explicitly after the hidden groups are committed.
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const frame = requestAnimationFrame(() => top.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    const apply = (hash: string) => {
      const id = decodeURIComponent(hash.replace(/^#/, ""));
      const next = options.some((o) => o.id === id) ? id : "all";
      // Only a navigation that lands on a different category needs re-aligning (deep links, breadcrumbs,
      // back/forward). choose() updates `applied` first, so its own URL update never scrolls.
      if (next !== applied.current && next !== "all") scrollPending.current = true;
      applied.current = next;
      setActive(next);
    };
    const fromLocation = () => apply(location.hash);
    // In-app links announce where they are going; their click runs before Next updates the URL.
    const fromEvent = (e: Event) => apply(String((e as CustomEvent<string>).detail ?? ""));
    fromLocation();
    addEventListener("hashchange", fromLocation);
    addEventListener("popstate", fromLocation);
    addEventListener(INDEX_HASH_EVENT, fromEvent);
    // Next's <Link> uses history.pushState, which fires no hashchange. Where the Navigation API
    // exists, follow every same-document navigation too (any future link to "/" is covered).
    const nav = (globalThis as { navigation?: NavigationLike }).navigation;
    nav?.addEventListener("navigatesuccess", fromLocation);
    return () => {
      removeEventListener("hashchange", fromLocation);
      removeEventListener("popstate", fromLocation);
      removeEventListener(INDEX_HASH_EVENT, fromEvent);
      nav?.removeEventListener("navigatesuccess", fromLocation);
    };
  }, [options]);

  const choose = (id: string) => {
    applied.current = id;
    setActive(id);
    history.replaceState(null, "", id === "all" ? location.pathname + location.search : `#${id}`);
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  };

  const all: CategoryOption = { id: "all", label: "All", short: "All", count: total };
  const items = [all, ...options];

  return (
    <div ref={top} className="scroll-mt-20 min-[769px]:grid min-[769px]:grid-cols-[200px_minmax(0,1fr)] min-[769px]:gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      {/* Desktop and tablet: sticky sidebar */}
      <aside className="hidden min-[769px]:block">
        <div className="sticky top-24 flex flex-col gap-1">
          <p className="px-3 pb-2.5 text-[11px] uppercase tracking-[0.08em] text-muted">Categories</p>
          <nav aria-label="Categories" className="flex flex-col gap-1">
            {items.map((o) => {
              const on = active === o.id;
              return (
                <button key={o.id} type="button" aria-pressed={on} onClick={() => choose(o.id)}
                  className={cn("focus-ring flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-left text-sm transition-colors duration-[90ms]",
                    on ? "bg-ink font-medium text-on-ink" : "text-ink hover:bg-surface")}>
                  <span className="min-w-0">{o.label}</span>
                  <span className={cn("tabular shrink-0 self-center text-[13px] leading-4", on ? "text-on-ink" : "text-muted")}>{o.count}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-hairline px-3 pt-4">
            <p className="text-xs text-muted">Install any component</p>
            <code className="block truncate rounded-[8px] border border-hairline bg-raised px-2.5 py-2 font-mono text-[11px] text-ink" title={install}>
              npx shadcn add …/r/&lt;name&gt;
            </code>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* 768 px and below: a compact tab row that wraps instead of clipping labels */}
        <div className="sticky top-16 z-30 -mx-5 mb-6 border-b border-hairline bg-paper/90 px-5 py-2.5 backdrop-blur-md min-[769px]:hidden">
          <nav aria-label="Categories (compact)" className="flex flex-wrap gap-1.5">
            {items.map((o) => {
              const on = active === o.id;
              return (
                <button key={o.id} type="button" aria-pressed={on} onClick={() => choose(o.id)} title={o.label}
                  className={cn("focus-ring inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 text-sm transition-colors duration-[90ms]",
                    on ? "bg-ink font-medium text-on-ink" : "bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)]")}>
                  {o.short}
                  <span className={cn("tabular text-xs", on ? "text-on-ink" : "text-muted")}>{o.count}</span>
                </button>
              );
            })}
          </nav>
        </div>
        {sections.map((s) => (
          <div key={s.id} hidden={active !== "all" && active !== s.id}>{s.node}</div>
        ))}
      </div>
    </div>
  );
}
