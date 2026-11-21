/**
 * The error map and the method table: one question, "how wrong is the guess".
 *
 * The heatmap is not a picture of the photograph — it is a picture of the
 * difference between the reconstruction and the ideal sensor at the same
 * settings. Bright means wrong. The scale is fixed by the frame's own maximum,
 * printed in the caption, so a quiet frame and a broken frame do not look alike.
 */

/** Ground, dim ember, hot. The only colour ramp in the page, because this is data.
 *  The middle stop is deliberately dark: most pixels in a good frame sit at a
 *  small error, and a ramp that reaches amber early turns the whole map gold. */
const RAMP = [
  [12, 12, 11],
  [64, 50, 12],
  [245, 179, 1],
];

/**
 * @param {number} t 0..1
 * @returns {[number, number, number]}
 */
function sampleRamp(t) {
  const clamped = Math.min(1, Math.max(0, t));
  const span = 1 / (RAMP.length - 1);
  const index = Math.min(RAMP.length - 2, Math.floor(clamped / span));
  const local = (clamped - index * span) / span;
  const from = RAMP[index];
  const to = RAMP[index + 1];
  return [
    Math.round(from[0] + (to[0] - from[0]) * local),
    Math.round(from[1] + (to[1] - from[1]) * local),
    Math.round(from[2] + (to[2] - from[2]) * local),
  ];
}

/**
 * @param {{canvas: HTMLCanvasElement, caption: HTMLElement}} options
 * @returns {{update: (frame: object) => void}}
 */
export function createErrorHeatmap({ canvas, caption }) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('createErrorHeatmap: no 2d context');

  // One lookup table, built once: the ramp is smooth, 256 steps are plenty.
  const lut = Array.from({ length: 256 }, (_, i) => sampleRamp(i / 255));

  /**
   * @param {object} frame the worker's frame payload
   */
  function update(frame) {
    const { width, height, errorMap, errorMax } = frame;

    // A dragging frame is published without an error map. Keep the last picture
    // (it is the same scene) but say so, instead of showing an old map as if it
    // belonged to the settings on screen.
    if (!errorMap) {
      caption.dataset.pending = 'true';
      return;
    }
    delete caption.dataset.pending;
    if (!width || !height) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const image = context.createImageData(width, height);
    const data = image.data;

    // Square-root the ratio before picking a colour. Almost every pixel in a
    // good frame sits in the first few levels of error, so a linear ramp shows
    // nothing but black and hides exactly the structure this panel exists to
    // show. The caption states the ramp, so nobody has to guess the scale.
    for (let i = 0; i < width * height; i++) {
      const ratio = errorMax > 0 ? Math.min(1, errorMap[i] / errorMax) : 0;
      const [r, g, b] = lut[Math.round(Math.sqrt(ratio) * 255)];
      const at = i * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = 255;
    }

    context.putImageData(image, 0, 0);
    context.globalAlpha = 1;

    caption.textContent =
      `0 to ${errorMax.toFixed(0)} levels · mean ${frame.metrics?.meanAbs?.toFixed(2) ?? '—'} · square-root ramp`;
  }

  return { update };
}

/**
 * One sentence per method, naming the assumption the whole method rests on. The
 * score says which won here; the assumption says why it can still look wrong.
 */
const ASSUMES = {
  nearest: 'a neighbour is close enough',
  bilinear: 'the image is smooth in every direction',
  hamiltonAdams: 'edges run along one axis or the other',
  malvarHeCutler: 'the gradient is flat enough to cancel',
};

/**
 * Score every method on the same capture, and mark the one on screen.
 *
 * @param {{tbody: HTMLElement, note?: HTMLElement}} options
 * @returns {{update: (rows: object[], activeId: string) => void}}
 */
export function createMethodTable({ tbody, note }) {
  /**
   * @param {object[]} rows
   * @param {string} activeId
   */
  function update(rows, activeId) {
    if (!rows || rows.length === 0) return;

    const scores = rows.map((row) => row.psnr);
    const best = Math.max(...scores);
    const worst = Math.min(...scores);
    const span = best - worst || 1;

    tbody.replaceChildren(
      ...rows.map((row) => {
        const line = document.createElement('tr');
        if (row.id === activeId) line.className = 'is-active';

        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = row.label;

        const psnr = document.createElement('td');
        psnr.className = 'method-score';
        const bar = document.createElement('span');
        bar.className = 'method-bar';
        // Bar length is rank, not the absolute value: 40 dB and 41 dB are a
        // whisker apart on a 0-50 scale and indistinguishable at this size.
        const t = (row.psnr - worst) / span;
        bar.style.width = `${Math.round(4 + t * 96)}%`;
        const number = document.createElement('span');
        number.className = 'method-number';
        number.textContent = Number.isFinite(row.psnr) ? `${row.psnr.toFixed(2)} dB` : '∞';
        psnr.append(bar, number);

        const chroma = document.createElement('td');
        chroma.className = 'method-chroma';
        chroma.textContent = row.chromaError.toFixed(2);

        const assumes = document.createElement('td');
        assumes.className = 'method-assumes';
        assumes.textContent = ASSUMES[row.id] ?? '';

        line.append(name, psnr, chroma, assumes);
        return line;
      }),
    );

    if (note) {
      const first = rows.find((row) => row.id === activeId);
      note.textContent = first
        ? `${first.label}: ${first.psnr.toFixed(2)} dB on this frame. Highest wins; the bars are ranked, not absolute.`
        : note.textContent;
    }
  }

  return { update };
}
