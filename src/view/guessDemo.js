/**
 * "What should this pixel's missing green be?"
 *
 * The rest of the page shows what the algorithms produce. This panel asks the
 * reader to produce it first: one red site, four measured green neighbours, and
 * a choice between the row and the column. Only after the reader commits does it
 * reveal what bilinear says, what Hamilton-Adams says, and -- because the engine
 * keeps a clean reference frame -- what the sensor would have measured there.
 *
 * The point is not the answer. It is that the answer was not in the data, and
 * that two published algorithms disagree about how to invent it.
 */

import { readColour } from './cssColor.js';

/**
 * Measured values are integers; guesses are averages, so they keep a decimal.
 *
 * No thousands separators: a DN is a level on a 0–4095 scale, not a quantity,
 * and the panel's own sentences print these numbers ungrouped. Grouping them
 * here made the table read "1,774" directly above a sentence reading "1774".
 */
const wholeDn = new Intl.NumberFormat('en-GB', { useGrouping: false });
const tenthDn = new Intl.NumberFormat('en-GB', {
  useGrouping: false,
  maximumFractionDigits: 1,
});

const measuredDn = (value) => wholeDn.format(Math.round(value));
const guessedDn = (value) => tenthDn.format(Math.round(value * 10) / 10);

/** An error with its sign kept, so an overshoot never reads as an undershoot. */
const signedDn = (value) => {
  const size = measuredDn(Math.abs(value));
  if (Math.abs(value) < 0.5) return '±0';
  return `${value > 0 ? '+' : '\u2212'}${size}`;
};

/** The window tints its cells with the filter colours, read from the tokens. */
const CHANNEL_TOKENS = ['--data-r', '--data-g', '--data-b'];
const CHANNEL_FALLBACKS = [
  [200, 68, 44],
  [63, 140, 74],
  [47, 95, 176],
];
const CHANNEL_NAMES = ['red', 'green', 'blue'];

/**
 * Build the panel once and reuse it for every site.
 *
 * @param {{root: HTMLElement, onNext: () => void}} options
 */
