"use client";

import { animate, AnimatePresence, motion, useIsPresent } from "motion/react";
import { createPortal } from "react-dom";
import {
  useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
  type ClipboardEvent, type KeyboardEvent, type Ref,
} from "react";
import { Icon } from "../../icons";
import { Kbd, Spinner } from "../../lib/primitives";
import { cn, useControllable } from "../../lib/utils";
import { reduced as reducedTransition, surfaceVariants, tween, useMotionTokens } from "../../motion/tokens";
import { usePlay } from "../../sound/react";
import { caretRect, mentionIcons, placeSelection, readEditor, readSelection, replaceDraft, sameDraft, tokenClass, tokenText, type EditorSelection } from "./editor";

export interface MentionItem {
  /** Stable ID understood by the application. */
  id: string;
  /** Resource type. Command items are supplied through the separate commands prop. */
  type: "person" | "file" | "tool" | "command";
  /** Human-readable name. Command names omit the slash. */
  label: string;
  /** Optional role, file path, or tool description. */
  detail?: string;
  /** Optional image URL for people. */
  avatar?: string;
  /** Extra searchable terms. */
  keywords?: readonly string[];
}

export interface MentionToken {
  /** Inclusive UTF-16 start offset into draft.text. */
  start: number;
  /** Exclusive UTF-16 end offset into draft.text. */
  end: number;
  /** Committed reference. */
  item: MentionItem;
}

export interface MentionDraft {
  /** Plain text, including the display text of committed tokens. */
  text: string;
  /** Ordered, nonoverlapping reference ranges. */
  tokens: readonly MentionToken[];
}

export interface MentionInputHandle {
  /** Focus the editor without scrolling the page. */
  focus: () => void;
  /** Open suggestions by inserting a trigger at the current or last selection. */
  open: (trigger: "@" | "/") => void;
  /** Dismiss suggestions without editing the draft. */
  close: () => void;
}

export interface MentionInputProps {
  /** Accessible name of the editor. */
  "aria-label": string;
  /** IDs of supplemental instructions. */
  "aria-describedby"?: string;
  /** Local mention resources. */
  items?: readonly MentionItem[];
  /** Slash commands that can be selected as tokens. */
  commands?: readonly MentionItem[];
  /** Load additional mention results. Superseded queries receive an abort signal. */
  loadItems?: (query: string, signal: AbortSignal) => Promise<readonly MentionItem[]>;
  /** Controlled draft. */
  value?: MentionDraft;
  /** Initial uncontrolled draft. */
  defaultValue?: MentionDraft;
  /** Called with each text or token edit. */
  onValueChange?: (value: MentionDraft) => void;
  /** Called after a mention or command is inserted. */
  onSelect?: (item: MentionItem) => void;
  /** Handles editor keys before the picker. The second argument indicates an active suggestion. */
  onEditorKeyDown?: (event: KeyboardEvent<HTMLDivElement>, hasActiveSuggestion: boolean) => void;
  /** Intercept image paste and return true to consume it. */
  onPasteFiles?: (files: File[]) => boolean;
  /** Shown when the draft is empty. */
  placeholder?: string;
  /** Disables focus and editing. */
  disabled?: boolean;
  /** Allows focus and copying while suppressing edits. */
  readOnly?: boolean;
  /** Allow sounds for choosing or removing a token. */
  sound?: boolean;
  /** Added to the root wrapper. */
  className?: string;
  /** Added to the editable surface. */
  editorClassName?: string;
  /** Applied to the editor's accessible invalid state. */
  invalid?: boolean;
  /** Imperative focus and trigger controls. */
  ref?: Ref<MentionInputHandle>;
}

export interface MentionPickerProps {
  /** ID referenced by the controlling editor. */
  id: string;
  /** Candidate resources. */
  items: readonly MentionItem[];
  /** Text after the trigger. */
  query: string;
  /** Use the command group and labels. */
  mode?: "mention" | "command";
  /** Whether async results are still loading. */
  loading?: boolean;
  /** Whether loading additional results failed. */
  failed?: boolean;
  /** Active option ID, addressed through mentionOptionId. */
  activeId?: string;
  /** Called for pointer movement over an option. */
  onActiveChange?: (id: string) => void;
  /** Called on activation. */
  onSelect: (item: MentionItem) => void;
  /** Current caret rectangle in viewport coordinates. */
  anchor: { left: number; top: number; bottom: number };
  /** Added to the floating surface. */
  className?: string;
  /** Allow the standalone picker to play its selection sound. */
  sound?: boolean;
}

