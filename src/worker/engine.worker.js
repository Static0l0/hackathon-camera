/**
 * The engine worker.
 *
 * Why a worker at all: one 384x216 frame costs 130-180 ms of honest arithmetic.
 * On the main thread that is a visibly frozen slider; in a worker it is a
 * delayed frame, and the page stays responsive while it computes.
 *
 * The worker owns the last computed frame. That matters for the explanation
 * panel: reconstructing one pixel needs the same mosaic, mask and intermediate
 * green plane the reconstruction used, so the worker answers from the frame it
 * just produced instead of recomputing anything. If the UI ever asks about a
 * frame it is no longer looking at, the answer would be a lie — so the worker
 * answers about `lastFrame` only, and the UI only asks about what is on screen.
 *
 * Message in:  { type: 'frame', id, settings }
 *              { type: 'explain', id, x, y }
 *              { type: 'patch', id, x, y, size }
 *              { type: 'compare', id, settings }
 * Message out: { type: 'frame', id, frame }       (buffers transferred, not copied)
 *              { type: 'explain', id, explanation }
 *              { type: 'patch', id, patch }       (buffers transferred, not copied)
 *              { type: 'compare', id, rows }
 *              { type: 'failed', id, message }
 */

import {
  BLUE,
  CHANNEL_NAMES,
  GREEN,
  RED,
  SENSOR,
  channelForPixel,
  compareMethods,
  expectedElectrons,
  explainPixel,
  exposureGain,
  guessSite,
  linearToSrgb,
  runPipeline,
  snrDb,
  toRgbaBytes,
} from '../engine/index.js';

/**
 * How much of a pixel's colour comes from the filter it did *not* have.
 *
 * A raw mosaic shown as plain grey loses the one fact that matters — that each
 * pixel kept a single colour. Tinting each pixel toward its own filter makes the
 * RGGB checkerboard visible at a glance. It is still one number per pixel: the
 * tint says which filter, the brightness says the value.
 */
const TINT_SELF = 1;
const TINT_OTHER = 0.22;

/** Last computed frame, kept so `explain` can answer about exactly what is shown. */
let lastFrame = null;

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'frame') {
    handleFrame(message);
  } else if (message.type === 'explain') {
    handleExplain(message);
  } else if (message.type === 'guess') {
    handleGuess(message);
  } else if (message.type === 'patch') {
    handlePatch(message);
  } else if (message.type === 'compare') {
    handleCompare(message);
  }
});

/**
 * Score all four demosaic methods on the current settings.
 *
 * Separate message because it costs one capture plus four reconstructions: it is
 * far too expensive to run on every slider move, but cheap enough to run once
 * the controls settle. The UI asks for it on a delay, not per frame.
 *
 * @param {{id: number, settings: object}} message
 */
function handleCompare({ id, settings }) {
  try {
    const rows = compareMethods(settings);
    postMessage({ type: 'compare', id, rows });
  } catch (error) {
    postMessage({ type: 'failed', id, message: describeError(error) });
  }
}

/**
 * Compute one frame and hand back everything the view needs, already encoded.
 *
 * @param {{id: number, settings: object, metrics?: boolean}} message
 *   `metrics: false` is the dragging case: the picture is what the visitor is
 *   watching, and the score for it will be replaced in a few milliseconds, so the
 *   frame is published without a PSNR or an error map. The next settled request
 *   asks for them.
 */
