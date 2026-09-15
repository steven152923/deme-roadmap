import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  BookOpen,
  Brain,
  CalendarDays,
  ClipboardCheck,
  Columns3,
  Command,
  Inbox,
  LayoutDashboard,
  List,
  LockKeyhole,
  Map as MapIcon,
  Plus,
  Rocket,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { CardEditor } from './components/CardEditor';
import { FilterBar } from './components/FilterBar';
import { IdeaInboxView } from './components/IdeaInbox';
import { CommandPalette, QuickCapture, ReleaseEditor, type QuickCaptureValue } from './components/Overlays';
import { QAWorkspace, type QABugInput } from './components/QAWorkspace';
import { ReleaseBoard, UNASSIGNED } from './components/ReleaseBoard';
import { SecurityGate, type SecurityMode } from './components/SecurityGate';
import { SettingsPanel } from './components/SettingsPanel';
import { TodayStrip } from './components/TodayStrip';
import { ArchiveView, FocusView, ListView, TimelineView } from './components/Views';
import { CalendarView, DecisionsView, FocusTimer, LaunchCenter, NotesView, WorkspaceBrief } from './components/WorkspaceV5';
import { STAGE_LABEL, VIEW_TITLES } from './constants';
import { DEFAULT_ROADMAP, newCard, newDecision, newInboxNote, newLaunchPlan, newRelease, newWorkspaceNote, normaliseRoadmap, uid } from './data';
import type { ActivityEntry, DecisionEntry, LaunchPlan, RoadmapCard, RoadmapData, RoadmapRelease, SecurityActionResult, Stage, ThemePreset, ViewId, WorkKind, WorkspaceNote } from './types';
import { EMPTY_FILTERS, type RoadmapFilters } from './uiTypes';
import { isDueSoon, isOverdue, matchesSearch, sortByOrder } from './utils';

const THEME_KEY = 'deme-roadmap.theme.v1';

function activity(type: ActivityEntry['type'], message: string, cardId?: string): ActivityEntry {
  return { id: uid('activity'), type, message, cardId, createdAt: new Date().toISOString() };
}
function appendActivity(entries: ActivityEntry[], entry: ActivityEntry) { return [...entries.slice(-299), entry]; }
function maxOrder(cards: RoadmapCard[], stage: Stage) { return Math.max(0, ...cards.filter((card) => !card.archived && card.stage === stage).map((card) => card.sortOrder)) + 1000; }

function applyFilters(card: RoadmapCard, filters: RoadmapFilters, data: RoadmapData, search: string) {
  if (!matchesSearch(card, data.releases, search)) return false;
  if (filters.area !== 'all' && card.area !== filters.area) return false;
  if (filters.priority !== 'all' && card.priority !== filters.priority) return false;
  if (filters.kind !== 'all' && card.kind !== filters.kind) return false;
  if (filters.releaseId === 'none' && card.releaseId) return false;
  if (filters.releaseId !== 'all' && filters.releaseId !== 'none' && card.releaseId !== filters.releaseId) return false;
  if (filters.due === 'overdue' && !isOverdue(card)) return false;
  if (filters.due === 'soon' && !isDueSoon(card, data.settings.dueSoonDays)) return false;
  if (filters.due === 'unscheduled' && card.targetDate) return false;
  if (filters.label && !card.labels.includes(filters.label)) return false;
  if (filters.today && !card.today) return false;
  return true;
}

function qaAreaForSuite(areas: string[], suite: string) {
  const [root, detail = ''] = suite.split('/');
  let preferred = 'Core';
  if (root === 'Discovery & Home') preferred = 'Home';
  else if (root === 'Communities') preferred = 'Communities';
  else if (root === 'Profiles & Social') preferred = 'Profiles';
  else if (root === 'Messaging') preferred = 'Chats';
  else if (root === 'Safety & Moderation') preferred = 'Safety';
  else if (root === 'Premium') preferred = 'Premium';
  else if (root === 'Content' && /journal|blog/i.test(detail)) preferred = 'Journals';
  else if (root === 'Cross-Cutting' && /performance/i.test(detail)) preferred = 'Performance';
  return areas.find((area) => area.toLowerCase() === preferred.toLowerCase()) ?? areas[0] ?? 'Core';
}

function rememberedTheme(): ThemePreset {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'night' || value === 'paper' ? value : 'candy';
  } catch {
    return 'candy';
  }
}

