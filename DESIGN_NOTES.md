# Design notes — the paint scheme, and every place it leaves the design system

The brief asks for the TypeUI design system (`DESIGN.md`) and a record of every
override. This file is that record. It is deliberately blunt: an override I cannot
justify is a mistake to fix, not a preference to defend.

## What changed in the second pass

The first build followed `DESIGN.md` far enough to become a template: near-black
ground, an amber safelight accent, Instrument Serif display type, letterspaced
uppercase mono labels, square corners, and a 320px control sidebar. The page read
as "dark editorial explainer" — a costume the subject did not ask for, and one
that made every number look like a pull-quote instead of a measurement.

The remake keeps the engine, the three.js views and the section order, and
replaces the paint scheme:

- **No accent colour at all.** Chrome is ink on warm paper. The only saturated
  things on the page are the R/G/B data and the photographs themselves.
- **Paper, not night.** The page is a lab bench: warm grey stock, hairlines
  instead of boxes, plates instead of cards. Exactly three surfaces are dark and
  all three are images (the split viewer, the exploded stack, the error map).
- **One interface face.** Instrument Sans Variable for every word, at 400/500,
  sentence case, no letterspaced capitals anywhere. JetBrains Mono Variable for
  figures only, never below 11px.
- **Controls are instruments, not a dashboard.** They sit in a three-column
  console directly under the plate they change, each column sized to its job.
- **Two grounds, one page.** The same bench after dark: the tokens swap, the
  plates get darker than the page instead of lighter, and the three data colours
  are lifted so they still work as marks on a dark ground. Dark is the default,
  because the page is read at night beside the screen it is about; the masthead
  carries a quiet switch, and the choice survives a reload. Both grounds are
  measured below.

## Direction

The five lines the remake was built against:

- **Product** — an interactive sensor lab that takes a camera pipeline apart in
  the browser.
- **Character** — exact, dry, tactile.
- **World** — a bench in an optics lab: uncoated paper, graphite text, hairlines,
  photographs laid on the page as plates.
- **Moments** — the split specimen plate with its loupe and true-scale ruler; the
  exploded 24×24 sensor stack on the one dark stage.
- **Signature** — a paper console of instrument controls under the specimen, mono
  figures, and a ruler marked in real sensor sites (48 of 384, a true eighth).

## What the design system actually gave us

`npx typeui.sh pull editorial -f design` wrote `DESIGN.md` at the project root.
The slug is `editorial`. Its tokens, as shipped:

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

The skill file the brief expected was never written: `-f design` produces
`DESIGN.md` only, and `-f skill` needs an explicit provider. Nothing was
synthesised to stand in for one.

## The rule I applied

Structure and discipline come from the system; **palette, typefaces and radii are
set by the direction above.** The measure, the hairline language, the refusal to
decorate and the one-number-format habit are kept. The colours are not, because
the page is not white and a printed plate is not a product page.

## Every override, with the reason

