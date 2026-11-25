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
import { createSound } from './audio.js';

import { DEFAULT_SETTINGS, nearestColourSite } from './engine/index.js';
import { createBayerDiagram } from './view/bayerDiagram.js';
import { createCanvasPainter } from './view/canvasPainter.js';
import { createEngineClient } from './view/client.js';
import { createControls } from './view/controls.js';
import { readColour } from './view/cssColor.js';
import { createThemeToggle, currentTheme } from './view/theme.js';
import { createExplainPanel } from './view/explainPanel.js';
import { createGuessDemo } from './view/guessDemo.js';
import { createErrorHeatmap, createMethodTable } from './view/guessPanel.js';
import { createLoupe } from './view/loupe.js';
import { createMotion } from './view/motion.js';
import { createPrintStudio } from './view/printStudio.js';
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
  tray: byId('tray'),
  trayGrid: byId('tray-grid'),
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
  printCanvas: byId('print-canvas'),
  printGrid: byId('treatment-grid'),
  printNote: byId('treatment-note'),
  printStatus: byId('print-status'),
  printExpose: byId('print-expose'),
  printRetake: byId('print-retake'),
  printFrame: byId('print-frame'),
  printTag: byId('print-tag'),
  errorNote: byId('error-note'),
  themeToggle: byId('theme-toggle'),
  topPsnr: byId('top-psnr'),
  topSnr: byId('top-snr'),
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
    // The plate colour, not a hardcoded night: the page can be paper or graphite.
    const [nr, ng, nb] = readColour('--night', [23, 21, 15]);
    const painter = createThreePainter({
      container: elements.viewerContainer,
      groundColour: (nr << 16) | (ng << 8) | nb,
    });
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

/**
 * Shareable state: settings are written to the URL hash so a judge or a friend
 * can reload the page and see the exact same frame. Keys match DEFAULT_SETTINGS.
 * Only values that differ from the default are written, keeping the hash short.
 */

const SETTING_KEYS = [
  'sceneName', 'lightLevel', 'shutterSeconds', 'fNumber', 'iso', 'seed',
  'olpfSigma', 'method', 'greenRule', 'whiteBalance',
];

function readSettingsFromHash() {
  const match = window.location.hash.match(/^#?\?(.*)$/);
  if (!match) return {};
  const params = new URLSearchParams(match[1]);
  const out = {};
  for (const key of SETTING_KEYS) {
    const value = params.get(key);
    if (value === null) continue;
    const defaultValue = DEFAULT_SETTINGS[key];
    if (typeof defaultValue === 'number') out[key] = Number(value);
    else if (typeof defaultValue === 'boolean') out[key] = value === '1';
    else out[key] = value;
  }
  return out;
}

function writeSettingsToHash(next) {
  const params = new URLSearchParams();
  let wrote = false;
  for (const key of SETTING_KEYS) {
    const value = next[key];
    const defaultValue = DEFAULT_SETTINGS[key];
    if (value === defaultValue) continue;
    params.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    wrote = true;
  }
  if (wrote) window.location.hash = `?${params.toString()}`;
  else window.location.hash = '';
}

/** @type {object} */
const settings = { ...DEFAULT_SETTINGS, ...readSettingsFromHash() };

/** Debounce timer for hash writes — settings change while sliders drag. */
let hashTimer = 0;
function syncHash() {
  window.clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => writeSettingsToHash(settings), 300);
}

/** The loading overlay, shown until the first frame paints. */
const loading = document.getElementById('loading');

/** The metrics live region, for screen-reader announcements. */
const metricsLive = document.getElementById('metrics-live')
  ?? (() => {
    const el = document.createElement('div');
    el.id = 'metrics-live';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
    return el;
  })();

/** The pixel last clicked, or null. Re-explained after every new frame. */
let lastPick = null;

/** The first frame has not painted yet — used for the shutter sound. */
let firstFrame = true;

const motion = createMotion();
motion.reveal([...document.querySelectorAll('[data-reveal]')]);

const sound = createSound();
const soundToggle = document.getElementById('sound-toggle');
if (soundToggle) {
  soundToggle.textContent = sound.isEnabled() ? 'Sound on' : 'Sound off';
  soundToggle.setAttribute('aria-pressed', sound.isEnabled());
  soundToggle.addEventListener('click', () => {
    sound.toggle();
    soundToggle.textContent = sound.isEnabled() ? 'Sound on' : 'Sound off';
    soundToggle.setAttribute('aria-pressed', sound.isEnabled());
    if (sound.isEnabled()) sound.play('tap');
  });
}

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

