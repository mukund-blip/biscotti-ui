import type { MockInstance } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sound } from "../../sound/react";
import { Callout, Toaster, toast } from "./notifications";

/** The toast list items (the stack), excluding the visually hidden live regions. */
const items = () => within(screen.getByRole("list")).queryAllByRole("listitem", { hidden: true });
const item = (text: string) => screen.getAllByText(text).map((el) => el.closest("li")).find(Boolean) as HTMLLIElement;
const politeRegion = () => screen.getByRole("status");
const assertiveRegion = () => screen.getByRole("alert");

let play: MockInstance<typeof sound.play>;
beforeEach(() => {
  play = vi.spyOn(sound, "play").mockImplementation(() => {});
});
afterEach(() => {
  act(() => toast.dismiss());
  play.mockRestore();
  vi.useRealTimers();
});
const voices = () => play.mock.calls.map((c) => c[0]);

describe("toast() API", () => {
  it("shows a toast in a labelled region and returns its id", () => {
    render(<Toaster />);
    let id = "";
    act(() => { id = toast("Preset saved", { description: "Glass Choir" }); });
    expect(typeof id).toBe("string");
    expect(screen.getByRole("region", { name: /Notifications/ })).toBeInTheDocument();
    expect(items()).toHaveLength(1);
    expect(item("Preset saved")).toHaveTextContent("Glass Choir");
    expect(voices()).toEqual(["notify"]);
  });

  it("announces success politely and errors assertively", () => {
    render(<Toaster />);
    act(() => { toast.success("Stock synced"); });
    expect(politeRegion()).toHaveTextContent("Stock synced");
    expect(politeRegion()).toHaveAttribute("aria-live", "polite");
    act(() => { toast.error("Payment declined", { description: "Card refused" }); });
    expect(assertiveRegion()).toHaveTextContent("Payment declined. Card refused");
    expect(assertiveRegion()).toHaveAttribute("aria-live", "assertive");
    expect(politeRegion()).not.toHaveTextContent("Payment declined");
    expect(voices()).toEqual(["notify", "error"]);
  });

  it("silent toasts announce but do not play", () => {
    render(<Toaster />);
    act(() => { toast.info("Background sync", { silent: true }); });
    expect(politeRegion()).toHaveTextContent("Background sync");
    expect(play).not.toHaveBeenCalled();
  });

  it("reusing an id replaces the toast in place; toast.update patches it", () => {
    render(<Toaster />);
    act(() => { toast("Draft", { id: "x" }); });
    act(() => { toast.success("Published", { id: "x" }); });
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveAttribute("data-type", "success");
    act(() => toast.update("x", { title: "Published to 14 retailers" }));
    expect(screen.getAllByText("Published to 14 retailers").length).toBeGreaterThan(0);
  });

  it("routes toasts to the Toaster with the matching id", () => {
    render(<><Toaster id="a" label="A" /><Toaster id="b" label="B" /></>);
    act(() => { toast("For B", { toaster: "b" }); });
    const a = screen.getByRole("region", { name: /^A/ });
    const b = screen.getByRole("region", { name: /^B/ });
    expect(within(a).queryAllByRole("listitem", { hidden: true })).toHaveLength(0);
    expect(within(b).getAllByRole("listitem", { hidden: true })).toHaveLength(1);
  });

  it("caps the stack at maxVisible; back toasts are hidden and inert until fanned out", () => {
    render(<Toaster maxVisible={3} />);
    act(() => { ["one", "two", "three", "four"].forEach((t) => toast(t)); });
    const li = items();
    expect(li).toHaveLength(3);
    expect(li[0]).toHaveTextContent("four"); // newest at the front
    expect(li[0]).not.toHaveAttribute("aria-hidden");
    expect(li[1]).toHaveAttribute("aria-hidden", "true");
    expect(li[1]).toHaveAttribute("inert");
    expect(screen.getByText("1 more notification waiting")).toBeInTheDocument();
    // focusing into the stack fans it out: every toast becomes reachable
    act(() => item("four").querySelector("button")!.focus());
    for (const el of items()) {
      expect(el).not.toHaveAttribute("aria-hidden");
      expect(el).not.toHaveAttribute("inert");
    }
  });
});

describe("dismissal", () => {
  it("close button dismisses with reason 'close' and plays dismiss", async () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => { toast("Archived #2041", { onDismiss }); });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledWith("close");
    expect(voices()).toContain("dismiss");
    await waitFor(() => expect(items()).toHaveLength(0));
  });

  it("Escape on a focused toast dismisses it", async () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => { toast("Saved", { onDismiss }); });
    act(() => screen.getByRole("button", { name: "Dismiss notification" }).focus());
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledWith("escape");
  });

  it("non-dismissible toasts have no close button and ignore Escape", async () => {
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => { toast("Locked", { dismissible: false, action: { label: "Open", onClick: () => {} }, onDismiss }); });
    expect(screen.queryByRole("button", { name: "Dismiss notification" })).toBeNull();
    act(() => screen.getByRole("button", { name: "Open" }).focus());
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("toast.dismiss() removes one or all", () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const onC = vi.fn();
    render(<Toaster />);
    let a = "";
    act(() => { a = toast("A", { onDismiss: onA }); toast("B", { onDismiss: onB }); toast("C", { onDismiss: onC }); });
    act(() => toast.dismiss(a));
    expect(onA).toHaveBeenCalledWith("programmatic");
    expect(onB).not.toHaveBeenCalled();
    act(() => toast.dismiss());
    expect(onB).toHaveBeenCalledWith("programmatic");
    expect(onC).toHaveBeenCalledWith("programmatic");
    expect(play).not.toHaveBeenCalledWith("dismiss"); // programmatic dismissals are silent
  });

  it("auto-dismisses after its duration with reason 'timeout'", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => { toast.success("Saved", { onDismiss }); });
    act(() => { vi.advanceTimersByTime(3900); });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onDismiss).toHaveBeenCalledWith("timeout");
  });

  it("pauses the timer while hovered and resumes on leave", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() => { toast("Saved", { duration: 1000, onDismiss }); });
    const list = screen.getByRole("list");
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerEnter(list, { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(list, { pointerType: "mouse" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(onDismiss).not.toHaveBeenCalled(); // ~400 ms were left
    act(() => { vi.advanceTimersByTime(200); });
    expect(onDismiss).toHaveBeenCalledWith("timeout");
  });

  it("an action button runs and closes the toast", async () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => { toast.error("Payment declined", { action: { label: "Retry", onClick } }); });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(items()).toHaveLength(0));
  });
});

