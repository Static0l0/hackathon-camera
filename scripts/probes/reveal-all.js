// Scroll the whole page once so every ScrollTrigger fires, then come back to
// the top. Without this a full-page capture shows unmasked headings, which
// looks like a bug and is really just an untriggered animation.
const step = window.innerHeight * 0.6;
const bottom = document.documentElement.scrollHeight;

for (let y = 0; y < bottom; y += step) {
  window.scrollTo(0, y);
  await new Promise((resolve) => setTimeout(resolve, 90));
}

window.scrollTo(0, bottom);
await new Promise((resolve) => setTimeout(resolve, 250));
window.scrollTo(0, 0);
await new Promise((resolve) => setTimeout(resolve, 350));

const headings = [...document.querySelectorAll('[data-reveal]')].map((element) => {
  const rect = element.getBoundingClientRect();
  return { text: element.textContent.trim().slice(0, 28), height: Math.round(rect.height) };
});

return { headings, scrollHeight: bottom };
