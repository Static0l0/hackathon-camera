/**
 * Nearest-neighbour demosaic: the dumbest possible guess.
 *
 * For every pixel and every colour it does not have, copy the value from the
 * closest pixel that does have that colour. That is a 2-pixel offset in one
 * direction, always, because in a Bayer pattern the nearest sample of any other
 * colour is exactly two pixels away.
 *
 * The result looks like coloured blocks: real colour boundaries get smeared over
 * a 2-pixel grid and edges turn into staircases. It is here as the baseline that
 * makes the smarter methods look like progress -- and because "the camera just
 * copies a neighbour" is the mental model most people already have.
 *
 * Cost: one lookup per pixel per channel. O(n).
 */

import { channelForPixel } from '../cfa.js';
import { mirrorIndex } from '../util.js';

/**
 * For each of the four positions in the 2x2 Bayer repeat, which offset to read
 * each channel from. Precomputed once because the answer never changes.
 *
 * Ties (a diagonal and an axis-aligned neighbour can both be distance 2) are
 * broken by scan order: smallest dy first, then smallest dx. Deterministic, and
 * documented here so the code does not look arbitrary.
 *
 * @type {Array<Array<Array<{dx: number, dy: number, own: boolean}>>>} */
const NEAREST_TABLE = buildNearestTable();

function buildNearestTable() {
  const table = [];
  for (let py = 0; py < 2; py++) {
    const row = [];
    for (let px = 0; px < 2; px++) {
      const own = channelForPixel(px, py);
      const picks = [];
      for (let channel = 0; channel < 3; channel++) {
        if (channel === own) {
          picks.push({ dx: 0, dy: 0, own: true });
          continue;
        }
        let best = null;
        let bestDistance = Infinity;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const parityX = (((px + dx) % 2) + 2) % 2;
            const parityY = (((py + dy) % 2) + 2) % 2;
            if (channelForPixel(parityX, parityY) !== channel) continue;
            const distance = Math.abs(dx) + Math.abs(dy);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = { dx, dy, own: false };
            }
          }
        }
        picks.push(best);
      }
      row.push(picks);
    }
    table.push(row);
  }
  return table;
}

/**
 * Reconstruct colour by copying the nearest same-colour sample.
 *
 * @param {Float32Array} mosaic one value per pixel
 * @param {Uint8Array} mask which channel each pixel measured
 * @param {number} width @param {number} height
 * @returns {Float32Array} interleaved linear RGB */
export function demosaicNearest(mosaic, mask, width, height) {
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const picks = NEAREST_TABLE[y & 1][x & 1];
      for (let channel = 0; channel < 3; channel++) {
        const pick = picks[channel];
        const sx = mirrorIndex(x + pick.dx, width);
        const sy = mirrorIndex(y + pick.dy, height);
        rgb[i * 3 + channel] = mosaic[sy * width + sx];
      }
    }
  }
  return rgb;
}

/**
 * The same decision, for one pixel, with the numbers laid out for the UI.
 *
 * This deliberately reuses NEAREST_TABLE rather than re-deriving the offset, so
 * the explanation can never drift away from what the demosaicer actually did.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height @param {number} x @param {number} y
 * @returns {{method: string, channels: Array<object>}} */
export function explainNearestPixel(mosaic, mask, width, height, x, y) {
  const picks = NEAREST_TABLE[y & 1][x & 1];
  const channels = [];
  for (let channel = 0; channel < 3; channel++) {
    const pick = picks[channel];
    const sx = mirrorIndex(x + pick.dx, width);
    const sy = mirrorIndex(y + pick.dy, height);
    channels.push({
      channel,
      measured: pick.own,
      source: { x: sx, y: sy },
      offset: { dx: pick.dx, dy: pick.dy },
      value: mosaic[sy * width + sx],
      formula: pick.own ? 'measured here' : `copied from (${sx}, ${sy})`,
    });
  }
  return { method: 'nearest', channels };
}