function handleFrame({ id, settings, metrics = true }) {
  try {
    const started = performance.now();
    const result = runPipeline(settings, { metrics });
    const elapsed = performance.now() - started;

    lastFrame = result;

    const { width, height, mosaic, mask } = result;
    const display = toRgbaBytes(result.display.srgb, width, height);
    const mosaicView = encodeMosaic(mosaic, mask, width, height);
    const dn = toDn(mosaic);
    const maskCopy = new Uint8Array(mask);

    const frame = {
      width,
      height,
      settings: result.settings,
      display,
      mosaicView,
      dn,
      mask: maskCopy,
      coverage: result.coverage,
      // Exposure numbers are always available; only the two scores go null when
      // scoring was skipped for a dragging frame.
      metrics: summarise(result),
      // Per-pixel error against the reference, in 8-bit units. Transferred rather
      // than copied: it is one float per pixel and the view draws it immediately.
      errorMap: result.metrics ? result.metrics.errorMap : null,
      errorMax: result.metrics ? result.metrics.errorMax : 0,
      timings: result.timings,
      ms: elapsed,
    };

    const transfer = [display.buffer, mosaicView.buffer, dn.buffer, maskCopy.buffer];
    if (frame.errorMap) transfer.push(frame.errorMap.buffer);
    postMessage({ type: 'frame', id, frame }, transfer);
  } catch (error) {
    postMessage({ type: 'failed', id, message: describeError(error) });
  }
}

/**
 * Answer "what did the algorithm do at this pixel" from the frame on screen.
 *
 * @param {{id: number, x: number, y: number}} message
 */
function handleExplain({ id, x, y }) {
  if (!lastFrame) {
    postMessage({ type: 'failed', id, message: 'explain asked before any frame' });
    return;
  }

  try {
    const explanation = explainPixel({
      mosaic: lastFrame.mosaic,
      mask: lastFrame.mask,
      width: lastFrame.width,
      height: lastFrame.height,
      x,
      y,
      method: lastFrame.settings.method,
      detail: lastFrame.demosaic.detail,
    });
    postMessage({ type: 'explain', id, explanation });
  } catch (error) {
    postMessage({ type: 'failed', id, message: describeError(error) });
  }
}

/**
 * One missing green, with the numbers that went into it and the value it should
 * have been. Answered from the frame on screen, so the panel cannot describe a
 * picture the visitor is no longer looking at.
 *
 * @param {{id: number, x: number, y: number}} message
 */
function handleGuess({ id, x, y }) {
  if (!lastFrame) {
    postMessage({ type: 'failed', id, message: 'guess asked before any frame' });
    return;
  }

  try {
    const guess = guessSite({
      mosaic: lastFrame.mosaic,
      mask: lastFrame.mask,
      width: lastFrame.width,
      height: lastFrame.height,
      reference: lastFrame.reference.linear,
      x,
      y,
    });
    postMessage({ type: 'guess', id, guess });
  } catch (error) {
    postMessage({ type: 'failed', id, message: describeError(error) });
  }
}

/**
 * A small square of the frame, as the number of electrons each pixel actually
 * collected through its own filter.
 *
 * This exists so the exploded-sensor view can draw one dot per photon without
 * inventing photons. The numbers come from `exposure.electrons` — the same
 * Poisson draws the image was built from — so if the light slider halves the
 * light, the dots really do halve.
 *
 * @param {{id: number, x: number, y: number, size: number}} message
 */
function handlePatch({ id, x, y, size }) {
  if (!lastFrame) {
    postMessage({ type: 'failed', id, message: 'patch asked before any frame' });
    return;
  }

  try {
    const patch = slicePatch(lastFrame, x, y, size);
    postMessage({ type: 'patch', id, patch }, [patch.electrons.buffer, patch.mask.buffer]);
  } catch (error) {
    postMessage({ type: 'failed', id, message: describeError(error) });
  }
}

/**
 * Cut a `size` × `size` window out of the last frame, centred on (x, y) and
 * clamped so it never hangs off the edge.
 *
 * Each site contributes the electron count of the channel its filter passed —
 * not the average of three, because the sensor did not measure an average.
 *
 * @param {object} frame a runPipeline result
 * @param {number} x @param {number} y centre, in pixels
 * @param {number} size side length, in pixels
 * @returns {{x: number, y: number, size: number, electrons: Float32Array, mask: Uint8Array}}
 */
