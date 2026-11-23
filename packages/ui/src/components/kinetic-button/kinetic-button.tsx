"use client";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { Icon, type IconName } from "../../icons";
import { VisuallyHidden } from "../../lib/primitives";
import { cn } from "../../lib/utils";
import { ease, spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type KineticButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type KineticButtonSize = "sm" | "md" | "lg";
export type KineticButtonState = "idle" | "pending" | "success" | "error";

const SIZE: Record<KineticButtonSize, { h: number; px: number; gap: number; icon: number; text: string }> = {
  sm: { h: 28, px: 10, gap: 6, icon: 14, text: "text-xs" },
  md: { h: 32, px: 12, gap: 6, icon: 14, text: "text-sm" },
  lg: { h: 40, px: 16, gap: 8, icon: 16, text: "text-base" },
};

/* Surface tone per variant. Hover is instant in, 90 ms out (`hover:duration-0`). */
const SURFACE: Record<KineticButtonVariant, string> = {
  primary: "bg-ink text-on-ink shadow-1 hover:bg-ink/86",
  secondary: "bg-raised text-ink shadow-1 hover:bg-surface",
  quiet: "bg-transparent text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-err-soft text-err hover:bg-err/14",
};
/* The skin is an inner layer that carries edges + the press inset, so the
 * button's own box-shadow stays free for the focus ring. */
const SKIN: Record<KineticButtonVariant, string> = {
  primary: "shadow-[inset_0_1px_0_rgb(255_255_255/0.12),inset_0_0_0_1px_var(--bis-ink)]",
  secondary: "shadow-[inset_0_0_0_1px_var(--bis-rule),inset_0_-1px_0_var(--bis-edge)]",
  quiet: "",
  danger: "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--bis-err)_34%,transparent)]",
};

const isPromise = (v: unknown): v is Promise<unknown> => !!v && typeof (v as Promise<unknown>).then === "function";

/* ── Group context ────────────────────────────────────────── */

interface GroupCtx {
  variant?: KineticButtonVariant;
  size?: KineticButtonSize;
}
const KineticGroupContext = createContext<GroupCtx | null>(null);

export interface KineticButtonGroupProps {
  /** KineticButtons to attach. */
  children: ReactNode;
  /** Default variant for every button in the group (each button can override). */
  variant?: KineticButtonVariant;
  /** Default size for every button in the group. */
  size?: KineticButtonSize;
  /** Accessible name for the group. */
  "aria-label"?: string;
  className?: string;
}

/** Attached, segmented-style row of KineticButtons sharing one outline. */
export function KineticButtonGroup({ children, variant = "secondary", size, className, "aria-label": ariaLabel }: KineticButtonGroupProps) {
  return (
    <KineticGroupContext.Provider value={{ variant, size }}>
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-stretch rounded-sm",
          variant !== "quiet" && "shadow-1",
          // inner corners square off; neighbours overlap by a hairline so edges never double
          "[&>*:not(:first-child)>button]:rounded-l-none [&>*:not(:last-child)>button]:rounded-r-none",
          "[&>*:not(:first-child)]:-ml-px [&>*>button]:shadow-none [&>*>button:focus-visible]:shadow-[var(--bis-focus)] [&>*>button:focus-visible]:z-10",
          className,
        )}
      >
        {children}
      </div>
    </KineticGroupContext.Provider>
  );
}

/* ── Button ───────────────────────────────────────────────── */