| # | design system says | this page does | why |
| --- | --- | --- | --- |
| 1 | surface `#FFFFFF` | paper `#F2EFE6`, card `#F8F6EF`, sunk `#E7E3D6` | The subject is a photographed object on a bench. Warm stock separates the dark plates from the page without a shadow, and three steps of one neutral are enough to show what is raised. |
| 2 | text `#111827` | ink `#191814`, secondary `#55514A`, muted `#6F6A5E` | One warm ramp for surfaces and text, so nothing looks tinted against the paper. Three text roles only, all measured below. |
| 3 | primary `#111111` | no accent token | An accent would have to compete with the R/G/B data, which is the only colour that means anything here. Emphasis is carried by ink fills, weight and hairline weight instead. |
| 4 | h1 Gelasio 2.5rem | Instrument Sans, `clamp(38px, 4.4vw, 62px)` | The headline states a fact, not a mood. A display serif made it read as an essay; the same words in a neutral grotesk read as a caption for the plate under them. |
| 5 | body Gelasio | Instrument Sans Variable | Body text is read, not admired, and a second family would only be a costume. |
| 6 | label Ubuntu Mono | JetBrains Mono Variable | Every label sits next to a number and has to hold a column with it. Tabular figures and unambiguous `0/O` matter more here than character. |
| 7 | radius 4px / 8px | 3px plates, 6px controls, 8px panels | Nested radii: the plate is the outermost object, a control inside it is smaller, a panel holding controls larger. Square corners read as "sheet" but made every control look like a different species of box. |
| 8 | spacing 8pt grid (8/16px) | 4px grid, 88px between sections | Every gap is a multiple of 4px, and section rhythm is set by the content (a plate is 600px tall, so a section starts after a hairline and a 40px gap, not after a fixed 96px). |
| 9 | components: buttons, cards | buttons, selects, faders, plates | The page now has real controls (Expose, Retake, treatments, a layer-separation fader) because the interactions are the argument. They share one control radius and one border weight. |
| 10 | (no rule on gradients) | two gradients, both data | The error-map swatch and the print plate's own pixels. A gradient that is a picture of the data is not decoration. |
| 11 | (no rule on shadows) | one shadow, on plates only | `.plate` gets a 1px inset of warm black so a dark photograph sits on paper instead of floating. No blur beyond that, no glow, no coloured shadow. |

## What was kept from the system

- **A quiet, single-column measure.** One 1160px column, 40px gutters, no
  sidebar.
- **Hairlines instead of boxes.** Region boundaries are 1px rules at 13% and 26%
  of ink; nothing is a card with a full border and a shadow.
- **Restraint.** No icons, no badges, no pills, no decorative illustration. The
  only ornament is the RGGB wordmark, which is the subject.
- **Sentence case, short labels, no exclamation marks.** Same discipline as
  `DESIGN.md`, applied to display type as well as body.

## Accessibility gates, measured rather than assumed

`node scripts/contrast.mjs` computes every pair with the WCAG relative-luminance
formula, for both grounds. The current output:

| pair | light | dark |
| --- | --- | --- |
| ink on paper | 15.45:1 AAA | 15.60:1 AAA |
| ink on card | 16.43:1 AAA | 14.48:1 AAA |
| secondary `#55514A` / `#B7B1A3` on paper | 6.86:1 AA text | 8.76:1 AAA |
| muted on paper | 4.68:1 AA text | 5.74:1 AA text |
| muted on sunk | 4.19:1 graphic only | 5.96:1 AA text |
| paper on night | 15.87:1 AAA | 1.06:1 — not a text pair on the dark ground |
| data red on paper | 4.23:1 graphic only | 6.01:1 AA text |
| data green on paper | 3.61:1 graphic only | 8.28:1 AAA |
| data blue on paper | 5.40:1 AA text | 7.85:1 AAA |

The three data colours are fixed by the brief, so they are used where a graphic
threshold of 3:1 applies: tiles, swatches, channel marks, ranked bars. No word in
this page is set in a data colour — colour means a filter, and a label is not a
filter.

**Known exceptions, both deliberate:**

- The single letters `R`/`G`/`B` inside the Bayer tiles are white with a dark
  halo rather than a flat text role, because the three fills are mid-dark on both
  grounds: ink on a tile reaches only 2.86:1 on the light theme's blue and 1.88:1
  on the dark theme's green, while a haloed white letter clears 4.2:1 on all six
  combinations. The letters are also repeated by the caption (`RGGB over 6×6
  sites`) and by the three percentages under the diagram, so no information
  depends on that contrast.
- Muted `#6F6A5E` is used for 11.5px mono captions and never for body text, and
  never on `--sunk`, where it drops to 4.19:1 on the light ground.

**One thing the theme switch forces:** the error map is a density print, so "more
error" is more ink on paper and more light on the dark ground. The ramp, the
legend swatch and the sentence under it all switch together — a claim about the
picture cannot live only in the stylesheet.

## What this file does not claim

It does not claim the page follows `DESIGN.md`. It follows the direction above,
keeps the system's structure and its restraint, and overrides its palette, its
typefaces and its radii — eleven times, listed above, each with a reason that can
be argued with.
