// Body of an async function: this file is wrapped in `(async () => { ... })()`.
return (() => {
  const mosaic = document.getElementById('canvas-mosaic');
  const developed = document.getElementById('canvas-developed');
  const sample = (canvas) => {
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(100, 100, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return {
    painter: document.getElementById('viewer-canvas').dataset.painter,
    mosaicSize: [mosaic.width, mosaic.height],
    developedSize: [developed.width, developed.height],
    mosaicPixel: sample(mosaic),
    developedPixel: sample(developed),
    mosaicZ: getComputedStyle(mosaic).zIndex,
    developedZ: getComputedStyle(developed).zIndex,
    mosaicClip: getComputedStyle(mosaic).clipPath,
    order: [...document.getElementById('viewer-canvas').children].map((n) => n.id || n.className),
  };
})();
