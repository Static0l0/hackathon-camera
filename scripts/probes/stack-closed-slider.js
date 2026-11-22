// The stacked-shut state, framed.
const slider = document.getElementById('stack-separation');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

document.getElementById('stack-stage').scrollIntoView({ block: 'center' });
await sleep(500);

slider.value = '0';
slider.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(500);

const stage = document.getElementById('stack-stage');
return {
  spread: stage.dataset.spread,
  label: document.getElementById('stack-separation-value').textContent.trim(),
  scrollY: Math.round(window.scrollY),
};
