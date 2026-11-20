"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@detent/ui";
import { MentionInput, type MentionDraft, type MentionInputHandle, type MentionItem } from "@detent/ui/components/mention-picker/mention-picker";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

export const ostraMentions: readonly MentionItem[] = [
  { id: "ines", type: "person", label: "Ines Duarte", detail: "Firmware" },
  { id: "mara", type: "person", label: "Mara Lind", detail: "Founder" },
  { id: "launch-notes", type: "file", label: "OS-1 launch notes", detail: "press/os-1-launch.md" },
  { id: "beta-report", type: "file", label: "Beta feedback", detail: "research/os-1-beta.md" },
  { id: "support-search", type: "tool", label: "Search support tickets", detail: "Find cases by model or symptom" },
];

const remoteMentions: readonly MentionItem[] = [
  ...ostraMentions,
  { id: "theo", type: "person", label: "Theo Okafor", detail: "Hardware" },
  { id: "supplier-lookup", type: "tool", label: "Supplier lookup", detail: "Check part stock and lead times" },
  { id: "jun", type: "person", label: "Jun Park", detail: "Operations" },
  { id: "sam", type: "person", label: "Sam Reyes", detail: "Support" },
  { id: "firmware", type: "file", label: "Firmware 1.4 changelog", detail: "firmware/os-1/CHANGELOG.md" },
];

const sample = "Check the OS-1 launch notes with ";
const initial: MentionDraft = { text: sample, tokens: [] };
const preview: MentionDraft = {
  text: "Share with @Ines Duarte",
  tokens: [{ start: 11, end: 23, item: ostraMentions[0] }],
};

export function MentionPickerPreview() {
  return (
    <MentionInput aria-label="Mention preview" defaultValue={preview} readOnly sound={false}
      className="w-full max-w-64 rounded-md border border-hairline bg-raised p-2.5 shadow-1" />
  );
}

export function MentionPickerDemo() {
  const [source, setSource] = useState<"local" | "delayed">("local");
  const [draft, setDraft] = useState(initial);
  const input = useRef<MentionInputHandle>(null);
  const loadItems = useCallback((_query: string, signal: AbortSignal) => new Promise<readonly MentionItem[]>((resolve) => {
    const timer = window.setTimeout(() => resolve(remoteMentions), 850);
    signal.addEventListener("abort", () => window.clearTimeout(timer), { once: true });
  }), []);
  return (
    <DemoFrame
      stage={
        <Stage minH={440} center={false} tone="sunken" className="flex items-start justify-center px-4 pb-10 pt-12 sm:pt-14">
          <div className="w-full max-w-[500px]">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <label onClick={() => input.current?.focus()} className="cursor-text text-sm font-medium text-ink">Note to Scout</label>
              <button type="button" onClick={() => input.current?.open("@")}
                className="focus-ring flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-1.5 text-xs text-ink-2 hover:bg-raised hover:text-ink">
                <span className="font-mono text-sm text-muted">@</span> Add context
              </button>
            </div>
            <MentionInput
              ref={input} aria-label="Note to Scout" items={source === "local" ? ostraMentions : undefined}
              loadItems={source === "delayed" ? loadItems : undefined}
              value={draft} onValueChange={setDraft} placeholder="Write a note…"
              className="rounded-lg border border-hairline bg-raised p-2 shadow-2"
              editorClassName="min-h-[44px] px-2 py-2"
            />
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-muted"><Icon name="link" size={12} /> Type @ to reference a person, file or tool.</p>
          </div>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Results" value={source} onChange={setSource} options={["local", "delayed"] as const} />
          <ControlButton onClick={() => { input.current?.close(); setDraft(initial); }}>Reset note</ControlButton>
          <Readout label="References">{draft.tokens.length ? draft.tokens.map((token) => token.item.label).join(", ") : "0"}</Readout>
        </Controls>
      }
    />
  );
}
