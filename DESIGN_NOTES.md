# Design notes — where this page agrees with the design system, and where it doesn't

The brief says to use the TypeUI design system and to record every override. This
file is that record. It is deliberately blunt: an override I cannot justify is a
mistake I should fix, not a preference I should defend.

## What the design system actually gave us

`npx typeui.sh pull editorial -f design` wrote `DESIGN.md` at the project root.
The slug is `editorial`, chosen because its own description is "magazine-inspired
editorial layout with refined serif typography, structured grids, elegant reading
experiences" — the nearest thing in the registry to a lab contact sheet.

**The skill file the brief expected was never written.** `-f design` produces
`DESIGN.md` only; `-f skill` (the default) is what writes a provider skill, and it
requires an explicit `-p <provider>`. There is no `.agents/skills/design-system/`
directory in this repository, and nothing was synthesised to stand in for one —
inventing a skill file and calling it "the design system" would have been a lie
about where the rules came from. What was followed, in full, is `DESIGN.md`.

Its tokens, as shipped:

| token | value |
| --- | --- |
| colour · primary | `#111111` |
| colour · secondary | `#f1f1f1` |
| colour · surface | `#FFFFFF` |
| colour · text | `#111827` |
| colour · success / warning / danger | `#16A34A` / `#D97706` / `#DC2626` |
| type · h1 | Gelasio 2.5rem |
| type · body | Gelasio 1rem |
| type · label | Ubuntu Mono 0.875rem |
| scale | 14 / 16 / 18 / 24 / 32 / 40 |
| radius | sm 4px, md 8px |
| spacing | sm 8px, md 16px, "8pt baseline grid" |

## The rule I applied

Where the design system and the art direction disagree on **palette or
typography, the art direction wins** — it is the thing the page is judged on, and
a darkroom cannot be rendered on `#FFFFFF`. Everything else in the system (the
measure, the label treatment, the spacing rhythm, the refusal to decorate) was
kept where it did not fight the brief.

## Every override, with the reason

| # | design system says | this page does | why |
| --- | --- | --- | --- |
| 1 | surface `#FFFFFF` | ground `#0C0C0B` | The subject is a darkroom contact sheet and a sensor in the dark. A white page cannot show a mosaic glowing faintly; it also destroys the one accent, because amber only reads as a safelight against near-black. |
| 2 | text `#111827` | `#E8E3D6` | Consequence of 1. Warm off-white rather than pure white, so the screen is not a light source in a dark room. |
| 3 | primary `#111111` | accent `#F5B301` (the only accent) | `#111111` is invisible on `#0C0C0B`. Amber is the safelight, and it is used for exactly three things: focus, active state, and the cursor. |
| 4 | h1 Gelasio 2.5rem | Instrument Serif, `clamp(2.75rem, 7.5vw, 5.75rem)` | Gelasio is a Georgia metric-compatible web serif; Instrument Serif is a display face with the high-contrast, slightly condensed feel of a printed plate caption. The headline is the hook, and it has to hold a phone in one line-per-thought. |
| 5 | body Gelasio | Hanken Grotesk Variable | Body text is read, not admired. A serif at 16px on near-black is harder to read than a neutral sans, and the serif is already doing the display work. |
| 6 | label Ubuntu Mono | JetBrains Mono Variable | Readouts are tabular numbers at 11–13px. JetBrains Mono's tabular figures and unambiguous `0/O` and `1/l` matter more here than Ubuntu Mono's character, because the numbers are the subject. Both are mono, so the label role is preserved. |
| 7 | radius 4px / 8px | `0` | Rounded corners read as "card" and this page has no cards: it has a sheet, rules and measurement. Nothing on the page is a container. |
| 8 | spacing 8pt grid (8/16px) | rem rhythm on a 0.25rem base, `clamp()` between breakpoints | The 8pt grid is honoured in spirit — every gap is a multiple of 4px — but a fixed 8pt grid cannot survive `clamp()` type. Section rhythm is 2.75–5rem, which is 44–80px, all multiples of 4. |
| 9 | components: buttons, cards | none | There is no button on the page. Every control is a native `input`/`select`; every region is delimited by a hairline. |
| 10 | (no rule on gradients) | one gradient, the error-map scale | The brief bans gradients on backgrounds, text and buttons. The single exception is `.guess-swatch`, which is a legend for the error ramp: it is a picture of the data, not decoration. |
| 11 | (no rule on shadows) | none | Depth is a banned effect here. Layers are separated by position, not by blur. |

## What was kept from the system

- **Label-caps.** Small mono, uppercase, letterspaced — used for every section
  figure (`FIG. 04`), control label and readout caption.
- **One accent for state.** The system's single primary is the single amber here.
- **Restraint.** No decorative elements, no icon circles, no drop shadows.
- **A structured measure.** The 12-column grid in `DESIGN.md` became the
  `.section` grid: a 2-column margin for figure numbers and a 10-column body.

## Accessibility gates, measured rather than assumed

Contrast is computed with the WCAG relative-luminance formula
(`scripts/contrast.mjs`), not eyeballed:

| pair | ratio | verdict |
| --- | --- | --- |
| text `#E8E3D6` on ground `#0C0C0B` | 15.27:1 | AAA |
| dim `#8C8A80` on ground | 5.65:1 | AA (normal text) |
| accent `#F5B301` on ground | 10.56:1 | AAA |
| green `#4C9A52` on ground | 5.64:1 | AA |
| red `#D6452F` on ground | 4.43:1 | **below AA for normal text** |
| blue `#3566C9` on ground | 3.63:1 | passes only as a non-text graphic (3:1) |

The three data colours are fixed by the brief, so the response is not to change
them but to stop using them for text. They appear as **swatches, tiles and
bars** — graphics, where the 3:1 UI threshold applies and all three pass — while
every word stays in `--text` or `--text-dim`. That is also the better design:
colour means a filter, and a label is not a filter.

Known exception: the single letters `R`/`G`/`B` drawn inside the Bayer tiles in
`src/view/bayerDiagram.js` are ink on a coloured tile, which is 5.9:1 on green
and 3.6:1 on blue. The letters are repeated by the caption and by the three
percentages below the diagram, so no information is carried by that contrast
alone.

## What this file does not claim

It does not claim the page follows the design system. It follows the art
direction, keeps the system's structure and label language, and overrides its
palette, its typefaces and its radii — eleven times, listed above, each with a
reason that can be argued with.
