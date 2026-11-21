import { describe, expect, it } from 'vitest';
import {
  BLUE,
  GREEN,
  RED,
  bayerMosaic,
  channelForPixel,
  gaussianKernel,
  mosaicCoverage,
  opticalLowPass,
} from '../src/engine/cfa.js';
import { makeScene, srgbToLinear, linearToSrgb } from '../src/engine/scene.js';

/** Build a flat interleaved-RGB image. */
function flat(width, height, r, g, b) {
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return rgb;
}

describe('channelForPixel', () => {
  it('lays out RGGB', () => {
    expect(channelForPixel(0, 0)).toBe(RED);
    expect(channelForPixel(1, 0)).toBe(GREEN);
    expect(channelForPixel(0, 1)).toBe(GREEN);
    expect(channelForPixel(1, 1)).toBe(BLUE);
    // And it repeats every two pixels in both directions.
    expect(channelForPixel(2, 0)).toBe(RED);
    expect(channelForPixel(3, 2)).toBe(GREEN);
    expect(channelForPixel(2, 3)).toBe(GREEN);
    expect(channelForPixel(3, 3)).toBe(BLUE);
  });
});

describe('bayerMosaic', () => {
  it('keeps exactly 25% red, 50% green and 25% blue', () => {
    const width = 64;
    const height = 48;
    const { mask } = bayerMosaic(flat(width, height, 0.5, 0.5, 0.5), width, height);
    const coverage = mosaicCoverage(mask);
    expect(coverage.red).toBeCloseTo(0.25, 10);
    expect(coverage.green).toBeCloseTo(0.5, 10);
    expect(coverage.blue).toBeCloseTo(0.25, 10);
  });

  it('keeps only the channel the pixel is filtered for', () => {
    const width = 8;
    const height = 8;
    const rgb = flat(width, height, 0, 0, 0);
    // Give every pixel a distinguishable triple.
    for (let i = 0; i < width * height; i++) {
      rgb[i * 3] = i + 1;
      rgb[i * 3 + 1] = 1000 + i;
      rgb[i * 3 + 2] = 2000 + i;
    }
    const { mosaic, mask } = bayerMosaic(rgb, width, height);
    for (let i = 0; i < width * height; i++) {
      expect(mosaic[i]).toBe(rgb[i * 3 + mask[i]]);
    }
  });
});

describe('opticalLowPass', () => {
  it('has a normalised kernel', () => {
    const { kernel } = gaussianKernel(1.2);
    const sum = kernel.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it('leaves a flat field exactly flat, including at the borders', () => {
    const width = 32;
    const height = 24;
    const rgb = flat(width, height, 0.37, 0.61, 0.08);
    const blurred = opticalLowPass(rgb, width, height, 1.5);
    for (let i = 0; i < blurred.length; i++) {
      const expected = [0.37, 0.61, 0.08][i % 3];
      expect(blurred[i]).toBeCloseTo(expected, 6);
    }
  });

  it('returns a copy when the filter is switched off', () => {
    const rgb = flat(8, 8, 0.2, 0.3, 0.4);
    const out = opticalLowPass(rgb, 8, 8, 0);
    expect(out).toEqual(rgb);
    expect(out).not.toBe(rgb);
  });

  it('averages away a single bright pixel', () => {
    const width = 16;
    const height = 16;
    const rgb = flat(width, height, 0, 0, 0);
    const centre = (8 * width + 8) * 3;
    rgb[centre] = 1;
    rgb[centre + 1] = 1;
    rgb[centre + 2] = 1;
    const blurred = opticalLowPass(rgb, width, height, 1);
    expect(blurred[centre]).toBeLessThan(1);
    const totalBefore = 1;
    let totalAfter = 0;
    for (let i = 0; i < width * height; i++) totalAfter += blurred[i * 3];
    // Energy is conserved by a normalised blur (up to the mirrored edge padding).
    expect(totalAfter).toBeCloseTo(totalBefore, 5);
  });
});

describe('sRGB transfer functions', () => {
  it('round-trips', () => {
    for (const v of [0, 0.01, 0.18, 0.5, 0.9, 1]) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
    }
  });

  it('is close to the 2.2 power law in the midtones', () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(Math.pow(0.5, 2.2), 1);
  });
});

describe('makeScene', () => {
  it('produces linear values inside 0..1 for every scene', () => {
    for (const name of ['photo', 'zonePlate', 'slantedEdge', 'stripes', 'siemensStar', 'text']) {
      const rgb = makeScene(name, 48, 32);
      expect(rgb.length).toBe(48 * 32 * 3);
      for (let i = 0; i < rgb.length; i++) {
        expect(rgb[i]).toBeGreaterThanOrEqual(0);
        expect(rgb[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic', () => {
    expect(makeScene('photo', 40, 24)).toEqual(makeScene('photo', 40, 24));
  });
});
