/**
 * The numbers strip.
 *
 * These are readouts, not decoration: every one is computed by the engine and
 * sent with the frame. The container is `aria-live="polite"` in the HTML, so a
 * screen-reader user hears the values settle after a change instead of having to
 * hunt for them — but the live region is the whole grid, not each number, so a
 * single change announces once rather than seven times.
 *
 * The same component is mounted twice: a short strip beside the capture controls
 * (the numbers that belong to light) and the full one in the lab. `only` selects
 * which readings a mount shows; the number still comes from the same frame.
 */

/**
 * One decimal, but "no error at all" is genuinely infinite dB, not a rounding
 * artefact — so it gets its own symbol rather than a huge number.
 *
 * @param {number} value
 * @returns {string}
 */
function decibels(value) {
  if (!Number.isFinite(value)) return '∞';
  return value.toFixed(1);
}

const READOUTS = [
  {
    id: 'snr',
    label: 'Signal to noise',
    detail: 'how far the signal sits above the noise, measured on a mid-grey patch',
    value: (frame) => ({
      text: decibels(frame.metrics.midGreySnrDb),
      unit: 'dB',
    }),
  },
  {
    id: 'electrons',
    label: 'Signal per site',
    detail: 'electrons counted per site, on average',
    value: (frame) => ({
      text: Math.round(frame.metrics.meanElectrons).toString(),
      unit: 'e⁻',
    }),
  },
  {
    id: 'clipped',
    label: 'Blown out',
    detail: 'sites that hit the top of the range, where detail is lost',
    value: (frame) => ({
      text: (frame.metrics.clippedFraction * 100).toFixed(1),
      unit: '%',
    }),
  },
  {
    id: 'psnr',
    label: 'PSNR',
    detail: 'how close the guess is to the real picture; higher is better',
    value: (frame) =>
      frame.metrics.psnr === null
        ? { text: null }
        : { text: decibels(frame.metrics.psnr), unit: 'dB' },
  },
  {
    id: 'chroma',
    label: 'Colour error',
    detail: 'average shift in colour, in levels',
    value: (frame) =>
      frame.metrics.chromaError === null
        ? { text: null }
        : { text: frame.metrics.chromaError.toFixed(2), unit: 'DN' },
  },
  {
    id: 'split',
    label: 'Filter split',
    detail: 'share of red, green and blue sites',
    value: (frame) => ({
      text: `${Math.round(frame.coverage.red * 100)}% · ${Math.round(
        frame.coverage.green * 100,
      )}% · ${Math.round(frame.coverage.blue * 100)}%`,
    }),
  },
  {
    id: 'frame',
    label: 'Compute time',
    detail: 'time to build this frame',
    value: (frame) => ({ text: Math.round(frame.ms).toString(), unit: 'ms' }),
  },
];

/**
 * @param {{root: HTMLElement, only?: string[]}} options
 */
export function createReadouts({ root, only }) {
  /** @type {Array<{element: HTMLElement, definition: object}>} */
  const cells = [];

  for (const definition of READOUTS) {
    if (only && !only.includes(definition.id)) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'readout';
    // Named so the stylesheet can give the widest readout (the R·G·B split)
    // the room it needs without every other number inheriting that width.
    wrapper.dataset.readout = definition.id;

    const term = document.createElement('dt');
    term.textContent = definition.label;
    term.title = definition.detail;

    const value = document.createElement('dd');

    wrapper.append(term, value);
    root.append(wrapper);
    cells.push({ element: value, definition });
  }

  return {
    /**
     * @param {object} frame
     */
    update(frame) {
      for (const { element, definition } of cells) {
        const { text, unit } = definition.value(frame);

        // A null value means "this frame was published without it" — while a
        // slider is moving, scoring is skipped. Print a dash and dim the cell
        // rather than leaving the previous number standing as if it were current.
        if (text === null) {
          element.textContent = '—';
          element.parentElement.dataset.pending = 'true';
          continue;
        }

        element.textContent = text;
        delete element.parentElement.dataset.pending;

        if (unit) {
          const suffix = document.createElement('span');
          suffix.className = 'unit';
          suffix.textContent = unit;
          element.append(suffix);
        }
      }
    },
  };
}
