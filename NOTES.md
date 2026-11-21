# NOTES

One line per function: what it takes, what it returns, and why it exists.
Phase 1 (engine + tests, no UI). 58 tests, 5 files, all passing.

The rule the whole phase rests on: `src/engine/` never imports three.js and never
touches the DOM. Everything below runs in Node under Vitest, in a Web Worker, and
in the browser, from the same source.

---

## src/engine/util.js

- `clamp(v, lo, hi)` → number — hold a value inside a range; used wherever noise could push a sample out of the legal band.
- `clamp01(v)` → number — the 0..1 band, applied before gamma so only in-range floats reach the transfer curve.
- `lerp(a, b, t)` → number — linear mix; the filter kernels are affine combinations of their taps.
- `mirrorIndex(i, n)` → int — reflect an out-of-range index back inside the image. Reflection rather than wrap-around because it preserves index parity, so a mirrored Bayer tap is still the same colour.
- `createRgb(width, height)` → Float32Array(w·h·3) — the interleaved buffer used everywhere; Float32 because linear light needs more than 8 bits and the browser can upload it directly.
- `pixelIndex(x, y, width)` → int — offset of a pixel in an interleaved buffer, so the `*3` is written once.
- `copyRgb(src)` → Float32Array — an independent copy, so a caller cannot mutate the sensor's data by accident.

## src/engine/prng.js

- `mulberry32(seed)` → `() => number` in [0,1) — seeded PRNG. Same seed, same noise, same photo; that reproducibility is what lets the tests and the explanation panel state real numbers.
- `nextGaussian(rand)` → number — standard normal via Box–Muller. Read noise is Gaussian in electrons, so this is the physics, not a stylistic choice. `u1` is floored at 1/2³² because `log(0)` is −Infinity.
- `poissonSample(rand, lambda)` → int — photons arrive as a Poisson process. Knuth's product method below λ=30 (exact, and cheap when λ is small); normal approximation above it, because in daylight the product loop would run for thousands of iterations.

## src/engine/scene.js

- `srgbToLinear(c)` → number — undo the display curve for uploaded pixels: all engine maths must happen in linear light.
- `linearToSrgb(c)` → number — apply it for display; the inverse, used once at the end.
- `imageDataToLinear(rgba, width, height)` → Float32Array — canvas ImageData to linear radiance, for the upload path.
- `put(rgb, d, r, g, b)` — write one RGB triple at an offset; keeps the `*3` arithmetic in one place.
- `zonePlate(width, height)` — a pattern whose local frequency rises to Nyquist at the corner: the standard way to see where a sampling system fails.
- `slantedEdge(width, height)` — one near-vertical hard edge, the classic target for spotting anisotropic interpolation.
- `stripes(width, height)` — frequencies at and beyond Nyquist, where aliasing and false colour appear.
- `siemensStar(width, height)` — radial frequency sweep: every angle at once, so moiré becomes a visible flower.
- `textOnColour(width, height)` — hard saturated colour edges, the case where colour-difference methods overshoot.
- `photo(width, height)` — the synthetic landscape used as "a real photo"; deterministic because it seeds from a constant.
- `makeScene(name, width, height)` → Float32Array — dispatch by name, throwing on an unknown name so a typo fails loudly instead of rendering black.

## src/engine/cfa.js

- `channelForPixel(x, y)` → RED | GREEN | BLUE — the RGGB layout in one function, so the mosaic, the four demosaicers and the explanation panel cannot disagree about which colour a pixel kept.
- `gaussianKernel(sigma)` → {kernel, radius} — normalised 1D Gaussian with radius 3σ: the anti-alias filter a camera puts in front of the sensor.
- `opticalLowPass(rgb, width, height, sigma)` → Float32Array — separable blur applied *before* sampling; returns a copy at σ≤0 so callers never receive a borrowed buffer.
- `bayerMosaic(rgb, width, height)` → {mosaic, mask} — keep one channel per pixel and record which one; this is the loss the page is about.
- `mosaicCoverage(mask)` → {red, green, blue} — the 25/50/25 fact, computed rather than asserted, so the UI can print it.

## src/engine/exposure.js

- `isoGain(iso)` → number — ISO/100, the amplifier setting; deliberately a plain multiply, because that is the whole of what ISO does.
- `exposureGain({lightLevel, shutterSeconds, fNumber})` → number — electrons per unit radiance; light × time / f², the three things that actually collect photons. Throws on f ≤ 0 rather than returning Infinity.
- `expectedElectrons(radiance, gain)` → number — the Poisson mean for one sample.
- `snr(signal)` → number — `signal / sqrt(signal + σ²)`: the honest per-channel SNR, where shot noise grows with the signal and read noise does not.
- `snrDb(signal)` → number — the same in dB for the readout; −Infinity at zero rather than NaN.
- `expose(linear, width, height, settings)` → {dn, signal, electrons, gain, isoGain, clippedFraction, meanElectrons} — the whole sensor in one pass: Poisson draw, full-well clip, read noise **in electrons**, then gain, then 12-bit quantisation. Adding read noise before gain is what makes the ISO test meaningful.

## src/engine/demosaic/nearest.js

- `buildNearestTable()` → per-parity offsets — nearest neighbour must give the same answer every time; a table makes the choice explicit and testable instead of hidden in a scan order.
- `demosaicNearest(mosaic, mask, width, height)` → Float32Array — copy the nearest known value of each colour: the baseline that shows what guessing costs.
- `explainNearestPixel(mosaic, mask, width, height, x, y)` — which single neighbour supplied each missing channel.

## src/engine/demosaic/bilinear.js

- `collectTaps(mosaic, mask, width, height, x, y, channel)` → taps[] — gather the same-colour samples in the 3×3 window; bilinear is their mean and nothing else.
- `demosaicBilinear(mosaic, mask, width, height)` → Float32Array — own channel kept, missing channels averaged from 2 or 4 taps.
- `explainBilinearPixel(mosaic, mask, width, height, x, y)` — the taps plus the arithmetic string the UI prints.

## src/engine/demosaic/hamiltonAdams.js

