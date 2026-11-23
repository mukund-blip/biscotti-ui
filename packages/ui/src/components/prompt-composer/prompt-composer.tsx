"use client";

import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from "react";
import { Icon } from "../../icons";
import { Kbd } from "../../lib/primitives";
import { cn, fmt, useControllable } from "../../lib/utils";
import { spring, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { mentionIcons, tokenClass } from "../mention-picker/editor";
import { MentionInput, type MentionDraft, type MentionInputHandle, type MentionItem, type MentionInputProps } from "../mention-picker/mention-picker";

export interface PromptComposerModel {
  /** Stable model identifier. */
  id: string;
  /** Name shown in the toolbar and menu. */
  label: string;
  /** Optional model capabilities shown in the menu. */
  detail?: string;
}

export interface PromptComposerAttachment {
  /** Original attachment. */
  file: File;
  /** Optional ID returned by the upload handler. */
  uploadId?: string;
}

export interface PromptComposerSubmission {
  /** Submitted text and resolved token ranges. */
  draft: MentionDraft;
  /** Model selected when submitting. */
  model?: string;
  /** Files ready to submit. */
  attachments: readonly PromptComposerAttachment[];
}

export interface PromptComposerUpload {
  /** Report upload completion between 0 and 1. */
  onProgress: (fraction: number) => void;
  /** Aborted when the file is removed or the composer unmounts. */
  signal: AbortSignal;
}

export interface PromptComposerProps {
  /** Accessible name of the prompt field. */
  "aria-label"?: string;
  /** Controlled draft. */
  value?: MentionDraft;
  /** Initial uncontrolled draft. */
  defaultValue?: MentionDraft;
  /** Called when editing, clearing after Send, or restoring after a rejection. */
  onValueChange?: (value: MentionDraft) => void;
  /** Resource suggestions for @ mentions. */
  mentions?: readonly MentionItem[];
  /** Optional async source for @ mentions. */
  loadMentions?: MentionInputProps["loadItems"];
  /** Custom slash command suggestions. Pass [] to disable commands. */
  commands?: readonly Omit<MentionItem, "type">[];
  /** Models to offer. Omit to hide the picker. */
  models?: readonly PromptComposerModel[];
  /** Controlled model ID. */
  model?: string;
  /** Initial uncontrolled model ID. Defaults to the first model. */
  defaultModel?: string;
  /** Called when the selected model changes. */
  onModelChange?: (id: string) => void;
  /** Optional uploader. When omitted, files are passed directly to onSubmit. */
  onUpload?: (file: File, upload: PromptComposerUpload) => Promise<string | void>;
  /** Handles Send. Reject to restore the draft. Stop aborts the supplied signal. */
  onSubmit: (submission: PromptComposerSubmission, signal: AbortSignal) => void | Promise<void>;
  /** Hosts can show Stop while generation is managed outside onSubmit. */
  generating?: boolean;
  /** Called when the user presses Stop. */
  onStop?: () => void;
  /** Prompt length limit. The counter shows up at 82% of the limit. */
  limit?: number;
  /** Count units toward the limit. Defaults to Unicode code points. */
  measure?: (draft: MentionDraft) => number;
  /** Unit name used in the counter's accessible label. */
  unit?: string;
  /** Placeholder shown when there is no prompt text. */
  placeholder?: string;
  /** Disables the composer and removes it from the tab order. */
  disabled?: boolean;
  /** Allows the prompt to be read and copied. */
  readOnly?: boolean;
  /** Allow outcome sounds, including token insertion and removal. */
  sound?: boolean;
  /** Added to the composer root. */
  className?: string;
}

type Attachment = PromptComposerAttachment & { id: number; state: "uploading" | "ready" | "error"; progress: number };
type SubmissionStatus = "idle" | "sent" | "stopped" | "error";
const emptyDraft: MentionDraft = { text: "", tokens: [] };
const defaultCommands: readonly Omit<MentionItem, "type">[] = [
  { id: "summarize", label: "summarize", detail: "Condense notes into key points" },
  { id: "draft-reply", label: "draft-reply", detail: "Write a reply from the context" },
  { id: "translate", label: "translate", detail: "Rewrite in another language" },
];
const toolbar = "focus-ring flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-sm px-2 text-sm text-ink-2 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-55 motion-safe:active:translate-y-px";

function describeBytes(bytes: number) {
  if (bytes < 1024) return `${fmt.int(bytes)} B`;
  if (bytes < 1024 ** 2) return `${fmt.int(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function AttachmentChip({ attachment, live, disabled, onRemove, onRetry }: {
  attachment: Attachment; live: boolean; disabled: boolean; onRemove: () => void; onRetry: () => void;
}) {
  const m = useMotionTokens();
  const [preview, setPreview] = useState<string>();
  const { file, progress, state } = attachment;
  const image = file.type.startsWith("image/");
  useEffect(() => {
    if (!image || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, image]);

  const uploading = state === "uploading";
  const failed = state === "error";
  return (
    <li className={cn("relative isolate flex h-11 w-[240px] max-w-full items-center gap-2 overflow-hidden rounded-md border pl-1.5 pr-1",
      failed ? "border-err/35 bg-err-soft" : "border-hairline bg-surface")}>
      <motion.span
        aria-hidden
        initial={false}
        animate={{
          scaleX: failed ? 0 : uploading ? progress : 1,
          backgroundColor: uploading ? "var(--bis-pencil-soft)" : "transparent",
          borderColor: uploading ? "var(--bis-pencil)" : "var(--bis-rule)",
        }}
        transition={{ scaleX: live ? m.move(tween.fade) : { duration: 0 }, backgroundColor: m.fade(tween.drain), borderColor: m.fade(tween.drain) }}
        className="pointer-events-none absolute inset-0 -z-10 origin-left border-b"
      />
      <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-sm bg-raised text-muted shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
        <Icon name={image ? "image" : "file"} size={14} />
        {preview && <img src={preview} alt="" onError={() => setPreview(undefined)} className="absolute inset-0 size-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <span title={file.name} className="block truncate font-mono text-xs text-ink">{file.name}</span>
        <span className={cn("tabular block truncate font-mono text-2xs", failed ? "text-err" : uploading ? "text-pencil-ink" : "text-muted")}>
          {failed ? "Upload failed" : uploading ? `${describeBytes(file.size)} · ${Math.round(progress * 100)}%` : describeBytes(file.size)}
        </span>
      </span>
      {uploading && <div role="progressbar" aria-label={`Uploading ${file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="sr-only" />}
      {failed && <button type="button" disabled={disabled} aria-label={`Retry ${file.name}`} title="Retry upload" onClick={onRetry} className={cn(toolbar, "h-6 w-6 px-0 text-err")}>
        <Icon name="refresh" size={14} />
      </button>}
      <button type="button" disabled={disabled} aria-label={`Remove ${file.name}`} title="Remove attachment" onClick={onRemove} className={cn(toolbar, "h-6 w-6 px-0 text-muted")}>
        <Icon name="x" size={14} />
      </button>
    </li>
  );
}

