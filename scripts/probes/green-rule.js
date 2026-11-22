// Drive the green-rule menu on the zone plate and watch the numbers change.
const rule = document.getElementById('control-greenRule');
const scene = document.getElementById('control-sceneName');
const method = document.getElementById('control-method');
const psnr = () => document.querySelector('[data-readout="psnr"] dd')?.textContent ?? null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = async (element, value, wait = 900) => {
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(wait);
};

document.getElementById('guess').scrollIntoView({ block: 'start' });
await sleep(400);

const before = { rule: rule.value, scene: scene.value, psnr: psnr() };

await pick(scene, 'zonePlate', 1200);
await pick(rule, 'vertical');
const forced = { rule: rule.value, psnr: psnr() };
await pick(rule, 'average');
const averaged = { rule: rule.value, psnr: psnr() };
await pick(rule, 'gradient');
const restored = { rule: rule.value, psnr: psnr() };

// The menu greys out for methods that ignore it.
await pick(method, 'bilinear', 800);
const withBilinear = { disabled: rule.disabled, faded: rule.closest('.control')?.classList.contains('is-inactive') };

return {
  before,
  forced,
  averaged,
  restored,
  withBilinear,
  table: [...document.querySelectorAll('#method-table tr')].map((tr) => tr.textContent.trim()),
};
