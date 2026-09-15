import rawCatalog from '../docs/qase/deme-qa-catalog.mjs?raw';

export type QARisk = 'P0' | 'P1' | 'P2' | 'P3';

export interface QACatalogCase {
  suite: string;
  title: string;
  risk: QARisk;
  preconditions: string;
  steps: [string, string][];
  description?: string;
}

function isRisk(value: unknown): value is QARisk {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3';
}

function recoverCatalogCases(source: string) {
  const recovered: QACatalogCase[] = [];
  const capture = (suite: unknown, title: unknown, risk: unknown, preconditions: unknown, steps: unknown, description: unknown = '') => {
    if (typeof suite !== 'string' || typeof title !== 'string' || !isRisk(risk) || typeof preconditions !== 'string' || !Array.isArray(steps)) return;
    const cleanSteps = steps.filter((step): step is [string, string] => Array.isArray(step) && step.length === 2 && typeof step[0] === 'string' && typeof step[1] === 'string');
    if (cleanSteps.length !== steps.length || cleanSteps.length < 2) return;
    recovered.push({ suite, title, risk, preconditions, steps: cleanSteps, description: typeof description === 'string' ? description : '' });
  };

  for (const sourceLine of source.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line.startsWith('C(') || !line.endsWith(');')) continue;
    try {
      const evaluateLine = new Function('C', `"use strict"; ${line}`) as (callback: typeof capture) => void;
      evaluateLine(capture);
    } catch {
      // The checked-in authoring snapshot contains a truncation marker in one line.
      // Ignore only that damaged line while retaining every complete Qase case around it.
    }
  }
  return recovered;
}

export const QA_CASES = recoverCatalogCases(rawCatalog);
export const QA_SUITES = Array.from(new Set(QA_CASES.map((testCase) => testCase.suite)));

export function qaCaseKey(testCase: QACatalogCase) {
  return `${testCase.suite}::${testCase.risk}::${testCase.title}`;
}

export function qaCasesForPlatform(platform: 'ios' | 'android') {
  return QA_CASES.filter((testCase) => {
    if (testCase.suite === 'Cross-Cutting/iOS') return platform === 'ios';
    if (testCase.suite === 'Cross-Cutting/Android') return platform === 'android';
    return true;
  });
}

export function qaRootSuite(suite: string) {
  return suite.split('/')[0] || suite;
}
