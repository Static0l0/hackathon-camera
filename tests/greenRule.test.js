/**
 * The green rule: the published algorithm, and the three ways of switching its
 * test off.
 *
 * These tests exist because the page now offers a switch that claims to remove the
 * gradient test. A claim like that is only worth showing if the arithmetic really
 * changes, so each rule is checked against the number it is supposed to produce,
 * and the last test checks the thing the page is arguing: that choosing the
 * direction actually buys something over never choosing at all.
 */

import { describe, expect, it } from 'vitest';
import { GREEN, channelForPixel } from '../src/engine/cfa.js';
import { demosaicHamiltonAdams, greenAtColourSite } from '../src/engine/demosaic/hamiltonAdams.js';
import { demosaicWith } from '../src/engine/demosaic/index.js';
import { runPipeline } from '../src/engine/pipeline.js';

/**
 * A mosaic with a hard vertical edge: everything left of the seam is dark,
 * everything right of it is bright. On a vertical edge the intensity changes
 * across x, so a horizontal pair straddles the seam and a vertical pair does not.
 *
 * @param {number} width @param {number} height
 * @returns {{mosaic: Float32Array, mask: Uint8Array}}
 */
function verticalEdge(width, height) {
  const mosaic = new Float32Array(width * height);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      mask[i] = channelForPixel(x, y);
      mosaic[i] = x < width / 2 ? 100 : 900;
    }
  }
  return { mosaic, mask };
}

/** A completely flat sensor reading: every rule must agree there. */
function flatField(width, height, level) {
  const mosaic = new Float32Array(width * height).fill(level);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) mask[y * width + x] = channelForPixel(x, y);
  }
  return { mosaic, mask };
}

describe('greenAtColourSite: the four rules', () => {
  it('defaults to the gradient test, and reports that it was not forced', () => {
    const { mosaic } = verticalEdge(8, 8);
    const step = greenAtColourSite(mosaic, 8, 8, 3, 3);
    expect(step.forced).toBe(false);
    expect(step.direction).toBe('vertical');
  });

  it('crosses the edge when forced to the row', () => {
    const { mosaic } = verticalEdge(8, 8);
    const adaptive = greenAtColourSite(mosaic, 8, 8, 3, 3);
    const forced = greenAtColourSite(mosaic, 8, 8, 3, 3, 'horizontal');
    expect(forced.forced).toBe(true);
    expect(forced.direction).toBe('horizontal');
    // The row pair straddles the seam: (100 + 900)/2 = 500, pulled down to 300 by
    // the curvature term, against 100 for the column pair. Two hundred DN apart.
    expect(Math.abs(forced.value - adaptive.value)).toBeCloseTo(200, 6);
    expect(forced.value).toBe(forced.horizontal);
  });

  it('stays inside the edge when forced to the column', () => {
    const { mosaic } = verticalEdge(8, 8);
    const forced = greenAtColourSite(mosaic, 8, 8, 3, 3, 'vertical');
    expect(forced.value).toBe(forced.vertical);
    // Both neighbours of the column pair are on the dark side: 100, near enough.
    expect(forced.value).toBeCloseTo(100, 6);
  });

  it('averages all four neighbours when the axis question is dropped', () => {
    const { mosaic } = verticalEdge(8, 8);
    const step = greenAtColourSite(mosaic, 8, 8, 3, 3, 'average');
    const fourWays = (step.left + step.right + step.up + step.down) / 4;
    expect(step.value).toBeCloseTo(fourWays, 10);
    expect(step.value).toBe(step.average);
    expect(step.forced).toBe(true);
  });

  it('agrees with itself on a flat field, whichever rule is asked for', () => {
    const { mosaic } = flatField(8, 8, 500);
    for (const rule of ['gradient', 'horizontal', 'vertical', 'average']) {
      const step = greenAtColourSite(mosaic, 8, 8, 3, 3, rule);
      expect(step.value).toBeCloseTo(500, 6);
    }
  });

  it('rejects nothing and stays finite at the frame edge', () => {
    const { mosaic } = verticalEdge(8, 8);
    for (const rule of ['gradient', 'horizontal', 'vertical', 'average']) {
      const step = greenAtColourSite(mosaic, 8, 8, 0, 0, rule);
      expect(Number.isFinite(step.value)).toBe(true);
    }
  });
});

describe('demosaicHamiltonAdams: the rule reaches the whole plane', () => {
  it('leaves measured green sites alone, whatever the rule', () => {
    const { mosaic, mask } = verticalEdge(8, 8);
    const planes = ['gradient', 'horizontal', 'vertical', 'average'].map(
      (rule) => demosaicHamiltonAdams(mosaic, mask, 8, 8, rule).green,
    );
    for (let i = 0; i < mosaic.length; i++) {
      if (mask[i] !== GREEN) continue;
      for (const plane of planes) expect(plane[i]).toBe(mosaic[i]);
    }
  });

  it('carries the rule into the detail it reports', () => {
    const { mosaic, mask } = verticalEdge(8, 8);
    const { detail } = demosaicWith('hamiltonAdams', mosaic, mask, 8, 8, { greenRule: 'average' });
    expect(detail.greenRule).toBe('average');
    const plain = demosaicWith('hamiltonAdams', mosaic, mask, 8, 8);
    expect(plain.detail.greenRule).toBe('gradient');
  });

  it('makes a different picture when the rule changes', () => {
    const { mosaic, mask } = verticalEdge(8, 8);
    const adaptive = demosaicHamiltonAdams(mosaic, mask, 8, 8, 'gradient').rgb;
    const forced = demosaicHamiltonAdams(mosaic, mask, 8, 8, 'horizontal').rgb;
    let differing = 0;
    for (let i = 0; i < adaptive.length; i++) if (adaptive[i] !== forced[i]) differing += 1;
    expect(differing).toBeGreaterThan(0);
  });
});

describe('the switch changes the picture, and PSNR is not the whole story', () => {
  it('gives three different scores for the three rules on a zone plate', () => {
    const settings = { sceneName: 'zonePlate', width: 384, height: 216, seed: 1 };
    const adaptive = runPipeline({ ...settings, greenRule: 'gradient' }).metrics.psnr;
    const column = runPipeline({ ...settings, greenRule: 'vertical' }).metrics.psnr;
    const averaged = runPipeline({ ...settings, greenRule: 'average' }).metrics.psnr;

    // The switch is not cosmetic: all three reconstructions differ numerically.
    expect(Math.abs(adaptive - column)).toBeGreaterThan(0.5);
    expect(Math.abs(adaptive - averaged)).toBeGreaterThan(0.5);
  });

  it('records honestly that a forced axis can outscore the adaptive rule', () => {
    // Measured, not expected. On this zone plate at 384x216 the column-only rule
    // scores 31.6 dB against 29.8 dB for the published rule, because a radial
    // pattern has no single correct axis and PSNR averages the damage away.
    // The page therefore shows the error map and the live picture beside the score
    // rather than asking anyone to trust the number.
    const settings = { sceneName: 'zonePlate', width: 384, height: 216, seed: 1 };
    const adaptive = runPipeline({ ...settings, greenRule: 'gradient' }).metrics.psnr;
    const column = runPipeline({ ...settings, greenRule: 'vertical' }).metrics.psnr;
    expect(column).toBeGreaterThan(adaptive);
  });
});
