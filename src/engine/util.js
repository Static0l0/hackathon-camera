/**
 * Shared numeric helpers for the engine.
 *
 * Conventions used everywhere in src/engine:
 *  - Photometric data is LINEAR light (no gamma) in a Float32Array with three
 *    interleaved channels per pixel: [r, g, b, r, g, b, ...].
 *  - Radiance and normalised signal live in 0..1.
 *  - Electrons and DN live in their own units and are never assumed to be 0..1,
 *    which is why those stages do not call clamp01.
 */

/** Clamp `v` into [lo, hi].
 * @param {number} v @param {number} lo @param {number} hi @returns {number} */
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp into the 0..1 radiance range.
 * @param {number} v @returns {number} */
export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Linear interpolation between `a` and `b`.
 * @param {number} a @param {number} b @param {number} t @returns {number} */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map an index into [0, n) by REFLECTING at the edges (the edge pixel is not
 * repeated).
 *
 * Why this exact form: a Bayer mosaic gives the same colour to pixels two apart,
 * so a mirror must preserve index parity or it would read a neighbouring colour
 * as if it were the missing one. Reflection about the edge (i -> -i) and about
 * the far edge (i -> 2n-2-i) both preserve parity, so mirrored taps stay the
 * same colour. This is what keeps the "flat grey stays flat" property true even
 * in the border pixels.
 *
 * @param {number} i @param {number} n @returns {number} */
export function mirrorIndex(i, n) {
  if (n <= 1) return 0;
  const period = 2 * n - 2;
  let m = i % period;
  if (m < 0) m += period;
  return m >= n ? period - m : m;
}

/** Allocate a black interleaved-RGB image.
 * @param {number} width @param {number} height @returns {Float32Array} */
export function createRgb(width, height) {
  return new Float32Array(width * height * 3);
}

/** Index of the first (red) channel of pixel (x, y).
 * @param {number} x @param {number} y @param {number} width @returns {number} */
export function pixelIndex(x, y, width) {
  return (y * width + x) * 3;
}

/** Copy an interleaved-RGB buffer.
 * @param {Float32Array} src @returns {Float32Array} */
export function copyRgb(src) {
  return Float32Array.from(src);
}
