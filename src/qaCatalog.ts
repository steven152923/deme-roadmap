import generatedCatalog from './qaCatalog.generated.json';

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

function normaliseCase(value: unknown): QACatalogCase | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.suite !== 'string' || typeof raw.title !== 'string' || !isRisk(raw.risk) || typeof raw.preconditions !== 'string' || !Array.isArray(raw.steps)) return null;
  const steps = raw.steps.filter((step): step is [string, string] => Array.isArray(step) && step.length === 2 && typeof step[0] === 'string' && typeof step[1] === 'string');
  if (steps.length !== raw.steps.length || steps.length < 2) return null;
  return {
    suite: raw.suite,
    title: raw.title,
    risk: raw.risk,
    preconditions: raw.preconditions,
    steps,
    description: typeof raw.description === 'string' ? raw.description : '',
  };
}

const generated = generatedCatalog as unknown as { cases?: unknown[]; suites?: unknown[] };
export const QA_CASES = (generated.cases ?? []).map(normaliseCase).filter((testCase): testCase is QACatalogCase => Boolean(testCase));
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