export default function App() {
  const [data, setData] = useState<RoadmapData>(DEFAULT_ROADMAP);
  const [loaded, setLoaded] = useState(false);
  const [securityMode, setSecurityMode] = useState<SecurityMode>('checking');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [autoLockMinutes, setAutoLockMinutes] = useState(15);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [view, setView] = useState<ViewId>('focus');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [releaseEditorId, setReleaseEditorId] = useState<string | null>(null);
  const [boardReleaseId, setBoardReleaseId] = useState(UNASSIGNED);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RoadmapFilters>(EMPTY_FILTERS);
  const [toast, setToast] = useState('');
  const [dataPath, setDataPath] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const theme = rememberedTheme();
    document.documentElement.dataset.theme = theme;
    window.demeRoadmap?.setWindowTheme(theme).catch(() => undefined);
    let active = true;
    async function checkSecurity() {
      if (!window.demeRoadmap) { if (active) setSecurityMode('unlocked'); return; }
      try {
        const status = await window.demeRoadmap.securityStatus();
        if (!active) return;
        setAutoLockMinutes(status.autoLockMinutes);
        setSecurityMode(status.configured ? (status.unlocked ? 'unlocked' : 'locked') : 'setup');
      } catch {
        if (active) { setSecurityMode('locked'); setSecurityError('Roadmap could not read its local lock.'); }
      }
    }
    checkSecurity();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (securityMode !== 'unlocked') return;
    let active = true;
    setLoaded(false);
    async function load() {
      try {
        const raw = window.demeRoadmap ? await window.demeRoadmap.load(DEFAULT_ROADMAP) : DEFAULT_ROADMAP;
        const next = normaliseRoadmap(raw);
        if (!active) return;
        setData(next);
        setView(next.settings.startView === 'releases' ? 'board' : next.settings.startView);
        setBoardReleaseId(next.releases.find((release) => release.status === 'active')?.id ?? next.releases.find((release) => release.status === 'planned')?.id ?? UNASSIGNED);
        const theme = next.settings.themePreset;
        document.documentElement.dataset.theme = theme;
        try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* optional */ }
        window.demeRoadmap?.setWindowTheme(theme).catch(() => undefined);
        if (window.demeRoadmap) window.demeRoadmap.dataPath().then((path) => active && setDataPath(path)).catch(() => undefined);
      } catch {
        if (active) { setData(DEFAULT_ROADMAP); setToast('Roadmap data could not be opened'); }
      } finally {
        if (active) setLoaded(true);
      }
    }
    load();
    return () => { active = false; };
  }, [securityMode]);

  useEffect(() => {
    if (!loaded || securityMode !== 'unlocked' || !window.demeRoadmap) return;
    setSaveState('saving');
    const timer = window.setTimeout(async () => {
      try { await window.demeRoadmap?.save(data); setSaveState('saved'); }
      catch { setSaveState('error'); }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [data, loaded, securityMode]);

  useEffect(() => {
    if (!loaded || securityMode !== 'unlocked') return;
    const theme = data.settings.themePreset;
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* optional */ }
    window.demeRoadmap?.setWindowTheme(theme).catch(() => undefined);
  }, [data.settings.themePreset, loaded, securityMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'l' && securityMode === 'unlocked') { event.preventDefault(); lockWorkspace(); return; }
      if (securityMode !== 'unlocked') return;
      if (modifier && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); }
      if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); setQuickCaptureOpen(true); }
      if (modifier && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape' && !commandOpen && !quickCaptureOpen) { setSelectedId(null); setReleaseEditorId(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandOpen, quickCaptureOpen, securityMode, data]);

  useEffect(() => {
    if (securityMode !== 'unlocked' || autoLockMinutes <= 0) return;
    lastActivityRef.current = Date.now();
    const noteActivity = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('pointerdown', noteActivity, true);
    window.addEventListener('keydown', noteActivity, true);
    window.addEventListener('mousemove', noteActivity, true);
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= autoLockMinutes * 60_000) lockWorkspace();
    }, 15_000);
    return () => {
      window.removeEventListener('pointerdown', noteActivity, true);
      window.removeEventListener('keydown', noteActivity, true);
      window.removeEventListener('mousemove', noteActivity, true);
      window.clearInterval(timer);
    };
  }, [securityMode, autoLockMinutes, data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function setupPasscode(passcode: string) {
    setSecurityBusy(true); setSecurityError('');
    try {
      const result = await window.demeRoadmap?.securitySetup(passcode) ?? { ok: true };
      if (!result.ok) { setSecurityError(result.error || 'Passcode could not be created.'); return; }
      const status = await window.demeRoadmap?.securityStatus();
      if (status) setAutoLockMinutes(status.autoLockMinutes);
      setSecurityMode('unlocked');
    } catch { setSecurityError('Passcode setup failed.'); }
    finally { setSecurityBusy(false); }
  }

  async function unlock(passcode: string) {
    setSecurityBusy(true); setSecurityError('');
    try {
      const result = await window.demeRoadmap?.securityVerify(passcode) ?? { ok: true };
      if (!result.ok) { setSecurityError(result.error || 'Passcode was not accepted.'); return; }
      const status = await window.demeRoadmap?.securityStatus();
      if (status) setAutoLockMinutes(status.autoLockMinutes);
      setSecurityMode('unlocked');
    } catch { setSecurityError('Roadmap could not unlock.'); }
    finally { setSecurityBusy(false); }
  }

  async function lockWorkspace() {
    if (securityMode !== 'unlocked') return;
    try { if (loaded && window.demeRoadmap) await window.demeRoadmap.save(data); } catch { /* lock anyway */ }
    try { await window.demeRoadmap?.securityLock(); } catch { /* renderer still locks */ }
    setSelectedId(null); setReleaseEditorId(null); setQuickCaptureOpen(false); setCommandOpen(false); setSearch('');
    setData(DEFAULT_ROADMAP); setLoaded(false); setSecurityError(''); setSecurityMode('locked');
  }

  async function changePasscode(currentPasscode: string, nextPasscode: string): Promise<SecurityActionResult> {
    try { return await window.demeRoadmap?.securityChange(currentPasscode, nextPasscode) ?? { ok: false, error: 'Security controls are unavailable.' }; }
    catch { return { ok: false, error: 'Passcode could not be changed.' }; }
  }
  async function changeAutoLock(minutes: number): Promise<SecurityActionResult> {
    try {
      const result = await window.demeRoadmap?.securitySetAutoLock(minutes) ?? { ok: false, error: 'Security controls are unavailable.' };
      if (result.ok) setAutoLockMinutes(minutes);
      return result;
    } catch { return { ok: false, error: 'Auto-lock could not be changed.' }; }
  }

  const selected = selectedId ? data.cards.find((card) => card.id === selectedId) ?? null : null;
  const editedRelease = releaseEditorId ? data.releases.find((release) => release.id === releaseEditorId) ?? null : null;
  const activeCards = useMemo(() => data.cards.filter((card) => !card.archived), [data.cards]);
  const visibleCards = useMemo(() => activeCards.filter((card) => applyFilters(card, filters, data, search)), [activeCards, filters, data, search]);
  const boardCards = useMemo(() => activeCards.filter((card) => matchesSearch(card, data.releases, search)), [activeCards, data.releases, search]);
  const archivedCards = useMemo(() => data.cards.filter((card) => card.archived && matchesSearch(card, data.releases, search)), [data.cards, data.releases, search]);
  const labels = useMemo(() => Array.from(new Set(activeCards.flatMap((card) => card.labels))).sort(), [activeCards]);
  const totalOpen = activeCards.filter((card) => card.stage !== 'shipped').length;
  const activeRelease = data.releases.find((release) => release.status === 'active') ?? null;
  const effectiveView: ViewId = view === 'releases' ? 'board' : view;
  const title = VIEW_TITLES[effectiveView];
  const showFilters = effectiveView === 'timeline' || effectiveView === 'list';

  function createItem(stage: Stage, openEditor = true, patch: Partial<RoadmapCard> = {}) {
    const kind: WorkKind = patch.kind ?? (stage === 'ideas' ? 'bug' : 'feature');
    const card = { ...newCard(stage, data.settings.areas[0] ?? 'Core', maxOrder(data.cards, stage), kind), ...patch };
    setData((current) => ({ ...current, cards: [...current.cards, card], activity: appendActivity(current.activity, activity('created', `Created “${card.title}”`, card.id)) }));
    if (openEditor) setSelectedId(card.id);
    return card.id;
  }

  function createQuick(value: QuickCaptureValue) {
    const id = createItem(value.stage, false, { title: value.title, area: value.area, priority: value.priority, kind: value.kind, bugSeverity: value.bugSeverity, releaseId: value.releaseId, targetDate: value.targetDate, today: value.today });
    setQuickCaptureOpen(false); setToast('Added to the release flow ♡');
    if (value.stage === 'progress' || value.stage === 'testing' || value.stage === 'ideas') setSelectedId(id);
  }

  function createBugFromQa(input: QABugInput) {
    const cardId = uid('card');
    const platformLabel = input.platform === 'ios' ? 'iOS' : 'Android';
    setData((current) => {
      const now = new Date().toISOString();
      const releaseId = current.releases.some((release) => release.id === input.run.releaseId) ? input.run.releaseId : current.releases.find((release) => release.status === 'active')?.id ?? '';
      const area = qaAreaForSuite(current.settings.areas, input.testCase.suite);
      const base = newCard('ideas', area, maxOrder(current.cards, 'ideas'), 'bug');
      const priority = input.testCase.risk === 'P0' ? 'critical' : input.testCase.risk === 'P1' ? 'high' : 'normal';
      const bugSeverity = input.testCase.risk === 'P0' ? 'blocker' : input.testCase.risk === 'P1' ? 'high' : input.testCase.risk === 'P2' ? 'medium' : 'low';
      const deviceContext = [input.run.device, input.run.osVersion, input.run.build && `Deme ${input.run.build}`, input.run.tester && `Tester: ${input.run.tester}`].filter(Boolean).join(' · ');
      const steps = input.testCase.steps.map(([action, expected], index) => `${index + 1}. ${action}\n   Expected: ${expected}`).join('\n');
      const description = [`QA failure from ${input.run.title}`, `Suite: ${input.testCase.suite}`, `Risk: ${input.testCase.risk}`, deviceContext ? `Test context: ${deviceContext}` : '', '', 'Preconditions', input.testCase.preconditions, '', 'Actual result', input.result.actualResult.trim() || 'No actual result was recorded yet.', '', 'Tester notes / evidence', input.result.notes.trim() || 'No additional notes were recorded.', '', 'Reproduction steps and expected results', steps].filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== '')).join('\n');
      const rootLabel = input.testCase.suite.split('/')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const card: RoadmapCard = { ...base, id: cardId, title: `[${platformLabel} QA] ${input.testCase.title}`, description, priority, bugSeverity, releaseId, labels: ['qa', input.platform, input.testCase.risk.toLowerCase(), rootLabel].filter(Boolean), createdAt: now, updatedAt: now };
      return { ...current, cards: [...current.cards, card], activity: appendActivity(current.activity, activity('created', `Created QA bug “${card.title}”`, card.id)) };
    });
    setSelectedId(cardId); setToast('QA failure added to Bugs ✦'); return cardId;
  }

  function addInboxThought(text: string) {
    const note = newInboxNote(text);
    setData((current) => ({ ...current, inbox: [...current.inbox, note], activity: appendActivity(current.activity, activity('inbox', 'Saved a thought to the Idea Inbox')) }));
    setToast('Thought tucked away ✦');
  }
  function deleteInboxThought(id: string) { setData((current) => ({ ...current, inbox: current.inbox.filter((note) => note.id !== id) })); setToast('Thought removed'); }
  function promoteInboxThought(id: string) {
    setData((current) => {
      const note = current.inbox.find((item) => item.id === id); if (!note) return current;
      const text = note.text.trim(); const card = { ...newCard('planned', current.settings.areas[0] ?? 'Core', maxOrder(current.cards, 'planned'), 'feature'), title: text.length > 88 ? `${text.slice(0, 85).trim()}…` : text, description: text.length > 88 ? text : '' };
      window.setTimeout(() => setSelectedId(card.id), 0);
      return { ...current, inbox: current.inbox.filter((item) => item.id !== id), cards: [...current.cards, card], activity: appendActivity(current.activity, activity('created', `Promoted “${card.title}” from the Idea Inbox`, card.id)) };
    });
    setToast('Now it is planned work ✨');
  }

  function updateCard(id: string, patch: Partial<RoadmapCard>) {
    setData((current) => {
      const before = current.cards.find((card) => card.id === id); if (!before) return current;
      const nextPatch = { ...patch, ...(patch.stage === 'ideas' ? { kind: 'bug' as const } : {}), updatedAt: new Date().toISOString() };
      let nextActivity = current.activity;
      if (patch.stage && patch.stage !== before.stage) nextActivity = appendActivity(nextActivity, activity('moved', `Moved “${before.title}” to ${STAGE_LABEL[patch.stage]}`, id));
      return { ...current, cards: current.cards.map((card) => card.id === id ? { ...card, ...nextPatch } : card), activity: nextActivity };
    });
  }

  function moveCard(id: string, stage: Stage) {
    setData((current) => {
      const card = current.cards.find((item) => item.id === id); if (!card) return current;
      const moved = { ...card, stage, ...(stage === 'ideas' ? { kind: 'bug' as const } : {}), sortOrder: maxOrder(current.cards.filter((item) => item.id !== id), stage), updatedAt: new Date().toISOString() };
      return { ...current, cards: current.cards.map((item) => item.id === id ? moved : item), activity: card.stage === stage ? current.activity : appendActivity(current.activity, activity('moved', `Moved “${card.title}” to ${STAGE_LABEL[stage]}`, id)) };
    });
  }

  function reorderCard(sourceId: string, targetId: string) {
    setData((current) => {
      const source = current.cards.find((card) => card.id === sourceId); const target = current.cards.find((card) => card.id === targetId);
      if (!source || !target || source.id === target.id) return current;
      const stageCards = sortByOrder(current.cards.filter((card) => !card.archived && card.stage === target.stage && card.id !== source.id));
      const targetIndex = Math.max(0, stageCards.findIndex((card) => card.id === target.id));
      stageCards.splice(targetIndex, 0, { ...source, stage: target.stage, ...(target.stage === 'ideas' ? { kind: 'bug' as const } : {}) });
      const orderMap = new Map(stageCards.map((card, index) => [card.id, (index + 1) * 1000]));
      const stageChanged = source.stage !== target.stage;
      return { ...current, cards: current.cards.map((card) => orderMap.has(card.id) ? { ...card, stage: target.stage, ...(target.stage === 'ideas' && card.id === source.id ? { kind: 'bug' as const } : {}), sortOrder: orderMap.get(card.id)!, updatedAt: card.id === source.id ? new Date().toISOString() : card.updatedAt } : card), activity: stageChanged ? appendActivity(current.activity, activity('moved', `Moved “${source.title}” to ${STAGE_LABEL[target.stage]}`, source.id)) : current.activity };
    });
  }

  function archiveCard(id: string) {
    setData((current) => { const card = current.cards.find((item) => item.id === id); if (!card) return current; return { ...current, cards: current.cards.map((item) => item.id === id ? { ...item, archived: true, updatedAt: new Date().toISOString() } : item), activity: appendActivity(current.activity, activity('archived', `Archived “${card.title}”`, id)) }; });
    setSelectedId(null); setToast('Moved to archive');
  }
  function restoreCard(id: string) {
    setData((current) => { const card = current.cards.find((item) => item.id === id); if (!card) return current; return { ...current, cards: current.cards.map((item) => item.id === id ? { ...item, archived: false, updatedAt: new Date().toISOString() } : item), activity: appendActivity(current.activity, activity('restored', `Restored “${card.title}”`, id)) }; });
    setToast('Restored');
  }
  function deleteCard(id: string) {
    const card = data.cards.find((item) => item.id === id); if (!card) return;
    if (data.settings.confirmPermanentDelete && !window.confirm(`Delete “${card.title}” permanently? This cannot be undone.`)) return;
    setData((current) => ({ ...current, cards: current.cards.filter((item) => item.id !== id).map((item) => item.blockedBy.includes(id) ? { ...item, blockedBy: item.blockedBy.filter((dependency) => dependency !== id) } : item) }));
    setSelectedId(null); setToast('Deleted permanently');
  }
  function duplicateCard(id: string) {
    const source = data.cards.find((card) => card.id === id); if (!source) return;
    const now = new Date().toISOString();
    const copy: RoadmapCard = { ...source, id: uid('card'), title: `${source.title} copy`, blockedBy: [...source.blockedBy], labels: [...source.labels], checklist: source.checklist.map((item) => ({ ...item, id: uid('check') })), links: source.links.map((link) => ({ ...link, id: uid('link') })), updates: [], archived: false, pinned: false, today: false, sortOrder: maxOrder(data.cards, source.stage), createdAt: now, updatedAt: now };
    setData((current) => ({ ...current, cards: [...current.cards, copy], activity: appendActivity(current.activity, activity('created', `Duplicated “${source.title}”`, copy.id)) })); setSelectedId(copy.id);
  }

  function createRelease() {
    const release = newRelease(`Version ${data.releases.length + 1}`);
    setData((current) => ({ ...current, releases: [...current.releases, release], activity: appendActivity(current.activity, activity('release', `Created release “${release.name}”`)) }));
    setBoardReleaseId(release.id); setReleaseEditorId(release.id); setView('board');
  }
  function updateRelease(id: string, patch: Partial<RoadmapRelease>) {
    setData((current) => {
      const before = current.releases.find((release) => release.id === id); if (!before) return current;
      let releases = current.releases.map((release) => release.id === id ? { ...release, ...patch, updatedAt: new Date().toISOString() } : release);
      if (patch.status === 'active') releases = releases.map((release) => release.id !== id && release.status === 'active' ? { ...release, status: 'planned', updatedAt: new Date().toISOString() } : release);
      const nextName = typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : before.name;
      return { ...current, releases, activity: patch.status && patch.status !== before.status ? appendActivity(current.activity, activity('release', `${nextName} is now ${patch.status}`)) : current.activity };
    });
  }
  function setActiveRelease(id: string) { updateRelease(id, { status: 'active' }); setBoardReleaseId(id); setToast('Active release updated ✦'); }
  function deleteRelease(id: string) {
    const release = data.releases.find((item) => item.id === id); if (!release) return;
    if (!window.confirm(`Delete release “${release.name}”? Its items will become unassigned.`)) return;
    setData((current) => ({ ...current, releases: current.releases.filter((item) => item.id !== id), cards: current.cards.map((card) => card.releaseId === id ? { ...card, releaseId: '', updatedAt: new Date().toISOString() } : card), decisions: current.decisions.map((decision) => decision.releaseId === id ? { ...decision, releaseId: '', updatedAt: new Date().toISOString() } : decision), launchPlans: current.launchPlans.filter((plan) => plan.releaseId !== id), activity: appendActivity(current.activity, activity('release', `Deleted release “${release.name}”`)) }));
    if (boardReleaseId === id) setBoardReleaseId(UNASSIGNED); setReleaseEditorId(null); setToast('Release deleted');
  }

  function createNote() {
    const note = newWorkspaceNote();
    setData((current) => ({ ...current, notes: [note, ...current.notes], activity: appendActivity(current.activity, activity('note', 'Created a private note')) }));
    return note.id;
  }
  function updateNote(id: string, patch: Partial<WorkspaceNote>) { setData((current) => ({ ...current, notes: current.notes.map((note) => note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note) })); }
  function deleteNote(id: string) { setData((current) => ({ ...current, notes: current.notes.filter((note) => note.id !== id) })); setToast('Note deleted'); }
  function promoteNote(id: string) {
    const note = data.notes.find((item) => item.id === id); if (!note) return;
    const cardId = createItem('planned', false, { title: note.title || 'Note follow-up', description: note.body, kind: 'feature' });
    setSelectedId(cardId); setToast('Note turned into planned work ✦');
  }

  function createDecisionEntry() {
    const decision = newDecision();
    setData((current) => ({ ...current, decisions: [decision, ...current.decisions], activity: appendActivity(current.activity, activity('decision', 'Recorded a new decision')) }));
    return decision.id;
  }
  function updateDecision(id: string, patch: Partial<DecisionEntry>) { setData((current) => ({ ...current, decisions: current.decisions.map((decision) => decision.id === id ? { ...decision, ...patch, updatedAt: new Date().toISOString() } : decision) })); }
  function deleteDecision(id: string) { setData((current) => ({ ...current, decisions: current.decisions.filter((decision) => decision.id !== id) })); setToast('Decision removed'); }
  function promoteDecision(id: string) {
    const decision = data.decisions.find((item) => item.id === id); if (!decision) return;
    const cardId = createItem('planned', false, { title: `Follow up: ${decision.title}`, description: [decision.decision, decision.rationale].filter(Boolean).join('\n\n'), releaseId: decision.releaseId, kind: 'chore' });
    setSelectedId(cardId); setToast('Follow-up added to the release flow');
  }

  function createLaunchPlan(releaseId: string) {
    setData((current) => current.launchPlans.some((plan) => plan.releaseId === releaseId) ? current : { ...current, launchPlans: [...current.launchPlans, newLaunchPlan(releaseId)], activity: appendActivity(current.activity, activity('launch', 'Prepared a launch checklist')) });
  }
  function updateLaunchPlan(releaseId: string, patch: Partial<LaunchPlan>) { setData((current) => ({ ...current, launchPlans: current.launchPlans.map((plan) => plan.releaseId === releaseId ? { ...plan, ...patch, updatedAt: new Date().toISOString() } : plan) })); }
  function completeFocusSession(minutes: number) {
    const record = { id: uid('focus'), minutes, note: '', completedAt: new Date().toISOString() };
    setData((current) => ({ ...current, focusSessions: [...current.focusSessions.slice(-499), record], activity: appendActivity(current.activity, activity('focus', `Completed a ${minutes}-minute focus session`)) }));
    setToast(`${minutes} focused minutes logged ✦`);
  }

  function changeSettings(patch: Partial<RoadmapData['settings']>) {
    setData((current) => {
      const settings = { ...current.settings, ...patch };
      let cards = current.cards;
      if (patch.areas && patch.areas.length) { const fallback = patch.areas[0]; cards = cards.map((card) => patch.areas!.includes(card.area) ? card : { ...card, area: fallback, updatedAt: new Date().toISOString() }); }
      return { ...current, settings, cards };
    });
  }
  async function exportBackup() { if (!window.demeRoadmap) return; try { const result = await window.demeRoadmap.exportBackup(data); if (!result.canceled) setToast('Backup saved'); } catch { setToast('Could not save backup'); } }
  async function importBackup() { if (!window.demeRoadmap) return; try { const result = await window.demeRoadmap.importBackup(); if (!result.canceled && result.data) { const next = normaliseRoadmap(result.data); setData(next); setView(next.settings.startView); setBoardReleaseId(next.releases.find((release) => release.status === 'active')?.id ?? next.releases.find((release) => release.status === 'planned')?.id ?? UNASSIGNED); setSelectedId(null); setReleaseEditorId(null); setToast('Backup restored'); } } catch { setToast('That backup could not be opened'); } }
  async function revealData() { try { await window.demeRoadmap?.revealData(); } catch { setToast('Could not open the data folder'); } }
  function navigate(next: ViewId) { setView(next === 'releases' ? 'board' : next); setSelectedId(null); setReleaseEditorId(null); }
  function openRelease(id: string) { setBoardReleaseId(id); navigate('board'); }

  if (securityMode !== 'unlocked') return <SecurityGate mode={securityMode} busy={securityBusy} error={securityError} onSetup={setupPasscode} onUnlock={unlock} />;

  return (
    <div className={`app-shell v2-shell v3-shell v4-shell v5-shell theme-${data.settings.themePreset}`}>
      <div className="window-drag-region" />
      <aside className="sidebar v2-sidebar v3-sidebar v5-sidebar">
        <DemeBrand /><div className="sidebar-cloud cloud-a" /><div className="sidebar-star star-a">✦</div><div className="sidebar-star star-b">♡</div>
        <nav className="nav-stack v5-nav" aria-label="Roadmap views">
          <NavSection label="Plan" />
          <NavButton active={effectiveView === 'focus'} icon={<LayoutDashboard size={18} />} label="Focus" onClick={() => navigate('focus')} />
          <NavButton active={effectiveView === 'board'} icon={<Columns3 size={18} />} label="Release board" count={totalOpen} onClick={() => navigate('board')} />
          <NavButton active={effectiveView === 'calendar'} icon={<CalendarDays size={18} />} label="Calendar" onClick={() => navigate('calendar')} />
          <NavButton active={effectiveView === 'timeline'} icon={<MapIcon size={18} />} label="Roadmap" onClick={() => navigate('timeline')} />
          <NavButton active={effectiveView === 'list'} icon={<List size={18} />} label="All items" onClick={() => navigate('list')} />
          <NavSection label="Capture" />
          <NavButton active={effectiveView === 'inbox'} icon={<Inbox size={18} />} label="Idea inbox" count={data.inbox.length} onClick={() => navigate('inbox')} />
          <NavButton active={effectiveView === 'notes'} icon={<BookOpen size={18} />} label="Notes" count={data.notes.length} onClick={() => navigate('notes')} />
          <NavButton active={effectiveView === 'decisions'} icon={<Brain size={18} />} label="Decision log" count={data.decisions.filter((item) => item.status !== 'superseded').length} onClick={() => navigate('decisions')} />
          <NavSection label="Ship" />
          <NavButton active={effectiveView === 'qa'} icon={<ClipboardCheck size={18} />} label="QA test runs" onClick={() => navigate('qa')} />
          <NavButton active={effectiveView === 'launch'} icon={<Rocket size={18} />} label="Launch center" onClick={() => navigate('launch')} />
          <NavButton active={effectiveView === 'archive'} icon={<Archive size={18} />} label="Archive" count={data.cards.filter((card) => card.archived).length} onClick={() => navigate('archive')} />
        </nav>
        <div className="sidebar-spacer" />
        {activeRelease && <button className="sidebar-release" type="button" onClick={() => openRelease(activeRelease.id)}><span className="live-dot" /><span><small>Growing now</small><strong>{activeRelease.name}</strong></span></button>}
        <button className={`nav-button settings-nav ${effectiveView === 'settings' ? 'active' : ''}`} type="button" onClick={() => navigate('settings')}><Settings size={18} /><span>Settings</span></button>
        <div className={`save-state ${saveState}`}><span /> {saveState === 'saving' ? 'Saving locally…' : saveState === 'error' ? 'Couldn’t save' : 'Safe on this PC'}</div><div className="version-mark">v0.5 ✦</div>
      </aside>

      <main className="main-area v2-main v3-main v5-main">
        <header className="topbar v2-topbar v3-topbar v5-topbar"><div className="header-cloud header-cloud-left" /><div className="header-cloud header-cloud-right" /><span className="header-sparkle hs-one">✦</span><span className="header-sparkle hs-two">✧</span><div className="topbar-title"><p className="eyebrow">{title.eyebrow}</p><h1>{title.title}</h1></div><div className="topbar-actions"><label className="search-box v2-search"><Search size={17} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={effectiveView === 'qa' ? 'Find a test…' : effectiveView === 'notes' ? 'Find a note…' : effectiveView === 'decisions' ? 'Find a decision…' : 'Find something…'} /><kbd>Ctrl F</kbd></label><FocusTimer onComplete={completeFocusSession} /><button className="command-button lock-button" type="button" onClick={lockWorkspace} title="Lock Roadmap"><LockKeyhole size={17} /><kbd>Ctrl L</kbd></button><button className="command-button" type="button" onClick={() => setCommandOpen(true)} title="Command palette"><Command size={17} /><kbd>Ctrl K</kbd></button><button className="primary-button cute-primary" type="button" onClick={() => setQuickCaptureOpen(true)}><Plus size={18} /> Add work</button></div></header>
        {showFilters && <FilterBar filters={filters} areas={data.settings.areas} releases={data.releases} labels={labels} onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))} onClear={() => setFilters(EMPTY_FILTERS)} />}
        <section className={`content v2-content v3-content v4-content v5-content view-${effectiveView}`}>
          {!loaded ? <LoadingState /> : effectiveView === 'focus' ? <><WorkspaceBrief cards={activeCards} releases={data.releases} notes={data.notes} decisions={data.decisions} focusSessions={data.focusSessions} onNavigate={navigate} /><TodayStrip cards={activeCards} releases={data.releases} onSelect={setSelectedId} onOpenBoard={() => navigate('board')} /><FocusView cards={visibleCards} allCards={data.cards} releases={data.releases} activity={data.activity} dueSoonDays={data.settings.dueSoonDays} onSelect={setSelectedId} onAdd={() => setQuickCaptureOpen(true)} onNavigate={navigate} /></> : effectiveView === 'inbox' ? <IdeaInboxView notes={data.inbox} onAdd={addInboxThought} onPromote={promoteInboxThought} onDelete={deleteInboxThought} /> : effectiveView === 'board' ? <ReleaseBoard cards={boardCards} allCards={data.cards} releases={data.releases} selectedReleaseId={boardReleaseId} compact={data.settings.compactCards} showCompleted={data.settings.showShippedOnBoard} onSelectRelease={setBoardReleaseId} onSelectCard={setSelectedId} onMove={moveCard} onReorder={reorderCard} onAdd={(stage, patch) => createItem(stage, true, patch)} onCreateRelease={createRelease} onEditRelease={setReleaseEditorId} onSetActiveRelease={setActiveRelease} /> : effectiveView === 'qa' ? <QAWorkspace releases={data.releases} cards={data.cards} search={search} onCreateBug={createBugFromQa} onOpenCard={setSelectedId} /> : effectiveView === 'calendar' ? <CalendarView cards={activeCards} releases={data.releases} decisions={data.decisions} onSelectCard={setSelectedId} onOpenRelease={openRelease} onOpenDecision={() => navigate('decisions')} /> : effectiveView === 'notes' ? <NotesView notes={data.notes} search={search} onCreate={createNote} onUpdate={updateNote} onDelete={deleteNote} onPromote={promoteNote} /> : effectiveView === 'decisions' ? <DecisionsView decisions={data.decisions} releases={data.releases} search={search} onCreate={createDecisionEntry} onUpdate={updateDecision} onDelete={deleteDecision} onPromote={promoteDecision} /> : effectiveView === 'launch' ? <LaunchCenter releases={data.releases} cards={data.cards} plans={data.launchPlans} onCreatePlan={createLaunchPlan} onUpdatePlan={updateLaunchPlan} onOpenCard={setSelectedId} onNavigateQA={() => navigate('qa')} /> : effectiveView === 'timeline' ? <TimelineView cards={visibleCards} allCards={data.cards} releases={data.releases} onSelect={setSelectedId} /> : effectiveView === 'list' ? <ListView cards={visibleCards} releases={data.releases} onSelect={setSelectedId} /> : effectiveView === 'archive' ? <ArchiveView cards={archivedCards} allCards={data.cards} releases={data.releases} onSelect={setSelectedId} onRestore={restoreCard} /> : <SettingsPanel settings={data.settings} dataPath={dataPath} autoLockMinutes={autoLockMinutes} onChange={changeSettings} onBackup={exportBackup} onRestore={importBackup} onRevealData={revealData} onAutoLockChange={changeAutoLock} onChangePasscode={changePasscode} />}
        </section>
      </main>

      {selected && <CardEditor card={selected} cards={data.cards} releases={data.releases} areas={data.settings.areas} onClose={() => setSelectedId(null)} onChange={(patch) => updateCard(selected.id, patch)} onArchive={() => archiveCard(selected.id)} onRestore={() => restoreCard(selected.id)} onDelete={() => deleteCard(selected.id)} onDuplicate={() => duplicateCard(selected.id)} />}
      <QuickCapture open={quickCaptureOpen} areas={data.settings.areas} releases={data.releases} defaultReleaseId={effectiveView === 'board' && boardReleaseId !== UNASSIGNED ? boardReleaseId : ''} onClose={() => setQuickCaptureOpen(false)} onCreate={createQuick} />
      <ReleaseEditor release={editedRelease} onClose={() => setReleaseEditorId(null)} onChange={(patch) => editedRelease && updateRelease(editedRelease.id, patch)} onDelete={() => editedRelease && deleteRelease(editedRelease.id)} />
      <CommandPalette open={commandOpen} cards={data.cards} releases={data.releases} onClose={() => setCommandOpen(false)} onSelectCard={setSelectedId} onNavigate={navigate} onNewItem={() => setQuickCaptureOpen(true)} onNewRelease={createRelease} onBackup={exportBackup} />
      {toast && <div className="toast v2-toast v3-toast"><span className="toast-dot" /> {toast}</div>}
    </div>
  );
}

function NavSection({ label }: { label: string }) { return <div className="nav-section-label">{label}</div>; }
function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) { return <button className={`nav-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>{icon}<span>{label}</span>{typeof count === 'number' && count > 0 && <small>{count}</small>}</button>; }
function DemeBrand() { return <div className="deme-brand-v2 deme-brand-v3"><div className="deme-d-mark"><span>D</span><i /></div><div className="deme-brand-copy"><strong>Deme</strong><small>private roadmap ✦</small></div><Sparkles className="brand-sparkle" size={18} /></div>; }
function LoadingState() { return <div className="loading-state v2-loading v3-loading"><div className="loading-orb" /><p>Gathering all the little ideas…</p></div>; }
