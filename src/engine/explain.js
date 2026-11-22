/**
 * Per-pixel explanation: what the algorithm actually did at one pixel.
 *
 * This is the depth feature. Every number it reports comes out of the same code
 * that produced the image, because it calls the method's own explain function
 * rather than re-deriving the arithmetic in the panel. If the two ever disagree,
 * there is a test that catches it (tests/demosaic.test.js).
 *
 * What a reader gets back, for one clicked pixel:
 *  - which filter that pixel sat under, and the single value it measured;
 *  - the neighbourhood it was allowed to look at, with each sample labelled by its
 *    colour, so the RGGB layout is visible as data;
 *  - the method's own intermediates: the taps and weights for bilinear, dH/dV and
 *    the chosen direction for Hamilton-Adams, the filter name and 5x5 window for
 *    Malvar-He-Cutler;
 *  - a sentence naming exactly which channels were measured and which were
 *    invented, so the claim in the headline is checkable at the pixel level.
 */

import { CHANNEL_NAMES } from './cfa.js';
import { mirrorIndex } from './util.js';
import { explainWith, methodInfo } from './demosaic/index.js';

/** How far the neighbourhood grid reaches: 2 gives the 5x5 window that
 * Malvar-He-Cutler reads, so the same grid can show every method. */
export const EXPLAIN_RADIUS = 2;

/**
 * The mosaic window around a pixel, labelled.
 *
 * Values are raw sensor codes (DN). The index is the pixel's own position, and
 * mirrored coordinates are used at the border, matching what the demosaicers do.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height
 * @param {number} x @param {number} y @param {number} [radius]
 * @returns {Array<Array<{x: number, y: number, value: number, channel: number, channelName: string, isCentre: boolean}>>} */
export function neighbourhood(mosaic, mask, width, height, x, y, radius = EXPLAIN_RADIUS) {
  const rows = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const row = [];
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = mirrorIndex(x + dx, width);
      const sy = mirrorIndex(y + dy, height);
      const i = sy * width + sx;
      row.push({
        x: sx,
        y: sy,
        value: mosaic[i],
        channel: mask[i],
        channelName: CHANNEL_NAMES[mask[i]],
        isCentre: dx === 0 && dy === 0,
      });
    }
    rows.push(row);
  }
  return rows;
}

/** Capitalise the first letter without touching the rest. */
function sentenceCase(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The one-sentence summary shown under the loupe.
 *
 * Built from the real numbers, so it cannot claim something the image does not
 * show.
 *
 * @param {number} channel the channel this pixel measured
 * @param {Array<{channel: number, measured: boolean, value: number}>} channels
 * @returns {string} */
export function buildSentence(channel, channels) {
  const measured = channels.find((c) => c.measured);
  const guessed = channels.filter((c) => !c.measured);
  if (!measured) return 'No measurement at this pixel.';
  const head = `This pixel only measured ${CHANNEL_NAMES[channel]}: ${Math.round(measured.value)}.`;
  if (guessed.length === 0) return `${head} Nothing was guessed.`;
  const list = guessed.map((g) => `${CHANNEL_NAMES[g.channel]} (${Math.round(g.value)})`).join(' and ');
  return `${head} ${sentenceCase(list)} ${guessed.length > 1 ? 'were' : 'was'} guessed.`;
}

/**
 * Explain one pixel with the method that produced the image.
 *
 * @param {{
 *   mosaic: Float32Array, mask: Uint8Array, width: number, height: number,
 *   x: number, y: number, method: string, detail?: object|null,
 *   greenRule?: string
 * }} options
 * @returns {{
 *   x: number, y: number,
 *   channel: number, channelName: string, value: number,
 *   neighbours: Array<Array<object>>,
 *   channels: Array<object>,
 *   method: {id: string, label: string, year: string, blurb: string},
 *   sentence: string
 * }} */
export function explainPixel(options) {
  const { mosaic, mask, width, height, x, y, method, detail = null, greenRule } = options;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error(`explainPixel: (${x}, ${y}) is outside ${width}x${height}`);
  }
  const i = y * width + x;
  const channel = mask[i];

  // The method's own intermediates. Not a re-implementation: the same module that
  // reconstructed the image answers the question.
  const explanation = explainWith(method, mosaic, mask, width, height, x, y, detail, {
    greenRule,
  });
  const info = methodInfo(method) || { id: method, label: method, year: '', blurb: '' };

  return {
    x,
    y,
    channel,
    channelName: CHANNEL_NAMES[channel],
    value: mosaic[i],
    neighbours: neighbourhood(mosaic, mask, width, height, x, y),
    channels: explanation.channels,
    method: info,
    sentence: buildSentence(channel, explanation.channels),
  };
}
