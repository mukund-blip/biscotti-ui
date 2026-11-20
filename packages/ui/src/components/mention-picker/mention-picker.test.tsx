import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MentionInput, mentionOptionId, type MentionItem } from "./mention-picker";

const people: MentionItem[] = [
  { id: "ines", type: "person", label: "Ines Duarte", detail: "Firmware" },
  { id: "mara", type: "person", label: "Mara Lind", detail: "Founder" },
];
const file: MentionItem = { id: "notes", type: "file", label: "Launch notes", detail: "press/os-1-launch.md" };
const items = [...people, file];
const field = () => screen.getByRole("combobox", { name: "Note" });

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

describe("MentionInput", () => {
  it("groups suggestions and navigates with active-descendant before inserting a token", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<MentionInput aria-label="Note" items={items} onValueChange={changed} />);
    await user.click(field());
    await user.keyboard("@");
    const list = screen.getByRole("listbox");
    expect(within(list).getByRole("group", { name: "People" })).toBeInTheDocument();
    expect(within(list).getByRole("group", { name: "Files" })).toBeInTheDocument();
    expect(field()).toHaveAttribute("aria-controls", list.id);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(field()).toHaveAttribute("aria-activedescendant", mentionOptionId(list.id, file));
    expect(screen.getByRole("option", { name: /Launch notes/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Tab}");
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "file: Launch notes" })).toBeInTheDocument();
    expect(changed).toHaveBeenLastCalledWith({ text: "@Launch notes ", tokens: [{ start: 0, end: 13, item: file }] });
  });

  it("highlights fuzzy letters, closes on Escape and closes after a space with zero matches", async () => {
    const user = userEvent.setup();
    render(<MentionInput aria-label="Note" items={items} />);
    await user.click(field());
    await user.keyboard("@ml");
    const option = screen.getByRole("option", { name: /Mara Lind/ });
    expect(option.querySelectorAll("mark")).toHaveLength(2);
    await user.keyboard("{Escape}");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    await user.keyboard(" {Enter}@zzzz");
    expect(screen.getByRole("status")).toHaveTextContent(/No matching/);
    await user.keyboard(" ");
    expect(field()).toHaveAttribute("aria-expanded", "false");
  });

  it("loads latest async results and ignores a superseded response", async () => {
    const user = userEvent.setup();
    const requests = new Map<string, { signal: AbortSignal; resolve: (items: MentionItem[]) => void }>();
    const loadItems = (query: string, signal: AbortSignal) =>
      new Promise<MentionItem[]>((resolve) => requests.set(query, { signal, resolve }));
    render(<MentionInput aria-label="Note" loadItems={loadItems} />);
    await user.click(field());
    await user.keyboard("@i");
    expect(screen.getByRole("status")).toHaveTextContent(/Looking up context/);
    await waitFor(() => expect(requests.get("")?.signal.aborted).toBe(true));
    await act(async () => requests.get("i")?.resolve([people[0]]));
    expect(screen.getByRole("option", { name: /Ines Duarte/ })).toBeInTheDocument();
    await act(async () => requests.get("")?.resolve([people[1]]));
    expect(screen.getByRole("option", { name: /Ines Duarte/ })).toBeInTheDocument();
  });

  it("removes an adjacent or focused token as one unit and restores focus", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<MentionInput aria-label="Note" defaultValue={{ text: "@Ines Duarte", tokens: [{ start: 0, end: 12, item: people[0] }] }} onValueChange={changed} />);
    await user.click(field());
    placeCaretAtEnd(field());
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "person: Ines Duarte" })).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(changed).toHaveBeenLastCalledWith({ text: "", tokens: [] });
    expect(field()).toHaveFocus();
  });

  it("honors an unchanged controlled draft and supports read-only and disabled modes", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const value = { text: "Fixed", tokens: [] };
    const { rerender } = render(<MentionInput aria-label="Note" value={value} onValueChange={changed} />);
    await user.click(field());
    placeCaretAtEnd(field());
    await user.keyboard("!");
    expect(changed).toHaveBeenCalledWith({ text: "Fixed!", tokens: [] });
    expect(field()).toHaveTextContent("Fixed");
    expect(field()).not.toHaveTextContent("!");
    rerender(<MentionInput aria-label="Note" value={value} readOnly onValueChange={changed} />);
    expect(field()).toHaveAttribute("aria-readonly", "true");
    fireEvent.input(field());
    expect(changed).toHaveBeenCalledTimes(1);
    rerender(<MentionInput aria-label="Note" value={value} disabled />);
    expect(field()).toHaveAttribute("aria-disabled", "true");
    expect(field()).toHaveAttribute("tabindex", "-1");
  });
});
