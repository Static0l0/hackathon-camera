// Everything a judge touches must still work after the layout rewrite.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clickInfo = {};

// Divider drag.
const divider = document.getElementById('divider');
const viewer = document.getElementById('viewer-canvas');
const box = viewer.getBoundingClientRect();
const x0 = Math.round(box.x + box.width / 2), y0 = Math.round(box.y + box.height / 2);
const send = (type, x, y, extra = {}) => viewer.dispatchEvent(
  new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true, ...extra }),
);
send('pointerdown', x0, y0, { buttons: 1 });
send('pointermove', x0 + 120, y0, { buttons: 1 });
send('pointerup', x0 + 120, y0);
await sleep(300);
clickInfo.divider = divider.getAttribute('aria-valuenow');

// Pixel click -> explanation.
send('pointerdown', x0, y0, { buttons: 1 });
send('pointerup', x0, y0);
await sleep(600);
clickInfo.explain = document.querySelector('.explain-sentence')?.textContent?.slice(0, 60) ?? null;

// Green rule -> compare table changes.
const rule = document.getElementById('control-greenRule');
const scene = document.getElementById('control-sceneName');
scene.value = 'zonePlate'; scene.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(900);
const tableBefore = [...document.querySelectorAll('#method-table tr')].map((r) => r.textContent.trim());
rule.value = 'vertical'; rule.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(900);
const tableAfter = [...document.querySelectorAll('#method-table tr')].map((r) => r.textContent.trim());

// Stack slider.
const stack = document.getElementById('stack-separation');
stack.value = '0'; stack.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(300);

// Print.
document.getElementById('print-expose').click();
await sleep(700);

return {
  divider: clickInfo.divider,
  explain: clickInfo.explain,
  tableChanged: tableBefore.join() !== tableAfter.join(),
  tableBefore: tableBefore[2],
  tableAfter: tableAfter[2],
  stackSpread: document.getElementById('stack-stage')?.dataset.spread,
  printStatus: document.getElementById('print-status')?.textContent.trim().slice(0, 60),
  help: Boolean(document.getElementById('help-toggle')),
  sound: Boolean(document.getElementById('sound-toggle')),
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
};
