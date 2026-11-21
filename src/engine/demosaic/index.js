/**
 * The four demosaicers, behind one interface.
 *
 * The UI needs to (a) run a named method and (b) ask that same method to explain
 * one pixel. Keeping both in one registry is what stops the explanation from
 * describing an algorithm the code no longer runs -- a real risk when the panel is
 * written months after the maths.
 */

import { demosaicNearest, explainNearestPixel } from './nearest.js';
import { demosaicBilinear, explainBilinearPixel } from './bilinear.js';
import { demosaicHamiltonAdams, explainHamiltonAdamsPixel } from './hamiltonAdams.js';
import { demosaicMalvarHeCutler, explainMalvarHeCutlerPixel } from './malvarHeCutler.js';

/**
 * Method metadata, in the order the picker shows them (dumbest first).
 * @type {Array<{id: string, label: string, year: string, blurb: string}>} */
export const DEMOSAIC_METHODS = [
  {
    id: 'nearest',
    label: 'Nearest neighbour',
    year: 'baseline',
    blurb: 'Copies the closest pixel that measured the colour. Blocky, but honest about how little information there is.',
  },
  {
    id: 'bilinear',
    label: 'Bilinear',
    year: '1980s',
    blurb: 'Averages the neighbouring samples of each colour. Smooth, and it blurs across edges without noticing them.',
  },
  {
    id: 'hamiltonAdams',
    label: 'Hamilton-Adams',
    year: '1997',
    blurb: 'Rebuilds green first, choosing the direction where the image changes least, then adds colour as a difference.',
  },
  {
    id: 'malvarHeCutler',
    label: 'Malvar-He-Cutler',
    year: '2004',
    blurb: 'Fixes bilinear with a sharpening correction, using three fixed 5x5 filters. Cheap enough to run in a camera.',
  },
];

/** Every valid method id. @type {string[]} */
export const METHOD_IDS = DEMOSAIC_METHODS.map((m) => m.id);

/** Look up the metadata for a method. @param {string} id @returns {object|undefined} */
export function methodInfo(id) {
  return DEMOSAIC_METHODS.find((m) => m.id === id);
}

/**
 * Run one method over a whole image.
 * @param {string} id @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height
 * @returns {{rgb: Float32Array, detail: object|null}} linear RGB plus whatever the
 *   explanation needs (Hamilton-Adams returns its green plane) */
export function demosaicWith(id, mosaic, mask, width, height) {
  switch (id) {
    case 'nearest':
      return { rgb: demosaicNearest(mosaic, mask, width, height), detail: null };
    case 'bilinear':
      return { rgb: demosaicBilinear(mosaic, mask, width, height), detail: null };
    case 'hamiltonAdams': {
      const { rgb, green } = demosaicHamiltonAdams(mosaic, mask, width, height);
      // The green plane is the intermediate the panel needs to show dH/dV honestly.
      return { rgb, detail: { green } };
    }
    case 'malvarHeCutler':
      return { rgb: demosaicMalvarHeCutler(mosaic, mask, width, height), detail: null };
    default:
      throw new Error(`Unknown demosaic method: ${id}`);
  }
}

/**
 * Explain one pixel with the method that produced the image.
 * @param {string} id @param {Float32Array} mosaic @param {Uint8Array} mask
 * @param {number} width @param {number} height @param {number} x @param {number} y
 * @param {object|null} detail the `detail` returned by demosaicWith for this image
 * @returns {{method: string, channels: Array<object>}} */
export function explainWith(id, mosaic, mask, width, height, x, y, detail) {
  switch (id) {
    case 'nearest':
      return explainNearestPixel(mosaic, mask, width, height, x, y);
    case 'bilinear':
      return explainBilinearPixel(mosaic, mask, width, height, x, y);
    case 'hamiltonAdams':
      if (!detail || !detail.green) {
        throw new Error('explainWith: hamiltonAdams needs the green plane from demosaicWith');
      }
      return explainHamiltonAdamsPixel(mosaic, mask, width, height, x, y, detail.green);
    case 'malvarHeCutler':
      return explainMalvarHeCutlerPixel(mosaic, mask, width, height, x, y);
    default:
      throw new Error(`Unknown demosaic method: ${id}`);
  }
}
