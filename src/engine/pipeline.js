/**
 * Cached scene, and cached blurred copy of it.
 *
 * The scene and the optical low-pass depend only on (scene, width, height, seed)
 * and on that plus sigma — never on the exposure. Dragging the light slider
 * therefore rebuilt a photograph that had not changed, which cost about 22 ms of
 * a 130 ms frame to produce identical bytes. Holding the last two buffers at
 * module scope makes a light-only change cheap without pretending the physics
 * changed.
 *
 * The keys are explicit strings rather than object identity: if the visitor
 * switches scene, size or seed the key misses and the cache is replaced. Two
 * buffers of 384x216x3 floats is about 2 MB, which is the price of not
 * recomputing them. Treat whatever comes out as read-only — it is shared with
 * every other caller until the key changes.
 */
let sceneCache = { key: '', value: null };
let filterCache = { key: '', value: null };

/** @returns {Float32Array} */
function cachedScene(sceneName, width, height, seed) {
  const key = `${sceneName}|${width}x${height}|${seed}`;
  if (sceneCache.key !== key) {
    sceneCache = { key, value: makeScene(sceneName, width, height) };
  }
  return sceneCache.value;
}

/** @returns {Float32Array} */
function cachedFilter(scene, sceneName, width, height, seed, sigma) {
  const key = `${sceneName}|${width}x${height}|${seed}|${sigma}`;
  // sigma <= 0 means "no filter": opticalLowPass returns a copy, which would be
  // a pointless megabyte per frame, so hand back the scene itself.
  if (sigma <= 0) return scene;
  if (filterCache.key !== key) {
    filterCache = { key, value: opticalLowPass(scene, width, height, sigma) };
  }
  return filterCache.value;
}

/**
 * The whole pipeline, in one function, in physical order.
 *
 *   scene (linear radiance)
 *     -> optical low-pass        (cfa.js)   light blurred before it is sampled
 *     -> exposure                (exposure.js) photons, noise, well, gain, ADC
 *     -> colour filter array     (cfa.js)   one channel survives per pixel
 *     -> demosaic                (demosaic/)  the guess
 *     -> white balance + gamma   (develop.js)
 *
 * Note the deviation from the brief's numbered list: exposure is listed before the
 * optical low-pass, but the filter sits in front of the sensor, so it has to act
 * on the light first. Exposure is independent per channel, so running it before or
 * after sampling gives bit-identical results; blurring BEFORE adding noise does
 * not, and that ordering is the physically correct one.
 *
 * The function is synchronous and free of DOM calls so the same code runs in the
 * worker, in Node under Vitest, and (for a single frame) on the main thread.
 */

import { makeScene, linearToSrgb } from './scene.js';
import { bayerMosaic, mosaicCoverage, opticalLowPass } from './cfa.js';
import { expose, SENSOR } from './exposure.js';
import { demosaicWith, methodInfo, METHOD_IDS } from './demosaic/index.js';
import { develop, estimateWhiteBalance, toSrgb } from './develop.js';
import { errorMap, errorStats } from './metrics.js';
import { clamp01 } from './util.js';

/** Clock that works in the browser, in a worker and in Node. */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Default settings.
 *
 * 384x216 keeps a full recompute small enough to stay interactive while still
 * being large enough to see demosaic artefacts; the cap is 512 on the long edge.
 *
 * Exposure defaults are chosen so the photo is correctly exposed at rest: a
 * white highlight lands near 3570 DN and 18% mid-grey near 640 DN, so nothing
 * clips until the visitor raises the light or the ISO. Had the defaults clipped,
 * the first thing a newcomer saw would be a white rectangle, and the noise the
 * page is about would have nowhere to show up.
 * @type {object} */
export const DEFAULT_SETTINGS = {
  sceneName: 'photo',
  width: 384,
  height: 216,
  lightLevel: 0.4,
  shutterSeconds: 1 / 60,
  fNumber: 2.8,
  iso: 100,
  seed: 1,
  olpfSigma: 0.6,
  method: 'hamiltonAdams',
  whiteBalance: true,
};

