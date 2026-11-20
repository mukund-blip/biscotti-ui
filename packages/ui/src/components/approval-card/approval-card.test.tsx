import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { sound } from "../../sound/engine";
import { ApprovalCard, ApprovalEmailPreview, type ApprovalCardProps, type ApprovalDecision } from "./approval-card";

const sleep = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

const base = {
  action: "Email the firmware 2.4 release notes to all 214 beta testers.",
  summary: "Firmware 2.4 email",
  scope: [{ value: "214", label: "recipients" }],
  rationale: "38 testers asked about the arp fix.",
  reviewer: "Mara Lind",
};

describe("ApprovalCard", () => {
  it("shows what, scope, risk as text and why", () => {
    render(<ApprovalCard {...base} risk="medium" />);
    expect(screen.getByRole("region", { name: base.action })).toBeInTheDocument();
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.getByText(base.rationale)).toBeInTheDocument();
  });

  it("approve collapses to a receipt, fires onDecisionChange, then onCommit after the undo window", async () => {
    const onDecisionChange = vi.fn();
    const onCommit = vi.fn();
    render(<ApprovalCard {...base} undoWindow={120} onDecisionChange={onDecisionChange} onCommit={onCommit} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onDecisionChange).toHaveBeenCalledWith(expect.objectContaining({ outcome: "approved", by: "Mara Lind" }));
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => /Approved: Firmware 2.4 email\. Undo available/.test(el.textContent ?? ""))).toBe(true);
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo approval" })).not.toBeInTheDocument());
  });

  it("undo within the window restores the pending card and never commits", async () => {
    const onCommit = vi.fn();
    const onDecisionChange = vi.fn();
    render(<ApprovalCard {...base} undoWindow={400} onCommit={onCommit} onDecisionChange={onDecisionChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo rejection" }));
    expect(onDecisionChange).toHaveBeenLastCalledWith(null);
    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("unmounting during the undo window commits the decision once, immediately", async () => {
    const onCommit = vi.fn();
    const { unmount } = render(<ApprovalCard {...base} undoWindow={5000} onCommit={onCommit} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "approved" }));
  });

  it("unmounting after an undo, or after the window already committed, never commits again", async () => {
    const undone = vi.fn();
    const a = render(<ApprovalCard {...base} undoWindow={5000} onCommit={undone} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await userEvent.click(screen.getByRole("button", { name: "Undo approval" }));
    a.unmount();
    expect(undone).not.toHaveBeenCalled();

    const committed = vi.fn();
    const b = render(<ApprovalCard {...base} undoWindow={60} onCommit={committed} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(committed).toHaveBeenCalledTimes(1));
    b.unmount();
    expect(committed).toHaveBeenCalledTimes(1);
  });

  it("request changes opens a labelled textarea; ⌘Enter sends the note; Esc cancels", async () => {
    const onDecisionChange = vi.fn();
    render(<ApprovalCard {...base} onDecisionChange={onDecisionChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const field = await screen.findByRole("textbox", { name: "What should Scout change?" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByRole("button", { name: /Send to Scout/ })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.type(await screen.findByRole("textbox"), "Lead with the arp fix");
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onDecisionChange).toHaveBeenCalledWith(expect.objectContaining({ outcome: "changes", note: "Lead with the arp fix" }));
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
  });

  it("undoing a change request reopens the note with the text kept", async () => {
    render(<ApprovalCard {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.type(await screen.findByRole("textbox"), "Shorter please");
    await userEvent.click(screen.getByRole("button", { name: /Send to Scout/ }));
    await userEvent.click(screen.getByRole("button", { name: "Undo change request" }));
    expect(await screen.findByRole("textbox")).toHaveValue("Shorter please");
  });

  it("high risk requires a hold to approve; a click does nothing", async () => {
    const onDecisionChange = vi.fn();
    render(<ApprovalCard {...base} risk="high" holdDuration={80} onDecisionChange={onDecisionChange} />);
    expect(screen.getByText("High risk")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Hold to approve" });
    expect(btn).toHaveAttribute("aria-description", "Press and hold to confirm");
    await userEvent.click(btn);
    expect(onDecisionChange).not.toHaveBeenCalled();
    fireEvent.keyDown(btn, { key: " " });
    await waitFor(() => expect(onDecisionChange).toHaveBeenCalledWith(expect.objectContaining({ outcome: "approved" })), { timeout: 1000 });
  });

  it("a controlled parent clearing the decision resets the expanded receipt", async () => {
    const d1: ApprovalDecision = { outcome: "approved", at: 1, by: "Mara Lind" };
    const d2: ApprovalDecision = { outcome: "rejected", at: 2, by: "Mara Lind" };
    const { rerender } = render(<ApprovalCard {...base} decision={d1} />);
    await userEvent.click(screen.getByRole("button", { name: "Show request" }));
    expect(screen.getByRole("button", { name: "Hide request" })).toHaveAttribute("aria-expanded", "true");
    rerender(<ApprovalCard {...base} decision={null} />);
    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    rerender(<ApprovalCard {...base} decision={d2} />);
    expect(await screen.findByRole("button", { name: "Show request" })).toHaveAttribute("aria-expanded", "false");
  });

  it("respects a controlled decision (no undo for decisions made elsewhere)", () => {
    const d: ApprovalDecision = { outcome: "rejected", by: "Jun Park", at: Date.UTC(2026, 10, 20, 14, 32) };
    render(<ApprovalCard {...base} decision={d} />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(/by Jun Park/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("expires into a receipt and calls onExpire", async () => {
    const onExpire = vi.fn();
    render(<ApprovalCard {...base} expiresAt={Date.now() + 50} onExpire={onExpire} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200));
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => /expired/i.test(el.textContent ?? ""))).toBe(true);
  });

  it("the preview peek toggles with aria-expanded; email preview renders its fields", async () => {
    render(
      <ApprovalCard
        {...base}
        previewLabel="Email preview"
        preview={<ApprovalEmailPreview from="Ines" to="Beta testers (214)" subject="Firmware 2.4">Body</ApprovalEmailPreview>}
      />,
    );
    const toggle = screen.getByRole("button", { name: /Expand/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Collapse/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Beta testers (214)")).toBeInTheDocument();
  });

  it("the clipped peek is inert and its toggle has a contextual name", async () => {
    render(
      <ApprovalCard
        {...base}
        previewLabel="Email preview"
        preview={<ApprovalEmailPreview from="Ines" to="Beta testers (214)" subject="Firmware 2.4"><a href="#x">a link below the fold</a></ApprovalEmailPreview>}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Expand email preview" });
    expect(toggle).toHaveTextContent("Expand");
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region).toHaveAttribute("inert");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Collapse email preview" })).toBeInTheDocument();
    expect(region).not.toHaveAttribute("inert");
  });

  it("a controlled parent that re-creates the same decision keeps the undo window and still commits", async () => {
    const onCommit = vi.fn();
    function Parent({ swapTo }: { swapTo?: ApprovalDecision }) {
      const [d, setD] = useState<ApprovalDecision | null>(null);
      // A store that clones (new identity, new `at`) — e.g. a server echo.
      return <ApprovalCard {...base} undoWindow={150} decision={swapTo ?? d} onDecisionChange={(x) => setD(x && { ...x, at: x.at + 7 })} onCommit={onCommit} />;
    }
    const { rerender } = render(<Parent />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeInTheDocument();
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "approved" }));

    // A genuinely different decision from outside cancels the window: no commit.
    const other = vi.fn();
    function Parent2({ external }: { external?: ApprovalDecision }) {
      const [d, setD] = useState<ApprovalDecision | null>(null);
      return <ApprovalCard {...base} undoWindow={200} decision={external ?? d} onDecisionChange={setD} onCommit={other} />;
    }
    rerender(<></>);
    const r2 = render(<Parent2 />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    r2.rerender(<Parent2 external={{ outcome: "rejected", by: "Jun Park", at: Date.now() }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument());
    await sleep(300);
    expect(other).not.toHaveBeenCalled();
  });

  it("the undo window is clamped to the deadline, so a late approval commits by the deadline and never expires", async () => {
    const onCommit = vi.fn();
    const onExpire = vi.fn();
    render(<ApprovalCard {...base} undoWindow={5000} expiresAt={Date.now() + 250} onCommit={onCommit} onExpire={onExpire} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeInTheDocument();
    await sleep(400);
    expect(onCommit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo approval" })).not.toBeInTheDocument());
    await sleep(1100);
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("a decision at or past the deadline commits at once with no undo", async () => {
    const onCommit = vi.fn();
    render(<ApprovalCard {...base} undoWindow={5000} expiresAt={Date.now() + 20} onCommit={onCommit} />);
    await sleep(60); // past the deadline, before the next once-a-second expiry tick
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Approved: Firmware 2.4 email.")).toBe(true);
  });

  it("composing a change request pauses the expiry countdown", async () => {
    const onExpire = vi.fn();
    render(<ApprovalCard {...base} expiresAt={Date.now() + 1500} onExpire={onExpire} />);
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(await screen.findByText(/Paused at/)).toBeInTheDocument();
    expect(screen.getByText("Expiry paused while you write")).toBeInTheDocument();
    await userEvent.type(await screen.findByRole("textbox"), "Drop the discount");
    await sleep(2000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Drop the discount");
    await userEvent.click(screen.getByRole("button", { name: /Send to Scout/ }));
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
  });

  it("derives the receipt text from a ReactNode action, and warns in dev only when it has none", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { summary: _s, ...noSummary } = base;
    const a = render(
      <ApprovalCard {...noSummary} action={<>Refund <strong>Klangwerk Berlin</strong> for 8 units.</>} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByTitle("Refund Klangwerk Berlin for 8 units.")).toBeInTheDocument();
    expect(screen.queryByText("Request")).not.toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
    a.unmount();

    render(<ApprovalCard {...noSummary} action={<span aria-hidden />} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle("Request")).toBeInTheDocument();
    warn.mockRestore();
  });

  it("one voice per decision: click → confirm / dismiss only (no stacked tap); hold → ticks + latch, no confirm", async () => {
    const play = vi.spyOn(sound, "play").mockImplementation(() => {});
    const a = render(<ApprovalCard {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(play.mock.calls.map((c) => c[0])).toEqual(["confirm"]);
    a.unmount();

    play.mockClear();
    const b = render(<ApprovalCard {...base} />);
    await userEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(play.mock.calls.map((c) => c[0])).toEqual(["dismiss"]);
    b.unmount();

    play.mockClear();
    const c = render(<ApprovalCard {...base} />);
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(play).not.toHaveBeenCalled(); // disclosure is silent
    await userEvent.type(await screen.findByRole("textbox"), "Shorter");
    await userEvent.click(screen.getByRole("button", { name: /Send to Scout/ }));
    expect(play.mock.calls.map((c) => c[0])).toEqual(["confirm"]);
    c.unmount();

    play.mockClear();
    const onDecisionChange = vi.fn();
    render(<ApprovalCard {...base} risk="high" holdDuration={80} onDecisionChange={onDecisionChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Hold to approve" }), { key: " " });
    await waitFor(() => expect(onDecisionChange).toHaveBeenCalled(), { timeout: 1000 });
    await sleep(200);
    const voices = play.mock.calls.map((c) => c[0]);
    expect(voices.filter((v) => v === "latch")).toHaveLength(1);
    expect(voices).not.toContain("confirm");
    play.mockRestore();
  });

  it("undo mid-fold continues from the live height instead of jumping", async () => {
    // jsdom has no layout: the pending view measures 400 px, the receipt 44 px.
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.closest("section")?.getAttribute("data-status") === "pending" ? 400 : 44;
      },
    });
    try {
      render(<ApprovalCard {...base} undoWindow={5000} />);
      const box = () => document.querySelector("section > div.relative") as HTMLElement;
      fireEvent.click(screen.getByRole("button", { name: "Approve" }));
      await sleep(35); // partway down the 220 ms fold
      const mid = parseFloat(box().style.height);
      expect(mid).toBeGreaterThan(60);
      expect(mid).toBeLessThan(395);
      fireEvent.click(screen.getByRole("button", { name: "Undo approval" }));
      await sleep(16);
      const after = parseFloat(box().style.height);
      // Continuous: it reverses from where it was, carrying its velocity (the old code restarted from the receipt's 44 px).
      expect(Math.abs(after - mid)).toBeLessThan(30);
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", desc);
    }
  });

  it("Escape in the note field closes it without reaching a host dialog", async () => {
    const hostKey = vi.fn();
    render(
      <div onKeyDown={(e) => e.key === "Escape" && hostKey()}>
        <ApprovalCard {...base} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const field = await screen.findByRole("textbox");
    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
    expect(hostKey).not.toHaveBeenCalled();
  });

  it("during the undo window the subject leads and the attribution waits until commit", async () => {
    render(<ApprovalCard {...base} undoWindow={150} />);
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByTitle("Firmware 2.4 email")).toBeInTheDocument();
    expect(screen.queryByText(/by Mara Lind/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/by Mara Lind/)).toBeInTheDocument());
    expect(screen.getByTitle("Firmware 2.4 email")).toBeInTheDocument();
  });

  it("the receipt is a disclosure: it reopens the original request read-only, then folds back", async () => {
    render(
      <ApprovalCard
        {...base}
        undoWindow={5000}
        previewLabel="Email preview"
        preview={<ApprovalEmailPreview from="Ines" to="Beta testers (214)" subject="Firmware 2.4">Body</ApprovalEmailPreview>}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await userEvent.type(await screen.findByRole("textbox"), "Lead with the arp fix");
    await userEvent.click(screen.getByRole("button", { name: /Send to Scout/ }));
    const toggle = screen.getByRole("button", { name: "Show request" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    const detail = await screen.findByRole("group", { name: "Original request" });
    expect(screen.getByRole("button", { name: "Hide request" })).toHaveAttribute("aria-expanded", "true");
    expect(detail).toHaveTextContent(base.action);
    expect(detail).toHaveTextContent("214");
    expect(detail).toHaveTextContent(base.rationale);
    expect(detail).toHaveTextContent("Lead with the arp fix");
    // Read-only: no decision buttons, but the preview can still be expanded.
    for (const name of [/Approve/, /Reject/, /Request changes/]) expect(within(detail).queryByRole("button", { name })).toBeNull();
    expect(within(detail).getByRole("button", { name: "Expand email preview" })).toBeInTheDocument();
    // Undo stays available alongside it.
    expect(screen.getByRole("button", { name: "Undo change request" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide request" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Original request" })).not.toBeInTheDocument());
  });
});
