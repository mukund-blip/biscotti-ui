import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThinkingTimeline, type TimelineStep } from "./thinking-timeline";

const running: TimelineStep[] = [
  { id: "a", title: "Reading", doneTitle: "Read", status: "done", durationMs: 1000 },
  { id: "b", title: "Searching", status: "running" },
];

describe("ThinkingTimeline", () => {
  it("shows the run and names the header without the ticking timer", () => {
    render(<ThinkingTimeline steps={running} state="running" elapsedMs={1500} />);
    const header = screen.getByRole("button", { expanded: true });
    expect(header).toHaveAccessibleName("Working · step 2 of 2");
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("turns past tense and auto-collapses after completion", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<ThinkingTimeline steps={running} state="running" elapsedMs={1500} />);
    rerender(<ThinkingTimeline steps={running.map((s) => ({ ...s, status: "done" }))} state="done" elapsedMs={5200} />);
    expect(screen.getByRole("button", { name: "Worked for 5.2s" })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(500));
    expect(screen.getByRole("button", { name: "Worked for 5.2s" })).toHaveAttribute("aria-expanded", "false");
    vi.useRealTimers();
  });

  it("does not auto-collapse once the user has toggled it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = render(<ThinkingTimeline steps={running} state="running" elapsedMs={1} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { expanded: true }));
    await user.click(screen.getByRole("button", { expanded: false }));
    rerender(<ThinkingTimeline steps={running} state="done" elapsedMs={2000} />);
    await act(async () => vi.advanceTimersByTime(800));
    expect(screen.getByRole("button", { name: /Worked for/ })).toHaveAttribute("aria-expanded", "true");
    vi.useRealTimers();
  });
});