/**
 * Everything up to and including sampling, plus the ideal reference frame.
 *
 * Split out of runPipeline so `compareMethods` can demosaic one capture four
 * different ways and compare like with like: same scene, same noise draw, same
 * reference. If the comparison re-exposed per method, the methods would differ
 * by their noise too, and the numbers would answer a different question.
 *
 * @param {typeof DEFAULT_SETTINGS} settings
 * @returns {{scene: Float32Array, filtered: Float32Array, exposure: object,
 *   mosaic: Float32Array, mask: Uint8Array, coverage: object,
 *   referenceSrgb: Float32Array, timings: Record<string, number>}}
 */
export function captureFrame(settings) {
  const { width, height } = settings;
  const timings = {};
  const mark = (name, started) => {
    timings[name] = now() - started;
  };

  // 1. Scene. Already linear, already 0..1.
  let t = now();
  const scene = settings.linear
    ? Float32Array.from(settings.linear)
    : cachedScene(settings.sceneName, width, height, settings.seed);
  mark('scene', t);

  // 2. Optical low-pass: the anti-aliasing filter cameras used to have. Blurring
  //    happens on light, so it must come before sampling and before noise.
  t = now();
  const filtered = settings.linear
    ? opticalLowPass(scene, width, height, settings.olpfSigma)
    : cachedFilter(scene, settings.sceneName, width, height, settings.seed, settings.olpfSigma);
  mark('filter', t);

  // 3. Exposure. Per channel, but applied to the full RGB buffer: a photosite's
  //    noise does not depend on which filter sits above it.
  t = now();
  const exposure = expose(filtered, width, height, {
    lightLevel: settings.lightLevel,
    shutterSeconds: settings.shutterSeconds,
    fNumber: settings.fNumber,
    iso: settings.iso,
    seed: settings.seed,
  });
  mark('expose', t);

  // 4. Sampling: keep one channel per pixel.
  t = now();
  const { mosaic, mask } = bayerMosaic(exposure.dn, width, height);
  const coverage = mosaicCoverage(mask);
  mark('mosaic', t);

  // 5. The reference: what an ideal sensor would have recorded at these exact
  //    settings. It includes the optical low-pass (the demosaicer cannot undo the
  //    lens, so blaming it for that would measure the wrong thing) and excludes
  //    white balance (a global gain would flatter or punish methods for reasons
  //    that have nothing to do with interpolation).
  t = now();
  const referenceLinear = new Float32Array(width * height * 3);
  const scale = exposure.gain * exposure.isoGain;
  for (let i = 0; i < referenceLinear.length; i++) {
    referenceLinear[i] = clamp01((filtered[i] * scale) / SENSOR.adcMax);
  }
  const referenceSrgb = toSrgb(referenceLinear, width, height);
  mark('reference', t);

  return { scene, filtered, exposure, mosaic, mask, coverage, referenceSrgb, timings };
}

/**
 * Run one frame.
 *
 * @param {Partial<typeof DEFAULT_SETTINGS> & {linear?: Float32Array}} [overrides]
 *   pass `linear` to use an uploaded image (already converted with
 *   imageDataToLinear) instead of a generated scene.
 * @param {{metrics?: boolean}} [options] `metrics: false` skips the PSNR, colour
 *   error and per-pixel error map. It is for frames drawn *while a slider is being
 *   dragged*: the numbers would be replaced a few milliseconds later, and the map
 *   is a megabyte of allocation per frame. A settled frame always asks for them.
 * @returns {{
 *   settings: object, width: number, height: number,
 *   scene: Float32Array, filtered: Float32Array,
 *   exposure: object, mosaic: Float32Array, mask: Uint8Array, coverage: object,
 *   demosaic: {method: string, rgb: Float32Array, detail: object|null},
 *   display: {srgb: Float32Array, balanced: Float32Array},
 *   reference: {srgb: Float32Array},
 *   whiteBalance: {gains: number[], means: number[], applied: boolean},
 *   metrics: ({psnr: number, meanAbs: number, maxAbs: number, chromaError: number, errorMap: Float32Array, errorMax: number}|null),
 *   timings: Record<string, number>
 * }}
 */
