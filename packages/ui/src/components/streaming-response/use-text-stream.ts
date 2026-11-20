"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type TextStreamSource =
  | ReadableStream<Uint8Array | string>
  | AsyncIterable<string | Uint8Array>
  | Response;

/**
 * What `useTextStream` accepts: a stream, an async iterable, a `Response`, a promise of
 * any of those, or a factory `(signal) => …` (needed for `restart()` — a stream can only be read once).
 */
export type TextStreamInput =
  | TextStreamSource
  | Promise<TextStreamSource>
  | ((signal: AbortSignal) => TextStreamSource | Promise<TextStreamSource>)
  | null
  | undefined;

export type TextStreamStatus = "idle" | "streaming" | "done" | "stopped" | "error";

export interface TextStream {
  /** Everything received so far. */
  text: string;
  status: TextStreamStatus;
  error?: unknown;
  /** Number of chunks received from the source. */
  chunks: number;
  /** Bytes (UTF-8) received so far. */
  bytes: number;
  /** Abort the source and keep the partial text (`status` → "stopped"). */
  stop: () => void;
  /** Read again from the start. Pass a factory (or a fresh source each render) — a consumed stream can't be re-read. */
  restart: () => void;
}

export interface UseTextStreamOptions {
  /** Start reading on mount / when the source changes. Default true. */
  autoStart?: boolean;
  /**
   * Changing this re-reads the source. Source *identity* is ignored (so an inline
   * `useTextStream(fetch(url))` or `useTextStream(gen())` is read once, not on every render);
   * use `key` to switch to a different stream.
   */
  key?: unknown;
  /** Called once the stream ends naturally. */
  onDone?: (text: string) => void;
}

async function* iterate(src: TextStreamSource, signal: AbortSignal): AsyncGenerator<string> {
  if (typeof Response !== "undefined" && src instanceof Response) {
    if (!src.ok) throw new Error(`HTTP ${src.status}`);
    if (!src.body) {
      yield await src.text();
      return;
    }
    yield* iterate(src.body as ReadableStream<Uint8Array>, signal);
    return;
  }
  const decoder = new TextDecoder();
  const decode = (v: string | Uint8Array) => (typeof v === "string" ? v : decoder.decode(v, { stream: true }));
  if (typeof (src as ReadableStream).getReader === "function") {
    const reader = (src as ReadableStream<Uint8Array | string>).getReader();
    const onAbort = () => reader.cancel().catch(() => {});
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done || signal.aborted) break;
        const s = decode(value);
        if (s) yield s;
      }
      const rest = decoder.decode();
      if (rest && !signal.aborted) yield rest;
    } finally {
      signal.removeEventListener("abort", onAbort);
      reader.releaseLock?.();
    }
    return;
  }
  const it = (src as AsyncIterable<string | Uint8Array>)[Symbol.asyncIterator]();
  try {
    while (!signal.aborted) {
      const { value, done } = await it.next();
      if (done || signal.aborted) break;
      const s = decode(value);
      if (s) yield s;
    }
  } finally {
    if (signal.aborted) await it.return?.();
  }
}

const utf8 = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3;
  }
  return n;
};

/**
 * Read real streamed text into React state. Updates are batched to one render per
 * animation frame, so a fast stream never renders per token.
 */
export function useTextStream(input: TextStreamInput, { autoStart = true, key, onDone }: UseTextStreamOptions = {}): TextStream {
  const [state, setState] = useState<{ text: string; status: TextStreamStatus; error?: unknown; chunks: number; bytes: number }>({
    text: "",
    status: "idle",
    chunks: 0,
    bytes: 0,
  });
  const inputRef = useRef(input);
  inputRef.current = input;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const ctrl = useRef<AbortController | null>(null);
  const buf = useRef({ text: "", chunks: 0, bytes: 0 });
  const [run, setRun] = useState(0);
  // Read once per presence / `key` / restart(). Identity is deliberately ignored: callers commonly
  // create the source inline, and re-reading on every new object would restart forever.
  const identity = input == null ? null : typeof input === "function" ? "factory" : "source";

  useEffect(() => {
    const src = inputRef.current;
    if (!src || (run === 0 && !autoStart)) return;
    const ac = new AbortController();
    ctrl.current = ac;
    buf.current = { text: "", chunks: 0, bytes: 0 };
    let raf = 0;
    setState({ text: "", status: "streaming", chunks: 0, bytes: 0 });
    const flush = () => {
      raf = 0;
      const b = buf.current;
      setState((s) => (s.status === "streaming" ? { ...s, text: b.text, chunks: b.chunks, bytes: b.bytes } : s));
    };
    (async () => {
      try {
        const resolved = typeof src === "function" ? await src(ac.signal) : await src;
        for await (const piece of iterate(resolved, ac.signal)) {
          if (ac.signal.aborted) return;
          const b = buf.current;
          b.text += piece;
          b.chunks++;
          b.bytes += utf8(piece);
          if (!raf) raf = requestAnimationFrame(flush);
        }
        if (ac.signal.aborted) return;
        cancelAnimationFrame(raf);
        const b = buf.current;
        setState({ text: b.text, status: "done", chunks: b.chunks, bytes: b.bytes });
        onDoneRef.current?.(b.text);
      } catch (error) {
        if (ac.signal.aborted) return;
        cancelAnimationFrame(raf);
        const b = buf.current;
        setState({ text: b.text, status: "error", error, chunks: b.chunks, bytes: b.bytes });
      }
    })();
    return () => {
      ac.abort();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, key, run]);

  const stop = useCallback(() => {
    const ac = ctrl.current;
    if (!ac || ac.signal.aborted) return;
    ac.abort();
    const b = buf.current;
    setState((s) => (s.status === "streaming" ? { text: b.text, status: "stopped", chunks: b.chunks, bytes: b.bytes } : s));
  }, []);
  const restart = useCallback(() => setRun((r) => r + 1), []);

  return { ...state, stop, restart };
}