describe("undo", () => {
  it("Undo reverses the action, confirms, and turns the toast into a quiet receipt", async () => {
    const onUndo = vi.fn();
    const onCommit = vi.fn();
    render(<Toaster />);
    act(() => { toast("Archived #2041", { undo: { onUndo, onCommit, doneTitle: "Restored #2041" } }); });
    const btn = screen.getByRole("button", { name: /Undo/ });
    expect(btn).toHaveAttribute("aria-keyshortcuts", "Control+Z");
    play.mockClear();
    await userEvent.click(btn);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(voices()).toEqual(["confirm"]);
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    expect(items()[0]).toHaveAttribute("data-type", "success");
    expect(screen.getAllByText("Restored #2041").length).toBeGreaterThan(0);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Ctrl+Z triggers the newest undo, but not from inside a text field", async () => {
    const onUndo = vi.fn();
    render(<><input aria-label="field" /><Toaster /></>);
    act(() => { toast("Archived", { undo: { onUndo } }); });
    act(() => screen.getByLabelText("field").focus());
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(onUndo).not.toHaveBeenCalled();
    act(() => screen.getByLabelText("field").blur());
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("commits when the countdown runs out (default 6 s for undo toasts)", () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();
    const onCommit = vi.fn();
    render(<Toaster />);
    act(() => { toast("Archived", { undo: { onUndo, onCommit } }); });
    act(() => { vi.advanceTimersByTime(5900); });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
  });
});

describe("progress and promise", () => {
  it("progress toast updates in place and completes into success", () => {
    render(<Toaster />);
    let id = "";
    act(() => { id = toast.progress("Uploading firmware", { progress: 0.4 }); });
    expect(voices()).toEqual([]); // no notify for a progress toast
    expect(screen.getByRole("progressbar", { hidden: true })).toHaveAttribute("aria-valuenow", "40");
    act(() => toast.update(id, { progress: 0.85 }));
    expect(screen.getByRole("progressbar", { hidden: true })).toHaveAttribute("aria-valuenow", "85");
    act(() => toast.update(id, { type: "success", title: "Firmware installed" }));
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveAttribute("data-type", "success");
    expect(politeRegion()).toHaveTextContent("Firmware installed");
    expect(voices()).toEqual(["complete"]);
  });

  it("toast.promise goes loading → success", async () => {
    render(<Toaster />);
    let resolve!: (n: number) => void;
    const p = new Promise<number>((r) => (resolve = r));
    let ret!: Promise<number>;
    act(() => { ret = toast.promise(p, { loading: "Syncing stock…", success: (n) => `Synced with ${n} retailers`, error: "Sync failed" }); });
    expect(items()[0]).toHaveAttribute("data-type", "progress");
    expect(politeRegion()).toHaveTextContent("Syncing stock…");
    await act(async () => { resolve(14); await p; });
    expect(items()[0]).toHaveAttribute("data-type", "success");
    expect(politeRegion()).toHaveTextContent("Synced with 14 retailers");
    await expect(ret).resolves.toBe(14);
  });

  it("toast.promise goes loading → error (assertive)", async () => {
    render(<Toaster />);
    const p = Promise.reject(new Error("timeout"));
    let ret!: Promise<unknown>;
    act(() => { ret = toast.promise(() => p, { loading: "Syncing…", success: "Synced", error: (e) => `Failed: ${(e as Error).message}` }); });
    await act(async () => { await ret.catch(() => {}); });
    expect(items()[0]).toHaveAttribute("data-type", "error");
    expect(assertiveRegion()).toHaveTextContent("Failed: timeout");
    expect(voices()).toContain("error");
  });
});

describe("keyboard", () => {
  it("Alt+T focuses the newest toast", async () => {
    render(<Toaster />);
    act(() => { toast("Older"); toast("Newest", { action: { label: "View", onClick: () => {} } }); });
    await userEvent.keyboard("{Alt>}t{/Alt}");
    expect(screen.getByRole("button", { name: "View" })).toHaveFocus();
  });

  it("hotkey={false} disables Alt+T", async () => {
    render(<Toaster hotkey={false} />);
    act(() => { toast("Saved"); });
    await userEvent.keyboard("{Alt>}t{/Alt}");
    expect(document.body).toHaveFocus();
    expect(screen.getByRole("region", { name: "Notifications" })).toBeInTheDocument();
  });
});

describe("Callout", () => {
  it("is a note by default, a live alert/status when live, and dismissible", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Callout tone="warning" title="Encoder restock is late" onDismiss={onDismiss}>New estimate 9–10 weeks.</Callout>);
    expect(screen.getByRole("note")).toHaveTextContent("Encoder restock is late");
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(voices()).toEqual(["dismiss"]);
    rerender(<Callout tone="error" live title="Sync failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sync failed");
    rerender(<Callout tone="success" live title="Synced" />);
    expect(screen.getByRole("status")).toHaveTextContent("Synced");
  });
});