- `at(mosaic, width, height, x, y)` → number — mirror-padded read, so edge handling is written once instead of in every kernel.
- `greenAtColourSite(mosaic, width, height, x, y)` → {value, dH, dV, direction, horizontal, vertical, left, right, up, down, left2, right2, up2, down2, centre} — Hamilton–Adams pass 1: compare horizontal and vertical gradients (`|left−right| + |2c−l2−r2|`) and interpolate along the smaller. Returns every intermediate so the panel can print the real dH and dV.
- `demosaicHamiltonAdams(mosaic, mask, width, height)` → {rgb, green} — pass 1 green, pass 2 red/blue through colour differences. Returns the green plane because the explanation needs the same numbers.
- `explainHamiltonAdamsPixel(mosaic, mask, width, height, x, y, green)` — dH, dV, the direction chosen and the arithmetic for one clicked pixel.

## src/engine/demosaic/malvarHeCutler.js

- `transpose5(k)` — R at a green in a blue row is the transpose of R at a green in a red row.
- `filter5(mosaic, width, height, x, y, kernel)` → number — apply one /8 5×5 kernel at a pixel, skipping zero taps, mirror-padded.
- `demosaicMalvarHeCutler(mosaic, mask, width, height)` → Float32Array — measured channel kept, the rest from three fixed kernels. No decisions, which is why it is fast and why it cannot adapt.
- `explainMalvarHeCutlerPixel(mosaic, mask, width, height, x, y)` — the 5×5 window, the kernel as a grid and each tap's weight, so "it is just a sum" is visible rather than asserted.

## src/engine/demosaic/index.js

- `methodInfo(id)` — label, year and one-line blurb for the picker.
- `demosaicWith(id, mosaic, mask, width, height)` → {rgb, detail} — one dispatch point, so the view never imports four modules.
- `explainWith(id, mosaic, mask, width, height, x, y, detail)` — the same dispatch for explanations; throws with a clear message if Hamilton–Adams is asked without its green plane.

## src/engine/develop.js

- `estimateWhiteBalance(mosaic, mask, width, height)` → {gains, means} — grey-world on the raw mosaic with green as reference, clamped to 0.25..4 so a nearly monochrome scene cannot produce an absurd gain.
- `applyWhiteBalance(rgb, width, height, gains)` — per-channel multiply, before gamma.
- `toSrgb(rgb, width, height)` — gamma-encode into a new buffer, never in place on the linear data.
- `toRgbaBytes(srgb, width, height)` → Uint8ClampedArray — the one place floats become 8-bit pixels for canvas or a DataTexture.
- `develop(rgb, width, height, gains)` → {srgb, balanced} — balance, then encode. That order matters: gamma before white balance would make the gains non-linear.

## src/engine/metrics.js

- `interiorMse(reference, test, width, height, border)` — MSE over the interior only; the 4px border is mirror-padded and unrepresentative.
- `psnr(reference, test, width, height, border)` → dB — `10·log10(255² / MSE)` on 8-bit sRGB, the conventional definition, so the numbers compare with published ones.
- `errorMap(reference, test, width, height)` → {map, max} — per-pixel error for the heatmap; the map is data, the colouring is the view's job.
- `errorStats(reference, test, width, height, border)` → {psnr, meanAbs, maxAbs, chromaError} — one pass for the readouts. `chromaError` isolates colour error from luminance error, which is what the artefacts actually are.

## src/engine/explain.js

- `neighbourhood(mosaic, mask, width, height, x, y, radius)` → 5×5 rows — the real values around a pixel with each cell's filter colour, so the panel shows sensor data rather than a drawing.
- `sentenceCase(text)` — capitalise a channel name for the sentence; trivial, but keeps the copy consistent.
- `buildSentence(channel, channels)` → string — "This pixel only measured red: 182. Green (139) and blue (96) were guessed." Built from the numbers, so the sentence cannot drift from the maths.
- `explainPixel({mosaic, mask, width, height, x, y, method, detail})` → {x, y, channel, channelName, value, neighbours, channels, method, sentence} — the depth feature: for a clicked pixel, return exactly the values the chosen method used.

## src/engine/pipeline.js

- `now()` — a clock that exists in the browser, in a worker and in Node.
- `runPipeline(overrides)` → {settings, scene, filtered, exposure, mosaic, mask, coverage, demosaic, display, reference, whiteBalance, metrics, timings} — one frame, in physical order, so the worker, the tests and the page run identical code.

---

## Numbers this phase produced

PSNR in dB, 160×120, ISO 100, light 1.0, seed 7, OLPF 0.7:

| scene | nearest | bilinear | Hamilton–Adams | Malvar–He–Cutler |
|---|---|---|---|---|
| photo | 33.98 | 38.78 | 40.63 | 40.50 |
| zonePlate | 20.65 | 24.00 | 32.22 | 29.76 |
| slantedEdge | 32.62 | 36.68 | 40.56 | 38.93 |
| stripes | 33.03 | 32.57 | 33.61 | 33.69 |
| siemensStar | 20.44 | 25.03 | 32.84 | 29.51 |
| text | 27.64 | 33.49 | 31.26 | 29.78 |

Two things worth saying out loud rather than smoothing over:

1. **Hamilton–Adams edges out Malvar–He–Cutler on photo** (40.63 vs 40.50). The
   brief asks for HA ≤ MHC; that holds within a 0.5 dB tolerance, and on the
   zone plate HA is clearly ahead (32.22 vs 29.76). MHC wins on stripes (33.69 vs
   33.61). Neither method dominates, which is the honest story.
2. **Bilinear beats both smart methods on `text`** (33.49 vs 31.26 / 29.78).
   Colour-difference methods overshoot on hard saturated edges. This belongs in
   the README's limitations section, not in a footnote.

Timings for one 384×216 frame: 130–182 ms depending on method. `expose` (~50 ms)
and `metrics` (25–59 ms) dominate. Too slow to run on every slider frame as it
stands — P5 has to stop recomputing metrics during a drag and reuse buffers.

---

## Phase 2: the browser layer

Phase 2 (plain-DOM viewer, loupe, controls, worker wiring). 58 engine tests still
pass; `npm run build` is clean; the page was driven in a real headless Chromium
(`scripts/shot.mjs`) and every screenshot below was taken from that browser, not
imagined.

