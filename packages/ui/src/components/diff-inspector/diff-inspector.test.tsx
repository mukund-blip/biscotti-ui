import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiffInspector, type DiffHunk } from "./diff-inspector";

const hunks: DiffHunk[] = [
  { id: "a", location: "§ One", lines: [{ type: "del", text: "old one" }, { type: "add", text: "new one" }] },
  { id: "b", location: "§ Two", lines: [{ type: "add", text: "added two" }] },
];

describe("DiffInspector", () => {
  it("accepts and rejects via buttons and reports resolution", async () => {
    const onResolve = vi.fn();
    render(<DiffInspector hunks={hunks} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole("button", { name: /Accept change 1/ }));
    expect(screen.getByRole("listitem", { name: /Change 1 of 2.*accepted/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Reject change 2/ }));
    expect(onResolve).toHaveBeenCalledWith({ a: "accepted", b: "rejected" });
  });

  it("Enter on a focused Reject button rejects (does not accept) — regression", async () => {
    render(<DiffInspector hunks={hunks} />);
    const reject = screen.getByRole("button", { name: /Reject change 1/ });
    reject.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("listitem", { name: /Change 1 of 2.*rejected/ })).toBeInTheDocument();
  });

  it("supports J/K navigation, A to accept and U to undo the last decision", async () => {
    render(<DiffInspector hunks={hunks} />);
    const first = screen.getByRole("listitem", { name: /Change 1/ });
    first.focus();
    await userEvent.keyboard("j");
    expect(screen.getByRole("listitem", { name: /Change 2/ })).toHaveFocus();
    await userEvent.keyboard("a");
    expect(screen.getByRole("listitem", { name: /Change 2 of 2.*accepted/ })).toBeInTheDocument();
    screen.getByRole("listitem", { name: /Change 2/ }).focus();
    await userEvent.keyboard("u");
    expect(screen.getByRole("listitem", { name: /Change 2 of 2.*pending/ })).toBeInTheDocument();
  });

  it("bulk accept treats the whole action as one undoable transaction and exposes progress", async () => {
    render(<DiffInspector hunks={hunks} />);
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(screen.getByRole("progressbar", { name: "Changes reviewed" })).toHaveAttribute("aria-valuenow", "2");
    screen.getByRole("listitem", { name: /Change 1/ }).focus();
    await userEvent.keyboard("u");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("respects controlled decisions", () => {
    render(<DiffInspector hunks={hunks} decisions={{ a: "accepted" }} />);
    expect(within(screen.getByRole("progressbar")).queryByText("1/2")).toBeInTheDocument();
  });
});
