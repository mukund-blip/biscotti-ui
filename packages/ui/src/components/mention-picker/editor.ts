import type { MentionDraft, MentionItem } from "./mention-picker";

export const mentionIcons = {
  person: "user",
  file: "file",
  tool: "tool",
  command: "terminal",
} as const;

export const tokenText = (item: MentionItem) => (item.type === "command" ? "/" : "@") + item.label;

export const tokenClass = "focus-ring mx-px inline-flex min-h-6 max-w-[calc(100%-2px)] select-none items-center gap-1.5 rounded-sm bg-sunken px-1.5 align-baseline text-sm font-medium text-ink shadow-[inset_0_0_0_1px_var(--dt-hairline)] hover:bg-surface";

export function replaceDraft(draft: MentionDraft, start: number, end: number, text: string, item?: MentionItem): MentionDraft {
  const delta = text.length - (end - start);
  const tokens = draft.tokens.filter((token) => token.end <= start || token.start >= end)
    .map((token) => token.start >= end ? { ...token, start: token.start + delta, end: token.end + delta } : token);
  if (item) tokens.push({ start, end: start + tokenText(item).length, item });
  return { text: draft.text.slice(0, start) + text + draft.text.slice(end), tokens: tokens.sort((a, b) => a.start - b.start) };
}

export function sameDraft(a: MentionDraft, b: MentionDraft) {
  return a.text === b.text && a.tokens.length === b.tokens.length &&
    a.tokens.every((token, i) => token.start === b.tokens[i].start && token.end === b.tokens[i].end && token.item === b.tokens[i].item);
}

export type EditorSelection = { start: number; end: number };
type Point = [Node, number];

/** Translate native selection boundaries and noneditable nodes into plain-text offsets. */
export function readEditor(root: HTMLElement, items: WeakMap<Node, MentionItem>) {
  const tokens: MentionDraft["tokens"][number][] = [];
  const draft = { text: "", tokens };
  const offsets = new WeakMap<Node, number[]>();
  const points: { start: number; end: number; before: Point; after: Point; text?: Node }[] = [];
  const add = (text: string, before: Point, after: Point, leaf?: Node) => {
    const start = draft.text.length;
    draft.text += text;
    if (text) points.push({ start, end: draft.text.length, before, after, text: leaf });
  };
  function visit(parent: Node) {
    const boundaries = [draft.text.length];
    offsets.set(parent, boundaries);
    Array.from(parent.childNodes).forEach((node, i, siblings) => {
      const before: Point = [parent, i];
      const after: Point = [parent, i + 1];
      const item = items.get(node);
      if (item) {
        const start = draft.text.length;
        add(tokenText(item), before, after);
        draft.tokens.push({ start, end: draft.text.length, item });
      } else if (node.nodeType === Node.TEXT_NODE) {
        offsets.set(node, [draft.text.length]);
        add(node.textContent ?? "", before, after, node);
      } else if (node instanceof HTMLElement && !node.hasAttribute("data-mention-tail")) {
        const block = node.tagName === "DIV" || node.tagName === "P";
        const previous = siblings[i - 1];
        if (i > 0 && (block || previous instanceof HTMLElement && /^(DIV|P)$/.test(previous.tagName)) && !draft.text.endsWith("\n")) {
          add("\n", before, before);
        }
        if (node.tagName === "BR") {
          // An empty editing block's final BR is the browser's caret placeholder.
          if (i < siblings.length - 1) add("\n", before, after);
        } else {
          visit(node);
        }
      }
      boundaries.push(draft.text.length);
    });
  }
  visit(root);
  function offset(node: Node, index: number) {
    const values = offsets.get(node);
    if (values) return node.nodeType === Node.TEXT_NODE ? values[0] + index : values[index];
    return undefined;
  }
  function point(index: number): Point {
    const piece = points.find((entry) => index >= entry.start && index <= entry.end);
    if (!piece) return [root, 0];
    if (piece.text) return [piece.text, index - piece.start];
    return index === piece.start ? piece.before : piece.after;
  }
  return { draft, offset, point };
}

export function readSelection(root: HTMLElement, editor: ReturnType<typeof readEditor>): EditorSelection | undefined {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const start = editor.offset(range.startContainer, range.startOffset);
  const end = editor.offset(range.endContainer, range.endOffset);
  if (start !== undefined && end !== undefined) return { start, end };
}

export function placeSelection(root: HTMLElement, editor: ReturnType<typeof readEditor>, next: EditorSelection) {
  const range = root.ownerDocument.createRange();
  range.setStart(...editor.point(next.start));
  range.setEnd(...editor.point(next.end));
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function caretRect(root: HTMLElement) {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed || !root.contains(selection.anchorNode)) return;
  const range = selection.getRangeAt(0);
  const caret = range.getClientRects?.()[0];
  if (caret?.height) return caret;
  const field = root.getBoundingClientRect();
  const style = getComputedStyle(root);
  const lineHeight = parseFloat(style.lineHeight) || 24;
  if (range.startContainer === root) {
    const before = root.childNodes[range.startOffset - 1];
    const after = root.childNodes[range.startOffset];
    if (before instanceof HTMLElement && !before.hasAttribute("data-mention-tail")) {
      const rect = before.getBoundingClientRect();
      return new DOMRect(rect.right, rect.top, 0, rect.height);
    }
    if (after instanceof HTMLElement) {
      const rect = after.getBoundingClientRect();
      if (rect.height) return new DOMRect(rect.left, rect.top, 0, rect.height);
    }
  }
  return new DOMRect(field.left + (parseFloat(style.paddingLeft) || 0), field.top + (parseFloat(style.paddingTop) || 0), 0, lineHeight);
}
