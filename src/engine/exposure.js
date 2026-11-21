/**
 * Exposure: radiance -> electrons -> digital numbers.
 *
 * This is where the "few photons" part of the story lives.
 *
 * The chain, in physical order:
 *   1. Light falls on a photosite for `shutterSeconds`. The expected number of
 *      electrons is proportional to radiance * time / f-number^2.
 *   2. The photons that actually arrive are a Poisson draw around that mean.
 *      Variance equals the mean, so a dark pixel cannot be dark and clean.
 *   3. The well can only hold so much charge; anything beyond that is lost.
 *   4. Reading the well adds a fixed amount of electronic noise, independent of
 *      how much signal is there. In the shadows this noise is bigger than the
 *      signal itself.
 *   5. The ISO setting multiplies the whole thing -- signal AND noise -- before
 *      the analogue-to-digital converter rounds it to an integer.
 *
 * Point 5 is the lesson the UI has to make visible: turning ISO up does not let
 * in more light, it just turns up the volume on a signal that is already there,
 * and the read noise comes up with it.
 *
 * Simplifications, stated honestly: quantum efficiency is folded into
 * `photonScale` (we assume one photon gives one electron), the well is treated as
 * a hard ceiling rather than a soft knee, and the ADC is ideal apart from
 * quantisation. None of these change the lesson.
 */

import { mulberry32, nextGaussian, poissonSample } from './prng.js';

/**
 * Sensor constants. These are the numbers the whole explainer turns around, so
 * they are named and documented rather than sprinkled through the code.
 */
export const SENSOR = {
  /** Charge a photosite can hold before it saturates, in electrons. */
  fullWellElectrons: 4000,
  /** Read-noise sigma, in electrons. Sets the noise floor in the shadows. */
  readNoiseElectrons: 3,
  /** Analogue-to-digital converter width. */
  adcBits: 12,
  /** Largest code a 12-bit converter can emit. */
  adcMax: 4095,
  /**
   * Photons per unit radiance, per second, at f/1, at light level 1.
   *
   * Calibrated so a mid-grey patch (linear radiance 0.18) at light 0.5, 1/60 s,
   * f/2.8 collects about 800 electrons -- a realistic number for a small sensor
   * and a number small enough that shot noise is visible.
   */
  photonScale: 4.2e6,
};

/** ISO 100 is unity gain; ISO 400 is 4x. @param {number} iso @returns {number} */
export function isoGain(iso) {
  return iso / 100;
}

/**
 * Electrons per unit radiance for these camera settings.
 *
 * The physics: photon flux through the aperture falls with the square of the
 * f-number (the aperture area), and total light is flux times time (the
 * shutter). Radiance times this gain is the expected electron count.
 *
 * @param {{lightLevel: number, shutterSeconds: number, fNumber: number}} settings
 * @returns {number} expected electrons for radiance 1 */
export function exposureGain(settings) {
  const { lightLevel, shutterSeconds, fNumber } = settings;
  if (!(fNumber > 0)) throw new Error('exposureGain: fNumber must be greater than 0');
  const safeTime = Math.max(0, shutterSeconds);
  const safeLight = Math.max(0, lightLevel);
  return (SENSOR.photonScale * safeLight * safeTime) / (fNumber * fNumber);
}

/**
 * Expected electrons for a given radiance.
 * @param {number} radiance linear radiance @param {number} gain from exposureGain
 * @returns {number} */
export function expectedElectrons(radiance, gain) {
  return Math.max(0, radiance) * gain;
}

/**
 * Signal-to-noise ratio of a photosite, as a ratio.
 *
 * Shot noise has variance equal to the signal, so its standard deviation is
 * sqrt(signal). Read noise adds its variance on top: total noise is
 * sqrt(signal + sigma_read^2). Hence SNR = signal / sqrt(signal + sigma^2).
 *
 * Note what this does NOT contain: ISO. Gain is applied after the well is read,
 * so it scales signal and noise by the same factor and the ratio is unchanged
 * at the point of capture (before quantisation). That is the honest answer to
 * "does a higher ISO make my photo noisier?" -- no, it makes it darker, and then
 * you brighten it, which also brightens the noise.
 *
 * @param {number} signalElectrons expected or measured electrons
 * @returns {number} dimensionless ratio */
export function snr(signalElectrons) {
  if (signalElectrons <= 0) return 0;
  const sigma = SENSOR.readNoiseElectrons;
  return signalElectrons / Math.sqrt(signalElectrons + sigma * sigma);
}

/**
 * The same ratio in decibels (20*log10, because it is an amplitude ratio).
 * @param {number} signalElectrons @returns {number} dB, or -Infinity for zero signal */
export function snrDb(signalElectrons) {
  const ratio = snr(signalElectrons);
  return ratio > 0 ? 20 * Math.log10(ratio) : -Infinity;
}

/**
 * Run the sensor over a whole image.
 *
 * @param {Float32Array} linear interleaved linear RGB radiance
 * @param {number} width @param {number} height
 * @param {{lightLevel?: number, shutterSeconds?: number, fNumber?: number, iso?: number, seed?: number}} settings
 * @returns {{
 *   dn: Float32Array,          // quantised ADC codes, kept as float for later maths
 *   signal: Float32Array,      // DN before quantisation (useful for tests, and to show quantisation itself)
 *   electrons: Float32Array,   // electrons actually collected, after shot noise and well clipping
 *   gain: number,              // electrons per unit radiance
 *   isoGain: number,           // the multiplier applied after readout
 *   clippedFraction: number,   // share of samples that hit the well ceiling
 *   meanElectrons: number      // average collected charge, for the readout
 * }} */
export function expose(linear, width, height, settings = {}) {
  const lightLevel = settings.lightLevel ?? 1;
  const shutterSeconds = settings.shutterSeconds ?? 1 / 60;
  const fNumber = settings.fNumber ?? 2.8;
  const iso = settings.iso ?? 400;
  const seed = settings.seed ?? 1;

  const gain = exposureGain({ lightLevel, shutterSeconds, fNumber });
  const gainFromIso = isoGain(iso);
  const rand = mulberry32(seed);

  const n = width * height * 3;
  const dn = new Float32Array(n);
  const signal = new Float32Array(n);
  const electrons = new Float32Array(n);
  let clipped = 0;
  let electronSum = 0;

  for (let i = 0; i < n; i++) {
    const lambda = expectedElectrons(linear[i], gain);

    // Photon arrival is a counting process: the number that lands is Poisson.
    let collected = poissonSample(rand, lambda);

    // The well is a hard ceiling. Anything above it simply is not stored, which
    // is why bright highlights turn into flat white patches.
    if (collected > SENSOR.fullWellElectrons) {
      collected = SENSOR.fullWellElectrons;
      clipped++;
    }
    electrons[i] = collected;
    electronSum += collected;

    // Read noise is added in electrons, before gain, because it is generated in
    // the analogue circuit. This ordering is what makes higher ISO amplify it.
    const noisy = collected + nextGaussian(rand) * SENSOR.readNoiseElectrons;

    // ISO is applied after collection: it scales signal and noise together.
    const floated = noisy * gainFromIso;
    signal[i] = floated;

    // Quantise. Values below zero are impossible after rounding up from -0.4, so
    // they are clamped, as is anything the converter cannot represent.
    const code = Math.round(floated);
    dn[i] = code < 0 ? 0 : code > SENSOR.adcMax ? SENSOR.adcMax : code;
  }

  return {
    dn,
    signal,
    electrons,
    gain,
    isoGain: gainFromIso,
    clippedFraction: clipped / (n || 1),
    meanElectrons: electronSum / (n || 1),
  };
}
