import type { Priority } from './types';

export interface RoadmapFilters {
  area: string;
  priority: 'all' | Priority;
  releaseId: string;
  due: 'all' | 'overdue' | 'soon' | 'unscheduled';
  label: string;
}

export const EMPTY_FILTERS: RoadmapFilters = {
  area: 'all',
  priority: 'all',
  releaseId: 'all',
  due: 'all',
  label: '',
};
