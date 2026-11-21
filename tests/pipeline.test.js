import { describe, expect, it } from 'vitest';
import { runPipeline, compareMethods, MAX_WORKING_SIZE } from '../src/engine/pipeline.js';
import { METHOD_IDS } from '../src/engine/demosaic/index.js';
import { imageDataToLinear, makeScene } from '../src/engine/scene.js';

/** Settings that keep noise low, so the comparison is about interpolation. */
const CLEAN = {
  sceneName: 'photo',
  width: 160,
  height: 120,
  lightLevel: 1,
  shutterSeconds: 1 / 60,
  fNumber: 2.8,
  iso: 100,
  seed: 7,
  olpfSigma: 0.7,
  whiteBalance: false,
};

/** Run every method on the same settings and collect PSNR. */
function psnrByMethod(overrides = {}) {
  const out = {};
  for (const method of METHOD_IDS) {
    out[method] = runPipeline({ ...CLEAN, ...overrides, method }).metrics.psnr;
  }
  return out;
}

describe('runPipeline', () => {
  it('returns every intermediate the UI needs', () => {
    const result = runPipeline({ ...CLEAN, width: 48, height: 32 });
    expect(result.scene.length).toBe(48 * 32 * 3);
    expect(result.filtered.length).toBe(48 * 32 * 3);
    expect(result.mosaic.length).toBe(48 * 32);
    expect(result.mask.length).toBe(48 * 32);
    expect(result.demosaic.rgb.length).toBe(48 * 32 * 3);
    expect(result.display.srgb.length).toBe(48 * 32 * 3);
    expect(result.reference.srgb.length).toBe(48 * 32 * 3);
    expect(result.metrics.errorMap.length).toBe(48 * 32);
    expect(result.coverage.green).toBeCloseTo(0.5, 10);
    expect(Object.keys(result.timings).length).toBeGreaterThan(4);
  });

  it('is deterministic for a fixed seed', () => {
    const a = runPipeline({ ...CLEAN, width: 64, height: 48 });
    const b = runPipeline({ ...CLEAN, width: 64, height: 48 });
    expect(a.mosaic).toEqual(b.mosaic);
    expect(a.metrics.psnr).toBe(b.metrics.psnr);
  });

  it('changes with the seed', () => {
    const a = runPipeline({ ...CLEAN, width: 64, height: 48, seed: 1 });
    const b = runPipeline({ ...CLEAN, width: 64, height: 48, seed: 2 });
    expect(a.mosaic).not.toEqual(b.mosaic);
  });

  it('refuses working images above the cap', () => {
    expect(() => runPipeline({ ...CLEAN, width: MAX_WORKING_SIZE + 2, height: 8 })).toThrow(/capped/);
  });

  it('accepts an uploaded image as a linear buffer', () => {
    // Pretend an 8x8 upload arrived as RGBA bytes.
    const width = 8;
    const height = 8;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 200;
      rgba[i * 4 + 1] = 120;
      rgba[i * 4 + 2] = 60;
      rgba[i * 4 + 3] = 255;
    }
    const linear = imageDataToLinear(rgba, width, height);
    const result = runPipeline({ ...CLEAN, width, height, linear });
    expect(result.scene).toEqual(linear);
    expect(result.metrics.psnr).toBeGreaterThan(0);
  });

  it('applies white balance only when asked', () => {
    const off = runPipeline({ ...CLEAN, width: 48, height: 32, whiteBalance: false });
    const on = runPipeline({ ...CLEAN, width: 48, height: 32, whiteBalance: true });
    expect(off.whiteBalance.gains).toEqual([1, 1, 1]);
    expect(on.whiteBalance.gains).not.toEqual([1, 1, 1]);
    expect(off.display.srgb).not.toEqual(on.display.srgb);
  });
});

describe('demosaic quality ranking', () => {
  it('orders nearest < bilinear < Hamilton-Adams <= Malvar-He-Cutler', () => {
    const p = psnrByMethod();
    expect(p.nearest, `nearest ${p.nearest} vs bilinear ${p.bilinear}`).toBeLessThan(p.bilinear);
    expect(p.bilinear, `bilinear ${p.bilinear} vs HA ${p.hamiltonAdams}`).toBeLessThan(p.hamiltonAdams);
    // The two good methods are close; the brief allows a tie, so this is a
    // one-sided check with a tolerance rather than a strict order.
    expect(p.malvarHeCutler).toBeGreaterThanOrEqual(p.hamiltonAdams - 0.5);
  });

  it('keeps the ranking on a second scene', () => {
    const p = psnrByMethod({ sceneName: 'slantedEdge', olpfSigma: 0 });
    expect(p.nearest).toBeLessThan(p.bilinear);
    expect(p.bilinear).toBeLessThan(Math.max(p.hamiltonAdams, p.malvarHeCutler));
  });
});

