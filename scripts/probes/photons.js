// The cloud at three light levels: the claim is that lowering the light makes the
// dots countable one by one.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const light = document.getElementById('control-lightLevel');
const readout = document.getElementById('stack-readout');

document.getElementById('stack-stage').scrollIntoView({ block: 'center' });
await sleep(600);

const samples = [];
for (const value of ['0.4', '0.12', '0.04']) {
  light.value = value;
  light.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1400);
  samples.push({ light: value, readout: readout.textContent.trim() });
}

return { samples, dots: document.querySelector('#stack-readout').textContent.length > 0 };
