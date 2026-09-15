import {
  AlertTriangle,
  CalendarDays,
  CheckSquare2,
  Link2,
  LockKeyhole,
  Pin,
  Tags,
} from 'lucide-react';
import { STAGE_LABEL } from '../constants';
import type { RoadmapCard, RoadmapRelease } from '../types';
import { checklistRatio, formatShortDate, isOverdue } from '../utils';

interface RoadmapCardTileProps {
  card: RoadmapCard;
  release?: RoadmapRelease | null;
  compact?: boolean;
  dependencyTitles?: string[];
  onClick: () => void;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
}

export function RoadmapCardTile({
  card,
  release,
  compact = false,
  dependencyTitles = [],
  onClick,
  onDragStart,
  onDrop,
}: RoadmapCardTileProps) {
  const checklist = checklistRatio(card);
  const overdue = isOverdue(card);
  const blocked = dependencyTitles.length > 0;

  return (
    <button
      type="button"
      className={`roadmap-card priority-${card.priority} ${compact ? 'compact' : ''} ${blocked ? 'is-blocked' : ''}`}
      onClick={onClick}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (event) => event.preventDefault() : undefined}
      onDrop={onDrop}
    >
      <span className="card-accent" />
      <div className="card-topline">
        <span className="area-pill">{card.area}</span>
        <span className="card-top-icons">
          {card.pinned && <Pin size={13} aria-label="Pinned" />}
          {blocked && <LockKeyhole size={13} aria-label="Blocked" />}
        </span>
      </div>

      <strong className="card-title">{card.title || 'Untitled item'}</strong>
      {!compact && card.description && <p className="card-description">{card.description}</p>}

      {card.labels.length > 0 && (
        <div className="label-row" aria-label="Labels">
          {card.labels.slice(0, compact ? 2 : 3).map((label) => (
            <span key={label}>{label}</span>
          ))}
          {card.labels.length > (compact ? 2 : 3) && <span>+{card.labels.length - (compact ? 2 : 3)}</span>}
        </div>
      )}

      <div className="card-meta">
        {release && <span className="release-chip">{release.name}</span>}
        {card.targetDate && (
          <span className={overdue ? 'overdue' : ''}>
            {overdue ? <AlertTriangle size={13} /> : <CalendarDays size={13} />}
            {formatShortDate(card.targetDate)}
          </span>
        )}
        {checklist && (
          <span><CheckSquare2 size={13} /> {checklist.done}/{checklist.total}</span>
        )}
        {card.links.length > 0 && <span><Link2 size={13} /> {card.links.length}</span>}
        {card.labels.length > 0 && compact && <span><Tags size={13} /> {card.labels.length}</span>}
        <span className="effort-chip">{card.effort.toUpperCase()}</span>
      </div>

      {blocked && !compact && (
        <div className="blocked-by">
          Blocked by {dependencyTitles.slice(0, 2).join(', ')}{dependencyTitles.length > 2 ? ` +${dependencyTitles.length - 2}` : ''}
        </div>
      )}

      {compact && <span className="compact-stage">{STAGE_LABEL[card.stage]}</span>}
    </button>
  );
}
