import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrecisionToggle } from "./precision-toggle";

describe("PrecisionToggle", () => {
  it("toggles with keyboard and exposes switch semantics", async () => {
    const onChange = vi.fn();
    render(<PrecisionToggle label="MIDI sync" onCheckedChange={onChange} />);
    const sw = screen.getByRole("switch", { name: "MIDI sync" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    sw.focus();
    await userEvent.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("clicking the label toggles — regression", async () => {
    render(<PrecisionToggle label="Sustain" />);
    await userEvent.click(screen.getByText("Sustain"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("is provisional while a promise is pending and reverts with a message on rejection", async () => {
    let reject!: (e: unknown) => void;
    render(<PrecisionToggle label="Beta" onCheckedChange={() => new Promise((_, r) => (reject = r))} />);
    const sw = screen.getByRole("switch");
    await userEvent.click(screen.getByText("Beta"));
    expect(sw).toHaveAttribute("aria-busy", "true");
    expect(sw).toHaveAttribute("aria-checked", "true");
    await act(async () => reject(new Error("no")));
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("status")).toHaveTextContent(/Couldn’t save/);
  });

  it("controlled value wins and disabled ignores input", async () => {
    const { rerender } = render(<PrecisionToggle aria-label="x" checked={false} />);
    rerender(<PrecisionToggle aria-label="x" checked />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    rerender(<PrecisionToggle aria-label="x" checked disabled />);
    await userEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("submits like a native checkbox", () => {
    const { container, rerender } = render(<PrecisionToggle aria-label="x" name="sync" defaultChecked={false} />);
    expect(container.querySelector('input[name="sync"]')).toBeNull();
    rerender(<PrecisionToggle aria-label="x" name="sync" checked />);
    expect(container.querySelector('input[name="sync"]')).toHaveValue("on");
  });
});
