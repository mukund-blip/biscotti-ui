# Biscotti UI — design rationale

> Quiet at rest. Delightful in motion. Precise in use.

Biscotti UI is built around **the click**: the notch a mechanism seats into, the click of a dial, the latch of a switch. That moment is the whole identity of this library. Most AI-era interfaces are full of things that are *not yet true*, such as streamed text, proposed edits, pending approvals and running tools. Biscotti UI gives those provisional states one visual language, and gives the moment they become real one consistent feel.

## How the direction was chosen

Three directions were written up after studying beautifului.dev, Linear and Raycast in a browser: **Instrument** (precision hardware), **Margin** (editorial) and **Ceramic** (tactile depth). The same brief went independently to Claude (Opus) and to OpenAI (gpt-6.2-sol via Codex):

- **Claude** recommended *"Bench"*: Instrument made stricter, with one live mark on screen at a time and a serif italic reserved for provenance.
- **OpenAI** recommended *"Working Copy"*: the identity built around the moment a provisional change takes effect, with a pending rule that closes on commit.

Both models dismissed Ceramic (neumorphism, contrast failures, too heavy for tables). Both rated Instrument best for utility across all 20 components.

**The decision.** I took Instrument as the material base and OpenAI's *pending → committed* idea as the semantic core. I rejected both proposed accent colours. Vermilion invites a Teenage Engineering homage and collides with error red. Citron fails contrast as a stroke on paper. In their place is **blue pencil**: the editor's non-printing mark. Provisional is pencil, committed is ink. That one rule explains the colour of a streaming caret, a proposed diff hunk, a focused control, a pending approval and a running step. It also leaves red, green and amber free to mean error, success and warning.

## Five principles

1. **Pencil, then ink.** Provisional state is drawn in `pencil` (cobalt). Committed state is `ink`. Colour never decorates.
2. **One live mark.** At most one pencil-coloured "live" element moves at a time: the caret, the active step, the latching thumb. When work finishes, the mark drains to ink and the label turns to past tense ("Wrote for 6.2s").
3. **Respond instantly, settle physically.** State changes on the input frame. Motion only settles what already happened. Only latches overshoot.
4. **Finished work shrinks.** Completed traces, tools and steps collapse into quiet, expandable summaries.
5. **Sound marks outcomes, not activity.** No hover sounds, no per-token sounds, nothing for background updates. Sound is opt-in.

## Material

- **Surfaces.** Warm paper (`#F4F3EF`) and graphite (`#111113`). Depth comes from hairlines and one soft ambient shadow, never from glass or glow.
- **Type.** Geist for UI, Geist Mono for every number, timer, path and key cap (always tabular). Newsreader Italic is reserved for one job: provenance and citations in agent output.
- **Geometry.** Radii are 2 (chips, kbd), 4 (controls), 6 (inputs), 10 (floating panels) and 14 (gallery stages). There are no pill shapes except where a part is physically round.
- **Ornament.** Tick marks and hairline rulers, used only where they measure something.

## Motion tokens

| Token | Use | Value |
|---|---|---|
| `micro` | hover in/out, highlight | 0 ms in · 90 ms out `cubic-bezier(.2,.8,.2,1)` |
| `fade` | content swap | 120 ms |
| `surface` | popovers, palette, toolbar | 200 ms in / 140 ms out `cubic-bezier(.16,1,.3,1)` + 4 px travel |
| `control` spring | thumbs, indicators | stiffness 700 · damping 45 (ζ≈0.85) |
| `latch` spring | toggles, approvals, commit | stiffness 900 · damping 42 (≈3–4 % overshoot) |
| `layout` spring | collapse, insert, reorder | stiffness 380 · damping 38 (ζ≈0.97) |
| `glide` spring | travelling indicators; the approval fold (card ↔ receipt) | stiffness 520 · damping 44 |

Under reduced motion, every travelling transform becomes either an instant position change or a 120 ms opacity cue. Live marks stay visible but stop moving.

## Sound

Every sound is synthesised at runtime with the Web Audio API, so there are no samples. Voices run through a single bus: per-voice envelope → master gain → limiter (DynamicsCompressor, threshold −6 dB, ratio 20). The bus has a voice cap and per-voice rate limits so sounds never pile up. All pitched voices are tuned to A-pentatonic, so any overlap stays consonant.

| Voice | Use | Synthesis |
|---|---|---|
| `tick` | notches, slider steps | 3 ms noise burst · bandpass 3.2 kHz Q8 · 18 ms decay |
| `tap` | button press | 2 ms noise + 180 Hz sine thump, 40 ms |
| `latch` / `unlatch` | toggle on / off | two transients 26 ms apart (engage, seat); off is pitched 0.8× |
| `select` | segment or option change | short filtered tick plus a quiet E6 partial |
| `confirm` | approve, submit | A5 + E6 fifth, 4 ms attack, 140 ms decay |
| `complete` | task done | three-note rising pentatonic arpeggio, very quiet |
| `attention` | approval needed | E6 → A5, played once |
| `error` | failure | low, dull two-note descent, low-passed |
| `dismiss` | close, remove | soft downward tick |

Sound is off by default. Enabling it is a user gesture, which also unlocks the AudioContext. Volume is adjustable, and "never play sounds" can be set permanently.