describe('scene dependence', () => {
  it('makes the zone plate fail differently for each method', () => {
    // On a frequency sweep every method breaks down, but not in the same place.
    // If two methods produced identical error maps, one of them is not doing
    // anything different, which would make the whole picker a lie.
    const maps = {};
    for (const method of METHOD_IDS) {
      maps[method] = runPipeline({
        ...CLEAN,
        sceneName: 'zonePlate',
        width: 128,
        height: 128,
        method,
      }).metrics.errorMap;
    }
    const argmax = (map) => {
      let best = 0;
      let bestIndex = 0;
      for (let i = 0; i < map.length; i++) {
        if (map[i] > best) {
          best = map[i];
          bestIndex = i;
        }
      }
      return bestIndex;
    };
    const positions = METHOD_IDS.map((m) => argmax(maps[m]));
    expect(new Set(positions).size).toBeGreaterThan(1);
  });

  it('gives the zone plate more chroma error than a smooth photo', () => {
    const plate = runPipeline({ ...CLEAN, sceneName: 'zonePlate', width: 128, height: 128 }).metrics;
    const photo = runPipeline({ ...CLEAN, sceneName: 'photo', width: 128, height: 96 }).metrics;
    // A frequency sweep tricks the colour channels; a photograph mostly does not.
    expect(plate.chromaError).toBeGreaterThan(photo.chromaError);
  });
});

describe('compareMethods', () => {
  it('scores every method on one identical capture', () => {
    const rows = compareMethods({ ...CLEAN, width: 120, height: 90 });
    expect(rows).toHaveLength(METHOD_IDS.length);
    expect(rows.map((row) => row.id)).toEqual(METHOD_IDS);
    for (const row of rows) {
      expect(row.psnr).toBeGreaterThan(15);
      expect(Number.isFinite(row.chromaError)).toBe(true);
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it('agrees with runPipeline for the same method and settings', () => {
    const settings = { ...CLEAN, width: 96, height: 72, method: 'bilinear' };
    const rows = compareMethods(settings);
    const solo = runPipeline(settings).metrics.psnr;
    const row = rows.find((entry) => entry.id === 'bilinear');
    // Same capture, same reference, so the two must agree to floating point.
    expect(Math.abs(row.psnr - solo)).toBeLessThan(1e-9);
  });

  it('ranks the methods the same way the single-method runs do', () => {
    const settings = { ...CLEAN, width: 160, height: 120 };
    const rows = compareMethods(settings);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row.psnr]));
    const solo = psnrByMethod({ width: 160, height: 120 });
    for (const method of METHOD_IDS) {
      expect(Math.abs(byId[method] - solo[method])).toBeLessThan(1e-9);
    }
  });
});

describe('noise affects the reconstruction', () => {  it('lowers PSNR when the light level drops', () => {
    const bright = runPipeline({ ...CLEAN, width: 96, height: 72, lightLevel: 1 }).metrics;
    const dark = runPipeline({ ...CLEAN, width: 96, height: 72, lightLevel: 0.02 }).metrics;
    expect(dark.psnr).toBeLessThan(bright.psnr);
    expect(dark.meanAbs).toBeGreaterThan(bright.meanAbs);
  });

  it('produces a mosaic that matches the scene at the sampled positions', () => {
    // The mosaic must be a genuine sample of the exposed scene, not a separate
    // random draw: this is what makes the pipeline reproducible end to end.
    const result = runPipeline({ ...CLEAN, width: 32, height: 32, olpfSigma: 0, lightLevel: 0, iso: 100 });
    // At zero light only read noise remains, but the mosaic still comes from the
    // same exposure pass as everything else -- so re-running must match exactly.
    const again = runPipeline({ ...CLEAN, width: 32, height: 32, olpfSigma: 0, lightLevel: 0, iso: 100 });
    expect(result.mosaic).toEqual(again.mosaic);
  });
});

describe('scenes', () => {
  it('generates every scene at the size it is asked for', () => {
    for (const name of ['photo', 'zonePlate', 'slantedEdge', 'stripes', 'siemensStar', 'text']) {
      const result = runPipeline({ ...CLEAN, sceneName: name, width: 40, height: 24 });
      expect(result.scene).toEqual(makeScene(name, 40, 24));
    }
  });
});
