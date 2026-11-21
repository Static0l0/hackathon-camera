/**
 * Page-side probe: pick the same pixel under all four demosaic methods and report
 * what the explanation panel says for each.
 *
 * This is browser code, not Node code — scripts/shot.mjs wraps it in an async
 * function and awaits it. Kept in its own file because a multi-line script cannot
 * survive a shell argument.
 */
const results = [];
const select = document.getElementById('control-method');
const canvas = document.getElementById('viewer-canvas');
const rect = canvas.getBoundingClientRect();

async function pick(fx, fy) {
  const x = rect.x + rect.width * fx;
  const y = rect.y + rect.height * fy;
  for (const type of ['pointerdown', 'pointerup']) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        clientX: x,
        clientY: y,
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        buttons: type === 'pointerdown' ? 1 : 0,
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  return document.getElementById('explain-body').innerText;
}

for (const method of ['nearest', 'bilinear', 'hamiltonAdams', 'malvarHeCutler']) {
  select.value = method;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const text = await pick(0.62, 0.42);
  const channels = text.split('\n').filter((line) => /DN$/.test(line));
  results.push({
    method,
    heading: text.split('\n').slice(0, 3).join(' | '),
    channelCount: channels.length,
    values: channels,
    hasKernel: /weighted sum/.test(text) || /dH/.test(text),
  });
}

return results;
