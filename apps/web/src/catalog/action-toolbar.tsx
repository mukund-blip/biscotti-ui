import type { CatalogEntry } from "./types";
import { ActionToolbarDemo, ActionToolbarPreview } from "@/demos/action-toolbar-demo";

export const entry: CatalogEntry = {
  slug: "action-toolbar",
  number: "08",
  name: "Contextual Action Toolbar",
  group: "Commands & composition",
  summary: "Shows a toolbar at the text selection. Link and Comment open an inline input in the toolbar.",
  description:
    "A toolbar for a text selection in an editable region or a read-only article. It appears above the selection. If there is no space above, it appears below. It moves with the selection and does not jump. Link and Comment change the toolbar into an inline input: the width opens on a spring and the buttons fade out. Press ⌥F10 or ⌘/ to move focus to the toolbar. Use the arrow keys to move between buttons. Press Escape to return focus and the selection to the text.",
  useCases: ["Formatting in a lightweight editor", "Commenting on or annotating a read-only document", "Asking an agent about a highlighted passage"],
  scale: "m",
  Demo: ActionToolbarDemo,
  Preview: ActionToolbarPreview,
  usage: `import { useRef } from "react";
import { ActionToolbar, wrapRange } from "@biscotti/ui";

function LaunchNotes() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref} contentEditable suppressContentEditableWarning>
        Firmware 2.4 rewrites the encoder driver.
      </div>
      <ActionToolbar
        target={ref}
        onAction={(id, { range, value }) => {
          if (id === "bold") wrapRange(range, "strong");
          if (id === "italic") wrapRange(range, "em");
          if (id === "link" && value) wrapRange(range, "a", { href: value });
        }}
      />
    </>
  );
}`,
  props: [
    { name: "target", type: "RefObject<HTMLElement | null>", required: true, description: "The text region to watch: a contentEditable or a read-only article. Only selections inside it show the toolbar." },
    { name: "onAction", type: "(id: string, ctx: ToolbarActionContext) => void", required: true, description: "Runs an action. ctx has the live range, the selected text, the submitted value (input actions) and whether the action was already active. Whatever the host selects afterwards becomes the new selection." },
    { name: "actions", type: "ToolbarAction[]", default: "defaultToolbarActions", description: "Bold, Italic, Link, Comment and Ask Scout by default. Each action has an id, label, icon, optional text, shortcut, input, isActive and separated. Pass a stable array: a new identity re-measures the toolbar." },
    { name: "placement", type: '"top" | "bottom"', default: '"top"', description: "Preferred side. Flips automatically when there is no room." },
    { name: "offset", type: "number", default: "8", description: "Gap between the selection and the toolbar, in px." },
    { name: "collisionPadding", type: 'number | Partial<Record<"top" | "right" | "bottom" | "left", number>>', default: "8", description: "Keep this far from the viewport edges, e.g. { top: 64 } under a sticky header." },
    { name: "label", type: "string", default: '"Text actions"', description: "Accessible name of the toolbar." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds (still requires global opt-in)." },
    { name: "className", type: "string", description: "Classes for the toolbar surface." },
  ],
  exports: [
    { name: "ToolbarAction, ToolbarActionContext", description: "Types for actions and for the context passed to onAction." },
    { name: "defaultToolbarActions", description: "The default action set, for extending or reordering." },
    { name: "wrapRange(range, tag, attrs?)", description: "Wraps the range in a new element (strong, em, a, mark…), drops nested duplicates and selects the result." },
    { name: "unwrapElement(el)", description: "Replaces an element with its children and keeps them selected (toggling bold off, removing a link)." },
    { name: "rangeClosest(range, selector, root?)", description: "The closest matching ancestor of the range start, e.g. to read an existing href or test isActive." },
    { name: "selectContents(node)", description: "Selects a node's contents and returns the new range." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["⌥F10", "⌘/"], action: "Move focus from the text into the toolbar (Ctrl+/ off Mac)" },
    { keys: ["←", "→"], action: "Previous / next action (↑ ↓ also work; wraps)" },
    { keys: ["Home", "End"], action: "First / last action" },
    { keys: ["Enter", "Space"], action: "Run the focused action; focus stays in the toolbar so actions chain" },
    { keys: ["Esc"], action: "Return focus to the text with the selection restored" },
    { keys: ["⌘B", "⌘I"], action: "Bold / italic while focus is in the text (any action whose shortcut is ⌘ + a letter)" },
    { keys: ["Enter"], action: "In the Link / Comment input: apply" },
    { keys: ["Esc"], action: "In the input: cancel and return to the action's button" },
  ],
  a11y: [
    "role=\"toolbar\" with an accessible name and aria-orientation=\"horizontal\"; roving tabindex keeps a single tab stop.",
    "Toggle actions expose aria-pressed computed from the current selection (e.g. Bold is pressed inside <strong>).",
    "Icon-only buttons are labelled; shortcuts are exposed with aria-keyshortcuts and in the tooltip.",
    "Pointer presses don't steal focus or the native selection from the text. While focus is in the toolbar, the selection is painted with the CSS Custom Highlight API (where supported) so it stays visible.",
    "The inline input is labelled by its action (\"Link\", \"Comment\") and takes focus when it opens.",
  ],
  motion: [
    { state: "Rest", behaviour: "A 40 px raised panel (shadow-3) centred over the first line of the selection, 8 px away." },
    { state: "Enter", behaviour: "Surface variant: rises 4 px from the side facing the selection with a slight scale, 200 ms. It is positioned before paint, so it never slides in from elsewhere." },
    { state: "Follow", behaviour: "When the selection changes, x/y travel on the glide spring. Scroll and resize re-place it instantly so it stays glued to the text." },
    { state: "Flip", behaviour: "Switching between above and below jumps and fades back in rather than travelling across the selection." },
    { state: "Dragging", behaviour: "While a new selection is being dragged, the toolbar fades out (90 ms) and stops taking pointer events; it returns on release. The same happens when the selection scrolls off screen." },
    { state: "Morph", behaviour: "Link / Comment: the width springs to 320 px (layout spring), the buttons fade out in 80 ms and the input fades in (120 ms, 80 ms delay). Escape reverses it." },
    { state: "Hover / press", behaviour: "Button tone changes instantly on hover and fades out over 90 ms; pressing moves the button down 1 px." },
    { state: "Exit", behaviour: "Fades out with 2 px of travel over 140 ms when the selection collapses or leaves the target." },
    { state: "Reduced motion", behaviour: "No glide or travel: positions jump, and entry, exit and the morph become 120 ms opacity cues." },
  ],
  sound: [
    { event: "Toggle action (Bold, Italic)", voice: "tick (quiet)" },
    { event: "Plain action (Ask Scout)", voice: "tap" },
    { event: "Link / Comment applied", voice: "confirm" },
  ],
};
