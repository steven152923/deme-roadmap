import type { Priority, WorkKind } from './types';

export interface RoadmapFilters {
  area: string;
  priority: 'all' | Priority;
  kind: 'all' | WorkKind;
  releaseId: string;
  due: 'all' | 'overdue' | 'soon' | 'unscheduled';
  label: string;
  today: boolean;
}

export const EMPTY_FILTERS: RoadmapFilters = {
  area: 'all',
  priority: 'all',
  kind: 'all',
  releaseId: 'all',
  due: 'all',
  label: '',
  today: false,
};
