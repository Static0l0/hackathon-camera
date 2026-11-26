/**
 * Hamilton-Adams demosaic: interpolate green along the edge, not across it.
 *
 * The idea (Hamilton & Adams, 1997; Adams, "Design of practical color filter
 * array interpolation algorithms for digital cameras", Proc. SPIE 3028, 1997):
 * green carries most of the luminance detail and two thirds of the samples, so
 * rebuild green first and carefully. At every red or blue site, look at how much
 * the image is changing horizontally versus vertically, and interpolate green
 * along whichever direction changes less. Crossing an edge is what produces the
 * "zipper" artefact, so the rule is simply: do not cross it.
 *
 * The gradient estimate is not just green's own difference. It adds a term that
 * measures how much the *known* colour changes over two pixels, which is what
 * makes the test work when green itself is smooth but the edge is in the red
 * channel:
 *
 *   dH = |G(x-1,y) - G(x+1,y)| + |2*C(x,y) - C(x-2,y) - C(x+2,y)|
 *   dV = |G(x,y-1) - G(x,y+1)| + |2*C(x,y) - C(x,y-2) - C(x,y+2)|
 *
 * and then green on the cheaper side, corrected by a second-difference term that
 * keeps the local curvature consistent with the measured colour:
 *
 *   Gh = (G(x-1,y) + G(x+1,y))/2 + (2*C(x,y) - C(x-2,y) - C(x+2,y))/4
 *
 * Red and blue come from colour DIFFERENCES rather than colour values, because
 * differences vary slowly across an edge even when the values jump. That is the
 * second half of the algorithm and the reason it does not simply blur.
 *
 * Verified behaviour is in tests/hamiltonAdams.test.js -- in particular that the
 * numbers this file shows the user are the numbers it actually used.
 */

import { GREEN } from '../cfa.js';
import { mirrorIndex } from '../util.js';

/** Read a mosaic sample with mirrored coordinates.
 * @param {Float32Array} mosaic @param {number} width @param {number} height
 * @param {number} x @param {number} y @returns {number} */
function at(mosaic, width, height, x, y) {
  return mosaic[mirrorIndex(y, height) * width + mirrorIndex(x, width)];
}

/**
 * How the green estimate chooses a direction.
 *
 * 'gradient' is the real algorithm. The other three exist so a visitor can switch
 * the test off and watch the zipper appear: 'horizontal' and 'vertical' always
 * take one axis whatever the image is doing, and 'average' ignores the axis
 * question completely and means the four green neighbours.
 *
 * @typedef {'gradient'|'horizontal'|'vertical'|'average'} GreenRule
 */

/** Every rule the UI may ask for, in menu order. @type {GreenRule[]} */
export const GREEN_RULES = ['gradient', 'horizontal', 'vertical', 'average'];

/**
 * Green at a red or blue site, by direction-adaptive interpolation.
 *
 * Kept as its own function so the explanation panel can call exactly this code
 * for one pixel instead of re-deriving the arithmetic and drifting from it.
 *
 * @param {Float32Array} mosaic @param {number} width @param {number} height
 * @param {number} x @param {number} y
 * @param {GreenRule} [rule] how to choose; 'gradient' is the published algorithm
 * @returns {{
 *   value: number, dH: number, dV: number,
 *   direction: 'horizontal'|'vertical'|'equal',
 *   forced: boolean,
 *   horizontal: number, vertical: number, average: number,
 *   left: number, right: number, up: number, down: number,
 *   left2: number, right2: number, up2: number, down2: number,
 *   centre: number
 * }} */
