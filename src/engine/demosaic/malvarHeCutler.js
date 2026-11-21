/**
 * Malvar-He-Cutler demosaic: one fixed 5x5 filter per missing channel.
 *
 * Reference: R. Malvar, L.-W. He, R. Cutler, "High-quality linear interpolation
 * for demosaicing of Bayer-patterned color images", ICASSP 2004.
 * Coefficients cross-checked against P. Getreuer, "Malvar-He-Cutler Linear Image
 * Demosaicing", Image Processing On Line 1 (2011), pp. 83-89,
 * doi:10.5201/ipol.2011.g_mhcd
 * (http://ipol.im/pub/art/2011/g_mhcd/revisions/2011-08-14/g_mhcd.htm)
 * and the reference Python implementation in colour-demosaicing
 * (colour_demosaicing/bayer/demosaicing/malvar2004.py).
 *
 * The insight in one sentence: bilinear interpolation is a weighted sum, so we
 * can simply solve for better weights. Malvar, He and Cutler start from bilinear
 * and add a correction proportional to the Laplacian of the channel being used to
 * fill the gap -- sharpening the guess, and doing it with filters that are small
 * enough to run in a camera.
 *
 * The kernels are given in the paper scaled by 8 so every entry is an integer (or
 * a half-integer); they are divided by 8 on use. All three sum to 8, which is the
 * check that they preserve a flat field.
 *
 * The three kernels, rows top to bottom, columns left to right:
 *
 *   GR_GB      green at red or blue sites
 *     0  0 -1  0  0
 *     0  0  2  0  0
 *    -1  2  4  2 -1
 *     0  0  2  0  0
 *     0  0 -1  0  0
 *
 *   Rg_RB_Bg_BR   red at green in a red row, or blue at green in a blue row
 *     0  0  .5 0  0
 *     0 -1  0 -1  0
 *    -1  4  5  4 -1
 *     0 -1  0 -1  0
 *     0  0  .5 0  0
 *   (its transpose serves red at green in a blue row, blue at green in a red row)
 *
 *   Rb_BB_Br_RR   red at blue sites, blue at red sites
 *     0  0 -1.5 0  0
 *     0  2  0  2  0
 *  -1.5 0  6  0 -1.5
 *     0  2  0  2  0
 *     0  0 -1.5 0  0
 */

import { GREEN } from '../cfa.js';
import { mirrorIndex } from '../util.js';

/** Green at red or blue sites, scaled by 8. Sums to 8. */
export const GR_GB = [
  0, 0, -1, 0, 0,
  0, 0, 2, 0, 0,
  -1, 2, 4, 2, -1,
  0, 0, 2, 0, 0,
  0, 0, -1, 0, 0,
];

/** Red at green in a red row (and blue at green in a blue row), scaled by 8. Sums to 8. */
export const RG_RB_BG_BR = [
  0, 0, 0.5, 0, 0,
  0, -1, 0, -1, 0,
  -1, 4, 5, 4, -1,
  0, -1, 0, -1, 0,
  0, 0, 0.5, 0, 0,
];

/** Red at blue sites (and blue at red sites), scaled by 8. Sums to 8. */
export const RB_BB_BR_RR = [
  0, 0, -1.5, 0, 0,
  0, 2, 0, 2, 0,
  -1.5, 0, 6, 0, -1.5,
  0, 2, 0, 2, 0,
  0, 0, -1.5, 0, 0,
];

/**
 * Transpose a 5x5 kernel.
 * Needed because the same Rg filter serves both green positions, once rotated 90
 * degrees: which axis the missing colour lies along depends on the row colour.
 * @param {number[]} k @returns {number[]} */
export function transpose5(k) {
  const out = new Array(25);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      out[y * 5 + x] = k[x * 5 + y];
    }
  }
  return out;
}

/** RG_RB_BG_BR rotated 90 degrees: red at green in a blue row, blue at green in a red row. */
export const RG_TRANSPOSED = transpose5(RG_RB_BG_BR);

/**
 * Apply a 5x5 filter at one pixel.
 *
 * The mirror padding is not cosmetic: it keeps the border from darkening, and
 * because reflection preserves index parity it samples the right colour even at
 * the very edge of the frame.
 *
 * @param {Float32Array} mosaic @param {number} width @param {number} height
 * @param {number} x @param {number} y @param {number[]} kernel scaled by 8
 * @returns {number} filtered value (already divided by 8) */
function filter5(mosaic, width, height, x, y, kernel) {
  let sum = 0;
  for (let dy = -2; dy <= 2; dy++) {
    const sy = mirrorIndex(y + dy, height);
    for (let dx = -2; dx <= 2; dx++) {
      const k = kernel[(dy + 2) * 5 + (dx + 2)];
      if (k === 0) continue;
      const sx = mirrorIndex(x + dx, width);
      sum += k * mosaic[sy * width + sx];
    }
  }
  return sum / 8;
}

/**
 * Reshape one of the flat 25-entry constants into 5 rows of 5.
 *
 * The constants are flat because the convolution reads them with a single index;
 * anything that draws a grid should not have to know that.
 *
 * @param {number[]} flat @returns {number[][]}
 */