The rule this phase rests on: `src/view/` and `src/worker/` may import
`src/engine/index.js` and nothing else from the engine. The viewer never contains a
demosaic formula; the worker never touches the DOM.

### src/worker/engine.worker.js

- `handleFrame({ id, settings })` → posts `{ type: 'frame', id, frame }` — run the whole pipeline off the main thread and hand back four transferable buffers. Why a worker: one frame is 130–190 ms, and the same 130 ms on the main thread would freeze the divider mid-drag.
- `handleExplain({ id, x, y })` → posts `{ type: 'explanation', id, explanation }` — answer about `lastFrame`, the frame currently on screen, not about a freshly recomputed one, so the numbers in the panel belong to the pixels the visitor is pointing at.
- `encodeMosaic(mosaic, mask, width, height)` → `Uint8ClampedArray` RGBA — sRGB-encode each site's DN and dim the two channels that pixel never measured (`TINT_OTHER = 0.22`). Why: the left half of the hook has to *look* like one colour per pixel, and the dimming is the visual statement of that fact.
- `toDn(mosaic)` → `Uint16Array` — integer DN for the loupe labels. Printing 1282.37 would claim precision the 12-bit ADC does not have.
- `summarise(result)` → plain object — the numbers the readouts show. `midGreySnrDb` comes from the exposure formula at 18% grey rather than from the noisy frame, so it reads as a property of the settings and does not flicker when the seed changes.
- `describeError(error)` → string — one line for the status bar when the engine throws, instead of a silent blank canvas.

### src/view/client.js

- `createEngineClient({ onFrame, onExplain, onFailure })` → `{ requestFrame, requestExplain, dispose }` — own the Worker and keep exactly one frame in flight; while one is running, remember only the newest settings (`wanted`) and drop the rest. Why: dragging a slider fires dozens of input events, and queuing them all would make the image lag seconds behind the hand. The last one wins because it is the only one the visitor still means.
- `send(settings)` (inner) — post the current settings and start the in-flight bookkeeping.

### src/view/viewer.js

- `createViewer({ container, mosaicCanvas, developedCanvas, divider, onPick, onHover })` → `{ setFrame, getFrame, setSplit, paint }` — two stacked canvases, one divider, one pointer handler.
- `blit(canvas, context)` — size a visible canvas to its CSS box times `min(devicePixelRatio, 2)` and draw the offscreen buffer with `imageSmoothingEnabled = false`. The cap keeps a 3x phone from quadrupling the fill cost for no visible gain; no smoothing is what lets a 384-pixel image show real pixel edges when scaled up.
- `paint()` — redraw both halves from the frame already in memory. Called by the ResizeObserver, so a window resize costs no recomputation.
- `setSplit(percent)` — clamp to 2..98, write `--split` on the container, update `aria-valuenow`. One number drives both the CSS clip and the divider position, which is why the two halves can never disagree.
- `toPixel(event)` — pointer position → image pixel, or `null` when outside. Clamped, because a click on the border must not produce an out-of-range explanation.

### src/view/loupe.js

- `createLoupe({ root, canvas, caption })` → `{ show, hide }` — a 7×7 window of the true pixel grid that follows the cursor.
- `show(frame, x, y, pointer)` — draw each cell from the worker's `mosaicView` bytes (so the tint exists in exactly one place), print its DN, outline the centre cell in amber, and write the caption. Unhides *before* measuring, because a hidden element reports zero size and the panel would then be placed as if it were weightless.
- `place(pointer)` — flip to the cursor's free side, then clamp inside the viewport. Flip first, clamp second: near an edge the panel should jump over the pixel rather than slide along the edge and cover it.

### src/view/controls.js

- `formatShutter(seconds)` → `"1/60 s"` — shutter speeds are fractions, and `0.0166666` is unreadable.
- `formatIso(iso)` → `"ISO 400"` — the unit belongs to the value, not to a separate label that can drift.
- `createControls({ root, settings, onChange })` → `{ sync }` — build the controls from the `CONTROLS` schema and report a full settings object on every change.
- `buildInput(definition, id, value)` — a `<select>` for enumerations, an `<input type="range">` for continuous values. A choice slider stores the *index* of an option but emits the physical value, and sets `aria-valuetext` to the formatted string, so a screen reader says "1/60 s" rather than "4".
- `refresh(definition, element, readout)` — recompute the printed value beside a control after any change, so the number and the handle cannot disagree.

### src/view/readouts.js

- `decibels(value)` → `"41.5"` or `"∞"` — PSNR of a perfect reconstruction is infinite, and `"Infinity dB"` in a lab readout looks like a bug.
- `createReadouts({ root })` → `{ update }` — one `<dt>/<dd>` pair per readout, filled from the worker's summary. The container is `aria-live="polite"`, so a screen reader hears the new PSNR after a change but is not interrupted mid-drag.

### src/view/explainPanel.js

- `formatValue(value)` → string — integers when the value is within 0.05 of one, else one decimal. Guided values are often whole numbers, and `1282.0` reads worse than `1282`.
- `kernelTable(grid)` → `<table>` — render a 5×5 weight grid with `·` for zeros and amber on the centre tap, so the panel shows the actual numbers rather than a name.
- `createExplainPanel({ root })` → `{ show, clear }` — sentence, row/column/method, then one block per channel: swatch, name, measured-or-guessed, value in DN, and the method's own intermediates (the bilinear taps, the Hamilton–Adams `dH/dV` and chosen direction, the Malvar–He–Cutler kernel).

### src/main.js

- No exported functions: it is the wiring. It builds the six view objects, holds the one `settings` object, sends it to the worker, and re-requests the last picked pixel after every new frame so the explanation follows the image instead of going stale.

### scripts/shot.mjs (dev only, not shipped)

