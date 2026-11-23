"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@biscotti/ui";

type Option = { id: string; label: string; count: number };

/**
 * A sticky category filter over server-rendered group sections. Sections are hidden, not unmounted,
 * so live previews keep their state when you switch. The choice is mirrored in the URL hash
 * (/#agent-interactions), so groups can be linked to.
 */
export function IndexFilter({ options, total, sections }: { options: Option[]; total: number; sections: { id: string; node: ReactNode }[] }) {
  const [active, setActive] = useState("all");
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      setActive(options.some((o) => o.id === id) ? id : "all");
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, [options]);

  const choose = (id: string) => {
    setActive(id);
    history.replaceState(null, "", id === "all" ? location.pathname + location.search : `#${id}`);
    // If the bar is already stuck, bring the start of the results back into view.
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  };

  // Keep the chosen tab visible in the scrolling bar on phones.
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const btn = bar.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    btn?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const all: Option = { id: "all", label: "All", count: total };
  return (
    <div ref={top} className="scroll-mt-16">
      <div className="sticky top-16 z-30 -mx-5 border-b border-hairline bg-paper/90 px-5 backdrop-blur-md md:-mx-8 md:px-8">
        <nav ref={bar} aria-label="Filter components by category" className="-mx-1 flex gap-1 overflow-x-auto px-1 py-2.5 [scrollbar-width:none]">
          {[all, ...options].map((o) => {
            const on = active === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => choose(o.id)}
                className={cn(
                  "focus-ring inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors duration-[90ms]",
                  on ? "bg-ink text-on-ink" : "text-ink-2 hover:bg-surface hover:text-ink",
                )}
              >
                {o.label}
                <span className={cn("tabular font-mono text-2xs", on ? "text-on-ink" : "text-muted")}>{o.count}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <div className="pt-8">
        {sections.map((s) => (
          <div key={s.id} hidden={active !== "all" && active !== s.id}>{s.node}</div>
        ))}
      </div>
    </div>
  );
}
