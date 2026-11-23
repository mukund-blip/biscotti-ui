# Building a Biscotti UI component

Read `DESIGN.md` first. This file is the practical rulebook. The three reference implementations are
`precision-toggle`, `thinking-timeline` and `diff-inspector` in `packages/ui/src/components/`. Read at least one fully before you start.

## Layout & ownership

```
packages/ui/src/
  styles/        tokens.css, theme.css, index.css      ← SHARED: do not edit
  motion/        tokens.ts (springs, tweens, useMotionTokens)   ← SHARED
  sound/         engine.ts, react.ts (usePlay)          ← SHARED
  lib/           utils.ts (cn, useControllable, fmt), primitives.tsx (Kbd, Spinner, LiveMark, useElapsed, VisuallyHidden)  ← SHARED
  icons/         index.tsx (<Icon name=…/>)            ← SHARED
  components/<slug>/
    <slug>.tsx   your component(s)
    index.ts     your exports (already exists; replace `export {};`)
    <slug>.test.tsx   vitest + RTL behaviour tests
apps/web/src/
  catalog/<slug>.tsx        your CatalogEntry (see catalog/types.ts)
  demos/<slug>-demo.tsx     your demo(s) (+ fixtures)
  app/lab/<slug>/page.tsx   a bare page rendering your Demo, for testing
  components/demo-kit.tsx   ← SHARED helpers (Stage, Controls, ControlSegment, …)
  components/stage/script-player.tsx  ← SHARED: useScript + ScriptBar for replayable event sequences
```

**Only touch files inside your own slugs.** If you need something in a shared file, such as a new icon, token or sound voice, do **not** edit it. Implement it locally (e.g. an inline SVG) and list the request in your final report so the orchestrator can promote it.

Inside the library, import foundation code by relative path (`../../motion/tokens`, `../../sound/react`, `../../lib/utils`, `../../icons`). In the web app, import from `@biscotti/ui` (or `@biscotti/ui/components/<slug>/<slug>` for deep imports — no `.js` extensions).

Exported names must be specific (`CommandPalette`, `CommandPaletteItem`, never `Item` or `Props`), because everything is re-exported from one barrel.

## Visual rules

