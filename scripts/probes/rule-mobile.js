// Both new controls at phone width.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = async (id, value, wait = 1200) => {
  const element = document.getElementById(id);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(wait);
};

await pick('control-sceneName', 'zonePlate', 1600);
await pick('control-greenRule', 'horizontal');

document.getElementById('error-canvas').scrollIntoView({ block: 'center' });
await sleep(600);

const rule = document.getElementById('control-greenRule');
const box = rule.closest('.control').getBoundingClientRect();
return {
  rule: rule.value,
  label: rule.closest('.control').querySelector('.control-value').textContent.trim(),
  width: Math.round(box.width),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  note: document.getElementById('method-note').textContent.trim().slice(0, 80),
};
