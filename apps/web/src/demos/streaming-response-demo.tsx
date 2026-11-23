"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StreamingResponse, useTextStream, type StreamingFeedback } from "@biscotti/ui";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ControlButton, ControlCheck, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";
import { demoTextStream, scoutAnswer, scoutQuestion, scoutSources, scoutSuggestions, streamTimeline } from "./streaming-response-data";

/* ── scripted replay: text(t) is derived from the same chunk plan the paced demo uses ── */
const timeline = streamTimeline(scoutAnswer);
const firstAt = timeline[0].at;
const endAt = timeline.at(-1)!.at;
const textAt = (t: number) => {
  let lo = 0, hi = timeline.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].at <= t) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best < 0 ? "" : scoutAnswer.slice(0, timeline[best].end);
};
const atOffset = (needle: string) => timeline.find((s) => s.end >= scoutAnswer.indexOf(needle))!.at;
type S = { phase: "idle" | "streaming" | "done" };
const cues: Cue<S>[] = [
  { at: 0, apply: () => ({ phase: "streaming" }), label: "Request" },
  { at: atOffset("| Supplier"), apply: (s) => s, label: "Table" },
  { at: atOffset("1. Place"), apply: (s) => s, label: "List" },
  { at: atOffset("```ts"), apply: (s) => s, label: "Code" },
  { at: endAt, apply: () => ({ phase: "done" }), label: "Done" },
];

type Mode = "live" | "replay";

function Conversation({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full max-w-[620px] content-start gap-5">
      <p className="ml-auto max-w-[80%] rounded-lg bg-sunken px-3 py-2 text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--bis-hairline)]">{scoutQuestion}</p>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span aria-hidden className="grid size-5 place-items-center rounded-sm bg-ink font-mono text-[10px] font-medium text-on-ink">S</span>
          <span className="text-sm font-medium text-ink">Scout</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StreamingResponseDemo({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>(compact ? "replay" : "live");
  const [speed, setSpeed] = useState<"0.5" | "1" | "2">("1");
  const [drop, setDrop] = useState(false);
  const [feedback, setFeedback] = useState<StreamingFeedback>(null);
  const [lastAction, setLastAction] = useState("—");

  // Start the paced browser stream once the demo is on screen.
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.3 });
    io.observe(host.current);
    return () => io.disconnect();
  }, []);
  const factory = useCallback(
    (signal: AbortSignal) => demoTextStream(signal, { speed: Number(speed), fail: drop }),
    [speed, drop],
  );
  const live = useTextStream(mode === "live" && visible ? factory : null, { key: `${speed}-${drop}` });

  // Replay
  const { ref: replayRef, ...script } = useScript<S>({ phase: "idle" }, cues, { duration: endAt + 900, autoplay: mode === "replay" });
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const replayT = stoppedAt ?? script.t;
  const replayText = useMemo(() => textAt(replayT), [replayT]);
  const replayStatus = stoppedAt != null ? "stopped" : script.state.phase === "streaming" && replayT >= endAt ? "done" : script.state.phase;
  const replayScript = {
    ...script,
    seek: (ms: number) => { setStoppedAt(null); script.seek(ms); },
    replay: () => { setStoppedAt(null); script.replay(); },
  };

  const response =
    mode === "live" ? (
      <StreamingResponse
        stream={live}
        sources={scoutSources}
        suggestions={scoutSuggestions}
        onSuggestion={(s) => setLastAction(`suggest: ${s}`)}
        onCopy={() => setLastAction("copied")}
        onShare={() => setLastAction("share")}
        feedback={feedback}
        onFeedbackChange={(f) => { setFeedback(f); setLastAction(`feedback: ${f ?? "none"}`); }}
        maxHeight={compact ? 220 : 320}
      />
    ) : (
      <StreamingResponse
        text={replayText}
        status={replayStatus}
        elapsedMs={Math.max(0, Math.min(replayT, endAt) - firstAt)}
        onStop={() => { setStoppedAt(script.t); script.setPlaying(false); }}
        onRegenerate={() => { setStoppedAt(null); setFeedback(null); script.replay(); }}
        sources={scoutSources}
        suggestions={scoutSuggestions}
        onSuggestion={(s) => setLastAction(`suggest: ${s}`)}
        onCopy={() => setLastAction("copied")}
        onShare={() => setLastAction("share")}
        feedback={feedback}
        onFeedbackChange={(f) => { setFeedback(f); setLastAction(`feedback: ${f ?? "none"}`); }}
        maxHeight={compact ? 220 : 320}
      />
    );

  return (
    <div ref={host}><div ref={replayRef}>
      <DemoFrame
        stage={
          <Stage minH={compact ? 300 : 520} center={false} className="flex justify-center px-5 py-8 sm:px-10">
            <Conversation>{response}</Conversation>
          </Stage>
        }
        controls={
          compact ? undefined : (
            <Controls>
              <ControlSegment
                label="Source"
                value={mode}
                options={[{ value: "live", label: "Paced browser demo" }, { value: "replay", label: "Scripted replay" }]}
                onChange={(v) => { setMode(v); setFeedback(null); if (v === "replay") { setStoppedAt(null); script.replay(); } }}
              />
              {mode === "live" && (
                <>
                  <ControlSegment label="Speed" value={speed} options={[{ value: "0.5", label: "0.5×" }, { value: "1", label: "1×" }, { value: "2", label: "2×" }]} onChange={setSpeed} />
                  <ControlCheck label="Simulate failure midway" checked={drop} onChange={setDrop} />
                  <ControlButton onClick={() => { setFeedback(null); live.restart(); }}>Ask again</ControlButton>
                  <Readout label="Stream">{live.status} · {live.chunks} chunks · {live.bytes} B</Readout>
                </>
              )}
              <Readout label="Last action">{lastAction}</Readout>
            </Controls>
          )
        }
        footer={mode === "replay" ? <ScriptBar script={replayScript} /> : undefined}
      />
    </div></div>
  );
}
