/**
 * Bilinear demosaic: average the neighbours that did measure the colour.
 *
 * For each missing channel, take the mean of the same-colour samples in the 3x3
 * neighbourhood. Because of the Bayer geometry that is always either 2 or 4
 * samples:
 *   - at a red site, green comes from the 4 orthogonal samples and blue from the
 *     4 diagonal ones;
 *   - at a green site, the channel that shares its row comes from its two
 *     horizontal neighbours and the other from its two vertical neighbours.
 *
 * Two properties are worth knowing, and both are tested:
 *   - a flat field comes back exactly flat, because an average of equal numbers
 *     is that number;
 *   - a linear ramp comes back exactly right in the interior, because the
 *     neighbours of a point on a straight line average to the point.
 *
 * What it cannot do is keep edges sharp: averaging across an edge blurs it, and
 * averaging colour channels separately invents colour that was not there
 * (false colour). Cost: a constant number of taps per pixel. O(n).
 */

import { mirrorIndex } from '../util.js';

/**
 * Collect the same-colour taps around (x, y) inside a 3x3 window.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height
 * @param {number} x @param {number} y @param {number} channel
 * @returns {Array<{x: number, y: number, value: number}>} */
function collectTaps(mosaic, mask, width, height, x, y, channel) {
  const taps = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const sx = mirrorIndex(x + dx, width);
      const sy = mirrorIndex(y + dy, height);
      const i = sy * width + sx;
      if (mask[i] !== channel) continue;
      taps.push({ x: sx, y: sy, value: mosaic[i] });
    }
  }
  return taps;
}

/**
 * Reconstruct colour by averaging same-colour neighbours.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height
 * @returns {Float32Array} interleaved linear RGB */
export function demosaicBilinear(mosaic, mask, width, height) {
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const own = mask[i];
      for (let channel = 0; channel < 3; channel++) {
        if (channel === own) {
          rgb[i * 3 + channel] = mosaic[i];
          continue;
        }
        const taps = collectTaps(mosaic, mask, width, height, x, y, channel);
        let sum = 0;
        for (let t = 0; t < taps.length; t++) sum += taps[t].value;
        // taps.length is 2 or 4 for every Bayer position, never 0.
        rgb[i * 3 + channel] = taps.length > 0 ? sum / taps.length : mosaic[i];
      }
    }
  }
  return rgb;
}

/**
 * One pixel's worth of the same arithmetic, for the explanation panel.
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height @param {number} x @param {number} y
 * @returns {{method: string, channels: Array<object>}} */
export function explainBilinearPixel(mosaic, mask, width, height, x, y) {
  const i = y * width + x;
  const own = mask[i];
  const channels = [];
  for (let channel = 0; channel < 3; channel++) {
    if (channel === own) {
      channels.push({
        channel,
        measured: true,
        taps: [{ x, y, value: mosaic[i] }],
        value: mosaic[i],
        formula: 'measured here',
      });
      continue;
    }
    const taps = collectTaps(mosaic, mask, width, height, x, y, channel);
    let sum = 0;
    for (let t = 0; t < taps.length; t++) sum += taps[t].value;
    const value = taps.length > 0 ? sum / taps.length : mosaic[i];
    channels.push({
      channel,
      measured: false,
      taps,
      value,
      formula: `mean of ${taps.length} neighbours = ${sum.toFixed(1)} / ${taps.length}`,
    });
  }
  return { method: 'bilinear', channels };
}
