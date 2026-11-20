"use client";
import { useCallback, useRef, useState } from "react";

/**
 * Controlled/uncontrolled state helper.
 * If `value` is defined the component is controlled; otherwise it owns state.
 */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [inner, setInner] = useState<T>(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? (value as T) : inner;
  const ref = useRef(current);
  ref.current = current;
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(ref.current) : next;
      if (Object.is(resolved, ref.current)) return;
      if (!controlled) setInner(resolved);
      onChange?.(resolved);
    },
    [controlled, onChange],
  );
  return [current, set];
}

