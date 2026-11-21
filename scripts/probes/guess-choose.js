// Commit to a direction and photograph the reveal.
const section = document.getElementById('guess');
section.scrollIntoView({ block: 'start' });
await new Promise((resolve) => setTimeout(resolve, 700));

const demo = document.getElementById('guess-demo');
const column = [...demo.querySelectorAll('.guess-choice')].find(
  (button) => button.dataset.direction === 'vertical',
);
column?.click();
await new Promise((resolve) => setTimeout(resolve, 250));

return {
  chosen: demo.querySelector('.guess-choice.is-chosen')?.dataset.direction ?? null,
  verdict: demo.querySelector('.guess-verdict')?.textContent ?? null,
  truth: [...demo.querySelectorAll('.guess-row')].map((row, index) => ({
    label: row.textContent,
    value: demo.querySelectorAll('.guess-value')[index]?.textContent,
  })),
};
