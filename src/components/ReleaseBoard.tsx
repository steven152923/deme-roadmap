import { useMemo, useState } from 'react';
import {
  Bug,
  CalendarCheck2,
  CalendarDays,
  ChevronDown,
  CircleDot,
  Edit3,
  Heart,
  PackagePlus,
  Plus,
  Rocket,
  Sparkles,
  TestTube2,
  Wrench,
} from 'lucide-react';
import { STAGES, WORK_KINDS } from '../constants';
import type { RoadmapCard, RoadmapRelease, Stage, WorkKind } from '../types';
import { completionPercent, formatLongDate, releaseFor, sortByOrder } from '../utils';
import { RoadmapCardTile } from './RoadmapCardTile';

const UNASSIGNED = '__unassigned__';

type KindFilter = 'all' | WorkKind;

function dependencyTitles(card: RoadmapCard, cards: RoadmapCard[]) {
  const byId = new Map(cards.map((item) => [item.id, item.title]));
  return card.blockedBy.map((id) => byId.get(id)).filter((value): value is string => Boolean(value));
}

function statusIcon(stage: Stage) {
  if (stage === 'planned') return <CircleDot size={15} />;
  if (stage === 'progress') return <Wrench size={15} />;
  if (stage === 'testing') return <TestTube2 size={15} />;
  if (stage === 'ideas') return <Bug size={15} />;
  return <Heart size={15} />;
}

