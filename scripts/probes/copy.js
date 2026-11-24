// Check the rewritten copy: short sentences, no banned words, real values shown.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pick = async (id, value, wait = 900) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(wait);
};

const viewer = document.getElementById('viewer-canvas');
const box = viewer.getBoundingClientRect();
const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
viewer.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true }));
viewer.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true }));
await sleep(600);

const firstChoice = document.querySelector('.guess-choice');
firstChoice?.click();
await sleep(200);

const text = {
  intro: document.querySelector('.intro p')?.textContent.trim(),
  topIdea: document.querySelector('.topbar-idea')?.textContent.trim(),
  lead: document.querySelector('.guess-lead')?.textContent.trim(),
  ask: document.querySelector('.guess-ask')?.textContent.trim(),
  verdict: document.querySelector('.guess-verdict')?.textContent.trim(),
  explain: document.querySelector('.explain-sentence')?.textContent.trim(),
  viewerStatus: document.getElementById('viewer-status')?.textContent.trim(),
  readouts: [...document.querySelectorAll('#readouts-grid dt')].map((n) => n.textContent.trim()),
};

const banned = ['seamless', 'robust', 'powerful', 'cutting-edge', 'effortless', 'revolutionary', 'unlock', 'supercharge'];
const all = Object.values(text).join(' ').toLowerCase();
const violations = banned.filter((w) => all.includes(w));

return { text, violations, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
