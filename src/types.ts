export type Stage = 'ideas' | 'planned' | 'progress' | 'testing' | 'shipped';
export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type Effort = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ReleaseStatus = 'planned' | 'active' | 'released';
export type WorkKind = 'feature' | 'bug' | 'polish' | 'performance' | 'chore';
export type BugSeverity = 'low' | 'medium' | 'high' | 'blocker';
export type ThemePreset = 'candy' | 'night' | 'paper';
export type NoteColor = 'pink' | 'lilac' | 'blue' | 'mint' | 'peach';
export type DecisionStatus = 'active' | 'revisit' | 'superseded';
export type ViewId = 'focus' | 'inbox' | 'board' | 'qa' | 'calendar' | 'notes' | 'decisions' | 'launch' | 'timeline' | 'releases' | 'list' | 'archive' | 'settings';

export interface ChecklistItem { id: string; text: string; done: boolean; }
export interface CardLink { id: string; label: string; url: string; }
export interface CardUpdate { id: string; text: string; createdAt: string; }
export interface IdeaInboxNote { id: string; text: string; createdAt: string; }

export interface RoadmapCard {
  id: string; title: string; description: string; stage: Stage; kind: WorkKind; bugSeverity: BugSeverity; today: boolean;
  area: string; priority: Priority; effort: Effort; releaseId: string; startDate: string; targetDate: string; labels: string[];
  checklist: ChecklistItem[]; blockedBy: string[]; links: CardLink[]; updates: CardUpdate[]; pinned: boolean; archived: boolean;
  sortOrder: number; createdAt: string; updatedAt: string;
}

export interface RoadmapRelease { id: string; name: string; status: ReleaseStatus; targetDate: string; notes: string; createdAt: string; updatedAt: string; }
export interface WorkspaceNote { id: string; title: string; body: string; color: NoteColor; pinned: boolean; createdAt: string; updatedAt: string; }
export interface DecisionEntry { id: string; title: string; decision: string; rationale: string; status: DecisionStatus; releaseId: string; reviewDate: string; createdAt: string; updatedAt: string; }
export interface LaunchChecklistItem { id: string; text: string; category: 'QA' | 'Store' | 'Release' | 'Comms'; done: boolean; }
export interface LaunchPlan { releaseId: string; checklist: LaunchChecklistItem[]; notesDraft: string; updatedAt: string; }
export interface FocusSessionRecord { id: string; minutes: number; note: string; completedAt: string; }

export interface RoadmapSettings {
  startView: Exclude<ViewId, 'archive' | 'settings'>;
  compactCards: boolean;
  showShippedOnBoard: boolean;
  dueSoonDays: number;
  confirmPermanentDelete: boolean;
  areas: string[];
  themePreset: ThemePreset;
}

export interface ActivityEntry {
  id: string;
  type: 'created' | 'moved' | 'updated' | 'archived' | 'restored' | 'release' | 'inbox' | 'note' | 'decision' | 'launch' | 'focus';
  cardId?: string;
  message: string;
  createdAt: string;
}

export interface RoadmapData {
  version: 5;
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  settings: RoadmapSettings;
  activity: ActivityEntry[];
  inbox: IdeaInboxNote[];
  notes: WorkspaceNote[];
  decisions: DecisionEntry[];
  launchPlans: LaunchPlan[];
  focusSessions: FocusSessionRecord[];
}

export interface SecurityStatus { configured: boolean; unlocked: boolean; autoLockMinutes: number; }
export interface SecurityActionResult { ok: boolean; error?: string; }

export interface DemeRoadmapApi {
  load: (fallback: RoadmapData) => Promise<unknown>;
  save: (data: RoadmapData) => Promise<{ ok: boolean }>;
  exportBackup: (data: RoadmapData) => Promise<{ canceled: boolean; filePath?: string }>;
  importBackup: () => Promise<{ canceled: boolean; data?: unknown }>;
  dataPath: () => Promise<string>;
  revealData: () => Promise<{ ok: boolean }>;
  securityStatus: () => Promise<SecurityStatus>;
  securitySetup: (passcode: string) => Promise<SecurityActionResult>;
  securityVerify: (passcode: string) => Promise<SecurityActionResult>;
  securityLock: () => Promise<SecurityActionResult>;
  securityChange: (currentPasscode: string, nextPasscode: string) => Promise<SecurityActionResult>;
  securitySetAutoLock: (minutes: number) => Promise<SecurityActionResult>;
  setWindowTheme: (theme: ThemePreset) => Promise<{ ok: boolean }>;
}
