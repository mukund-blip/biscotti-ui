"use client";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { spring, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { VisuallyHidden } from "../../lib/primitives";
import { cn, useControllable } from "../../lib/utils";

type Size = "sm" | "md" | "lg";
const DIM: Record<Size, { w: number; h: number; pad: number; squish: number; io: number }> = {
  sm: { w: 32, h: 18, pad: 2, squish: 3, io: 6 },
  md: { w: 40, h: 22, pad: 2, squish: 4, io: 7 },
  lg: { w: 52, h: 28, pad: 3, squish: 5, io: 9 },
};

export interface PrecisionToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  /**
   * Called on change. Return a Promise to make the change provisional:
   * the track is drawn in pencil until it resolves; a rejection springs back.
   */
  onCheckedChange?: (checked: boolean) => void | Promise<unknown>;
  disabled?: boolean;
  size?: Size;
  /** Visible label. If omitted, pass `aria-label`. */
  label?: ReactNode;
  description?: ReactNode;
  /** Put the label before the switch (settings rows) or after (inline). */
  labelPosition?: "start" | "end";
  /** Message shown when an async change is rejected. */
  errorMessage?: ReactNode;
  /** Message shown while an async change is pending. */
  pendingMessage?: ReactNode;
  name?: string;
  value?: string;
  id?: string;
  sound?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function PrecisionToggle({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  size = "md",
  label,
  description,
  labelPosition = "start",
  errorMessage = "Couldn’t save — try again",
  pendingMessage = "Saving…",
  name,
  value = "on",
  id: idProp,
  sound: soundOn = true,
  className,
  "aria-label": ariaLabel,
}: PrecisionToggleProps) {
  const autoId = useId();
  const id = idProp ?? `bis-toggle-${autoId}`;
  const descId = `${id}-desc`;
  const statusId = `${id}-status`;
  const play = usePlay(soundOn);
  const m = useMotionTokens();
  const d = DIM[size];
  const thumb = d.h - d.pad * 2;
  const travel = d.w - d.pad * 2 - thumb;

  // `committed` = authoritative value; `shown` = where the thumb sits (may be provisional).
  const [committed, setCommitted] = useControllable(checkedProp, defaultChecked);
  const [shown, setShown] = useState(committed);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pressed, setPressed] = useState(false);
  const request = useRef(0);
  const pointerHandled = useRef(false);

  // An authoritative update from outside wins over any in-flight request.
  useEffect(() => {
    request.current++;
    setPending(false);
    setShown(committed);
  }, [committed]);

  const x = useMotionValue(shown ? travel : 0);
  const width = useMotionValue(thumb);
  const nudge = useMotionValue(0);
  const progress = useTransform(x, [0, travel], [0, 1]);
  const ioOn = useTransform(progress, [0.4, 1], [0, 1]);
  const ioOff = useTransform(progress, [0, 0.6], [1, 0]);
  // Thumb grows away from the end it rests against (anticipation stays inside the track).
  const thumbX = useTransform(() => {
    const xv = x.get();
    return xv - (width.get() - thumb) * (travel ? xv / travel : 0) + nudge.get();
  });

  // Seat the thumb whenever the shown state changes — latch spring, the only overshoot.
  useEffect(() => {
    const ctrl = animate(x, shown ? travel : 0, m.move(spring.latch));
    return () => ctrl.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, travel, m.reduced]);

  useEffect(() => {
    const ctrl = animate(width, pressed && !disabled ? thumb + d.squish : thumb, m.move(spring.control));
    return () => ctrl.stop();
  }, [pressed, disabled, thumb, d.squish, width, m]);

  const commit = async (next: boolean) => {
    if (disabled || pending) return;
    const req = ++request.current;
    setFailed(false);
    setShown(next);
    play(next ? "latch" : "unlatch");
    let result: void | Promise<unknown> | undefined;
    try {
      result = onCheckedChange?.(next);
    } catch (err) {
      result = Promise.reject(err);
    }
    if (!result || typeof (result as Promise<unknown>).then !== "function") {
      setCommitted(next);
      return;
    }
    setPending(true);
    try {
      await result;
      if (req !== request.current) return; // superseded
      setPending(false);
      setCommitted(next);
    } catch {
      if (req !== request.current) return;
      setPending(false);
      setShown(!next);
      setFailed(true);
      // A short rollback nudge on the thumb — felt, not theatrical.
      // Felt after the thumb has returned, so it isn't lost inside the larger travel.
      if (!m.reduced) animate(nudge, [0, next ? 2 : -2, 0], { duration: 0.18, ease: "easeOut", delay: 0.2 });
      play("error", { velocity: 0.45 });
    }
  };

  // Pointer: tap or drag the thumb along the track.
  const drag = useRef<{ startX: number; startThumb: number; moved: boolean } | null>(null);
  // Not a commit — no latch overshoot on the way back.
  const settleBack = () => animate(x, shown ? travel : 0, m.move(spring.control));
  const endDrag = (commitIt: boolean) => {
    const s = drag.current;
    drag.current = null;
    setPressed(false);
    if (!s) return;
    pointerHandled.current = true;
    window.setTimeout(() => (pointerHandled.current = false), 0);
    if (!commitIt) return void settleBack();
    const next = s.moved ? x.get() > travel / 2 : !shown;
    if (next === shown) settleBack();
    else void commit(next);
  };

  const status = pending ? pendingMessage : failed ? errorMessage : null;
  const describedBy = [description ? descId : null, status ? statusId : null].filter(Boolean).join(" ") || undefined;

  const sw = (
    <motion.button
      type="button"
      role="switch"
      id={id}
      aria-checked={shown}
      aria-busy={pending || undefined}
      aria-invalid={failed || undefined}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={describedBy}
      disabled={disabled}
      onPointerDown={(e) => {
        if (disabled || pending || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.clientX, startThumb: x.get(), moved: false };
        setPressed(true);
      }}
      onPointerMove={(e) => {
        const s = drag.current;
        if (!s) return;
        const dx = e.clientX - s.startX;
        if (Math.abs(dx) > 3) s.moved = true;
        if (s.moved) x.set(Math.max(0, Math.min(travel, s.startThumb + dx)));
      }}
      onPointerUp={() => endDrag(true)}
      onPointerCancel={() => endDrag(false)}
      onLostPointerCapture={() => drag.current && endDrag(false)}
      onKeyDown={(e) => {
        if (e.key === " " && !e.repeat) setPressed(true);
      }}
      onKeyUp={(e) => {
        if (e.key === " ") setPressed(false);
      }}
      onBlur={() => setPressed(false)}
      onClick={(e) => {
        // Pointer presses on the switch commit on pointerup (supports drag).
        // Everything else — keyboard, assistive tech, clicks on the <label> — commits here.
        if (pointerHandled.current) return;
        void commit(!shown);
      }}
      data-state={shown ? "on" : "off"}
      data-pending={pending || undefined}
      className={cn(
        "focus-ring relative shrink-0 touch-none select-none rounded-sm outline-none",
        // 24px minimum hit target without changing the visual size
        "before:absolute before:-inset-x-1 before:top-1/2 before:h-6 before:min-h-full before:-translate-y-1/2 before:content-['']",
        "transition-[background-color,box-shadow] duration-[120ms] ease-out",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
        pending
          ? "bg-pencil-soft shadow-[inset_0_0_0_1px_var(--bis-pencil-line)]"
          : shown
            ? "bg-track-on shadow-[inset_0_0_0_1px_var(--bis-track-on)]"
            : "bg-sunken shadow-[inset_0_0_0_1px_var(--bis-edge),var(--bis-press)]",
      )}
      style={{ width: d.w, height: d.h }}
    >
      {/* I / O glyphs — state legible without colour */}
      <motion.span
        aria-hidden
        style={{ opacity: ioOn, left: d.pad + thumb / 2 - 0.75, height: d.io + 1 }}
        className={cn("absolute top-1/2 w-[1.5px] -translate-y-1/2 rounded-full", pending ? "bg-pencil" : "bg-on-ink")}
      />
      <motion.span
        aria-hidden
        style={{ opacity: ioOff, left: d.w - d.pad - thumb / 2 - d.io / 2, width: d.io, height: d.io }}
        className={cn("absolute top-1/2 -translate-y-1/2 rounded-full", pending ? "shadow-[inset_0_0_0_1.25px_var(--bis-pencil)]" : "shadow-[inset_0_0_0_1.25px_var(--bis-muted)]")}
      />
      <motion.span
        aria-hidden
        style={{ x: thumbX, width, height: thumb, top: d.pad, left: d.pad }}
        className={cn("absolute rounded-[3px] transition-colors duration-[120ms]", shown && !pending ? "bg-thumb-on" : "bg-thumb", "shadow-[0_0_0_0.5px_var(--bis-thumb-edge),0_1px_2px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.14)]")}
      >
        <span className="absolute inset-0 flex items-center justify-center gap-[2px]">
          <span className={cn("h-[40%] w-px rounded-full transition-colors duration-[120ms]", pending ? "bg-pencil" : "bg-edge/50")} />
          <span className={cn("h-[40%] w-px rounded-full transition-colors duration-[120ms]", pending ? "bg-pencil" : "bg-edge/50")} />
        </span>
      </motion.span>
      {/* Native-checkbox semantics: only submitted when on and enabled */}
      {name && committed && !disabled && <input type="hidden" name={name} value={value} />}
    </motion.button>
  );

  const statusEl = (
    <span
      id={statusId}
      role="status"
      className={cn("font-mono text-2xs transition-opacity duration-[120ms]", pending ? "text-pencil-ink" : "text-err", status ? "opacity-100" : "opacity-0")}
    >
      {status}
    </span>
  );

  if (!label) {
    return (
      <span className={cn("inline-flex items-center", className)}>
        {sw}
        {description && <VisuallyHidden><span id={descId}>{description}</span></VisuallyHidden>}
        <VisuallyHidden>{statusEl}</VisuallyHidden>
      </span>
    );
  }

  return (
    <div className={cn("flex items-start gap-3", labelPosition === "start" ? "justify-between" : "flex-row-reverse justify-end", className)}>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <label htmlFor={id} className={cn("text-base text-ink", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
            {label}
          </label>
          {/* Inline status: no layout shift */}
          {statusEl}
        </div>
        {description && (
          <p id={descId} className="mt-0.5 text-sm text-muted">
            {description}
          </p>
        )}
      </div>
      <span className="pt-px">{sw}</span>
    </div>
  );
}
