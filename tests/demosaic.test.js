import { describe, expect, it } from 'vitest';
import { bayerMosaic, GREEN, channelForPixel } from '../src/engine/cfa.js';
import { demosaicWith, explainWith, METHOD_IDS } from '../src/engine/demosaic/index.js';
import {
  RB_BB_BR_RR,
  RG_RB_BG_BR,
  RG_TRANSPOSED,
  GR_GB,
} from '../src/engine/demosaic/malvarHeCutler.js';
import { greenAtColourSite } from '../src/engine/demosaic/hamiltonAdams.js';

/** Build a linear RGB image from a per-pixel function. */
function buildScene(width, height, fn) {
  const rgb = new Float32Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    }
  }
  return rgb;
}

/** Run a mosaic through a method, returning both the image and the detail object. */
function run(method, scene, width, height) {
  const { mosaic, mask } = bayerMosaic(scene, width, height);
  const { rgb, detail } = demosaicWith(method, mosaic, mask, width, height);
  return { rgb, detail, mosaic, mask };
}

describe('kernel transcription', () => {
  it('gives every Malvar-He-Cutler kernel a sum of exactly 8', () => {
    // The paper states the filters scaled by 8; a sum of 8 is what makes them
    // preserve a flat field. This catches a mistyped coefficient immediately.
    for (const [name, kernel] of [
      ['GR_GB', GR_GB],
      ['RG_RB_BG_BR', RG_RB_BG_BR],
      ['RB_BB_BR_RR', RB_BB_BR_RR],
    ]) {
      const sum = kernel.reduce((a, b) => a + b, 0);
      expect(sum, `${name} should sum to 8, got ${sum}`).toBeCloseTo(8, 10);
      expect(kernel.length).toBe(25);
    }
  });

  it('has the documented shape where it is meant to be non-zero', () => {
    // Centre tap of the green filter is 4, its four orthogonal neighbours are 2.
    expect(GR_GB[2 * 5 + 2]).toBe(4);
    expect(GR_GB[2 * 5 + 1]).toBe(2);
    expect(GR_GB[1 * 5 + 2]).toBe(2);
    // The red-at-green filter has 5 at the centre and 4 either side.
    expect(RG_RB_BG_BR[2 * 5 + 2]).toBe(5);
    expect(RG_RB_BG_BR[2 * 5 + 1]).toBe(4);
    // The red-at-blue filter has 6 at the centre and 2 on the diagonals.
    expect(RB_BB_BR_RR[2 * 5 + 2]).toBe(6);
    expect(RB_BB_BR_RR[1 * 5 + 1]).toBe(2);
  });

  it('transposes the Rg filter correctly', () => {
    expect(RG_TRANSPOSED[0 * 5 + 2]).toBe(RG_RB_BG_BR[2 * 5 + 0]);
    expect(RG_TRANSPOSED[2 * 5 + 0]).toBe(RG_RB_BG_BR[0 * 5 + 2]);
    // Transposing twice is the identity.
    expect(RG_TRANSPOSED.reduce((a, b) => a + b, 0)).toBeCloseTo(8, 10);
  });
});

describe('flat field', () => {
  it('is reproduced exactly by every method', () => {
    const width = 16;
    const height = 12;
    const value = 0.5;
    const scene = buildScene(width, height, () => [value, value, value]);
    for (const method of METHOD_IDS) {
      const { rgb } = run(method, scene, width, height);
      for (let i = 0; i < rgb.length; i++) {
        // Float32 storage means we compare to float32 precision, not exact bits.
        expect(Math.abs(rgb[i] - value), `${method} at index ${i}`).toBeLessThan(1e-6);
      }
    }
  });
});

describe('linear ramp', () => {
  it('is reproduced by bilinear in the interior', () => {
    const width = 24;
    const height = 16;
    const ramp = (x) => 0.1 + (0.8 * x) / (width - 1);
    const scene = buildScene(width, height, (x) => {
      const v = ramp(x);
      return [v, v, v];
    });
    const { rgb } = run('bilinear', scene, width, height);
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const expected = ramp(x);
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(rgb[(y * width + x) * 3 + c] - expected)).toBeLessThan(1e-4);
        }
      }
    }
  });
});

