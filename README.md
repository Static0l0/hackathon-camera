# The Mosaic

**Your camera never recorded a colour photo. Every pixel saw one colour, in very few
photons, and software invented the rest.**

This is an interactive explainer that runs a camera sensor in your browser: photons
become electrons, electrons become a red-green-green-blue mosaic, and four real
demosaicing algorithms turn that mosaic back into the picture you thought you took.
Nothing is pre-rendered. Move a slider and the physics, the noise and the
reconstruction are recomputed from scratch.

---

## Run it

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

```bash
npm test           # the engine's test suite (Vitest, 80 tests)
npm run build      # production build into dist/
npm run preview    # serve the build exactly as the deploy does
```

No API keys, no accounts, no network requests at runtime. The fonts are bundled and
self-hosted; the Web Worker runs from the same origin.

### Deploy

**Live: https://static0l0.github.io/hackathon-camera/**

`.github/workflows/deploy.yml` builds, runs the tests, and publishes `dist/` to
GitHub Pages on every push to `main`. It works out the base path from the repository
name, so a project page (`https://user.github.io/the-mosaic/`) and a user page
(`https://user.github.io/`) both work without editing anything:

```bash
BASE_PATH=/the-mosaic/ npm run build   # what CI runs for a project page
```

---

## What you are looking at

Six sections, in the order the story needs:

1. **The hook** — a draggable divider between what the sensor actually recorded and
   the photograph you would have been shown. Drag it; click any pixel and the panel
   below prints the numbers that produced that pixel.
2. **Photons** — an exploded sensor, with a cloud of dots built from the electrons the
   current frame really collected, and a slider that pulls the four layers apart and
   back together. A pixel collects hundreds of electrons, so the cloud is sampled when
   there are too many to draw; the exchange rate (`1 dot = 50 electrons`) is printed
   under it rather than hidden.
3. **One colour per pixel** — the RGGB grid, and why half of it is green.
4. **The guess** — you make it first. One red site, the four green neighbours that could
   stand in for its missing green, and a choice between the two pairs. Then the panel
   prices your guess against bilinear, against Hamilton–Adams, against the pair you
   passed on, and against the value the sensor would actually have measured. Below that:
   the two passes demosaicing really runs, four methods ranked on the same captured
   frame, the error map, and the assumption each method rests on. A **green rule** menu
   switches the gradient test off — force one axis, or drop the axis question and
   average all four — and the error map changes shape while you watch.
5. **The lab** — every remaining control, every readout, and the arithmetic behind
   the pixel you clicked.
6. **The print** — expose a frame, then choose how to print it. Eight darkroom
   treatments (hard paper, sepia, cyanotype, negative, solarise, lith, split tone)
   map the *same* measured bytes to a different final image. Exposing freezes a
   copy of the frame, so slider drags afterwards cannot rewrite your print. This
   closes the argument: the camera recorded numbers; the print is a choice.

**Controls:** the controls sit in a three-column console directly under the
specimen plate — capture, reconstruction, measurement — so a change and its result
are never more than one screen apart. Once that console scrolls off the top of the
screen, the settings the rest of the page still answers to follow the reader down
in a tray that floats just above the bottom edge, lined up with the same content
column: light level, shutter, ISO, aperture, scene and demosaic method. It covers
the least valuable band of the screen instead of sitting on the plate being read,
the gap under it keeps it from reading as part of the page edge, and it starts
with the sensor-stack section. It drops ISO and aperture below 1180px so the
remaining four keep their room, and is gone below 940px. The two live numbers in
the top bar stay visible while
you read. Drag the divider or click a pixel in the plate; every slider is
keyboard-operable. Sound is on by default — quiet, filtered mechanical clicks (no
beeps) — and can be muted in the footer. Settings are written to the URL hash, so a
link to a configuration reloads the exact same frame.

### The pipeline, in the order light travels

```
scene (linear light)
  → optical low-pass (the lens blurs before the sensor samples)
  → exposure: Poisson photons → clip at full well → read noise (electrons)
              → ISO gain → 12-bit quantise
  → Bayer mosaic (one channel per site)
  → demosaic   nearest · bilinear · Hamilton–Adams · Malvar–He–Cutler
  → white balance → sRGB gamma
```

The engine is in `src/engine/` and is pure: no DOM, no three.js, runnable in Node.
`src/worker/` runs it off the main thread and returns transferable buffers.
`src/view/` draws it. three.js draws the sensor stack; it never does the maths.

---

## Where AI helped and what I verified myself

This project was built with an AI coding agent (DeepSeek Harness). It is fair to say
the agent wrote most of the code; it is also fair to say nothing in the physics was
taken on trust.

**Written by the agent, checked by me:**

