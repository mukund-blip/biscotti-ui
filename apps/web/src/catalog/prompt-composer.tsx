import { PromptComposerDemo, PromptComposerPreview } from "@/demos/prompt-composer-demo";
import type { CatalogEntry } from "./types";

export const entry: CatalogEntry = {
  slug: "prompt-composer",
  number: "06",
  name: "Intelligent Prompt Composer",
  group: "Commands & composition",
  summary: "Compose a prompt with file uploads, inline references and slash commands.",
  description: "The editor grows with the draft and keeps tools within reach. Files show progress inside their chips, and mentions and slash commands commit as inline tokens. Send lifts the draft away as the arrow becomes Stop. A rejected send restores the draft and attachments.",
  useCases: ["Agent chat with file and tool context", "Prompting against a specific model", "Writing with reusable slash commands"],
  scale: "l",
  Demo: PromptComposerDemo,
  Preview: PromptComposerPreview,
  usage: `import { PromptComposer } from "@detent/ui";

<PromptComposer
  models={[{ id: "scout", label: "Scout" }]}
  mentions={[{ id: "ines", type: "person", label: "Ines Duarte" }]}
  limit={2000}
  onSubmit={(submission, signal) => sendToScout(submission, signal)}
/>`,
  props: [
    { name: "onSubmit", type: "(submission, signal) => void | Promise<void>", required: true, description: "Receives text, reference tokens, model and attachments. Rejection restores the draft." },
    { name: "value / defaultValue", type: "MentionDraft", description: "Controlled or initial draft." },
    { name: "onValueChange", type: "(draft: MentionDraft) => void", description: "Observes edits, send clearing and restoration." },
    { name: "mentions / loadMentions", type: "MentionItem[] / async loader", description: "Local and remote resources for @ search." },
    { name: "commands", type: "Omit<MentionItem, 'type'>[]", description: "Slash commands. Defaults to summarize, draft-reply and translate." },
    { name: "models / model / defaultModel", type: "PromptComposerModel[] / string / string", description: "Model choices and the controlled or initial selection." },
    { name: "onModelChange", type: "(id: string) => void", description: "Notifies the host of a model choice." },
    { name: "onUpload", type: "(file, { signal, onProgress }) => Promise<string | void>", description: "Reports file progress and may return a remote file ID." },
    { name: "generating / onStop", type: "boolean / () => void", description: "Show Stop during external generation and listen when the user stops." },
    { name: "limit / measure / unit", type: "number / (draft) => number / string", description: "Optional length budget. Override measurement for model-specific tokens." },
    { name: "readOnly / disabled", type: "boolean", default: "false", description: "Copyable read-only draft or disabled composer." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this composer and its mention editor to play outcome sounds." },
  ],
  exports: [
    { name: "PromptComposerSubmission", description: "Payload containing draft, model ID, and original or uploaded files." },
    { name: "PromptComposerUpload / PromptComposerAttachment", description: "Upload context and attachment data." },
  ],
  dependencies: ["motion", "@base-ui/react"],
  keyboard: [
    { keys: ["Enter"], action: "Send or insert the active suggestion" },
    { keys: ["Shift", "Enter"], action: "Insert a new line" },
    { keys: ["⌘", "Enter"], action: "Send while suggestions are open" },
    { keys: ["/", "@"], action: "Open command or mention suggestions" },
    { keys: ["Esc"], action: "Close suggestions or the model menu" },
  ],
  a11y: [
    "Upload progress uses a labelled progressbar. The footer announces send and file outcomes.",
    "The model menu exposes its choices as radio items and restores focus to its trigger.",
    "Send and Stop share a stable button with a state-specific accessible name.",
  ],
  motion: [
    { state: "Rest", behaviour: "The editor grows to eight lines and its toolbar reserves space for status." },
    { state: "Focus / press", behaviour: "Focus shows the pencil ring. Send compresses on press and returns on the control spring." },
    { state: "Upload", behaviour: "The first active file animates its pencil fill. Completion leaves a thin ink rule." },
    { state: "Send / stop", behaviour: "The outgoing draft fades while rising 4 px. The arrow path interpolates to the Stop square." },
    { state: "Error", behaviour: "The original draft returns and the status is announced inline." },
    { state: "Reduced motion", behaviour: "The outgoing draft and glyph fade in place. Upload fill jumps to its current value." },
  ],
  sound: [
    { event: "Send", voice: "confirm" },
    { event: "Model, command or mention selected", voice: "select" },
    { event: "Files added or retry requested", voice: "tap" },
    { event: "Stop or remove", voice: "dismiss" },
    { event: "Send or upload failure", voice: "error" },
  ],
};