export function slicePatch(frame, x, y, size) {
  const { width, height } = frame;
  const side = Math.max(1, Math.min(size, width, height));

  const originX = Math.min(Math.max(Math.round(x - side / 2), 0), width - side);
  const originY = Math.min(Math.max(Math.round(y - side / 2), 0), height - side);

  const electrons = new Float32Array(side * side);
  const mask = new Uint8Array(side * side);

  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const px = originX + column;
      const py = originY + row;
      const channel = channelForPixel(px, py);
      electrons[row * side + column] = frame.exposure.electrons[(py * width + px) * 3 + channel];
      mask[row * side + column] = channel;
    }
  }

  return { x: originX, y: originY, size: side, electrons, mask };
}

/**
 * The raw mosaic as pixels: one channel of data per pixel, tinted by its filter.
 *
 * The value is gamma-encoded before display because it is linear light, and a
 * linearly-displayed sensor readout looks far darker than the photograph it
 * becomes — which would wrongly suggest the sensor is the problem. The sensor's
 * problem is that it only kept one colour, and the tint is what shows that.
 *
 * @param {Float32Array} mosaic one channel value per pixel, in DN
 * @param {Uint8Array} mask which colour each pixel kept
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} RGBA bytes
 */
export function encodeMosaic(mosaic, mask, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0, j = 0; i < mosaic.length; i += 1, j += 4) {
    // DN back to a 0..1 display value, then through the display curve.
    const value = linearToSrgb(mosaic[i] / SENSOR.adcMax);
    const channel = mask[i];

    rgba[j] = value * (channel === RED ? TINT_SELF : TINT_OTHER) * 255;
    rgba[j + 1] = value * (channel === GREEN ? TINT_SELF : TINT_OTHER) * 255;
    rgba[j + 2] = value * (channel === BLUE ? TINT_SELF : TINT_OTHER) * 255;
    rgba[j + 3] = 255;
  }

  return rgba;
}

/**
 * DN as whole numbers in 16 bits: 0..4095 fits, and the loupe only needs the
 * integer the ADC produced. Halves the bytes moved per frame versus Float32.
 *
 * @param {Float32Array} mosaic
 * @returns {Uint16Array}
 */
export function toDn(mosaic) {
  const dn = new Uint16Array(mosaic.length);
  for (let i = 0; i < mosaic.length; i += 1) dn[i] = mosaic[i];
  return dn;
}

/**
 * The numbers the readouts show, collected in one place so the view never has to
 * know the shape of the pipeline result.
 *
 * `midGreySnrDb` is computed from the exposure settings rather than measured
 * from the pixels, so it stays stable while noise is reseeded: it answers "how
 * good is one 18% grey patch at these settings", which is the number a
 * photographer would quote.
 *
 * @param {object} result a runPipeline result
 * @returns {object}
 */
export function summarise(result) {
  const { metrics, exposure, settings } = result;
  const gain = exposureGain(settings);
  const midGreyElectrons = expectedElectrons(0.18, gain);

  return {
    // Null while a slider is moving: scoring was skipped for that frame, and a
    // stale PSNR shown as if it were current would be a lie. The readout prints
    // a dash and the settled frame fills it in.
    psnr: metrics ? metrics.psnr : null,
    chromaError: metrics ? metrics.chromaError : null,
    meanAbs: metrics ? metrics.meanAbs : null,
    maxAbs: metrics ? metrics.maxAbs : null,
    clippedFraction: exposure.clippedFraction,
    meanElectrons: exposure.meanElectrons,
    midGreyElectrons,
    midGreySnrDb: snrDb(midGreyElectrons),
    redGain: result.whiteBalance.gains[0],
    greenGain: result.whiteBalance.gains[1],
    blueGain: result.whiteBalance.gains[2],
    channelNames: CHANNEL_NAMES,
  };
}

/**
 * Errors inside a worker do not reach the console with a stack the user can see,
 * so they are sent back as strings and shown in the status line.
 *
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