- **The demosaicing kernels.** The Malvar–He–Cutler coefficients were pulled from the
  original paper and from the IPOL reference implementation, not from memory, and
  then tested: every kernel sums to exactly 8 (i.e. 1.0 after the `/8`), and each of
  the three is asserted against its transpose. `tests/demosaic.test.js` also checks
  that each method reproduces a flat field exactly and that bilinear is exact on a
  linear ramp in the interior — properties that would fail if a coefficient were
  wrong.
- **The sensor model.** Read noise is added in electrons *before* the ISO gain, which
  is the difference between "ISO makes the picture brighter" and "ISO multiplies what
  the diode already counted". `tests/exposure.test.js` doubles the ISO and asserts
  that the signal doubles, the noise standard deviation doubles, and the ratio does
  not move.
- **The Poisson draw.** Mean and variance are asserted against λ for both the Knuth
  path (small λ) and the normal approximation (large λ), because the whole noise
  story depends on the variance being right.
- **Every number on the page.** The readouts are not illustrations: they come from
  the same `runPipeline()` call that produced the image, including the explained
  pixel in the lab, which prints the neighbour values, `dH`, `dV`, the direction
  chosen and the interpolated result for the pixel you clicked.

**Found by looking at the rendered page, not by reading the code:**

- The 2D-canvas fallback painted the developed image *over* the mosaic, so the
  divider appeared to do nothing. Both canvases were absolutely positioned and the
  later one won. Fixed with an explicit `z-index` on the mosaic — the layer that gets
  clipped has to be on top.
- The Malvar–He–Cutler kernel diagram crashed the explain panel: the coefficients are
  stored as flat 25-element arrays, so the renderer's `grid[row][column]` was
  `undefined`. Fixed in the engine with a `toGrid()` helper rather than in the view.
- The explanation panel read the method as an id when it is a record, and threw
  `Cannot read properties of undefined (reading 'label')`.

**What I would still check by hand before trusting this in a talk:** the PSNR values
are sensitive to the optical low-pass slider and to the scene. The table below is one
fixed configuration, and it is the configuration asserted in the tests.

---

## Third-party code and design system

Short version: this project's own code is MIT; three.js is MIT; the fonts are OFL 1.1;
GSAP is free to use but is not an OSI licence. Everything below was read from the
installed package rather than from memory, and `THIRD_PARTY.md` carries the table with
each version, licence and origin, including the two files whose provenance I could not
establish.

- **Runs in the page.** `three` 0.187.0 (MIT) draws the sensor stack and nothing else;
  `gsap` 3.15.1 (Standard "no charge" licence, not OSI) drives the section reveals;
  Instrument Sans and JetBrains Mono arrive as `@fontsource-variable/*` 5.3.0 packages
  under the SIL Open Font License 1.1 and are copied into `dist/assets/` by Vite.
  `hanken-grotesk` is still listed in `package.json` but is no longer imported by the
  page, so it does not reach the build.
- **Build only.** `vite` 8.3.8 (MIT), `vitest` 5.1.1 (MIT), `typescript` 7.0.2
  (Apache-2.0, no TypeScript in `src/`) and `typeui.sh` 0.7.1 (MIT). None of this ships.
- **Design system.** `DESIGN.md` is the TypeUI "Editorial" system, generated by the
  `typeui.sh` CLI (MIT). It contributes tokens only — palette, type scale, radii, an 8pt
  grid. No TypeUI code, markup or stylesheet is in the page; the CLI is not imported by
  `src/`, `index.html` or `vite.config.js`. The art direction then overrides that system
  in eleven documented places, listed in `DESIGN_NOTES.md`.
- **Algorithm references, not code.** The Malvar–He–Cutler coefficients were read from
  the original paper and the IPOL reference implementation, and the gradient test from
  the Hamilton–Adams paper. The implementations are this project's own, and the tests
  assert properties that would fail if a coefficient were mistyped.

---

## Measured behaviour

PSNR in dB against the clean, OLPF-blurred, white-balance-free reference at
160×120, ISO 100, light 1.0, f/2.8, 1/60 s, seed 7, OLPF σ 0.7 (`node scripts/report.mjs`):

| scene | nearest | bilinear | Hamilton–Adams | Malvar–He–Cutler |
| --- | --- | --- | --- | --- |
| photo | 33.98 | 38.78 | 40.63 | 40.50 |
| zone plate | 20.65 | 24.00 | 32.22 | 29.76 |
| slanted edge | 32.62 | 36.68 | 40.56 | 38.93 |
| fine stripes | 33.03 | 32.57 | 33.61 | 33.69 |
| Siemens star | 20.44 | 25.03 | 32.84 | 29.51 |
| text on colour | 27.64 | 33.49 | 31.26 | 29.78 |

At the shipped defaults (384×216, ISO 100, light 40 %, σ 0.6) the page reports
41.5 dB, colour error 1.30 DN, 0 % clipped, mid-grey SNR 28.0 dB, and roughly
170 ms per frame on a laptop.

---

## Limitations, honestly

