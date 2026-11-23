"use client";
import { createContext, createElement, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { sound, type PlayOptions, type SoundName } from "./engine";

/** Subscribe to sound preferences (for settings UI). */
export function useSoundPrefs() {
  const prefs = useSyncExternalStore(sound.subscribe, sound.getPrefs, sound.getServerPrefs);
  return {
    ...prefs,
    enable: () => sound.enable(),
    disable: () => sound.disable(),
    toggle: () => sound.toggle(),
    setVolume: (v: number) => sound.setVolume(v),
    setDisabledPermanently: (on: boolean) => sound.setDisabledPermanently(on),
  };
}

const MuteContext = createContext(false);

/** Silence every Biscotti UI component inside this subtree (e.g. a host app's own sound system). */
export function SoundScope({ muted, children }: { muted: boolean; children: ReactNode }) {
  return createElement(MuteContext.Provider, { value: muted }, children);
}

/**
 * Returns a stable `play(name)` for user-initiated events only.
 * Components accept a `sound?: boolean` prop and pass it here.
 */
export function usePlay(enabled = true) {
  const scopeMuted = useContext(MuteContext);
  return useCallback(
    (name: SoundName, opts?: PlayOptions) => {
      if (!enabled || scopeMuted) return;
      sound.play(name, opts);
    },
    [enabled, scopeMuted],
  );
}

export { sound };
export type { SoundName, PlayOptions };
