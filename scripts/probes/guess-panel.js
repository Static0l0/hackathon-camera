// Is the guess panel teaching from a real site, and does the reveal work?
const demo = document.getElementById('guess-demo');
const lead = demo.querySelector('.guess-lead');
const cells = demo.querySelectorAll('.guess-cell');
const choices = demo.querySelectorAll('.guess-choice');

const before = {
  lead: lead?.textContent ?? null,
  cells: cells.length,
  centre: demo.querySelector('.guess-cell.is-centre')?.textContent ?? null,
  choicesHidden: demo.querySelector('.guess-choices')?.hidden ?? null,
  ask: demo.querySelector('.guess-ask')?.textContent ?? null,
};

choices[0]?.click();
await new Promise((resolve) => setTimeout(resolve, 120));

const reveal = demo.querySelector('.guess-reveal');
const rows = [...demo.querySelectorAll('.guess-row')].map((row, index) => ({
  label: row.textContent,
  value: demo.querySelectorAll('.guess-value')[index]?.textContent,
}));

return {
  before,
  after: {
    revealHidden: reveal?.hidden ?? null,
    rows,
    verdict: demo.querySelector('.guess-verdict')?.textContent ?? null,
    chosen: demo.querySelector('.guess-choice.is-chosen')?.dataset.direction ?? null,
  },
};
