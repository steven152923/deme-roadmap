import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardCheck,
  ExternalLink,
  FlaskConical,
  MinusCircle,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import type { RoadmapCard, RoadmapRelease } from '../types';
import { qaCaseKey, qaCasesForPlatform, qaRootSuite, type QACatalogCase, type QARisk } from '../qaCatalog';
import '../qa.css';

export type QAPlatform = 'ios' | 'android';
export type QACaseStatus = 'untested' | 'passed' | 'failed' | 'blocked' | 'skipped';

export interface QACaseResult {
  status: QACaseStatus;
  actualResult: string;
  notes: string;
  linkedCardId: string;
  updatedAt: string;
}

export interface QARunDetails {
  title: string;
  environment: string;
  releaseId: string;
  device: string;
  osVersion: string;
  build: string;
  tester: string;
  results: Record<string, QACaseResult>;
}

interface QAStoredState {
  version: 1;
  activePlatform: QAPlatform;
  runs: Record<QAPlatform, QARunDetails>;
}

export interface QABugInput {
  platform: QAPlatform;
  testCase: QACatalogCase;
  result: QACaseResult;
  run: QARunDetails;
}

const STORAGE_KEY = 'deme-roadmap.qa-workspace.v1';
const STATUS_ORDER: QACaseStatus[] = ['untested', 'passed', 'failed', 'blocked', 'skipped'];
const STATUS_LABEL: Record<QACaseStatus, string> = {
  untested: 'Untested',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
};

function emptyResult(): QACaseResult {
  return { status: 'untested', actualResult: '', notes: '', linkedCardId: '', updatedAt: '' };
}

function defaultRun(platform: QAPlatform): QARunDetails {
  const ios = platform === 'ios';
  return {
    title: `Deme Final QA - ${ios ? 'iOS' : 'Android'}`,
    environment: `${ios ? 'iOS' : 'Android'} Release Candidate`,
    releaseId: '',
    device: '',
    osVersion: '',
    build: '',
    tester: '',
    results: {},
  };
}

function defaultState(): QAStoredState {
  return { version: 1, activePlatform: 'ios', runs: { ios: defaultRun('ios'), android: defaultRun('android') } };
}

function stringValue(value: unknown) { return typeof value === 'string' ? value : ''; }
function validStatus(value: unknown): QACaseStatus { return STATUS_ORDER.includes(value as QACaseStatus) ? value as QACaseStatus : 'untested'; }

function normaliseResult(value: unknown): QACaseResult {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    status: validStatus(raw.status),
    actualResult: stringValue(raw.actualResult),
    notes: stringValue(raw.notes),
    linkedCardId: stringValue(raw.linkedCardId),
    updatedAt: stringValue(raw.updatedAt),
  };
}

function normaliseRun(value: unknown, platform: QAPlatform): QARunDetails {
  const fallback = defaultRun(platform);
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const results: Record<string, QACaseResult> = {};
  if (raw.results && typeof raw.results === 'object') {
    for (const [key, result] of Object.entries(raw.results as Record<string, unknown>)) results[key] = normaliseResult(result);
  }
  return {
    title: stringValue(raw.title) || fallback.title,
    environment: stringValue(raw.environment) || fallback.environment,
    releaseId: stringValue(raw.releaseId),
    device: stringValue(raw.device),
    osVersion: stringValue(raw.osVersion),
    build: stringValue(raw.build),
    tester: stringValue(raw.tester),
    results,
  };
}

function loadState(): QAStoredState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as Record<string, unknown> | null;
    if (!parsed) return defaultState();
    const runs = parsed.runs && typeof parsed.runs === 'object' ? parsed.runs as Record<string, unknown> : {};
    return {
      version: 1,
      activePlatform: parsed.activePlatform === 'android' ? 'android' : 'ios',
      runs: { ios: normaliseRun(runs.ios, 'ios'), android: normaliseRun(runs.android, 'android') },
    };
  } catch {
    return defaultState();
  }
}

function resultFor(run: QARunDetails, key: string) {
  return run.results[key] ?? emptyResult();
}

function statusIcon(status: QACaseStatus, size = 15) {
  if (status === 'passed') return <CheckCircle2 size={size} />;
  if (status === 'failed') return <XCircle size={size} />;
  if (status === 'blocked') return <AlertTriangle size={size} />;
  if (status === 'skipped') return <MinusCircle size={size} />;
  return <Circle size={size} />;
}

