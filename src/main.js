/**
 * Wiring.
 *
 * The page is a set of small pieces and this file is the only one that knows
 * about all of them: the engine client (a worker), the split viewer, the loupe,
 * three groups of controls, two number strips, the sensor stack, the filter
 * diagram, the error panel, and the motion.
 *
 * The state that lives here is `settings` — the single source of truth the worker
 * is told about — and `lastPick`, because a clicked pixel stays selected while the
 * settings around it change: the panel should follow the new frame, not go blank.
 */

import './style.css';

import { DEFAULT_SETTINGS, nearestColourSite } from './engine/index.js';
import { createBayerDiagram } from './view/bayerDiagram.js';
import { createCanvasPainter } from './view/canvasPainter.js';
import { createEngineClient } from './view/client.js';
import { createControls } from './view/controls.js';
import { createExplainPanel } from './view/explainPanel.js';
import { createGuessDemo } from './view/guessDemo.js';
import { createErrorHeatmap, createMethodTable } from './view/guessPanel.js';
import { createLoupe } from './view/loupe.js';
import { createMotion } from './view/motion.js';
import { createReadouts } from './view/readouts.js';
import { createSplitView } from './view/splitView.js';

/*
 * three.js is NOT imported here. It is ~600 kB of the bundle and the hook — the
 * divider, the loupe, the numbers — does not need it: two 2D canvases draw the
 * same picture. So the page starts on the canvas painter, which needs no library
 * at all, and swaps in the WebGL renderer when its chunk arrives. Same pixels,
 * same interaction, and a first paint that does not wait for a 3D engine.
 *
 * It also means the fallback path is the one everybody exercises first, which is
 * the only reliable way to keep it working.
 */

/** How long the controls must be still before the four-method comparison runs. */
const COMPARE_DELAY = 320;

/** How long a tap keeps the loupe on screen, on devices with no hover. */
const TAP_LOUPE_MS = 2600;

const byId = (id) => document.getElementById(id);

const elements = {
  viewerContainer: byId('viewer-canvas'),
  mosaicCanvas: byId('canvas-mosaic'),
  developedCanvas: byId('canvas-developed'),
  divider: byId('divider'),
  viewerStatus: byId('viewer-status'),
  loupeRoot: byId('loupe'),
  loupeCanvas: byId('loupe-canvas'),
  loupeCaption: byId('loupe-caption'),
  stackStage: byId('stack-stage'),
  stackSeparation: byId('stack-separation'),
  stackSeparationValue: byId('stack-separation-value'),
  stackCanvas: byId('stack-canvas'),
  stackReadout: byId('stack-readout'),
  captureGrid: byId('capture-grid'),
  photonsReadout: byId('photons-readout'),
  reconstructGrid: byId('reconstruct-grid'),
  labGrid: byId('lab-grid'),
  readoutsGrid: byId('readouts-grid'),
  bayerCanvas: byId('bayer-canvas'),
  bayerCaption: byId('bayer-caption'),
  patternCounts: byId('pattern-counts'),
  errorCanvas: byId('error-canvas'),
  errorCaption: byId('error-caption'),
  methodTable: byId('method-table'),
  methodNote: byId('method-note'),
  guessDemo: byId('guess-demo'),
  explainBody: byId('explain-body'),
  computeNote: byId('compute-note'),
};

/**
 * Start on the 2D canvases, then try to upgrade to the WebGL renderer.
 *
 * WebGL is better here — one quad, two textures, a shader that picks between them
 * on a single uniform, and no double blit — but it is not *needed* to show a
 * picture, so it is not on the critical path for the first paint. `?painter=canvas`
 * pins the fallback so the path that would otherwise only run on broken machines
 * can be inspected on a working one.
 */
function startWithCanvasPainter() {
  elements.viewerContainer.classList.add('is-canvas');
  return createCanvasPainter({
    container: elements.viewerContainer,
    mosaicCanvas: elements.mosaicCanvas,
    developedCanvas: elements.developedCanvas,
  });
}

/**
 * @param {object} viewer
 */
