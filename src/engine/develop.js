/**
 * Develop: the steps between "the demosaicer has filled in every pixel" and
 * "this is what you can look at".
 *
 * Two things happen here, and the order matters:
 *
 *  1. White balance. The sensor's three channels do not have equal sensitivity,
 *     and the scene's light has a colour. Cameras multiply each channel by a gain
 *     so that something known to be neutral comes out neutral. This must happen
 *     while the data is still linear, because the gains model a physical
 *     sensitivity ratio.
 *
 *  2. The sRGB transfer curve. Encoding is deliberately non-linear so that the
 *     8-bit values we store match how the eye allocates precision.
 *
 * The important rule, and the one the UI states out loud: demosaic BEFORE gamma.
 * Demosaicing is an interpolation, interpolation is a weighted average, and
 * averaging happens in the space the light lives in. Gamma-encoding first would
 * average perceptually spaced numbers and produce the wrong colour -- a mistake
 * real pipelines had to stop making.
 */

import { clamp01 } from './util.js';
import { linearToSrgb } from './scene.js';
import { BLUE, GREEN, RED } from './cfa.js';

/** Neutral gains: no correction. @type {number[]} */
export const UNIT_GAINS = [1, 1, 1];

/**
 * Estimate white-balance gains from the raw mosaic by the grey-world assumption.
 *
 * Grey-world says: averaged over a whole scene, the world is grey, so any
 * difference between the channel averages is the sensor plus the light. The green
 * channel is the reference because it has twice the samples and the eye is most
 * sensitive to it.
 *
 * This is deliberately naive -- it fails on a scene that really is mostly one
 * colour, famously a field of grass or a red wall -- and the UI says so instead of
 * pretending the estimate is truth.
 *
 * @param {Float32Array} mosaic one sample per pixel
 * @param {Uint8Array} mask which channel each pixel measured
 * @param {number} width @param {number} height
 * @returns {{gains: number[], means: number[]}} per-channel gains, green = 1 */
export function estimateWhiteBalance(mosaic, mask, width, height) {
  const sums = [0, 0, 0];
  const counts = [0, 0, 0];
  for (let i = 0; i < width * height; i++) {
    const channel = mask[i];
    sums[channel] += mosaic[i];
    counts[channel] += 1;
  }
  const means = [0, 1, 2].map((c) => (counts[c] > 0 ? sums[c] / counts[c] : 0));
  const reference = means[GREEN] > 0 ? means[GREEN] : 1;
  const gains = means.map((mean, c) => {
    if (c === GREEN) return 1;
    if (mean <= 0) return 1;
    // Clamped, because a nearly black channel would otherwise divide by ~0 and
    // blow the image out. Real cameras clamp here too.
    return Math.min(4, Math.max(0.25, reference / mean));
  });
  return { gains, means };
}

/**
 * Multiply each channel by its gain. Linear data in, linear data out.
 * @param {Float32Array} rgb @param {number} width @param {number} height
 * @param {number[]} gains [red, green, blue]
 * @returns {Float32Array} new buffer */
export function applyWhiteBalance(rgb, width, height, gains) {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < width * height; i++) {
    const d = i * 3;
    out[d] = rgb[d] * gains[RED];
    out[d + 1] = rgb[d + 1] * gains[GREEN];
    out[d + 2] = rgb[d + 2] * gains[BLUE];
  }
  return out;
}

/**
 * Encode linear RGB with the sRGB curve, clamping to the displayable range.
 * @param {Float32Array} rgb @param {number} width @param {number} height
 * @returns {Float32Array} 0..1 encoded values */
export function toSrgb(rgb, width, height) {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    out[i] = linearToSrgb(clamp01(rgb[i]));
  }
  return out;
}

/**
 * Pack encoded RGB into bytes for a canvas or a texture.
 * @param {Float32Array} srgb 0..1 encoded values
 * @param {number} width @param {number} height
 * @returns {Uint8ClampedArray} RGBA, alpha 255 */
export function toRgbaBytes(srgb, width, height) {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * 3;
    const d = i * 4;
    bytes[d] = Math.round(srgb[s] * 255);
    bytes[d + 1] = Math.round(srgb[s + 1] * 255);
    bytes[d + 2] = Math.round(srgb[s + 2] * 255);
    bytes[d + 3] = 255;
  }
  return bytes;
}

/**
 * White balance, then gamma. The demosaicer must already have run.
 * @param {Float32Array} rgb linear interleaved RGB
 * @param {number} width @param {number} height
 * @param {number[]} gains [red, green, blue]
 * @returns {{srgb: Float32Array, balanced: Float32Array}} */
export function develop(rgb, width, height, gains) {
  const balanced = applyWhiteBalance(rgb, width, height, gains);
  return { srgb: toSrgb(balanced, width, height), balanced };
}
