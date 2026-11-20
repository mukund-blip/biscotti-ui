import type { MockInstance } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { sound } from "../../sound/react";
import {
  ActionToolbar,
  rangeClosest,
  unwrapElement,
  wrapRange,
  type ToolbarAction,
  type ToolbarActionContext,
} from "./action-toolbar";

/* jsdom has no layout: give ranges a fixed rect so placement code runs. */
const rect = { x: 200, y: 300, left: 200, top: 300, right: 280, bottom: 320, width: 80, height: 20, toJSON() {} } as DOMRect;
const proto = Range.prototype as unknown as Record<string, unknown>;
const saved = { r: proto.getBoundingClientRect, rs: proto.getClientRects };
beforeAll(() => {
  proto.getBoundingClientRect = () => rect;
  proto.getClientRects = () => [rect];
});
afterAll(() => {
  proto.getBoundingClientRect = saved.r;
  proto.getClientRects = saved.rs;
});

let play: MockInstance<typeof sound.play>;
beforeEach(() => {
  play = vi.spyOn(sound, "play").mockImplementation(() => {});
});
afterEach(() => {
  window.getSelection()?.removeAllRanges();
  play.mockRestore();
});
const voices = () => play.mock.calls.map((c) => c[0]);

/** A host that really applies the default actions, like the demo. */
function applyDefault(id: string, { range, value, active }: ToolbarActionContext) {
  if (id === "bold") {
    const el = active ? rangeClosest(range, "strong, b") : null;
    if (el) unwrapElement(el);
    else wrapRange(range, "strong");
  } else if (id === "link" && value) {
    wrapRange(range, "a", { href: value });
  }
}

function Harness({ onAction, actions }: { onAction: (id: string, ctx: ToolbarActionContext) => void; actions?: ToolbarAction[] }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref} tabIndex={0} role="article" aria-label="Notes">
        <p>
          The encoder driver has been rewritten so the macro knobs no longer skip.
        </p>
      </div>
      <p>Outside text that is not watched.</p>
      <ActionToolbar target={ref} onAction={onAction} actions={actions} />
    </>
  );
}

/** Select `word` inside the element containing it and let the selectionchange event settle. */
async function select(word: string, root: ParentNode = document) {
  const p = Array.from(root.querySelectorAll("p")).find((el) => el.textContent!.includes(word))!;
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let node: Text | null = null;
  while (walker.nextNode()) {
    const t = walker.currentNode as Text;
    if (t.data.includes(word)) { node = t; break; }
  }
  const start = node!.data.indexOf(word);
  const r = document.createRange();
  r.setStart(node!, start);
  r.setEnd(node!, start + word.length);
  await act(async () => {
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    await new Promise((res) => setTimeout(res, 0));
  });
}
async function collapse() {
  await act(async () => {
    window.getSelection()!.collapseToStart();
    await new Promise((res) => setTimeout(res, 0));
  });
}

const toolbar = () => screen.queryByRole("toolbar", { name: "Text actions" });

