/**
 * Public entry point for the engine.
 *
 * Nothing in src/engine may import three.js or touch the DOM, and this file is the
 * only thing src/view and src/worker should import. That rule is what lets the
 * whole simulation run under Vitest in Node, and it is what makes the claim "the
 * maths is mine, three.js only draws it" checkable by reading one import graph.
 */

export { clamp, clamp01, lerp, mirrorIndex, createRgb, pixelIndex, copyRgb } from './util.js';
export { mulberry32, nextGaussian, poissonSample } from './prng.js';
export {
  SCENE_NAMES,
  SCENE_INFO,
  srgbToLinear,
  linearToSrgb,
  imageDataToLinear,
  makeScene,
} from './scene.js';
export {
  RED,
  GREEN,
  BLUE,
  CHANNEL_NAMES,
  channelForPixel,
  gaussianKernel,
  opticalLowPass,
  bayerMosaic,
  mosaicCoverage,
} from './cfa.js';
export {
  SENSOR,
  isoGain,
  exposureGain,
  expectedElectrons,
  snr,
  snrDb,
  expose,
} from './exposure.js';
export { DEMOSAIC_METHODS, METHOD_IDS, methodInfo, demosaicWith, explainWith } from './demosaic/index.js';
export { DEMOSAIC_METHODS as METHODS } from './demosaic/index.js';
export { GR_GB, RG_RB_BG_BR, RB_BB_BR_RR } from './demosaic/malvarHeCutler.js';
export {
  UNIT_GAINS,
  estimateWhiteBalance,
  applyWhiteBalance,
  toSrgb,
  toRgbaBytes,
  develop,
} from './develop.js';
export { psnr, errorMap, errorStats, ARTIFACT_NOTES } from './metrics.js';
export { EXPLAIN_RADIUS, neighbourhood, buildSentence, explainPixel } from './explain.js';
export { guessSite, nearestColourSite } from './guess.js';
export {
  DEFAULT_SETTINGS,
  MAX_WORKING_SIZE,
  captureFrame,
  runPipeline,
  compareMethods,
} from './pipeline.js';