export function greenAtColourSite(mosaic, width, height, x, y, rule = 'gradient') {
  const centre = at(mosaic, width, height, x, y);
  const left = at(mosaic, width, height, x - 1, y);
  const right = at(mosaic, width, height, x + 1, y);
  const up = at(mosaic, width, height, x, y - 1);
  const down = at(mosaic, width, height, x, y + 1);
  const left2 = at(mosaic, width, height, x - 2, y);
  const right2 = at(mosaic, width, height, x + 2, y);
  const up2 = at(mosaic, width, height, x, y - 2);
  const down2 = at(mosaic, width, height, x, y + 2);

  // Laplacian of the measured colour, along each axis. Small on a smooth ramp,
  // large right at an edge -- which is exactly where the choice matters.
  const lapH = 2 * centre - left2 - right2;
  const lapV = 2 * centre - up2 - down2;

  const dH = Math.abs(left - right) + Math.abs(lapH);
  const dV = Math.abs(up - down) + Math.abs(lapV);

  const horizontal = (left + right) / 2 + lapH / 4;
  const vertical = (up + down) / 2 + lapV / 4;
  // The switch-off case: no axis, no curvature correction, just the four green
  // neighbours. On a vertical edge this is the guess that crosses it.
  const average = (left + right + up + down) / 4;

  let value;
  let direction;
  let forced = false;

  if (rule === 'horizontal') {
    value = horizontal;
    direction = 'horizontal';
    forced = true;
  } else if (rule === 'vertical') {
    value = vertical;
    direction = 'vertical';
    forced = true;
  } else if (rule === 'average') {
    value = average;
    direction = 'equal';
    forced = true;
  } else if (dH < dV) {
    value = horizontal;
    direction = 'horizontal';
  } else if (dV < dH) {
    value = vertical;
    direction = 'vertical';
  } else {
    value = (horizontal + vertical) / 2;
    direction = 'equal';
  }

  return {
    value,
    dH,
    dV,
    direction,
    forced,
    horizontal,
    vertical,
    average,
    left,
    right,
    up,
    down,
    left2,
    right2,
    up2,
    down2,
    centre,
  };
}

/**
 * Full Hamilton-Adams reconstruction.
 *
 * Pass 1 rebuilds green everywhere. Pass 2 fills red and blue using differences
 * against that green, first at green sites (where the missing colour is one axis
 * away) and then at the opposite colour site (where it is diagonal).
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height
 * @param {GreenRule} [rule] how the green estimate chooses a direction
 * @returns {{rgb: Float32Array, green: Float32Array}} linear RGB plus the green plane,
 *   which the explanation panel needs and which costs nothing to return. */
export function demosaicHamiltonAdams(mosaic, mask, width, height, rule = 'gradient') {
  const green = new Float32Array(width * height);

  // Pass 1: green at every pixel. At a green site it is already measured.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] === GREEN) {
        green[i] = mosaic[i];
      } else {
        green[i] = greenAtColourSite(mosaic, width, height, x, y, rule).value;
      }
    }
  }

  const rgb = new Float32Array(width * height * 3);

  // Pass 2: red and blue, from colour differences against the new green plane.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const own = mask[i];
      const g = green[i];
      rgb[i * 3 + 1] = g;

      if (own !== GREEN) {
        // At a red or blue site the other colour sits diagonally, 1 pixel away in
        // both x and y. Averaging four differences beats averaging four values:
        // the colour offset is nearly constant across an edge, the value is not.
        const d11 = at(mosaic, width, height, x - 1, y - 1) - green[mirrorIndex(y - 1, height) * width + mirrorIndex(x - 1, width)];
        const d21 = at(mosaic, width, height, x + 1, y - 1) - green[mirrorIndex(y - 1, height) * width + mirrorIndex(x + 1, width)];
        const d12 = at(mosaic, width, height, x - 1, y + 1) - green[mirrorIndex(y + 1, height) * width + mirrorIndex(x - 1, width)];
        const d22 = at(mosaic, width, height, x + 1, y + 1) - green[mirrorIndex(y + 1, height) * width + mirrorIndex(x + 1, width)];
        const diagonal = (d11 + d21 + d12 + d22) / 4;

        if (own === 0) {
          // Red site: red is measured, blue is the diagonal guess.
          rgb[i * 3] = mosaic[i];
          rgb[i * 3 + 2] = g + diagonal;
        } else {
          // Blue site: blue is measured, red is the diagonal guess.
          rgb[i * 3] = g + diagonal;
          rgb[i * 3 + 2] = mosaic[i];
        }
        continue;
      }

      // Green site. In a red row the horizontal neighbours measured red; in a
      // blue row they measured blue. So the axis assigned to each colour swaps.
      const redRow = (y & 1) === 0;
      const leftIndex = mirrorIndex(y, height) * width + mirrorIndex(x - 1, width);
      const rightIndex = mirrorIndex(y, height) * width + mirrorIndex(x + 1, width);
      const upIndex = mirrorIndex(y - 1, height) * width + mirrorIndex(x, width);
      const downIndex = mirrorIndex(y + 1, height) * width + mirrorIndex(x, width);

      const horizontalDiff = (mosaic[leftIndex] - green[leftIndex] + (mosaic[rightIndex] - green[rightIndex])) / 2;
      const verticalDiff = (mosaic[upIndex] - green[upIndex] + (mosaic[downIndex] - green[downIndex])) / 2;

      if (redRow) {
        rgb[i * 3] = g + horizontalDiff;
        rgb[i * 3 + 2] = g + verticalDiff;
      } else {
        rgb[i * 3] = g + verticalDiff;
        rgb[i * 3 + 2] = g + horizontalDiff;
      }
    }
  }

  return { rgb, green };
}

