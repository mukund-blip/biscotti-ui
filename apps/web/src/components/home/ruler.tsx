"use client";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { spring, useMotionTokens } from "@biscotti/ui";

/**
 * The hero ruler: hairline ticks every 8px, majors every 80px. A pencil
 * playhead follows the pointer with the glide spring and reads out its x.
 */
export function HeroRuler() {
  const ref = useRef<HTMLDivElement>(null);
  const m = useMotionTokens();
  const [w, setW] = useState(0);
  const [active, setActive] = useState(false);
  const raw = useMotionValue(0);
  const x = useSpring(raw, m.reduced ? { stiffness: 10000, damping: 1000 } : spring.glide);
  const label = useTransform(x, (v) => `${Math.round(v)}`);
  const [text, setText] = useState("0");
  useEffect(() => label.on("change", setText), [label]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top - 520 || e.clientY > r.bottom + 40) return setActive(false);
      setActive(true);
      raw.set(Math.max(0, Math.min(r.width, e.clientX - r.left)));
    };
    window.addEventListener("pointermove", move);
    return () => {
      ro.disconnect();
      window.removeEventListener("pointermove", move);
    };
  }, [raw]);

  const ticks = Math.floor(w / 8);
  return (
    <div ref={ref} aria-hidden className="relative h-6 w-full select-none overflow-hidden">
      <svg width={w} height={24} className="absolute inset-0">
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const major = i % 10 === 0;
          const mid = i % 5 === 0;
          return <line key={i} x1={i * 8 + 0.5} x2={i * 8 + 0.5} y1={24} y2={major ? 10 : mid ? 16 : 20} stroke={major ? "var(--bis-rule)" : "var(--bis-hairline)"} />;
        })}
        {Array.from({ length: Math.floor(ticks / 10) + 1 }).map((_, i) => (
          <text key={i} x={i * 80 + 3} y={9} className="fill-[var(--bis-faint)] font-mono" fontSize={8.5}>{i * 80}</text>
        ))}
      </svg>
      <motion.div style={{ x }} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.12 }} className="absolute inset-y-0 left-0 w-0">
        <span className="absolute bottom-0 left-[-1px] h-6 w-[2px] rounded-full bg-pencil" />
        <span className="tabular absolute left-1.5 top-0 rounded-[2px] bg-pencil px-1 font-mono text-[9px] leading-[13px] text-white">{text}</span>
      </motion.div>
    </div>
  );
}