const groups = [
  { type: "person", label: "People" },
  { type: "file", label: "Files" },
  { type: "tool", label: "Tools" },
  { type: "command", label: "Commands" },
] as const;

const emptyDraft: MentionDraft = { text: "", tokens: [] };
const emptyItems: readonly MentionItem[] = [];
type Trigger = { prefix: "@" | "/"; start: number; end: number; query: string };
const optionKey = (item: MentionItem) => `${item.type}:${item.id}`;

function optionId(id: string, key: string) {
  return `${id}-${encodeURIComponent(key)}`;
}

/** Get the option ID to use with aria-activedescendant for a standalone picker. */
export function mentionOptionId(id: string, item: MentionItem) {
  return optionId(id, optionKey(item));
}

function fuzzy(text: string, query: string) {
  const source = text.toLowerCase();
  const positions: number[] = [];
  let cursor = 0;
  for (const character of query) {
    const at = source.indexOf(character, cursor);
    if (at === -1) return;
    positions.push(at);
    cursor = at + 1;
  }
  return { positions, score: !positions.length ? 0 : (positions.at(-1)! - positions[0] + 1 - positions.length) * 3 + positions[0] };
}

function matchItems(items: readonly MentionItem[], query: string, mode: "mention" | "command") {
  const search = query.trim().toLowerCase();
  return groups.flatMap(({ type }) => {
    if ((type === "command") !== (mode === "command")) return [];
    const seen = new Set<string>();
    return items.flatMap((item) => {
      if (item.type !== type || seen.has(item.id)) return [];
      seen.add(item.id);
      const label = fuzzy(item.label, search);
      const detail = fuzzy(item.detail ?? "", search);
      const keyword = item.keywords?.some((word) => fuzzy(word, search));
      if (!label && !detail && !keyword) return [];
      return [{ item, label: label?.positions, detail: label ? undefined : detail?.positions, rank: label?.score ?? (detail ? detail.score + 100 : 200) }];
    }).sort((a, b) => a.rank - b.rank);
  });
}

function Highlight({ text, positions }: { text: string; positions?: number[] }) {
  if (!positions?.length) return text;
  const highlights = new Set(positions);
  const runs: { text: string; matched: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const matched = highlights.has(i);
    const last = runs.at(-1);
    if (last?.matched === matched) last.text += text[i];
    else runs.push({ text: text[i], matched });
  }
  return runs.map((run, i) => run.matched
    ? <mark key={i} className="bg-transparent font-semibold text-pencil-ink">{run.text}</mark>
    : run.text);
}