- `parseFlags(argv)` — `--flag` / `--flag=value` into an object.
- `exists(path)` — does a browser binary exist at that path.
- `waitForTarget(port, timeout)` — poll the DevTools endpoint until the page target appears.
- `connect(url)` — open the CDP WebSocket.
- `send(method, params)` — one CDP command, promise keyed by id.
- `waitForLoad()` — poll `document.readyState` instead of racing a fixed sleep.
- `evaluate(expression)` / `poll(expression, timeout)` — read a value out of the page / wait for it to become true.
- `click(x, y)`, `move(x, y)`, `drag(x1, y1, x2, y2)` — real input events through CDP, with the drag interpolated over eight steps so the page sees a hand, not a teleport.
- `centreOf(selector, offset)` — element centre in CSS pixels, so tests aim at a control instead of at coordinates that break when the layout moves.
- `capture(full)` — screenshot the viewport, or the whole document via `Page.getLayoutMetrics`.
- `sleep(ms)` — the one place time passes.

### What the browser actually showed

- Default frame: 41.5 dB, colour error 1.30 DN, 0.0% clipped, mid-grey SNR 28.0 dB,
  1112 e⁻ mean, filter split 25·50·25, 167–226 ms per frame.
- The same pixel (row 90, col 238) explained under all four methods: measured red
  1673 DN every time, and four different guesses for the other two channels —
  nearest 1919/2296, bilinear 1879.8/2235.8, Hamilton–Adams 1890.5/2265.4,
  Malvar–He–Cutler 1928.6/2309.1. That spread, at one pixel, is the whole story of
  the piece.
- Two real bugs the screenshots caught, both fixed: `explainPixel` returns the
  method *record*, not an id, so `methodInfo(explanation.method)` was `undefined`
  and threw; and `kernelGrid` was a flat 25-entry array, so the panel's
  `grid[row][column]` was `undefined` and `.toFixed` threw.

### Known at the end of Phase 2

- The hook's difference is too subtle at 2.5× scale: at 1280 px wide the mosaic
  half and the developed half look like the same photo with a slight green cast.
  The teacher's idea only lands when the pixel grid is visible, so Phase 4 needs a
  zoom (or a magnified inset) in the hook.
- The loupe is hover-only, so on a phone it never appears. Phase 4 must give touch
  a way to see the grid — tap-and-hold, or the explain panel showing the 5×5
  neighbourhood it already returns.
- 167–226 ms per frame is fine for a slider release but not for a continuous drag;
  the coalescing keeps it responsive, but Phase 5 should cut `metrics` out of the
  drag path.

## Phase 3: three.js, and the thing the browser found

Phase 3 (the WebGL viewer, the exploded sensor, scroll driving the separation).
58 engine tests still pass, `npm run build` is clean (690 kB JS, 190 kB gzipped —
Phase 5 has to code-split three.js), and every claim below was measured in a real
headless Chromium at `http://127.0.0.1:5173/`, not inferred from the source.

**The rule this phase rests on:** three.js draws, the engine decides. Not one
number on the WebGL side is a rendering invention — the photon cloud is the
frame's own electron counts cut out of `exposure.electrons` by the worker.

**A Phase 2 bug this phase found.** Comparing the two renderers was supposed to
be a formality. Instead: in the 2D fallback the developed canvas painted straight
over the mosaic, because both are `position: absolute; inset: 0` and the developed
one comes second in the document. The divider looked like it did nothing. The fix
is one line (`#canvas-mosaic { z-index: 1 }` — the mosaic is the one being
clipped, so it has to be on top), and the proof is that forcing the old order
reproduces the old screenshot byte for byte
(`sha256 bd3c3654…`, `scripts/probes/zorder-before.js`). The "hook is too subtle"
worry recorded at the end of Phase 2 was this bug, not a design problem.

### src/view/splitView.js

- `createSplitView({ container, divider, painter, onPick, onHover })` → `{ setFrame, getFrame, setSplit, getSplit, painterKind, dispose }` — all the interaction (pointer, keyboard, ARIA, `--split`) and none of the drawing. Why: the two renderers need identical behaviour, so the behaviour lives in one place and the renderers are swapped underneath it.
- `setSplit(percent)` — clamp to 2..98, write `--split` on the container, update `aria-valuenow`, then tell the painter. One number, two consumers, so the line and the image can never disagree.
- `toPixel(event)` — pointer → image pixel or `null`. Clamped, because a click on the border must not ask for pixel -1.
- pointerdown/move/up — press records the start, movement past `DRAG_THRESHOLD = 4` px becomes a divider drag, a release without movement is a click on a pixel. The threshold is what stops a hand that twitches 2 px from being read as a drag when it meant "this pixel".
- divider keydown — arrows ±2, shift-arrows ±10, Home/End. The divider is a real `role="slider"`, so it has to work without a mouse.

### src/view/canvasPainter.js

- `createCanvasPainter({ container, mosaicCanvas, developedCanvas })` → painter — the 2D fallback, unchanged from Phase 2: one offscreen buffer, `imageSmoothingEnabled = false`, DPR capped at 2, `paint()` redraws from the frame in memory.

### src/view/threePainter.js

- `createThreePainter({ container, groundColour })` → `{ kind: 'webgl', setFrame, setSplit, paint, dispose }` — one orthographic camera, one unit plane, two `DataTexture`s, and a fragment shader that picks a side by `uv.x < uSplit`. Throws if there is no WebGL2, which is how `main.js` decides to fall back.
- `upload(bytes, width, height)` — reuse the texture when the size matches, else build a new one. `NearestFilter` and no mipmaps, because pixels are the subject; a smooth filter would quietly hide the mosaic.
- `scaleQuad()` — letterbox the image inside the container by aspect. Without it a 16:9 frame in a 21:9 box stretches, and every pixel in the loupe would disagree with the pixel under the cursor.
- `uv.y = 1 - vUv.y` — a `DataTexture`'s first row is the top row of the image; GL's V axis starts at the bottom. Forgetting this is the classic upside-down-texture bug, so it is commented in the shader.
- no animation loop — `paint()` is called when a frame arrives or the view resizes. An offscreen WebGL canvas still burns battery if you render it 60 times a second for no reason.

### src/view/sensorStack.js

