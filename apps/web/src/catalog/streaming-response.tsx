import type { CatalogEntry } from "./types";
import { StreamingResponseDemo } from "@/demos/streaming-response-demo";

export const entry: CatalogEntry = {
  slug: "streaming-response",
  number: "10",
  name: "Streaming Response",
  group: "Agent interactions",
  summary: "Renders a real text stream as light markdown, with chunk fades, citations and a pencil caret.",
  description:
    "Renders an agent's answer as it streams, from a ReadableStream, an async iterable or a fetch Response, through the useTextStream hook. Markdown is parsed incrementally and half-typed syntax is held back, so markers never flash as literal characters. Each new chunk lifts from 35% opacity instead of typing out character by character, and the pencil caret is the one live mark. Inline [n] citations open a source card with the quoted passage. When the answer settles, an action row, the cited sources and follow-up suggestions fade in. Stop keeps the partial answer and marks it.",
  useCases: ["Chat and copilot answers", "Agent reports with cited sources", "Any long generated text that should be readable while it arrives"],
  scale: "l",
  Demo: StreamingResponseDemo,
  Preview: () => <StreamingResponseDemo compact />,
  usage: `import { StreamingResponse, useTextStream } from "@biscotti/ui";

function Answer({ question }: { question: string }) {
  // A factory, so Regenerate can read the source again.
  const stream = useTextStream((signal) => fetch(\`/api/ask?q=\${encodeURIComponent(question)}\`, { signal }), {
    key: question,
  });
  return (
    <StreamingResponse
      stream={stream}
      sources={[{ n: 1, title: "EC11 encoder datasheet", domain: "alps.com", quote: "Rated for 30,000 cycles." }]}
      suggestions={["Draft the restock email"]}
      onSuggestion={(s) => ask(s)}
      maxHeight={320}
    />
  );
}`,
  props: [
    { name: "stream", type: 'Pick<TextStream, "text" | "status" | "stop" | "restart">', description: "Pass the result of useTextStream(). Supplies text and status, and wires Stop and Regenerate." },
    { name: "text", type: "string", default: '""', description: "The markdown received so far. Ignored when stream is given." },
    { name: "status", type: '"idle" | "streaming" | "done" | "stopped" | "error"', default: '"idle"', description: "Stream state. Ignored when stream is given." },
    { name: "sources", type: "StreamingSource[]", default: "[]", description: "Sources for inline [n] citations: { n, title, domain, url?, quote? }. Only the ones actually cited appear in the sources row." },
    { name: "suggestions / onSuggestion", type: "string[] / (s) => void", default: "[] / —", description: "Follow-up chips, shown once the answer is done." },
    { name: "onStop", type: "() => void", default: "stream.stop", description: "Shows a Stop button while streaming." },
    { name: "onRegenerate", type: "() => void", default: "stream.restart", description: "Shows Regenerate when settled, and Retry after an error." },
    { name: "onCopy", type: "(text: string) => void", description: "Called after the answer is copied as plain text." },
    { name: "onShare", type: "() => void", description: "Shows a Share action when provided." },
    { name: "feedback / defaultFeedback / onFeedbackChange", type: '"up" | "down" | null', default: "— / null / —", description: "Thumbs up / down, controlled or uncontrolled. Shown only for a completed answer." },
    { name: "elapsedMs", type: "number", description: "Duration shown in “Wrote for 6.2s”, e.g. for scripted replays. Falls back to a local clock from first chunk to settle." },
    { name: "maxHeight", type: "number", description: "Cap the body height and scroll. Enables scroll anchoring and the Jump to latest button." },
    { name: "label", type: "string", default: '"Response"', description: "Accessible name of the response article." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds (still requires global opt-in)." },
    { name: "className", type: "string", description: "Classes for the root." },
  ],
  exports: [
    { name: "useTextStream(input, { autoStart?, key?, onDone? })", description: "Reads a ReadableStream<Uint8Array | string>, an AsyncIterable, a Response, a promise of one of those, or a factory (signal) => source. Returns { text, status, error, chunks, bytes, stop, restart }. It renders at most once per animation frame, and source identity is ignored (use key to switch streams)." },
    { name: "StreamingSource, StreamingFeedback, TextStream, TextStreamStatus, TextStreamInput, UseTextStreamOptions", description: "Types." },
    { name: "parseStreamingMarkdown(src, final)", description: "The incremental, offset-preserving parser: paragraphs, # headings, bold, italic, inline code, [n] citations, bullet and numbered lists, fenced code and pipe tables." },
  ],
  dependencies: ["motion", "@base-ui/react"],
  keyboard: [
    { keys: ["Tab"], action: "Reach citations, Stop, the action row and follow-ups. Focusing a citation opens its source card" },
    { keys: ["Esc"], action: "Close an open source card" },
    { keys: ["↑", "PageUp", "Home"], action: "In the scroll area (with maxHeight): scroll up and stop following new text" },
  ],
  a11y: [
    "The answer is an <article> with an accessible name and aria-busy while streaming. Tokens are not announced; a polite status reports “Response complete.”, “Response stopped. Partial answer kept.” or an interruption, and “Copied to clipboard.”",
    "Citation markers are focusable triggers labelled “Source n: title, domain”, and open the source card on hover or focus.",
    "When Stop disappears because the stream settled, focus moves to the first action instead of being lost.",
    "Feedback buttons expose aria-pressed. Icon buttons are labelled.",
    "Headings render with aria-level offset by two so they nest under the host page. Tables use scoped column headers. The caret is aria-hidden.",
    "With maxHeight the scroll area is keyboard-focusable.",
  ],
  motion: [
    { state: "Streaming", behaviour: "Each newly appended span lifts from 35% to full opacity over 160 ms. There is no per-character typewriter. Unfinished markdown is held back, so markers never flash." },
    { state: "Caret", behaviour: "A 2 px pencil bar at the end of the text: steady while text flows, blinking after 550 ms without new text." },
    { state: "Complete", behaviour: "The caret goes, the action row fades up 3 px with a 30 ms stagger, the meta turns past tense (“Wrote for 6.2s”), and the sources and suggestions expand on the layout spring." },
    { state: "Stopped", behaviour: "The caret becomes a mono “Stopped” chip and the partial answer stays. The meta reads “Stopped after …”." },
    { state: "Error", behaviour: "“Connection lost · Partial answer kept” in err, with Retry." },
    { state: "Citation card", behaviour: "Rises 4 px and fades in over 200 ms after a 160 ms hover delay; closes in 140 ms." },
    { state: "Scroll anchoring", behaviour: "With maxHeight, the body follows new text while the reader is at the bottom. Scrolling up releases it and shows a “Jump to latest” button that scrolls smoothly back down. Edges fade only where content is clipped." },
    { state: "Reduced motion", behaviour: "The chunk lift shortens to 120 ms, nothing travels, the caret doesn't blink, and Jump to latest scrolls instantly." },
  ],
  sound: [
    { event: "Stop", voice: "tap" },
    { event: "Copy response / copy code", voice: "tap (quiet)" },
    { event: "Regenerate / Retry / Share / follow-up", voice: "tap (quiet)" },
    { event: "Thumbs up / down", voice: "select" },
    { event: "Streaming, completion, errors", voice: "none" },
  ],
};
