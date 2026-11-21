/**
 * Deterministic randomness.
 *
 * Every noisy stage takes a seeded generator. That gives three things the
 * explainer needs: a fixed seed reproduces a frame exactly (so the tests can
 * assert on noise), dragging a slider back to its old value restores the same
 * image instead of a slightly different one, and the "why did this pixel look
 * like that" panel can be re-derived later.
 *
 * This is not a cryptographic generator and is never used for anything security
 * related; it only has to look like sensor noise and be reproducible.
 */

/**
 * mulberry32: 32-bit state PRNG, uniform in [0, 1).
 * @param {number} seed @returns {() => number} */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One standard-normal sample, Box-Muller.
 *
 * Box-Muller produces two values per pair of uniforms; this returns only one and
 * throws the other away. That costs a little speed but keeps the generator
 * stateless, so call order (and therefore reproducibility) is trivial to reason
 * about -- which matters more here than the wasted sample.
 *
 * @param {() => number} rand @returns {number} */
export function nextGaussian(rand) {
  // u1 must be > 0 because of the log; 2^-32 is the smallest non-zero output of
  // mulberry32, so this only guards against a zero draw.
  const u1 = Math.max(1 / 4294967296, rand());
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Poisson sample: how many photons actually landed.
 *
 * Photon arrival is a counting process, so the number of photons a photosite
 * collects in a fixed exposure time is Poisson-distributed with mean equal to
 * the expected number. Its variance equals its mean -- that is the whole reason
 * dark areas look grainy: the noise is the signal.
 *
 * Two regimes:
 *  - Knuth's method for small lambda: multiply uniforms until the product falls
 *    below exp(-lambda); the count is the number of factors. Exact, O(lambda).
 *  - Normal approximation for lambda >= 30: a Poisson variable with large mean is
 *    very close to N(lambda, lambda). Rounding and clamping at 0 keeps counts
 *    non-negative. Exact methods (transformed rejection) would be overkill for a
 *    visual explainer and would make the code harder to defend.
 *
 * @param {() => number} rand @param {number} lambda expected count @returns {number} */
export function poissonSample(rand, lambda) {
  if (!(lambda > 0)) return 0;
  if (lambda < 30) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k += 1;
      p *= rand();
    } while (p > limit);
    return k - 1;
  }
  const gaussian = nextGaussian(rand);
  const count = Math.round(lambda + Math.sqrt(lambda) * gaussian);
  return count > 0 ? count : 0;
}
