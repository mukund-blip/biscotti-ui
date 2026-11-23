/**
 * Shared by the paced browser demo and the scripted replay,
 * so both demos stream exactly the same answer with the same token timing.
 */
import type { StreamingSource } from "@biscotti/ui";

export const scoutQuestion = "We're short on encoders for the OS-1 restock. Which supplier should we order from?";

export const scoutAnswer = `Short answer: **order the PEC11R from Digi-Key this week** and plan around a nine-week lead time. It's the only option that keeps the March pre-order date without changing the firmware's click table twice.[1]

Here's how the three quotes compare:

| Supplier | Part | Lead time | Unit price |
|---|---|---:|---:|
| Digi-Key | PEC11R-4220F | 9 wk | $1.84 |
| Mouser | PEC11R-4220F | 12 wk | $1.79 |
| LCSC | EC11E clone | 4 wk | $0.62 |

What to do next:

1. Place the Digi-Key order for **1,200 units**, enough for the first two production runs.[2]
2. Ask Ines to merge the debounce patch: the PEC11R has *24 clicks* per turn, not 20.
3. Keep the LCSC parts as a fallback only. Beta testers flagged a gritty feel on the clone.[3]

The firmware change is small:

\`\`\`ts
// firmware/src/input/encoder.ts
export const CLICKS_PER_TURN = 24;
const raw = debounce(adc.read(pin), 2);
\`\`\`

If Digi-Key slips past week 10, move first shipments to \`14 April\` and tell retailers by Friday.`;

export const scoutSources: StreamingSource[] = [
  { n: 1, title: "PEC11R-4220F-S0024 — stock and lead time", domain: "digikey.com", url: "https://www.digikey.com/", quote: "Factory lead time 9 weeks. Non-cancellable and non-returnable once scheduled." },
  { n: 2, title: "OS-1 production plan, Q1", domain: "ops.ostra.studio", quote: "Run A: 600 units, mid-March. Run B: 600 units, early April. Same encoder BOM for both." },
  { n: 3, title: "Beta forum — “Encoder feel on the B4 units”", domain: "forum.ostra.studio", quote: "The clone encoders feel gritty past the third click. Not a dealbreaker, but you notice it on long sweeps." },
];

export const scoutSuggestions = ["Draft the Digi-Key PO", "What if Digi-Key slips?", "Summarise for Mara"];

/** Deterministic PRNG so every replay and every demo run has the same rhythm. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StreamStep {
  /** Text emitted by this chunk. */
  text: string;
  /** Wait before emitting it (ms). */
  delay: number;
}

/**
 * Split an answer into model-like chunks: 1–3 tokens each, 18–70 ms apart, with
 * longer pauses at paragraph breaks and a "thinking" pause before code.
 */
export function streamPlan(text: string, seed = 7): StreamStep[] {
  const rand = mulberry32(seed);
  const tokens = text.match(/\s+|[A-Za-z]+|\d+|[^\sA-Za-z\d]/g) ?? [];
  const steps: StreamStep[] = [];
  let i = 0;
  let first = true;
  while (i < tokens.length) {
    const n = 1 + Math.floor(rand() * 3);
    let chunk = "";
    for (let k = 0; k < n && i < tokens.length; k++) chunk += tokens[i++];
    // Keep whitespace attached to the following word, like a real tokenizer.
    while (i < tokens.length && /^\s+$/.test(tokens[i]) && !tokens[i].includes("\n")) chunk += tokens[i++];
    let delay = first ? 420 : 18 + rand() * 52;
    if (/\n\n$/.test(steps.at(-1)?.text ?? "")) delay += 140;
    if (chunk.startsWith("```") || chunk.startsWith("\n```")) delay += 320;
    if (/[.:]\s*$/.test(steps.at(-1)?.text ?? "")) delay += 60;
    steps.push({ text: chunk, delay: Math.round(delay) });
    first = false;
  }
  return steps;
}

/** Cumulative timeline for scripted replays: [atMs, endOffset]. */
export function streamTimeline(text: string, seed = 7) {
  let t = 0;
  let end = 0;
  return streamPlan(text, seed).map((s) => {
    t += s.delay;
    end += s.text.length;
    return { at: t, end };
  });
}


/** Wait without leaving a timer or abort listener behind after Stop or unmount. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/**
 * A canned answer paced in the browser, not a model or network request.
 * Each factory call creates a fresh iterable for Retry/Regenerate. Stop interrupts
 * the current delay and keeps the partial answer through useTextStream.
 */
export async function* demoTextStream(signal: AbortSignal, { speed = 1, fail = false }: { speed?: number; fail?: boolean } = {}): AsyncGenerator<string> {
  const rate = Number.isFinite(speed) ? Math.min(4, Math.max(0.25, speed)) : 1;
  const plan = streamPlan(scoutAnswer);
  for (let i = 0; i < plan.length; i++) {
    await pause(plan[i].delay / rate, signal);
    if (signal.aborted) return;
    if (fail && i === Math.floor(plan.length * 0.55)) throw new Error("Simulated stream interruption");
    yield plan[i].text;
  }
}
