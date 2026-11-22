// Does the stack hold still while it separates, and is it fully open before the
// page moves on?
const pin = document.getElementById('stack-pin');
const stage = document.getElementById('stack-stage');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const top = () => Math.round(stage.getBoundingClientRect().top);
const spread = () => Number(stage.dataset.spread ?? -1);

// Land just before the pin engages.
const start = pin.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.12;
window.scrollTo(0, Math.round(start));
await sleep(900);

const before = { y: Math.round(window.scrollY), stageTop: top(), spread: spread() };

// A screen and a half further: still pinned, layers mostly apart.
window.scrollTo(0, Math.round(start + window.innerHeight * 0.7));
await sleep(900);
const middle = { y: Math.round(window.scrollY), stageTop: top(), spread: spread() };

// Past the end of the pin.
window.scrollTo(0, Math.round(start + window.innerHeight * 1.6));
await sleep(900);
const after = { y: Math.round(window.scrollY), stageTop: top(), spread: spread() };

return {
  before,
  middle,
  after,
  pinned: Boolean(document.querySelector('.pin-spacer')),
  spacerHeight: Math.round(
    document.querySelector('.pin-spacer')?.getBoundingClientRect().height ?? 0,
  ),
};
