"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, cn, usePlay } from "@biscotti/ui";

export interface Cue<S> {
  at: number; // ms
  apply: (s: S) => S;
  label?: string;
}

/**
 * Deterministic demo driver: state(t) = cues[at ≤ t].reduce(apply, initial).
 * Scrubbing backwards is therefore exact — no hidden side effects.
 */
export function useScript<S>(initial: S, cues: Cue<S>[], opts: { duration?: number; autoplay?: boolean; loopDelay?: number } = {}) {
  const sorted = useMemo(() => [...cues].sort((a, b) => a.at - b.at), [cues]);
  const duration = opts.duration ?? (sorted.at(-1)?.at ?? 0) + 600;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const tRef = useRef(0);
  tRef.current = t;

  // Autoplay when scrolled into view (once).
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (opts.autoplay === false || !ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          setPlaying(true);
        }
      },
      { threshold: 0.35 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [opts.autoplay]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      const next = Math.min(duration, tRef.current + dt);
      setT(next);
      if (next >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const state = useMemo(() => sorted.filter((c) => c.at <= t).reduce((s, c) => c.apply(s), initial), [sorted, t, initial]);

  const replay = useCallback(() => {
    setT(0);
    setPlaying(true);
  }, []);
  const seek = useCallback((ms: number) => setT(Math.max(0, Math.min(duration, ms))), [duration]);
  const toggle = useCallback(() => {
    if (tRef.current >= duration) {
      setT(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
  }, [duration]);

  return { state, t, duration, playing, speed, setSpeed, replay, seek, toggle, setPlaying, cues: sorted, ref };
}

type Script = Omit<ReturnType<typeof useScript<any>>, "ref">;

/** Tick-ruled scrubber. The playhead is the page's one live mark. */
export function ScriptBar({ script, className }: { script: Script; className?: string }) {
  const { t, duration, playing, speed, setSpeed, replay, seek, toggle, cues, setPlaying } = script;
  const play = usePlay();
  const track = useRef<HTMLDivElement>(null);
  const seconds = Math.ceil(duration / 1000);
  const pct = duration ? t / duration : 0;

  const fromEvent = (e: React.PointerEvent | PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * duration;
  };

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button onClick={() => { play("tap", { velocity: 0.4 }); toggle(); }} aria-label={playing ? "Pause demo" : "Play demo"}
        className="focus-ring grid size-7 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-sunken hover:text-ink">
        <Icon name={playing ? "pause" : "play"} size={13} />
      </button>
      <button onClick={() => { play("tap", { velocity: 0.4 }); replay(); }} aria-label="Replay demo"
        className="focus-ring grid size-7 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-sunken hover:text-ink">
        <Icon name="replay" size={13} />
      </button>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Demo timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(t)}
        aria-valuetext={`${(t / 1000).toFixed(1)} of ${(duration / 1000).toFixed(1)} seconds`}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 1000 : 100;
          if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); seek(t + step); }
          if (e.key === "ArrowLeft") { e.preventDefault(); setPlaying(false); seek(t - step); }
          if (e.key === "Home") { e.preventDefault(); seek(0); }
          if (e.key === "End") { e.preventDefault(); seek(duration); }
          if (e.key === " ") { e.preventDefault(); toggle(); }
        }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setPlaying(false);
          seek(fromEvent(e));
        }}
        onPointerMove={(e) => { if (e.buttons === 1) seek(fromEvent(e)); }}
        className="focus-ring group relative h-7 min-w-0 flex-1 cursor-ew-resize touch-none rounded-xs"
      >
        {/* ticks */}
        <div aria-hidden className="absolute inset-x-0 bottom-1 h-3">
          {Array.from({ length: seconds * 10 + 1 }).map((_, i) => {
            const major = i % 10 === 0;
            const x = ((i * 100) / duration) * 100;
            if (x > 100) return null;
            return (
              <span key={i} className={cn("absolute bottom-0 w-px", major ? "h-3 bg-rule" : i % 5 === 0 ? "h-2 bg-hairline" : "h-1 bg-hairline")} style={{ left: `${x}%` }} />
            );
          })}
        </div>
        {/* cue notches */}
        <div aria-hidden className="absolute inset-x-0 top-1 h-1.5">
          {cues.map((c, i) => (
            <span key={i} className={cn("absolute top-0 h-1.5 w-[3px] -translate-x-1/2 rounded-[1px] transition-colors", c.at <= t ? "bg-ink-2" : "bg-rule")} style={{ left: `${(c.at / duration) * 100}%` }} />
          ))}
        </div>
        {/* playhead */}
        <span aria-hidden className="absolute inset-y-0 w-[2px] -translate-x-1/2 rounded-full bg-pencil" style={{ left: `${pct * 100}%` }}>
          <span className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-pencil" />
        </span>
      </div>
      <span className="tabular w-[86px] shrink-0 whitespace-nowrap text-right font-mono text-2xs text-muted">
        {(t / 1000).toFixed(1)} / {(duration / 1000).toFixed(1)}s
      </span>
      <button
        onClick={() => { play("select", { velocity: 0.4 }); setSpeed(speed === 1 ? 0.25 : speed === 0.25 ? 0.5 : speed === 0.5 ? 2 : 1); }}
        aria-label={`Playback speed ${speed}×`}
        className="focus-ring tabular h-7 w-11 shrink-0 rounded-sm font-mono text-2xs text-ink-2 shadow-[inset_0_0_0_1px_var(--dt-hairline)] hover:text-ink"
      >
        {speed}×
      </button>
    </div>
  );
}
