"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { REPO_URL } from "@/site";
import { Icon, cn, surfaceVariants, useMotionTokens, useSoundPrefs, sound } from "@detent/ui";

export function Logo({ className }: { className?: string }) {
  // A dial with one seated notch — the detent.
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden>
      <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = 8.75, r2 = 9.75;
        const f = (n: number) => Math.round(n * 1000) / 1000;
        return (
          <line key={i} x1={f(10 + Math.cos(a) * r1)} y1={f(10 + Math.sin(a) * r1)} x2={f(10 + Math.cos(a) * r2)} y2={f(10 + Math.sin(a) * r2)}
            stroke="currentColor" strokeOpacity={0.35} strokeWidth="1" />
        );
      })}
      <line x1="10" y1="10" x2="10" y2="4.5" stroke="var(--dt-pencil)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

type ThemePref = "light" | "dark" | "system";

function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem("detent.theme");
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

function paintTheme(p: ThemePref) {
  const dark = p === "dark" || (p === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme-pref", p);
}

function ThemeSwitch() {
  const [pref, setPref] = useState<ThemePref>("system");
  useEffect(() => {
    // The saved preference is the source of truth. If hydration ever falls back to a
    // client render, React resets <html data-theme> to its server value; re-apply it here.
    const frame = requestAnimationFrame(() => {
      const saved = readThemePref();
      setPref(saved);
      paintTheme(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const apply = (p: ThemePref) => {
    setPref(p);
    try { localStorage.setItem("detent.theme", p); } catch {}
    paintTheme(p);
  };
  const opts = [
    { id: "light", icon: "sun", label: "Light theme" },
    { id: "dark", icon: "moon", label: "Dark theme" },
    { id: "system", icon: "globe", label: "System theme" },
  ] as const;
  const resolved = pref;
  return (
    <div role="group" aria-label="Theme" className="flex h-8 items-center rounded-md bg-sunken p-0.5 shadow-[inset_0_0_0_1px_var(--dt-hairline)]">
      {opts.map((o) => {
        const on = resolved === o.id;
        return (
          <button key={o.id} aria-pressed={on} aria-label={o.label}
            onClick={() => apply(o.id)}
            className={cn("focus-ring grid size-7 place-items-center rounded-sm text-muted transition-colors duration-[90ms] hover:text-ink",
              on && "bg-raised text-ink shadow-1")}
          >
            <Icon name={o.icon} size={14} />
          </button>
        );
      })}
    </div>
  );
}

export function SoundControl({ compact = false }: { compact?: boolean }) {
  const prefs = useSoundPrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const m = useMotionTokens();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const on = prefs.enabled;
  return (
    <div ref={ref} className="relative flex items-center">
      <button
        onClick={() => { if (!on) { prefs.enable(); requestAnimationFrame(() => sound.play("latch")); } else prefs.disable(); }}
        aria-pressed={on}
        aria-label={compact ? "Sound" : undefined}
        disabled={prefs.disabledPermanently}
        className={cn(
          "focus-ring group flex h-8 items-center gap-2 rounded-l-md pl-2.5 pr-2 text-sm transition-colors duration-[90ms]",
          "shadow-[inset_0_0_0_1px_var(--dt-hairline)]",
          on ? "bg-raised text-ink" : "bg-sunken text-muted hover:text-ink",
          prefs.disabledPermanently && "opacity-50",
        )}
      >
        <Icon name={on ? "speaker" : "speakerOff"} size={14} />
        {!compact && <span className="tabular w-[62px] text-left">{prefs.disabledPermanently ? "Disabled" : on ? "Sound on" : "Sound off"}</span>}
        <span aria-hidden className={cn("size-1.5 rounded-full transition-colors duration-200", on ? "bg-pencil" : "bg-faint")} />
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Sound settings"
        aria-expanded={open}
        className="focus-ring grid h-8 w-6 place-items-center rounded-r-md bg-sunken text-muted shadow-[inset_0_0_0_1px_var(--dt-hairline)] hover:text-ink"
      >
        <Icon name="chevronDown" size={12} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            {...surfaceVariants("top", m.reduced)}
            className="absolute right-0 top-10 z-50 w-64 origin-top-right rounded-lg bg-raised p-3 shadow-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Interface sound</span>
              <span className="tabular font-mono text-2xs text-muted">{Math.round(prefs.volume * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={1} step={0.05} value={prefs.volume} aria-label="Volume"
              onChange={(e) => prefs.setVolume(Number(e.target.value))}
              onPointerUp={() => sound.play("tick")}
              className="w-full accent-[var(--dt-pencil)]"
            />
            <p className="mt-2 text-xs text-muted">
              Synthesised in your browser. Sounds play only for deliberate actions — never on hover or background updates.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-hairline pt-3 text-xs text-ink-2">
              <input type="checkbox" checked={prefs.disabledPermanently} onChange={(e) => prefs.setDisabledPermanently(e.target.checked)} />
              Never play sounds on this device
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const nav = [
  { href: "/components", label: "Components" },
  { href: "/workbench", label: "Workbench" },
  { href: "/foundations", label: "Foundations" },
];

export function SiteChrome({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <a href="#main" className="focus-ring sr-only z-[100] rounded-sm bg-raised px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-md [box-shadow:inset_0_-1px_0_var(--dt-hairline)]">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:gap-6 sm:px-5 md:px-8">
          {/* Named by its content ("Biscotti UI 0.1, home"; no version below sm) so the accessible name always contains the visible text. */}
          <Link href="/" className="focus-ring flex items-center gap-2 rounded-sm text-ink">
            <Logo className="size-5" />
            <span className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em]">Biscotti UI</span>{" "}
            {/* The version yields to the wordmark on narrow phones. */}
            <span className="hidden font-mono text-2xs text-muted sm:inline">0.1</span>
            <span className="sr-only">, home</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {nav.map((n) => {
              const active = path?.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={cn("focus-ring rounded-sm px-2.5 py-1.5 text-sm transition-colors duration-[90ms]", active ? "bg-sunken text-ink" : "text-muted hover:bg-surface hover:text-ink")}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href={REPO_URL} className="focus-ring mr-2 hidden items-center gap-1.5 rounded-sm text-xs text-muted hover:text-ink lg:inline-flex">Source<Icon name="arrowUpRight" size={13} /></a>
            {/* The labelled control fits from 400 px; narrower phones get the icon-only version so the header never overflows. */}
            <div className="hidden min-[400px]:block"><SoundControl /></div>
            <div className="min-[400px]:hidden"><SoundControl compact /></div>
            <ThemeSwitch />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Primary mobile">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path?.startsWith(n.href) ? "page" : undefined} className={cn("focus-ring rounded-sm px-2.5 py-1 text-sm", path?.startsWith(n.href) ? "bg-sunken text-ink" : "text-muted")}>{n.label}</Link>
          ))}
        </nav>
      </header>
      <main id="main">{children}</main>
    </>
  );
}
