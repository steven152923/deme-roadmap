export type Stage = 'ideas' | 'planned' | 'progress' | 'testing' | 'shipped';
export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type Effort = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ReleaseStatus = 'planned' | 'active' | 'released';
export type ViewId = 'focus' | 'inbox' | 'board' | 'timeline' | 'releases' | 'list' | 'archive' | 'settings';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CardLink {
  id: string;
  label: string;
  url: string;
}

export interface CardUpdate {
  id: string;
  text: string;
  createdAt: string;
}

export interface IdeaInboxNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface RoadmapCard {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  area: string;
  priority: Priority;
  effort: Effort;
  releaseId: string;
  startDate: string;
  targetDate: string;
  labels: string[];
  checklist: ChecklistItem[];
  blockedBy: string[];
  links: CardLink[];
  updates: CardUpdate[];
  pinned: boolean;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapRelease {
  id: string;
  name: string;
  status: ReleaseStatus;
  targetDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapSettings {
  startView: Exclude<ViewId, 'archive' | 'settings'>;
  compactCards: boolean;
  showShippedOnBoard: boolean;
  dueSoonDays: number;
  confirmPermanentDelete: boolean;
  areas: string[];
}

export interface ActivityEntry {
  id: string;
  type: 'created' | 'moved' | 'updated' | 'archived' | 'restored' | 'release' | 'inbox';
  cardId?: string;
  message: string;
  createdAt: string;
}

export interface RoadmapData {
  version: 3;
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  settings: RoadmapSettings;
  activity: ActivityEntry[];
  inbox: IdeaInboxNote[];
}

export interface DemeRoadmapApi {
  load: (fallback: RoadmapData) => Promise<unknown>;
  save: (data: RoadmapData) => Promise<{ ok: boolean }>;
  exportBackup: (data: RoadmapData) => Promise<{ canceled: boolean; filePath?: string }>;
  importBackup: () => Promise<{ canceled: boolean; data?: unknown }>;
  dataPath: () => Promise<string>;
  revealData: () => Promise<{ ok: boolean }>;
}
