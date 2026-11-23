/**
 * Detent sound engine — every voice is synthesised with the Web Audio API.
 *
 *   voice envelopes → master gain (volume) → limiter → destination
 *
 * • Off by default. `enable()` must be called from a user gesture; it creates
 *   and resumes the AudioContext (browser autoplay policy).
 * • A global voice cap and per-voice rate limits prevent clutter/clipping.
 * • All pitched voices use A‑pentatonic so overlaps stay consonant.
 */

export type SoundName =
  | "tick"
  | "tap"
  | "latch"
  | "unlatch"
  | "select"
  | "confirm"
  | "complete"
  | "attention"
  | "error"
  | "dismiss"
  | "notify"
  | "open"
  | "close";

export interface PlayOptions {
  /** 0–1, scales loudness and filter brightness. Default 0.7. */
  velocity?: number;
  /** Pitch multiplier. Default 1. */
  pitch?: number;
  /** Stereo position −1…1. Default 0. */
  pan?: number;
}

export interface SoundPrefs {
  enabled: boolean;
  volume: number; // 0–1
  /** User chose "never play sounds" — enable() becomes a no-op until cleared. */
  disabledPermanently: boolean;
}

const STORAGE_KEY = "biscotti.sound.v1";
const DEFAULT_PREFS: SoundPrefs = { enabled: false, volume: 0.6, disabledPermanently: false };

// A‑pentatonic reference pitches
const N = { E4: 329.63, B3: 246.94, A4: 440, E5: 659.25, A5: 880, Cs6: 1108.73, E6: 1318.51, A6: 1760 };

const MIN_INTERVAL: Partial<Record<SoundName, number>> = {
  tick: 22,
  select: 40,
  tap: 45,
  latch: 60,
  unlatch: 60,
  confirm: 120,
  complete: 250,
  attention: 1200,
  error: 300,
  notify: 400,
  dismiss: 60,
  open: 120,
  close: 120,
};
const MAX_VOICES = 8;