export function runPipeline(overrides = {}, options = {}) {
  const withMetrics = options.metrics !== false;
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const { width, height } = settings;
  if (!(width > 0 && height > 0)) throw new Error('runPipeline: width and height must be positive');
  if (Math.max(width, height) > 512) throw new Error('runPipeline: working images are capped at 512px');

  const capture = captureFrame(settings);
  const { scene, filtered, exposure, mosaic, mask, coverage } = capture;
  const timings = { ...capture.timings };
  const mark = (name, started) => {
    timings[name] = now() - started;
  };
  let t;

  // The guess. Everything above happened inside the camera; this is software.
  t = now();
  const demosaic = demosaicWith(settings.method, mosaic, mask, width, height);
  // Back to 0..1 for developing. DN is linear in light, so a single division is a
  // pure rescale and changes no ratio in the reconstruction.
  const linearRecon = new Float32Array(width * height * 3);
  for (let i = 0; i < linearRecon.length; i++) {
    linearRecon[i] = demosaic.rgb[i] / SENSOR.adcMax;
  }
  mark('demosaic', t);

  // 6. White balance and gamma. Demosaic first, gamma last.
  t = now();
  const wbEstimate = estimateWhiteBalance(mosaic, mask, width, height);
  const gains = settings.whiteBalance ? wbEstimate.gains : [1, 1, 1];
  const { srgb, balanced } = develop(linearRecon, width, height, gains);
  mark('develop', t);

  // The reference came from captureFrame: same scene, same lens, same photons.
  // Scoring is the expensive tail of a frame and the least useful part of it
  // while a slider is moving, so it is optional.
  let metrics = null;
  if (withMetrics) {
    t = now();
    const reconSrgbNoWb = toSrgb(linearRecon, width, height);
    const stats = errorStats(capture.referenceSrgb, reconSrgbNoWb, width, height);
    const map = errorMap(capture.referenceSrgb, reconSrgbNoWb, width, height);
    mark('metrics', t);
    metrics = {
      psnr: stats.psnr,
      meanAbs: stats.meanAbs,
      maxAbs: stats.maxAbs,
      chromaError: stats.chromaError,
      errorMap: map.map,
      errorMax: map.max,
    };
  }

  return {
    settings,
    width,
    height,
    scene,
    filtered,
    exposure,
    mosaic,
    mask,
    coverage,
    demosaic: { method: settings.method, rgb: linearRecon, detail: demosaic.detail },
    display: { srgb, balanced },
    reference: { srgb: capture.referenceSrgb },
    whiteBalance: { ...wbEstimate, applied: settings.whiteBalance, gains },
    metrics,
    timings,
  };
}

/**
 * How well every demosaic method does on the current scene, measured the same way.
 *
 * One capture, four reconstructions: the photons, the noise draw and the
 * reference are identical across the four, so the difference between the numbers
 * is the interpolation and nothing else.
 *
 * @param {Partial<typeof DEFAULT_SETTINGS>} [overrides]
 * @returns {{id: string, label: string, psnr: number, chromaError: number}[]}
 */
export function compareMethods(overrides = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const { width, height } = settings;
  const capture = captureFrame(settings);
  const linear = new Float32Array(width * height * 3);

  return METHOD_IDS.map((id) => {
    const demosaic = demosaicWith(id, capture.mosaic, capture.mask, width, height);
    for (let i = 0; i < linear.length; i++) {
      linear[i] = demosaic.rgb[i] / SENSOR.adcMax;
    }
    // Same comparison the frame uses: no white balance on either side.
    const srgb = toSrgb(linear, width, height);
    const stats = errorStats(capture.referenceSrgb, srgb, width, height);
    return {
      id,
      label: methodInfo(id).label,
      psnr: stats.psnr,
      chromaError: stats.chromaError,
    };
  });
}

/**
 * Longest edge allowed for a working image.
 * @type {number} */
export const MAX_WORKING_SIZE = 512;
