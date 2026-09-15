import { CalendarCheck2, Filter, RotateCcw } from 'lucide-react';
import { PRIORITIES, WORK_KINDS } from '../constants';
import type { RoadmapRelease } from '../types';
import type { RoadmapFilters } from '../uiTypes';

export function FilterBar({ filters, areas, releases, labels, onChange, onClear }: {
  filters: RoadmapFilters;
  areas: string[];
  releases: RoadmapRelease[];
  labels: string[];
  onChange: (patch: Partial<RoadmapFilters>) => void;
  onClear: () => void;
}) {
  const active = [
    filters.area !== 'all', filters.priority !== 'all', filters.kind !== 'all', filters.releaseId !== 'all',
    filters.due !== 'all', Boolean(filters.label), filters.today,
  ].filter(Boolean).length;

  return (
    <div className="filter-bar">
      <div className="filter-title"><Filter size={15} /><span>Filter</span>{active > 0 && <b>{active}</b>}</div>
      <select value={filters.area} onChange={(event) => onChange({ area: event.target.value })} aria-label="Filter by area">
        <option value="all">All areas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}
      </select>
      <select value={filters.kind} onChange={(event) => onChange({ kind: event.target.value as RoadmapFilters['kind'] })} aria-label="Filter by type">
        <option value="all">Any type</option>{WORK_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
      </select>
      <select value={filters.priority} onChange={(event) => onChange({ priority: event.target.value as RoadmapFilters['priority'] })} aria-label="Filter by priority">
        <option value="all">Any priority</option>{PRIORITIES.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}
      </select>
      <select value={filters.releaseId} onChange={(event) => onChange({ releaseId: event.target.value })} aria-label="Filter by release">
        <option value="all">All releases</option><option value="none">No release</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
      </select>
      <select value={filters.due} onChange={(event) => onChange({ due: event.target.value as RoadmapFilters['due'] })} aria-label="Filter by date">
        <option value="all">Any date</option><option value="overdue">Overdue</option><option value="soon">Due soon</option><option value="unscheduled">No target date</option>
      </select>
      <select value={filters.label} onChange={(event) => onChange({ label: event.target.value })} aria-label="Filter by label">
        <option value="">All labels</option>{labels.map((label) => <option key={label} value={label}>{label}</option>)}
      </select>
      <button type="button" className={`today-filter ${filters.today ? 'active' : ''}`} onClick={() => onChange({ today: !filters.today })}><CalendarCheck2 size={14} /> Today</button>
      {active > 0 && <button type="button" className="clear-filters" onClick={onClear}><RotateCcw size={14} /> Clear</button>}
    </div>
  );
}
