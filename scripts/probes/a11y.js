// The part of accessibility a screenshot cannot show: what a screen reader and a
// keyboard actually get.
const focusables = Array.from(
  document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
).filter((el) => el.offsetParent !== null || el === document.activeElement);

const viewer = document.getElementById('viewer-canvas');
const divider = document.getElementById('divider');
const skip = document.querySelector('.skip-link');

// Tab order: the skip link must come first, and the viewer must be reachable.
const order = focusables.slice(0, 6).map((el) => el.id || el.className || el.tagName.toLowerCase());

// Does the divider announce a value in words, not just a number?
const dividerText = {
  role: divider.getAttribute('role'),
  now: divider.getAttribute('aria-valuenow'),
  text: divider.getAttribute('aria-valuetext'),
  label: divider.getAttribute('aria-label'),
};

// Every control needs a name.
const unnamed = Array.from(document.querySelectorAll('input, select')).filter((el) => {
  const id = el.id;
  const labelled = id && document.querySelector(`label[for="${id}"]`);
  return !labelled && !el.getAttribute('aria-label') && !el.closest('label');
}).map((el) => el.id || el.type);

return {
  skipFirst: order[0] === 'skip-link',
  order,
  viewerRole: viewer.getAttribute('role'),
  viewerLabel: (viewer.getAttribute('aria-label') ?? '').slice(0, 48),
  viewerTabIndex: viewer.tabIndex,
  dividerText,
  unnamedControls: unnamed,
  liveRegions: document.querySelectorAll('[aria-live], [role="status"]').length,
  cursorAriaHidden: document.querySelector('.pick-cursor')?.getAttribute('aria-hidden'),
  skipVisible: skip ? getComputedStyle(skip).position : 'missing',
  lang: document.documentElement.lang,
  title: document.title,
};
