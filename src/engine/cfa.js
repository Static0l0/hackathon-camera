/**
 * The colour filter array: what the sensor can physically sample.
 *
 * Two stages live here, in the order light meets them:
 *  1. An optical low-pass filter in front of the sensor (the anti-aliasing filter
 *     that real cameras used to stack on top of the chip). It is a Gaussian blur,
 *     and it is applied to the scene BEFORE sampling because it acts on light,
 *     not on pixels.
 *  2. The Bayer mosaic itself: each photosite sits under one coloured filter, so
 *     it measures one number, not three.
 */

import { mirrorIndex, pixelIndex } from './util.js';

/** Channel ids. The numbers are used as array indices elsewhere, so do not reorder. */
export const RED = 0;
export const GREEN = 1;
export const BLUE = 2;

/** Readable names for the UI. @type {string[]} */
export const CHANNEL_NAMES = ['red', 'green', 'blue'];

/**
 * Which colour filter sits on pixel (x, y), in an RGGB Bayer pattern:
 *
 *   R G R G        y even (a "red row")
 *   G B G B        y odd  (a "blue row")
 *   ...
 *
 * RGGB was chosen because it is the arrangement most cameras use: green in a
 * quincunx (half the pixels) because the eye resolves luminance best, and red
 * and blue on a coarser grid.
 *
 * @param {number} x @param {number} y @returns {0|1|2} */
export function channelForPixel(x, y) {
  if ((y & 1) === 0) return (x & 1) === 0 ? RED : GREEN;
  return (x & 1) === 0 ? GREEN : BLUE;
}

/**
 * Normalised 1D Gaussian kernel.
 *
 * The radius is 3 sigma, which holds ~99.7% of the energy; beyond that the taps
 * are below float32 precision at these image sizes.
 *
 * @param {number} sigma standard deviation in pixels @returns {{kernel: Float32Array, radius: number}} */
export function gaussianKernel(sigma) {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const kernel = new Float32Array(2 * radius + 1);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / denom);
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return { kernel, radius };
}

/**
 * Optical low-pass: separable Gaussian blur, mirror-padded at the edges.
 *
 * Separable because a 2D Gaussian is the product of two 1D Gaussians, so this is
 * O(n * radius) instead of O(n * radius^2) -- and it keeps the code short enough
 * to read. A blur of a constant is that constant, which is why a flat scene
 * survives this stage exactly.
 *
 * @param {Float32Array} rgb linear interleaved RGB
 * @param {number} width @param {number} height
 * @param {number} sigma in pixels; <= 0 returns a copy (filter switched off)
 * @returns {Float32Array} new buffer */
export function opticalLowPass(rgb, width, height, sigma) {
  if (!(sigma > 0)) return Float32Array.from(rgb);
  const { kernel, radius } = gaussianKernel(sigma);
  const horizontal = new Float32Array(rgb.length);

  // Horizontal pass.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = mirrorIndex(x + k, width);
        const s = pixelIndex(sx, y, width);
        const w = kernel[k + radius];
        r += rgb[s] * w;
        g += rgb[s + 1] * w;
        b += rgb[s + 2] * w;
      }
      const d = pixelIndex(x, y, width);
      horizontal[d] = r;
      horizontal[d + 1] = g;
      horizontal[d + 2] = b;
    }
  }

  // Vertical pass.
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = mirrorIndex(y + k, height);
        const s = pixelIndex(x, sy, width);
        const w = kernel[k + radius];
        r += horizontal[s] * w;
        g += horizontal[s + 1] * w;
        b += horizontal[s + 2] * w;
      }
      const d = pixelIndex(x, y, width);
      out[d] = r;
      out[d + 1] = g;
      out[d + 2] = b;
    }
  }
  return out;
}

/**
 * Sample the scene through the colour filter array.
 *
 * The output is one number per pixel plus a mask saying which colour survived.
 * This is the honest core of the whole story: the mosaic really has no colour
 * information for two channels at every pixel, and the mask is what the
 * demosaicer is allowed to look at.
 *
 * @param {Float32Array} rgb linear interleaved RGB
 * @param {number} width @param {number} height
 * @returns {{mosaic: Float32Array, mask: Uint8Array}} one value and one channel id per pixel */
export function bayerMosaic(rgb, width, height) {
  const mosaic = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const channel = channelForPixel(x, y);
      const i = y * width + x;
      mask[i] = channel;
      mosaic[i] = rgb[pixelIndex(x, y, width) + channel];
    }
  }
  return { mosaic, mask };
}

/**
 * Fraction of pixels of each colour. Used by the tests (a Bayer pattern must be
 * 25% red, 50% green, 25% blue) and by the UI's "why twice as much green" panel.
 *
 * @param {Uint8Array} mask @returns {{red: number, green: number, blue: number}} */
export function mosaicCoverage(mask) {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === RED) red++;
    else if (mask[i] === GREEN) green++;
    else blue++;
  }
  const n = mask.length || 1;
  return { red: red / n, green: green / n, blue: blue / n };
}
