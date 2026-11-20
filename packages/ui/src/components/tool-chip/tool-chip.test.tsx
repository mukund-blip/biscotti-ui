import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { memo } from "react";
import { ToolChip, ToolChipGroup, describeToolCall } from "./tool-chip";

describe("ToolChip", () => {
  it("reads as a past-tense sentence with spoken metadata when done", () => {
    render(<ToolChip kind="edit" target="firmware/src/input/encoder.ts" added={12} removed={3} />);
    const face = screen.getByRole("button", { name: /Edited encoder\.ts/ });
    expect(face).toHaveAccessibleName(expect.stringContaining("12 lines added, 3 removed"));
    expect(face).toHaveAttribute("aria-expanded", "false");
    expect(face).not.toHaveAttribute("aria-busy");
    expect(face).toHaveAttribute("title", "firmware/src/input/encoder.ts");
  });

  it("uses the present tense and aria-busy while pending, and announces completion", () => {
    const { rerender } = render(<ToolChip kind="command" status="pending" target="pnpm test" />);
    const face = screen.getByRole("button", { name: /Running pnpm test/ });
    expect(face).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<ToolChip kind="command" status="error" target="pnpm test" exitCode={1} />);
    expect(screen.getByRole("button", { name: /Ran pnpm test/ })).toHaveAccessibleName(expect.stringContaining("exit code 1"));
    expect(screen.getByRole("status")).toHaveTextContent("Ran pnpm test, exit code 1, failed");
  });

  it("does not announce the state a chip mounts in", () => {
    render(<ToolChip kind="read" target="a/b.ts" lines={[1, 20]} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("Enter and Space toggle the detail card with input, output and duration", async () => {
    const user = userEvent.setup();
    render(
      <ToolChip kind="search" target="DETENT_THRESHOLD" results={2} durationMs={836} args={{ pattern: "DETENT_THRESHOLD", path: "firmware/" }} output={["src/a.ts:4  const X = 3;", "src/b.ts:9  X"]} />,
    );
    const face = screen.getByRole("button", { name: /Searched/ });
    face.focus();
    await user.keyboard("{Enter}");
    expect(face).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region");
    expect(face).toHaveAttribute("aria-controls", region.id);
    expect(within(region).getByText("pattern")).toBeInTheDocument();
    expect(within(region).getByText("src/a.ts:4")).toBeInTheDocument();
    expect(screen.getByText("0.8s")).toBeInTheDocument();
    await user.keyboard(" ");
    expect(face).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape inside the card collapses it and returns focus to the chip", async () => {
    const user = userEvent.setup();
    render(<ToolChip kind="command" target="pnpm test" exitCode={0} output={["ok"]} defaultOpen />);
    await user.click(screen.getByRole("button", { name: "Copy output" }));
    await user.keyboard("{Escape}");
    const face = screen.getByRole("button", { name: /Ran pnpm test/ });
    expect(face).toHaveAttribute("aria-expanded", "false");
    expect(face).toHaveFocus();
  });

  it("commands show the last three output lines until Show all", async () => {
    const user = userEvent.setup();
    const lines = ["one", "two", "three", "four", "five"];
    render(<ToolChip kind="command" target="make" exitCode={2} status="error" output={lines} defaultOpen />);
    expect(screen.queryByText("one")).toBeNull();
    expect(screen.getByText("five")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2 earlier lines/ }));
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("supports controlled open state", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<ToolChip kind="fetch" target="https://ci.ostra.dev/x" httpStatus={200} open={false} onOpenChange={onOpenChange} />);
    const face = screen.getByRole("button", { name: /Fetched ci\.ostra\.dev\/x/ });
    await user.click(face);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(face).toHaveAttribute("aria-expanded", "false");
    rerender(<ToolChip kind="fetch" target="https://ci.ostra.dev/x" httpStatus={200} open onOpenChange={onOpenChange} />);
    expect(face).toHaveAttribute("aria-expanded", "true");
    // With no args, the full URL is listed as input.
    expect(screen.getByText("https://ci.ostra.dev/x")).toBeInTheDocument();
  });

  it("describes failures that never ran", () => {
    expect(describeToolCall({ kind: "edit", status: "error", target: "a/b.ts" })).toBe("Couldn’t edit b.ts, failed");
    expect(describeToolCall({ kind: "fetch", status: "error", target: "https://x.dev", httpStatus: 503 })).toBe("Fetched x.dev, HTTP 503, failed");
    expect(describeToolCall({ kind: "edit", status: "pending", target: "a/b.ts", verb: { pending: "Patching" } })).toBe("Patching b.ts");
  });

  it("counts elapsed time from when the call became pending, even while collapsed", () => {
    vi.useFakeTimers();
    try {
      render(<ToolChip kind="command" status="pending" target="pnpm test" />);
      act(() => vi.advanceTimersByTime(3000));
      fireEvent.click(screen.getByRole("button", { name: /Running pnpm test/ }));
      expect(screen.getByText("3.0s")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByText("3.5s")).toBeInTheDocument();
      // The timer never leaks into the accessible name.
      expect(screen.getByRole("button", { name: /Running pnpm test/ })).not.toHaveAccessibleName(expect.stringContaining("3.5"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts from startedAt when given", () => {
    vi.useFakeTimers();
    try {
      render(<ToolChip kind="fetch" status="pending" target="https://ci.ostra.dev/x" startedAt={Date.now() - 12_400} defaultOpen />);
      expect(screen.getByText("12.4s")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("truncates long URLs in the middle but keeps the full target in the name and tooltip", () => {
    const url = "https://ci.ostra.dev/os-1/firmware/pipelines/412";
    render(<ToolChip kind="fetch" target={url} httpStatus={200} />);
    expect(screen.getByText("ci.ostra.dev/…/pipelines/412")).toBeInTheDocument();
    const face = screen.getByRole("button", { name: /^Fetched ci\.ostra\.dev\/os-1\/firmware\/pipelines\/412, HTTP 200$/ });
    expect(face).toHaveAttribute("title", url);
  });

  it("shows a quiet 1 Hz clock on a collapsed pending chip after 3 s", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<ToolChip kind="command" status="pending" target="pnpm build" />);
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.queryByText("2s")).toBeNull();
      act(() => vi.advanceTimersByTime(1000));
      const clock = screen.getByText("3s");
      expect(clock.closest("[aria-hidden]")).not.toBeNull();
      expect(clock).toHaveClass("text-muted", "tabular");
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByText("4s")).toBeInTheDocument();
      // Never in the accessible name.
      expect(screen.getByRole("button")).toHaveAccessibleName("Running pnpm build");
      expect(container.querySelectorAll(".text-pencil").length).toBe(1); // the spinner stays the only pencil mark
    } finally {
      vi.useRealTimers();
    }
  });

  it("always splits the diff bar proportionally across five cells, keeping each non-zero side", () => {
    const cells = (added: number, removed: number) => {
      const { container, unmount } = render(<ToolChip kind="edit" target="a.ts" added={added} removed={removed} />);
      const kinds = Array.from(container.querySelectorAll("[data-cell]")).map((el) => el.getAttribute("data-cell"));
      unmount();
      return kinds.join(",");
    };
    expect(cells(2, 1)).toBe("add,add,add,del,del");
    expect(cells(1, 0)).toBe("add,add,add,add,add");
    expect(cells(12, 3)).toBe("add,add,add,add,del");
    expect(cells(200, 1)).toBe("add,add,add,add,del");
    expect(cells(1, 200)).toBe("add,del,del,del,del");
    expect(cells(0, 0)).toBe("none,none,none,none,none");
  });

  it("marks output lines red only on real failure signals", () => {
    const lines = [
      "No error found",
      "0 failed, 24 passed",
      "handles error paths",
      " ✗ accel.test.ts > clamps velocity",
      " FAIL src/input/accel.test.ts",
      "Error: ENOENT: no such file",
      "TypeError: x is undefined",
      " Tests  1 failed | 23 passed (24)",
      "Process exited with code 2",
    ];
    render(<ToolChip kind="command" status="error" target="make" exitCode={1} output={lines} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: /earlier lines/ }));
    const red = (text: string) => screen.getByText(text.trim(), { normalizer: (s) => s.trim() }).classList.contains("text-err");
    expect(red("No error found")).toBe(false);
    expect(red("0 failed, 24 passed")).toBe(false);
    expect(red("handles error paths")).toBe(false);
    for (const l of lines.slice(3)) expect(red(l)).toBe(true);
  });
});

