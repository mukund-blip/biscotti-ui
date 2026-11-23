# Biscotti UI

<img src="apps/web/public/brand/biscotti-hero-480.webp" alt="Biscotti, the cream pup mascot" width="180" align="right">

**Interfaces that click into place.** Twenty interactive React components for productivity, creative and AI‑native software.

> Quiet at rest. Delightful in motion. Precise in use.

Biscotti UI is built around one idea: **pencil, then ink**. Anything provisional (streamed text, proposed edits, pending writes, running tools) is drawn in a cobalt *pencil*. The moment it becomes real is a *click*: a latch you can see, feel and (optionally) hear. See [`DESIGN.md`](./DESIGN.md) for the full rationale. The mascot, Biscotti, is rendered from an editable Blender model. The library package is `@biscotti/ui` and its registry items are `biscotti-*`.

## Run it

```bash
pnpm install
pnpm dev            # showcase at http://localhost:3410 (pass --port to change)
pnpm test           # component behaviour tests (Vitest + Testing Library)
pnpm test:e2e       # Playwright: every route × light/dark, axe WCAG 2.2 AA, sound opt‑in
pnpm build          # regenerates catalog + registry, then builds the site
```

Requires Node 20+ and pnpm 10.

## Tour

- **`/`**: the component index. A short intro with the shadcn install command, then all twenty as live previews, grouped as tactile controls, commands & composition, agent interactions, and information & editing. A sticky category filter narrows the list and is linkable (`/#agent-interactions`). `/components` redirects here.
- **`/components/<slug>`**: the full demo with state controls, a copyable usage example, props, keyboard map, accessibility notes, a motion spec and a sound map. Components used in the Workbench link to it.
- **`/workbench`** (footer, hero and component pages): *Ostra Ops: the encoder shortage*, an integrated mini-app where the components drive each other:
  - ⌘K filters the orders table, including a nested "Filter by status" page and live order search.
  - "Mark shipped" is undoable from the toast.
  - Scout's simulated tool calls collapse into a summary while a canned answer streams at a controlled pace in the browser (no backend or model request).
  - Approving the purchase order (hold to confirm, 5 s undo) creates a task in the agent activity stack.
- **`/foundations`** (footer): the brand (Biscotti, the face tile and the wordmark), tokens, springs and the sound board.

## Verification

- `pnpm test`: 165 behaviour tests across all 20 components (keyboard, ARIA state, controlled/uncontrolled, streaming robustness).
- `pnpm test:e2e`: 100 Playwright checks, run on desktop and mobile:
  - Every route renders in light and dark with no console errors.
  - axe WCAG 2.2 AA passes. Axe is sampled twice and only stable violations fail, so a looping demo caught mid-fade doesn't flake.
  - Reduced motion is respected.
  - Sound is opt-in and persists.
- `pnpm build`: type-checks and statically prerenders every page.

## Structure

```
packages/ui/                  @biscotti/ui — the library (no showcase code)
  src/styles/                 tokens.css (CSS vars, light/dark), theme.css (Tailwind v4 mapping)
  src/motion/tokens.ts        springs & tweens per interaction class, reduced‑motion helpers
  src/sound/                  Web Audio synth engine (opt‑in) + usePlay / useSoundPrefs / SoundScope
  src/lib/                    cn, useControllable, fmt, Kbd, Spinner, LiveMark, useElapsed
  src/icons/                  16‑px icon set
  src/components/<slug>/      one folder per component (+ tests)
apps/web/                     Next.js showcase: gallery, docs pages, foundations, workbench
  src/catalog/<slug>.tsx      docs metadata per component (props, motion spec, sound map, a11y)
  src/demos/                  interactive demos (Ostra, a fictional synth maker, is the shared story)
  public/r/                   generated shadcn registry
scripts/                      gen-catalog.mjs, build-registry.mjs
e2e/                          Playwright suites
```

## Use it in your app

**Option A: shadcn registry (copy the source).**

```bash
npx shadcn@latest add <registry-url>/r/diff-inspector.json
```

Each component pulls in `biscotti-foundation` (tokens, motion, sound, utilities, icons) under `components/biscotti/`. Then add the styles after Tailwind:

