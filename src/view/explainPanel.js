/**
 * The explanation panel: the numbers one pixel was actually reconstructed from.
 *
 * The rule this panel keeps: it renders what `explainPixel` returned and nothing
 * else. There is no template of what Hamilton-Adams "usually" does — if the
 * method chose the vertical gradient at this pixel, that decision and both
 * gradient values are in the response, and they are printed.
 */

/** Channel display colours. These are data colours: they mean R, G and B filters. */
const CHANNEL_COLOURS = ['#D6452F', '#4C9A52', '#3566C9'];

/**
 * DN in a whole number reads better than a float: the ADC produced integers, and
 * the reconstruction of a *missing* channel is the only place a fraction appears.
 *
 * @param {number} value
 * @returns {string}
 */
function formatValue(value) {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value - Math.round(value)) < 0.05
    ? String(Math.round(value))
    : value.toFixed(1);
}

/**
 * A 5x5 kernel as a grid of coefficients, with the non-zero taps lit.
 *
 * Showing the whole grid matters: the point of Malvar-He-Cutler is that the
 * answer is a fixed weighted sum over 24 neighbours, including neighbours whose
 * colour is not the one being estimated.
 *
 * @param {number[][]} grid
 * @returns {HTMLTableElement}
 */
function kernelTable(grid) {
  const table = document.createElement('table');
  table.className = 'kernel';

  const size = grid.length;
  for (let row = 0; row < size; row += 1) {
    const tr = document.createElement('tr');
    for (let column = 0; column < size; column += 1) {
      const cell = document.createElement('td');
      const weight = grid[row][column];
      // Weights are multiples of 1/8, so two decimals is always enough. Print
      // integers as integers so the grid reads like the table in the paper.
      cell.textContent = weight === 0
        ? '·'
        : Number.isInteger(weight)
          ? String(weight)
          : weight.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
      if (weight !== 0) cell.classList.add('is-tap');
      if (row === 2 && column === 2) cell.classList.add('is-centre');
      tr.append(cell);
    }
    table.append(tr);
  }

  return table;
}

/**
 * @param {{root: HTMLElement}} options
 */
export function createExplainPanel({ root }) {
  return {
    /**
     * @param {object} explanation from explainPixel, via the worker
     * @param {string} methodLabel human-readable method name
     */
    show(explanation, methodLabel) {
      root.replaceChildren();

      const sentence = document.createElement('p');
      sentence.className = 'explain-sentence';
      sentence.textContent = explanation.sentence;
      root.append(sentence);

      const meta = document.createElement('p');
      meta.className = 'note';
      meta.textContent =
        `row ${explanation.y} · col ${explanation.x} · ${methodLabel}`;
      root.append(meta);

      const grid = document.createElement('div');
      grid.className = 'explain-grid';

      // Always in R, G, B order, whatever order the method computed them in, so
      // the same position means the same colour every time.
      const channels = [...explanation.channels].sort((a, b) => a.channel - b.channel);

      for (const channel of channels) {
        const block = document.createElement('div');
        block.className = 'explain-channel';

        const head = document.createElement('div');
        head.className = 'channel-head';

        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = CHANNEL_COLOURS[channel.channel];
        head.append(swatch);

        const name = document.createElement('span');
        name.textContent = ['red', 'green', 'blue'][channel.channel];
        head.append(name);

        const state = document.createElement('span');
        state.className = 'note';
        state.textContent = channel.measured ? 'measured here' : 'guessed';
        head.append(state);

        block.append(head);

        const value = document.createElement('div');
        value.className = 'channel-value';
        value.textContent = `${formatValue(channel.value)} DN`;
        block.append(value);

        if (channel.formula) {
          const formula = document.createElement('div');
          formula.className = 'channel-formula';
          formula.textContent = channel.formula;
          block.append(formula);
        }

        // Hamilton-Adams: the actual gradients the decision used.
        if (channel.gradient) {
          const { dH, dV, direction } = channel.gradient;
          const gradients = document.createElement('div');
          gradients.className = 'channel-formula';
          gradients.textContent =
            `dH ${formatValue(dH)} · dV ${formatValue(dV)} → ${direction}`;
          block.append(gradients);
        }

        if (Array.isArray(channel.kernelGrid) && channel.kernelGrid.length > 0) {
          block.append(kernelTable(channel.kernelGrid));
        }

        grid.append(block);
      }

      root.append(grid);
    },

    /**
     * @param {string} message
     */
    clear(message = 'No pixel chosen yet.') {
      root.replaceChildren();
      const placeholder = document.createElement('p');
      placeholder.className = 'placeholder';
      placeholder.textContent = message;
      root.append(placeholder);
    },
  };
}
