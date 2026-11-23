"use client";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn, isMac } from "./utils";

/** Keyboard key cap. `⌘` renders as Ctrl on non-Mac platforms. */
export function Kbd({ children, className, ...rest }: ComponentPropsWithoutRef<"kbd">) {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(isMac()), []);
  const content = typeof children === "string" && !mac ? children.replace("⌘", "Ctrl ").replace("⌥", "Alt ") : children;
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs px-1 font-mono text-2xs text-muted",
        "bg-surface shadow-[inset_0_0_0_1px_var(--bis-hairline),inset_0_-1px_0_var(--bis-rule)]",
        className,
      )}
      {...rest}
    >
      {content}
    </kbd>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span className="absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]">
      {children}
    </span>
  );
}

/** Milliseconds elapsed while `running`; freezes when stopped. */
export function useElapsed(running: boolean, resetKey?: unknown) {
  const [ms, setMs] = useState(0);
  const start = useRef<number | null>(null);
  const base = useRef(0);
  useEffect(() => {
    base.current = 0;
    start.current = null;
    setMs(0);
  }, [resetKey]);
  useEffect(() => {
    if (!running) {
      if (start.current != null) base.current += performance.now() - start.current;
      start.current = null;
      return;
    }
    start.current = performance.now();
    // 10 Hz is enough for a tenths display and avoids re-rendering every frame.
    const id = window.setInterval(() => {
      setMs(base.current + performance.now() - (start.current ?? performance.now()));
    }, 100);
    return () => window.clearInterval(id);
  }, [running]);
  return ms;
}

/**
 * The "live mark" — the one pencil-coloured element that signals where the
 * system is acting right now. Drains to ink when `live` becomes false.
 */
export function LiveMark({ live, className, shape = "dot" }: { live: boolean; className?: string; shape?: "dot" | "bar" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 transition-[background-color,opacity,transform] duration-[240ms] ease-out",
        shape === "dot" ? "size-1.5 rounded-full" : "h-3 w-[2px] rounded-full",
        live ? "bg-pencil motion-safe:animate-[bis-breathe_1.6s_ease-in-out_infinite]" : "bg-faint",
        className,
      )}
    />
  );
}

/** Small round spinner drawn as a 270° arc in pencil. */
export function Spinner({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden
      className={cn("shrink-0 text-pencil motion-safe:animate-[bis-spin_0.8s_linear_infinite]", className)}
    >
      <circle cx="6" cy="6" r="4.75" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d="M6 1.25A4.75 4.75 0 0 1 10.75 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