export function createGuessDemo({ root, onNext }) {
  root.classList.add('guess-demo');
  root.innerHTML = '';

  const windowBox = el('div', 'guess-window');
  const panel = el('div', 'guess-panel');
  const lead = el('p', 'guess-lead');
  const ask = el('p', 'guess-ask');
  const choices = el('div', 'guess-choices');
  const reveal = el('div', 'guess-reveal');
  const verdict = el('p', 'guess-verdict');
  const scores = el('dl', 'guess-scores');
  const next = el('button', 'guess-next');
  next.type = 'button';
  next.textContent = 'Another site';

  const rowButton = directionButton('Along the row', 'horizontal');
  const columnButton = directionButton('Along the column', 'vertical');
  choices.append(rowButton.root, columnButton.root);

  reveal.append(scores, verdict);
  reveal.hidden = true;
  // The reveal replaces the question with four numbers; a screen reader should be
  // told that happened rather than being left on the buttons.
  reveal.setAttribute('aria-live', 'polite');
  panel.append(lead, ask, choices, reveal, next);
  root.append(windowBox, panel);

  /** The site currently on screen, or null before the first frame. */
  let current = null;
  /** Which direction the reader committed to, or null. */
  let chosen = null;

  /**
   * @param {'horizontal' | 'vertical'} direction
   */
  function choose(direction) {
    if (!current || current.kind !== 'guessed' || chosen) return;
    chosen = direction;

    rowButton.root.disabled = true;
    columnButton.root.disabled = true;
    rowButton.root.classList.toggle('is-chosen', direction === 'horizontal');
    columnButton.root.classList.toggle('is-chosen', direction === 'vertical');
    windowBox.dataset.choosing = direction;

    renderScores(current, direction);
    reveal.hidden = false;
  }

  rowButton.root.addEventListener('click', () => choose('horizontal'));
  columnButton.root.addEventListener('click', () => choose('vertical'));

  // Let the pointer preview which neighbours the choice would use.
  for (const [button, direction] of [
    [rowButton.root, 'horizontal'],
    [columnButton.root, 'vertical'],
  ]) {
    const show = () => {
      if (chosen) return;
      windowBox.dataset.preview = direction;
    };
    const hide = () => {
      delete windowBox.dataset.preview;
    };
    button.addEventListener('mouseenter', show);
    button.addEventListener('focus', show);
    button.addEventListener('mouseleave', hide);
    button.addEventListener('blur', hide);
  }

  next.addEventListener('click', () => onNext());

  /**
   * @param {object} guess
   */
  function show(guess) {
    current = guess;
    chosen = null;
    delete windowBox.dataset.choosing;
    delete windowBox.dataset.preview;
    reveal.hidden = true;
    rowButton.root.disabled = false;
    columnButton.root.disabled = false;
    rowButton.root.classList.remove('is-chosen');
    columnButton.root.classList.remove('is-chosen');

    if (guess.kind === 'measured') {
      // A green site measured the very thing this panel is about, so there is
      // nothing to guess -- say so and send the reader one pixel sideways.
      windowBox.replaceChildren();
      lead.textContent = `Row ${guess.y}, column ${guess.x} has a green filter. It measured green directly: ${measuredDn(
        guess.measured,
      )}. Nothing to guess here.`;
      lead.dataset.kind = 'measured';
      ask.textContent = 'Pick a site with a red or blue filter. Those are the ones that need a guess.';
      choices.hidden = true;
      return;
    }

    lead.dataset.kind = 'guessed';
    lead.textContent = `Row ${guess.y}, column ${guess.x} has a ${guess.channelName} filter. It measured ${measuredDn(
      guess.measured,
    )}. It never saw green.`;
    ask.textContent = 'Four green neighbours are shown. Pick the pair along the row, or the pair down the column.';
    choices.hidden = false;
    rowButton.mean.textContent = `mean ${guessedDn(guess.row.average)}`;
    columnButton.mean.textContent = `mean ${guessedDn(guess.column.average)}`;
    renderWindow(guess);
  }

  /**
   * @param {object} guess
   */
  function renderWindow(guess) {
    windowBox.replaceChildren();
    for (const cell of guess.window) {
      const tile = el('span', 'guess-cell');
      tile.textContent = measuredDn(cell.value);
      // The tint is the filter that passed this value. It is data, not decoration,
      // so it uses the same three colours as every other readout in the page.
      const colour = readColour(CHANNEL_TOKENS[cell.channel], CHANNEL_FALLBACKS[cell.channel]);
      tile.style.backgroundColor = `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, 0.3)`;
      tile.title = `${CHANNEL_NAMES[cell.channel]} filter`;
      if (cell.isCentre) tile.classList.add('is-centre');
      else if (cell.y === guess.y) tile.classList.add('is-row');
      else if (cell.x === guess.x) tile.classList.add('is-column');
      windowBox.append(tile);
    }
  }

  /**
   * @param {object} guess
   * @param {'horizontal' | 'vertical'} direction
   */
  function renderScores(guess, direction) {
    const yours = direction === 'horizontal' ? guess.row.average : guess.column.average;
    // The counterfactual: the pair the reader passed on, priced against the same
    // truth. Without it the panel shows a right answer, not the cost of a wrong one.
    const other = direction === 'horizontal' ? guess.column.average : guess.row.average;
    const rows = [
      { key: 'you', label: 'Your pair', value: yours },
      { key: 'other', label: 'Other pair', value: other },
      { key: 'bilinear', label: 'Bilinear', value: guess.bilinear },
      { key: 'hamiltonAdams', label: 'Hamilton-Adams', value: guess.hamiltonAdams },
      { key: 'truth', label: 'Sensor measured', value: guess.truth, isTruth: true },
    ];

    scores.replaceChildren();
    for (const row of rows) {
      const term = el('dt', row.isTruth ? 'guess-row is-truth' : 'guess-row');
      term.textContent = row.label;
      const value = el('dd', row.isTruth ? 'guess-value is-truth' : 'guess-value');
      // The reference is a continuous radiance, not a count, so it is rounded to
      // the same whole DN the other rows are quoted in.
      value.textContent = `${row.isTruth ? measuredDn(row.value) : guessedDn(row.value)} DN`;
      if (!row.isTruth) {
        const error = el('span', 'guess-error');
        error.textContent = `${signedDn(row.value - guess.truth)} DN from the sensor`;
        value.append(' ', error);
      }
      scores.append(term, value);
    }

    const tookRow = guess.direction === 'horizontal';
    const base = tookRow ? guess.row.average : guess.column.average;

    // With the gradient test off, no direction was chosen. Say that plainly.
    let explanation;
    if (guess.forced && guess.greenRule === 'average') {
      explanation =
        'You turned the comparison off, so Hamilton-Adams averages all four green ' +
        'neighbours. It gives no extra weight to the row or the column.';
    } else if (guess.forced) {
      const axis = guess.greenRule === 'horizontal' ? 'row' : 'column';
      explanation =
        `You turned the comparison off, so it always takes the ${axis}. ` +
        `It ignores how much the image changes across the row ` +
        `(${measuredDn(guess.row.gradient)}) and down the column ` +
        `(${measuredDn(guess.column.gradient)}). Then it adds the bend in the red ` +
        `signal, which moves the mean from ${guessedDn(base)} to ` +
        `${guessedDn(guess.hamiltonAdams)}.`;
    } else {
      const axis = tookRow ? 'row' : 'column';
      explanation =
        `Hamilton-Adams measures how much the image changes in each direction: ` +
        `${measuredDn(guess.row.gradient)} along the row, ` +
        `${measuredDn(guess.column.gradient)} down the column. The smaller change ` +
        `wins, so it takes the ${axis}. Then it adds the bend in the red signal, ` +
        `which moves the mean from ${guessedDn(base)} to ` +
        `${guessedDn(guess.hamiltonAdams)}.`;
    }

    verdict.textContent =
      `You picked the ${direction === 'horizontal' ? 'row' : 'column'}. ` +
      explanation + '\n' +
      verdictLine(guess, yours) +
      (!guess.forced && tookRow !== (direction === 'horizontal')
        ? '\nThe method picked the other pair.'
        : '');
  }

  /**
   * Who was closest, measured rather than asserted.
   *
   * @param {object} guess
   * @param {number} yours
   */
  function verdictLine(guess, yours) {
    const contenders = [
      { label: 'You', error: Math.abs(yours - guess.truth) },
      { label: 'Bilinear', error: Math.abs(guess.bilinear - guess.truth) },
      { label: 'Hamilton-Adams', error: Math.abs(guess.hamiltonAdams - guess.truth) },
    ].sort((a, b) => a.error - b.error);

    const [best, second] = contenders;
    const closest = `${measuredDn(best.error)} DN from the sensor`;

    if (best.error < 0.5) {
      return best.label === 'You' ? "You're spot on." : `${best.label} is spot on.`;
    }
    if (Math.abs(best.error - second.error) < 1) {
      return best.label === 'You'
        ? `You and ${second.label} land the same distance from the sensor: ${closest}.`
        : `${best.label} and ${second.label} land the same distance from the sensor: ${closest}.`;
    }
    return best.label === 'You'
      ? `You're closest: ${closest}.`
      : `${best.label} is closest: ${closest}.`;
  }

  next.addEventListener('click', () => onNext());

  return {
    show,
    clear(message) {
      current = null;
      windowBox.replaceChildren();
      lead.textContent = message;
      ask.textContent = '';
      choices.hidden = true;
      reveal.hidden = true;
    },
  };
}

/**
 * @param {string} tag @param {string} className
 */
function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/**
 * @param {string} label @param {'horizontal' | 'vertical'} direction
 */
function directionButton(label, direction) {
  const root = el('button', 'guess-choice');
  root.type = 'button';
  root.dataset.direction = direction;
  const title = document.createTextNode(label);
  const mean = el('span', 'guess-choice-mean');
  root.append(title, ' ', mean);
  return { root, mean };
}
