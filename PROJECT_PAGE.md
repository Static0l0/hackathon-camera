# The Mosaic — what a camera really records

**Live:** <https://static0l0.github.io/hackathon-camera/>
**Repo:** <https://github.com/Static0l0/hackathon-camera>

## What it is

An interactive explainer that runs a camera sensor in the browser. Drag a divider between
the numbers the sensor recorded and the photograph those numbers became. Click a pixel to
see what it measured, what was invented, and the arithmetic behind both. Move the light,
shutter, ISO, aperture or scene and pick one of four real demosaicing algorithms. Nothing
is pre-rendered: every slider recomputes the whole pipeline in a Web Worker.

## How it answers "Unveiling Technology"

The theme asks for technology opened up. This takes the most familiar imaging device
people own and shows the invisible step: each site on a sensor sits under one colour
filter, so it counts one colour, and two of the three numbers in every pixel were never
measured — software guesses them. The page computes that and prints the receipt beside
it: 41.5 dB PSNR, 1.30 DN colour error, 0 % clipped, 28.0 dB signal-to-noise at mid-grey.

## How it works

```
scene (linear light) → optical low-pass → exposure (Poisson photons, full-well clip,
read noise, ISO gain, 12-bit) → Bayer mosaic → demosaic → white balance → sRGB gamma
```

`src/engine/` is pure maths — no DOM, no three.js — so it runs unchanged in Node and in
the worker. Four methods are implemented in full: **nearest neighbour** copies the
closest site that measured the colour; **bilinear** averages neighbours;
**Hamilton–Adams** picks a direction from a gradient comparison before interpolating
green; **Malvar–He–Cutler** is a linear 5×5 filter that also corrects colour differences.
View code draws the result; three.js draws the sensor stack and never touches the maths.

## What I built vs. what I used

Built for this event: the engine, worker, view modules, test suite, measurement and
screenshot scripts, and the copy. Used: three.js 0.187.0 (MIT) for the stack,
GSAP 3.15.1 (free "no charge" licence, not OSI) for reveals, Instrument Sans and JetBrains
Mono under the SIL OFL 1.1, Vite and Vitest as tooling, and TypeUI's generated `DESIGN.md`
as a token starting point — tokens only, eleven documented overrides, no TypeUI code
shipped. Commits are signed `starman-max <lineageos357@gmail.com>`, an alternate address
on the same GitHub account (Static0l0); the history also holds one contributor PR (#1).
`THIRD_PARTY.md` lists each component with its licence and how it was verified.

## How I verified it

`npm test` runs 80 Vitest tests over the engine. They assert properties that would
catch errors: every demosaicing kernel sums to 8 and matches its transpose, flat fields
reproduce exactly, bilinear is exact on a linear ramp, doubling the ISO doubles both
signal and noise while their ratio holds, and the Poisson draw's mean and variance match λ
on both paths. `scripts/report.mjs` produced the README's PSNR table across six scenes at
one fixed configuration; `scripts/contrast.mjs` re-measures every colour pair the page
uses. The deployment workflow runs these tests before publishing to Pages.

## Limitations

Bilinear beats both "smart" methods on hard text (33.49 dB against 31.26 and 29.78) — a
property of colour-difference interpolation, not a bug. PSNR depends on its reference,
which includes the optical low-pass and excludes white balance: on the zone plate, forcing
one axis *raises* the score from 29.78 to 31.63 dB while producing visible banding. The
photon cloud is sampled above a threshold and prints its exchange rate. ISO is gain only —
no noise reduction, sharpening or JPEG. No rolling shutter, no X-Trans. The explanation is
partly prose: there is no frame-by-frame stepper. R/G/B data colours fill shapes, never
text; they do not all clear WCAG AA.