/** The four numbers the lab records: quality, colour, how the frame was split, and time. */
const readouts = createReadouts({
  root: elements.readoutsGrid,
  only: ['psnr', 'chroma', 'split', 'frame'],
});

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

/**
 * The error map prints ink on paper in the light theme and light on card in the
 * dark one, so the sentence under it has to say which direction is "more wrong".
 * A claim about the picture cannot live only in the stylesheet.
 *
 * @param {'light' | 'dark'} theme
 */
function describeErrorScale(theme) {
  if (!elements.errorNote) return;
  const pole = theme === 'dark' ? 'Brighter' : 'Darker';
  elements.errorNote.textContent =
    `${pole} areas are larger errors. Choose the zone plate scene to see where the methods disagree most.`;
}

const methodTable = createMethodTable({
  tbody: elements.methodTable,
  note: elements.methodNote,
});

const guessDemo = createGuessDemo({
  root: elements.guessDemo,
  onNext: () => nextGuessSite(),
});

/** The print studio: expose a frame and choose how to print it. */
const printStudio = createPrintStudio({
  canvas: elements.printCanvas,
  grid: elements.printGrid,
  note: elements.printNote,
  status: elements.printStatus,
  exposeButton: elements.printExpose,
  retakeButton: elements.printRetake,
  frameElement: elements.printFrame,
  tag: elements.printTag,
  onExpose: () => sound.play('shutter'),
  onTreatment: () => sound.play('tap'),
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
  // A dragged frame has no score; say so in the top strip rather than leaving a
  // stale number standing as if it belonged to the new picture.
  elements.topPsnr.textContent = '—';
  elements.topSnr.classList.add('is-pending');
  client.requestFrame(settings, { metrics: false });
  scheduleSettle();
  scheduleCompare();
  syncHash();

  // A soft mechanical tap when a control is touched. Throttled so a slider drag
  // does not turn into a buzz; the sound is still there, just spaced out.
  const now = performance.now();
  if (!onChange.lastTap || now - onChange.lastTap > 150) {
    sound.play('tap');
    onChange.lastTap = now;
  }
}
onChange.lastTap = 0;

const controls = [
  createControls({ root: elements.captureGrid, settings, onChange, group: 'capture' }),
  createControls({ root: elements.reconstructGrid, settings, onChange, group: 'reconstruct' }),
  createControls({ root: elements.labGrid, settings, onChange, group: 'lab' }),
  // The same schema, six keys only, mounted again for the tray. It is the console
  // minus the two lab settings (optical low-pass, white balance) and the green rule,
  // which only matters once Hamilton-Adams is chosen — the six that change what the
  // picture below looks like. The prefix keeps the ids unique, so each copy still
  // has a working label.
  createControls({
    root: elements.trayGrid,
    settings,
    onChange,
    keys: ['lightLevel', 'shutterSeconds', 'iso', 'fNumber', 'sceneName', 'method'],
    idPrefix: 'tray-control',
  }),
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

// A tap-ring on the viewer: a brief amber circle where the reader clicked,
// like the safelight marking the enlarger's aim. Removed when the animation ends.
elements.viewerContainer.addEventListener('click', (event) => {
  const rect = elements.viewerContainer.getBoundingClientRect();
  const ring = document.createElement('div');
  ring.className = 'tap-ring';
  ring.style.left = `${event.clientX - rect.left}px`;
  ring.style.top = `${event.clientY - rect.top}px`;
  ring.style.width = '4px';
  ring.style.height = '4px';
  elements.viewerContainer.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove(), { once: true });
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
    printStudio.setFrame(frame);

    // The first frame is the shutter: the sensor is exposed and the picture appears.
    if (firstFrame) {
      firstFrame = false;
      sound.play('shutter');
      if (loading) loading.setAttribute('hidden', '');
    }

    // Numbers settle only when the scores arrive. During a drag the frame is
    // computed without metrics, so a settle on every frame would flicker; this
    // fires once per burst, on the frame that carries the real scores.
    if (frame.metrics.psnr !== null) {
      elements.topPsnr.textContent = `${frame.metrics.psnr.toFixed(1)} dB`;
      elements.topSnr.textContent = `${frame.metrics.midGreySnrDb.toFixed(1)} dB`;
      elements.topPsnr.classList.remove('is-pending');
      elements.topSnr.classList.remove('is-pending');
      motion.settle(elements.readoutsGrid);
      motion.settle(elements.photonsReadout);
      // A soft develop hum when the reconstruction is finished — like a print
      // appearing in the developer tray.
      sound.play('develop');

      // Tell screen readers what changed, so a non-sighted visitor knows the
      // numbers are fresh and not stale.
      metricsLive.textContent =
        `Frame ready. PSNR ${frame.metrics.psnr.toFixed(2)} dB, colour error ${frame.metrics.chromaError.toFixed(2)}.`;
    }

    elements.computeNote.textContent =
      `Computed in this browser in ${Math.round(frame.ms)} ms · ${frame.width}×${frame.height} pixels`;

    // The selected pixel keeps its explanation, recomputed against the frame
    // that is now on screen. Otherwise the panel would describe a stale image.
    // With nothing selected yet it explains the middle of the frame, so the
    // section never opens on a blank state.
    if (!lastPick) {
      lastPick = { x: Math.round(frame.width / 2), y: Math.round(frame.height / 2) };
    }
    client.requestExplain(lastPick.x, lastPick.y);

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
    const caveat = settings.greenRule === 'gradient' ? null : 'The gradient test is off. One direction is used at every site. This can raise the score. The error map shows what it costs.';
    methodTable.update(rows, settings.method, caveat);
  },

  onGuess(guess) {
    guessDemo.show(guess);
  },

  onExplain(explanation) {
    // explainPixel returns the method's own record (id, label, year, blurb),
    // not a bare id, because the panel shows the year next to the name.
    explainPanel.show(explanation, explanation.method?.label ?? explanation.method?.id ?? '');

    // The full arithmetic lives far below. The sentence printed under the frame
    // is the short answer, in the same words the lab panel will use.
    elements.viewerStatus.textContent = explanation.sentence;
  },

  onFailure(message) {
    elements.viewerStatus.textContent = `The engine failed: ${message}`;
    sound.play('error');
    metricsLive.textContent = `Engine error: ${message}`;
  },
});

