import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, CommandPaletteDialog, fuzzyMatch, type CommandGroupDef } from "./command-palette";

const make = (spy = vi.fn()): CommandGroupDef[] => [
  { id: "sugg", label: "Suggestions", showWhen: "idle", items: [{ id: "assign", title: "Assign ticket", onSelect: () => spy("assign") }] },
  {
    id: "nav",
    label: "Navigation",
    items: [
      { id: "inbox", title: "Inbox", onSelect: () => spy("inbox") },
      { id: "suppliers", title: "Suppliers", keywords: ["vendors"], onSelect: () => spy("suppliers") },
      { id: "off", title: "Disabled thing", disabled: true },
    ],
  },
  {
    id: "act",
    label: "Actions",
    items: [
      {
        id: "status",
        title: "Change ticket status",
        page: {
          id: "status",
          title: "Status",
          groups: [{ id: "s", label: "Statuses", items: [{ id: "open", title: "Open", onSelect: () => spy("open") }, { id: "resolved", title: "Resolved", onSelect: () => spy("resolved") }] }],
        },
      },
    ],
  },
];

describe("fuzzyMatch", () => {
  it("matches subsequences, ignores spaces and prefers word starts", () => {
    expect(fuzzyMatch("zz", "Inbox")).toBeNull();
    const r = fuzzyMatch("chg stat", "Change ticket status")!;
    expect(r).not.toBeNull();
    expect(r.indices[0]).toBe(0);
    expect(r.indices.slice(-4)).toEqual([14, 15, 16, 17]);
    expect(fuzzyMatch("sup", "Suppliers")!.score).toBeGreaterThan(fuzzyMatch("sup", "New support ticket")!.score);
  });
});

describe("CommandPalette", () => {
  it("exposes combobox/listbox ARIA and moves the active option with arrows", async () => {
    render(<CommandPalette groups={make()} autoFocus />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);
    // wraps, skipping disabled
    await userEvent.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("option", { name: /Change ticket status/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Disabled thing" })).toHaveAttribute("aria-disabled", "true");
  });

  it("filters, ranks and searches keywords; idle-only groups hide while searching", async () => {
    render(<CommandPalette groups={make()} autoFocus />);
    await userEvent.type(screen.getByRole("combobox"), "vendors");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Suppliers"]);
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "ass");
    expect(screen.queryByText("Suggestions")).toBeNull();
    await userEvent.clear(screen.getByRole("combobox"));
    await userEvent.type(screen.getByRole("combobox"), "qqq");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/No commands match/)).toBeInTheDocument();
  });

  it("runs on Enter and reports the path; nested pages push and Backspace pops", async () => {
    const spy = vi.fn();
    const onRun = vi.fn();
    render(<CommandPalette groups={make(spy)} onRun={onRun} autoFocus />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "chg stat{Enter}");
    expect(screen.getByRole("listbox", { name: "Status" })).toBeInTheDocument();
    expect(input).toHaveValue("");
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByRole("listbox", { name: "Commands" })).toBeInTheDocument();
    expect(input).toHaveValue("chg stat"); // the parent query is restored
    await userEvent.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(spy).toHaveBeenCalledWith("resolved");
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ id: "resolved" }), ["Status"]);
  });

  it("Escape pops a page, then dismisses at the root", async () => {
    const onDismiss = vi.fn();
    render(<CommandPalette groups={make()} onDismiss={onDismiss} autoFocus />);
    await userEvent.type(screen.getByRole("combobox"), "status{Enter}");
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows async sources with a loading row, then results", async () => {
    // Fake only timeouts (the debounce). Faking rAF / performance.now would leave motion's
    // shared frame loop on a stale clock and stall exit animations in later tests.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    let resolve!: (v: { id: string; title: string }[]) => void;
    const search = vi.fn(() => new Promise<{ id: string; title: string }[]>((r) => (resolve = r)));
    render(<CommandPalette groups={make()} sources={[{ id: "orders", label: "Orders", search, debounce: 0 }]} autoFocus />);
    await userEvent.type(screen.getByRole("combobox"), "lena");
    expect(screen.getByText("Searching orders…")).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(10); });
    await act(async () => resolve([{ id: "o1", title: "Lena Fischer" }]));
    expect(screen.getByRole("option", { name: /Lena Fischer/ })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("controlled query", async () => {
    const onQueryChange = vi.fn();
    const { rerender } = render(<CommandPalette groups={make()} query="inb" onQueryChange={onQueryChange} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Inbox"]);
    await userEvent.type(screen.getByRole("combobox"), "x");
    expect(onQueryChange).toHaveBeenCalledWith("inbx");
    rerender(<CommandPalette groups={make()} query="" onQueryChange={onQueryChange} />);
    expect(screen.getByText("Suggestions")).toBeInTheDocument();
  });
});

describe("CommandPaletteDialog", () => {
  it("opens with mod+K, is a modal dialog, closes on Escape and restores focus", async () => {
    const onOpenChange = vi.fn();
    render(<><button>opener</button><CommandPaletteDialog groups={make()} onOpenChange={onOpenChange} /></>);
    const opener = screen.getByText("opener");
    opener.focus();
    await userEvent.keyboard("{Control>}k{/Control}");
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("combobox")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 3000 });
    await vi.waitFor(() => expect(opener).toHaveFocus());
  });
});