```css
@import "tailwindcss";
@import "./components/biscotti/styles/index.css";
@source "./components/biscotti";
```

Set `NEXT_PUBLIC_REGISTRY_URL` / `REGISTRY_URL` to wherever you host `apps/web/public/r` (it defaults to the local dev server).

**Option B: workspace package.** Depend on `@biscotti/ui` and import from it directly. Peer deps: `react@19`, `motion@12+`.

### Theming in a host app

Every visual decision is a `--bis-*` CSS variable. Remap them on `:root` (or any subtree) to adopt your palette. Biscotti UI never forces its page background on you. Dark mode applies under `[data-theme="dark"]`, `.dark`, or `[data-theme="system"]` with `prefers-color-scheme`.

```css
:root { --bis-pencil: #5b5bd6; --bis-font-sans: "Inter", sans-serif; }
```

### Sound

Sound is **off by default**. Call `sound.enable()` from a user gesture (or render your own toggle with `useSoundPrefs()`). Components only play sounds for deliberate actions and outcomes: never on hover, focus, per streamed token or for background updates. Silence one instance with `sound={false}`, or a subtree with `<SoundScope muted>`. Users can disable sound permanently, and that choice is persisted.

### Motion

Springs are chosen per interaction class (`spring.control`, `latch`, `glide`, `layout`, `surface`). Under `prefers-reduced-motion`, travel becomes instant and a short opacity cue remains.

## Licence

MIT.


## Static export and deployment

`pnpm dev` and `pnpm build` retain the normal root-path Next app. For a static project-site export:

```bash
PAGES_SITE_URL=https://mukund-blip.github.io/biscotti-ui pnpm build:pages
node scripts/check-pages.mjs
pnpm preview:pages  # exact apps/web/out files at http://127.0.0.1:3418/biscotti-ui/
```

The URL above is a **proposed target**, not a claim that a site is live. The build sets
`output: export`, `/biscotti-ui` as the base path, trailing slashes, canonical metadata,
sitemap and registry dependency URLs from the same `PAGES_SITE_URL`. It emits
`.nojekyll` and a `pages-build.json` revision manifest. For a custom domain or fork,
pass its full origin and optional base path instead. The preview command is a
static deployment-path test harness: it serves those exact files, with real 404s,
not Next dev or a fallback SPA. It needs no extra packages.

`PAGES_SITE_URL` also controls the install commands on detail pages. The Pages
build regenerates registry JSON directly in `out/r`, leaving the checked-in local
registry unchanged. For clean-consumer testing against the loopback preview,
build with `PAGES_SITE_URL=http://127.0.0.1:3418/biscotti-ui`; rebuild for the intended
public origin before uploading. A local preview of a public-origin build still
displays that public origin in install commands; it does not make that host live.

The streaming showcase and Scout workbench use a clearly labelled browser-paced
simulation. Speed, partial-answer cancellation, simulated failure and retry stay
interactive on a static host. Library consumers can still supply `fetch` Responses,
ReadableStreams or async iterables to `useTextStream`.

Production is https://biscotti-ui.netlify.app, served from the domain root.
`.github/workflows/netlify.yml` deploys it on every push to `main` (or a manual run
on `main`): `PAGES_SITE_URL=https://biscotti-ui.netlify.app pnpm build:pages`, then
`check-pages` and `test:pages` on that exact export, then `netlify deploy --prod`
using the `NETLIFY_AUTH_TOKEN` repository secret. Netlify's own Git builds are
stopped for the site. `.github/workflows/pages.yml` is the pull-request check: it
builds the export under the `/biscotti-ui` sub-path and runs the same validation and
tests, without deploying. GitHub Pages isn't used.

A project site's `/biscotti-ui/robots.txt` is emitted for completeness, but crawlers
normally consult `/robots.txt` at the hostname root. That root policy must be
managed by the account's user/organization site if needed; this project cannot
set it from the `/biscotti-ui` subpath. The sitemap includes only public showcase routes,
not the internal `/lab/` harness pages; those are still exported, but hosted builds
mark every one `noindex, nofollow`, and `check-pages` enforces it.
