// Halfway through the separation.
const pin = document.getElementById('stack-pin');
const stage = document.getElementById('stack-stage');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const start = pin.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.1;
window.scrollTo(0, Math.round(start + window.innerHeight * 0.67));
await sleep(1100);

return {
  spread: Number(stage.dataset.spread ?? -1),
  stageTop: Math.round(stage.getBoundingClientRect().top),
};
