// Frame the method table against the error map.
const table = document.getElementById('method-table');
table.closest('figure, div, section').scrollIntoView({ block: 'center' });
await new Promise((resolve) => setTimeout(resolve, 800));

const headers = [...document.querySelectorAll('.method-table thead th')].map((th) => th.textContent.trim());
const rows = [...document.querySelectorAll('#method-table tr')].map((tr) => ({
  cells: [...tr.children].map((cell) => cell.textContent.trim()),
  width: Math.round(tr.getBoundingClientRect().width),
}));

return { headers, rows, tableWidth: Math.round(table.getBoundingClientRect().width) };
