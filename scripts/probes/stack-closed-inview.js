// Bring the stack into view and hold it closed, so the state a visitor actually
// sees at rest can be judged (the section starts closed and scrolls open).
const stage = document.getElementById('stack-stage');
const top = stage.getBoundingClientRect().top + window.scrollY;
window.scrollTo(0, Math.round(top - window.innerHeight * 0.25));
await new Promise((resolve) => setTimeout(resolve, 900));

const stack = window.__stack;
if (!stack) return { error: 'no __stack handle' };

stack.setSpread(0);
stack.renderer.render(stack.scene, stack.camera);
await new Promise((resolve) => requestAnimationFrame(resolve));

return {
  spread: stack.getSpread(),
  stageSpread: stage.dataset.spread,
  readout: document.getElementById('stack-readout').textContent,
};
