import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sourcePath = path.join(root, 'docs', 'qase', 'deme-qa-catalog.mjs');
const outputPath = path.join(root, 'src', 'qaCatalog.generated.json');

const source = await readFile(sourcePath, 'utf8');
const cases = [];
let damagedLines = 0;

function isRisk(value) {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3';
}

function capture(suite, title, risk, preconditions, steps, description = '') {
  if (typeof suite !== 'string' || typeof title !== 'string' || !isRisk(risk) || typeof preconditions !== 'string' || !Array.isArray(steps)) return;
  const cleanSteps = steps.filter((step) => Array.isArray(step) && step.length === 2 && typeof step[0] === 'string' && typeof step[1] === 'string');
  if (cleanSteps.length !== steps.length || cleanSteps.length < 2) return;
  cases.push({ suite, title, risk, preconditions, steps: cleanSteps, description: typeof description === 'string' ? description : '' });
}

for (const sourceLine of source.split(/\r?\n/)) {
  const line = sourceLine.trim();
  if (!line.startsWith('C(') || !line.endsWith(');')) continue;
  try {
    const evaluate = new Function('C', `"use strict"; ${line}`);
    evaluate(capture);
  } catch {
    damagedLines += 1;
  }
}

if (cases.length < 20) {
  throw new Error(`QA catalog generation recovered only ${cases.length} cases. Refusing to build a broken QA workspace.`);
}

const suites = [...new Set(cases.map((testCase) => testCase.suite))];
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ version: 1, cases, suites }, null, 2)}\n`, 'utf8');

console.log(`QA catalog generated: ${cases.length} cases across ${suites.length} suites${damagedLines ? `; skipped ${damagedLines} damaged line${damagedLines === 1 ? '' : 's'}` : ''}.`);
