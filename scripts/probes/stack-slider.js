// Does the slider move the layers, and does the label follow?
const slider = document.getElementById('stack-separation');
const stage = document.getElementById('stack-stage');
const value = document.getElementById('stack-separation-value');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const read = () => ({
  slider: slider.value,
  spread: stage.dataset.spread,
  label: value.textContent.trim(),
  aria: slider.getAttribute('aria-valuetext'),
});

const initial = read();

slider.scrollIntoView({ block: 'center' });
await sleep(400);

const positions = [];
for (const next of ['0', '0.5', '1']) {
  slider.value = next;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(500);
  positions.push(read());
}

return { initial, positions, initialScrollY: Math.round(window.scrollY) };
