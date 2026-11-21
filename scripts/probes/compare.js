const before = document.querySelectorAll('#method-table tr').length;
window.__mosaic.client.requestCompare(window.__mosaic.settings);
await new Promise((resolve) => setTimeout(resolve, 1500));
const rows = [...document.querySelectorAll('#method-table tr')].map((tr) =>
  tr.textContent.replace(/\s+/g, ' ').trim(),
);
return {
  before,
  after: rows.length,
  rows,
  status: document.getElementById('viewer-status')?.textContent ?? '',
  note: document.getElementById('method-note')?.textContent.trim().slice(0, 40) ?? '',
};