async function upgradeToWebgl(viewer) {
  if (new URLSearchParams(window.location.search).get('painter') === 'canvas') return;

  try {
    const { createThreePainter } = await import('./view/threePainter.js');
    const painter = createThreePainter({ container: elements.viewerContainer });
    elements.viewerContainer.classList.add('is-webgl');
    elements.viewerContainer.classList.remove('is-canvas');
    viewer.setPainter(painter);
    elements.viewerContainer.dataset.painter = viewer.painterKind;
  } catch (error) {
    // Keep the canvas painter. A failed WebGL context may have left a dead canvas
    // in the DOM, so clear anything the half-built renderer left behind.
    for (const stale of elements.viewerContainer.querySelectorAll('.viewer-webgl')) stale.remove();
    elements.viewerContainer.classList.add('is-canvas');
    elements.viewerContainer.classList.remove('is-webgl');
    console.warn('WebGL unavailable, keeping the 2D canvas fallback:', error.message);
  }
}

/** @type {object} */
const settings = { ...DEFAULT_SETTINGS };

/** The pixel last clicked, or null. Re-explained after every new frame. */
let lastPick = null;

const motion = createMotion();
motion.reveal([...document.querySelectorAll('[data-reveal]')]);

const loupe = createLoupe({
  root: elements.loupeRoot,
  canvas: elements.loupeCanvas,
  caption: elements.loupeCaption,
});

/** Numbers that belong to light, beside the capture controls. */
const photonsReadout = createReadouts({
  root: elements.photonsReadout,
  only: ['snr', 'electrons', 'clipped'],
});

/** Everything, in the lab. */
const readouts = createReadouts({ root: elements.readoutsGrid });

const explainPanel = createExplainPanel({ root: elements.explainBody });

const bayer = createBayerDiagram({
  canvas: elements.bayerCanvas,
  caption: elements.bayerCaption,
  counts: elements.patternCounts,
});

const heatmap = createErrorHeatmap({
  canvas: elements.errorCanvas,
  caption: elements.errorCaption,
});

const methodTable = createMethodTable({
  tbody: elements.methodTable,
  note: elements.methodNote,
});

const guessDemo = createGuessDemo({
  root: elements.guessDemo,
  onNext: () => nextGuessSite(),
});

/** Coalesce changes so a slider drag does not queue four comparisons. */
let compareTimer = 0;

/** How long the controls must be still before the scored frame is asked for. */
const SETTLE_DELAY = 240;

let settleTimer = 0;

function scheduleCompare() {
  window.clearTimeout(compareTimer);
  compareTimer = window.setTimeout(() => client.requestCompare(settings), COMPARE_DELAY);
}

/**
 * Ask for the scored frame once the controls stop moving.
 *
 * While a slider is being dragged the page publishes frames without a PSNR, a
 * colour error or an error map: those three cost about 16 ms each frame and the
 * number would be replaced before anyone read it. 240 ms after the last input the
 * same settings are recomputed *with* the scores, and the readouts fill in.
 */
function scheduleSettle() {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(() => client.requestFrame(settings), SETTLE_DELAY);
}

function onChange(patch) {
  Object.assign(settings, patch);
  syncControls();
  client.requestFrame(settings, { metrics: false });
  scheduleSettle();
  scheduleCompare();
}

const controls = [
  createControls({ root: elements.captureGrid, settings, onChange, group: 'capture' }),
  createControls({ root: elements.reconstructGrid, settings, onChange, group: 'reconstruct' }),
  createControls({ root: elements.labGrid, settings, onChange, group: 'lab' }),
];

/** Keep all three mounts showing the same settings. */
function syncControls() {
  for (const group of controls) group.sync(settings);
  // The green rule only exists inside Hamilton-Adams. Greying it out beats leaving
  // a menu that silently changes nothing.
  const rule = document.getElementById('control-greenRule');
  if (rule) {
    const uses = settings.method === 'hamiltonAdams';
    rule.disabled = !uses;
    rule.closest('.control')?.classList.toggle('is-inactive', !uses);
  }
}

