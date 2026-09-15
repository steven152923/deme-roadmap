import type {
  ActivityEntry,
  BugSeverity,
  DecisionEntry,
  DecisionStatus,
  Effort,
  FocusSessionRecord,
  IdeaInboxNote,
  LaunchChecklistItem,
  LaunchPlan,
  NoteColor,
  Priority,
  ReleaseStatus,
  RoadmapCard,
  RoadmapData,
  RoadmapRelease,
  RoadmapSettings,
  Stage,
  ThemePreset,
  WorkKind,
  WorkspaceNote,
} from './types';

export const DEFAULT_AREAS = ['Core', 'Home', 'Communities', 'Profiles', 'Chats', 'Journals', 'Safety', 'Premium', 'Performance', 'Polish'];

export const DEFAULT_SETTINGS: RoadmapSettings = {
  startView: 'focus',
  compactCards: false,
  showShippedOnBoard: true,
  dueSoonDays: 7,
  confirmPermanentDelete: true,
  areas: DEFAULT_AREAS,
  themePreset: 'candy',
};

export const DEFAULT_ROADMAP: RoadmapData = {
  version: 5,
  cards: [],
  releases: [],
  settings: DEFAULT_SETTINGS,
  activity: [],
  inbox: [],
  notes: [],
  decisions: [],
  launchPlans: [],
  focusSessions: [],
};

export function uid(prefix = 'id') {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function asString(value: unknown, fallback = '') { return typeof value === 'string' ? value : fallback; }
function asBoolean(value: unknown, fallback = false) { return typeof value === 'boolean' ? value : fallback; }
function asNumber(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function asObject(value: unknown) { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

function validStage(value: unknown, legacy = false): Stage {
  const clean = String(value);
  if (legacy && clean === 'ideas') return 'planned';
  return ['ideas', 'planned', 'progress', 'testing', 'shipped'].includes(clean) ? clean as Stage : 'planned';
}
function validPriority(value: unknown): Priority { return ['low', 'normal', 'high', 'critical'].includes(String(value)) ? value as Priority : 'normal'; }
function validEffort(value: unknown): Effort { return ['xs', 's', 'm', 'l', 'xl'].includes(String(value)) ? value as Effort : 'm'; }
function validReleaseStatus(value: unknown): ReleaseStatus { return ['planned', 'active', 'released'].includes(String(value)) ? value as ReleaseStatus : 'planned'; }
function validKind(value: unknown): WorkKind { return ['feature', 'bug', 'polish', 'performance', 'chore'].includes(String(value)) ? value as WorkKind : 'feature'; }
function validSeverity(value: unknown): BugSeverity { return ['low', 'medium', 'high', 'blocker'].includes(String(value)) ? value as BugSeverity : 'medium'; }
function validTheme(value: unknown): ThemePreset { return ['candy', 'night', 'paper'].includes(String(value)) ? value as ThemePreset : 'candy'; }
function validNoteColor(value: unknown): NoteColor { return ['pink', 'lilac', 'blue', 'mint', 'peach'].includes(String(value)) ? value as NoteColor : 'lilac'; }
function validDecisionStatus(value: unknown): DecisionStatus { return ['active', 'revisit', 'superseded'].includes(String(value)) ? value as DecisionStatus : 'active'; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'release'; }

function normaliseSettings(value: unknown): RoadmapSettings {
  const raw = asObject(value);
  const incoming = String(raw.startView);
  const supported = ['focus', 'inbox', 'board', 'qa', 'calendar', 'notes', 'decisions', 'launch', 'timeline', 'list'];
  const startView = incoming === 'releases' ? 'board' : supported.includes(incoming)
    ? incoming as RoadmapSettings['startView']
    : DEFAULT_SETTINGS.startView;
  const areas = stringArray(raw.areas).map((item) => item.trim()).filter(Boolean);
  return {
    startView,
    compactCards: asBoolean(raw.compactCards, DEFAULT_SETTINGS.compactCards),
    showShippedOnBoard: asBoolean(raw.showShippedOnBoard, DEFAULT_SETTINGS.showShippedOnBoard),
    dueSoonDays: Math.min(30, Math.max(1, asNumber(raw.dueSoonDays, DEFAULT_SETTINGS.dueSoonDays))),
    confirmPermanentDelete: asBoolean(raw.confirmPermanentDelete, DEFAULT_SETTINGS.confirmPermanentDelete),
    areas: areas.length ? Array.from(new Set(areas)) : [...DEFAULT_AREAS],
    themePreset: validTheme(raw.themePreset),
  };
}

function normaliseActivity(value: unknown): ActivityEntry[] {
  if (!Array.isArray(value)) return [];
  const allowed = ['created', 'moved', 'updated', 'archived', 'restored', 'release', 'inbox', 'note', 'decision', 'launch', 'focus'];
  return value.filter((item) => item && typeof item === 'object').slice(-300).map((item) => {
    const raw = item as Record<string, unknown>;
    const type = allowed.includes(String(raw.type)) ? raw.type as ActivityEntry['type'] : 'updated';
    return { id: asString(raw.id, uid('activity')), type, cardId: asString(raw.cardId) || undefined, message: asString(raw.message, 'Roadmap updated'), createdAt: asString(raw.createdAt, new Date().toISOString()) };
  });
}

function normaliseInbox(value: unknown): IdeaInboxNote[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((item) => {
    const raw = item as Record<string, unknown>;
    return { id: asString(raw.id, uid('thought')), text: asString(raw.text).trim(), createdAt: asString(raw.createdAt, new Date().toISOString()) };
  }).filter((item) => item.text);
}

function normaliseNotes(value: unknown): WorkspaceNote[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((item) => {
    const raw = item as Record<string, unknown>;
    const now = new Date().toISOString();
    return {
      id: asString(raw.id, uid('note')),
      title: asString(raw.title, 'Untitled note'),
      body: asString(raw.body),
      color: validNoteColor(raw.color),
      pinned: asBoolean(raw.pinned),
      createdAt: asString(raw.createdAt, now),
      updatedAt: asString(raw.updatedAt, now),
    };
  });
}

function normaliseDecisions(value: unknown, releaseIds: Set<string>): DecisionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((item) => {
    const raw = item as Record<string, unknown>;
    const now = new Date().toISOString();
    const releaseId = asString(raw.releaseId);
    return {
      id: asString(raw.id, uid('decision')),
      title: asString(raw.title, 'Untitled decision'),
      decision: asString(raw.decision),
      rationale: asString(raw.rationale),
      status: validDecisionStatus(raw.status),
      releaseId: releaseIds.has(releaseId) ? releaseId : '',
      reviewDate: asString(raw.reviewDate),
      createdAt: asString(raw.createdAt, now),
      updatedAt: asString(raw.updatedAt, now),
    };
  });
}

function normaliseLaunchPlans(value: unknown, releaseIds: Set<string>): LaunchPlan[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((item) => {
    const raw = item as Record<string, unknown>;
    const releaseId = asString(raw.releaseId);
    if (!releaseIds.has(releaseId)) return null;
    const checklist: LaunchChecklistItem[] = Array.isArray(raw.checklist) ? raw.checklist.filter((entry) => entry && typeof entry === 'object').map((entry) => {
      const row = entry as Record<string, unknown>;
      const category = ['QA', 'Store', 'Release', 'Comms'].includes(String(row.category)) ? row.category as LaunchChecklistItem['category'] : 'Release';
      return { id: asString(row.id, uid('launch')), text: asString(row.text), category, done: asBoolean(row.done) };
    }).filter((item) => item.text) : [];
    return { releaseId, checklist, notesDraft: asString(raw.notesDraft), updatedAt: asString(raw.updatedAt, new Date().toISOString()) };
  }).filter((item): item is LaunchPlan => Boolean(item));
}

function normaliseFocusSessions(value: unknown): FocusSessionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').slice(-500).map((item) => {
    const raw = item as Record<string, unknown>;
    return {
      id: asString(raw.id, uid('focus')),
      minutes: Math.max(1, Math.min(240, asNumber(raw.minutes, 25))),
      note: asString(raw.note),
      completedAt: asString(raw.completedAt, new Date().toISOString()),
    };
  });
}

