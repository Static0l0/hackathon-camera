/**
 * Contrast audit for the two paint schemes in `src/style.css`.
 *
 * Every number in `DESIGN_NOTES.md` comes from this file, so the claims in the
 * documentation can be re-derived instead of trusted. Run `node scripts/contrast.mjs`.
 */

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

const verdictFor = (value) =>
  value >= 7 ? 'AAA' : value >= 4.5 ? 'AA text' : value >= 3 ? 'graphic only (3:1)' : 'fails even 3:1';

const THEMES = {
  light: {
    paper: '#f2efe6',
    card: '#f8f6ef',
    sunk: '#e7e3d6',
    night: '#17150f',
    ink: '#191814',
    ink2: '#55514a',
    ink3: '#6f6a5e',
    red: '#c8442c',
    green: '#3f8c4a',
    blue: '#2f5fb0',
  },
  dark: {
    paper: '#131210',
    card: '#1c1a15',
    sunk: '#0e0d0b',
    night: '#0a0908',
    ink: '#efeade',
    ink2: '#b7b1a3',
    ink3: '#948e80',
    red: '#e2715a',
    green: '#71bd7e',
    blue: '#82a8f0',
  },
};

for (const [theme, t] of Object.entries(THEMES)) {
  console.log(`\n${theme}`);
  const rows = [
    ['ink on paper', t.ink, t.paper],
    ['ink on card', t.ink, t.card],
    ['ink-2 on paper', t.ink2, t.paper],
    ['ink-3 on paper', t.ink3, t.paper],
    ['ink-3 on sunk', t.ink3, t.sunk],
    ['paper on night', t.paper, t.night],
    ['ink-3 on night', t.ink3, t.night],
    ['data red on paper', t.red, t.paper],
    ['data green on paper', t.green, t.paper],
    ['data blue on paper', t.blue, t.paper],
  ];

  for (const [name, fg, bg] of rows) {
    const value = ratio(fg, bg);
    console.log(`  ${name.padEnd(20)} ${fg} on ${bg}  ${value.toFixed(2)}:1  ${verdictFor(value)}`);
  }

  // The Bayer tiles carry a single letter each, and the letters switch between
  // ink and paper by the fill's own luminance, so both poles are listed.
  console.log('');
  for (const [name, value] of [
    ['R tile', t.red],
    ['G tile', t.green],
    ['B tile', t.blue],
  ]) {
    console.log(
      `  ink on ${name.padEnd(8)} ${value}  ${ratio(t.ink, value).toFixed(2)}:1` +
        `   paper: ${ratio(t.paper, value).toFixed(2)}:1`,
    );
  }
}
