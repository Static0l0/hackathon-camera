/**
 * Controls, generated from a schema.
 *
 * The schema is the single place where a setting becomes something a person can
 * touch: its label, its range and how its value is written. Adding a control
 * means adding one entry, not touching the layout.
 *
 * All ranges are native `<input type="range">`, which means keyboard operation,
 * platform assistive-technology support and touch all come for free. Where the
 * underlying value is not the number on the slider (shutter speed is an index
 * over a list of reciprocal fractions), `aria-valuetext` is set to the formatted
 * value so a screen reader says "1/60 s" and not "4".
 */

import { DEMOSAIC_METHODS, SCENE_INFO, SCENE_NAMES } from '../engine/index.js';

/** Shutter speeds, in seconds, in the order a camera shows them. */
export const SHUTTER_SPEEDS = [
  1 / 1000, 1 / 500, 1 / 250, 1 / 125, 1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1 / 2, 1,
];

/** ISO settings, at whole stops. */
export const ISO_VALUES = [100, 200, 400, 800, 1600, 3200, 6400];

/** Apertures, at whole stops. */
export const APERTURES = [2.8, 4, 5.6, 8, 11, 16];

/**
 * Format a shutter speed the way it is written on a camera.
 * @param {number} seconds
 * @returns {string}
 */
export function formatShutter(seconds) {
  if (seconds >= 1) return '1 s';
  return `1/${Math.round(1 / seconds)} s`;
}

/**
 * @param {number} iso
 * @returns {string}
 */
export function formatIso(iso) {
  return `ISO ${iso}`;
}

/**
 * Every control, in the section it belongs to.
 *
 * `group` exists because the page is one continuous argument: the capture
 * settings live where the argument talks about light, the reconstruction choices
 * live where it talks about guessing. The schema stays the single source of
 * truth, and each group is the same code mounted in a different place.
 */