const viewer = createSplitView({
  container: elements.viewerContainer,
  divider: elements.divider,
  painter: startWithCanvasPainter(),

  onPick(pixel, event) {
    lastPick = pixel;
    client.requestExplain(pixel.x, pixel.y);
    requestGuessAt(pixel.x, pixel.y);

    // A device with no hover never fires onHover, so the loupe would be
    // unreachable on a phone. A tap shows it for a moment instead.
    const frame = viewer.getFrame();
    if (!matchMedia('(hover: hover)').matches && frame) {
      loupe.show(frame, pixel.x, pixel.y, event);
      window.clearTimeout(loupeTimer);
      loupeTimer = window.setTimeout(() => loupe.hide(), TAP_LOUPE_MS);
    }
  },

  onHover(pixel, event) {
    const frame = viewer.getFrame();
    if (!pixel || !frame || !event) {
      loupe.hide();
      return;
    }
    loupe.show(frame, pixel.x, pixel.y, event);
  },
});

/** @type {number} */
let loupeTimer = 0;

// Recorded on the element itself so the renderer in use is inspectable without a
// console — useful when someone reports "it looks different on my machine".
elements.viewerContainer.dataset.painter = viewer.painterKind;

/*
 * The exploded sensor. It needs three.js and its own WebGL context, so it is
 * loaded separately and allowed to fail on its own: if it cannot start, the stage
 * says so and the rest of the page — which is the actual explanation — carries on.
 */
let stack = null;
/** Side of the patch the stack draws, in pixels. Known once its module loads. */
let patchSize = 24;
/** How far apart the layers are, 0..1. Owned by the slider, read on load. */
let spread = 1;
/** The frame currently on screen, so a late-loading stack can ask for its patch. */
let currentFrame = null;

async function loadStack() {
  try {
    const module = await import('./view/sensorStack.js');
    patchSize = module.PATCH_SIZE;
    stack = module.createSensorStack({
      canvas: elements.stackCanvas,
      readout: elements.stackReadout,
    });
    applySeparation(spread);
    // The slider position was already known before the stack existed; the patch
    // for the frame on screen may also have arrived and been dropped. Re-ask.
    if (currentFrame) {
      const centre = lastPick ?? {
        x: Math.round(currentFrame.width / 2),
        y: Math.round(currentFrame.height / 2),
      };
      client.requestPatch(centre.x, centre.y, patchSize);
    }
  } catch (error) {
    elements.stackStage.classList.add('is-unavailable');
    elements.stackReadout.textContent = `this view needs WebGL (${error.message})`;
    console.warn('sensor stack unavailable:', error.message);
  }
}

/**
 * How separated the layers are, said in the terms the legend uses: there are
 * four of them, and a person can hold "two of four" in their head in a way that
 * "0.5" never manages.
 * @param {number} value
 * @returns {string}
 */
function describeSeparation(value) {
  if (value >= 0.995) return 'fully apart';
  if (value <= 0.005) return 'stacked shut';
  return `${Math.round(value * 4)} of 4 apart`;
}

/**
 * Push a separation value to the renderer, the label and the DOM.
 * @param {number} value
 */
function applySeparation(value) {
  spread = value;
  // Recorded on the element so the separation is inspectable (and assertable)
  // without reaching into the renderer.
  elements.stackStage.dataset.spread = value.toFixed(2);
  elements.stackSeparationValue.textContent = describeSeparation(value);
  elements.stackSeparation.setAttribute('aria-valuetext', describeSeparation(value));
  stack?.setSpread(value);
}

// The stack opens on a slider, not on scroll: the page never moves underneath
// someone who is trying to look at something.
elements.stackSeparation.addEventListener('input', (event) => {
  applySeparation(Number(event.target.value));
});
applySeparation(spread);

