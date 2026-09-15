export type Stage = 'ideas' | 'planned' | 'progress' | 'testing' | 'shipped';
export type Priority = 'low' | 'normal' | 'high';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface RoadmapCard {
  id: string;
  title: string;
  description: string;
  stage: Stage;
  area: string;
  priority: Priority;
  release: string;
  targetDate: string;
  checklist: ChecklistItem[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoadmapData {
  version: 1;
  cards: RoadmapCard[];
}

export interface DemeRoadmapApi {
  load: (fallback: RoadmapData) => Promise<RoadmapData>;
  save: (data: RoadmapData) => Promise<{ ok: boolean }>;
  exportBackup: (data: RoadmapData) => Promise<{ canceled: boolean; filePath?: string }>;
  importBackup: () => Promise<{ canceled: boolean; data?: RoadmapData }>;
  dataPath: () => Promise<string>;
}
