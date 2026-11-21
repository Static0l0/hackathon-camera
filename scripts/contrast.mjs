const hex = (value) => value.replace('#', '').match(/../g).map((pair) => parseInt(pair, 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (value) => {
  const [r, g, b] = hex(value).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const ground = '#0c0c0b';
const pairs = [
  ['text', '#e8e3d6'],
  ['text-dim', '#8c8a80'],
  ['accent', '#f5b301'],
  ['red', '#d6452f'],
  ['green', '#4c9a52'],
  ['blue', '#3566c9'],
  ['rule', '#2b2b27'],
];

for (const [name, value] of pairs) {
  console.log(`${name.padEnd(9)} ${value}  on ground ${ratio(value, ground).toFixed(2)}:1`);
}
console.log(`amber on red  ${ratio('#f5b301', '#d6452f').toFixed(2)}:1`);
