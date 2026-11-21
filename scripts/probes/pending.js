// Does the frame that is drawn *while a slider moves* admit that it has no score?
const cell = () => document.querySelector('[data-readout="psnr"] dd');
const wrap = () => document.querySelector('[data-readout="psnr"]');
const slider = document.querySelector('#capture-grid input[type="range"]');

const before = cell().textContent;

slider.value = '0.12';
slider.dispatchEvent(new Event('input', { bubbles: true }));

// Read while the dragging frame is on screen and the settled frame is not yet.
const started = performance.now();
while (performance.now() - started < 800) {
  if (wrap().dataset.pending) break;
  await new Promise((resolve) => setTimeout(resolve, 16));
}
const during = { text: cell().textContent, pending: wrap().dataset.pending ?? null };

// Then let the 240 ms settle pass and the scored frame land.
await new Promise((resolve) => setTimeout(resolve, 1200));
const after = { text: cell().textContent, pending: wrap().dataset.pending ?? null };

return { before, during, after, lightLevel: slider.value };
