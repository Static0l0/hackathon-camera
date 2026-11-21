// Can the depth feature be reached without a mouse?
const viewer = document.getElementById('viewer-canvas');
const cursor = document.querySelector('.pick-cursor');

viewer.focus();
const press = (key) => viewer.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

press('ArrowRight');
press('ArrowRight');
press('ArrowRight');
press('Enter');
await new Promise((resolve) => setTimeout(resolve, 500));

const body = document.getElementById('explain-body');

return {
  focused: document.activeElement === viewer,
  cursorHidden: cursor.hidden,
  cursorLeft: cursor.style.left,
  loupeVisible: !document.getElementById('loupe').hidden,
  sentence: body.querySelector('.explain-sentence')?.textContent ?? body.textContent.trim().slice(0, 140),
  gridRows: body.querySelectorAll('.explain-channel').length,
};
