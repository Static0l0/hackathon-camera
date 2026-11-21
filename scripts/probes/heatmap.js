const canvas = document.getElementById('error-canvas');
const ctx = canvas.getContext('2d');
const { width, height } = canvas;
const data = ctx.getImageData(0, 0, width, height).data;
const hist = new Array(8).fill(0);
let maxLum = 0;
let sum = 0;
for (let i = 0; i < width * height; i++) {
  const r = data[i * 4];
  const g = data[i * 4 + 1];
  maxLum = Math.max(maxLum, g);
  sum += g;
  hist[Math.min(7, Math.floor((g / 256) * 8))] += 1;
}
return {
  canvas: [width, height],
  caption: document.getElementById('error-caption').textContent.trim(),
  meanGreen: Math.round(sum / (width * height)),
  maxGreen: maxLum,
  hist,
  cssWidth: Math.round(canvas.getBoundingClientRect().width),
};
