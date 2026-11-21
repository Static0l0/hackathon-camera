// Scroll the stack into view, let the layers separate, then hide the photon
// cloud so the solid layers can be judged on their own.
const stage = document.getElementById('stack-stage');
const top = stage.getBoundingClientRect().top + window.scrollY;
window.scrollTo(0, Math.round(top - window.innerHeight * 0.25));
await new Promise((resolve) => setTimeout(resolve, 900));

const stack = window.__stack;
if (!stack) return { error: 'no __stack handle' };
stack.layers.photons.visible = false;
stack.renderer.render(stack.scene, stack.camera);
await new Promise((resolve) => requestAnimationFrame(resolve));

return {
  spread: stage.dataset.spread,
  dots: stack.layers.photons.geometry.drawRange.count,
};
