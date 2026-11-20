import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ActivityStack, type ActivityTask } from "./activity-stack";

const tasks: ActivityTask[] = [
  { id: "q", title: "Triaging tickets", status: "queued" },
  { id: "p", title: "Translating manual", status: "paused", progress: 0.4, elapsedMs: 2000 },
  { id: "r", title: "Reconciling payments", status: "running", progress: 0.62, elapsedMs: 4000 },
  { id: "f", title: "Checking encoder stock", status: "failed", error: "Mouser API timed out", elapsedMs: 2300 },
  { id: "c1", title: "Exporting sales", doneTitle: "Exported sales", status: "completed", elapsedMs: 3400 },
  { id: "c2", title: "Indexing changelog", doneTitle: "Indexed changelog", status: "completed", elapsedMs: 2100 },
  { id: "x", title: "Drafting notes", status: "cancelled" },
];

function Harness({ initial = tasks }: { initial?: ActivityTask[] }) {
  const [list, setList] = useState(initial);
  const patch = (id: string, p: Partial<ActivityTask>) => setList((l) => l.map((t) => (t.id === id ? { ...t, ...p } : t)));
  return (
    <ActivityStack
      tasks={list}
      capacity={4}
      onPause={(id) => patch(id, { status: "paused" })}
      onResume={(id) => patch(id, { status: "running" })}
      onCancel={(id) => patch(id, { status: "cancelled" })}
      onRetry={(id) => patch(id, { status: "running", error: undefined, progress: 0 })}
    />
  );
}

describe("ActivityStack", () => {
  it("orders running first, then failed, paused, queued, and summarises the header", () => {
    render(<Harness />);
    const active = screen.getByRole("list", { name: "Active tasks" });
    const rows = within(active).getAllByRole("listitem");
    expect(rows.map((r) => r.dataset.activityRow)).toEqual(["r", "f", "p", "q"]);
    expect(screen.getByText("1 running")).toBeInTheDocument();
    expect(screen.getByText("1 failed")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 of 4 slots in use" })).toBeInTheDocument();
  });

  it("compresses finished work into a deck that fans out on demand", async () => {
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: /2 completed/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const deck = screen.getByRole("list", { name: "Finished tasks", hidden: true });
    expect(deck).toHaveAttribute("inert");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(deck).not.toHaveAttribute("inert");
    expect(within(deck).getByText("Exported sales")).toBeInTheDocument();
  });

  it("pause and resume use one button so focus survives the swap", async () => {
    render(<Harness />);
    const pause = screen.getByRole("button", { name: "Pause Reconciling payments" });
    pause.focus();
    await userEvent.keyboard("{Enter}");
    const resume = screen.getByRole("button", { name: "Resume Reconciling payments" });
    expect(resume).toBe(pause);
    expect(resume).toHaveFocus();
  });

  it("retry moves a failed task back to running and keeps focus on that task", async () => {
    render(<Harness />);
    expect(screen.getByText("Mouser API timed out")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry Checking encoder stock" }));
    expect(screen.queryByText("Mouser API timed out")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause Checking encoder stock" })).toHaveFocus();
  });

  it("cancel sends the task to the deck", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel Triaging tickets" }));
    expect(screen.getByRole("button", { name: /2 completed.*2 cancelled/ })).toBeInTheDocument();
  });

  it("announces failures and completions, not ticks", () => {
    const base: ActivityTask[] = [{ id: "a", title: "Exporting", doneTitle: "Exported", status: "running", elapsedMs: 100 }];
    const { rerender } = render(<ActivityStack tasks={base} />);
    rerender(<ActivityStack tasks={[{ ...base[0], elapsedMs: 200 }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("");
    act(() => rerender(<ActivityStack tasks={[{ ...base[0], status: "completed" }]} />));
    expect(screen.getByRole("status")).toHaveTextContent("Exported.");
  });

  it("exposes progress and only renders actions that have handlers", () => {
    render(<ActivityStack tasks={[tasks[2]]} />);
    expect(screen.getByRole("progressbar", { name: "Reconciling payments" })).toHaveAttribute("aria-valuenow", "62");
    expect(screen.queryByRole("button", { name: /Pause/ })).not.toBeInTheDocument();
  });

  it("supports a controlled deck", async () => {
    const onChange = vi.fn();
    render(<ActivityStack tasks={tasks} deckOpen={false} onDeckOpenChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /2 completed/ }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /2 completed/ })).toHaveAttribute("aria-expanded", "false");
  });
});
