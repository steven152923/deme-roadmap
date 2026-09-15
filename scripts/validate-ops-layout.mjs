import fs from 'node:fs/promises';

const [main, hotfix, shell, overlays] = await Promise.all([
  fs.readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/ops-hotfix.css', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/components/OpsShell.tsx', import.meta.url), 'utf8'),
  fs.readFile(new URL('../src/components/Overlays.tsx', import.meta.url), 'utf8'),
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
if (!/\.modal-backdrop[\s\S]*?z-index:\s*220\s*!important/s.test(hotfix)) {
  throw new Error('Ops hotfix must keep legacy modal editors above the Ops shell.');
}
if (!/\.drawer-backdrop[\s\S]*?z-index:\s*220\s*!important/s.test(hotfix)) {
  throw new Error('Ops hotfix must keep card drawers above the Ops shell.');
}

for (const destination of ["setSection('work')", "setSection('settings')"]) {
  if (!shell.includes(destination)) throw new Error(`Ops shell is missing ${destination}.`);
}

if (!overlays.includes('const [draft, setDraft] = useState<RoadmapRelease | null>')) {
  throw new Error('ReleaseEditor must keep a local draft so typing cannot be reset by parent refreshes.');
}
if (!overlays.includes('value={draft.name}') || !overlays.includes('value={draft.status}') || !overlays.includes('value={draft.targetDate}') || !overlays.includes('value={draft.notes}')) {
  throw new Error('ReleaseEditor fields must be bound to the local draft.');
}

console.log('Deme Ops layout validated: workspace pages and release editors remain interactive above the Ops shell.');
