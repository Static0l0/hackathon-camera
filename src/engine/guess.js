/**
 * One missing green, worked out in public.
 *
 * The rest of this project shows what the algorithms *produce*. This module
 * exposes the decision they make, one site at a time, with the numbers that went
 * into it and -- from the ideal reference frame -- what the answer should have
 * been. That last part is what turns a demonstration into an explanation: the
 * reader can be wrong, and can see by how much.
 *
 * The Hamilton-Adams numbers come from `greenAtColourSite()` rather than from a
 * second copy of the arithmetic here, so the panel cannot drift away from the
 * demosaicer it is explaining.
 */

import { CHANNEL_NAMES, GREEN } from './cfa.js';
import { greenAtColourSite } from './demosaic/hamiltonAdams.js';
import { SENSOR } from './exposure.js';
import { mirrorIndex } from './util.js';

/**
 * The 5x5 of measured values around one site, tinted by which filter each one
 * passed. The panel draws this so the reader can see that the greens it is about
 * to average are physically next door, not abstract numbers.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height @param {number} x @param {number} y
 * @returns {{x: number, y: number, value: number, channel: number, isCentre: boolean}[]}
 */
function window5(mosaic, mask, width, height, x, y) {
  const cells = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const sx = mirrorIndex(x + dx, width);
      const sy = mirrorIndex(y + dy, height);
      cells.push({
        x: x + dx,
        y: y + dy,
        value: mosaic[sy * width + sx],
        channel: mask[sy * width + sx],
        isCentre: dx === 0 && dy === 0,
      });
    }
  }
  return cells;
}

/**
 * Everything a reader needs to make the guess, and everything needed to mark it.
 *
 * @param {{
 *   mosaic: Float32Array, mask: Uint8Array, width: number, height: number,
 *   reference: Float32Array, x: number, y: number
 * }} args `reference` is the ideal frame in linear light, 0..1 per channel.
 * @returns {object} `kind: 'guessed'` for a red or blue site, `'measured'` for a
 *   green one (where there is nothing to guess).
 */
export function guessSite({ mosaic, mask, width, height, reference, x, y, greenRule = 'gradient' }) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error(`guessSite: (${x}, ${y}) is outside ${width}x${height}`);
  }

  const index = y * width + x;
  const channel = mask[index];
  const channelName = CHANNEL_NAMES[channel];

  // A green site already measured the thing this panel is about.
  if (channel === GREEN) {
    return { kind: 'measured', x, y, channel, channelName, measured: mosaic[index] };
  }

  // The same rule the frame was built with, so the panel cannot quote a number the
  // picture did not use.
  const ha = greenAtColourSite(mosaic, width, height, x, y, greenRule);

  // Bilinear does not choose a direction: it averages the four green neighbours.
  const bilinear = (ha.left + ha.right + ha.up + ha.down) / 4;

  // The ideal frame is normalised so 1.0 is the top of the ADC range.
  const truth = reference[index * 3 + GREEN] * SENSOR.adcMax;

  return {
    kind: 'guessed',
    x,
    y,
    channel,
    channelName,
    measured: ha.centre,
    neighbours: {
      left: ha.left,
      right: ha.right,
      up: ha.up,
      down: ha.down,
      left2: ha.left2,
      right2: ha.right2,
      up2: ha.up2,
      down2: ha.down2,
    },
    row: { average: (ha.left + ha.right) / 2, estimate: ha.horizontal, gradient: ha.dH },
    column: { average: (ha.up + ha.down) / 2, estimate: ha.vertical, gradient: ha.dV },
    // 'horizontal' means it trusted the row; the panel says "along the row".
    direction: ha.direction,
    forced: ha.forced,
    greenRule,
    bilinear,
    hamiltonAdams: ha.value,
    truth,
    errors: { bilinear: bilinear - truth, hamiltonAdams: ha.value - truth },
    window: window5(mosaic, mask, width, height, x, y),
  };
}

/**
 * The nearest site to (x, y) whose filter is red or blue -- i.e. a site with no
 * green measurement, which is the only kind this panel can teach from.
 *
 * @param {Uint8Array} mask @param {number} width @param {number} height
 * @param {number} x @param {number} y
 * @returns {{x: number, y: number}}
 */
export function nearestColourSite(mask, width, height, x, y) {
  const cx = Math.min(width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(height - 1, Math.max(0, Math.round(y)));
  if (mask[cy * width + cx] !== GREEN) return { x: cx, y: cy };

  // Greens always have a red or blue neighbour one step away, so one ring is enough.
  const ring = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of ring) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    if (mask[ny * width + nx] !== GREEN) return { x: nx, y: ny };
  }
  return { x: cx, y: cy };
}
