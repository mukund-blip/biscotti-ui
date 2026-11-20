import type { ReactNode } from "react";

export type ToastType = "default" | "success" | "error" | "warning" | "info" | "progress";
export type ToastDismissReason = "timeout" | "close" | "swipe" | "escape" | "undo" | "programmatic";

export interface ToastUndo {
  /** Reverse the action. Called when Undo (or ⌘Z) is pressed before the countdown ends. */
  onUndo: () => void;
  /** Called when the countdown ends without an undo: the action is now final. */
  onCommit?: () => void;
  /** Button label. Default "Undo". */
  label?: string;
  /** What the toast says after undoing. Default "Undone". */
  doneTitle?: ReactNode;
}

export interface ToastOptions {
  /** Reuse an id to replace an existing toast in place. */
  id?: string;
  description?: ReactNode;
  /** ms before auto-dismiss. `Infinity` keeps it until dismissed. Defaults depend on type. */
  duration?: number;
  /** 0–1 for a determinate progress bar; omit for a spinner. Only for `progress`. */
  progress?: number;
  /** One secondary action button. */
  action?: { label: string; onClick: () => void };
  /** Undoable action: draws a pencil countdown along the bottom edge. */
  undo?: ToastUndo;
  /** Show a close button and allow swipe/Escape. Default true. */
  dismissible?: boolean;
  /** Replace the type icon. */
  icon?: ReactNode;
  /** Target a specific <Toaster id>. Default "default". */
  toaster?: string;
  /** No sound for this toast (use for background updates the user didn't cause). */
  silent?: boolean;
  onDismiss?: (reason: ToastDismissReason) => void;
}

export interface ToastRecord extends Omit<ToastOptions, "id"> {
  id: string;
  type: ToastType;
  title: ReactNode;
  duration: number;
  /** Bumped whenever the timer should restart (type change, explicit duration). */
  timerKey: number;
  createdAt: number;
}

export type ToastPatch = Partial<Omit<ToastRecord, "id" | "timerKey" | "createdAt">>;

const DEFAULT_DURATION: Record<ToastType, number> = {
  default: 4000,
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 7000,
  progress: Infinity,
};

let toasts: ToastRecord[] = [];
const listeners = new Set<() => void>();
let counter = 0;
const emit = () => listeners.forEach((l) => l());

export const toastStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => toasts,
  getServerSnapshot: (): ToastRecord[] => EMPTY,
};
const EMPTY: ToastRecord[] = [];

function create(type: ToastType, title: ReactNode, opts: ToastOptions = {}): string {
  const { id: given, ...rest } = opts;
  const id = given ?? `t${++counter}`;
  const existing = toasts.find((t) => t.id === id);
  const duration = opts.duration ?? (opts.undo ? 6000 : DEFAULT_DURATION[type]);
  if (existing) {
    update(id, { ...rest, type, title, duration });
    return id;
  }
  toasts = [...toasts, { dismissible: true, ...rest, id, type, title, duration, timerKey: 0, createdAt: Date.now() }];
  emit();
  return id;
}

function update(id: string, patch: ToastPatch) {
  let changed = false;
  toasts = toasts.map((t) => {
    if (t.id !== id) return t;
    changed = true;
    const typeChanged = patch.type != null && patch.type !== t.type;
    const duration = patch.duration ?? (typeChanged ? (patch.undo ?? t.undo ? 6000 : DEFAULT_DURATION[patch.type!]) : t.duration);
    const restart = typeChanged || patch.duration != null;
    return { ...t, ...patch, duration, timerKey: restart ? t.timerKey + 1 : t.timerKey };
  });
  if (changed) emit();
}

function dismiss(id?: string, reason: ToastDismissReason = "programmatic") {
  const gone = id == null ? toasts : toasts.filter((t) => t.id === id);
  if (!gone.length) return;
  toasts = id == null ? [] : toasts.filter((t) => t.id !== id);
  emit();
  gone.forEach((t) => t.onDismiss?.(reason));
}

type Msg = ReactNode;
type PromiseMsgs<T> = {
  loading: Msg;
  success: Msg | ((value: T) => Msg);
  error: Msg | ((err: unknown) => Msg);
  description?: ReactNode;
};

/**
 * Show a toast. Returns its id.
 * `toast("Saved")`, `toast.success(…)`, `toast.progress(…)`, `toast.promise(p, {…})`.
 */
export const toast = Object.assign((title: ReactNode, opts?: ToastOptions) => create("default", title, opts), {
  success: (title: ReactNode, opts?: ToastOptions) => create("success", title, opts),
  error: (title: ReactNode, opts?: ToastOptions) => create("error", title, opts),
  warning: (title: ReactNode, opts?: ToastOptions) => create("warning", title, opts),
  info: (title: ReactNode, opts?: ToastOptions) => create("info", title, opts),
  /** Updates in place via `toast.update(id, { progress })`; finish with `{ type: "success" }`. */
  progress: (title: ReactNode, opts?: ToastOptions) => create("progress", title, opts),
  /** loading → success/error, in one toast. Returns the original promise. */
  promise<T>(promise: Promise<T> | (() => Promise<T>), msgs: PromiseMsgs<T>, opts?: ToastOptions): Promise<T> {
    const p = typeof promise === "function" ? promise() : promise;
    const id = create("progress", msgs.loading, { ...opts, description: msgs.description });
    p.then(
      (v) => update(id, { type: "success", title: typeof msgs.success === "function" ? (msgs.success as (v: T) => Msg)(v) : msgs.success, progress: undefined, description: undefined }),
      (e) => update(id, { type: "error", title: typeof msgs.error === "function" ? (msgs.error as (e: unknown) => Msg)(e) : msgs.error, progress: undefined, description: undefined }),
    );
    return p;
  },
  update,
  /** Dismiss one toast, or all when called without an id. */
  dismiss: (id?: string) => dismiss(id, "programmatic"),
});

/** @internal used by the Toaster for user-initiated dismissals. */
export const _dismiss = dismiss;
