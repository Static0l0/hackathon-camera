// Reproduce the pre-fix stack order to confirm what the 2D fallback used to show.
const mosaic = document.getElementById('canvas-mosaic');
mosaic.style.zIndex = 'auto';
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const developed = document.getElementById('canvas-developed');
const ctx = developed.getContext('2d');
const d = ctx.getImageData(100, 100, 1, 1).data;
return { mosaicZ: getComputedStyle(mosaic).zIndex, developedPixel: [d[0], d[1], d[2]] };
