// The live site, on the two things this turn changed.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = async (id, value, wait = 1400) => {
  const element = document.getElementById(id);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(wait);
};

const before = {
  rule: document.getElementById('control-greenRule')?.value ?? null,
  readout: document.getElementById('stack-readout')?.textContent.trim() ?? null,
  psnr: document.querySelector('[data-readout="psnr"] dd')?.textContent ?? null,
};

await pick('control-sceneName', 'zonePlate', 1800);
await pick('control-greenRule', 'vertical');
const forced = {
  psnr: document.querySelector('[data-readout="psnr"] dd')?.textContent ?? null,
  caption: document.getElementById('error-caption')?.textContent ?? null,
  note: document.getElementById('method-note')?.textContent.slice(-60) ?? null,
};

return {
  url: location.pathname,
  before,
  forced,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
};
