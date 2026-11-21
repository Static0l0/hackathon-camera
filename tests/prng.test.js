import { describe, expect, it } from 'vitest';
import { mulberry32, nextGaussian, poissonSample } from '../src/engine/prng.js';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const first = [];
    const second = [];
    for (let i = 0; i < 64; i++) {
      first.push(a());
      second.push(b());
    }
    expect(first).toEqual(second);
  });

  it('produces a different sequence for a different seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const first = [];
    const second = [];
    for (let i = 0; i < 64; i++) {
      first.push(a());
      second.push(b());
    }
    expect(first).not.toEqual(second);
  });

  it('stays inside [0, 1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 10000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('nextGaussian', () => {
  it('has roughly zero mean and unit variance', () => {
    const rand = mulberry32(99);
    const samples = [];
    for (let i = 0; i < 40000; i++) samples.push(nextGaussian(rand));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(variance - 1)).toBeLessThan(0.05);
  });
});

describe('poissonSample', () => {
  /** Mean and variance of a sample. */
  const stats = (values) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return { mean, variance };
  };

  it('matches mean and variance for a small lambda (Knuth branch)', () => {
    const lambda = 8;
    const rand = mulberry32(4242);
    const draw = [];
    for (let i = 0; i < 20000; i++) draw.push(poissonSample(rand, lambda));
    const { mean, variance } = stats(draw);
    // For a Poisson variable the variance equals the mean; that is the whole point.
    expect(Math.abs(mean - lambda)).toBeLessThan(0.2);
    expect(Math.abs(variance - lambda)).toBeLessThan(0.35);
  });

  it('matches mean and variance for a large lambda (normal branch)', () => {
    const lambda = 400;
    const rand = mulberry32(777);
    const draw = [];
    for (let i = 0; i < 20000; i++) draw.push(poissonSample(rand, lambda));
    const { mean, variance } = stats(draw);
    expect(Math.abs(mean - lambda)).toBeLessThan(1.5);
    expect(Math.abs(variance - lambda) / lambda).toBeLessThan(0.05);
  });

  it('never returns a negative count, even for a tiny lambda', () => {
    const rand = mulberry32(3);
    for (let i = 0; i < 5000; i++) {
      expect(poissonSample(rand, 0.0001)).toBeGreaterThanOrEqual(0);
    }
    expect(poissonSample(rand, 0)).toBe(0);
    expect(poissonSample(rand, -4)).toBe(0);
  });
});
