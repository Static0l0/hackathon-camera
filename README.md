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
npm test           # the engine's test suite (Vitest, 61 tests)
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

Five sections, in the order the story needs:

1. **The hook** — a draggable divider between what the sensor actually recorded and
   the photograph you would have been shown. Drag it; click any pixel and the panel
   below prints the numbers that produced that pixel.
2. **Photons** — an exploded sensor, with one dot per electron the current frame
   really collected, and a slider that pulls the four layers apart and back together.
3. **One colour per pixel** — the RGGB grid, and why half of it is green.
4. **The guess** — you make it first. One red site, the four green neighbours that could
   stand in for its missing green, and a choice between the two pairs. Then the panel
   prices your guess against bilinear, against Hamilton–Adams, against the pair you
   passed on, and against the value the sensor would actually have measured. Below that:
   the two passes demosaicing really runs, four methods ranked on the same captured
   frame, the error map, and the assumption each method rests on.
5. **The lab** — every remaining control, every readout, and the arithmetic behind
   the pixel you clicked.

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
  interpolation). Absolute numbers therefore depend on those choices.
- **The photon cloud is sampled.** One dot is one electron only when a frame is
  small enough; above that a ladder (`1, 2, 5, 10, 20, 50, 100, 200`) kicks in and the
  readout states the ratio. The dot *pattern* still comes from the engine's own
  Poisson draw, so it is a sample of the truth rather than a drawing of the idea.
- **The dot cloud reads as dust, not as countable points.** At 24×24 sites with
  hundreds of thousands of electrons, points overlap.
- **The explanation is still partly prose.** The two passes demosaicing runs are
  described in words and priced at one pixel; there is no frame-by-frame stepper
  following one 24×24 patch from lens to photograph, and no switch that disables
  Hamilton–Adams' gradient test so you can watch the zipper appear on demand. Those
  are the two things I would build next, and section 4 says so.
- **ISO is shown as a gain, not as a real camera's pipeline.** There is no analogue
  gain stage, no dual conversion gain, no noise reduction, no sharpening, and no
  JPEG. Real cameras do considerably more than this, which is why real cameras hide
  the mosaic better than this simulation does.
- **Metrics are skipped while you drag.** The PSNR and colour-error readouts print
  `—` with a pending marker and settle 240 ms after the last input, rather than
  showing a stale number. The pictures themselves are always live.
- **The data colours are not all AA-contrast.** Red (4.43:1) and blue (3.63:1) fall
  below WCAG AA against the ground, so they are used for fills and swatches only —
  never for text. Text, dim text and the amber accent pass (15.27:1, 5.65:1,
  10.56:1).
- **No rolling shutter and no X-Trans.** Both were listed as stretch goals in the
  brief and neither is implemented; four Bayer demosaicers and one sensor model is
  the whole of it.
- **The text scene is drawn with a 5×7 bitmap font**, not canvas text, so the engine
  runs unchanged in Node.
- **A full-page screenshot is not a valid picture of a scroll-driven state.** The
  sensor stack animates on `ScrollTrigger`; capturing beyond the viewport resizes the
  page and re-fires the trigger. Any visual check of that section has to scroll to it
  and wait.

---

## Layout

```
src/engine/     pure maths: prng, scene, exposure, cfa, demosaic/, develop, metrics, explain, pipeline
src/worker/     engine.worker.js — runs the engine, transfers buffers back
src/view/       splitView, threePainter, canvasPainter, sensorStack, loupe, controls,
                readouts, explainPanel, bayerDiagram, guessPanel, motion, scroll, client
tests/          61 Vitest tests, engine only
scripts/        report.mjs (measurements), shot.mjs (headless CDP screenshots + probes),
                contrast.mjs (WCAG ratios), probes/ (page-side checks)
NOTES.md        one line per function: takes, returns, why
DESIGN.md       the TypeUI design system this project started from
DESIGN_NOTES.md every place the art direction overrides that system, and why
```

Built with Vite, three.js and GSAP. No framework, no UI kit, no chart library.
