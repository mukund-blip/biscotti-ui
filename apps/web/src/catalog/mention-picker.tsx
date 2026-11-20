import { MentionPickerDemo, MentionPickerPreview } from "@/demos/mention-picker-demo";
import type { CatalogEntry } from "./types";

export const entry: CatalogEntry = {
  slug: "mention-picker",
  number: "07",
  name: "Contextual Mention Picker",
  group: "Commands & composition",
  summary: "Find people, files and tools at the caret, then insert a reference as one token.",
  description: "Type @ to search people, files and tools without leaving the draft, or / for commands when you pass them. Matching letters appear in pencil while the list tracks the caret across lines. Selected references become ink chips with stable IDs, and each chip can be focused or removed as a unit.",
  useCases: ["Grounding an agent prompt in a file or tool", "Referencing teammates in a note", "Attaching structured context to free-form text"],
  scale: "m",
  Demo: MentionPickerDemo,
  Preview: MentionPickerPreview,
  usage: `import { MentionInput } from "@detent/ui";

<MentionInput
  aria-label="Note to Scout"
  placeholder="Type @ to add context"
  items={[
    { id: "ines", type: "person", label: "Ines Duarte", detail: "Firmware" },
    { id: "launch", type: "file", label: "OS-1 launch notes", detail: "press/os-1-launch.md" },
  ]}
  onValueChange={(draft) => console.log(draft.text, draft.tokens)}
/>`,
  props: [
    { name: "aria-label", type: "string", required: true, description: "Accessible name for MentionInput." },
    { name: "items", type: "readonly MentionItem[]", description: "Local options grouped by resource type." },
    { name: "loadItems", type: "(query, signal) => Promise<readonly MentionItem[]>", description: "Optional async search for @ queries, merged with local items. Each new query aborts the previous request." },
    { name: "value / defaultValue", type: "MentionDraft", description: "Controlled draft or initial editable text and reference ranges." },
    { name: "onValueChange / onSelect", type: "callback", description: "Observe edits or newly inserted references." },
    { name: "commands", type: "readonly MentionItem[]", description: "Command items (type \"command\", label without the slash). The / trigger only opens when this is non-empty." },
    { name: "onEditorKeyDown", type: "(event, hasActiveSuggestion) => void", description: "Runs before the picker handles a key, e.g. to send on Enter only when no suggestion is active." },
    { name: "onPasteFiles", type: "(files: File[]) => boolean", description: "Intercept pasted images; return true to consume the paste." },
    { name: "invalid", type: "boolean", description: "Sets aria-invalid on the editor." },
    { name: "placeholder", type: "string", description: "Hint displayed when the input is empty." },
    { name: "readOnly / disabled", type: "boolean", default: "false", description: "Copyable read-only state or fully disabled editor." },
    { name: "sound", type: "boolean", default: "true", description: "Allow selection and removal sounds when sound is enabled." },
  ],
  exports: [
    { name: "MentionPicker / mentionOptionId", description: "Caret-anchored standalone listbox and helper for resolving option IDs." },
    { name: "MentionDraft / MentionItem / MentionToken", description: "Draft text, suggestion metadata and references with UTF-16 ranges." },
    { name: "MentionInputHandle", description: "Via ref: focus(), open(\"@\" | \"/\") to insert a trigger at the caret, and close()." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["@"], action: "Open mention suggestions" },
    { keys: ["/"], action: "Open command suggestions (only when commands are provided)" },
    { keys: ["↑", "↓"], action: "Move through grouped results" },
    { keys: ["Enter", "Tab"], action: "Insert the active reference" },
    { keys: ["Esc"], action: "Close the list" },
    { keys: ["←", "→"], action: "Focus an adjacent token or return from the token to the text" },
    { keys: ["Backspace", "Delete"], action: "Remove a focused or adjacent token" },
  ],
  a11y: [
    "The editor retains focus while aria-activedescendant identifies the active listbox option.",
    "Group labels identify people, files and tools. A polite status reports loading, empty results and lookup failures.",
    "Committed tokens are keyboard-reachable and their accessible names identify the resource type.",
  ],
  motion: [
    { state: "Rest", behaviour: "Committed references sit inline as quiet ink chips." },
    { state: "Navigate", behaviour: "The active pencil rule and result background change immediately." },
    { state: "Enter / exit", behaviour: "The listbox settles toward the caret on the 200 ms surface tween and exits in 140 ms." },
    { state: "Insert", behaviour: "The chip takes its place immediately and the pencil fill drains to its resting surface." },
    { state: "Loading", behaviour: "One pencil spinner marks an outstanding lookup." },
    { state: "Reduced motion", behaviour: "Surface movement becomes a 120 ms opacity cue and the loading mark stays still." },
  ],
  sound: [{ event: "Insert reference", voice: "select" }, { event: "Remove reference", voice: "dismiss" }],
};
