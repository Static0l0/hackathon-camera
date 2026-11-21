// Report what each layer actually is: its world height, its child count, and
// whether its material is tinted yet. Guessing from a screenshot is how the
// white slab happened.
const stack = window.__stack;
if (!stack) return { error: 'no __stack handle' };

const report = {};
for (const [name, layer] of Object.entries(stack.layers)) {
  const material = layer.material ?? layer.children?.[0]?.material;
  report[name] = {
    y: Number(layer.position.y.toFixed(2)),
    visible: layer.visible,
    count: layer.count ?? layer.children.length,
    colour: material?.color?.getHexString?.() ?? null,
    opacity: material?.opacity ?? null,
    hasInstanceColour: Boolean(layer.instanceColor),
    firstInstanceColour: layer.instanceColor
      ? Array.from(layer.instanceColor.array.slice(0, 3)).map((v) => Number(v.toFixed(2)))
      : null,
  };
}

return {
  layers: report,
  camera: {
    position: stack.camera.position.toArray().map((v) => Number(v.toFixed(2))),
  },
};