type Listener = () => void;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private active = 0;
  private listeners = new Set<Listener>();
  private prefs: SoundPrefs = DEFAULT_PREFS;
  private hydrated = false;

  /* ── preferences ─────────────────────────────────────────── */

  private hydrate() {
    if (this.hydrated || typeof window === "undefined") return;
    this.hydrated = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(raw), enabled: false };
      // Never auto-enable on load: audio stays silent until a fresh gesture,
      // but we remember the user's last choice so the toggle can restore it.
      const remembered = raw ? JSON.parse(raw).enabled === true : false;
      this.rememberedOn = remembered && !this.prefs.disabledPermanently;
    } catch {
      /* storage unavailable */
    }
  }
  /** Whether the user had sound on last visit (UI may offer one-click restore). */
  rememberedOn = false;

  getPrefs = (): SoundPrefs => {
    this.hydrate();
    return this.prefs;
  };
  getServerPrefs = (): SoundPrefs => DEFAULT_PREFS;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private setPrefs(patch: Partial<SoundPrefs>) {
    this.hydrate();
    this.prefs = { ...this.prefs, ...patch };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.gainFor(this.prefs.volume), this.ctx.currentTime, 0.02);
    }
    this.listeners.forEach((l) => l());
  }

  /** Call from a user gesture (click/keydown). */
  enable() {
    this.hydrate();
    if (this.prefs.disabledPermanently) return;
    this.ensureContext();
    void this.ctx?.resume();
    this.setPrefs({ enabled: true });
  }
  disable() {
    this.setPrefs({ enabled: false });
  }
  toggle() {
    if (this.getPrefs().enabled) this.disable();
    else this.enable();
  }
  setVolume(v: number) {
    this.setPrefs({ volume: Math.min(1, Math.max(0, v)) });
  }
  setDisabledPermanently(on: boolean) {
    this.setPrefs({ disabledPermanently: on, enabled: on ? false : this.prefs.enabled });
  }

  /* ── audio graph ─────────────────────────────────────────── */

  private gainFor(volume: number) {
    // perceptual curve, with headroom: max ≈ −6 dBFS pre-limiter
    return Math.pow(volume, 2) * 0.5;
  }

  private ensureContext() {
    if (this.ctx || typeof window === "undefined") return;
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: "interactive" });
    const master = ctx.createGain();
    master.gain.value = this.gainFor(this.prefs.volume);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter).connect(ctx.destination);
    // 0.5 s of white noise, reused by every transient
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.noise = buf;
  }

  /* ── primitives ──────────────────────────────────────────── */

  private out(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!pan || !ctx.createStereoPanner) return this.master!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master!);
    return p;
  }

  private noiseBurst(
    t: number,
    o: { freq: number; q: number; decay: number; gain: number; attack?: number; type?: BiquadFilterType },
    dest: AudioNode,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass";
    f.frequency.value = o.freq;
    f.Q.value = o.q;
    const g = ctx.createGain();
    const a = o.attack ?? 0.001;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.4);
    src.stop(t + a + o.decay + 0.02);
    return t + a + o.decay;
  }

  private tone(
    t: number,
    o: { freq: number; to?: number; type?: OscillatorType; attack?: number; decay: number; gain: number; lowpass?: number },
    dest: AudioNode,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.decay);
    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.decay);
    let node: AudioNode = osc;
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = o.lowpass;
      osc.connect(lp);
      node = lp;
    }
    node.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + a + o.decay + 0.03);
    return t + a + o.decay;
  }

  /* ── voices ──────────────────────────────────────────────── */

  play(name: SoundName, opts: PlayOptions = {}) {
    const prefs = this.getPrefs();
    if (!prefs.enabled || prefs.disabledPermanently || prefs.volume <= 0) return;
    this.ensureContext();
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = performance.now();
    const min = MIN_INTERVAL[name] ?? 50;
    if (now - (this.last.get(name) ?? -Infinity) < min) return;
    if (this.active >= MAX_VOICES) return;
    this.last.set(name, now);

    const v = Math.min(1, Math.max(0.05, opts.velocity ?? 0.7));
    const p = opts.pitch ?? 1;
    const dest = this.out(opts.pan ?? 0);
    const t = ctx.currentTime + 0.003;
    const bright = 0.7 + v * 0.6; // velocity → filter brightness (±30 %)
    let end = t;

    switch (name) {
      case "tick":
        end = this.noiseBurst(t, { freq: 3200 * p * bright, q: 8, decay: 0.018, gain: 0.55 * v }, dest);
        break;
      case "tap":
        this.noiseBurst(t, { freq: 2100 * p * bright, q: 2.2, decay: 0.012, gain: 0.32 * v }, dest);
        end = this.tone(t, { freq: 190 * p, to: 110 * p, decay: 0.045, gain: 0.4 * v, attack: 0.002 }, dest);
        break;
      case "latch":
        this.noiseBurst(t, { freq: 1800 * p, q: 5, decay: 0.012, gain: 0.3 * v }, dest);
        this.noiseBurst(t + 0.026, { freq: 3400 * p * bright, q: 7, decay: 0.016, gain: 0.55 * v }, dest);
        end = this.tone(t + 0.026, { freq: N.E6 * p, decay: 0.06, gain: 0.045 * v, attack: 0.002 }, dest);
        break;
      case "unlatch":
        this.noiseBurst(t, { freq: 3000 * p, q: 6, decay: 0.012, gain: 0.3 * v }, dest);
        end = this.noiseBurst(t + 0.026, { freq: 1500 * p * bright, q: 5, decay: 0.02, gain: 0.48 * v }, dest);
        break;
      case "select":
        this.noiseBurst(t, { freq: 4200 * p * bright, q: 10, decay: 0.01, gain: 0.3 * v }, dest);
        end = this.tone(t, { freq: N.E6 * p, decay: 0.06, gain: 0.045 * v, attack: 0.002 }, dest);
        break;
      case "confirm":
        this.tone(t, { freq: N.A5 * p, type: "triangle", decay: 0.14, gain: 0.09 * v, lowpass: 4000 }, dest);
        this.tone(t, { freq: N.A5 * p, decay: 0.16, gain: 0.07 * v }, dest);
        end = this.tone(t + 0.035, { freq: N.E6 * p, decay: 0.18, gain: 0.07 * v }, dest);
        break;
      case "complete":
        this.tone(t, { freq: N.E5 * p, decay: 0.18, gain: 0.06 * v }, dest);
        this.tone(t + 0.06, { freq: N.A5 * p, decay: 0.2, gain: 0.06 * v }, dest);
        end = this.tone(t + 0.12, { freq: N.E6 * p, decay: 0.32, gain: 0.055 * v }, dest);
        break;
      case "attention":
        this.tone(t, { freq: N.E6 * p, decay: 0.16, gain: 0.08 * v }, dest);
        this.tone(t, { freq: N.E6 * 2 * p, decay: 0.05, gain: 0.012 * v }, dest);
        end = this.tone(t + 0.11, { freq: N.A5 * p, decay: 0.26, gain: 0.08 * v }, dest);
        break;
      case "error":
        this.noiseBurst(t, { freq: 900, q: 1.5, decay: 0.03, gain: 0.18 * v, type: "lowpass" }, dest);
        this.tone(t, { freq: N.E4 * p, type: "triangle", decay: 0.1, gain: 0.16 * v, lowpass: 900 }, dest);
        end = this.tone(t + 0.085, { freq: N.B3 * p, type: "triangle", decay: 0.18, gain: 0.16 * v, lowpass: 800 }, dest);
        break;
      case "dismiss":
        this.noiseBurst(t, { freq: 1600 * p, q: 3, decay: 0.02, gain: 0.24 * v }, dest);
        end = this.tone(t, { freq: 520 * p, to: 300 * p, decay: 0.05, gain: 0.05 * v }, dest);
        break;
      case "notify":
        this.tone(t, { freq: N.E6 * p, decay: 0.32, gain: 0.06 * v }, dest);
        end = this.tone(t, { freq: N.E6 * 2 * p, decay: 0.12, gain: 0.012 * v }, dest);
        break;
      case "open":
        end = this.noiseBurst(t, { freq: 5200 * p, q: 1.2, decay: 0.035, gain: 0.1 * v, attack: 0.008 }, dest);
        break;
      case "close":
        end = this.noiseBurst(t, { freq: 3600 * p, q: 1.2, decay: 0.03, gain: 0.08 * v, attack: 0.004 }, dest);
        break;
    }

    this.active++;
    window.setTimeout(() => {
      this.active = Math.max(0, this.active - 1);
    }, Math.max(30, (end - t) * 1000 + 30));
  }
}

/** Shared singleton — one AudioContext per page. */
export const sound = new SoundEngine();
