import fs from 'node:fs/promises';

const [main, hotfix, shell] = await Promise.all([
  fs.readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/ops-hotfix.css', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/components/OpsShell.tsx', import.meta.url), 'utf8'),
]);

const opsIndex = main.indexOf("./ops.css");
const hotfixIndex = main.indexOf("./ops-hotfix.css");
if (opsIndex < 0 || hotfixIndex < 0 || hotfixIndex < opsIndex) {
  throw new Error('Ops layout hotfix must load after ops.css.');
}

if (!/\.app-shell\s*\{[^}]*display:\s*block\s*!important/s.test(hotfix)) {
  throw new Error('Ops hotfix must remove the legacy two-column grid from .app-shell.');
}
if (!/\.main-area\s*\{[^}]*width:\s*100%\s*!important/s.test(hotfix)) {
  throw new Error('Ops hotfix must keep the legacy workspace content at full width.');
}

for (const destination of ["setSection('work')", "setSection('settings')"]) {
  if (!shell.includes(destination)) throw new Error(`Ops shell is missing ${destination}.`);
}

console.log('Deme Ops layout validated: Work and Settings cannot collapse into the hidden sidebar grid column.');
