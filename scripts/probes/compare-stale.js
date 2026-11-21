const select = [...document.querySelectorAll('#reconstruct-grid select')].find((element) =>
  [...element.options].some((option) => option.value === 'zonePlate'),
);
select.value = 'zonePlate';
select.dispatchEvent(new Event('change', { bubbles: true }));
await new Promise((resolve) => setTimeout(resolve, 3000));

const automatic = [...document.querySelectorAll('#method-table tr')].map((tr) =>
  tr.textContent.replace(/\s+/g, ' ').trim(),
);

window.__mosaic.client.requestCompare(window.__mosaic.settings);
await new Promise((resolve) => setTimeout(resolve, 2000));

return {
  settingsScene: window.__mosaic.settings.sceneName,
  automatic,
  manual: [...document.querySelectorAll('#method-table tr')].map((tr) =>
    tr.textContent.replace(/\s+/g, ' ').trim(),
  ),
};