elements.viewerStatus.textContent =
  'Drag the divider, or focus it and use the arrow keys. Click a pixel for its numbers.';

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

// Theme. The attribute is already set by the head script, so this only wires the
// switch and repaints what a stylesheet cannot: the canvas diagram and, if it is
// on screen, the loupe's tinted cells.
createThemeToggle({
  button: elements.themeToggle,
  onChange: (theme) => {
    bayer.redraw();
    heatmap.redraw();
    describeErrorScale(theme);
    loupe.hide();
    client.requestFrame(settings);
  },
});
describeErrorScale(currentTheme());

// The tray. The console sits directly under the plate; once it scrolls off the top
// of the screen, every section below still answers to the same settings, so a
// strip of them follows the reader down the page.
(function setupTray() {
  const { tray } = elements;
  const consoleSection = document.querySelector('.console');
  if (!tray || !consoleSection) return;

  let queued = 0;

  function measure() {
    queued = 0;
    // "The console is behind you" is the honest trigger: an element that goes from
    // below the viewport to above it never intersects, so an IntersectionObserver
    // has no state change to report. The strip covers only the bottom edge of the
    // screen, and the footer carries enough bottom padding to clear it.
    tray.hidden = consoleSection.getBoundingClientRect().bottom >= 0;
  }

  function schedule() {
    if (queued) return;
    queued = requestAnimationFrame(measure);
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  measure();
})();

// First frame. No blank state: the page opens on a real image.
client.requestFrame(settings);
scheduleCompare();
syncControls();
syncHash();

// Fallback: if the engine never responds, do not leave the visitor staring at
// the loading screen. Show the page after 8 seconds so the rest stays usable.
window.setTimeout(() => {
  if (loading && !loading.hasAttribute('hidden')) loading.setAttribute('hidden', '');
}, 8000);

// Then the two three.js consumers, in the background. Both are enhancements: the
// page is already interactive and already correct without them.
upgradeToWebgl(viewer);
loadStack();

// Exposed for the screenshot harness and for anyone reading the page source:
// the settings that produced the frame currently on screen.
if (import.meta.env.DEV) {
  window.__mosaic = { settings, client, viewer, motion };
}