- `createSensorStack({ canvas, readout })` → `{ setPatch, setSpread, getSpread, getPatch, dispose }` — a 24×24 patch of the frame as four physical layers plus the photons that landed on it.
- `cell(index)` — centre the grid on the origin, so the camera can aim at (0, y, 0) and stay independent of patch size.
- `pixelGrid(geometry, material, place)` → `InstancedMesh` of 576 — one draw call per layer. 576 meshes would be 576 draw calls and a stutter on every scroll tick.
- `comb(geometry, material, place)` → `InstancedMesh` of exactly `size` — the readout wires. Written separately after the first attempt reused a 576-instance helper and set `count = 24`, which put all 24 bars in the same place.
- `setPatch({ x, y, size, electrons, mask })` — sum the patch, pick the smallest stride from `STRIDE_LADDER` that fits `POINT_BUDGET`, count the dots *before* allocating, then fill positions with a fixed-seed jitter so the same frame always draws the same picture. Why a ladder: "1 dot = 20 electrons" is a scale bar a person can hold in their head; "1 dot = 13 electrons" reads like an accident.
- `tintFilters(mask)` — colour the filter grid from the patch's own mask with `setColorAt`. The grid on screen is this frame's pattern, not an idealised RGBA diagram.
- `describe(patch, total, stride, drawn)` — the honest readout: rows, columns, electrons collected, dots drawn, electrons per dot.
- `setSpread(value)` — move each layer by index, reframe the camera, fade the photons in as the layers part. A closed stack is a solid object; a cloud of 43,000 dots inside it is a pale slab that hides the very thing the section is for.
- `frameCamera()` — pull back as the stack grows taller, and aim at its new centre. Without this the photon layer leaves the top of the frame the moment the layers separate.
- `resize()`, `ResizeObserver`, `IntersectionObserver` — match the drawing buffer to the CSS box, and stop drawing when the section is off screen.

### src/view/scroll.js

- `createScroll({ stage, onProgress })` → `{ destroy, reduced }` — Lenis owns the frame, `lenis.on('scroll', ScrollTrigger.update)` keeps GSAP's idea of the scroll position honest, and one `ScrollTrigger` maps the stage's travel through the viewport to 0..1.
- reduced motion — `onProgress(1)` and no listeners at all. The stack sits open, which is the state that carries the information; the motion is the delivery, not the content.

### src/worker/engine.worker.js (added)

- `slicePatch(frame, x, y, size)` → `{ x, y, size, electrons, mask }` — cut a square window out of the frame on screen, keeping **only the electrons the pixel's own filter passed**: `frame.exposure.electrons[(py * width + px) * 3 + channelForPixel(px, py)]`. Why that index: a red pixel collected the red third of the light and nothing else, so a dot in the red column is a photon that was really counted as red.
- `handlePatch({ id, x, y, size })` — same shape as the other two handlers; transfers the two buffers so nothing is copied.

### src/view/client.js (added)

- `requestPatch(x, y, size)` — coalesced exactly like frames: one in flight, newest wins. A visitor dragging the light slider produces a patch request per frame, and the patch is the same size every time, so there is nothing to queue.

### src/main.js (added)

- `pickPainter()` — try WebGL, fall back to 2D canvas, and record the choice on `#viewer-canvas[data-painter]`. `?painter=canvas` forces the fallback, because a fallback nobody ever runs is a fallback that does not work (which is exactly how the z-order bug survived Phase 2).
- the stack is built inside its own `try`/`catch` — a second WebGL context can fail on a machine where the first succeeded, and a failed side-view must not take the explanation down with it.

### scripts/shot.mjs (dev only, not shipped)

- `--media=reduce` — `Emulation.setEmulatedMedia` for `prefers-reduced-motion`. The only honest way to test the reduced-motion path is to tell the browser to report the query as true.

### What the browser actually showed

- closed stack: coloured RGGB grid, pale lens domes over it, photodiode slab and readout combs beneath, no photons (they fade in as the layers part).
- open stack (spread 0.54 after scrolling to the section): `rows 96–119 · cols 180–203 · 859,703 electrons collected in this patch · 43,008 dots, 1 dot = 20 electrons`.
- divider drag: 50% → 74%, mosaic on the left, photograph on the right.
- click at (480, 620): `This pixel only measured blue: 1730. Red (1059) and green (1327) were guessed. row 57 · col 129 · Hamilton-Adams`.
- loupe on hover: seven columns of DN values, caption `row 84 · col 238 — this pixel only measured red: 1377. The other two colours were never here.`
- reduced motion: `spread 1.00` on load, no scroll listeners.
- 390×844: `scrollWidth 390 === clientWidth 390`, controls stacked, legend in two columns.

A capture-harness note worth keeping: `--full` (captureBeyondViewport) resizes the viewport, which re-fires ScrollTrigger, so a full-page screenshot is **not** a valid picture of a scroll-driven state at rest. The first "closed stack" capture was a pale slab for exactly that reason; the real closed state, captured in a viewport, is the coloured grid above.

### Known at the end of Phase 3

- The photon cloud is legible but not yet beautiful: at 43,000 dots it reads as coloured dust rather than countable points. Phase 4 should try one dot per electron at a lower `POINT_BUDGET` and let the size do the work, with the density difference between a shadow and the sun carried by the *count*, not the alpha.
- The stack's camera framing is tuned by eye at two viewport sizes. It has not been checked at 1024×768 or on a phone held in landscape.
- The bundle is 690 kB because three.js, GSAP and Lenis are all imported eagerly. Phase 5 should load the stack's renderer on demand — the hook does not need three.js to be interactive.
- `window.__stack` exists in dev builds only, guarded by `import.meta.env.DEV`; it is how the layer probes work, and it must not survive into the deployed bundle (Vite strips it).



---

## Phase 4: the design system, the motion, and the five sections

Phase 4 was not "make it pretty". It was: give the page a point of view, then make
every section of the argument land in the order the brief asked for — hook,
photons, one colour per pixel, the guess, the lab — and put a number on screen
wherever a number was being computed.

### src/engine/pipeline.js (changed)

