"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@biscotti/ui";
import { SoundControl } from "./site-chrome";

/** The live stage. Its theme can be flipped independently of the page. */
export function StageShell({ children, number, label }: { children: ReactNode; number: string; label: string }) {
  const [theme, setTheme] = useState<"page" | "light" | "dark">("page");
  return (
    <section aria-label={`${label} live preview`} className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex h-11 items-center gap-3 px-3 [box-shadow:inset_0_-1px_0_var(--bis-hairline)]">
        <span className="flex items-center gap-2 pl-1 font-mono text-2xs text-muted">
          <span className="size-1.5 rounded-full bg-pencil" aria-hidden />
          LIVE · {number}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div role="radiogroup" aria-label="Preview theme" className="flex h-8 items-center rounded-md bg-sunken p-0.5 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
            {(["page", "light", "dark"] as const).map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}
                className={cn("focus-ring h-7 rounded-sm px-2.5 text-xs capitalize transition-colors duration-[90ms]", theme === t ? "bg-raised text-ink shadow-1" : "text-muted hover:text-ink")}>
                {t}
              </button>
            ))}
          </div>
          <SoundControl compact />
        </div>
      </div>
      <div data-theme={theme === "page" ? undefined : theme} className="bg-paper text-ink">
        {children}
      </div>
    </section>
  );
}