export interface KineticButtonProps extends Omit<ComponentPropsWithRef<"button">, "onClick" | "children" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration" | "style"> {
  /** Inline style for the button element. */
  style?: CSSProperties;
  /** Visible label. Omit for an icon-only button (then pass `aria-label`). */
  children?: ReactNode;
  /** primary = ink · secondary = edge outline on raised · quiet = no surface · danger = err tint. */
  variant?: KineticButtonVariant;
  /** 28, 32 or 40 px tall. */
  size?: KineticButtonSize;
  /** Leading icon — an icon name or any node. Replaced by the spinner/check while busy. */
  icon?: IconName | ReactNode;
  /**
   * Called on activation (click, or hold completion). Return a Promise to run the
   * async lifecycle automatically: pending → success | error.
   */
  onClick?: (event: SyntheticEvent<HTMLButtonElement>) => void | Promise<unknown>;
  /** Controlled lifecycle state. Omit to let the button manage it from `onClick`'s Promise. */
  state?: KineticButtonState;
  /** Fires whenever the lifecycle state changes (including the automatic success → idle revert). */
  onStateChange?: (state: KineticButtonState) => void;
  /** Present-progressive label while pending, e.g. "Exporting". */
  pendingLabel?: ReactNode;
  /** Past-tense label after success, e.g. "Exported". */
  successLabel?: ReactNode;
  /** Label after failure, e.g. "Retry export". Clicking again retries. */
  errorLabel?: ReactNode;
  /** How long the success state holds before reverting, in ms. */
  successDuration?: number;
  /**
   * Require a press-and-hold of this many ms before the action runs (destructive actions).
   * Fills in pencil, ticks at quarter notches, drains back if released early.
   */
  holdToConfirm?: number;
  /** Allow this instance to play sounds. */
  sound?: boolean;
}

