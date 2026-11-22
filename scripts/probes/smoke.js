// Whole-page smoke test after removing Lenis: headings reveal on native scroll,
// the slider still drives the stack, and the rest of the page still computes.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

window.scrollTo(0, 0);
await sleep(400);

const revealedAt = [];
for (const id of ['hook', 'photons', 'pattern', 'guess', 'lab']) {
  const section = document.getElementById(id);
  section.scrollIntoView({ block: 'start' });
  await sleep(900);
  const heading = section.querySelector('.heading');
  const line = heading?.querySelector('div, span');
  revealedAt.push({
    id,
    transform: line ? getComputedStyle(line).transform : 'none',
  });
}

const slider = document.getElementById('stack-separation');
slider.value = '0';
slider.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(400);
const closed = document.getElementById('stack-stage').dataset.spread;

return {
  revealedAt,
  closed,
  rows: document.querySelectorAll('#method-table tr').length,
  psnr: document.querySelector('#readouts-grid dd')?.textContent ?? null,
  scrollY: Math.round(window.scrollY),
};
