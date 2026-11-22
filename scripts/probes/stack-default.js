// The cloud as it opens on a normal exposure.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const light = document.getElementById('control-lightLevel');
const spread = document.getElementById('stack-separation');

light.value = '0.4';
light.dispatchEvent(new Event('input', { bubbles: true }));
spread.value = '1';
spread.dispatchEvent(new Event('input', { bubbles: true }));

document.getElementById('stack-stage').scrollIntoView({ block: 'center' });
await sleep(1800);

return {
  readout: document.getElementById('stack-readout').textContent.trim(),
  spread: spread.value,
};