/**
 * One pixel explained, using the same two steps the full pass uses.
 *
 * @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height @param {number} x @param {number} y
 * @param {Float32Array} green the plane returned by demosaicHamiltonAdams
 * @param {GreenRule} [rule] the same rule the plane was built with
 * @returns {object} */
export function explainHamiltonAdamsPixel(mosaic, mask, width, height, x, y, green, rule = 'gradient') {
  const i = y * width + x;
  const own = mask[i];
  const channels = [];

  if (own !== GREEN) {
    const step = greenAtColourSite(mosaic, width, height, x, y, rule);
    let formula;
    if (rule === 'average') {
      formula = 'The mean of four green neighbours. No direction is chosen.';
    } else if (rule === 'horizontal' || rule === 'vertical') {
      formula = `The comparison is off, so the ${rule === 'horizontal' ? 'row' : 'column'} pair is used at every site.`;
    } else if (step.direction === 'equal') {
      formula = 'Both directions change equally, so the mean of both is used.';
    } else {
      const axis = step.direction === 'horizontal' ? 'row' : 'column';
      formula = `The ${axis} changes less, so the ${axis} pair is used.`;
    }
    channels.push({
      channel: 1,
      measured: false,
      value: step.value,
      formula,
      gradient: step,
    });
    channels.push({
      channel: own,
      measured: true,
      value: mosaic[i],
      formula: 'Measured at this site.',
    });
    // The opposite colour comes from diagonal colour differences.
    const d = [];
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const si = mirrorIndex(y + dy, height) * width + mirrorIndex(x + dx, width);
      d.push({ x: mirrorIndex(x + dx, width), y: mirrorIndex(y + dy, height), difference: mosaic[si] - green[si] });
    }
    const mean = (d[0].difference + d[1].difference + d[2].difference + d[3].difference) / 4;
    channels.push({
      // The opposite colour: 0 -> 2 and 2 -> 0. (3 - own would be wrong here,
      // because the channel ids are not a symmetric set around 1.)
      channel: own === 0 ? 2 : 0,
      measured: false,
      value: green[i] + mean,
      formula: 'Green, plus the average colour difference from four diagonal neighbours.',
      taps: d,
    });
  } else {
    channels.push({
      channel: 1,
      measured: true,
      value: mosaic[i],
      formula: 'Measured at this site.',
    });
    const redRow = (y & 1) === 0;
    const leftIndex = mirrorIndex(y, height) * width + mirrorIndex(x - 1, width);
    const rightIndex = mirrorIndex(y, height) * width + mirrorIndex(x + 1, width);
    const upIndex = mirrorIndex(y - 1, height) * width + mirrorIndex(x, width);
    const downIndex = mirrorIndex(y + 1, height) * width + mirrorIndex(x, width);
    const horizontalDiff = (mosaic[leftIndex] - green[leftIndex] + (mosaic[rightIndex] - green[rightIndex])) / 2;
    const verticalDiff = (mosaic[upIndex] - green[upIndex] + (mosaic[downIndex] - green[downIndex])) / 2;
    const horizontalChannel = redRow ? 0 : 2;
    const verticalChannel = redRow ? 2 : 0;
    channels.push({
      channel: horizontalChannel,
      measured: false,
      value: green[i] + horizontalDiff,
      formula: 'Green, plus the average colour difference along the row.',
      taps: [
        { x: mirrorIndex(x - 1, width), y, difference: mosaic[leftIndex] - green[leftIndex] },
        { x: mirrorIndex(x + 1, width), y, difference: mosaic[rightIndex] - green[rightIndex] },
      ],
    });
    channels.push({
      channel: verticalChannel,
      measured: false,
      value: green[i] + verticalDiff,
      formula: 'Green, plus the average colour difference down the column.',
      taps: [
        { x, y: mirrorIndex(y - 1, height), difference: mosaic[upIndex] - green[upIndex] },
        { x, y: mirrorIndex(y + 1, height), difference: mosaic[downIndex] - green[downIndex] },
      ],
    });
  }

  channels.sort((a, b) => a.channel - b.channel);
  return { method: 'hamiltonAdams', channels };
}