const CONTROLS = [
  {
    key: 'lightLevel',
    group: 'capture',
    label: 'Light level',
    type: 'range',
    min: 0.02,
    max: 1,
    step: 0.01,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  {
    key: 'shutterSeconds',
    group: 'capture',
    label: 'Shutter',
    type: 'choice',
    options: SHUTTER_SPEEDS,
    format: formatShutter,
  },
  {
    key: 'iso',
    group: 'capture',
    label: 'ISO',
    type: 'choice',
    options: ISO_VALUES,
    format: (v) => String(v),
  },
  {
    key: 'fNumber',
    group: 'capture',
    label: 'Aperture',
    type: 'choice',
    options: APERTURES,
    format: (v) => `f/${v}`,
  },
  {
    key: 'sceneName',
    group: 'reconstruct',
    label: 'Scene',
    type: 'select',
    options: SCENE_NAMES,
    format: (v) => SCENE_INFO[v]?.label ?? v,
  },
  {
    key: 'method',
    group: 'reconstruct',
    label: 'Demosaic',
    type: 'select',
    options: DEMOSAIC_METHODS.map((method) => method.id),
    format: (v) => DEMOSAIC_METHODS.find((method) => method.id === v)?.label ?? v,
  },
  {
    key: 'olpfSigma',
    group: 'lab',
    label: 'Optical low-pass',
    type: 'range',
    min: 0,
    max: 3,
    step: 0.1,
    format: (v) => (v === 0 ? 'off' : `σ ${v.toFixed(1)} px`),
  },
  {
    key: 'whiteBalance',
    group: 'lab',
    label: 'White balance',
    type: 'checkbox',
    format: (v) => (v ? 'on' : 'off'),
  },
];

/**
 * Build every control once, then only read values back.
 *
 * @param {{
 *   root: HTMLElement,
 *   settings: object,
 *   onChange: (patch: object) => void,
 *   group?: string,
 * }} options
 * @returns {{sync: (settings: object) => void}}
 */
export function createControls({ root, settings, onChange, group }) {
  /** @type {Map<string, {element: HTMLInputElement|HTMLSelectElement, definition: object}>} */
  const entries = new Map();

  for (const definition of CONTROLS) {
    // One schema, mounted in several places: each section shows only its own.
    if (group && definition.group !== group) continue;

    const id = `control-${definition.key}`;
    const wrapper = document.createElement('div');
    wrapper.className = definition.type === 'checkbox' ? 'control control-check' : 'control';

    const label = document.createElement('label');
    label.className = 'control-label';
    label.htmlFor = id;

    const title = document.createElement('span');
    title.textContent = definition.label;
    label.append(title);

    const readout = document.createElement('span');
    readout.className = 'control-value';
    label.append(readout);

    const element = buildInput(definition, id, settings[definition.key]);
    wrapper.append(label, element);
    root.append(wrapper);

    entries.set(definition.key, { element, definition, readout });
    refresh(definition, element, readout);
  }

  /**
   * @param {object} definition
   * @param {string} id
   * @param {unknown} value
   * @returns {HTMLInputElement|HTMLSelectElement}
   */
  function buildInput(definition, id, value) {
    if (definition.type === 'select') {
      const select = document.createElement('select');
      select.id = id;
      for (const option of definition.options) {
        const element = document.createElement('option');
        element.value = String(option);
        element.textContent = definition.format
          ? definition.format(option)
          : String(option);
        select.append(element);
      }
      select.value = String(value);
      select.addEventListener('change', () => {
        onChange({ [definition.key]: select.value });
        refresh(definition, select, entries.get(definition.key).readout);
      });
      return select;
    }

    if (definition.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = Boolean(value);
      input.addEventListener('change', () => {
        onChange({ [definition.key]: input.checked });
        refresh(definition, input, entries.get(definition.key).readout);
      });
      return input;
    }

    const input = document.createElement('input');
    input.type = 'range';

    if (definition.type === 'choice') {
      // The slider indexes the list; the value that leaves this function is the
      // physical quantity, never the index.
      input.min = '0';
      input.max = String(definition.options.length - 1);
      input.step = '1';
      input.value = String(Math.max(0, definition.options.indexOf(value)));
      input.addEventListener('input', () => {
        onChange({ [definition.key]: definition.options[Number(input.value)] });
        refresh(definition, input, entries.get(definition.key).readout);
      });
    } else {
      input.min = String(definition.min);
      input.max = String(definition.max);
      input.step = String(definition.step);
      input.value = String(value);
      input.addEventListener('input', () => {
        onChange({ [definition.key]: Number(input.value) });
        refresh(definition, input, entries.get(definition.key).readout);
      });
    }

    input.id = id;
    return input;
  }

  /**
   * Write the human-readable value next to the label, and—where the slider's
   * number differs from the value it selects—tell assistive technology the same
   * thing.
   *
   * @param {object} definition
   * @param {HTMLInputElement|HTMLSelectElement} element
   * @param {HTMLElement} readout
   */
  function refresh(definition, element, readout) {
    if (!readout) return;

    if (definition.type === 'choice') {
      const value = definition.options[Number(element.value)];
      readout.textContent = definition.format(value);
      element.setAttribute('aria-valuetext', definition.format(value));
      return;
    }

    if (definition.type === 'range') {
      const value = Number(element.value);
      readout.textContent = definition.format(value);
      element.setAttribute('aria-valuetext', definition.format(value));
      return;
    }

    if (definition.type === 'checkbox') {
      readout.textContent = definition.format(element.checked);
      return;
    }

    readout.textContent = definition.format(element.value);
  }

  return {
    /**
     * Reflect settings that changed somewhere else (for example the initial
     * defaults, or a preset applied by a link).
     * @param {object} next
     */
    sync(next) {
      for (const [key, { element, definition, readout }] of entries) {
        if (!(key in next)) continue;

        if (definition.type === 'checkbox') element.checked = Boolean(next[key]);
        else if (definition.type === 'choice') {
          element.value = String(
            Math.max(0, definition.options.indexOf(next[key])),
          );
        } else element.value = String(next[key]);

        refresh(definition, element, readout);
      }
    },
  };
}
