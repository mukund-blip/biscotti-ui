import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StreamingResponse } from "./streaming-response";
import { useTextStream } from "./use-text-stream";
import { parseMarkdown } from "./markdown";

async function* chunks(parts: string[], gate?: Promise<void>) {
  for (const [i, p] of parts.entries()) {
    if (gate && i === parts.length - 1) await gate;
    await Promise.resolve();
    yield p;
  }
}

describe("useTextStream", () => {
  it("reads an async iterable to completion", async () => {
    const { result } = renderHook(() => useTextStream(chunks(["Hel", "lo ", "Mara"])));
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.text).toBe("Hello Mara");
    expect(result.current.chunks).toBe(3);
  });

  it("decodes a byte ReadableStream and a Response", async () => {
    const enc = new TextEncoder();
    const bytes = enc.encode("Lead time: 9 wk — ok");
    const body = () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          // split inside the multi-byte em dash to exercise streaming decode
          c.enqueue(bytes.slice(0, 12));
          c.enqueue(bytes.slice(12, 17));
          c.enqueue(bytes.slice(17));
          c.close();
        },
      });
    const a = renderHook(() => useTextStream(body()));
    await waitFor(() => expect(a.result.current.status).toBe("done"));
    expect(a.result.current.text).toBe("Lead time: 9 wk — ok");
    const b = renderHook(() => useTextStream(() => new Response(body())));
    await waitFor(() => expect(b.result.current.status).toBe("done"));
    expect(b.result.current.text).toBe("Lead time: 9 wk — ok");
  });

  it("stop() keeps the partial text; restart() re-runs a factory", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let runs = 0;
    const { result } = renderHook(() =>
      useTextStream(() => {
        runs++;
        return chunks(["Order ", "from ", "Digi-Key"], runs === 1 ? gate : undefined);
      }),
    );
    await waitFor(() => expect(result.current.text).toBe("Order from "));
    act(() => result.current.stop());
    expect(result.current.status).toBe("stopped");
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.text).toBe("Order from ");
    act(() => result.current.restart());
    await waitFor(() => expect(result.current.status).toBe("done"));
    expect(result.current.text).toBe("Order from Digi-Key");
    expect(runs).toBe(2);
  });

  it("reports an error and keeps what arrived", async () => {
    async function* broken() {
      yield "Partial ";
      throw new Error("reset");
    }
    const { result } = renderHook(() => useTextStream(broken()));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.text).toBe("Partial ");
  });
});

describe("parseMarkdown (streaming robustness)", () => {
  it("never shows a dangling emphasis marker while streaming", () => {
    const doc = parseMarkdown("Order **1,200 un", false);
    const p = doc.blocks[0];
    expect(p.t).toBe("p");
    if (p.t === "p") expect(p.inl.map((n) => n.t)).toEqual(["text", "strong"]);
    expect(parseMarkdown("Order *", false).end).toBe(6);
    expect(parseMarkdown("See [1", false).end).toBe(4);
  });

  it("holds back a last line that could still become a list marker or table", () => {
    expect(parseMarkdown("Next:\n\n1", false).blocks).toHaveLength(1);
    expect(parseMarkdown("Next:\n\n-", false).blocks).toHaveLength(1);
    expect(parseMarkdown("Next:\n\n|", false).blocks).toHaveLength(1);
  });

  it("renders an unclosed fence as code and parses tables with alignment", () => {
    const code = parseMarkdown("```ts\nconst a = 1;", false).blocks[0];
    expect(code).toMatchObject({ t: "code", lang: "ts", closed: false });
    const table = parseMarkdown("| A | B |\n|---|---:|\n| x | 1 |\n", true).blocks[0];
    expect(table).toMatchObject({ t: "table", align: ["left", "right"] });
    if (table.t === "table") expect(table.rows).toHaveLength(1);
  });
});

describe("StreamingResponse", () => {
  const sources = [{ n: 1, title: "PEC11R lead time", domain: "digikey.com", url: "https://example.com", quote: "9 weeks" }];

  it("renders markdown, citations and a caret while streaming, with a working Stop", async () => {
    const onStop = vi.fn();
    const { container } = render(<StreamingResponse text={"Use **Digi-Key**.[1]\n\n- one\n- two"} status="streaming" sources={sources} onStop={onStop} />);
    expect(screen.getByText("Digi-Key").closest("strong")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Source 1: PEC11R lead time/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("[data-caret]")).not.toBeNull();
    expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("shows actions, sources and suggestions when done; feedback is a toggle", async () => {
    const onSuggestion = vi.fn();
    const onFeedbackChange = vi.fn();
    render(<StreamingResponse text={"Done.[1]"} status="done" sources={sources} suggestions={["Draft the PO"]} onSuggestion={onSuggestion} onFeedbackChange={onFeedbackChange} onRegenerate={() => {}} />);
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy response" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    const up = screen.getByRole("button", { name: "Good response" });
    await userEvent.click(up);
    expect(up).toHaveAttribute("aria-pressed", "true");
    expect(onFeedbackChange).toHaveBeenLastCalledWith("up");
    await userEvent.click(up);
    expect(onFeedbackChange).toHaveBeenLastCalledWith(null);
    await userEvent.click(screen.getByRole("button", { name: /Draft the PO/ }));
    expect(onSuggestion).toHaveBeenCalledWith("Draft the PO");
    expect(screen.getByText("digikey.com")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Response complete.");
  });

  it("marks a stopped answer and keeps the partial text", () => {
    render(<StreamingResponse text={"Order from **Digi"} status="stopped" />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByText("Digi").closest("strong")).not.toBeNull();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("drives directly from useTextStream via the stream prop", async () => {
    function Harness() {
      const stream = useTextStream(chunks(["Short ", "answer: ", "**yes**"]));
      return <StreamingResponse stream={stream} />;
    }
    render(<Harness />);
    await waitFor(() => expect(screen.getByText("yes").closest("strong")).not.toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy response" })).toBeInTheDocument());
  });
});