function toGrid(flat) {
  const grid = [];
  for (let row = 0; row < 5; row += 1) {
    grid.push(flat.slice(row * 5, row * 5 + 5));
  }
  return grid;
}

/**
 * Reconstruct colour with the three fixed filters.
 *
 * Every pixel is filtered three times (green, red, blue); at a site that measured
 * the channel directly, the measured value is kept instead. That keeps the
 * "measured stays measured" property, so a flat field and a linear ramp both
 * survive exactly.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height
 * @returns {Float32Array} interleaved linear RGB */
export function demosaicMalvarHeCutler(mosaic, mask, width, height) {
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const own = mask[i];

      // Green: measured at a green site, filtered everywhere else.
      const g = own === GREEN ? mosaic[i] : filter5(mosaic, width, height, x, y, GR_GB);
      rgb[i * 3 + 1] = g;

      const greenInRedRow = own === GREEN && (y & 1) === 0;
      const greenInBlueRow = own === GREEN && (y & 1) === 1;

      if (own === 0) {
        rgb[i * 3] = mosaic[i];
        rgb[i * 3 + 2] = filter5(mosaic, width, height, x, y, RB_BB_BR_RR);
      } else if (own === 2) {
        rgb[i * 3] = filter5(mosaic, width, height, x, y, RB_BB_BR_RR);
        rgb[i * 3 + 2] = mosaic[i];
      } else if (greenInRedRow) {
        rgb[i * 3] = filter5(mosaic, width, height, x, y, RG_RB_BG_BR);
        rgb[i * 3 + 2] = filter5(mosaic, width, height, x, y, RG_TRANSPOSED);
      } else if (greenInBlueRow) {
        rgb[i * 3] = filter5(mosaic, width, height, x, y, RG_TRANSPOSED);
        rgb[i * 3 + 2] = filter5(mosaic, width, height, x, y, RG_RB_BG_BR);
      }
    }
  }
  return rgb;
}

/**
 * One pixel explained: which kernel ran, on which 5x5 window, with what weights.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height @param {number} x @param {number} y
 * @returns {{method: string, channels: Array<object>}} */
export function explainMalvarHeCutlerPixel(mosaic, mask, width, height, x, y) {
  const i = y * width + x;
  const own = mask[i];

  // The window itself, so the UI can draw the numbers the filter actually read.
  const window = [];
  for (let dy = -2; dy <= 2; dy++) {
    const row = [];
    for (let dx = -2; dx <= 2; dx++) {
      const sy = mirrorIndex(y + dy, height);
      const sx = mirrorIndex(x + dx, width);
      row.push(mosaic[sy * width + sx]);
    }
    window.push(row);
  }

  const describe = (channel, kernel, name, measured) => {
    if (measured) {
      // A measured channel is kept as it is, so no filter ran for it. Saying so
      // explicitly is the point: two thirds of this image was filtered, one third
      // was measured, and the panel should not blur that distinction.
      return {
        channel,
        measured: true,
        value: mosaic[i],
        formula: 'measured here, no filter',
        kernel: null,
        kernelGrid: null,
        taps: [],
        window,
      };
    }
    const taps = [];
    let sum = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const k = kernel[(dy + 2) * 5 + (dx + 2)];
        if (k === 0) continue;
        const value = window[dy + 2][dx + 2];
        sum += k * value;
        taps.push({ dx, dy, weight: k / 8, value });
      }
    }
    return {
      channel,
      measured,
      value: measured ? mosaic[i] : sum / 8,
      formula: measured ? 'measured here' : `${name} filter, weighted sum / 8`,
      kernel: name,
      // The constants above are flat 25-entry arrays because that is how the
      // convolution loop reads them; the panel draws a 5x5, so reshape here
      // rather than making every consumer know the storage order.
      kernelGrid: toGrid(kernel),
      taps,
      window,
    };
  };

  const greenInRedRow = own === GREEN && (y & 1) === 0;
  const greenInBlueRow = own === GREEN && (y & 1) === 1;
  const channels = [];

  channels.push(
    own === GREEN ? describe(1, null, 'none', true) : describe(1, GR_GB, 'GR_GB', false),
  );

  if (own === 0) {
    channels.push(describe(0, null, 'none', true));
    channels.push(describe(2, RB_BB_BR_RR, 'Rb_BB_Br_RR', false));
  } else if (own === 2) {
    channels.push(describe(0, RB_BB_BR_RR, 'Rb_BB_Br_RR', false));
    channels.push(describe(2, null, 'none', true));
  } else if (greenInRedRow) {
    channels.push(describe(0, RG_RB_BG_BR, 'Rg_RB_Bg_BR', false));
    channels.push(describe(2, RG_TRANSPOSED, 'Rg_RB_Bg_BR (transposed)', false));
  } else if (greenInBlueRow) {
    channels.push(describe(0, RG_TRANSPOSED, 'Rg_RB_Bg_BR (transposed)', false));
    channels.push(describe(2, RG_RB_BG_BR, 'Rg_RB_Bg_BR', false));
  }

  channels.sort((a, b) => a.channel - b.channel);
  return { method: 'malvarHeCutler', channels };
}
