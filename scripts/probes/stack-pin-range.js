// Sample the pinned run: the stage's top should hold while the spread climbs.
const pin = document.getElementById('stack-pin');
const stage = document.getElementById('stack-stage');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const start = pin.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.1;
const samples = [];

for (let step = 0; step <= 8; step += 1) {
  const y = Math.round(start + (window.innerHeight * 1.35 * step) / 8);
  window.scrollTo(0, y);
  await sleep(420);
  samples.push({
    y: Math.round(window.scrollY),
    stageTop: Math.round(stage.getBoundingClientRect().top),
    spread: Number(stage.dataset.spread ?? -1),
  });
}

const tops = samples.slice(1, 8).map((s) => s.stageTop);
return {
  samples,
  pinnedHoldRange: Math.max(...tops) - Math.min(...tops),
};