- `captureFrame(settings)` -> `{ scene, filtered, exposure, mosaic, mask, coverage, referenceSrgb, timings }` — everything up to and including the sensor, split out of `runPipeline` so that two callers can share one capture. Why it exists: scoring four demosaic methods against four separate captures would compare four different noise draws, and the ranking would be measuring the PRNG.
- `runPipeline(overrides)` -> the same object as before — now `captureFrame` + demosaic + develop + metrics. Timings gained a `reference` key so the reference's cost is not hidden inside `metrics`.
- `compareMethods(overrides)` -> `{ id, label, psnr, chromaError }[]` — one capture, four reconstructions, four scores. It reuses the frame's own comparison rule (no white balance on either side) so the table and the readout above it can never disagree.

### src/view/bayerDiagram.js (new)

- `createBayerDiagram({ canvas, caption, counts })` -> `{ update(coverage) }` — draws the 2x2 pattern repeated 3x3 times with `R`/`G`/`B` in each tile, and prints the counted percentages. Why draw it at all: the whole argument is "two of the four sites are green", and a sentence cannot show that the pattern repeats in both directions.

### src/view/guessPanel.js (new)

- `createErrorHeatmap({ canvas, caption })` -> `{ update(frame) }` — paints `errorMap` through a 256-step lookup table, dark where the reconstruction is right and amber where it is wrong, with the scale printed underneath. Two decisions worth defending: the scale is the frame's own maximum (so a quiet frame and a broken frame do not look alike), and the ratio is square-rooted before it picks a colour (a linear ramp puts almost every pixel in the first few levels and shows nothing but black).
- `createMethodTable({ tbody, note })` -> `{ update(rows, activeId) }` — one row per method, the bar ranked between worst and best *on this frame*, the active method in amber. Why ranked rather than absolute: 40 dB and 41 dB are a whisker apart on a 0–50 scale, so an absolute bar would show four identical bars and say "they are all the same", which is the opposite of what the section teaches.

### src/view/motion.js (new)

- `createMotion()` -> `{ reduced, reveal(elements), settle(element) }` — the only motion on the page. `reveal` splits a heading into lines and lifts them out of a mask once, on enter; `settle` pulses a number that has just changed. Under `prefers-reduced-motion` both are no-ops and the page is simply static.
- Why the reveal has two triggers: a `ScrollTrigger` fires on scroll, but a jump (hash link, restored position, a fast flick) can cross it without it ever being evaluated, and a masked heading that never animates is invisible. An `IntersectionObserver` plays the same tween as a backstop, guarded so a line can only arrive once. This was not theoretical — the first §05 capture after an instant jump showed slivers of half-masked glyphs.

### src/view/controls.js (changed)

- schema entries gained `group: 'capture' | 'reconstruct' | 'lab'`, and `createControls({ root, settings, onChange, group })` mounts only its own group. Same definitions, three places on the page — one source of truth for the physical ranges.

### src/view/readouts.js (changed)

- every definition gained an `id`, `createReadouts({ root, only })` filters by it, and each wrapper carries `data-readout`. The page mounts the same component twice: three numbers beside the light controls, all seven in the lab. `FILTER SPLIT` spans two columns because `25 · 50 · 25%` broke after the first number.

### src/worker/engine.worker.js (changed)

- `handleCompare({ id, settings })` -> posts `{ type: 'compare', id, rows }`. Separate message because it costs one capture plus four reconstructions — far too much for a slider move, cheap enough once the controls settle.
- the frame payload now carries `errorMap` and `errorMax` and transfers the map's buffer. The heatmap needs the per-pixel field, not just the summary.

### src/view/client.js (changed)

- `requestCompare(settings)` — coalesced like frames and patches: one in flight, newest wins. The UI calls it behind a 320 ms debounce.

### src/main.js (changed)

- `scheduleCompare()` — 320 ms after the last control change, ask for the four-way comparison. Long enough that dragging a slider does not queue four of them, short enough that letting go feels answered.
- `onPick` gained a touch path: when `(hover: hover)` is false there is no cursor, so the loupe is shown on tap and hidden after 2.6 s. Without it the loupe is a desktop-only feature that silently does not exist on a phone.
- the page is one `settings` object; all three control mounts write into it, `syncControls()` pushes it back out to all three, and `requestFrame` always sends the whole object rather than a patch.

### index.html (rewritten)

Five numbered sections, each a 12-column grid: a margin column for the figure number and a registration tick, and a body column. `§01` hook, `§02` photons (stack + capture controls + ISO aside), `§03` one colour per pixel (Bayer diagram + counts), `§04` the guess (scene/method, error map, method table), `§05` the lab (everything, plus the per-pixel explanation). The figure numbers and ticks are the only ornament on the page, and they are borrowed from print, not from a UI kit.

### src/style.css (grown to 1098 lines)

- Tokens unchanged from Phase 2 (they are the art direction). Added the sheet: `.section` 12-col grid, `.display` Instrument Serif at `clamp(2.75rem, 7.5vw, 5.75rem)`, `.fig`, `.tick` drawn with two borders, `.aside` with a hairline, `.method-*`, `.pattern-*`, `.guess-*`, `.colophon`.
- One gradient in the whole page: `.guess-swatch`, the legend for the error ramp. It is a picture of the data, not decoration.
- `radius: 0` everywhere. Nothing on this page is a card.

### DESIGN_NOTES.md (new)

Records all eleven overrides of the TypeUI `editorial` system with reasons, the fact that `typeui.sh pull -f design` never wrote the skill file the brief expected (there is no `.agents/skills/design-system/`), and the measured WCAG contrast for every pair — including the honest finding that `#D6452F` is 4.43:1 on the ground and `#3566C9` is 3.63:1, which is why those two colours are used as swatches, tiles and bars and never as text.

### What the browser actually showed