function DraftPreview({ draft }: { draft: MentionDraft }) {
  let start = 0;
  return (
    <>
      {draft.tokens.map((token) => {
        const before = draft.text.slice(start, token.start);
        start = token.end;
        return (
          <span key={token.start}>{before}<span className={tokenClass}>
            <Icon name={mentionIcons[token.item.type]} size={14} className="shrink-0 text-muted" />
            <span className={cn("truncate", (token.item.type === "file" || token.item.type === "command") && "font-mono")}>{token.item.type === "command" ? "/" : ""}{token.item.label}</span>
          </span></span>
        );
      })}
      {draft.text.slice(start)}
    </>
  );
}

function SendGlyph({ running }: { running: boolean }) {
  const arrow = "M7.25 13 L7.25 5.86 L4.53 8.53 L3.47 7.47 L8 2.94 L12.53 7.47 L11.47 8.53 L8.75 5.86 L8.75 13 Z";
  const square = "M5 12 L4 12 L4 8 L4 4 L8 4 L12 4 L12 8 L12 12 L10 12 Z";
  const shape = running ? square : arrow;
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
      <motion.path initial={false} animate={{ d: shape }} transition={tween.fade} className="motion-reduce:hidden" />
      <AnimatePresence initial={false}>
        <motion.path key={shape} d={shape} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={tween.fade} className="motion-safe:hidden" />
      </AnimatePresence>
    </svg>
  );
}