export function normaliseRoadmap(input: unknown): RoadmapData {
  const raw = asObject(input);
  const rawVersion = asNumber(raw.version, 1);
  const legacyStages = rawVersion < 4;
  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
  const now = new Date().toISOString();
  const releases: RoadmapRelease[] = [];
  const releaseByName = new Map<string, string>();

  if (Array.isArray(raw.releases)) {
    for (const item of raw.releases) {
      if (!item || typeof item !== 'object') continue;
      const release = item as Record<string, unknown>;
      const name = asString(release.name).trim();
      if (!name) continue;
      const id = asString(release.id, uid('release'));
      releases.push({ id, name, status: validReleaseStatus(release.status), targetDate: asString(release.targetDate), notes: asString(release.notes), createdAt: asString(release.createdAt, now), updatedAt: asString(release.updatedAt, now) });
      releaseByName.set(name.toLowerCase(), id);
    }
  }

  for (const item of rawCards) {
    if (!item || typeof item !== 'object') continue;
    const card = item as Record<string, unknown>;
    const legacyName = asString(card.release).trim();
    if (!legacyName || releaseByName.has(legacyName.toLowerCase())) continue;
    const id = `release-${slug(legacyName)}-${releaseByName.size + 1}`;
    releases.push({ id, name: legacyName, status: 'planned', targetDate: '', notes: '', createdAt: now, updatedAt: now });
    releaseByName.set(legacyName.toLowerCase(), id);
  }

  const releaseIds = new Set(releases.map((release) => release.id));
  const cards: RoadmapCard[] = rawCards.filter((item) => item && typeof item === 'object').map((item, index) => {
    const card = item as Record<string, unknown>;
    const legacyReleaseName = asString(card.release).trim();
    const releaseIdCandidate = asString(card.releaseId);
    const releaseId = releaseIds.has(releaseIdCandidate) ? releaseIdCandidate : releaseByName.get(legacyReleaseName.toLowerCase()) ?? '';
    const stage = validStage(card.stage, legacyStages);
    const legacyKind = legacyStages && String(card.stage) === 'ideas' ? 'feature' : validKind(card.kind);
    const checklist = Array.isArray(card.checklist) ? card.checklist.filter((entry) => entry && typeof entry === 'object').map((entry) => {
      const value = entry as Record<string, unknown>;
      return { id: asString(value.id, uid('check')), text: asString(value.text), done: asBoolean(value.done) };
    }) : [];
    const links = Array.isArray(card.links) ? card.links.filter((entry) => entry && typeof entry === 'object').map((entry) => {
      const value = entry as Record<string, unknown>;
      return { id: asString(value.id, uid('link')), label: asString(value.label), url: asString(value.url) };
    }) : [];
    const updates = Array.isArray(card.updates) ? card.updates.filter((entry) => entry && typeof entry === 'object').map((entry) => {
      const value = entry as Record<string, unknown>;
      return { id: asString(value.id, uid('update')), text: asString(value.text), createdAt: asString(value.createdAt, now) };
    }) : [];
    return {
      id: asString(card.id, uid('card')),
      title: asString(card.title, 'Untitled item'),
      description: asString(card.description),
      stage,
      kind: legacyKind,
      bugSeverity: validSeverity(card.bugSeverity),
      today: asBoolean(card.today),
      area: asString(card.area, 'Core'),
      priority: validPriority(card.priority),
      effort: validEffort(card.effort),
      releaseId,
      startDate: asString(card.startDate),
      targetDate: asString(card.targetDate),
      labels: stringArray(card.labels),
      checklist,
      blockedBy: stringArray(card.blockedBy),
      links,
      updates,
      pinned: asBoolean(card.pinned),
      archived: asBoolean(card.archived),
      sortOrder: asNumber(card.sortOrder, (index + 1) * 1000),
      createdAt: asString(card.createdAt, now),
      updatedAt: asString(card.updatedAt, now),
    };
  });

  const cardIds = new Set(cards.map((card) => card.id));
  for (const card of cards) card.blockedBy = card.blockedBy.filter((id) => id !== card.id && cardIds.has(id));

  return {
    version: 5,
    cards,
    releases,
    settings: normaliseSettings(raw.settings),
    activity: normaliseActivity(raw.activity),
    inbox: normaliseInbox(raw.inbox),
    notes: normaliseNotes(raw.notes),
    decisions: normaliseDecisions(raw.decisions, releaseIds),
    launchPlans: normaliseLaunchPlans(raw.launchPlans, releaseIds),
    focusSessions: normaliseFocusSessions(raw.focusSessions),
  };
}

