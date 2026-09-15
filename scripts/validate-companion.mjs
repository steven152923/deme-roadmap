import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../electron/companion.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Companion inline script was not found.');

const source = match[1].replaceAll('__MAX_ATTACHMENT__', String(20 * 1024 * 1024));
new vm.Script(source, { filename: 'electron/companion.inline.js' });

for (const required of ['Deme Ops', 'data-tab="home"', 'data-tab="add"', 'data-tab="work"', 'data-tab="signals"']) {
  if (!html.includes(required)) throw new Error(`Companion is missing required marker: ${required}`);
}

if (/data-tab="(notes|bugs|release|incoming|capture)"/.test(html)) {
  throw new Error('Legacy permanent companion tabs were reintroduced.');
}

console.log('Deme Ops companion validated: inline JS parses and 4-tab navigation is intact.');