describe("ToolChipGroup", () => {
  const calls = (lastStatus: "pending" | "done") => [
    <ToolChip key="r" kind="read" target="src/encoder.ts" durationMs={400} />,
    <ToolChip key="e1" kind="edit" target="src/encoder.ts" added={12} removed={3} durationMs={1200} />,
    <ToolChip key="t" kind="command" status="error" target="pnpm test" exitCode={1} durationMs={2000} />,
    <ToolChip key="e2" kind="edit" status={lastStatus} target="src/accel.ts" added={2} removed={1} durationMs={600} />,
  ];

  it("announces chip outcomes through one group live region, even while collapsed", () => {
    const { rerender } = render(<ToolChipGroup>{calls("pending")}</ToolChipGroup>);
    // Exactly one exposed live region (the chips' own are not rendered inside a group).
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    rerender(<ToolChipGroup>{calls("done")}</ToolChipGroup>);
    expect(screen.getByRole("status")).toHaveTextContent("Edited accel.ts, 2 lines added, 1 removed");
  });

  it("shows a quiet, non-interactive Starting state with no calls", () => {
    const { rerender } = render(<ToolChipGroup>{[]}</ToolChipGroup>);
    expect(screen.getByText("Starting…")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/0 tool calls/)).toBeNull();
    rerender(<ToolChipGroup>{[<ToolChip key="r" kind="read" status="pending" target="src/encoder.ts" />]}</ToolChipGroup>);
    expect(screen.queryByText("Starting…")).toBeNull();
    expect(screen.getByRole("button", { name: /Reading encoder\.ts, 1 tool call so far/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("counts chips that are wrapped, memoised or in fragments, in document order", () => {
    const Wrapped = memo(function Wrapped({ status }: { status: "pending" | "done" }) {
      return <ToolChip kind="command" status={status} target="pnpm test" exitCode={status === "done" ? 0 : undefined} />;
    });
    const { rerender } = render(
      <ToolChipGroup>
        <>
          <ToolChip kind="read" target="src/a.ts" />
          <ToolChip kind="edit" target="src/a.ts" added={1} removed={0} />
        </>
        {null}
        <Wrapped status="pending" />
      </ToolChipGroup>,
    );
    expect(screen.getByRole("button", { name: /^Running pnpm test, 3 tool calls so far$/ })).toBeInTheDocument();
    const ticks = within(screen.getByRole("toolbar", { name: "Jump to call" })).getAllByRole("button");
    expect(ticks.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Go to call 1: Read a.ts",
      "Go to call 2: Edited a.ts, 1 line added, 0 removed",
      "Go to call 3: Running pnpm test",
    ]);
    rerender(
      <ToolChipGroup>
        <ToolChip kind="read" target="src/a.ts" />
        <Wrapped status="done" />
      </ToolChipGroup>,
    );
    expect(screen.getByRole("button", { name: /^2 tool calls$/ })).toBeInTheDocument();
  });

  it("hovering or focusing a tick reads that call out in the header's text slot, visually only", async () => {
    const user = userEvent.setup();
    const { container } = render(<ToolChipGroup>{calls("done")}</ToolChipGroup>);
    const readout = container.querySelector("[data-tick-readout]")!;
    expect(readout).toHaveAttribute("aria-hidden", "true");
    expect(readout).toHaveAttribute("data-tick-readout", "off");
    const ticks = within(screen.getByRole("toolbar", { name: "Jump to call" })).getAllByRole("button");
    await user.hover(ticks[2]);
    expect(readout).toHaveAttribute("data-tick-readout", "on");
    // Outcome first, so a narrow slot only ever truncates the call text.
    expect(readout.textContent).toMatch(/^Failed · exit 1 · Ran pnpm test/);
    expect(container.querySelector("[data-head-text]")!.parentElement).toHaveClass("opacity-0");
    // Not announced: the live region is untouched.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await user.unhover(ticks[2]);
    expect(readout).toHaveAttribute("data-tick-readout", "off");
    expect(container.querySelector("[data-head-text]")!.parentElement).toHaveClass("opacity-100");
    // Focus drives it too.
    act(() => ticks[0].focus());
    expect(readout).toHaveTextContent("Read encoder.ts");
    act(() => ticks[0].blur());
    expect(readout).toHaveAttribute("data-tick-readout", "off");
  });

  it("the tick ruler is a one-stop toolbar that jumps to a call, expanding the group", async () => {
    const user = userEvent.setup();
    render(<ToolChipGroup>{calls("done")}</ToolChipGroup>);
    const toolbar = screen.getByRole("toolbar", { name: "Jump to call" });
    const ticks = within(toolbar).getAllByRole("button");
    expect(ticks).toHaveLength(4);
    // One tab stop (the latest call), arrows move between ticks.
    expect(ticks.filter((t) => t.tabIndex === 0)).toEqual([ticks[3]]);
    ticks[3].focus();
    await user.keyboard("{ArrowLeft}");
    expect(ticks[2]).toHaveFocus();
    expect(ticks[2]).toHaveAccessibleName("Go to call 3: Ran pnpm test, exit code 1, failed");
    await user.keyboard("{Home}");
    expect(ticks[0]).toHaveFocus();
    await user.keyboard("{End}{ArrowLeft}{Enter}");
    // The group opened and the chip's face took focus.
    expect(screen.getByRole("button", { name: /tool calls/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Ran pnpm test/ })).toHaveFocus();
  });

  it("summarises calls and changed files, and expands to the list", async () => {
    const user = userEvent.setup();
    render(<ToolChipGroup>{calls("done")}</ToolChipGroup>);
    const head = screen.getByRole("button", { name: /4 tool calls · 2 files changed · 1 failed/ });
    expect(head).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list")).toBeNull();
    await user.click(head);
    expect(head).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("list", { name: "Tool calls" })).getAllByRole("listitem")).toHaveLength(4);
  });

  it("names the active call while running and collapsed", () => {
    render(<ToolChipGroup>{calls("pending")}</ToolChipGroup>);
    const head = screen.getByRole("button", { name: /^Editing accel\.ts/ });
    // A failure is never pinned on the active call.
    expect(head).toHaveAccessibleName("Editing accel.ts, 4 tool calls so far, 1 earlier call failed");
    expect(screen.queryByText(/· 1 failed/)).toBeNull();
  });

  it("is controllable", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ToolChipGroup open={false} onOpenChange={onOpenChange}>{calls("done")}</ToolChipGroup>);
    await user.click(screen.getByRole("button", { name: /tool calls/ }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("accepts a custom summary", () => {
    render(<ToolChipGroup summary={(s) => `${s.total} steps, ${s.filesChanged} edits`}>{calls("done")}</ToolChipGroup>);
    expect(screen.getByRole("button", { name: /4 steps, 2 edits/ })).toBeInTheDocument();
  });

  it("chips inside an open group expand independently", async () => {
    const user = userEvent.setup();
    render(<ToolChipGroup defaultOpen>{calls("done")}</ToolChipGroup>);
    const chip = screen.getByRole("button", { name: /^Ran pnpm test/ });
    await act(async () => chip.click());
    expect(chip).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /^Read encoder\.ts/ })).toHaveAttribute("aria-expanded", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-expanded", "false");
  });

  it("remembers which chips were open across a group collapse", async () => {
    const user = userEvent.setup();
    render(<ToolChipGroup defaultOpen>{calls("done")}</ToolChipGroup>);
    await user.click(screen.getByRole("button", { name: /^Ran pnpm test/ }));
    const head = screen.getByRole("button", { name: /tool calls/ });
    await user.click(head);
    expect(screen.queryByRole("button", { name: /^Ran pnpm test/ })).toBeNull();
    await user.click(head);
    expect(screen.getByRole("button", { name: /^Ran pnpm test/ })).toHaveAttribute("aria-expanded", "true");
  });
});