describe('Hamilton-Adams direction choice', () => {
  it('interpolates green vertically across a vertical edge', () => {
    // A vertical edge means the image changes fast in x and not in y, so dH must
    // be the larger gradient and the code must pick the vertical direction.
    const width = 20;
    const height = 16;
    const scene = buildScene(width, height, (x) => {
      const v = x < 10 ? 0.1 : 0.9;
      return [v, v, v];
    });
    const { mosaic } = bayerMosaic(scene, width, height);
    // A green site next to the edge, in a red row.
    const step = greenAtColourSite(mosaic, width, height, 9, 8);
    expect(channelForPixel(9, 8)).toBe(GREEN);
    expect(step.dH).toBeGreaterThan(step.dV);
    expect(step.direction).toBe('vertical');
  });

  it('interpolates green horizontally across a horizontal edge', () => {
    const width = 20;
    const height = 16;
    const scene = buildScene(width, height, (x, y) => {
      const v = y < 8 ? 0.1 : 0.9;
      return [v, v, v];
    });
    const { mosaic } = bayerMosaic(scene, width, height);
    const step = greenAtColourSite(mosaic, width, height, 9, 8);
    expect(step.dV).toBeGreaterThan(step.dH);
    expect(step.direction).toBe('horizontal');
  });
});

describe('explanation agrees with the reconstruction', () => {
  // This is the test that stops the explanation panel from describing an
  // algorithm the code no longer runs. If the maths changes and the panel does
  // not, this fails.
  const width = 18;
  const height = 14;
  const scene = buildScene(width, height, (x, y) => [0.2 + x * 0.02, 0.4 + y * 0.01, 0.6 - x * 0.01]);

  for (const method of METHOD_IDS) {
    it(`reports the same values as ${method} produced`, () => {
      const { rgb, detail, mosaic, mask } = run(method, scene, width, height);
      for (const [x, y] of [
        [0, 0],
        [5, 5],
        [8, 7],
        [17, 13],
        [1, 12],
      ]) {
        const explanation = explainWith(method, mosaic, mask, width, height, x, y, detail);
        const i = (y * width + x) * 3;
        for (const channel of explanation.channels) {
          expect(
            Math.abs(channel.value - rgb[i + channel.channel]),
            `${method} channel ${channel.channel} at (${x},${y})`,
          ).toBeLessThan(1e-4);
        }
        // The channel the pixel measured must be reported as measured, and its
        // value must be the mosaic value.
        const measured = explanation.channels.filter((c) => c.measured);
        expect(measured.length).toBe(1);
        expect(measured[0].channel).toBe(mask[y * width + x]);
        expect(measured[0].value).toBeCloseTo(mosaic[y * width + x], 5);
      }
    });
  }

  it('labels all three channels in every method', () => {
    const { detail, mosaic, mask } = run('hamiltonAdams', scene, width, height);
    for (const method of METHOD_IDS) {
      const explanation = explainWith(method, mosaic, mask, width, height, 3, 3, detail);
      expect(explanation.channels.map((c) => c.channel).sort()).toEqual([0, 1, 2]);
    }
  });
});

describe('method interface', () => {
  it('rejects an unknown method', () => {
    const scene = buildScene(4, 4, () => [0.5, 0.5, 0.5]);
    const { mosaic, mask } = bayerMosaic(scene, 4, 4);
    expect(() => demosaicWith('magic', mosaic, mask, 4, 4)).toThrow(/Unknown demosaic method/);
  });

  it('needs the green plane to explain Hamilton-Adams', () => {
    const scene = buildScene(4, 4, () => [0.5, 0.5, 0.5]);
    const { mosaic, mask } = bayerMosaic(scene, 4, 4);
    expect(() => explainWith('hamiltonAdams', mosaic, mask, 4, 4, 1, 1, null)).toThrow(/green plane/);
  });
});