export function MentionPicker({
  id, items, query, mode = "mention", loading, failed, activeId, onActiveChange, onSelect, anchor, className, sound = true,
}: MentionPickerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; top?: number; bottom?: number; height: number }>();
  const m = useMotionTokens();
  const play = usePlay(sound);
  const present = useIsPresent();
  const rows = useMemo(() => matchItems(items, query, mode), [items, query, mode]);
  const command = mode === "command";

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const place = () => {
      const width = el.offsetWidth;
      const below = window.innerHeight - anchor.bottom - 15;
      const above = anchor.top - 15;
      const up = below < Math.min(360, (list.current?.scrollHeight ?? 0) + 71) && above > below;
      setPlacement({
        left: Math.max(8, Math.min(anchor.left - 8, window.innerWidth - width - 8)),
        ...(up ? { bottom: window.innerHeight - anchor.top + 7 } : { top: anchor.bottom + 7 }),
        height: Math.max(30, Math.min(292, (up ? above : below) - 69 - (loading || failed || !rows.length ? 36 : 0))),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, rows.length, loading, failed]);

  useLayoutEffect(() => {
    if (!activeId || !list.current) return;
    const el = list.current.ownerDocument.getElementById(activeId);
    if (!el) return;
    const viewport = list.current.getBoundingClientRect();
    const row = el.getBoundingClientRect();
    if (row.bottom > viewport.bottom || row.top < viewport.top) list.current.scrollTop += row.top - viewport.top - 15;
  }, [activeId, rows, placement?.height]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <motion.div
      ref={panel}
      data-mention-popup={id}
      aria-hidden={!present || undefined}
      inert={!present || undefined}
      {...surfaceVariants(placement?.bottom === undefined ? "bottom" : "top", m.reduced)}
      style={{ left: placement?.left ?? anchor.left, top: placement?.top, bottom: placement?.bottom, transformOrigin: placement?.bottom === undefined ? "top left" : "bottom left" }}
      className={cn("fixed z-50 w-[min(312px,calc(100vw-16px))] overflow-hidden rounded-lg border border-hairline bg-raised text-ink shadow-3", className)}
    >
      <div aria-hidden className="flex h-9 items-center gap-2 border-b border-hairline px-3">
        <span className="grid size-5 place-items-center rounded-xs bg-pencil-soft font-mono text-xs font-medium text-pencil-ink">{command ? "/" : "@"}</span>
        <span className="text-sm font-medium">{command ? "Insert command" : "Add context"}</span>
        {rows.length > 0 && <span className="tabular ml-auto font-mono text-2xs text-muted">{rows.length} {rows.length === 1 ? "result" : "results"}</span>}
      </div>
      <div ref={list} id={id} role="listbox" aria-label={command ? "Commands" : "Mention suggestions"} aria-busy={loading || undefined}
        style={{ maxHeight: placement?.height ?? 292 }} className="overscroll-contain overflow-y-auto px-1.5 py-1 [scrollbar-color:var(--dt-rule)_transparent] [scrollbar-width:thin]">
        {groups.map((group) => {
          const options = rows.filter(({ item }) => item.type === group.type);
          if (!options.length) return null;
          return (
            <div key={group.type} role="group" aria-label={group.label} className="pb-0.5">
              {group.type !== "command" && <div aria-hidden className="px-2.5 pb-0.5 pt-1.5 font-mono text-2xs text-muted">{group.label}</div>}
              {options.map(({ item, label, detail }) => {
                const key = optionKey(item);
                const rowId = mentionOptionId(id, item);
                const active = activeId === rowId;
                return (
                  <div
                    key={key} id={rowId} role="option" aria-selected={active}
                    onPointerMove={(event) => { if (event.pointerType !== "touch") onActiveChange?.(rowId); }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { play("select"); onSelect(item); }}
                    className={cn("relative flex min-h-10 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1", active ? "bg-pencil-soft" : "hover:bg-sunken")}
                  >
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-xs bg-pencil" />}
                    <span aria-hidden className={cn("grid size-[26px] shrink-0 place-items-center bg-sunken text-ink-2", item.type === "person" ? "rounded-full" : "rounded-sm")}>
                      {item.type === "person" && item.avatar
                        ? <img src={item.avatar} alt="" className="size-full rounded-full object-cover" />
                        : <Icon name={mentionIcons[item.type]} size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium", command && "font-mono")}>
                        {command && "/"}<Highlight text={item.label} positions={label} />
                      </span>
                      {item.detail && <span className={cn("block truncate text-2xs text-muted", item.type === "file" && "font-mono")}>
                        <Highlight text={item.detail} positions={detail} />
                      </span>}
                    </span>
                    {active && <Icon name="corner" size={14} className="shrink-0 text-pencil-ink" />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div role="status" className={cn("flex items-center gap-2 px-3 text-xs text-muted", loading || failed || !rows.length ? "min-h-9 pb-1" : "sr-only")}>
        {loading ? <><Spinner /> Looking up context…</> : failed ? "Couldn’t load more context." : !rows.length
          ? command ? "No matching commands." : "No matching people, files or tools."
          : `${rows.length} ${rows.length === 1 ? "suggestion" : "suggestions"}`}
      </div>
      <div aria-hidden className="flex h-8 items-center gap-2 border-t border-hairline bg-surface px-3 text-2xs text-muted">
        <span className="flex items-center gap-0.5"><Kbd>↑</Kbd><Kbd>↓</Kbd></span> Move
        <span className="flex items-center gap-1"><Kbd>↵</Kbd><Kbd>Tab</Kbd> Insert</span>
        <span className="ml-auto flex items-center gap-1"><Kbd>Esc</Kbd> Close</span>
      </div>
    </motion.div>,
    document.body,
  );
}

function findTrigger(draft: MentionDraft, selection: EditorSelection, hasCommands: boolean): Trigger | null {
  if (selection.start !== selection.end) return null;
  const before = draft.text.slice(0, selection.start);
  const match = [...before.matchAll(/(?:^|[\s([{])([@/])/gu)].at(-1);
  if (!match || (match[1] === "/" && !hasCommands)) return null;
  const start = match.index + match[0].length - 1;
  const query = before.slice(start + 1);
  if (query.includes("\n")) return null;
  if (draft.tokens.some((token) => token.end > start && token.start < selection.end)) return null;
  return { prefix: match[1] as Trigger["prefix"], start, end: selection.end, query };
}

type TokenButton = HTMLButtonElement;

function writeEditor(root: HTMLElement, draft: MentionDraft, items: WeakMap<Node, MentionItem>, id: string, disabled: boolean, glyphs: HTMLDivElement | null) {
  const document = root.ownerDocument;
  const content = document.createDocumentFragment();
  let cursor = 0;
  for (const token of draft.tokens) {
    if (token.start > cursor) content.append(document.createTextNode(draft.text.slice(cursor, token.start)));
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = disabled;
    button.contentEditable = "false";
    button.dataset.mentionToken = String(token.start);
    button.className = tokenClass;
    button.setAttribute("aria-label", `${token.item.type}: ${token.item.label}`);
    button.setAttribute("aria-describedby", `${id}-token-help`);
    const label = document.createElement("span");
    label.className = cn("truncate", token.item.type === "file" || token.item.type === "command" ? "font-mono" : undefined);
    label.textContent = token.item.type === "command" ? tokenText(token.item) : token.item.label;
    items.set(button, token.item);
    content.append(button);
    const glyph = glyphs?.querySelector(`[data-mention-icon="${token.item.type}"]`);
    if (glyph) button.append(glyph.cloneNode(true));
    button.append(label);
    cursor = token.end;
  }
  if (cursor < draft.text.length) content.append(document.createTextNode(draft.text.slice(cursor)));
  if (draft.text.endsWith("\n")) {
    const tail = document.createElement("br");
    tail.dataset.mentionTail = "";
    content.append(tail);
  }
  root.replaceChildren(content);
}

function sameTrigger(a: Trigger | null, b: Trigger | null) {
  return a?.prefix === b?.prefix && a?.start === b?.start && a?.end === b?.end && a?.query === b?.query;
}

export function MentionInput({
  "aria-label": label, "aria-describedby": describedBy, items = emptyItems, commands = emptyItems, loadItems,
  value, defaultValue = emptyDraft, onValueChange, onSelect, onEditorKeyDown, onPasteFiles, placeholder,
  disabled = false, readOnly = false, sound = true, className, editorClassName, invalid, ref,
}: MentionInputProps) {
  const id = useId();
  const pickerId = `${id}-suggestions`;
  const editor = useRef<HTMLDivElement>(null);
  const glyphs = useRef<HTMLDivElement>(null);
  const tokenItems = useRef(new WeakMap<Node, MentionItem>());
  const selection = useRef<EditorSelection | undefined>(undefined);
  const pending = useRef<{ draft: MentionDraft; selection: EditorSelection; insertedAt?: number } | undefined>(undefined);
  const dismissed = useRef<{ prefix: Trigger["prefix"]; start: number } | undefined>(undefined);
  const composing = useRef(false);
  const [draft, setDraft] = useControllable(value, defaultValue, onValueChange);
  const [revision, refresh] = useState(0);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [anchor, setAnchor] = useState<Pick<DOMRect, "left" | "top" | "bottom">>();
  const [activeId, setActiveId] = useState<string>();
  const [lookup, setLookup] = useState<{ query: string; items: readonly MentionItem[]; failed: boolean; loader: typeof loadItems }>();
  const play = usePlay(sound);
  const chipTransition = useMotionTokens().reduced ? reducedTransition : tween.drain;
  const muting = disabled || readOnly;
  const mentionQuery = trigger?.prefix === "@" && !muting && loadItems ? trigger.query.trim() : undefined;

  useEffect(() => {
    if (mentionQuery === undefined || !loadItems) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const found = await loadItems(mentionQuery, controller.signal);
        if (!controller.signal.aborted) setLookup({ query: mentionQuery, items: found, failed: false, loader: loadItems });
      } catch {
        if (!controller.signal.aborted) setLookup({ query: mentionQuery, items: emptyItems, failed: true, loader: loadItems });
      }
    };
    void load();
    return () => controller.abort();
  }, [mentionQuery, loadItems]);

  const command = trigger?.prefix === "/";
  const resolved = lookup?.query === mentionQuery && lookup?.loader === loadItems ? lookup : undefined;
  const loading = mentionQuery !== undefined && !resolved;
  const choices = useMemo(() => command ? commands : resolved?.items.length ? [...items, ...resolved.items] : items, [command, commands, items, resolved]);
  const matches = useMemo(() => trigger ? matchItems(choices, trigger.query, command ? "command" : "mention") : [], [choices, command, trigger]);
  const active = matches.find(({ item }) => mentionOptionId(pickerId, item) === activeId)?.item ?? matches[0]?.item;
  const activeOption = active ? mentionOptionId(pickerId, active) : undefined;
  const open = !!trigger && !!anchor && !muting;

  const updateAnchor = useCallback(() => {
    const field = editor.current;
    if (!field) return;
    const rect = caretRect(field);
    const bounds = field.getBoundingClientRect();
    const next = rect && rect.bottom >= bounds.top && rect.top <= bounds.bottom && rect.bottom >= 0 && rect.top <= window.innerHeight
      ? { left: rect.left, top: rect.top, bottom: rect.bottom }
      : undefined;
    setAnchor((previous) => previous?.left === next?.left && previous?.top === next?.top && previous?.bottom === next?.bottom ? previous : next);
  }, []);

  const updateTrigger = useCallback((current: MentionDraft, nextSelection?: EditorSelection) => {
    if (!nextSelection || muting || composing.current) return;
    selection.current = nextSelection;
    const next = findTrigger(current, nextSelection, !!commands.length);
    const blocked = dismissed.current;
    if (!next || next.prefix !== blocked?.prefix || next.start !== blocked.start) dismissed.current = undefined;
    const shown = dismissed.current ? null : next;
    setTrigger((previous) => sameTrigger(previous, shown) ? previous : shown);
    if (shown) updateAnchor();
  }, [commands.length, muting, updateAnchor]);

  useLayoutEffect(() => {
    const field = editor.current;
    if (!field || composing.current) return;
    const current = readEditor(field, tokenItems.current);
    const edit = pending.current;
    pending.current = undefined;
    const accepted = edit && sameDraft(edit.draft, draft);
    const changed = !sameDraft(current.draft, draft);
    const restore = accepted ? edit.selection
      : changed ? readSelection(field, current) ?? selection.current
        : undefined;
    if (changed) {
      if (!accepted && field.ownerDocument.activeElement !== field) selection.current = undefined;
      writeEditor(field, draft, tokenItems.current, id, disabled, glyphs.current);
    }
    if (accepted && edit.insertedAt !== undefined) {
      const chip = field.querySelector<HTMLElement>(`[data-mention-token="${edit.insertedAt}"]`);
      if (chip) {
        animate(chip, { backgroundColor: ["var(--dt-pencil-soft)", "var(--dt-sunken)"] }, chipTransition)
          .then(() => chip.style.removeProperty("background-color"));
      }
    }
    field.querySelectorAll<TokenButton>("[data-mention-token]").forEach((button) => { button.disabled = disabled; });
    if (restore && field.ownerDocument.activeElement === field) {
      const clamped = { start: Math.min(restore.start, draft.text.length), end: Math.min(restore.end, draft.text.length) };
      placeSelection(field, readEditor(field, tokenItems.current), clamped);
      if (accepted) {
        const caret = caretRect(field);
        if (caret) {
          const fieldRect = field.getBoundingClientRect();
          if (caret.top < fieldRect.top) field.scrollTop -= fieldRect.top - caret.top;
          else if (caret.bottom > fieldRect.bottom) field.scrollTop += caret.bottom - fieldRect.bottom;
        }
      }
      updateTrigger(draft, clamped);
    }
  }, [draft, disabled, id, revision, updateTrigger, chipTransition]);

  useEffect(() => {
    const field = editor.current;
    if (!field) return;
    const sync = () => {
      if (field.ownerDocument.activeElement !== field) return;
      const current = readEditor(field, tokenItems.current);
      updateTrigger(current.draft, readSelection(field, current));
    };
    field.ownerDocument.addEventListener("selectionchange", sync);
    return () => field.ownerDocument.removeEventListener("selectionchange", sync);
  }, [updateTrigger]);

  useLayoutEffect(() => {
    if (!trigger || muting) return;
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateAnchor);
    if (editor.current) observer?.observe(editor.current);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
      observer?.disconnect();
    };
  }, [trigger, muting, updateAnchor]);

  function dismiss() {
    if (trigger) dismissed.current = trigger;
    setTrigger(null);
    setActiveId(undefined);
  }

  useEffect(() => {
    if (trigger?.query.endsWith(" ") && !matches.length && !loading) {
      dismissed.current = trigger;
      setTrigger(null);
      setActiveId(undefined);
    }
  }, [trigger, matches.length, loading]);

  function getSelection(): EditorSelection {
    const field = editor.current;
    const actual = field?.contains(field.ownerDocument.activeElement)
      ? readSelection(field, readEditor(field, tokenItems.current))
      : undefined;
    const saved = actual ?? selection.current;
    return saved ? { start: Math.min(saved.start, draft.text.length), end: Math.min(saved.end, draft.text.length) }
      : { start: draft.text.length, end: draft.text.length };
  }

  function commit(nextDraft: MentionDraft, nextSelection: EditorSelection, insertedAt?: number) {
    pending.current = { draft: nextDraft, selection: nextSelection, insertedAt };
    setDraft(nextDraft);
    refresh((version) => version + 1);
  }

  function edit(range: EditorSelection, text: string, item?: MentionItem) {
    const next = replaceDraft(draft, range.start, range.end, text, item);
    const end = range.start + text.length;
    commit(next, { start: end, end });
  }

  useImperativeHandle(ref, () => ({
    focus: () => editor.current?.focus({ preventScroll: true }),
    close: dismiss,
    open: (prefix) => {
      if (muting || (prefix === "/" && !commands.length)) return;
      const range = getSelection();
      const previous = draft.text[range.start - 1];
      // A toolbar trigger can be used immediately after a word or atomic token.
      const text = previous && !/[\s([{]/u.test(previous) ? ` ${prefix}` : prefix;
      dismissed.current = undefined;
      editor.current?.focus({ preventScroll: true });
      edit(range, text);
    },
  }));

  function select(item: MentionItem) {
    if (!trigger || muting) return;
    let end = trigger.end;
    // If the caret has moved within a typed word, consume the rest of that word too.
    const suffix = /^[\p{L}\p{N}_.-]+/u.exec(draft.text.slice(end))?.[0] ?? "";
    if (!draft.tokens.some((token) => token.start < end + suffix.length && token.end > end)) end += suffix.length;
    const separator = /^\s/u.test(draft.text.slice(end)) ? "" : " ";
    editor.current?.focus({ preventScroll: true });
    const next = replaceDraft(draft, trigger.start, end, tokenText(item) + separator, item);
    const caret = trigger.start + tokenText(item).length + (separator || /[ \u00a0]/u.test(draft.text[end] ?? "") ? 1 : 0);
    commit(next, { start: caret, end: caret }, trigger.start);
    dismiss();
    onSelect?.(item);
    play("select");
  }

  function editorInput() {
    const field = editor.current;
    if (!field || muting || composing.current) return;
    const current = readEditor(field, tokenItems.current);
    const nextSelection = readSelection(field, current);
    if (!sameDraft(draft, current.draft)) {
      if (nextSelection) pending.current = { draft: current.draft, selection: nextSelection };
      setDraft(current.draft);
      if (value !== undefined) refresh((version) => version + 1);
    }
    updateTrigger(current.draft, nextSelection);
  }

  function focusAt(offset: number) {
    const field = editor.current;
    if (!field) return;
    field.focus({ preventScroll: true });
    const caret = { start: offset, end: offset };
    const current = readEditor(field, tokenItems.current);
    placeSelection(field, current, caret);
    updateTrigger(current.draft, caret);
  }

  function tokenFor(button: HTMLButtonElement) {
    const field = editor.current;
    if (!field || !tokenItems.current.has(button)) return;
    const nodes = Array.from(field.querySelectorAll("[data-mention-token]"));
    return readEditor(field, tokenItems.current).draft.tokens[nodes.indexOf(button)];
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || composing.current || event.keyCode === 229) return;
    if (event.target !== event.currentTarget) {
      const button = (event.target as HTMLElement).closest<TokenButton>("[data-mention-token]");
      const token = button && tokenFor(button);
      if (!token) return;
      if (!muting && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        focusAt(token.start);
        edit(token, "");
        play("dismiss");
      } else if (["ArrowLeft", "ArrowRight", "Escape"].includes(event.key)) {
        event.preventDefault();
        focusAt(event.key === "ArrowLeft" ? token.start : token.end);
      }
      return;
    }
    if (muting) {
      if (readOnly && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        const field = event.currentTarget;
        const range = field.ownerDocument.createRange();
        range.selectNodeContents(field);
        const selection = field.ownerDocument.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      return;
    }
    onEditorKeyDown?.(event, open && !!active);
    if (event.defaultPrevented) return;
    if (open && trigger) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss();
        return;
      }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
        event.preventDefault();
        const index = matches.findIndex(({ item }) => item === active);
        const next = (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
        setActiveId(mentionOptionId(pickerId, matches[next].item));
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && active) {
        event.preventDefault();
        select(active);
        return;
      }
      if (event.key === " " && !matches.length && !loading) dismiss();
    }
    const range = getSelection();
    if (event.key === "Enter") {
      event.preventDefault();
      edit(range, "\n");
      return;
    }
    if (range.start !== range.end || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const backwards = event.key === "Backspace" || event.key === "ArrowLeft";
    if (!["Backspace", "Delete", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const index = draft.tokens.findIndex((token) => backwards ? token.end === range.start : token.start === range.end);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      edit(draft.tokens[index], "");
      play("dismiss");
    } else {
      editor.current?.querySelectorAll<TokenButton>("[data-mention-token]")[index]?.focus();
    }
  }

  function paste(event: ClipboardEvent<HTMLDivElement>) {
    if (muting) return;
    event.preventDefault();
    const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (files.length && onPasteFiles?.(files)) return;
    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (text) edit(getSelection(), text);
  }

  function copy(event: ClipboardEvent<HTMLDivElement>, cut: boolean) {
    const range = getSelection();
    if (range.start === range.end) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", draft.text.slice(range.start, range.end));
    if (cut && !muting) edit(range, "");
  }

  return (
    <div className={cn("relative", className)}>
      <div
        ref={editor}
        role="combobox"
        aria-label={label}
        aria-describedby={describedBy}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        aria-activedescendant={open ? activeOption : undefined}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        aria-invalid={invalid || undefined}
        contentEditable={!muting}
        tabIndex={disabled ? -1 : 0}
        data-placeholder={!draft.text ? placeholder : undefined}
        onInput={editorInput}
        onKeyDown={onKeyDown}
        onPaste={paste}
        onCopy={(event) => copy(event, false)}
        onCut={(event) => copy(event, true)}
        onDrop={(event) => {
          if (muting) return;
          event.preventDefault();
          const text = event.dataTransfer.getData("text/plain").replace(/\r\n?/g, "\n");
          if (!event.dataTransfer.files.length && text) edit(getSelection(), text);
        }}
        onCompositionStart={() => { composing.current = true; setTrigger(null); }}
        onCompositionEnd={() => { composing.current = false; editorInput(); }}
        onBlur={() => { setTrigger(null); setActiveId(undefined); }}
        onClick={(event) => {
          const button = (event.target as HTMLElement).closest<TokenButton>("[data-mention-token]");
          const token = button && tokenFor(button);
          if (token) focusAt(token.end);
          else {
            const current = readEditor(event.currentTarget, tokenItems.current);
            updateTrigger(current.draft, readSelection(event.currentTarget, current));
          }
        }}
        className={cn("focus-ring relative min-h-6 max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-md text-base leading-[26px] text-ink caret-pencil [overflow-wrap:anywhere]",
          "before:pointer-events-none before:absolute before:text-muted before:content-[attr(data-placeholder)]",
          disabled && "cursor-not-allowed text-muted", editorClassName)}
      />
      <span id={`${id}-token-help`} className="sr-only">{readOnly ? "Press Enter to return to the text." : "Press Backspace or Delete to remove, or Enter to return to the text."}</span>
      <div ref={glyphs} hidden aria-hidden>
        {Object.entries(mentionIcons).map(([type, icon]) => <Icon key={type} name={icon} size={14} data-mention-icon={type} className="shrink-0 text-muted" />)}
      </div>
      <AnimatePresence>
        {open && anchor && trigger && (
          <MentionPicker
            key={trigger.prefix} id={pickerId} items={choices} query={trigger.query} anchor={anchor}
            mode={command ? "command" : "mention"} activeId={activeOption} onActiveChange={setActiveId}
            loading={loading} failed={resolved?.failed} onSelect={select} sound={false}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
