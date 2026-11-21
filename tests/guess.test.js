import { describe, expect, it } from 'vitest';
import { captureFrame, demosaicWith, GREEN, guessSite, nearestColourSite, SENSOR } from '../src/engine/index.js';

/** A flat field at one DN level, in the shapes the engine expects. */
function flatField(width, height, level) {
  const mosaic = new Float32Array(width * height).fill(level);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = (y & 1) === 0 ? ((x & 1) === 0 ? 0 : 1) : (x & 1) === 0 ? 1 : 2;
    }
  }
  const reference = new Float32Array(width * height * 3).fill(level / SENSOR.adcMax);
  return { mosaic, mask, reference };
}

describe('guessSite', () => {
  it('refuses a coordinate outside the frame', () => {
    const field = flatField(8, 8, 500);
    expect(() =>
      guessSite({ ...field, width: 8, height: 8, x: 8, y: 0 }),
    ).toThrow('guessSite: (8, 0) is outside 8x8');
  });

  it('reports a green site as already measured instead of guessing', () => {
    const field = flatField(8, 8, 500);
    // (1, 0) is green in RGGB: odd column, even row.
    const result = guessSite({ ...field, width: 8, height: 8, x: 1, y: 0 });
    expect(result.kind).toBe('measured');
    expect(result.channel).toBe(GREEN);
    expect(result.measured).toBe(500);
  });

  it('reproduces a flat field exactly, with the truth in agreement', () => {
    const field = flatField(8, 8, 500);
    // (0, 0) is red in RGGB: every neighbour is 500, so every guess is 500.
    const result = guessSite({ ...field, width: 8, height: 8, x: 0, y: 0 });
    expect(result.kind).toBe('guessed');
    expect(result.bilinear).toBeCloseTo(500, 6);
    expect(result.hamiltonAdams).toBeCloseTo(500, 6);
    expect(result.row.estimate).toBeCloseTo(500, 6);
    expect(result.column.estimate).toBeCloseTo(500, 6);
    expect(result.truth).toBeCloseTo(500, 4);
    expect(result.errors.bilinear).toBeCloseTo(0, 4);
    expect(result.errors.hamiltonAdams).toBeCloseTo(0, 4);
  });

  it('agrees with the demosaicers it is explaining', () => {
    const width = 96;
    const height = 64;
    const capture = captureFrame({ sceneName: 'photo', width, height, seed: 3 });
    const site = nearestColourSite(capture.mask, width, height, 40, 30);
    const guess = guessSite({
      mosaic: capture.mosaic,
      mask: capture.mask,
      width,
      height,
      reference: capture.referenceLinear,
      x: site.x,
      y: site.y,
    });

    const index = site.y * width + site.x;
    const hamilton = demosaicWith('hamiltonAdams', capture.mosaic, capture.mask, width, height);
    const bilinear = demosaicWith('bilinear', capture.mosaic, capture.mask, width, height);

    // The panel must show the same numbers the picture was built from.
    expect(guess.hamiltonAdams).toBeCloseTo(hamilton.detail.green[index], 6);
    expect(guess.bilinear).toBeCloseTo(bilinear.rgb[index * 3 + GREEN], 6);
  });

  it('carries a truth value inside the ADC range, near the neighbourhood', () => {
    const width = 96;
    const height = 64;
    const capture = captureFrame({ sceneName: 'photo', width, height, seed: 3 });
    const site = nearestColourSite(capture.mask, width, height, 40, 30);
    const guess = guessSite({
      mosaic: capture.mosaic,
      mask: capture.mask,
      width,
      height,
      reference: capture.referenceLinear,
      x: site.x,
      y: site.y,
    });

    expect(guess.truth).toBeGreaterThanOrEqual(0);
    expect(guess.truth).toBeLessThanOrEqual(SENSOR.adcMax);
    // A photograph is locally coherent: the ideal green at this site cannot be
    // far from the greens measured next door.
    expect(Math.abs(guess.truth - guess.row.average)).toBeLessThan(400);
  });

  it('finds a red or blue site for a green one', () => {
    const width = 8;
    const height = 8;
    const field = flatField(width, height, 100);
    const site = nearestColourSite(field.mask, width, height, 1, 0);
    expect(field.mask[site.y * width + site.x]).not.toBe(GREEN);
  });

  it('leaves a colour site where it is', () => {
    const field = flatField(8, 8, 100);
    expect(nearestColourSite(field.mask, 8, 8, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('hands the panel the five by five around the site', () => {
    const width = 96;
    const height = 64;
    const capture = captureFrame({ sceneName: 'photo', width, height, seed: 3 });
    const site = nearestColourSite(capture.mask, width, height, 40, 30);
    const guess = guessSite({
      mosaic: capture.mosaic,
      mask: capture.mask,
      width,
      height,
      reference: capture.referenceLinear,
      x: site.x,
      y: site.y,
    });

    expect(guess.window).toHaveLength(25);
    const centre = guess.window[12];
    expect(centre.isCentre).toBe(true);
    expect(centre.x).toBe(site.x);
    expect(centre.value).toBeCloseTo(guess.measured, 6);
    // Only the centre is the site; the other 24 carry their own filter colour.
    expect(guess.window.filter((cell) => cell.isCentre)).toHaveLength(1);
    expect(guess.window.filter((cell) => cell.channel === GREEN)).toHaveLength(12);
  });
});