export function ReleaseBoard({
  cards,
  allCards,
  releases,
  selectedReleaseId,
  compact,
  showCompleted,
  onSelectRelease,
  onSelectCard,
  onMove,
  onReorder,
  onAdd,
  onCreateRelease,
  onEditRelease,
  onSetActiveRelease,
}: {
  cards: RoadmapCard[];
  allCards: RoadmapCard[];
  releases: RoadmapRelease[];
  selectedReleaseId: string;
  compact: boolean;
  showCompleted: boolean;
  onSelectRelease: (id: string) => void;
  onSelectCard: (id: string) => void;
  onMove: (id: string, stage: Stage) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onAdd: (stage: Stage, patch?: Partial<RoadmapCard>) => void;
  onCreateRelease: () => void;
  onEditRelease: (id: string) => void;
  onSetActiveRelease: (id: string) => void;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [todayOnly, setTodayOnly] = useState(false);
  const selectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? null;
  const visibleReleaseId = selectedRelease ? selectedRelease.id : UNASSIGNED;
  const releaseCards = cards.filter((card) => visibleReleaseId === UNASSIGNED ? !card.releaseId : card.releaseId === visibleReleaseId);
  const filteredCards = releaseCards.filter((card) => (kindFilter === 'all' || card.kind === kindFilter) && (!todayOnly || card.today));
  const stages = showCompleted ? STAGES : STAGES.filter((stage) => stage.id !== 'shipped');
  const completed = releaseCards.filter((card) => card.stage === 'shipped').length;
  const bugs = releaseCards.filter((card) => card.kind === 'bug' && card.stage !== 'shipped').length;
  const working = releaseCards.filter((card) => card.stage === 'progress').length;
  const testing = releaseCards.filter((card) => card.stage === 'testing').length;
  const percent = completionPercent(releaseCards);
  const tabs = useMemo(() => [...releases].sort((a, b) => {
    const weight = { active: 0, planned: 1, released: 2 } as const;
    return weight[a.status] - weight[b.status] || (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
  }), [releases]);

  function sourceId(event: React.DragEvent) {
    return event.dataTransfer.getData('application/x-deme-card') || event.dataTransfer.getData('text/plain');
  }

  function addForStage(stage: Stage) {
    onAdd(stage, {
      releaseId: selectedRelease?.id ?? '',
      kind: stage === 'ideas' ? 'bug' : kindFilter !== 'all' ? kindFilter : 'feature',
      priority: stage === 'ideas' ? 'high' : 'normal',
    });
  }

  return (
    <div className="release-board-page">
      <section className="release-switcher-card">
        <div className="release-switcher-scroll">
          {tabs.map((release) => (
            <button
              key={release.id}
              type="button"
              className={`release-tab status-${release.status} ${selectedReleaseId === release.id ? 'active' : ''}`}
              onClick={() => onSelectRelease(release.id)}
            >
              <span className="release-tab-dot" />
              <span><strong>{release.name}</strong><small>{release.status}{release.targetDate ? ` · ${formatLongDate(release.targetDate)}` : ''}</small></span>
            </button>
          ))}
          <button type="button" className={`release-tab unassigned ${!selectedRelease ? 'active' : ''}`} onClick={() => onSelectRelease(UNASSIGNED)}>
            <span className="release-tab-dot" /><span><strong>Unassigned</strong><small>Work without a release</small></span>
          </button>
        </div>
        <button className="new-release-candy" type="button" onClick={onCreateRelease}><PackagePlus size={16} /> New release</button>
      </section>

      <section className={`release-health-card ${selectedRelease ? `status-${selectedRelease.status}` : 'unassigned'}`}>
        <span className="health-sparkle health-sparkle-a">✦</span>
        <span className="health-sparkle health-sparkle-b">♡</span>
        <div className="release-health-main">
          <div className="release-health-icon">{selectedRelease ? <Rocket size={23} /> : <Sparkles size={23} />}</div>
          <div>
            <span className="health-kicker">{selectedRelease ? `${selectedRelease.status} release` : 'Loose work'}</span>
            <h2>{selectedRelease?.name ?? 'Unassigned work'}</h2>
            <p>{selectedRelease?.notes || (selectedRelease ? 'Add a little release goal so Future You remembers what this version is for.' : 'Useful work that has not found a release home yet.')}</p>
          </div>
        </div>
        <div className="release-health-stats">
          <div><strong>{percent}%</strong><span>complete</span></div>
          <div><strong>{working}</strong><span>working on</span></div>
          <div><strong>{testing}</strong><span>testing</span></div>
          <div className={bugs ? 'has-bugs' : ''}><strong>{bugs}</strong><span>open bugs</span></div>
        </div>
        <div className="release-health-footer">
          <div className="health-progress"><div><i style={{ width: `${percent}%` }} /></div><span>{completed}/{releaseCards.length} completed</span></div>
          <div className="health-actions">
            {selectedRelease?.targetDate && <span className="health-date"><CalendarDays size={14} /> {formatLongDate(selectedRelease.targetDate)}</span>}
            {selectedRelease && selectedRelease.status !== 'active' && selectedRelease.status !== 'released' && <button type="button" onClick={() => onSetActiveRelease(selectedRelease.id)}><Rocket size={14} /> Make active</button>}
            {selectedRelease && <button type="button" onClick={() => onEditRelease(selectedRelease.id)}><Edit3 size={14} /> Edit release</button>}
          </div>
        </div>
      </section>

      <div className="release-board-toolbar">
        <div className="board-kind-filters">
          <button type="button" className={kindFilter === 'all' ? 'active' : ''} onClick={() => setKindFilter('all')}>Everything</button>
          {WORK_KINDS.map((kind) => <button key={kind.id} type="button" className={`${kindFilter === kind.id ? 'active' : ''} kind-${kind.id}`} onClick={() => setKindFilter(kind.id)}>{kind.label}</button>)}
        </div>
        <button type="button" className={`today-board-filter ${todayOnly ? 'active' : ''}`} onClick={() => setTodayOnly(!todayOnly)}><CalendarCheck2 size={15} /> Today</button>
      </div>

      <div className={`board-v2 release-board-grid ${compact ? 'compact-board' : ''}`}>
        {stages.map((stage) => {
          const stageCards = sortByOrder(filteredCards.filter((card) => card.stage === stage.id));
          return (
            <section
              className={`board-column stage-${stage.id}`}
              key={stage.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const id = sourceId(event);
                if (id) onMove(id, stage.id);
              }}
            >
              <div className="board-column-head release-lane-head">
                <div><span className="lane-icon">{statusIcon(stage.id)}</span><strong>{stage.label}</strong><b>{stageCards.length}</b></div>
                <small>{stage.hint}</small>
              </div>
              <div className="board-card-stack">
                {stageCards.map((card) => (
                  <div className="draggable-card" key={card.id}>
                    <RoadmapCardTile
                      card={card}
                      release={releaseFor(card, releases)}
                      compact={compact}
                      dependencyTitles={dependencyTitles(card, allCards)}
                      onClick={() => onSelectCard(card.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('application/x-deme-card', card.id);
                        event.dataTransfer.setData('text/plain', card.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const id = sourceId(event);
                        if (id && id !== card.id) onReorder(id, card.id);
                      }}
                    />
                  </div>
                ))}
                {!stageCards.length && <div className="column-empty">Nothing here ✦</div>}
              </div>
              <button className="column-add" type="button" onClick={() => addForStage(stage.id)}><Plus size={15} /> Add to {stage.short}</button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export { UNASSIGNED };