export function newCard(stage: Stage, area: string, order: number, kind: WorkKind = 'feature'): RoadmapCard {
  const now = new Date().toISOString();
  return {
    id: uid('card'), title: 'Untitled item', description: '', stage, kind, bugSeverity: 'medium', today: false,
    area: area || 'Core', priority: kind === 'bug' ? 'high' : 'normal', effort: 'm', releaseId: '', startDate: '', targetDate: '',
    labels: [], checklist: [], blockedBy: [], links: [], updates: [], pinned: false, archived: false, sortOrder: order, createdAt: now, updatedAt: now,
  };
}

export function newRelease(name = 'Next release'): RoadmapRelease {
  const now = new Date().toISOString();
  return { id: uid('release'), name, status: 'planned', targetDate: '', notes: '', createdAt: now, updatedAt: now };
}

export function newInboxNote(text: string): IdeaInboxNote {
  return { id: uid('thought'), text: text.trim(), createdAt: new Date().toISOString() };
}

export function newWorkspaceNote(): WorkspaceNote {
  const now = new Date().toISOString();
  return { id: uid('note'), title: 'Untitled note', body: '', color: 'lilac', pinned: false, createdAt: now, updatedAt: now };
}

export function newDecision(): DecisionEntry {
  const now = new Date().toISOString();
  return { id: uid('decision'), title: 'New decision', decision: '', rationale: '', status: 'active', releaseId: '', reviewDate: '', createdAt: now, updatedAt: now };
}

export function newLaunchPlan(releaseId: string): LaunchPlan {
  const rows: Array<[LaunchChecklistItem['category'], string]> = [
    ['QA', 'iOS final regression is complete'],
    ['QA', 'Android final regression is complete'],
    ['QA', 'No blocker bugs remain open'],
    ['Store', 'App Store release copy and screenshots are ready'],
    ['Store', 'Google Play release copy is ready'],
    ['Release', 'Version and build numbers are confirmed'],
    ['Release', 'Production backend / migration impact is checked'],
    ['Release', 'Rollback or hotfix path is understood'],
    ['Comms', 'In-app / community announcement is drafted'],
    ['Comms', 'Social announcement is drafted'],
  ];
  return {
    releaseId,
    checklist: rows.map(([category, text]) => ({ id: uid('launch'), category, text, done: false })),
    notesDraft: '',
    updatedAt: new Date().toISOString(),
  };
}