export function KineticButton({
  children,
  variant: variantProp,
  size: sizeProp,
  icon,
  onClick,
  state: stateProp,
  onStateChange,
  pendingLabel,
  successLabel,
  errorLabel = "Retry",
  successDuration = 1600,
  holdToConfirm,
  sound: soundOn = true,
  disabled = false,
  className,
  type = "button",
  "aria-label": ariaLabel,
  onPointerDown,
  onPointerUp,
  onKeyDown,
  onKeyUp,
  onBlur,
  style,
  ...rest
}: KineticButtonProps) {
  const group = useContext(KineticGroupContext);
  const variant = variantProp ?? group?.variant ?? "primary";
  const size = sizeProp ?? group?.size ?? "md";
  const d = SIZE[size];
  const m = useMotionTokens();
  const play = usePlay(soundOn);

  /* lifecycle */
  const [inner, setInner] = useState<KineticButtonState>("idle");
  const state = stateProp ?? inner;
  const setState = (s: KineticButtonState) => {
    if (stateProp === undefined) setInner(s);
    onStateChange?.(s);
  };
  const setStateRef = useRef(setState);
  setStateRef.current = setState;
  const request = useRef(0);
  const busy = state === "pending";

  useEffect(() => {
    if (state !== "success") return;
    const t = window.setTimeout(() => setStateRef.current("idle"), successDuration);
    return () => window.clearTimeout(t);
  }, [state, successDuration]);

  /* motion values */
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const width = useMotionValue(0);
  const [measured, setMeasured] = useState(false);
  const [pressed, setPressed] = useState(false);

  const press = () => {
    if (disabled) return;
    setPressed(true);
    // Instant on the input frame — no easing in.
    y.jump(1);
    scale.jump(group ? 1 : 0.985);
  };
  const release = () => {
    setPressed(false);
    animate(y, 0, m.move(spring.control));
    animate(scale, 1, m.move(spring.control));
  };

  const nudge = () => {
    if (m.reduced) return;
    animate(x, [0, 2, -1.5, 0.5, 0], { duration: 0.26, ease: "easeOut" });
  };

  const run = async (event: SyntheticEvent<HTMLButtonElement>) => {
    if (disabled || busy) return;
    let result: void | Promise<unknown> | undefined;
    try {
      result = onClick?.(event);
    } catch (err) {
      result = Promise.reject(err);
    }
    if (!isPromise(result)) return;
    const req = ++request.current;
    setState("pending");
    try {
      await result;
      if (req !== request.current) return;
      setState("success");
      play("confirm", { velocity: 0.6 });
    } catch {
      if (req !== request.current) return;
      setState("error");
      play("error", { velocity: 0.5 });
      nudge();
    }
  };
  useEffect(() => () => void request.current++, []);

  /* ── hold to confirm ── */
  const progress = useMotionValue(0);
  const fillOpacity = useMotionValue(1);
  const holdCtrl = useRef<AnimationPlaybackControls | null>(null);
  const holding = useRef(false);
  const notch = useRef(0);
  const [holdActive, setHoldActive] = useState(false);
  const [latched, setLatched] = useState(false);
  // Reduced motion: the fill steps between quarter notches instead of sweeping.
  const shown = useTransform(progress, (p) => (m.reduced ? Math.floor(p * 4 + 1e-6) / 4 : p));
  const clipRight = useTransform(shown, (p) => `${(1 - p) * 100}%`);
  const clipPath = useMotionTemplate`inset(0 ${clipRight} 0 0)`;

  const startHold = () => {
    if (!holdToConfirm || disabled || busy || holding.current) return;
    holding.current = true;
    setHoldActive(true);
    setLatched(false);
    holdCtrl.current?.stop();
    fillOpacity.set(1);
    notch.current = Math.floor(progress.get() * 4 + 1e-6);
    const remaining = (1 - progress.get()) * holdToConfirm;
    holdCtrl.current = animate(progress, 1, {
      duration: remaining / 1000,
      ease: "linear",
      onUpdate: (p) => {
        const q = Math.floor(p * 4 + 1e-6);
        if (q > notch.current && q < 4) {
          notch.current = q;
          // Rising, slightly brighter with each quarter.
          play("tick", { pitch: 1 + q * 0.09, velocity: 0.4 + q * 0.12 });
        }
      },
      onComplete: () => {
        if (!holding.current) return;
        holding.current = false;
        setHoldActive(false);
        setLatched(true);
        play("latch");
        // Seat: a small compression released with the latch spring (the only overshoot).
        if (!m.reduced) {
          scale.jump(0.97);
          animate(scale, 1, spring.latch);
        }
        // Pencil drains away as the committed (ink) state takes over.
        animate(fillOpacity, 0, { ...m.fade(tween.drain), delay: m.reduced ? 0 : 0.06 }).then(() => {
          if (!holding.current) {
            progress.set(0);
            setLatched(false);
          }
        });
        void run(holdEvent.current!);
      },
    });
  };
  const holdEvent = useRef<SyntheticEvent<HTMLButtonElement> | null>(null);
  const cancelHold = () => {
    if (!holding.current) return;
    holding.current = false;
    setHoldActive(false);
    holdCtrl.current?.stop();
    const p = progress.get();
    // Drain back: quicker than it filled, proportional to how far it got.
    holdCtrl.current = animate(progress, 0, m.reduced ? { duration: 0 } : { duration: 0.12 + p * 0.22, ease: ease.out });
  };
  useEffect(() => () => holdCtrl.current?.stop(), []);

  /* ── width morph: measure an invisible copy of the next content ── */
  const sizer = useRef<HTMLSpanElement>(null);
  const firstMeasure = useRef(true);
  const label =
    state === "pending" ? pendingLabel ?? children : state === "success" ? successLabel ?? children : state === "error" ? errorLabel : children;
  const labelKey = `${state}:${typeof label === "string" || typeof label === "number" ? label : state}`;
  const iconKind: "icon" | "spinner" | "check" | "error" | null =
    state === "pending" ? "spinner" : state === "success" ? "check" : state === "error" ? "error" : icon ? "icon" : null;
  const hasLabel = label !== undefined && label !== null && label !== false && label !== "";

  useIsoLayoutEffect(() => {
    const el = sizer.current;
    if (!el) return;
    const w = el.offsetWidth;
    if (firstMeasure.current) {
      firstMeasure.current = false;
      width.set(w);
      setMeasured(true);
      return;
    }
    animate(width, w, m.move(spring.control));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelKey, iconKind, size]);
  useEffect(() => {
    const el = sizer.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Late font loads etc. — follow without animating.
    const ro = new ResizeObserver(() => {
      if (!width.isAnimating()) width.set(el.offsetWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  /* ── content ── */
  const iconNode = (kind: typeof iconKind) => {
    if (kind === "icon") return typeof icon === "string" ? <Icon name={icon as IconName} size={d.icon} /> : icon;
    if (kind === "spinner") return <ButtonSpinner size={d.icon} pencil={variant === "secondary" || variant === "quiet"} />;
    if (kind === "check") return <DrawnCheck size={d.icon} reduced={m.reduced} />;
    if (kind === "error") return <Icon name="refresh" size={d.icon} />;
    return null;
  };
  const textLabel = typeof label === "string" || typeof label === "number";
  const accessibleName = ariaLabel ?? (textLabel ? String(label) : undefined);

  /**
   * `glyph`: draw a string label with CSS `content` instead of a text node. Used by the hold-fill
   * duplicate layer so assistive tech (and audits) never read the label twice.
   */
  const contentStatic = (kind: typeof iconKind, lbl: ReactNode, glyph = false) => (
    <>
      {kind && (
        <span className="inline-flex shrink-0 items-center justify-center" style={{ width: d.icon, height: d.icon }}>
          {kind === "check" ? <Icon name="check" size={d.icon} /> : kind === "spinner" ? <ButtonSpinner size={d.icon} /> : iconNode(kind)}
        </span>
      )}
      {hasLabel &&
        (glyph && (typeof lbl === "string" || typeof lbl === "number") ? (
          <span data-label={lbl} className="whitespace-nowrap before:content-[attr(data-label)]" />
        ) : (
          <span className="whitespace-nowrap">{lbl}</span>
        ))}
    </>
  );

  const padX = hasLabel ? d.px : 0;
  const statusText =
    state === "pending" ? pendingLabel ?? "Working" : state === "success" ? successLabel ?? "Done" : state === "error" ? errorLabel : "";

  return (
    <span className={cn("relative inline-flex", className)}>
      <motion.button
        {...rest}
        type={type}
        disabled={disabled}
        aria-label={accessibleName}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        aria-invalid={state === "error" || undefined}
        aria-description={holdToConfirm ? "Press and hold to confirm" : undefined}
        data-variant={variant}
        data-state={state}
        data-pressed={pressed || undefined}
        style={{
          ...style,
          x,
          y,
          scale,
          height: d.h,
          minWidth: d.h,
          width: measured ? width : undefined,
          paddingInline: padX,
        }}
        className={cn(
          "focus-ring group/kb relative isolate inline-flex shrink-0 touch-none select-none items-center justify-center overflow-hidden rounded-sm font-medium outline-none",
          "transition-[background-color,color] duration-[90ms] ease-out hover:duration-0",
          d.text,
          SURFACE[variant],
          disabled ? "cursor-not-allowed opacity-45" : busy ? "cursor-progress" : "cursor-pointer",
        )}
        onPointerDown={(e: PointerEvent<HTMLButtonElement>) => {
          onPointerDown?.(e);
          if (disabled || e.button !== 0) return;
          press();
          if (holdToConfirm) {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            holdEvent.current = e;
            startHold();
          } else if (!busy) play("tap");
        }}
        onPointerUp={(e: PointerEvent<HTMLButtonElement>) => {
          onPointerUp?.(e);
          release();
          if (holdToConfirm) cancelHold();
        }}
        onPointerCancel={() => {
          release();
          cancelHold();
        }}
        onLostPointerCapture={() => {
          if (holding.current) {
            release();
            cancelHold();
          }
        }}
        onPointerLeave={() => !holdToConfirm && pressed && release()}
        onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
          onKeyDown?.(e);
          if ((e.key === " " || e.key === "Enter") && !e.repeat && !disabled) {
            if (holdToConfirm) {
              e.preventDefault();
              holdEvent.current = e;
              press();
              startHold();
            } else if (e.key === " ") {
              press();
              if (!busy) play("tap");
            } else if (!busy) {
              play("tap");
            }
          } else if (holdToConfirm && (e.key === " " || e.key === "Enter")) {
            e.preventDefault(); // swallow auto-repeat so it never clicks
          }
        }}
        onKeyUp={(e: KeyboardEvent<HTMLButtonElement>) => {
          onKeyUp?.(e);
          if (e.key === " " || e.key === "Enter") {
            if (holdToConfirm) e.preventDefault();
            if (pressed) release();
            if (holdToConfirm) cancelHold();
          }
        }}
        onBlur={(e) => {
          onBlur?.(e);
          if (pressed) release();
          cancelHold();
        }}
        onClick={(e) => {
          // Hold buttons only run on hold completion.
          if (holdToConfirm) return;
          void run(e);
        }}
      >
        {/* skin: edges + press inset, kept off the button's box-shadow (focus ring lives there) */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit]",
            SKIN[variant],
            state === "error" && "!shadow-[inset_0_0_0_1.5px_var(--bis-err)]",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] shadow-press",
            pressed ? "opacity-100" : "opacity-0 transition-opacity duration-[90ms]",
          )}
        />

        {/* attached-group divider for filled variants (outlined variants share an overlapped edge) */}
        {group && (variant === "primary" || variant === "danger") && (
          <span aria-hidden className="pointer-events-none absolute inset-y-[7px] left-0 w-px bg-current opacity-20 [:first-child>*>&]:hidden" />
        )}

        {/* quarter notches for hold buttons — non-text marks, quiet at rest */}
        {holdToConfirm && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px]">
            {[0.25, 0.5, 0.75].map((q) => (
              <span
                key={q}
                className={cn("absolute bottom-0 h-[3px] w-px bg-current transition-opacity duration-[120ms]", holdActive ? "opacity-45" : "opacity-20")}
                style={{ left: `${q * 100}%` }}
              />
            ))}
          </span>
        )}

        {/* visible content */}
        <span
          aria-hidden={accessibleName ? true : undefined}
          className="relative inline-flex shrink-0 items-center justify-center"
          style={{ gap: d.gap }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {iconKind && (
              <motion.span
                key={iconKind}
                className="inline-flex shrink-0 items-center justify-center"
                style={{ width: d.icon, height: d.icon }}
                initial={{ opacity: 0, scale: m.reduced ? 1 : 0.6 }}
                animate={{ opacity: 1, scale: 1, transition: { opacity: m.fade(), scale: m.move(spring.control) } }}
                exit={{ opacity: 0, scale: m.reduced ? 1 : 0.6, transition: m.fade({ duration: 0.09, ease: ease.in }) }}
              >
                {iconNode(iconKind)}
              </motion.span>
            )}
          </AnimatePresence>
          {hasLabel && (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={labelKey}
                className="whitespace-nowrap"
                initial={{ opacity: 0, y: m.reduced ? 0 : 5 }}
                animate={{ opacity: 1, y: 0, transition: { opacity: m.fade({ duration: 0.14, ease: ease.out, delay: 0.04 }), y: m.move(spring.control) } }}
                exit={{ opacity: 0, y: m.reduced ? 0 : -5, transition: m.fade({ duration: 0.09, ease: ease.in }) }}
              >
                {label}
              </motion.span>
            </AnimatePresence>
          )}
        </span>

        {/* hold fill: a pencil copy of the face, revealed left → right */}
        {holdToConfirm && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 inline-flex items-center justify-center rounded-[inherit] bg-pencil text-on-ink"
            style={{ clipPath, opacity: fillOpacity, gap: d.gap, paddingInline: padX }}
          >
            <span
              className={cn("inline-flex shrink-0 items-center justify-center", latched && "opacity-0 transition-opacity duration-[90ms]")}
              style={{ gap: d.gap }}
            >
              {contentStatic(iconKind === "spinner" || iconKind === "check" || iconKind === "error" ? null : iconKind, children, true)}
            </span>
            {[0.25, 0.5, 0.75].map((q) => (
              <span key={q} className="absolute bottom-0 h-[3px] w-px bg-current opacity-60" style={{ left: `${q * 100}%` }} />
            ))}
          </motion.span>
        )}

        {/* sizer: the width the button is heading to */}
        <span
          ref={sizer}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 inline-flex items-center whitespace-nowrap"
          style={{ gap: d.gap, paddingInline: padX, minWidth: d.h }}
        >
          {contentStatic(iconKind, label)}
        </span>
      </motion.button>
      <VisuallyHidden>
        <span role="status">{statusText}</span>
      </VisuallyHidden>
    </span>
  );
}

/* ── glyphs ───────────────────────────────────────────────── */

function ButtonSpinner({ size, pencil }: { size: number; pencil?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      className={cn("shrink-0 motion-safe:animate-[bis-spin_0.8s_linear_infinite]", pencil && "text-pencil")}
    >
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1.5" />
      <path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The check draws itself (stroke-dashoffset via pathLength). */
function DrawnCheck({ size, reduced }: { size: number; reduced: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
      <motion.path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.26, ease: ease.out, delay: 0.05 }}
      />
    </svg>
  );
}