- five sections render, `#method-table` fills with four rows after the debounce (my first probe read it at 0 rows because it ran before the 320 ms timer — the table was never broken, the test was early).
- default frame: 41.5 dB, colour error 1.30 DN, 0.0 % clipped, mid-grey SNR 28.0 dB, mean 1112 e-, split 25 · 50 · 25, 167–226 ms.
- zone plate: nearest 18.42 dB, bilinear 21.94, Hamilton–Adams 29.78, Malvar–He–Cutler 27.82; colour error 28.98 / 15.02 / 4.49 / 7.07. The spread is the lesson: on fine detail the choice of algorithm is worth 11 dB.
- error map on the photograph: `0 to 13 levels · mean 1.65 · square-root ramp`, dark with a bright line along the horizon — which is exactly where interpolation has to cross an edge.
- click at (480, 620): `This pixel only measured blue: 1163. Red (311) and green (599) were guessed.` with the channel swatches, values in DN, and `dH 122 · dV 67 -> vertical` for the green guess.
- 390x844: `scrollWidth 390 === clientWidth 390`, nothing overflows, headings and sections stack.
- reduced motion: headings are never split (no inline transforms at all) and every number is simply present.
- 61 tests pass; `npm run build` still warns about the 700 kB chunk, which is Phase 5's problem.

### A note on the stylesheet, because it cost an hour

Editing `src/style.css` with `(Get-Content -Raw) ... | Set-Content` in PowerShell read the UTF-8 file as Windows-1252 and wrote it back as UTF-8: every em dash became `â€”`, and the page lost its entire stylesheet in the browser. `Add-Content` (append, never read-modify-write) is safe; a round trip through `Get-Content -Raw` is not. The repair is a CP1252 reverse map, and the lesson is to edit CSS with the file tools rather than with a shell pipeline.

### Known at the end of Phase 4

- The stack still reads as a pile rather than four clean plates at mid-separation. The layers, the counts and the readout are honest; the composition is not yet as legible as §03 or §04.
- The error map is only interesting on fine detail (zone plate, stripes, text). On the default photograph it is mostly shot noise, which the copy now says out loud instead of pretending otherwise.
- The touch loupe path is verified by inspection (the media query branch), not on a real phone.
- `#D6452F` at 4.43:1 and `#3566C9` at 3.63:1 are below AA for normal text. The brief fixes those colours, so the response was to stop using them for words.
- Bundle is 700 kB, unchanged in kind: three.js, GSAP and Lenis are still loaded eagerly.

## Phase 5: the last second, and the door

Phase 5 was performance, accessibility and publishing, in that order, because a site
nobody can load is not a site and a site nobody can operate is not an explainer.

### Engine

- `cachedScene(sceneName, width, height, seed)` -> `Float32Array`: rebuilds the scene
  only when its key changes. Dragging the light slider used to redraw a photograph
  that had not changed, ~22 ms of a 130 ms frame for identical bytes.
- `cachedFilter(scene, sceneName, width, height, seed, sigma)` -> `Float32Array`:
  same trick for the optical low-pass, and returns the scene itself when sigma <= 0
  so a zero blur does not copy a megabyte to change nothing.
- `runPipeline(overrides, options)` -> result: `options.metrics === false` skips the
  PSNR and error map entirely and returns `metrics: null`. Called on every frame while
  a control is being dragged, where the numbers would be stale by the time they were
  read anyway.

### Worker and client

- `handleFrame({ id, settings, metrics })`: forwards the metrics flag, always reports
  the exposure numbers (they are cheap), and only transfers the error map when it
  exists. A stale PSNR shown as current would be a lie, so the payload says null and
  the page prints a dash.
- `send(settings, metrics)` and `requestFrame(settings, { metrics })`: the coalescing
  queue remembers the flag, so a frame that is superseded still respects the newest
  request's wish for cheapness.
- `summarise(result)` now returns `psnr`, `chromaError`, `meanAbs` and `maxAbs` as
  null when metrics were skipped, rather than repeating the previous frame's values.

### Views

- `startWithCanvasPainter()` -> painter: the page boots on 2D canvas, which cannot
  fail, so the first image appears before any WebGL module has been fetched.
- `upgradeToWebgl(viewer)` -> Promise: awaits `./view/threePainter.js`, hands the
  painter to `viewer.setPainter()`, and on failure removes the leftover canvas and
  keeps the one that works.
- `loadStack()` -> Promise: awaits `./view/sensorStack.js`, remembers its `PATCH_SIZE`,
  applies whatever scroll progress already happened, and re-requests the patch for the
  frame on screen, because an early patch is dropped while the module is loading.
- `scheduleSettle()`: re-requests the frame WITH metrics 240 ms after the last input.
- `setPainter(painter)` and `get painterKind()` on the split view: swapping the
  renderer without rebuilding pointer handling, keyboard handling or the divider.
- `moveSelection(x, y)`: draws the amber `.pick-cursor` at a pixel and calls `onHover`
  with a synthesised pointer position, so the loupe works for a keyboard visitor.
- `startPixel()` -> `{x, y}`: a quarter across, because the divider sits at half and a
  marker under the grip looks like part of the divider.
- The viewer's keydown handler: arrows move one pixel (eight with shift), Enter or
  Space explains the pixel, Escape deselects. `:focus-visible` guards the automatic
  selection so a mouse click cannot move the selection off the pixel that was clicked.
- `readouts.update()` prints `—` and sets `data-pending` when a value is null; the
  error map keeps its last picture and marks its caption pending instead.

### Build and deploy

- `vite.config.js`: `base: process.env.BASE_PATH ?? '/'`, and a chunk-size warning
  limit of 600 kB with a comment explaining that three.js is 531 kB fetched on demand.
  Entry chunk went from 700 kB to 167 kB (gzip 63 kB); three.js, the WebGL painter and
  the sensor stack are separate files loaded only when the browser can use them.
- `.github/workflows/deploy.yml`: test, then build with a base path worked out from the
  repository name, then publish. The tests run before the build, so a wrong kernel
  cannot reach a public URL.

### Verified

- Production build served at `/the-mosaic/` on a 390x844 viewport: painter upgrades to
  webgl, method table fills, `window.__stack` is `undefined`, no horizontal overflow.
- With WebGL removed before the page loads: `painter: canvas`, the stack section says
  `this view needs WebGL (THREE.WebGLRenderer: Error creating WebGL context.)`, and the
  rest of the page still computes 41.5 dB.
- Dragging the light slider: 41.5 dB -> `—` with `data-pending="true"` -> 40.7 dB.
- Keyboard only: focus, three ArrowRight, Enter -> loupe visible, panel reads
  `This pixel only measured green: 1667. Red (1347) and blue (1780) were guessed.`

