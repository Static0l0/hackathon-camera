// Sound is on by default, the toggle reads correctly, and tapping a control
// resumes the AudioContext without console errors.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const button = document.getElementById('sound-toggle');

const before = {
  label: button.textContent.trim(),
  pressed: button.getAttribute('aria-pressed'),
  stored: localStorage.getItem('mosaic:sound'),
};

// A real gesture: the harness dispatches pointer events on the viewer, which the
// audio module listens for once. Then a click should produce a sound.
const viewer = document.getElementById('viewer-canvas');
const box = viewer.getBoundingClientRect();
viewer.dispatchEvent(new PointerEvent('pointerdown', {
  clientX: box.x + box.width / 2,
  clientY: box.y + box.height / 2,
  bubbles: true, pointerId: 1, isPrimary: true,
}));
await sleep(300);

// Toggling off then on must update the label and persist the choice.
button.click();
await sleep(150);
const muted = { label: button.textContent.trim(), pressed: button.getAttribute('aria-pressed'), stored: localStorage.getItem('mosaic:sound') };
button.click();
await sleep(150);
const unmuted = { label: button.textContent.trim(), pressed: button.getAttribute('aria-pressed'), stored: localStorage.getItem('mosaic:sound') };

return { before, muted, unmuted, psnr: document.getElementById('top-psnr').textContent };
