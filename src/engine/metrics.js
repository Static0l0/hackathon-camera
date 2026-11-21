/**
 * Metrics: how wrong is the reconstruction, and where?
 *
 * Everything here compares two images that live in the SAME space, so the caller
 * decides what is being judged. The pipeline compares the reconstruction against
 * an ideal exposure of the same scene -- see pipeline.js for why that is the
 * honest reference.
 *
 * PSNR is computed the conventional way: mean squared error over 8-bit sRGB
 * values, then 10*log10(255^2 / MSE). It is a blunt instrument. It compresses a
 * whole image into one number and is dominated by whatever has the largest error,
 * which is why the error map next to it matters more.
 */

import { pixelIndex } from './util.js';

/**
 * Mean squared error over the interior of the image, in 8-bit units.
 * The border is dropped because every demosaicer has to invent values there and
 * those invented values say more about the padding rule than about the method.
 *
 * @param {Float32Array} reference 0..1 encoded RGB
 * @param {Float32Array} test 0..1 encoded RGB
 * @param {number} width @param {number} height
 * @param {number} border pixels to ignore on each side
 * @returns {{mse: number, count: number}} */
function interiorMse(reference, test, width, height, border) {
  const lo = Math.max(0, Math.floor(border));
  let mse = 0;
  let count = 0;
  for (let y = lo; y < height - lo; y++) {
    for (let x = lo; x < width - lo; x++) {
      const i = pixelIndex(x, y, width);
      for (let c = 0; c < 3; c++) {
        const d = (test[i + c] - reference[i + c]) * 255;
        mse += d * d;
        count += 1;
      }
    }
  }
  return { mse: count > 0 ? mse / count : 0, count };
}

/**
 * Peak signal-to-noise ratio in decibels.
 * Higher is better; +6 dB means half the error energy.
 * @param {Float32Array} reference @param {Float32Array} test
 * @param {number} width @param {number} height
 * @param {number} [border] @returns {number} dB */
export function psnr(reference, test, width, height, border = 4) {
  const { mse } = interiorMse(reference, test, width, height, border);
  if (mse <= 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

/**
 * Per-pixel error, as the RMS of the three channel differences in 8-bit units.
 *
 * Returned raw (not normalised) so the UI can choose its own scale; `max` is
 * included because a heatmap needs a top end and auto-scaling to one blown pixel
 * would hide everything else.
 *
 * @param {Float32Array} reference @param {Float32Array} test
 * @param {number} width @param {number} height
 * @returns {{map: Float32Array, max: number}} */
export function errorMap(reference, test, width, height) {
  const map = new Float32Array(width * height);
  let max = 0;
  for (let i = 0; i < width * height; i++) {
    const s = i * 3;
    let sum = 0;
    for (let c = 0; c < 3; c++) {
      const d = (test[s + c] - reference[s + c]) * 255;
      sum += d * d;
    }
    const rms = Math.sqrt(sum / 3);
    map[i] = rms;
    if (rms > max) max = rms;
  }
  return { map, max };
}

/**
 * Error broken down in the way the artefact labels talk about it.
 *
 * - `meanAbs` and `maxAbs` are plain per-channel error, in 8-bit units.
 * - `chromaError` measures the two colour-difference planes (R-G and B-G). A
 *   demosaicer that gets brightness right but invents colour shows up here and
 *   nowhere else, which is exactly the "false colour" failure.
 *
 * @param {Float32Array} reference @param {Float32Array} test
 * @param {number} width @param {number} height @param {number} [border]
 * @returns {{psnr: number, meanAbs: number, maxAbs: number, chromaError: number}} */
export function errorStats(reference, test, width, height, border = 4) {
  const lo = Math.max(0, Math.floor(border));
  let absSum = 0;
  let absMax = 0;
  let chromaSum = 0;
  let count = 0;
  for (let y = lo; y < height - lo; y++) {
    for (let x = lo; x < width - lo; x++) {
      const i = pixelIndex(x, y, width);
      for (let c = 0; c < 3; c++) {
        const d = Math.abs((test[i + c] - reference[i + c]) * 255);
        absSum += d;
        if (d > absMax) absMax = d;
      }
      const rgRef = (reference[i] - reference[i + 1]) * 255;
      const bgRef = (reference[i + 2] - reference[i + 1]) * 255;
      const rgTest = (test[i] - test[i + 1]) * 255;
      const bgTest = (test[i + 2] - test[i + 1]) * 255;
      chromaSum += (Math.abs(rgTest - rgRef) + Math.abs(bgTest - bgRef)) / 2;
      count += 1;
    }
  }
  return {
    psnr: psnr(reference, test, width, height, border),
    meanAbs: count > 0 ? absSum / (count * 3) : 0,
    maxAbs: absMax,
    chromaError: count > 0 ? chromaSum / count : 0,
  };
}

/**
 * The three artefacts worth naming, with a plain-language explanation each.
 *
 * These strings are explanation, not measurement.
 *
 * These strings are explanation, not measurement: the numbers in `errorStats`
 * say how bad it is, this says what you are looking at. Kept here so the copy
 * lives next to the metric that motivates it.
 * @type {Array<{id: string, label: string, explanation: string}>} */
export const ARTIFACT_NOTES = [
  {
    id: 'zipper',
    label: 'Zipper',
    explanation:
      'Along a hard edge the guesses alternate between two different errors, one pixel apart, so the edge looks like a zip fastener.',
  },
  {
    id: 'falseColour',
    label: 'False colour',
    explanation:
      'The three channels are reconstructed separately, so a fine pattern lands at slightly different places in each. The eye reads that offset as a colour that was never in the scene.',
  },
  {
    id: 'moire',
    label: 'Moire',
    explanation:
      'Detail finer than the colour grid cannot be represented, so it aliases into a coarse, slowly drifting pattern that is not in the scene at all.',
  },
];
