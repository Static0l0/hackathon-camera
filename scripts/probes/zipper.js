// The payoff: the gradient test off, on the pattern that punishes it.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = async (id, value, wait = 1200) => {
  const element = document.getElementById(id);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(wait);
};

await pick('control-sceneName', 'zonePlate', 1600);
await pick('control-greenRule', 'vertical');

document.getElementById('error-canvas').scrollIntoView({ block: 'center' });
await sleep(600);

return {
  rule: document.getElementById('control-greenRule').value,
  caption: document.getElementById('error-caption')?.textContent ?? null,
  psnr: document.querySelector('[data-readout="psnr"] dd')?.textContent ?? null,
  chroma: document.querySelector('[data-readout="chroma"] dd')?.textContent ?? null,
};
