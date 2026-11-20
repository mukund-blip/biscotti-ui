import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { sound } from "../../sound/react";
import { PromptComposer, type PromptComposerUpload } from "./prompt-composer";
import type { MentionItem } from "../mention-picker";

const draft = { text: "Review the notes", tokens: [] };
const person: MentionItem = { id: "ines", type: "person", label: "Ines Duarte" };
const field = () => screen.getByRole("combobox", { name: "Prompt" });
const sendButton = () => screen.getByRole("button", { name: "Send prompt" });

describe("PromptComposer", () => {
  it("uses the mention editor and slash menu to send semantically typed references", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PromptComposer mentions={[person]} onSubmit={onSubmit} />);
    await user.click(field());
    await user.keyboard("@id{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Insert command" }));
    await user.keyboard("draft{Tab}");
    expect(screen.getByRole("button", { name: "command: draft-reply" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({
      draft: {
        text: "@Ines Duarte /draft-reply ",
        tokens: [
          { start: 0, end: 12, item: person },
          { start: 13, end: 25, item: expect.objectContaining({ id: "draft-reply", type: "command" }) },
        ],
      },
      attachments: [],
      model: undefined,
    }, expect.any(AbortSignal));
  });

  it("uses Shift+Enter for a newline, Escape to dismiss, and Meta+Enter to send", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PromptComposer onSubmit={onSubmit} />);
    await user.click(field());
    await user.keyboard("First{Shift>}{Enter}{/Shift}/");
    expect(field()).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape} /");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ draft: { text: "First\n/ /", tokens: [] } }), expect.any(AbortSignal));
  });

  it("clears provisionally and restores the original draft and attachments if sending fails", async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    const onSubmit = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    render(<PromptComposer defaultValue={draft} onSubmit={onSubmit} />);
    const file = new File(["notes"], "launch.txt", { type: "text/plain" });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(sendButton());
    expect(screen.getByRole("button", { name: "Stop generating" })).toHaveFocus();
    expect(field()).toBeEmptyDOMElement();
    await act(async () => reject(new Error("Offline")));
    expect(field()).toHaveTextContent(draft.text);
    expect(screen.getByRole("button", { name: "Remove launch.txt" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Couldn’t send/);
    expect(sendButton()).toHaveFocus();
  });

  it("aborts generation, prevents overlapping sends, and ignores a late failure", async () => {
    let reject!: (e: Error) => void;
    const onSubmit = vi.fn((_submission, _signal: AbortSignal) => new Promise<void>((_, fail) => { reject = fail; }));
    const onStop = vi.fn();
    render(<PromptComposer defaultValue={draft} onSubmit={onSubmit} onStop={onStop} />);
    fireEvent.click(sendButton());
    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1].aborted).toBe(true);
    expect(onStop).toHaveBeenCalledTimes(1);
    await act(async () => reject(new Error("Late answer")));
    expect(screen.getByRole("status")).toHaveTextContent("Stopped");
    expect(field()).toBeEmptyDOMElement();
  });

  it("accepts pasted images, reports upload progress, and sends the retried file ID", async () => {
    const file = new File(["image"], "encoder.png", { type: "image/png" });
    const attempts: { upload: PromptComposerUpload; resolve: (id: string) => void; reject: (error: Error) => void }[] = [];
    const onUpload = (_file: File, upload: PromptComposerUpload) => new Promise<string>((resolve, reject) => attempts.push({ upload, resolve, reject }));
    const onSubmit = vi.fn();
    render(<PromptComposer onUpload={onUpload} onSubmit={onSubmit} />);
    fireEvent.paste(field(), { clipboardData: { files: [file] } });
    act(() => attempts[0].upload.onProgress(0.42));
    expect(screen.getByRole("progressbar", { name: "Uploading encoder.png" })).toHaveAttribute("aria-valuenow", "42");
    expect(sendButton()).toHaveAttribute("aria-disabled", "true");
    await act(async () => attempts[0].reject(new Error("Retry")));
    fireEvent.click(screen.getByRole("button", { name: "Retry encoder.png" }));
    expect(field()).toHaveFocus();
    await act(async () => attempts[1].resolve("asset-1"));
    fireEvent.click(sendButton());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ attachments: [{ file, uploadId: "asset-1" }] }), expect.any(AbortSignal));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sent"));
  });

  it("mutes the composer and its mention picker through the same sound prop", async () => {
    const play = vi.spyOn(sound, "play").mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<PromptComposer mentions={[person]} onSubmit={onSubmit} sound={false} />);
      await user.click(field());
      await user.keyboard("@{ArrowDown}{Enter}{Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(play).not.toHaveBeenCalled();
    } finally {
      play.mockRestore();
    }
  });

  it("sets the controlled limit and enforces read-only and disabled states", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<PromptComposer value={{ text: "12345678", tokens: [] }} limit={10} onSubmit={onSubmit} />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    rerender(<PromptComposer value={{ text: "12345678901", tokens: [] }} limit={10} onSubmit={onSubmit} />);
    expect(screen.getByRole("meter", { name: /11 of 10 characters, over limit/ })).toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(sendButton());
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(<PromptComposer value={draft} readOnly onSubmit={onSubmit} />);
    expect(field()).toHaveAttribute("aria-readonly", "true");
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
    rerender(<PromptComposer value={draft} disabled onSubmit={onSubmit} />);
    expect(sendButton()).toBeDisabled();
    expect(field()).toHaveAttribute("aria-disabled", "true");
  });
});
