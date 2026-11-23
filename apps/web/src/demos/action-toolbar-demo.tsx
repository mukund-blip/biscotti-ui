"use client";
import { useRef, useState } from "react";
import { Icon, Kbd, cn } from "@biscotti/ui";
import {
  ActionToolbar,
  rangeClosest,
  unwrapElement,
  wrapRange,
  type ToolbarActionContext,
} from "@biscotti/ui";
import { ControlButton, ControlSegment, Controls, DemoFrame, Readout, Stage } from "@/components/demo-kit";

const ARTICLE = `
<h3>OS-1 firmware 2.4 — launch notes (draft)</h3>
<p>Firmware 2.4 is the largest update to the OS-1 since launch. The encoder driver has been rewritten, so the four macro knobs no longer skip steps when turned quickly, a fix that beta testers have asked for since October.</p>
<p>The arpeggiator gains a ratchet mode and swing up to 75%. Patterns can now be saved per preset, and the OS-0 import tool brings across arpeggiator settings from older units.</p>
<p>Pre-orders for the second production run open on 3 March. Units ship in 9–10 weeks, after the encoder restock from our supplier lands in Rotterdam.</p>
`;

type Note = { id: number; kind: "comment" | "scout"; quote: string; body: string };

const proseClass =
  "max-w-[60ch] text-[15px] leading-[26px] text-ink-2 outline-none [&_h3]:mb-3 [&_h3]:text-md [&_h3]:font-medium [&_h3]:text-ink [&_p+p]:mt-3.5 [&_strong]:font-semibold [&_strong]:text-ink [&_em]:italic [&_a]:text-ink [&_a]:underline [&_a]:decoration-edge [&_a]:underline-offset-[3px] [&_mark]:rounded-[2px] [&_mark]:bg-warn-soft [&_mark]:text-ink [&_mark]:shadow-[0_1.5px_0_var(--bis-warn)]";

function useTextActions(onNote: (n: Note) => void, setLast: (s: string) => void) {
  const n = useRef(0);
  return (id: string, ctx: ToolbarActionContext) => {
    const { range, value, active, text } = ctx;
    const short = text.length > 28 ? `${text.slice(0, 26)}…` : text;
    switch (id) {
      case "bold":
      case "italic": {
        const sel = id === "bold" ? "strong, b" : "em, i";
        const el = active ? rangeClosest(range, sel) : null;
        if (el) unwrapElement(el);
        else wrapRange(range, id === "bold" ? "strong" : "em");
        setLast(`${active ? "un" : ""}${id} “${short}”`);
        break;
      }
      case "link": {
        const a = rangeClosest(range, "a[href]");
        if (!value) { if (a) unwrapElement(a); setLast("link removed"); break; }
        const href = /^https?:\/\//.test(value) ? value : `https://${value}`;
        if (a) a.setAttribute("href", href);
        else wrapRange(range, "a", { href, target: "_blank", rel: "noreferrer" });
        setLast(`link → ${href.replace(/^https?:\/\//, "")}`);
        break;
      }
      case "comment": {
        wrapRange(range, "mark", { "data-comment": value ?? "", title: value ?? "" });
        onNote({ id: ++n.current, kind: "comment", quote: text, body: value ?? "" });
        setLast(`comment on “${short}”`);
        break;
      }
      case "ask": {
        const body = /encoder/i.test(text)
          ? "The restock quote from the supplier says 9 weeks; 9–10 matches. Worth naming the part (EC11, 24 clicks) for retailers."
          : /arpeggiator|ratchet|swing/i.test(text)
            ? "Swing tops out at 75% in the 2.4.0-beta.3 build Ines shipped on Friday. Ratchet is per-step, not global."
            : "This reads clearly. Consider leading with what owners can do now, then the dates.";
        onNote({ id: ++n.current, kind: "scout", quote: text, body });
        setLast(`asked Scout about “${short}”`);
        break;
      }
    }
  };
}

export function ActionToolbarDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"editable" | "read-only">("editable");
  const [doc, setDoc] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [last, setLast] = useState("—");
  const onAction = useTextActions((note) => setNotes((ns) => [note, ...ns].slice(0, 4)), setLast);

  return (
    <DemoFrame
      stage={
        <Stage minH={520} center={false} className="grid gap-8 px-6 py-12 md:grid-cols-[minmax(0,1fr)_220px] md:px-12">
          <div>
            <div
              key={`${doc}-${mode}`}
              ref={ref}
              contentEditable={mode === "editable"}
              suppressContentEditableWarning
              spellCheck={false}
              role={mode === "editable" ? "textbox" : "article"}
              aria-multiline={mode === "editable" || undefined}
              aria-label="Launch notes"
              className={cn(proseClass, "rounded-sm", mode === "editable" && "caret-pencil")}
              dangerouslySetInnerHTML={{ __html: ARTICLE }}
            />
            <ActionToolbar target={ref} onAction={onAction} collisionPadding={{ top: 64 }} />
            <p className="mt-6 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Select text. From the keyboard: <Kbd>⇧</Kbd><Kbd>→</Kbd> to select, then <Kbd>⌥</Kbd><Kbd>F10</Kbd> or <Kbd>⌘</Kbd><Kbd>/</Kbd> to reach the toolbar.
            </p>
          </div>
          <aside aria-label="Notes" className="grid content-start gap-2">
            <p className="font-mono text-2xs uppercase tracking-[0.06em] text-muted">Notes</p>
            {notes.length === 0 && <p className="text-sm text-muted">Comments and Scout replies appear here.</p>}
            {notes.map((n) => (
              <div key={n.id} className="rounded-md bg-surface p-2.5 text-sm shadow-[inset_0_0_0_1px_var(--bis-hairline)]">
                <p className="mb-1 flex items-center gap-1.5 text-2xs text-muted">
                  <Icon name={n.kind === "scout" ? "sparkle" : "comment"} size={12} />
                  {n.kind === "scout" ? "Scout" : "Mara Lind"}
                </p>
                <p className="line-clamp-2 border-l-2 border-rule pl-2 text-xs text-muted">{n.quote}</p>
                <p className={cn("mt-1.5 text-ink-2", n.kind === "scout" && "font-serif text-[14.5px] italic leading-[20px]")}>{n.body}</p>
              </div>
            ))}
          </aside>
        </Stage>
      }
      controls={
        <Controls>
          <ControlSegment label="Text" value={mode} options={["editable", "read-only"] as const} onChange={setMode} />
          <ControlButton onClick={() => { setDoc((d) => d + 1); setNotes([]); setLast("—"); }}>Reset text</ControlButton>
          <Readout label="last">{last}</Readout>
        </Controls>
      }
    />
  );
}

export function ActionToolbarPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const onAction = useTextActions(() => {}, () => {});
  return (
    <div className="w-full max-w-[440px]">
      <div
        ref={ref}
        className={proseClass}
        dangerouslySetInnerHTML={{
          __html:
            "<p>The encoder driver has been <strong>rewritten</strong>, so the four macro knobs no longer skip steps when turned quickly. Select any words to format them.</p>",
        }}
      />
      <ActionToolbar target={ref} onAction={onAction} />
    </div>
  );
}
