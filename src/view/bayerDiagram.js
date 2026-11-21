/**
 * The colour filter layout, drawn from the frame's own mask.
 *
 * Why not a static SVG of "RGGB": the point of this section is that the pattern
 * is laid over the sensor, two sites in four pass green, and the proportions come
 * out 25 / 50 / 25. Drawing it from the mask means the picture cannot drift away
 * from the arithmetic — the caption's percentages are counted, not asserted.
 */

/** Same values as the CSS custom properties, so canvas and page agree. */
const CHANNEL_COLOURS = ['#d6452f', '#4c9a52', '#3566c9'];
const CHANNEL_LETTERS = ['R', 'G', 'B'];

/** How many cells the diagram shows per side. Four is enough to see the repeat. */
const TILES = 6;

/**
 * @param {{canvas: HTMLCanvasElement, caption: HTMLElement, counts: HTMLElement}} options
 * @returns {{update: (coverage: {red: number, green: number, blue: number}) => void}}
 */
export function createBayerDiagram({ canvas, caption, counts }) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('createBayerDiagram: no 2d context');

  /** Draw the grid once; the pattern is fixed by the sensor, not by the frame. */
  function draw() {
    const size = canvas.width;
    const cell = size / TILES;
    context.clearRect(0, 0, size, size);

    for (let y = 0; y < TILES; y++) {
      for (let x = 0; x < TILES; x++) {
        // RGGB: even row starts red, odd row starts green.
        const channel = (y & 1) === 0 ? (x & 1) === 0 ? 0 : 1 : (x & 1) === 0 ? 1 : 2;
        const left = x * cell;
        const top = y * cell;

        context.fillStyle = CHANNEL_COLOURS[channel];
        context.globalAlpha = 0.92;
        context.fillRect(left, top, cell, cell);
        context.globalAlpha = 1;

        context.strokeStyle = '#0c0c0b';
        context.lineWidth = 1;
        context.strokeRect(left + 0.5, top + 0.5, cell - 1, cell - 1);

        context.fillStyle = '#0c0c0b';
        context.font = `600 ${Math.round(cell * 0.34)}px "JetBrains Mono Variable", ui-monospace, monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(CHANNEL_LETTERS[channel], left + cell / 2, top + cell / 2 + 1);
      }
    }

    // Registration crosshair in the corner: the sheet's own mark, not data.
    context.strokeStyle = 'rgba(232, 227, 214, 0.45)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0.5, 10.5);
    context.lineTo(0.5, 0.5);
    context.lineTo(10.5, 0.5);
    context.stroke();
  }

  /**
   * @param {{red: number, green: number, blue: number}} coverage fractions of the frame
   */
  function update(coverage) {
    const percent = (value) => `${(value * 100).toFixed(0)}%`;
    caption.textContent =
      `RGGB over ${TILES}×${TILES} sites · green keeps ${percent(coverage.green)} of the frame`;

    counts.replaceChildren(
      ...['red', 'green', 'blue'].map((name) => {
        const term = document.createElement('div');
        term.className = 'pattern-count';

        const key = document.createElement('dt');
        key.textContent = name;
        const swatch = document.createElement('span');
        swatch.className = 'pattern-swatch';
        swatch.style.background = CHANNEL_COLOURS[['red', 'green', 'blue'].indexOf(name)];
        swatch.setAttribute('aria-hidden', 'true');
        key.prepend(swatch);

        const value = document.createElement('dd');
        value.textContent = percent(coverage[name]);

        term.append(key, value);
        return term;
      }),
    );
  }

  draw();
  return { update };
}