function riskClass(risk: QARisk) { return `risk-${risk.toLowerCase()}`; }

export function QAWorkspace({ releases, cards, search, onCreateBug, onOpenCard }: {
  releases: RoadmapRelease[];
  cards: RoadmapCard[];
  search: string;
  onCreateBug: (input: QABugInput) => string;
  onOpenCard: (id: string) => void;
}) {
  const [state, setState] = useState<QAStoredState>(() => loadState());
  const [rootFilter, setRootFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<QACaseStatus | 'all'>('all');
  const [riskFilter, setRiskFilter] = useState<QARisk | 'all'>('all');
  const [openCase, setOpenCase] = useState('');
  const platform = state.activePlatform;
  const run = state.runs[platform];

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* local-first fallback only */ }
  }, [state]);

  useEffect(() => {
    const preferred = releases.find((release) => release.status === 'active') ?? releases.find((release) => release.status === 'planned');
    if (!preferred) return;
    setState((current) => {
      let changed = false;
      const runs = { ...current.runs };
      for (const key of ['ios', 'android'] as QAPlatform[]) {
        if (!runs[key].releaseId) { runs[key] = { ...runs[key], releaseId: preferred.id }; changed = true; }
      }
      return changed ? { ...current, runs } : current;
    });
  }, [releases]);

  const platformCases = useMemo(() => qaCasesForPlatform(platform), [platform]);
  const roots = useMemo(() => Array.from(new Set(platformCases.map((testCase) => qaRootSuite(testCase.suite)))), [platformCases]);
  const counts = useMemo(() => {
    const next: Record<QACaseStatus, number> = { untested: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
    for (const testCase of platformCases) next[resultFor(run, qaCaseKey(testCase)).status] += 1;
    return next;
  }, [platformCases, run]);
  const reviewed = platformCases.length - counts.untested;
  const progress = platformCases.length ? Math.round(reviewed / platformCases.length * 100) : 0;
  const issueCount = counts.failed + counts.blocked;

  const visibleCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    return platformCases.filter((testCase) => {
      const key = qaCaseKey(testCase);
      const result = resultFor(run, key);
      if (rootFilter !== 'all' && qaRootSuite(testCase.suite) !== rootFilter) return false;
      if (statusFilter !== 'all' && result.status !== statusFilter) return false;
      if (riskFilter !== 'all' && testCase.risk !== riskFilter) return false;
      if (!query) return true;
      const haystack = [testCase.title, testCase.suite, testCase.preconditions, testCase.description || '', result.actualResult, result.notes, ...testCase.steps.flat()].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [platformCases, run, rootFilter, statusFilter, riskFilter, search]);

  const groupedCases = useMemo(() => {
    const groups = new Map<string, QACatalogCase[]>();
    for (const testCase of visibleCases) {
      const current = groups.get(testCase.suite) ?? [];
      current.push(testCase);
      groups.set(testCase.suite, current);
    }
    return Array.from(groups.entries());
  }, [visibleCases]);

  function selectPlatform(next: QAPlatform) {
    setState((current) => ({ ...current, activePlatform: next }));
    setRootFilter('all'); setStatusFilter('all'); setRiskFilter('all'); setOpenCase('');
  }

  function updateRun(patch: Partial<Omit<QARunDetails, 'results'>>) {
    setState((current) => ({ ...current, runs: { ...current.runs, [platform]: { ...current.runs[platform], ...patch } } }));
  }

  function updateResult(key: string, patch: Partial<QACaseResult>) {
    setState((current) => {
      const currentRun = current.runs[platform];
      const previous = resultFor(currentRun, key);
      const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
      return { ...current, runs: { ...current.runs, [platform]: { ...currentRun, results: { ...currentRun.results, [key]: next } } } };
    });
  }

  function resetRun() {
    if (!window.confirm(`Reset every result in ${run.title} back to Untested? Device/build details will be kept.`)) return;
    setState((current) => ({ ...current, runs: { ...current.runs, [platform]: { ...current.runs[platform], results: {} } } }));
    setOpenCase('');
  }

  function nextUntested() {
    const next = visibleCases.find((testCase) => resultFor(run, qaCaseKey(testCase)).status === 'untested');
    if (!next) return;
    const key = qaCaseKey(next);
    setOpenCase(key);
    window.setTimeout(() => document.getElementById(`qa-${encodeURIComponent(key)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 40);
  }

  function createBug(testCase: QACatalogCase, result: QACaseResult) {
    const cardId = onCreateBug({ platform, testCase, result, run });
    if (cardId) updateResult(qaCaseKey(testCase), { linkedCardId: cardId });
  }

  return (
    <div className="qa-workspace">
      <section className="qa-run-hero">
        <div className="qa-run-topline">
          <div className="qa-platform-switch" role="tablist" aria-label="QA platform">
            <button type="button" className={platform === 'ios' ? 'active' : ''} onClick={() => selectPlatform('ios')}><Smartphone size={16} /><span>iOS</span></button>
            <button type="button" className={platform === 'android' ? 'active' : ''} onClick={() => selectPlatform('android')}><Smartphone size={16} /><span>Android</span></button>
          </div>
          <div className={`qa-run-health ${issueCount ? 'has-issues' : reviewed ? 'healthy' : ''}`}><span />{issueCount ? `${issueCount} need attention` : reviewed ? 'No recorded blockers' : 'Fresh run'}</div>
        </div>

        <div className="qa-run-title-row">
          <div className="qa-run-icon"><ClipboardCheck size={23} /></div>
          <div><span className="qa-kicker">{run.environment}</span><h2>{run.title}</h2><p>Full Deme release regression, filled directly from the QA catalogue in this repo. Opposite-platform-only checks are excluded automatically.</p></div>
        </div>

        <div className="qa-progress-row">
          <div className="qa-progress-copy"><strong>{progress}%</strong><span>{reviewed} of {platformCases.length} reviewed</span></div>
          <div className="qa-progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="qa-stat-pills"><span className="passed"><CheckCircle2 size={13} />{counts.passed} passed</span><span className="failed"><XCircle size={13} />{counts.failed} failed</span><span className="blocked"><AlertTriangle size={13} />{counts.blocked} blocked</span><span className="untested"><Circle size={13} />{counts.untested} left</span></div>
        </div>

        <div className="qa-run-meta-grid">
          <label><span>Roadmap release</span><select value={run.releaseId} onChange={(event) => updateRun({ releaseId: event.target.value })}><option value="">Unassigned</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label>
          <label><span>Device</span><input value={run.device} onChange={(event) => updateRun({ device: event.target.value })} placeholder={platform === 'ios' ? 'e.g. iPhone 16 Pro' : 'e.g. Pixel 10'} /></label>
          <label><span>OS / version</span><input value={run.osVersion} onChange={(event) => updateRun({ osVersion: event.target.value })} placeholder={platform === 'ios' ? 'e.g. iOS 26.1' : 'e.g. Android 17'} /></label>
          <label><span>Deme build</span><input value={run.build} onChange={(event) => updateRun({ build: event.target.value })} placeholder="e.g. 1.4 (82)" /></label>
          <label><span>Tester</span><input value={run.tester} onChange={(event) => updateRun({ tester: event.target.value })} placeholder="Name / initials" /></label>
        </div>
      </section>

      <div className="qa-toolbar">
        <div className="qa-filter-group"><Search size={14} /><span>{visibleCases.length} visible tests</span></div>
        <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as QARisk | 'all')}><option value="all">All risks</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as QACaseStatus | 'all')}><option value="all">All statuses</option>{STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select>
        <button type="button" className="qa-toolbar-button" disabled={!visibleCases.some((testCase) => resultFor(run, qaCaseKey(testCase)).status === 'untested')} onClick={nextUntested}><Play size={14} /> Next untested</button>
        <button type="button" className="qa-toolbar-button danger" onClick={resetRun}><RotateCcw size={14} /> Reset results</button>
      </div>

      <div className="qa-body-grid">
        <aside className="qa-suite-sidebar">
          <div className="qa-suite-sidebar-head"><FlaskConical size={15} /><span>Test areas</span></div>
          <button type="button" className={rootFilter === 'all' ? 'active' : ''} onClick={() => setRootFilter('all')}><span>All tests</span><small>{platformCases.length}</small></button>
          {roots.map((root) => {
            const rootCases = platformCases.filter((testCase) => qaRootSuite(testCase.suite) === root);
            const rootIssues = rootCases.filter((testCase) => ['failed', 'blocked'].includes(resultFor(run, qaCaseKey(testCase)).status)).length;
            const rootDone = rootCases.filter((testCase) => resultFor(run, qaCaseKey(testCase)).status !== 'untested').length;
            return <button type="button" key={root} className={rootFilter === root ? 'active' : ''} onClick={() => setRootFilter(root)}><span><strong>{root}</strong><em>{rootDone}/{rootCases.length} reviewed</em></span><small className={rootIssues ? 'issue-count' : ''}>{rootIssues || rootCases.length}</small></button>;
          })}
        </aside>

        <div className="qa-case-list">
          {groupedCases.length === 0 ? <div className="qa-empty"><ShieldCheck size={28} /><h3>No tests match this view</h3><p>Try another status, risk or search term.</p></div> : groupedCases.map(([suite, tests]) => {
            const suiteReviewed = tests.filter((testCase) => resultFor(run, qaCaseKey(testCase)).status !== 'untested').length;
            return <section className="qa-suite-group" key={suite}>
              <div className="qa-suite-group-head"><div><span>{qaRootSuite(suite)}</span><h3>{suite.includes('/') ? suite.split('/').slice(1).join(' / ') : suite}</h3></div><small>{suiteReviewed}/{tests.length}</small></div>
              <div className="qa-suite-cases">{tests.map((testCase) => {
                const key = qaCaseKey(testCase);
                const result = resultFor(run, key);
                const expanded = openCase === key;
                const linkedCard = result.linkedCardId ? cards.find((card) => card.id === result.linkedCardId) : undefined;
                return <article id={`qa-${encodeURIComponent(key)}`} className={`qa-case-card status-${result.status}`} key={key}>
                  <div className="qa-case-summary">
                    <button className="qa-case-expand" type="button" onClick={() => setOpenCase(expanded ? '' : key)} aria-expanded={expanded}>{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                    <button className="qa-case-title" type="button" onClick={() => setOpenCase(expanded ? '' : key)}><span className={`qa-risk ${riskClass(testCase.risk)}`}>{testCase.risk}</span><strong>{testCase.title}</strong></button>
                    <div className="qa-status-actions">{STATUS_ORDER.map((status) => <button type="button" key={status} title={STATUS_LABEL[status]} className={`qa-status-button ${status} ${result.status === status ? 'active' : ''}`} onClick={() => updateResult(key, { status })}>{statusIcon(status, 14)}<span>{STATUS_LABEL[status]}</span></button>)}</div>
                  </div>
                  {expanded && <div className="qa-case-detail">
                    <div className="qa-case-context">
                      <div><span>Preconditions</span><p>{testCase.preconditions}</p></div>
                      {testCase.description && <div><span>Why this exists</span><p>{testCase.description}</p></div>}
                    </div>
                    <div className="qa-step-list"><div className="qa-step-list-head"><span>Steps</span><small>Action → expected result</small></div>{testCase.steps.map(([action, expected], index) => <div className="qa-step" key={`${key}-step-${index}`}><b>{index + 1}</b><div><strong>{action}</strong><p>{expected}</p></div></div>)}</div>
                    <div className="qa-result-fields">
                      <label><span>Actual result</span><textarea rows={3} value={result.actualResult} onChange={(event) => updateResult(key, { actualResult: event.target.value })} placeholder="What actually happened on the device?" /></label>
                      <label><span>Notes / evidence</span><textarea rows={3} value={result.notes} onChange={(event) => updateResult(key, { notes: event.target.value })} placeholder="Repro notes, screenshot name, logs, anything useful…" /></label>
                    </div>
                    <div className="qa-case-footer">
                      <span className={`qa-current-status ${result.status}`}>{statusIcon(result.status, 14)} {STATUS_LABEL[result.status]}{result.updatedAt ? ` · updated ${new Date(result.updatedAt).toLocaleString()}` : ''}</span>
                      {linkedCard ? <button type="button" className="qa-bug-link" onClick={() => onOpenCard(linkedCard.id)}><ExternalLink size={14} /> Open linked bug</button> : (result.status === 'failed' || result.status === 'blocked') ? <button type="button" className="qa-create-bug" onClick={() => createBug(testCase, result)}><Bug size={14} /> Create bug on release board</button> : null}
                    </div>
                  </div>}
                </article>;
              })}</div>
            </section>;
          })}
        </div>
      </div>
    </div>
  );
}
