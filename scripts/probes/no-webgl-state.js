// What does the page do when it has no WebGL at all?
const viewer = document.getElementById('viewer-canvas');
await new Promise((resolve) => setTimeout(resolve, 2500));

return {
  painter: viewer.dataset.painter,
  isCanvas: viewer.className.includes('is-canvas'),
  isWebgl: viewer.className.includes('is-webgl'),
  stackReadout: document.getElementById('stack-readout')?.textContent?.trim().slice(0, 80),
  stackUnavailable: document.querySelector('#stack-stage')?.className,
  psnr: document.querySelector('[data-readout="psnr"] dd')?.textContent,
  mosaicVisible: (() => {
    const canvas = document.getElementById('canvas-mosaic');
    return canvas ? getComputedStyle(canvas).display : 'missing';
  })(),
};