### Known at the end of Phase 5

- The deploy needs a repository. `gh` is authenticated on this machine, but publishing
  under someone's account is their decision, so the workflow is committed and the last
  step is one command.
- "Loads on a phone" was verified with a 390x844 emulated viewport in Chromium, not on
  a physical handset.
- The stack still reads as a pile at mid-separation; that is a composition problem, not
  a data one, and it is the first thing I would redraw.

---

## Phase 6: explaining the guess instead of showing it

The complaint was correct and checkable: the page showed what the algorithms produced and
never said how any of them worked. A search for every word that would name a procedure --
interpolat, average, neighbour, borrow, luminance, difference -- matched exactly one line
in `index.html`, and it was the footer. Section 04 stated a score and a kernel and called
it an explanation.

Three things were missing: the **procedure** (that demosaicing is two passes), the
**alternatives** (two candidate values, not one asserted choice), and a **counterfactual**
(what the wrong choice would have looked like). The panel below supplies the first two by
asking the reader to make the guess before the algorithm does.

### `src/engine/guess.js`

- `guessSite({mosaic, mask, width, height, reference, x, y})` -> for a green site, the
  measured value and nothing to guess; for a red or blue site, the four green neighbours,
  both pairwise means, both gradients, Hamilton-Adams' own answer, bilinear's answer, the
  true value from the clean reference, the signed error of each, and a 5x5 window of the
  neighbourhood. Why: the panel must quote the same numbers the picture was built from, so
  it calls `greenAtColourSite` -- the demosaicer's own function -- rather than re-deriving
  the arithmetic beside it. That is the one design decision that keeps this honest.
- `nearestColourSite(mask, width, height, x, y)` -> the clicked site if it already had to
  guess, else the first red or blue neighbour. Why: a green pixel measured the very thing
  the panel is about, so clicking one should not open an empty lesson.
- `window5(...)` (private) -> 25 measured values with the filter that passed each, in
  row-major order, mirror-indexed at the frame edge. Why: the reader needs to see that the
  two greens being averaged are physically next door, not abstract numbers.

### `src/engine/pipeline.js` (changed)

- `captureFrame(settings)` now also returns `referenceLinear`, and `runPipeline` returns
  `reference: { srgb, linear }`. Why: PSNR only ever needed the 8-bit version, but "what
  should this pixel's green have been" needs the linear one, before white balance.

### `src/worker/engine.worker.js`, `src/view/client.js` (changed)

- `handleGuess({id, x, y})` -> reads the frame on screen and answers `{type: 'guess'}`.
  Why: same reason as `explain` -- a panel that recomputes from the settings could describe
  a picture the visitor is no longer looking at. `sendGuess` / `requestGuess(x, y)` are not
  queued, because one guess is a 5x5 read and costs nothing.

### `src/view/guessDemo.js` (new)

- `createGuessDemo({root, onNext})` -> builds the panel once and reuses it: the 5x5 window,
  the question, two buttons carrying the two candidate means, the reveal, and "another
  site". `choose(direction)` locks the buttons, marks the chosen button and the chosen
  neighbours, and renders the scores. Why: the reader has to commit before seeing the
  answer, or they read it as a fact rather than a choice.
- `verdictLine(guess, yours)` -> names whoever landed closest to the truth and by how many
  DN, calling a sub-1 DN difference a tie. Why: it is the only line in the panel that could
  flatter a method, so it is computed from the numbers rather than written.
- `withAlpha(hex, alpha)` -> `rgba()` for the filter tint. Why: the tint is data, so it uses
  the same three colours as every other readout, at an alpha that keeps 4.5:1 against the
  numbers on top.

### `src/view/guessPanel.js` (changed)

- `createMethodTable` grew a fourth column, `ASSUMES[row.id]` -> one sentence naming the
  assumption each method rests on ("the image is smooth in every direction"). Why: the
  score says who won here; the assumption says why the loser can still look wrong.

### `src/main.js` (changed)

- `requestGuessAt(x, y)` -> snaps a click to a site that had to guess and asks the worker.
- `nextGuessSite()` -> steps 16 px along the row, wrapping at the edge. Why 16: an even step
  keeps the same filter colour, so the reader compares like with like.
- `onExplain` now also writes the sentence under the viewer. Why: the full arithmetic is
  thousands of pixels below in fig. 05, and a first-time visitor who clicks once in fig. 01
  would otherwise get a magnifier and no answer.

### `index.html` (changed)

Section 04 now opens with what the reader has to decide, then the panel, then the two-pass
procedure in words -- green first, then colour carried on the red-minus-green and
blue-minus-green differences -- then the method picker, error map and table. The table's
new "assumes" column is paired with a paragraph naming what each method gets wrong.

### Verified

- `npm test` -> 69 passed (6 files), including the test that the panel's Hamilton-Adams
  number equals `demosaicWith('hamiltonAdams').detail.green` and its bilinear number equals
  `demosaicWith('bilinear').rgb[(i*3)+GREEN]`. If those two ever disagree, the panel is
  lying about the picture.
- In the browser: `Row 91, column 193 passed blue and measured 2,170. It never saw green.`
  Choosing the column gives `you 1,854 (+26) · bilinear 1,814 (-14) · Hamilton-Adams 1,757
  (-71) · the sensor would have measured 1,828`, with the verdict naming bilinear and
  explaining that Hamilton-Adams took the row because 126 < 170 and then bent that mean by
  the curvature of red.
- Clicking a pixel in fig. 01 now prints the answer under the image: `This pixel only
  measured blue: 2390. Red (1652) and green (1914) were guessed. Full arithmetic in fig. 05.`
- `npm run build` -> 173 kB entry (65 kB gzip), three.js still lazy.

### Known at the end of Phase 6

- The two-pass paragraph is prose, not a picture. A six-frame stepper of one 24x24 patch
  would teach it faster and is the next thing I would build.
- The curvature step is stated ("bends that mean by the local curvature of red") and its
  effect is visible in the numbers, but the reader never sees the five red values it uses.
- There is still no switch that turns the gradient test off, so the zipper artefact the copy
  names cannot be produced on demand.

