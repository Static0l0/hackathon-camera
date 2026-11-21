/**
 * Test scenes, generated in code as LINEAR radiance in 0..1.
 *
 * Every scene is a pure function of (width, height), so the same scene is
 * reproducible without shipping an image file. That also makes the tests
 * meaningful: the ground truth is the same buffer the sensor simulated from.
 *
 * The scenes are chosen to break demosaicing in different ways:
 *  - zonePlate     every spatial frequency, so aliasing and moire show up
 *  - slantedEdge   one sharp edge, shows zipper artefacts and edge blur
 *  - stripes       near-Nyquist detail, the worst case for a colour filter array
 *  - siemensStar   all orientations at once, shows direction-dependent failure
 *  - text          high-contrast coloured background, shows false colour
 *  - photo         a natural-ish scene: smooth gradients, a few edges, texture
 */

import { clamp, clamp01, lerp, pixelIndex } from './util.js';
import { mulberry32 } from './prng.js';

/** Scene ids, in the order the UI shows them. */
export const SCENE_NAMES = ['photo', 'zonePlate', 'slantedEdge', 'stripes', 'siemensStar', 'text'];

/** Human labels and one-line notes, kept next to the generators. */
export const SCENE_INFO = {
  photo: { label: 'Photograph', note: 'Natural-ish: smooth gradients, a few hard edges, fine texture.' },
  zonePlate: { label: 'Zone plate', note: 'Frequency sweeps from DC to Nyquist. Where the pattern outruns the sensor, moire appears.' },
  slantedEdge: { label: 'Slanted edge', note: 'One edge at 5 degrees. Interpolation along the wrong axis shows as a zipper.' },
  stripes: { label: 'Fine stripes', note: 'Detail at the sampling limit. A Bayer sensor cannot separate colour from detail here.' },
  siemensStar: { label: 'Siemens star', note: 'Every orientation at once. Spokes converge until they cannot be resolved.' },
  text: { label: 'Text on colour', note: 'Sharp dark strokes on a saturated field: the classic false-colour case.' },
};

/**
 * sRGB transfer function, decoded to linear light (IEC 61966-2-1).
 * The 0.04045 knee is where the linear segment joins the 2.4 power segment.
 * @param {number} c encoded value in 0..1 @returns {number} linear in 0..1 */
export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * sRGB transfer function, encoded from linear light.
 * @param {number} c linear in 0..1 @returns {number} encoded in 0..1 */
export function linearToSrgb(c) {
  const v = c <= 0 ? 0 : c;
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * Convert an RGBA byte buffer (as an uploaded image gives us) into linear RGB.
 *
 * An upload has already been through someone else's demosaic and gamma curve, so
 * this is a re-simulation, not a measurement -- the UI says so.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba @param {number} width @param {number} height
 * @returns {Float32Array} */
export function imageDataToLinear(rgba, width, height) {
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0, s = 0, d = 0; i < width * height; i++, s += 4, d += 3) {
    rgb[d] = srgbToLinear(rgba[s] / 255);
    rgb[d + 1] = srgbToLinear(rgba[s + 1] / 255);
    rgb[d + 2] = srgbToLinear(rgba[s + 2] / 255);
  }
  return rgb;
}

/** Write one linear RGB triple. @param {Float32Array} rgb @param {number} d */
function put(rgb, d, r, g, b) {
  rgb[d] = clamp01(r);
  rgb[d + 1] = clamp01(g);
  rgb[d + 2] = clamp01(b);
}

/**
 * Zone plate: I = 0.5 + 0.5 * cos(a * r^2).
 *
 * A quadratic phase makes the local frequency rise linearly with radius
 * (cycles/px = a*r/pi), so one image contains every frequency up to Nyquist at
 * the corner. Neutral grey, so any colour in the reconstruction is invented by
 * the demosaic.
 */
function zonePlate(width, height) {
  const rgb = new Float32Array(width * height * 3);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rMax = Math.hypot(width / 2, height / 2);
  // a chosen so the local frequency reaches Nyquist (0.5 cycles/px) at rMax.
  const a = (0.5 * Math.PI) / rMax;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      const v = 0.5 + 0.5 * Math.cos(a * r2);
      put(rgb, pixelIndex(x, y, width), v, v, v);
    }
  }
  return rgb;
}

/**
 * Slanted edge: a step edge rotated 5 degrees from vertical.
 *
 * The classic ISO 12233 target. A small slant is used because interpolation that
 * runs along the wrong axis produces the "zipper" pattern on exactly this shape.
 */
function slantedEdge(width, height) {
  const rgb = new Float32Array(width * height * 3);
  const angle = (5 * Math.PI) / 180;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = (x - cx) * nx + (y - cy) * ny;
      const v = d > 0 ? 0.85 : 0.05;
      put(rgb, pixelIndex(x, y, width), v, v, v);
    }
  }
  return rgb;
}

/** Fine stripes: alternating columns, one pixel on, one pixel off (Nyquist). */
function stripes(width, height) {
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (x & 1) === 0 ? 0.9 : 0.08;
      put(rgb, pixelIndex(x, y, width), v, v, v);
    }
  }
  return rgb;
}