- **Tailwind v4 classes using Biscotti UI tokens only.** Use `bg-paper/surface/raised/sunken/well`, `text-ink/ink-2/muted/faint`, `border-hairline/rule/edge`, `pencil`, `pencil-ink`, `pencil-soft`, `pencil-line`, `ok/warn/err` (+`-soft`), `thumb`, `on-ink`. **No raw hex values, and no default Tailwind palette colours** (`gray-500`, `blue-600` etc. are banned).
- Type sizes come from the token scale: `text-2xs` 11, `text-xs` 12, `text-sm` 13, `text-base` 14 (the default UI size), `text-md` 16, `text-lg` 20. Numbers, timers, paths, IDs and key caps use `font-mono` + `tabular`. `font-serif italic` is reserved for **provenance/rationale/citations** in agent output.
- Radii: `rounded-xs` 2 (chips, kbd), `rounded-sm` 4 (controls), `rounded-md` 6 (inputs), `rounded-lg` 10 (floating panels/cards), `rounded-xl` 14 (only for large stages). **No `rounded-full` pills** unless the part is physically round (dots, avatars, a knob).
- Depth: `shadow-1` (resting raised control), `shadow-2` (cards/panels), `shadow-3` (floating popovers/dialogs), `shadow-press` (inset). Draw borders with `shadow-[inset_0_0_0_1px_var(--bis-hairline)]` or `border-hairline`. No glows, no glass, no gradients as decoration.
- **Colour meaning:** `pencil` = provisional, live, selected-but-not-committed, focus. `ink` = committed or primary. `ok/warn/err` only for status. At most one moving pencil element per component at a time (the "live mark").
- Focus: add the `focus-ring` utility to every focusable element (pencil ring with a paper gap). Never remove focus styles.
- Icons: `<Icon name="…" size={14|16} />`; see `icons/index.tsx` for names. 16 px grid, 1.5 stroke.
- Both themes must look intentional. Check `[data-theme="dark"]`. Light is paper (#F4F3EF); dark is graphite.
- The static rest state must look finished and considered before any motion is added.

## Motion rules

Use `motion/react` with tokens from `motion/tokens.ts`:

- `spring.control` for thumbs and small indicators · `spring.latch` for commit moments (the only overshoot) · `spring.glide` for travelling selection indicators · `spring.layout` for height, collapse, insert and reorder · `spring.surface` for large surfaces entering.
- `tween.surfaceIn` / `tween.surfaceOut` (200/140 ms) for popovers. Use `surfaceVariants(from, reduced)` for floating panels. `tween.fade` (120 ms) for content swaps. `tween.drain` (240 ms) for pencil→ink colour drains.
- Hover/highlight states respond **instantly** (no transition in; ≤90 ms out). Keyboard selection moves instantly. Only secondary things animate.
- `const m = useMotionTokens()` then use `m.move(spring.x)` for transforms and `m.fade()` for opacity. Under reduced motion, travel becomes instant and opacity becomes a 120 ms cue. Check that `m.reduced` paths still communicate the change.
- Prefer transform/opacity. Animate height only via `height: "auto"` with `spring.layout`, and with `overflow-hidden`.
- No bounce on everything, no infinite decorative loops (except a live indicator while something is genuinely running).

## Sound rules

`const play = usePlay(soundProp)` and call `play(name, { velocity, pitch })` **only** in direct response to a user action or a meaningful outcome the user initiated. Voices: `tick` (notches, steps, small navigation), `tap` (button press), `latch`/`unlatch` (binary commit), `select` (choice change), `confirm` (submit/approve), `complete` (a user-initiated multi-step thing finished), `attention` (needs a human decision; at most once), `error`, `dismiss` (close/remove), `notify` (toast arrival caused by the user), `open`/`close` (palette or popover open/close).

Never play sounds on hover, on focus, for per-token streaming, for timers, or for background updates that the user didn't trigger. Every component accepts `sound?: boolean` (default `true`). Sound is globally off until the user opts in, and the engine handles that.

## Engineering rules

- `"use client"` at the top of component files. React 19 (ref is a normal prop, no forwardRef needed).
- Typed props with JSDoc on every prop. Support controlled + uncontrolled via `useControllable(value, defaultValue, onChange)` wherever it applies.
- Prefer composition (children/sub-components or render props) over giant config objects, but keep the common case a one-liner.
- Semantic HTML first. Use correct ARIA patterns (combobox/listbox with `aria-activedescendant`, grid, slider, radiogroup, dialog, `role=status` live regions for async outcomes). Full keyboard operation. Hit targets ≥ 24 px. Text contrast ≥ 4.5:1 via tokens.
- You may use `@base-ui/react` (v1.9) for floating positioning, dialogs, menus and popovers where it helps. Check its exports in `node_modules/@base-ui/react`. No other new dependencies without a strong reason (report it).
- SSR-safe: no `window` access during render; no `Math.random()` / `Date.now()` in render output (hydration).
- Accept `className` on the root.

## Demos & catalog

- Demos use the shared fictional company **Ostra**, a small studio that makes the **OS-1** desktop synthesizer (with OS-0 the older model). Content involves firmware, suppliers (encoders, keybeds, PCBs), launch notes, pre-orders, beta testers, support tickets and retailers. Keep names and numbers plausible and consistent. People: Mara Lind (founder), Theo Okafor (hardware), Ines Duarte (firmware), Jun Park (ops), Sam Reyes (support). The AI agent is called **Scout**.
- **Every visible control must work.** Search must search, approve must change state, sliders must change values. Streaming and agent components must expose **replay**: use `useScript` + `ScriptBar` from `components/stage/script-player.tsx` so the sequence can be played, paused, scrubbed and slowed down.
- `Demo` includes relevant state/variant controls via `demo-kit` (`DemoFrame`, `Stage`, `Controls`, `ControlSegment`, `ControlCheck`, `ControlButton`, `Readout`). Show the live value or state with a `Readout` where useful.
- Size the stage to the component: a toggle wants a small, quiet stage, while a table wants width. Don't wrap everything in an identical card.
- Catalog entry: fill every field honestly. `motion` lists rest, hover/focus, press, enter/exit, loading/complete, error, gesture and reduced motion where applicable. `sound` maps events to voices.

## Tests

`packages/ui/src/components/<slug>/<slug>.test.tsx` with vitest + @testing-library/react (+ user-event). Cover the core behaviour, keyboard operation, controlled/uncontrolled behaviour and ARIA state. Run with `pnpm --filter @biscotti/ui test -- <slug>`. Also run `npx tsc --noEmit -p packages/ui` and `-p apps/web`.

## Verify visually

A dev server runs at `http://localhost:3410`. Open `/lab/<slug>`. Use Playwright (`node .scratch/<you>-*.mjs`, importing `playwright`) to screenshot rest/hover/active/error states in **both themes** (set `localStorage["biscotti.theme"]` via `addInitScript`) and with `reducedMotion: "reduce"`. Take frame sequences of key transitions. Look at the images yourself and fix what you see. Check the console for errors and hydration warnings.
