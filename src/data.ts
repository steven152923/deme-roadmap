import type {
  ActivityEntry,
  BugSeverity,
  Effort,
  IdeaInboxNote,
  Priority,
  ReleaseStatus,
  RoadmapCard,
  RoadmapData,
  RoadmapRelease,
  RoadmapSettings,
  Stage,
  WorkKind,
} from './types';

export const DEFAULT_AREAS = ['Core', 'Home', 'Communities', 'Profiles', 'Chats', 'Journals', 'Safety', 'Premium', 'Performance', 'Polish'];

export const DEFAULT_SETTINGS: RoadmapSettings = {
  startView: 'focus',
  compactCards: false,
  showShippedOnBoard: true,
  dueSoonDays: 7,
  confirmPermanentDelete: true,
  areas: DEFAULT_AREAS,
};

export const DEFAULT_ROADMAP: RoadmapData = {
  version: 4,
  cards: [],
  releases: [],
  settings: DEFAULT_SETTINGS,
  activity: [],
  inbox: [],
};

export function uid(prefix = 'id') {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function asString(value: unknown, fallback = '') { return typeof value === 'string' ? value : fallback; }
function asBoolean(value: unknown, fallback = false) { return typeof value === 'boolean' ? value : fallback; }
function asNumber(value: unknown, fallback = 0) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function validStage(value: unknown, legacy = false): Stage {
  const clean = String(value);
  if (legacy && clean === 'ideas') return 'planned';
  return ['ideas', 'planned', 'progress', 'testing', 'shipped'].includes(clean) ? (clean as Stage) : 'planned';
}
function validPriority(value: unknown): Priority { return ['low', 'normal', 'high', 'critical'].includes(String(value)) ? (value as Priority) : 'normal'; }
function validEffort(value: unknown): Effort { return ['xs', 's', 'm', 'l', 'xl'].includes(String(value)) ? (value as Effort) : 'm'; }
function validReleaseStatus(value: unknown): ReleaseStatus { return ['planned', 'active', 'released'].includes(String(value)) ? (value as ReleaseStatus) : 'planned'; }
function validKind(value: unknown): WorkKind { return ['feature', 'bug', 'polish', 'performance', 'chore'].includes(String(value)) ? (value as WorkKind) : 'feature'; }
function validSeverity(value: unknown): BugSeverity { return ['low', 'medium', 'high', 'blocker'].includes(String(value)) ? (value as BugSeverity) : 'medium'; }
function stringArray(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'release'; }

function normaliseSettings(value: unknown): RoadmapSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const incoming = String(raw.startView);
  const startView = incoming === 'releases' ? 'board' : ['focus', 'inbox', 'board', 'timeline', 'list'].includes(incoming)
    ? (incoming as RoadmapSettings['startView'])
    : DEFAULT_SETTINGS.startView;
  const areas = stringArray(raw.areas).map((item) => item.trim()).filter(Boolean);
  return {
    startView,
    compactCards: asBoolean(raw.compactCards, DEFAULT_SETTINGS.compactCards),
    showShippedOnBoard: asBoolean(raw.showShippedOnBoard, DEFAULT_SETTINGS.showShippedOnBoard),
    dueSoonDays: Math.min(30, Math.max(1, asNumber(raw.dueSoonDays, DEFAULT_SETTINGS.dueSoonDays))),
    confirmPermanentDelete: asBoolean(raw.confirmPermanentDelete, DEFAULT_SETTINGS.confirmPermanentDelete),
    areas: areas.length ? Array.from(new Set(areas)) : [...DEFAULT_AREAS],
  };
}

function normaliseActivity(value: unknown): ActivityEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').slice(-250).map((item) => {
    const raw = item as Record<string, unknown>;
    const type = ['created', 'moved', 'updated', 'archived', 'restored', 'release', 'inbox'].includes(String(raw.type)) ? (raw.type as ActivityEntry['type']) : 'updated';
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

export function normaliseRoadmap(input: unknown): RoadmapData {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
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

  return { version: 4, cards, releases, settings: normaliseSettings(raw.settings), activity: normaliseActivity(raw.activity), inbox: normaliseInbox(raw.inbox) };
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
