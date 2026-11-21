// What does the built site look like from the outside? Base path, lazy chunks, no dev hooks.
const viewer = document.getElementById('viewer-canvas');
const webglCame = await new Promise((resolve) => {
  const started = performance.now();
  const check = () => {
    if (viewer.className.includes('is-webgl')) return resolve(true);
    if (performance.now() - started > 6000) return resolve(false);
    setTimeout(check, 100);
  };
  check();
});

// Nudge the scene so the compare debounce has something to do, then wait for the table.
// The first select in the group is the scene, the second is the demosaic method.
const selects = document.querySelectorAll('#reconstruct-grid select');
const methodSelect = selects[1];
if (methodSelect) {
  methodSelect.value = 'malvarHeCutler';
  methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

const tableCame = await new Promise((resolve) => {
  const started = performance.now();
  const check = () => {
    if (document.querySelectorAll('#method-table tr').length === 4) return resolve(true);
    if (performance.now() - started > 8000) return resolve(false);
    setTimeout(check, 120);
  };
  check();
});

return {
  url: location.pathname,
  painter: viewer.dataset.painter,
  webglCame,
  tableCame,
  stackCanvas: Boolean(document.getElementById('stack-canvas')),
  devHandle: typeof window.__stack,
  psnr: document.querySelector('[data-readout="psnr"] dd')?.textContent,
  activeRow: document.querySelector('#method-table tr.is-active td')?.textContent,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  fonts: Array.from(document.fonts).filter((face) => face.status === 'loaded').length,
};