- **Bilinear beats both "smart" methods on hard text.** 33.49 dB against 31.26 and
  29.78. Colour-difference methods overshoot on saturated edges; that is a real
  property of the algorithms, not a bug in this implementation, and it is why the
  scene picker matters.
- **PSNR is not the whole story.** It is measured against a reference that includes
  the optical low-pass (the demosaicer cannot undo the lens) and excludes white
  balance (a global gain would flatter or punish methods for reasons unrelated to
  interpolation). Absolute numbers therefore depend on those choices — and on the
  zone plate, switching the gradient test off and forcing one axis *raises* the score
  (31.63 dB against 29.78 dB) while producing visible bands, because a radial pattern
  has no single correct axis and PSNR averages the damage away. The page says so under
  the table instead of letting the number argue the opposite case.
- **The photon cloud is sampled.** One dot is one electron only when a frame is
  small enough; above that a ladder (`1, 2, 5, 10, 20, 50, 100, 200`) kicks in and the
  readout states the ratio. The dot *pattern* still comes from the engine's own
  Poisson draw, so it is a sample of the truth rather than a drawing of the idea.
  A pixel holds hundreds of electrons, so a one-dot-each picture of a 24×24 patch would
  be a fog: the budget is deliberately below that, and the exchange rate is printed.
- **The explanation is still partly prose.** The two passes demosaicing runs are
  described in words and priced at one pixel, and the gradient test can be switched
  off to watch the artefacts change shape — but there is no frame-by-frame stepper
  following one 24×24 patch from lens to photograph. That is the thing I would build
  next, and section 4 says so.
- **ISO is shown as a gain, not as a real camera's pipeline.** There is no analogue
  gain stage, no dual conversion gain, no noise reduction, no sharpening, and no
  JPEG. Real cameras do considerably more than this, which is why real cameras hide
  the mosaic better than this simulation does.
- **Metrics are skipped while you drag.** The PSNR and colour-error readouts print
  `—` with a pending marker and settle 240 ms after the last input, rather than
  showing a stale number. The pictures themselves are always live.
- **The data colours are not all AA-contrast.** Red (4.23:1) and green (3.61:1)
  fall below WCAG AA against the paper, so they are used for fills and swatches
  only — never for text. Every word is ink (`#191814`, 15.45:1). The lifted dark
  theme versions clear AA on their own ground. The full table, including the two
  known exceptions, is in `DESIGN_NOTES.md`.
- **There is no accent colour.** The page is ink on paper, and the only saturated
  things on it are the R/G/B data and the photographs. Emphasis comes from ink
  fills and hairline weight.
- **Two grounds, one switch.** Dark is the default and the paper version is one
  click away in the masthead; the choice is stored and applied before the first
  paint, so a reload never flashes the wrong ground. Canvas work (the Bayer
  diagram, the loupe, the error map, the three.js clear colour) reads its colours
  from the same custom properties rather than repeating them, so a theme change
  repaints everything — including the direction of the error ramp, which has to
  stay "more error = more of something" on both grounds.
- **No rolling shutter and no X-Trans.** Both were listed as stretch goals in the
  brief and neither is implemented; four Bayer demosaicers and one sensor model is
  the whole of it.
- **The text scene is drawn with a 5×7 bitmap font**, not canvas text, so the engine
  runs unchanged in Node.
- **A full-page screenshot is not a valid picture of the sensor stack.** The stack
  only renders while it is on screen (`IntersectionObserver`), so a capture beyond
  the viewport photographs an untextured sheet. Any visual check of that section
  has to scroll to it, wait for the patch, and only then capture.

---

## Layout

```
src/engine/     pure maths: prng, scene, exposure, cfa, demosaic/, develop, metrics, explain, pipeline
src/worker/     engine.worker.js — runs the engine, transfers buffers back
src/view/       splitView, threePainter, canvasPainter, sensorStack, loupe, controls,
                readouts, explainPanel, bayerDiagram, guessPanel, guessDemo,
                printStudio, motion, client
src/audio.js    procedural Web Audio — shutter, tap, develop, error; on by default
tests/          80 Vitest tests, engine only
scripts/        report.mjs (measurements), shot.mjs (headless CDP screenshots + probes),
                contrast.mjs (WCAG ratios), probes/ (page-side checks)
NOTES.md        one line per function: takes, returns, why
DESIGN.md       the TypeUI design system this project started from
DESIGN_NOTES.md every place the art direction overrides that system, and why
```

Built with Vite, three.js and GSAP. No framework, no UI kit, no chart library.

---

## License

This project is released under the MIT License — see [`LICENSE`](LICENSE)
(Copyright © 2026 Static0l0).

Third-party components keep their own licences: three.js (MIT), GSAP (Standard "no
charge" licence — free to use, not OSI), the fonts (SIL OFL 1.1), and the build tools
(MIT / Apache-2.0). Each one, with its version and where the licence was verified, is
listed in [`THIRD_PARTY.md`](THIRD_PARTY.md).
