// Confirm the newly merged features are on the deployed site.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const found = {
  printSection: Boolean(document.getElementById('print')),
  printCanvas: Boolean(document.getElementById('print-canvas')),
  treatments: document.querySelectorAll('#treatment-grid button, #treatment-grid .treatment').length,
  soundToggle: Boolean(document.getElementById('sound-toggle')),
  helpToggle: Boolean(document.getElementById('help-toggle')),
  greenRule: Boolean(document.getElementById('control-greenRule')),
};

const help = document.getElementById('help-toggle');
if (help) {
  help.click();
  await sleep(300);
  found.helpOpens = document.getElementById('help')?.hidden === false;
  document.getElementById('help-close')?.click();
  await sleep(200);
}

const expose = document.getElementById('print-expose');
if (expose) {
  expose.click();
  await sleep(600);
  found.printStatus = document.getElementById('print-status')?.textContent.trim().slice(0, 90) ?? null;
}

return {
  url: location.pathname,
  found,
  rows: document.querySelectorAll('#method-table tr').length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
};
