import { cases as rawCases, suites as rawSuites } from '../docs/qase/deme-qa-catalog.mjs';

export type QARisk = 'P0' | 'P1' | 'P2' | 'P3';

export interface QACatalogCase {
  suite: string;
  title: string;
  risk: QARisk;
  preconditions: string;
  steps: [string, string][];
  description?: string;
}

export const QA_CASES = rawCases as QACatalogCase[];
export const QA_SUITES = rawSuites as string[];

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
