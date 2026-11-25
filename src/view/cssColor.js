/**
 * Read a design token as an actual colour.
 *
 * Canvas code cannot inherit a custom property, so a drawing that has to match
 * the page — the loupe, the Bayer diagram, the three.js clear colour — reads the
 * token instead of repeating its value. Read at call time, never cached: the
 * reader can switch the theme between two frames.
 */

/** @param {string} raw a CSS colour as authored in the token block */
function parse(raw) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const full = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(raw);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/**
 * @param {string} name custom property name, including the leading `--`
 * @param {[number, number, number]} fallback used when the token is missing
 * @returns {[number, number, number]}
 */
export function readColour(name, fallback) {
  const style = getComputedStyle(document.documentElement);
  return parse(style.getPropertyValue(name).trim()) ?? fallback;
}

/**
 * @param {[number, number, number]} rgb
 * @returns {string} a CSS colour
 */
export function cssRgb([r, g, b]) {
  return `rgb(${r} ${g} ${b})`;
}

/**
 * Relative luminance, 0 to 1, for choosing ink or paper on top of a fill.
 *
 * @param {[number, number, number]} rgb
 */
export function luminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
