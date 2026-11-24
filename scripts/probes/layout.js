// Structural verification of the new layout: controls reachable, preview live,
// outputs visible without scrolling away from the input.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dock = document.getElementById('dock');
const controls = [...dock.querySelectorAll('input, select')].filter((el) => el.offsetParent !== null);
const canvas = document.getElementById('dock-canvas');
const ctx = canvas.getContext('2d');
const sample = () => {
  const d = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
  return [d[0], d[1], d[2]];
};

const before = sample();
const light = document.getElementById('control-lightLevel');
light.value = '0.08';
light.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(1200);
const after = sample();

return {
  controlsInDock: controls.length,
  controlIds: controls.map((el) => el.id),
  dockPosition: getComputedStyle(dock).position,
  previewBefore: before,
  previewAfter: after,
  previewChanged: before.join() !== after.join(),
  topPsnr: document.getElementById('top-psnr')?.textContent,
  topSnr: document.getElementById('top-snr')?.textContent,
  sections: [...document.querySelectorAll('main .section')].map((s) => s.id),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  consoleTitle: document.querySelector('.topbar-idea')?.textContent.trim(),
};
