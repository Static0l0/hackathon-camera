// Put the guess section in the viewport, let the heading reveal play, then report.
const section = document.getElementById('guess');
section.scrollIntoView({ block: 'start' });
await new Promise((resolve) => setTimeout(resolve, 900));

const demo = document.getElementById('guess-demo');
const heading = document.getElementById('guess-title');
return {
  top: Math.round(section.getBoundingClientRect().top),
  lead: demo.querySelector('.guess-lead')?.textContent ?? null,
  headingRect: Math.round(heading.getBoundingClientRect().height),
  rows: document.getElementById('method-table')?.rows.length ?? 0,
  assumes: [...document.querySelectorAll('.method-assumes')].map((cell) => cell.textContent),
  verdict: demo.querySelector('.guess-verdict')?.textContent ?? null,
};