export function PromptComposer({
  "aria-label": label = "Prompt", value, defaultValue = emptyDraft, onValueChange, mentions, loadMentions, commands = defaultCommands,
  models, model, defaultModel, onModelChange, onUpload, onSubmit, generating = false, onStop, limit, measure, unit = "characters",
  placeholder = "Ask anything…", disabled = false, readOnly = false, sound = true, className,
}: PromptComposerProps) {
  const uid = useId();
  const editor = useRef<MentionInputHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fieldSlot = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useControllable(value, defaultValue, onValueChange);
  const [selectedId, setModel] = useControllable<string | undefined>(model, defaultModel ?? models?.[0]?.id, (id) => { if (id !== undefined) onModelChange?.(id); });
  const selectedModel = models?.find((option) => option.id === selectedId) ?? models?.[0];
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const nextId = useRef(0);
  const uploads = useRef(new Map<number, AbortController>());
  const submission = useRef<AbortController | null>(null);
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [ghost, setGhost] = useState<{ draft: MentionDraft; key: number; height: number; scroll: number; attachments: Attachment[] }>();
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [modelOpen, setModelOpen] = useState(false);
  const m = useMotionTokens();
  const play = usePlay(sound);
  const running = sending || generating;
  const locked = disabled || readOnly || running;
  const pendingUpload = attachments.find((attachment) => attachment.state === "uploading");
  const hasFailedUpload = attachments.some((attachment) => attachment.state === "error");
  const count = limit === undefined ? 0 : measure?.(draft) ?? Array.from(draft.text).length;
  const overLimit = limit !== undefined && count > limit;
  const showMeter = limit !== undefined && count >= Math.ceil(limit * 0.82) && count > 0;
  const canSend = !locked && !overLimit && !pendingUpload && !hasFailedUpload && (!!draft.text.trim() || !!attachments.length);
  const canStop = running && !disabled && !readOnly && (sending || !!onStop);
  const actionEnabled = running ? canStop : canSend;

  useEffect(() => {
    const activeUploads = uploads.current;
    return () => {
      activeUploads.forEach((upload) => upload.abort());
      activeUploads.clear();
      submission.current?.abort();
    };
  }, []);

  function updateDraft(next: MentionDraft) {
    setStatus("idle");
    setGhost(undefined);
    setDraft(next);
  }

  async function upload(attachment: Attachment) {
    if (!onUpload) return;
    const id = attachment.id;
    uploads.current.get(id)?.abort();
    const controller = new AbortController();
    uploads.current.set(id, controller);
    const update = (patch: Partial<Attachment>) => {
      if (!controller.signal.aborted && uploads.current.get(id) === controller) {
        setAttachments((current) => current.map((file) => file.id === id ? { ...file, ...patch } : file));
      }
    };
    update({ state: "uploading", progress: 0 });
    try {
      const uploadId = await onUpload(attachment.file, {
        signal: controller.signal,
        onProgress: (fraction) => { if (Number.isFinite(fraction)) update({ progress: Math.min(1, Math.max(0, fraction)) }); },
      });
      update({ state: "ready", progress: 1, uploadId: uploadId ?? undefined });
    } catch {
      update({ state: "error" });
      if (!controller.signal.aborted) play("error", { velocity: 0.5 });
    } finally {
      if (uploads.current.get(id) === controller) uploads.current.delete(id);
    }
  }

  function addFiles(files: readonly File[]) {
    if (locked || !files.length) return false;
    const added = files.map((file): Attachment => ({
      file, id: ++nextId.current, state: onUpload ? "uploading" : "ready", progress: onUpload ? 0 : 1,
    }));
    setStatus("idle");
    setAttachments((previous) => [...previous, ...added]);
    added.forEach((file) => void upload(file));
    play("tap", { velocity: 0.5 });
    return true;
  }

  function remove(attachment: Attachment) {
    uploads.current.get(attachment.id)?.abort();
    uploads.current.delete(attachment.id);
    editor.current?.focus();
    setAttachments((current) => current.filter((file) => file.id !== attachment.id));
    play("dismiss");
  }

  async function send() {
    if (!canSend || submission.current) return;
    const controller = new AbortController();
    submission.current = controller;
    const sentDraft = draft;
    setSending(true);
    setStatus("idle");
    editor.current?.close();
    setModelOpen(false);
    if (sentDraft.text && (value === undefined || onValueChange)) {
      const field = fieldSlot.current?.querySelector<HTMLElement>("[contenteditable]");
      setGhost({ draft: sentDraft, key: ++nextId.current, height: field?.offsetHeight ?? 26, scroll: field?.scrollTop ?? 0, attachments });
    }
    setDraft(emptyDraft);
    play("confirm");
    try {
      await onSubmit({
        draft: sentDraft, model: selectedModel?.id,
        attachments: attachments.map(({ file, uploadId }) => ({ file, uploadId })),
      }, controller.signal);
      if (controller.signal.aborted) return;
      setAttachments([]);
      setStatus("sent");
    } catch {
      if (controller.signal.aborted) return;
      // An external draft update takes precedence over the failed transaction.
      const latest = latestDraft.current;
      if (latest === sentDraft || (!latest.text && !latest.tokens.length)) setDraft(sentDraft);
      setGhost(undefined);
      setStatus("error");
      play("error", { velocity: 0.6 });
    } finally {
      if (submission.current === controller) {
        submission.current = null;
        setSending(false);
      }
    }
  }

  function stop() {
    if (!canStop) return;
    const controller = submission.current;
    if (controller) {
      controller.abort();
      submission.current = null;
      setSending(false);
      setAttachments([]);
    }
    setStatus("stopped");
    onStop?.();
    play("dismiss");
  }

  function handleEditorKeys(event: KeyboardEvent<HTMLDivElement>, hasSuggestion: boolean) {
    if (event.key !== "Enter" || event.altKey) return;
    const forceSend = event.metaKey || event.ctrlKey;
    if (!forceSend && (event.shiftKey || hasSuggestion)) return;
    event.preventDefault();
    void send();
  }

  function onFilesDragged(event: DragEvent<HTMLDivElement>) {
    return !locked && Array.from(event.dataTransfer.types).includes("Files");
  }

  const message = running ? "Generating…" : status === "error" ? "Couldn’t send. Try again."
    : status === "stopped" ? "Stopped" : status === "sent" ? "Sent"
      : hasFailedUpload ? "Retry or remove failed files." : pendingUpload ? "Uploading files…" : "";
  const visibleAttachments = ghost?.attachments ?? (running ? [] : attachments);
  const commandsWithType = commands.map((command): MentionItem => ({ ...command, type: "command" }));

  return (
    <div
      data-prompt-composer=""
      data-state={running ? "generating" : status}
      onDragEnter={(event) => {
        if (!onFilesDragged(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!onFilesDragged(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (files.length) event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(files);
      }}
      className={cn("relative w-full rounded-lg border bg-raised shadow-2",
        status === "error" ? "border-err/45" : "border-hairline", disabled && "opacity-65", className)}
    >
      <div className="relative px-3 pt-3 sm:px-4">
        {visibleAttachments.length > 0 && (
          <ul aria-label="Attachments" className="mb-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto px-1 py-1">
            {visibleAttachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id} attachment={attachment} live={pendingUpload?.id === attachment.id} disabled={locked || !!ghost}
                onRetry={() => { editor.current?.focus(); void upload(attachment); play("tap", { velocity: 0.5 }); }}
                onRemove={() => remove(attachment)}
              />
            ))}
          </ul>
        )}
        <div ref={fieldSlot}
          className={cn("relative", ghost && "[&_[role=combobox]]:min-h-(--bis-prompt-ghost-height)")}
          style={ghost ? { "--bis-prompt-ghost-height": `${ghost.height}px` } as CSSProperties : undefined}
        >
          <MentionInput
            ref={editor} aria-label={label} aria-describedby={`${uid}-instructions`}
            editorClassName="px-1.5" value={draft} onValueChange={updateDraft}
            items={mentions} loadItems={loadMentions} commands={commandsWithType}
            onEditorKeyDown={handleEditorKeys} onPasteFiles={addFiles}
            disabled={disabled} readOnly={readOnly || running} invalid={overLimit || status === "error"}
            placeholder={ghost || running ? undefined : placeholder} sound={sound}
          />
          {ghost && (
            <motion.div
              key={ghost.key} aria-hidden initial={{ y: 0, opacity: 1 }}
              animate={{ y: m.reduced ? 0 : -4, opacity: 0 }} transition={m.fade(tween.surfaceOut)}
              onAnimationComplete={() => setGhost((current) => current?.key === ghost.key ? undefined : current)}
              className="pointer-events-none absolute inset-0 overflow-hidden px-1.5"
            >
              <div className="whitespace-pre-wrap text-base leading-[26px] text-ink [overflow-wrap:anywhere]" style={{ marginTop: -ghost.scroll }}>
                <DraftPreview draft={ghost.draft} />
              </div>
            </motion.div>
          )}
        </div>
      </div>
      <div className="mt-2 flex min-h-12 items-center gap-1 border-t border-hairline px-2 py-1.5 sm:gap-1.5 sm:px-2.5">
        <input
          ref={fileInput} type="file" multiple hidden disabled={locked}
          onChange={(event) => {
            addFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <button type="button" className={cn(toolbar, "w-8 px-0")} aria-label="Attach files" title="Attach files" disabled={locked} onClick={() => fileInput.current?.click()}>
          <Icon name="paperclip" />
        </button>
        {selectedModel && (
          <Menu.Root modal={false} open={modelOpen && !locked} disabled={locked} onOpenChange={(open) => {
            if (open) editor.current?.close();
            setModelOpen(open);
          }}>
            <Menu.Trigger className={cn(toolbar, "max-w-28 sm:max-w-42")} aria-label={`Model: ${selectedModel.label}`} title={selectedModel.label}>
              <Icon name="layers" size={14} className="hidden shrink-0 text-muted sm:block" />
              <span className="truncate">{selectedModel.label}</span>
              <Icon name="chevronDown" size={14} className="shrink-0 text-muted" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="start" sideOffset={7} className="z-50">
                <Menu.Popup aria-label="Choose a model"
                  className="w-60 origin-(--transform-origin) rounded-lg border border-hairline bg-raised p-1.5 text-ink shadow-3 transition-opacity duration-[200ms] ease-surface data-ending-style:opacity-0 data-ending-style:duration-[140ms] data-starting-style:opacity-0 motion-safe:transition-[opacity,translate] motion-safe:data-starting-style:translate-y-1 motion-safe:data-ending-style:translate-y-0.5 motion-reduce:duration-[120ms]">
                  <div aria-hidden className="px-2 pb-1 pt-1.5 font-mono text-2xs text-muted">Response model</div>
                  <Menu.RadioGroup value={selectedModel.id} onValueChange={(id: string) => { setModel(id); play("select"); }}>
                    {models?.map((option) => (
                      <Menu.RadioItem
                        key={option.id} value={option.id} label={option.label} closeOnClick
                        className="focus-ring flex min-h-10 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 data-highlighted:bg-pencil-soft"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-sunken text-muted">
                          <Icon name="layers" size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{option.label}</span>
                          {option.detail && <span className="block truncate text-2xs text-muted">{option.detail}</span>}
                        </span>
                        <Menu.RadioItemIndicator><Icon name="check" size={14} /></Menu.RadioItemIndicator>
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
        {!!commands.length && (
          <button type="button" className={cn(toolbar, "w-8 px-0 font-mono text-md")} aria-label="Insert command" title="Insert command" disabled={locked}
            onClick={() => editor.current?.open("/")}>/</button>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span role="status" title={message || undefined} className={cn("min-w-0 truncate text-2xs", status === "error" || hasFailedUpload ? "text-err" : "text-muted")}>{message}</span>
          {showMeter && (
            <span aria-label={`${count} of ${limit} ${unit}${overLimit ? ", over limit" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(count, limit!)}
              className={cn("tabular shrink-0 font-mono text-2xs", overLimit ? "text-err" : "text-muted")}>
              <span aria-hidden>{fmt.int(count)} / {fmt.int(limit!)}</span>
            </span>
          )}
          {!message && !showMeter && !locked && <Kbd aria-hidden className="hidden sm:inline-flex">↵</Kbd>}
        </div>
        <motion.button
          type="button"
          tabIndex={0}
          aria-label={running ? "Stop generating" : "Send prompt"}
          aria-disabled={!actionEnabled}
          disabled={disabled || readOnly}
          title={running ? "Stop generating" : "Send prompt"}
          onClick={running ? stop : () => void send()}
          whileTap={actionEnabled && !m.reduced ? { scale: 0.94 } : undefined}
          transition={m.move(spring.control)}
          className={cn("focus-ring grid size-8 shrink-0 place-items-center rounded-sm",
            actionEnabled ? "cursor-pointer bg-ink text-on-ink hover:opacity-90" : "cursor-not-allowed bg-sunken text-muted")}
        ><SendGlyph running={running} /></motion.button>
      </div>
      <span id={`${uid}-instructions`} className="sr-only">Enter sends. Shift and Enter starts a new line. Type @ to add context{commands.length ? ", or / to insert a command" : ""}.</span>
      <AnimatePresence>
        {dragging && !locked && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={m.fade()}
            className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center gap-2 rounded-md border border-dashed border-pencil bg-raised text-sm font-medium text-pencil-ink"
            role="status"
          ><Icon name="paperclip" /> Drop files to attach</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
