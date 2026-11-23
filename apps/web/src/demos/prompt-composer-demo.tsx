"use client";

import { useState } from "react";
import { Icon, SoundScope } from "@biscotti/ui";
import { PromptComposer, type PromptComposerModel, type PromptComposerUpload } from "@biscotti/ui/components/prompt-composer/prompt-composer";
import type { MentionDraft } from "@biscotti/ui/components/mention-picker/mention-picker";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";
import { ScriptBar, useScript, type Cue } from "@/components/stage/script-player";
import { ostraMentions } from "./mention-picker-demo";

const models: readonly PromptComposerModel[] = [
  { id: "scout", label: "Scout", detail: "Everyday synthesis and replies" },
  { id: "scout-deep", label: "Scout Deep", detail: "Compare several sources" },
  { id: "scout-fast", label: "Scout Fast", detail: "Quick edits and summaries" },
];

const example: MentionDraft = {
  text: "Draft a beta update for @Ines Duarte about the OS-1 encoder fix.\nInclude what testers should check on firmware 1.4.",
  tokens: [{ start: 24, end: 36, item: ostraMentions[0] }],
};
const empty: MentionDraft = { text: "", tokens: [] };
const initial = { draft: example, generating: false, outcome: "" };
const cues: Cue<typeof initial>[] = [
  { at: 650, apply: () => ({ draft: empty, generating: true, outcome: "" }) },
  { at: 2550, apply: () => ({ draft: empty, generating: false, outcome: "Sent" }) },
];

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { window.clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export function PromptComposerPreview() {
  return (
    <div className="w-full px-4">
      <PromptComposer models={models.slice(0, 1)} mentions={ostraMentions} defaultValue={example} sound={false} onSubmit={() => {}} className="mx-auto max-w-md" />
    </div>
  );
}

export function PromptComposerDemo() {
  const [mode, setMode] = useState<"edit" | "read-only" | "disabled">("edit");
  const [server, setServer] = useState<"accept" | "reject send" | "reject upload">("accept");
  const [draft, setDraft] = useState(example);
  const [outcome, setOutcome] = useState("");
  const [showReplay, setShowReplay] = useState(false);
  const [run, setRun] = useState(0);
  const script = useScript(initial, cues, { autoplay: false, duration: 3200 });
  const replaying = showReplay;
  const shownDraft = replaying ? script.state.draft : draft;
  const shownOutcome = replaying ? script.state.outcome : outcome;

  async function upload(_file: File, { onProgress, signal }: PromptComposerUpload) {
    for (const progress of [0.18, 0.37, 0.64, 0.83, 1]) {
      await delay(245, signal);
      if (server === "reject upload" && progress >= 0.64) throw new Error("Upload rejected");
      onProgress(progress);
    }
  }

  return (
    <DemoFrame
      stage={
        <Stage tone="sunken" center={false} minH={348} className="flex items-start justify-center px-4 pb-16 pt-16 sm:px-10 sm:pt-20">
          <div ref={script.ref} className="w-full max-w-[620px]">
            <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-ink">
                <span className="grid size-6 place-items-center rounded-sm border border-hairline bg-raised text-ink-2"><Icon name="sparkle" size={14} /></span>
                <h2 className="text-base font-medium">Ask Scout</h2>
              </div>
              {shownOutcome && <span className="truncate font-mono text-2xs text-muted">{shownOutcome}</span>}
            </div>
            <PromptComposer
              key={run} aria-label="Prompt for Scout" value={shownDraft} onValueChange={(next) => {
                if (replaying) { script.setPlaying(false); setShowReplay(false); }
                setDraft(next);
              }}
              mentions={ostraMentions} models={models} limit={132}
              disabled={mode === "disabled"} readOnly={mode === "read-only"}
              generating={replaying && script.state.generating}
              onStop={() => {
                if (replaying) { script.setPlaying(false); setShowReplay(false); setDraft(empty); }
                setOutcome("");
              }}
              onUpload={upload}
              onSubmit={async (submission, signal) => {
                await delay(1650, signal);
                if (server === "reject send") { setOutcome(""); throw new Error("Send rejected"); }
                setOutcome(submission.attachments.length ? `Sent with ${submission.attachments.length} ${submission.attachments.length === 1 ? "file" : "files"}` : "");
              }}
            />
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Mode" value={mode} onChange={setMode} options={["edit", "read-only", "disabled"] as const} />
          <ControlSegment label="Server" value={server} onChange={setServer} options={["accept", "reject send", "reject upload"] as const} />
          <ControlButton onClick={() => {
            script.setPlaying(false);
            setShowReplay(false);
            setRun((n) => n + 1);
            setDraft(example);
            setOutcome("");
          }}>Reset draft</ControlButton>
          <Readout label="Chars">{Array.from(shownDraft.text).length}</Readout>
        </Controls>
      }
      footer={(
        <SoundScope muted>
          <div onClickCapture={() => setShowReplay(true)}
            onKeyDownCapture={(event) => { if (["Enter", " ", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) setShowReplay(true); }}
            onPointerDownCapture={() => setShowReplay(true)}>
            <ScriptBar script={script} />
          </div>
        </SoundScope>
      )}
    />
  );
}
