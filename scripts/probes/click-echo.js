// Click a pixel in the hook and read what the page says right there.
const viewer = document.getElementById('viewer-canvas');
const box = viewer.getBoundingClientRect();
const x = Math.round(box.left + box.width * 0.3);
const y = Math.round(box.top + box.height * 0.45);

viewer.dispatchEvent(
  new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }),
);
viewer.dispatchEvent(
  new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1 }),
);
await new Promise((resolve) => setTimeout(resolve, 600));

return {
  status: document.getElementById('viewer-status')?.textContent ?? null,
  loupe: !document.getElementById('loupe').hidden,
  guess: document.querySelector('.guess-lead')?.textContent ?? null,
  labSentence: document.querySelector('.explain-sentence')?.textContent ?? null,
};
