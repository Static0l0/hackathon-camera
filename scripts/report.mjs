/**
 * Development report: the actual numbers behind the claims in the UI and the
 * README. Not part of the site; run it with `node scripts/report.mjs`.
 *
 * It prints, per scene, the PSNR of each demosaic method at settings where
 * sensor noise is deliberately low, so the differences you see are about
 * interpolation rather than about noise.
 */

import { METHOD_IDS, runPipeline } from '../src/engine/index.js';

const CLEAN = {
  lightLevel: 1,
  shutterSeconds: 1 / 60,
  fNumber: 2.8,
  iso: 100,
  seed: 7,
  olpfSigma: 0.7,
  whiteBalance: false,
};

const SCENES = ['photo', 'zonePlate', 'slantedEdge', 'stripes', 'siemensStar', 'text'];

console.log('PSNR in dB, higher is better (160x120, ISO 100, light 1.0)\n');
const header = ['scene'.padEnd(14), ...METHOD_IDS.map((m) => m.padStart(16))].join(' ');
console.log(header);
console.log('-'.repeat(header.length));

for (const sceneName of SCENES) {
  const cells = [sceneName.padEnd(14)];
  for (const method of METHOD_IDS) {
    const { metrics } = runPipeline({ ...CLEAN, sceneName, width: 160, height: 120, method });
    cells.push(metrics.psnr.toFixed(2).padStart(16));
  }
  console.log(cells.join(' '));
}

console.log('\nChroma error (lower is better, 8-bit units)\n');
for (const sceneName of SCENES) {
  const cells = [sceneName.padEnd(14)];
  for (const method of METHOD_IDS) {
    const { metrics } = runPipeline({ ...CLEAN, sceneName, width: 160, height: 120, method });
    cells.push(metrics.chromaError.toFixed(2).padStart(16));
  }
  console.log(cells.join(' '));
}

console.log('\nTimings for one 384x216 frame (ms)\n');
for (const method of METHOD_IDS) {
  const result = runPipeline({ sceneName: 'photo', width: 384, height: 216, method, iso: 400 });
  const t = result.timings;
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  console.log(
    `${method.padEnd(16)} total ${total.toFixed(1).padStart(6)}  ` +
      `scene ${t.scene.toFixed(1)}  filter ${t.filter.toFixed(1)}  ` +
      `expose ${t.expose.toFixed(1)}  mosaic ${t.mosaic.toFixed(1)}  ` +
      `demosaic ${t.demosaic.toFixed(1)}  develop ${t.develop.toFixed(1)}  ` +
      `metrics ${t.metrics.toFixed(1)}`,
  );
}

console.log('\nOne explained pixel (Hamilton-Adams, 384x216 photo, pixel 200,100)\n');
const result = runPipeline({ sceneName: 'photo', width: 384, height: 216, method: 'hamiltonAdams' });
const { explainPixel } = await import('../src/engine/index.js');
const explained = explainPixel({
  mosaic: result.mosaic,
  mask: result.mask,
  width: result.width,
  height: result.height,
  x: 200,
  y: 100,
  method: 'hamiltonAdams',
  detail: result.demosaic.detail,
});
console.log(explained.sentence);
for (const channel of explained.channels) {
  console.log(`  channel ${channel.channel}: ${channel.value.toFixed(1)}  (${channel.formula})`);
}
