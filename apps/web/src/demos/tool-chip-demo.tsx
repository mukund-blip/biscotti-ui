"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ToolChip, ToolChipGroup, useMotionTokens, type ToolChipProps } from "@detent/ui";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

/* ── Scout fixing fast-turn detent skipping on the OS-1 encoder ── */

type Call = ToolChipProps & { id: string };
type S = { calls: Call[]; done: boolean };
const initial: S = { calls: [], done: false };

const add = (c: Call) => (s: S): S => ({ ...s, calls: [...s.calls, c] });
const set = (id: string, patch: Partial<Call>) => (s: S): S => ({ ...s, calls: s.calls.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
const append = (id: string, line: string) => (s: S): S => ({
  ...s,
  calls: s.calls.map((c) => (c.id === id ? { ...c, output: [...((c.output as string[]) ?? []), line] } : c)),
});

const ENCODER = "firmware/src/input/encoder.ts";
const ACCEL = "firmware/src/input/accel.ts";

const readOut = [
  "1   // OS-1 rotary encoder: PEC11R-4220K, 24 detents/rev",
  "2   import { clampVelocity } from \"./accel\";",
  "3   ",
  "4   const DETENT_THRESHOLD = 3;   // quadrature edges per detent",
  "5   const DEBOUNCE_US = 800;",
  "6   ",
  "7   export function createEncoder(pinA: Pin, pinB: Pin) {",
  "8     let edges = 0, last = 0;",
  "9     …",
];

const searchOut = [
  "src/input/encoder.ts:4  const DETENT_THRESHOLD = 3;",
  "src/input/encoder.ts:58  if (Math.abs(edges) >= DETENT_THRESHOLD) {",
  "src/input/encoder.ts:61  edges -= Math.sign(edges) * DETENT_THRESHOLD;",
  "src/input/accel.ts:12  // DETENT_THRESHOLD edges make one step",
  "src/ui/menu.ts:88  const step = DETENT_THRESHOLD > 2 ? 1 : 2;",
  "test/encoder.detent.test.ts:9  expect(DETENT_THRESHOLD).toBe(3);",
  "docs/hardware/encoder.md:31  `DETENT_THRESHOLD` — edges per click",
];

const editOut = [
  "@@ -1,9 +1,18 @@",
  "-const DETENT_THRESHOLD = 3;   // quadrature edges per detent",
  "-const DEBOUNCE_US = 800;",
  "+const DETENT_THRESHOLD = 4;   // full quadrature cycle per detent",
  "+const DEBOUNCE_US = 350;",
  "+",
  "+/** Edges that arrive faster than this are treated as bounce. */",
  "+const MIN_EDGE_US = 120;",
  "@@ -55,6 +64,9 @@ export function createEncoder",
  "-    if (Math.abs(edges) >= DETENT_THRESHOLD) {",
  "+    if (now - last < MIN_EDGE_US) return;",
  "+    last = now;",
  "+    if (Math.abs(edges) >= DETENT_THRESHOLD) {",
];

const testHead = [
  "> @ostra/os1-firmware@2.4.0 test",
  "> vitest run src/input",
  " ✓ src/input/encoder.detent.test.ts (12 tests) 38ms",
  " ✓ src/input/encoder.debounce.test.ts (9 tests) 21ms",
];

const cues: Cue<S>[] = [
  // 1 · read
  { at: 200, label: "read", apply: add({ id: "read", kind: "read", status: "pending", target: ENCODER, args: { path: ENCODER, offset: 1, limit: 184 } }) },
  { at: 1000, apply: set("read", { status: "done", lines: [1, 184], output: readOut, durationMs: 412 }) },
  // 2 · search
  { at: 1250, label: "search", apply: add({ id: "search", kind: "search", status: "pending", target: "DETENT_THRESHOLD", args: { pattern: "DETENT_THRESHOLD", path: "firmware/", glob: "*.{ts,md}" } }) },
  { at: 2200, apply: set("search", { status: "done", results: 7, output: searchOut, durationMs: 836 }) },
  // 3 · edit encoder.ts
  { at: 2450, label: "edit", apply: add({ id: "edit-1", kind: "edit", status: "pending", target: ENCODER, args: { path: ENCODER, hunks: 2 } }) },
  { at: 3700, apply: set("edit-1", { status: "done", added: 12, removed: 3, output: editOut, durationMs: 1180 }) },
  // 4 · run tests — fails
  { at: 3950, label: "test", apply: add({ id: "test-1", kind: "command", status: "pending", target: "pnpm test src/input", args: { command: "pnpm test src/input", cwd: "firmware/", timeout: "120s" }, output: [] }) },
  { at: 4300, apply: append("test-1", testHead[0]) },
  { at: 4450, apply: append("test-1", testHead[1]) },
  { at: 4900, apply: append("test-1", testHead[2]) },
  { at: 5250, apply: append("test-1", testHead[3]) },
  { at: 5700, apply: append("test-1", " ✗ src/input/accel.test.ts > clamps velocity at 48 steps/s") },
  { at: 5800, apply: append("test-1", "   expected 48, received 64 (threshold now 4 edges/step)") },
  {
    at: 6000,
    apply: (s) =>
      append("test-1", " Tests  1 failed | 23 passed (24)")(
        set("test-1", { status: "error", exitCode: 1, durationMs: 2040, error: "1 test failed: accel.ts still assumes 3 edges per detent." })(s),
      ),
  },
  // 5 · fix accel.ts
  { at: 6350, label: "fix", apply: add({ id: "edit-2", kind: "edit", status: "pending", target: ACCEL, args: { path: ACCEL, hunks: 1 } }) },
  {
    at: 7200,
    apply: set("edit-2", {
      status: "done",
      added: 2,
      removed: 1,
      durationMs: 640,
      output: ["@@ -10,4 +10,5 @@", "-const EDGES_PER_STEP = 3;", "+import { DETENT_THRESHOLD } from \"./encoder\";", "+const EDGES_PER_STEP = DETENT_THRESHOLD;"],
    }),
  },
  // 6 · retry tests — pass
  { at: 7450, label: "retry", apply: add({ id: "test-2", kind: "command", status: "pending", target: "pnpm test src/input", args: { command: "pnpm test src/input", cwd: "firmware/", timeout: "120s", attempt: 2 }, output: [] }) },
  { at: 7750, apply: append("test-2", testHead[0]) },
  { at: 7850, apply: append("test-2", testHead[1]) },
  { at: 8250, apply: append("test-2", testHead[2]) },
  { at: 8550, apply: append("test-2", testHead[3]) },
  { at: 8900, apply: append("test-2", " ✓ src/input/accel.test.ts (3 tests) 9ms") },
  { at: 9100, apply: (s) => append("test-2", " Tests  24 passed (24)")(set("test-2", { status: "done", exitCode: 0, durationMs: 1610 })(s)) },
  // 7 · fetch CI
  { at: 9400, label: "fetch", apply: add({ id: "ci", kind: "fetch", status: "pending", target: "https://ci.ostra.dev/os-1/firmware/pipelines/412", args: { url: "https://ci.ostra.dev/os-1/firmware/pipelines/412", method: "GET" } }) },
  {
    at: 10300,
    apply: (s) => ({
      ...set("ci", {
        status: "done",
        httpStatus: 200,
        durationMs: 702,
        output: ["{", "  \"pipeline\": 412,", "  \"commit\": \"a41c9e2\",", "  \"status\": \"passed\",", "  \"jobs\": { \"build\": \"passed\", \"hil-encoder\": \"passed\" },", "  \"duration\": \"3m 12s\"", "}"],
      })(s),
      done: true,
    }),
  },
];

export function ToolChipDemo({ compact = false }: { compact?: boolean }) {
  const [layout, setLayout] = useState<"grouped" | "inline">("grouped");
  const script = useScript(initial, cues, { duration: 11200 });
  const { calls, done } = script.state;
  const m = useMotionTokens();
  const files = useMemo(() => new Set(calls.filter((c) => c.kind === "edit" && c.status === "done").map((c) => c.target)).size, [calls]);
  const active = calls.find((c) => c.status === "pending");

  const chips = calls.map(({ id, ...c }) => <ToolChip key={id} {...c} />);

  return (
    <div ref={script.ref} className="flex w-full flex-1 flex-col self-stretch">
      <DemoFrame
        stage={
          <Stage minH={compact ? 260 : 440} center={false} className="px-6 py-8 sm:px-10">
            <div className="w-full max-w-[560px]">
              <p className="mb-1 flex items-center gap-2 text-xs">
                <span className="font-medium text-ink">Scout</span>
                <span className="font-mono text-2xs text-muted">ostra/os1-firmware · fix/encoder-skips</span>
              </p>
              <p className="mb-3 text-base leading-[22px] text-ink-2">
                Fast turns skip detents above about 40 steps a second. I’ll count a full quadrature cycle per detent and add an edge filter.
              </p>
              {layout === "grouped" ? (
                <ToolChipGroup defaultOpen={!compact}>{chips}</ToolChipGroup>
              ) : (
                <div className="flex flex-wrap items-start gap-1.5">{chips}</div>
              )}
              <AnimatePresence initial={false}>
                {done && (
                  <motion.p
                    key="wrap"
                    initial={{ opacity: 0, y: m.reduced ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={m.fade({ duration: 0.2, ease: [0.16, 1, 0.3, 1] })}
                    className="mt-3 text-base leading-[22px] text-ink"
                  >
                    Fixed. Encoder steps now track up to 64 steps a second, and pipeline 412 is green on the hardware rig.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </Stage>
        }
        controls={
          compact ? undefined : (
            <Controls>
              <ControlSegment label="Layout" value={layout} options={["grouped", "inline"] as const} onChange={setLayout} />
              <Readout label="Calls">{calls.length}</Readout>
              <Readout label="Files">{files}</Readout>
              <Readout label="Now">{active ? `${active.kind} …` : done ? "idle" : calls.length ? "thinking" : "—"}</Readout>
            </Controls>
          )
        }
        footer={<ScriptBar script={script} />}
      />
    </div>
  );
}
