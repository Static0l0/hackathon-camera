// Geometry and type inventory for the unslop audit.
const pick = (selector) => {
  const element = document.querySelector(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    selector,
    x: Math.round(box.x),
    y: Math.round(box.y + window.scrollY),
    w: Math.round(box.width),
    h: Math.round(box.height),
    font: style.fontFamily.split(',')[0].replace(/"/g, ''),
    size: style.fontSize,
    weight: style.fontWeight,
    transform: style.textTransform,
    tracking: style.letterSpacing,
    colour: style.color,
  };
};

const geometry = [
  '.masthead h1',
  '.masthead .lede',
  '.eyebrow',
  '#hook .fig',
  '#hook .heading',
  '#hook .section-note',
  '#hook #viewer',
  '#photons .fig',
  '#photons .heading',
  '#photons .section-note',
  '#photons #stack-stage',
  '#photons .capture',
  '#pattern .fig',
  '#pattern .heading',
  '#pattern .section-note',
  '#pattern #bayer-canvas',
  '#guess .fig',
  '#guess .heading',
  '#guess .section-note',
  '#guess #guess-demo',
  '#guess #reconstruct-grid',
  '#guess #method-table',
  '#lab .fig',
  '#lab .heading',
  '#lab #readouts-grid',
  '.colophon',
].map(pick);

const uppercase = [...document.querySelectorAll('body *')]
  .filter((element) => {
    if (!element.textContent || element.children.length > 0) return false;
    const style = getComputedStyle(element);
    return style.textTransform === 'uppercase' && element.textContent.trim().length > 1;
  })
  .map((element) => ({
    text: element.textContent.trim().slice(0, 40),
    size: getComputedStyle(element).fontSize,
    tracking: getComputedStyle(element).letterSpacing,
  }));

const radii = [...new Set([...document.querySelectorAll('body *')]
  .map((element) => getComputedStyle(element).borderTopLeftRadius)
  .filter((value) => value !== '0px'))].slice(0, 12);

const shadows = [...new Set([...document.querySelectorAll('body *')]
  .map((element) => getComputedStyle(element).boxShadow)
  .filter((value) => value !== 'none'))].slice(0, 6);

const gradients = [...new Set([...document.querySelectorAll('body *')]
  .map((element) => getComputedStyle(element).backgroundImage)
  .filter((value) => value.includes('gradient')))].slice(0, 6);

return {
  viewport: [innerWidth, innerHeight],
  docHeight: document.documentElement.scrollHeight,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  geometry,
  uppercaseCount: uppercase.length,
  uppercase: uppercase.slice(0, 24),
  radii,
  shadows,
  gradients,
};
