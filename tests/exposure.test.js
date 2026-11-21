import { describe, expect, it } from 'vitest';
import { SENSOR, expose, exposureGain, expectedElectrons, isoGain, snr, snrDb } from '../src/engine/exposure.js';

/** A flat scene: every sample identical, so all variation is sensor noise. */
function flatScene(width, height, value) {
  const linear = new Float32Array(width * height * 3);
  linear.fill(value);
  return linear;
}

/** Mean and standard deviation. */
function stats(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  const mean = sum / values.length;
  let variance = 0;
  for (let i = 0; i < values.length; i++) variance += (values[i] - mean) ** 2;
  return { mean, std: Math.sqrt(variance / values.length) };
}

describe('exposureGain', () => {
  it('falls with the square of the f-number', () => {
    const base = { lightLevel: 1, shutterSeconds: 1 / 60, fNumber: 2.8 };
    const wide = exposureGain({ ...base, fNumber: 1.4 });
    const narrow = exposureGain({ ...base, fNumber: 2.8 });
    expect(wide / narrow).toBeCloseTo(4, 6);
  });

  it('is linear in shutter time and in light level', () => {
    const base = { lightLevel: 1, shutterSeconds: 1 / 60, fNumber: 2.8 };
    const slow = exposureGain({ ...base, shutterSeconds: 1 / 30 });
    const fast = exposureGain(base);
    expect(slow / fast).toBeCloseTo(2, 6);
    const bright = exposureGain({ ...base, lightLevel: 2 });
    expect(bright / fast).toBeCloseTo(2, 6);
  });

  it('puts mid-grey in a realistic electron range', () => {
    // 0.18 linear at light 0.5, 1/60 s, f/2.8 should land near 800 electrons.
    const gain = exposureGain({ lightLevel: 0.5, shutterSeconds: 1 / 60, fNumber: 2.8 });
    const electrons = expectedElectrons(0.18, gain);
    expect(electrons).toBeGreaterThan(600);
    expect(electrons).toBeLessThan(1000);
  });
});

describe('snr', () => {
  it('follows signal / sqrt(signal + readNoise^2)', () => {
    const signal = 1000;
    const expected = 1000 / Math.sqrt(1000 + SENSOR.readNoiseElectrons ** 2);
    expect(snr(signal)).toBeCloseTo(expected, 10);
  });

  it('rises with signal and approaches sqrt(signal) in the shot-noise limit', () => {
    expect(snr(10000)).toBeGreaterThan(snr(1000));
    expect(snr(1e6) / Math.sqrt(1e6)).toBeCloseTo(1, 2);
    expect(snr(0)).toBe(0);
    expect(snrDb(0)).toBe(-Infinity);
  });
});

describe('expose', () => {
  const settings = { lightLevel: 0.5, shutterSeconds: 1 / 60, fNumber: 2.8, seed: 1234 };

  it('is reproducible for a fixed seed', () => {
    const scene = flatScene(32, 32, 0.2);
    const a = expose(scene, 32, 32, { ...settings, iso: 400 });
    const b = expose(scene, 32, 32, { ...settings, iso: 400 });
    expect(a.dn).toEqual(b.dn);
    expect(a.electrons).toEqual(b.electrons);
  });

  it('changes when the seed changes', () => {
    const scene = flatScene(32, 32, 0.2);
    const a = expose(scene, 32, 32, { ...settings, iso: 400, seed: 1 });
    const b = expose(scene, 32, 32, { ...settings, iso: 400, seed: 2 });
    expect(a.dn).not.toEqual(b.dn);
  });

  it('doubles the signal when ISO doubles, using the same electrons', () => {
    const scene = flatScene(24, 24, 0.3);
    const low = expose(scene, 24, 24, { ...settings, iso: 100 });
    const high = expose(scene, 24, 24, { ...settings, iso: 200 });
    // Same seed means the same photons and the same read noise were drawn, so the
    // only difference is the gain. This isolates the claim being tested.
    expect(high.electrons).toEqual(low.electrons);
    for (let i = 0; i < low.signal.length; i++) {
      expect(high.signal[i]).toBeCloseTo(low.signal[i] * 2, 4);
    }
  });

  it('doubles the noise with ISO, so SNR does not improve', () => {
    const scene = flatScene(64, 64, 0.05);
    const low = expose(scene, 64, 64, { ...settings, iso: 100 });
    const high = expose(scene, 64, 64, { ...settings, iso: 200 });
    const lowStats = stats(low.signal);
    const highStats = stats(high.signal);
    expect(highStats.mean / lowStats.mean).toBeCloseTo(2, 2);
    expect(highStats.std / lowStats.std).toBeCloseTo(2, 2);
    // The measured ratio is unchanged, which is the point of the whole section.
    const lowRatio = lowStats.mean / lowStats.std;
    const highRatio = highStats.mean / highStats.std;
    expect(highRatio / lowRatio).toBeCloseTo(1, 2);
  });

  it('clips at the full-well capacity', () => {
    const scene = flatScene(16, 16, 1);
    const result = expose(scene, 16, 16, {
      lightLevel: 200,
      shutterSeconds: 1,
      fNumber: 1.4,
      iso: 100,
      seed: 5,
    });
    expect(Math.max(...result.electrons)).toBeLessThanOrEqual(SENSOR.fullWellElectrons);
    expect(result.clippedFraction).toBeGreaterThan(0.9);
  });

  it('produces a read-noise floor in the dark', () => {
    const scene = flatScene(64, 64, 0);
    const dark = expose(scene, 64, 64, { ...settings, iso: 100 });
    const darkStats = stats(dark.signal);
    expect(darkStats.mean).toBeCloseTo(0, 1);
    // Read noise is 3 electrons; at unity gain that is 3 DN of standard deviation.
    expect(darkStats.std).toBeGreaterThan(2);
    expect(darkStats.std).toBeLessThan(4);
  });

  it('never emits a code below zero or above the converter range', () => {
    const scene = flatScene(32, 32, 0.6);
    const result = expose(scene, 32, 32, { ...settings, iso: 6400 });
    for (let i = 0; i < result.dn.length; i++) {
      expect(result.dn[i]).toBeGreaterThanOrEqual(0);
      expect(result.dn[i]).toBeLessThanOrEqual(SENSOR.adcMax);
    }
  });

  it('reports ISO as a pure gain', () => {
    expect(isoGain(100)).toBe(1);
    expect(isoGain(1600)).toBe(16);
  });
});