/** Siemens star: radial spokes whose period shrinks toward the centre. */
function siemensStar(width, height) {
  const rgb = new Float32Array(width * height * 3);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const radius = Math.min(width, height) * 0.45;
  const spokes = 36;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      let v = 0.5;
      if (r <= radius) {
        const theta = Math.atan2(dy, dx);
        v = Math.cos(spokes * theta) > 0 ? 0.9 : 0.06;
      }
      put(rgb, pixelIndex(x, y, width), v, v, v);
    }
  }
  return rgb;
}

/**
 * A 5x7 bitmap font, enlarged. Drawing text without a DOM keeps the scene
 * generator runnable in Node (the engine has no canvas dependency), and a blocky
 * glyph is the honest test case: hard edges, no anti-aliasing to hide behind.
 * Each string is one row, '#' is ink.
 */
const GLYPHS = {
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  A: ['..#..', '.#.#.', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
};

/** Dark strokes on a warm, saturated field -- the false-colour test case. */
function textOnColour(width, height) {
  const rgb = new Float32Array(width * height * 3);
  const word = 'MOSAIC';
  const glyphW = 5;
  const glyphH = 7;
  const advance = glyphW + 1;
  const totalUnits = word.length * advance - 1;
  const scale = Math.max(1, Math.floor(Math.min(width / (totalUnits + 6), height / (glyphH + 6))));
  const originX = Math.floor((width - totalUnits * scale) / 2);
  const originY = Math.floor((height - glyphH * scale) / 2);

  // Warm background, ink is near black. A grey-on-grey version would not show
  // false colour, because false colour needs a chroma edge.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      put(rgb, pixelIndex(x, y, width), 0.62, 0.34, 0.14);
    }
  }
  for (let gi = 0; gi < word.length; gi++) {
    const rows = GLYPHS[word[gi]];
    for (let gy = 0; gy < glyphH; gy++) {
      const row = rows[gy];
      for (let gx = 0; gx < glyphW; gx++) {
        if (row[gx] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const x = originX + (gi * advance + gx) * scale + sx;
            const y = originY + gy * scale + sy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            put(rgb, pixelIndex(x, y, width), 0.03, 0.03, 0.03);
          }
        }
      }
    }
  }
  return rgb;
}

/**
 * A synthetic "photograph".
 *
 * There is no bundled JPEG on purpose: the ground truth has to be linear
 * radiance, and a decoded JPEG would already be demosaiced and gamma-encoded.
 * What demosaicing cares about is present anyway -- smooth chroma gradients,
 * a dark-to-bright edge at the horizon, a bright highlight, and fine texture.
 */
function photo(width, height) {
  const rgb = new Float32Array(width * height * 3);
  const rand = mulberry32(20040501);
  const horizon = Math.round(height * 0.56);
  const sunX = width * 0.72;
  const sunY = height * 0.24;
  const sunR = Math.min(width, height) * 0.1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r;
      let g;
      let b;
      if (y < horizon) {
        // Sky: deep at the top, pale at the horizon.
        const t = y / Math.max(1, horizon - 1);
        r = lerp(0.09, 0.55, t);
        g = lerp(0.17, 0.63, t);
        b = lerp(0.33, 0.72, t);
      } else {
        // Ground: warm near the viewer.
        const t = (y - horizon) / Math.max(1, height - 1 - horizon);
        r = lerp(0.19, 0.47, t);
        g = lerp(0.20, 0.37, t);
        b = lerp(0.11, 0.21, t);
      }

      // Two rolling ridges, so there is a real edge with chroma on both sides.
      const ridge1 = horizon + height * 0.045 * Math.sin((x / width) * Math.PI * 2 * 1.3 + 0.6);
      const ridge2 = horizon + height * 0.085 * Math.sin((x / width) * Math.PI * 2 * 0.8 + 2.1);
      if (y > ridge2) {
        const t = clamp((y - ridge2) / (height * 0.06), 0, 1);
        r = lerp(r, 0.10, t * 0.85);
        g = lerp(g, 0.19, t * 0.85);
        b = lerp(b, 0.09, t * 0.85);
      } else if (y > ridge1) {
        const t = clamp((y - ridge1) / (height * 0.05), 0, 1);
        r = lerp(r, 0.16, t * 0.7);
        g = lerp(g, 0.24, t * 0.7);
        b = lerp(b, 0.14, t * 0.7);
      }

      // Sun: a bright disc that saturates, plus a wide falloff.
      const ds = Math.hypot(x - sunX, y - sunY) / sunR;
      const disc = clamp(1.6 - ds, 0, 1);
      const glow = 0.22 * Math.exp(-ds * ds * 0.6);
      r += disc * 0.95 + glow;
      g += disc * 0.88 + glow * 0.85;
      b += disc * 0.70 + glow * 0.6;

      // Fine texture, deterministic: keeps the PSNR comparison from being
      // dominated by perfectly flat regions.
      const grain = 0.012 * (Math.sin(x * 0.9 + y * 0.13) + Math.sin(y * 1.7));
      put(rgb, pixelIndex(x, y, width), r + grain, g + grain, b + grain);
    }
  }
  return rgb;
}

const GENERATORS = {
  photo,
  zonePlate,
  slantedEdge,
  stripes,
  siemensStar,
  text: textOnColour,
};

/**
 * Build a scene as linear RGB radiance.
 * @param {string} name one of SCENE_NAMES
 * @param {number} width @param {number} height
 * @returns {Float32Array} interleaved linear RGB, 0..1 */
export function makeScene(name, width, height) {
  const generator = GENERATORS[name];
  if (!generator) throw new Error(`Unknown scene: ${name}`);
  return generator(width, height);
}
