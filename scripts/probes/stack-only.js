// Hold the stack closed and show only the layers named in ?only=a,b — the only
// way to tell which layer is painting the pale slab in the closed state.
const stage = document.getElementById('stack-stage');
const top = stage.getBoundingClientRect().top + window.scrollY;
window.scrollTo(0, Math.round(top - window.innerHeight * 0.25));
await new Promise((resolve) => setTimeout(resolve, 900));

const stack = window.__stack;
if (!stack) return { error: 'no __stack handle' };

const only = (new URLSearchParams(location.search).get('only') ?? '').split(',').filter(Boolean);
stack.setSpread(0);
for (const [name, layer] of Object.entries(stack.layers)) {
  layer.visible = only.includes(name);
}
stack.renderer.render(stack.scene, stack.camera);
await new Promise((resolve) => requestAnimationFrame(resolve));

return { only, spread: stack.getSpread() };
