import type { CatalogEntry } from "./types";
import { CommandPaletteDemo, CommandPalettePreview } from "@/demos/command-palette-demo";

export const entry: CatalogEntry = {
  slug: "command-palette",
  number: "05",
  name: "Command Palette",
  group: "Commands & composition",
  summary: "Searches commands with ⌘K. Supports fuzzy ranking, nested pages and async results.",
  description:
    "A keyboard-first command palette. Use it as a ⌘K dialog or inline. The query is fuzzy-matched against titles, subtitles and hidden keywords. Matched letters are underlined in pencil. Results re-rank by match quality. Some commands open a nested page and show a breadcrumb chip in the input. Press Backspace in an empty query to go back one page. When a command runs, its row flashes in ink and the palette closes.",
  useCases: ["App-wide navigation and actions", "Changing a record's status or assignee without leaving the keyboard", "Searching remote data (orders, tickets) beside local commands"],
  scale: "l",
  Demo: CommandPaletteDemo,
  Preview: CommandPalettePreview,
  usage: `import { CommandPaletteDialog, type CommandGroupDef } from "@biscotti/ui";

const groups: CommandGroupDef[] = [
  {
    id: "nav",
    label: "Navigation",
    items: [{ id: "inbox", title: "Support inbox", icon: "mail", onSelect: () => go("/inbox") }],
  },
  {
    id: "actions",
    label: "Actions",
    items: [
      {
        id: "status",
        title: "Change ticket status",
        page: {
          id: "status",
          title: "Status",
          groups: [
            {
              id: "statuses",
              label: "Statuses",
              items: [{ id: "resolved", title: "Resolved", onSelect: () => setStatus("Resolved") }],
            },
          ],
        },
      },
    ],
  },
];

<CommandPaletteDialog groups={groups} placeholder="Search Ostra…" />`,
  props: [
    { name: "groups", type: "CommandGroupDef[]", required: true, description: "Groups of commands ({ id, label, items, showWhen }). showWhen \"idle\" groups (Suggestions, Recent) only show with an empty query; \"searching\" groups only with one." },
    { name: "sources", type: "CommandSource[]", description: "Async groups searched after the local ones: search(query, signal), with debounce (140 ms), minQuery (1), loadingLabel and errorLabel." },
    { name: "placeholder", type: "string", default: '"Search commands…"', description: "Input placeholder on the root page. Nested pages use their own placeholder or \"Search {title}…\"." },
    { name: "query / defaultQuery / onQueryChange", type: "string / string / (q) => void", default: '— / "" / —', description: "Controlled or uncontrolled query for the current page." },
    { name: "onRun", type: "(item: CommandItem, path: string[]) => void", description: "Fires after any command runs, with the titles of the pages that led to it." },
    { name: "onDismiss", type: "() => void", description: "Escape on the root page (inline palette)." },
    { name: "onDone", type: "() => void", description: "Called after the execute flash. Without it, an inline palette resets to the root page." },
    { name: "emptyState", type: "ReactNode | ((query) => ReactNode)", description: "Replaces the default “No commands match” message." },
    { name: "autoFocus", type: "boolean", default: "false", description: "Focus the input on mount (inline palette; the dialog always focuses)." },
    { name: "maxListHeight", type: "number", default: "360", description: "Results height cap in px; the list scrolls beyond it." },
    { name: "footer", type: "boolean", default: "true", description: "Show the key-hint footer with the result count or page path." },
    { name: "open / defaultOpen / onOpenChange", type: "boolean / boolean / (open) => void", default: "— / false / —", description: "CommandPaletteDialog only. Controlled or uncontrolled open state." },
    { name: "hotkey", type: "string | false", default: '"mod+k"', description: "CommandPaletteDialog only. Global toggle; mod is ⌘ on Mac, Ctrl elsewhere. false to bind it yourself." },
    { name: "label", type: "string", default: '"Command palette"', description: "CommandPaletteDialog only. Accessible name of the dialog." },
    { name: "container", type: "HTMLElement | null", default: "document.body", description: "CommandPaletteDialog only. Portal target." },
    { name: "sound", type: "boolean", default: "true", description: "Allow this instance to play sounds (still requires global opt-in)." },
    { name: "className", type: "string", description: "Classes for the palette surface." },
  ],
  exports: [
    { name: "CommandPaletteDialog", description: "The ⌘K modal: scrim, scroll lock, focus containment and focus restore around a CommandPalette." },
    { name: "CommandItem", description: "id, title, subtitle, icon, keywords, shortcut (display only), disabled, onSelect, page (a CommandPageDef or a lazy function) and keepOpen." },
    { name: "CommandGroupDef, CommandPageDef, CommandSource", description: "Types for groups, nested pages and async sources." },
    { name: "fuzzyMatch(query, text)", description: "The matcher: returns { score, indices } or null. Favours word starts, camelCase humps and consecutive runs, and ignores spaces in the query." },
  ],
  dependencies: ["motion"],
  keyboard: [
    { keys: ["⌘K"], action: "Open or close the dialog (Ctrl+K off Mac)" },
    { keys: ["↑", "↓"], action: "Move the highlight (wraps, skips disabled). Ctrl+P / Ctrl+N also work" },
    { keys: ["PageUp", "PageDown"], action: "Move the highlight by 5" },
    { keys: ["⌘Home", "⌘End"], action: "First / last result" },
    { keys: ["Enter"], action: "Run the command, or open its page" },
    { keys: ["⌫"], action: "On an empty query: back to the previous page (its query and highlight are restored)" },
    { keys: ["Esc"], action: "Back one page; at the root, close the dialog" },
  ],
  a11y: [
    "The input is a combobox (aria-expanded, aria-controls, aria-autocomplete=\"list\") that points at the highlighted option with aria-activedescendant; focus never leaves the input.",
    "Results are a labelled listbox; each group is role=\"group\" labelled by its sticky header. Options carry aria-selected and aria-disabled, and aria-haspopup when they open a page.",
    "Key hints are read as “shortcut …” through visually hidden text.",
    "Result counts (and the page title on entering a page) are announced through a polite live region, debounced so typing isn't chattered.",
    "The dialog is aria-modal, keeps Tab in the input, locks page scroll and returns focus to the opener when it closes.",
  ],
  motion: [
    { state: "Rest", behaviour: "A raised panel: input row, sticky mono group labels, a key-hint footer." },
    { state: "Highlight", behaviour: "Moves instantly on keyboard and follows the pointer on hover. The active row gets a faint ink tint and a 2 px pencil tick." },
    { state: "Execute", behaviour: "The row flashes ink for 140 ms, then the dialog closes (or an inline palette returns to the root)." },
    { state: "Nested page", behaviour: "Content slides 14 px in the direction of travel on the glide spring and crossfades; the list height animates on the layout spring. The breadcrumb chip slides in from the left. Height changes from typing are instant." },
    { state: "Async", behaviour: "A source group shows a pencil spinner row (“Searching orders…”) after its debounce, then its results; failures show a quiet warning row." },
    { state: "Open / close", behaviour: "The dialog rises 4 px from above with a slight scale (200 ms in, 140 ms out) over a fading scrim." },
    { state: "Reduced motion", behaviour: "Pages crossfade without sliding, the height jumps, and the dialog fades in place." },
  ],
  sound: [
    { event: "Dialog opens (⌘K)", voice: "open" },
    { event: "Dialog closes (Esc, ⌘K, scrim)", voice: "close" },
    { event: "Command runs", voice: "confirm" },
    { event: "Highlight / page navigation", voice: "none" },
  ],
};
