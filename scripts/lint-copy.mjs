// Manual STE-style check on the copy that ships in the HTML and JS.
// Reports sentences over 25 words and banned marketing words.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = [
  'index.html',
  'README.md',
  'src/main.js',
  'src/view/guessDemo.js',
  'src/view/explainPanel.js',
  'src/view/readouts.js',
  'src/view/printStudio.js',
  'src/view/controls.js',
  'src/engine/explain.js',
  'src/engine/demosaic/hamiltonAdams.js',
  'src/engine/demosaic/bilinear.js',
  'src/engine/demosaic/nearest.js',
  'src/engine/demosaic/malvarHeCutler.js',
];

const banned = ['seamless', 'robust', 'powerful', 'cutting-edge', 'effortless', 'revolutionary', 'world-class', 'next-generation', 'supercharge', 'unlock', 'facilitate', 'utilize', 'leverage'];

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const word of banned) {
    if (text.toLowerCase().includes(word)) findings.push({ file, type: 'banned word', value: word });
  }
  // Pull single-quoted and template strings that contain prose.
  const strings = text.match(/'[^'\n]{30,}'|`[^`\n]{30,}`/g) ?? [];
  for (const raw of strings) {
    const value = raw.slice(1, -1).replace(/\$\{[^}]*\}/g, 'X');
    if (!/[a-z] [a-z] [a-z]/.test(value)) continue;
    const sentence = value.split(/(?<=[.!?])\s+/)[0];
    const words = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (words > 25) findings.push({ file, type: `${words}-word sentence`, value: sentence.trim().slice(0, 90) });
  }
}

console.log(JSON.stringify(findings.slice(0, 30), null, 2));
console.log(`total findings: ${findings.length}`);
