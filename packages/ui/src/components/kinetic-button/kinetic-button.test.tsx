import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KineticButton, KineticButtonGroup } from "./kinetic-button";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("KineticButton", () => {
  it("is a plain button for sync handlers (mouse, Enter, Space)", async () => {
    const onClick = vi.fn();
    render(<KineticButton onClick={onClick}>Copy link</KineticButton>);
    const btn = screen.getByRole("button", { name: "Copy link" });
    await userEvent.click(btn);
    btn.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(3);
    expect(btn).toHaveAttribute("data-state", "idle");
  });

  it("runs the async lifecycle from a returned Promise: pending → success → idle", async () => {
    const d = deferred();
    const onStateChange = vi.fn();
    render(
      <KineticButton onClick={() => d.promise} pendingLabel="Exporting" successLabel="Exported" successDuration={60} onStateChange={onStateChange}>
        Export bank
      </KineticButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Export bank" }));
    const btn = screen.getByRole("button", { name: "Exporting" });
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Exporting");
    await act(async () => d.resolve());
    expect(screen.getByRole("button", { name: "Exported" })).toHaveAttribute("data-state", "success");
    await waitFor(() => expect(screen.getByRole("button", { name: "Export bank" })).toHaveAttribute("data-state", "idle"));
    expect(onStateChange.mock.calls.map((c) => c[0])).toEqual(["pending", "success", "idle"]);
  });

  it("ignores clicks while pending, shows the error label on rejection, and retries", async () => {
    let d = deferred();
    const onClick = vi.fn(() => d.promise);
    render(
      <KineticButton onClick={onClick} pendingLabel="Sending" errorLabel="Retry send">
        Send
      </KineticButton>,
    );
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
    await act(async () => d.reject(new Error("no")));
    const btn = screen.getByRole("button", { name: "Retry send" });
    expect(btn).toHaveAttribute("aria-invalid", "true");
    d = deferred();
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Sending" })).toBeInTheDocument();
  });

  it("honours a controlled state", () => {
    const { rerender } = render(<KineticButton state="pending" pendingLabel="Saving">Save</KineticButton>);
    expect(screen.getByRole("button", { name: "Saving" })).toHaveAttribute("aria-busy", "true");
    rerender(<KineticButton state="error" errorLabel="Retry save">Save</KineticButton>);
    expect(screen.getByRole("button", { name: "Retry save" })).toHaveAttribute("data-state", "error");
  });

  it("hold-to-confirm: a short press does nothing; a full keyboard hold runs the action", async () => {
    const onClick = vi.fn();
    render(
      <KineticButton holdToConfirm={80} variant="danger" onClick={onClick}>
        Hold to delete
      </KineticButton>,
    );
    const btn = screen.getByRole("button", { name: "Hold to delete" });
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.keyDown(btn, { key: " " });
    await waitFor(() => expect(onClick).toHaveBeenCalledTimes(1), { timeout: 1000 });
    fireEvent.keyUp(btn, { key: " " });
    expect(btn).toHaveAttribute("aria-description", "Press and hold to confirm");
  });

  it("hold released early drains back without running", async () => {
    const onClick = vi.fn();
    render(<KineticButton holdToConfirm={400} onClick={onClick}>Hold to delete</KineticButton>);
    const btn = screen.getByRole("button");
    fireEvent.pointerDown(btn, { button: 0, pointerId: 1 });
    await new Promise((r) => setTimeout(r, 60));
    fireEvent.pointerUp(btn, { button: 0, pointerId: 1 });
    await new Promise((r) => setTimeout(r, 500));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled ignores input; group exposes role=group and passes defaults", async () => {
    const onClick = vi.fn();
    render(
      <KineticButtonGroup aria-label="Patch actions" variant="secondary">
        <KineticButton onClick={onClick} disabled>Audition</KineticButton>
        <KineticButton aria-label="Share patch" icon="external" />
      </KineticButtonGroup>,
    );
    expect(screen.getByRole("group", { name: "Patch actions" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Audition" }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Share patch" })).toHaveAttribute("data-variant", "secondary");
  });
});