const client = createEngineClient({
  onFrame(frame) {
    currentFrame = frame;
    viewer.setFrame(frame);
    readouts.update(frame);
    photonsReadout.update(frame);
    bayer.update(frame.coverage);
    heatmap.update(frame);

    // Numbers settle only when the scores arrive. During a drag the frame is
    // computed without metrics, so a settle on every frame would flicker; this
    // fires once per burst, on the frame that carries the real scores.
    if (frame.metrics.psnr !== null) {
      motion.settle(elements.readoutsGrid);
      motion.settle(elements.photonsReadout);
    }

    elements.computeNote.textContent =
      `computed in your browser, ${Math.round(frame.ms)} ms — ${frame.width}×${frame.height} pixels, ` +
      'nothing leaves this page';

    // The selected pixel keeps its explanation, recomputed against the frame
    // that is now on screen. Otherwise the panel would describe a stale image.
    if (lastPick) client.requestExplain(lastPick.x, lastPick.y);

    // The guess panel always teaches from a real site, even before anyone clicks:
    // an empty section would be a blank state, and this page does not open on one.
    if (guessPick) client.requestGuess(guessPick.x, guessPick.y);
    else requestGuessAt(Math.round(frame.width * 0.5), Math.round(frame.height * 0.42));

    // The stack watches the pixel under the cursor's selection if there is one,
    // otherwise the middle of the frame. Either way it is a real window of the
    // frame on screen, and it is re-cut whenever the exposure changes.
    const centre = lastPick ?? { x: Math.round(frame.width / 2), y: Math.round(frame.height / 2) };
    client.requestPatch(centre.x, centre.y, patchSize);
  },

  onPatch(patch) {
    stack?.setPatch(patch);
  },

  onCompare(rows) {
    // With the gradient test switched off the score can go UP while the picture
    // gets worse, because a fixed axis happens to suit some patterns. Saying so is
    // cheaper than being caught out by a visitor who noticed.
    const caveat = settings.greenRule === 'gradient' ? null : 'This score was made with the gradient test switched off: one axis is used everywhere, and a pattern with no single correct axis can reward that. The map shows what it costs.';
    methodTable.update(rows, settings.method, caveat);
  },

  onGuess(guess) {
    guessDemo.show(guess);
  },

  onExplain(explanation) {
    // explainPixel returns the method's own record (id, label, year, blurb),
    // not a bare id, because the panel shows the year next to the name.
    explainPanel.show(explanation, explanation.method?.label ?? explanation.method?.id ?? '');

    // The full arithmetic lives in the lab, thousands of pixels below. A reader
    // who clicks once in the hook would otherwise see the loupe and nothing else,
    // so the answer is echoed where they clicked.
    elements.viewerStatus.textContent = `${explanation.sentence} Full arithmetic in fig. 05.`;
  },

  onFailure(message) {
    elements.viewerStatus.textContent = `engine error: ${message}`;
  },
});

elements.viewerStatus.textContent =
  'drag to wipe · click a pixel to see what the algorithm did there';

/** The site the guess panel is teaching from, or null before the first frame. */
let guessPick = null;

/**
 * Ask the panel about the nearest site that actually had to invent its green.
 *
 * A green site measured the thing the panel is about, so clicking one is turned
 * into its nearest red or blue neighbour instead of showing an empty lesson.
 *
 * @param {number} x @param {number} y
 */
function requestGuessAt(x, y) {
  const frame = viewer.getFrame();
  if (!frame) return;
  const site = nearestColourSite(frame.mask, frame.width, frame.height, x, y);
  guessPick = site;
  client.requestGuess(site.x, site.y);
}

/** Walk along the row to the next comparable site. */
function nextGuessSite() {
  const frame = viewer.getFrame();
  if (!frame) return;
  if (!guessPick) {
    requestGuessAt(Math.round(frame.width / 2), Math.round(frame.height / 2));
    return;
  }
  // An even step keeps the filter colour the same, so the reader is comparing
  // like with like; wrapping at the edge stops the button sticking at a border.
  requestGuessAt((guessPick.x + 16) % frame.width, guessPick.y);
}

// First frame. No blank state: the page opens on a real image.
client.requestFrame(settings);
scheduleCompare();
syncControls();

// Then the two three.js consumers, in the background. Both are enhancements: the
// page is already interactive and already correct without them.
upgradeToWebgl(viewer);
loadStack();

// Exposed for the screenshot harness and for anyone reading the page source:
// the settings that produced the frame currently on screen.
if (import.meta.env.DEV) {
  window.__mosaic = { settings, client, viewer, motion };
}
