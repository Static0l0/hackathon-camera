// On a phone the dock slides in; on desktop it is always there.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dock = document.getElementById('dock');
const toggle = document.getElementById('dock-toggle');
const toggleVisible = getComputedStyle(toggle).display !== 'none';

const closed = {
  open: dock.classList.contains('is-open'),
  x: Math.round(dock.getBoundingClientRect().x),
};
toggle.click();
await sleep(400);
const open = {
  open: dock.classList.contains('is-open'),
  expanded: toggle.getAttribute('aria-expanded'),
  x: Math.round(dock.getBoundingClientRect().x),
};

const input = document.getElementById('control-lightLevel');
input.value = '0.7';
input.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(1000);

return {
  toggleVisible,
  closed,
  open,
  dockWidth: Math.round(dock.getBoundingClientRect().width),
  viewport: innerWidth,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  psnr: document.getElementById('top-psnr').textContent,
  previewPixels: [document.getElementById('dock-canvas').width, document.getElementById('dock-canvas').height],
};
