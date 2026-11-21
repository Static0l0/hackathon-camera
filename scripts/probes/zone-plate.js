// Put the zone plate on screen: the scene where interpolation has to guess
// detail smaller than the filter pitch.
const select = [...document.querySelectorAll('#reconstruct-grid select')].find((element) =>
  [...element.options].some((option) => option.value === 'zonePlate'),
);
select.value = 'zonePlate';
select.dispatchEvent(new Event('change', { bubbles: true }));

const started = Date.now();
while (Date.now() - started < 4000) {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const rows = document.querySelectorAll('#method-table tr').length;
  const first = document.querySelector('#method-table tr .method-number')?.textContent;
  if (rows === 4 && first && first !== '36.98') break;
}

await new Promise((resolve) => setTimeout(resolve, 400));

return {
  scene: select.value,
  rows: [...document.querySelectorAll('#method-table tr')].map((tr) =>
    tr.textContent.replace(/\s+/g, ' ').trim(),
  ),
  caption: document.getElementById('error-caption').textContent.trim(),
};