describe("ActionToolbar", () => {
  it("appears for a selection inside the target only, and leaves when it collapses", async () => {
    render(<Harness onAction={() => {}} />);
    expect(toolbar()).toBeNull();
    await select("Outside");
    expect(toolbar()).toBeNull();
    await select("encoder");
    expect(toolbar()).toBeInTheDocument();
    expect(toolbar()).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Bold",
      "Italic",
      "Link",
      "Comment",
      "Ask Scout",
    ]);
    await collapse();
    await waitFor(() => expect(toolbar()).toBeNull());
  });

  it("exposes pressed state, shortcuts and popup semantics", async () => {
    render(<Harness onAction={() => {}} />);
    await select("encoder");
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold).toHaveAttribute("aria-pressed", "false");
    expect(bold).toHaveAttribute("aria-keyshortcuts", "Control+B");
    expect(screen.getByRole("button", { name: "Link" })).not.toHaveAttribute("aria-haspopup");
    expect(screen.getByRole("button", { name: "Ask Scout" })).not.toHaveAttribute("aria-pressed");
    // roving tabindex: exactly one tab stop
    expect(screen.getAllByRole("button").filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });

  it("runs an action with the selected range and adopts the host's new selection", async () => {
    const onAction = vi.fn(applyDefault);
    render(<Harness onAction={onAction} />);
    await select("encoder");
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onAction).toHaveBeenCalledWith("bold", expect.objectContaining({ text: "encoder", active: false }));
    expect(screen.getByRole("article").querySelector("strong")).toHaveTextContent("encoder");
    expect(voices()).toEqual(["tick"]);
    // the selection now sits inside <strong>: Bold reads as pressed and toggles off
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(bold).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(bold);
    expect(onAction).toHaveBeenLastCalledWith("bold", expect.objectContaining({ active: true }));
    expect(screen.getByRole("article").querySelector("strong")).toBeNull();
  });

  it("plays tap for a plain action", async () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await select("encoder");
    await userEvent.click(screen.getByRole("button", { name: "Ask Scout" }));
    expect(onAction).toHaveBeenCalledWith("ask", expect.objectContaining({ text: "encoder" }));
    expect(voices()).toEqual(["tap"]);
  });

  it("Link morphs into an input: Enter applies the value, Escape returns to the buttons", async () => {
    const onAction = vi.fn(applyDefault);
    render(<Harness onAction={onAction} />);
    await select("driver");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    const input = await screen.findByRole("textbox", { name: "Link" });
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("placeholder", "Paste or type a link");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Link" })).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Link" })).toHaveFocus());
    expect(onAction).not.toHaveBeenCalled();

    await userEvent.keyboard("{Enter}");
    await userEvent.type(await screen.findByRole("textbox", { name: "Link" }), "https://ostra.audio/fw{Enter}");
    expect(onAction).toHaveBeenCalledWith("link", expect.objectContaining({ text: "driver", value: "https://ostra.audio/fw" }));
    expect(screen.getByRole("article").querySelector("a")).toHaveAttribute("href", "https://ostra.audio/fw");
    expect(voices()).toContain("confirm");
  });

  it("an empty Comment is not submitted", async () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    await select("driver");
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));
    const input = await screen.findByRole("textbox", { name: "Comment" });
    await userEvent.type(input, "   {Enter}");
    expect(onAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull());
  });

  it("Alt+F10 enters the toolbar; arrows, Home and End rove; Escape returns to the text", async () => {
    render(<Harness onAction={() => {}} />);
    const article = screen.getByRole("article");
    act(() => article.focus());
    await select("encoder");
    await userEvent.keyboard("{Alt>}{F10}{/Alt}");
    const btn = (name: string) => screen.getByRole("button", { name });
    expect(btn("Bold")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(btn("Italic")).toHaveFocus();
    expect(btn("Italic")).toHaveAttribute("tabindex", "0");
    expect(btn("Bold")).toHaveAttribute("tabindex", "-1");
    await userEvent.keyboard("{End}");
    expect(btn("Ask Scout")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(btn("Bold")).toHaveFocus(); // wraps
    await userEvent.keyboard("{ArrowLeft}");
    expect(btn("Ask Scout")).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(btn("Bold")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(article).toHaveFocus();
    expect(window.getSelection()!.toString()).toBe("encoder");
  });

  it("Ctrl+/ also enters the toolbar, and keyboard activation keeps focus there", async () => {
    const onAction = vi.fn(applyDefault);
    render(<Harness onAction={onAction} />);
    act(() => screen.getByRole("article").focus());
    await select("encoder");
    await userEvent.keyboard("{Control>}/{/Control}");
    expect(screen.getByRole("button", { name: "Bold" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onAction).toHaveBeenCalledWith("bold", expect.objectContaining({ text: "encoder" }));
    expect(screen.getByRole("button", { name: "Bold" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  });

  it("binds ⌘/Ctrl+letter shortcuts while focus is in the target", async () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    act(() => screen.getByRole("article").focus());
    await select("encoder");
    await userEvent.keyboard("{Control>}b{/Control}");
    expect(onAction).toHaveBeenCalledWith("bold", expect.objectContaining({ text: "encoder" }));
    await userEvent.keyboard("{Control>}i{/Control}");
    expect(onAction).toHaveBeenLastCalledWith("italic", expect.anything());
  });

  it("accepts custom actions", async () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} actions={CUSTOM} />);
    await select("encoder");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Translate" }));
    expect(onAction).toHaveBeenCalledWith("translate", expect.objectContaining({ text: "encoder", active: false }));
  });
});

// Module scope: a stable identity, as hosts should pass it.
const CUSTOM: ToolbarAction[] = [{ id: "translate", label: "Translate", text: "Translate" }];
