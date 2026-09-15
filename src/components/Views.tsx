import { useMemo, useState, type CSSProperties, type DragEvent } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Columns3,
  FolderOpen,
  GripVertical,
  ListFilter,
  LockKeyhole,
  PackageCheck,
  Pin,
  Plus,
  Rocket,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Download,
} from 'lucide-react';
import { PRIORITY_WEIGHT, STAGES, STAGE_LABEL } from '../constants';
import type {
  ActivityEntry,
  RoadmapCard,
  RoadmapRelease,
  RoadmapSettings,
  Stage,
} from '../types';
import {
  completionPercent,
  formatActivityDate,
  formatLongDate,
  formatShortDate,
  isDueSoon,
  isOverdue,
  monthKey,
  monthLabel,
  nextMonths,
  releaseFor,
  sortByOrder,
} from '../utils';
import { RoadmapCardTile } from './RoadmapCardTile';

function dependencyTitles(card: RoadmapCard, cards: RoadmapCard[]) {
  const byId = new Map(cards.map((item) => [item.id, item.title]));
  return card.blockedBy.map((id) => byId.get(id)).filter((value): value is string => Boolean(value));
}

function CardRow({ card, cards, releases, onSelect }: { card: RoadmapCard; cards: RoadmapCard[]; releases: RoadmapRelease[]; onSelect: (id: string) => void }) {
  const release = releaseFor(card, releases);
  return (
    <button className="focus-row" type="button" onClick={() => onSelect(card.id)}>
      <span className={`priority-dot ${card.priority}`} />
      <span className="focus-row-main"><strong>{card.title}</strong><small>{card.area}{release ? ` · ${release.name}` : ''}</small></span>
      {card.pinned && <Pin size={14} />}
      {card.blockedBy.length > 0 && <LockKeyhole size={14} />}
      {card.targetDate && <span className={isOverdue(card) ? 'date-badge overdue' : 'date-badge'}>{formatShortDate(card.targetDate)}</span>}
      <ChevronRight size={16} />
    </button>
  );
}

export function FocusView({
  cards,
  allCards,
  releases,
  activity,
  dueSoonDays,
  onSelect,
  onAdd,
  onNavigate,
}: {
  cards: RoadmapCard[];
  allCards: RoadmapCard[];
  releases: RoadmapRelease[];
  activity: ActivityEntry[];
  dueSoonDays: number;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onNavigate: (view: 'board' | 'timeline' | 'releases') => void;
}) {
  const progress = sortByOrder(cards.filter((card) => card.stage === 'progress'));
  const testing = sortByOrder(cards.filter((card) => card.stage === 'testing'));
  const overdue = cards.filter(isOverdue).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const dueSoon = cards.filter((card) => isDueSoon(card, dueSoonDays)).sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  const blocked = cards.filter((card) => card.blockedBy.length > 0 && card.stage !== 'shipped');
  const pinned = sortByOrder(cards.filter((card) => card.pinned && card.stage !== 'shipped'));
  const planned = sortByOrder(cards.filter((card) => card.stage === 'planned')).slice(0, 5);
  const activeRelease = releases.find((release) => release.status === 'active') ?? null;
  const activeReleaseCards = activeRelease ? allCards.filter((card) => !card.archived && card.releaseId === activeRelease.id) : [];

  if (!cards.length && !allCards.some((card) => !card.archived)) {
    return (
      <div className="empty-welcome v2">
        <div className="welcome-orb"><Sparkles size={27} /></div>
        <span className="eyebrow">A clean start</span>
        <h2>Build the roadmap without building a bureaucracy.</h2>
        <p>Capture an idea, decide when it matters, and move it forward. Releases, dates and dependencies are there when you need them, invisible when you don’t.</p>
        <button className="primary-button" type="button" onClick={onAdd}><Plus size={18} /> Add the first item</button>
        <div className="starter-flow"><span>Idea</span><ArrowRight size={14} /><span>Planned</span><ArrowRight size={14} /><span>Build</span><ArrowRight size={14} /><span>Test</span><ArrowRight size={14} /><span>Ship</span></div>
      </div>
    );
  }

  return (
    <div className="focus-v2">
      <section className="focus-lead">
        <div className="focus-lead-copy">
          <span className="eyebrow">Right now</span>
          <h2>{progress.length ? `${progress.length} item${progress.length === 1 ? '' : 's'} being built` : 'The build lane is clear'}</h2>
          <p>{testing.length ? `${testing.length} ${testing.length === 1 ? 'item is' : 'items are'} in testing.` : 'Nothing is waiting on QA.'} {overdue.length ? `${overdue.length} ${overdue.length === 1 ? 'target is' : 'targets are'} overdue.` : 'No overdue targets.'}</p>
        </div>
        <div className="focus-lead-actions">
          <button type="button" onClick={onAdd}><Plus size={16} /> Quick add</button>
          <button type="button" onClick={() => onNavigate('board')}><Columns3 size={16} /> Open board</button>
        </div>
      </section>

      <div className="metric-grid">
        <Metric icon={<Rocket size={18} />} label="Building" value={progress.length} note="active work" tone="purple" />
        <Metric icon={<CheckCircle2 size={18} />} label="Testing" value={testing.length} note="needs QA" tone="blue" />
        <Metric icon={<AlertTriangle size={18} />} label="Overdue" value={overdue.length} note="past target" tone={overdue.length ? 'red' : 'neutral'} />
        <Metric icon={<LockKeyhole size={18} />} label="Blocked" value={blocked.length} note="has dependencies" tone={blocked.length ? 'amber' : 'neutral'} />
      </div>

      {activeRelease && (
        <section className="active-release-card" onClick={() => onNavigate('releases')}>
          <div className="release-orb"><PackageCheck size={21} /></div>
          <div className="active-release-main">
            <span>Active release</span>
            <h3>{activeRelease.name}</h3>
            <p>{activeRelease.notes || 'No release goal written yet.'}</p>
          </div>
          <div className="release-progress-block">
            <strong>{completionPercent(activeReleaseCards)}%</strong>
            <span>{activeReleaseCards.filter((card) => card.stage === 'shipped').length}/{activeReleaseCards.length} shipped</span>
            <div className="progress-track"><i style={{ width: `${completionPercent(activeReleaseCards)}%` }} /></div>
          </div>
          {activeRelease.targetDate && <div className="release-target"><CalendarDays size={15} /> {formatLongDate(activeRelease.targetDate)}</div>}
          <ChevronRight size={19} />
        </section>
      )}

      <div className="focus-columns">
        <section className="focus-panel wide">
          <div className="panel-heading"><div><span className="eyebrow">Work</span><h3>{pinned.length ? 'Pinned & active' : 'In progress'}</h3></div><span>{(pinned.length || progress.length)}</span></div>
          <div className="focus-row-list">
            {(pinned.length ? pinned : progress).slice(0, 8).map((card) => <CardRow key={card.id} card={card} cards={allCards} releases={releases} onSelect={onSelect} />)}
            {!(pinned.length || progress.length) && <div className="quiet-empty"><CircleDot size={16} /> Mark something In progress when work starts.</div>}
          </div>
        </section>

        <section className="focus-panel">
          <div className="panel-heading"><div><span className="eyebrow">Calendar</span><h3>Due soon</h3></div><button className="text-button" type="button" onClick={() => onNavigate('timeline')}>Roadmap</button></div>
          <div className="focus-row-list small">
            {[...overdue, ...dueSoon.filter((card) => !overdue.some((item) => item.id === card.id))].slice(0, 7).map((card) => <CardRow key={card.id} card={card} cards={allCards} releases={releases} onSelect={onSelect} />)}
            {!overdue.length && !dueSoon.length && <div className="quiet-empty"><CalendarClock size={16} /> Nothing due in the next {dueSoonDays} days.</div>}
          </div>
        </section>
      </div>

      <div className="focus-columns lower">
        <section className="focus-panel">
          <div className="panel-heading"><div><span className="eyebrow">Queue</span><h3>Up next</h3></div><span>{planned.length}</span></div>
          <div className="focus-row-list small">
            {planned.map((card) => <CardRow key={card.id} card={card} cards={allCards} releases={releases} onSelect={onSelect} />)}
            {!planned.length && <div className="quiet-empty"><Target size={16} /> Nothing planned yet.</div>}
          </div>
        </section>

        <section className="focus-panel activity-panel">
          <div className="panel-heading"><div><span className="eyebrow">Local history</span><h3>Recent activity</h3></div></div>
          <div className="activity-list">
            {[...activity].reverse().slice(0, 7).map((entry) => (
              <button key={entry.id} type="button" disabled={!entry.cardId} onClick={() => entry.cardId && onSelect(entry.cardId)}>
                <span className={`activity-icon ${entry.type}`}><Clock3 size={14} /></span>
                <span><strong>{entry.message}</strong><small>{formatActivityDate(entry.createdAt)}</small></span>
              </button>
            ))}
            {!activity.length && <div className="quiet-empty"><Clock3 size={16} /> Activity will appear as you move things around.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note: string; tone: string }) {
  return <div className={`metric-card ${tone}`}><span className="metric-icon">{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div>;
}

export function BoardView({
  cards,
  allCards,
  releases,
  compact,
  showShipped,
  onSelect,
  onMove,
  onReorder,
  onAdd,
}: {
  cards: RoadmapCard[];
  allCards: RoadmapCard[];
  releases: RoadmapRelease[];
  compact: boolean;
  showShipped: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, stage: Stage) => void;
  onReorder: (sourceId: string, targetId: string) => void;
  onAdd: (stage: Stage) => void;
}) {
  const stages = showShipped ? STAGES : STAGES.filter((stage) => stage.id !== 'shipped');

  function sourceId(event: DragEvent) {
    return event.dataTransfer.getData('application/x-deme-card') || event.dataTransfer.getData('text/plain');
  }

  return (
    <div className={`board-v2 ${compact ? 'compact-board' : ''}`}>
      {stages.map((stage) => {
        const stageCards = sortByOrder(cards.filter((card) => card.stage === stage.id));
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
            <div className="board-column-head">
              <div><span className="stage-dot" /><strong>{stage.label}</strong><b>{stageCards.length}</b></div>
              <small>{stage.hint}</small>
            </div>
            <div className="board-card-stack">
              {stageCards.map((card) => (
                <div className="draggable-card" key={card.id}>
                  <span className="drag-grip"><GripVertical size={14} /></span>
                  <RoadmapCardTile
                    card={card}
                    release={releaseFor(card, releases)}
                    compact={compact}
                    dependencyTitles={dependencyTitles(card, allCards)}
                    onClick={() => onSelect(card.id)}
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
              {!stageCards.length && <div className="column-empty">Drop something here</div>}
            </div>
            <button className="column-add" type="button" onClick={() => onAdd(stage.id)}><Plus size={15} /> Add to {stage.short}</button>
          </section>
        );
      })}
    </div>
  );
}

export function TimelineView({ cards, allCards, releases, onSelect }: { cards: RoadmapCard[]; allCards: RoadmapCard[]; releases: RoadmapRelease[]; onSelect: (id: string) => void }) {
  const months = nextMonths(7);
  const scheduled = cards.filter((card) => card.targetDate || card.startDate);
  const unscheduled = sortByOrder(cards.filter((card) => !card.targetDate && !card.startDate));
  const areas = Array.from(new Set(scheduled.map((card) => card.area))).sort();
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  function position(card: RoadmapCard) {
    const start = monthKey(card.startDate || card.targetDate);
    const end = monthKey(card.targetDate || card.startDate);
    const startIndex = Math.max(0, months.indexOf(start));
    const rawEnd = months.indexOf(end);
    const endIndex = rawEnd === -1 ? (end < firstMonth ? 0 : months.length - 1) : rawEnd;
    return { gridColumn: `${startIndex + 2} / ${Math.max(startIndex, endIndex) + 3}` } as CSSProperties;
  }

  return (
    <div className="timeline-page">
      <div className="timeline-shell">
        <div className="timeline-header timeline-grid">
          <div className="timeline-area-label">Area</div>
          {months.map((month) => <div key={month} className="timeline-month">{monthLabel(month)}</div>)}
        </div>
        <div className="release-marker-row timeline-grid">
          <div className="timeline-area-label">Releases</div>
          {releases.filter((release) => release.targetDate && monthKey(release.targetDate) >= firstMonth && monthKey(release.targetDate) <= lastMonth).map((release) => {
            const index = months.indexOf(monthKey(release.targetDate));
            return <div key={release.id} className={`release-marker status-${release.status}`} style={{ gridColumn: `${index + 2} / ${index + 3}` }} title={`${release.name} · ${formatLongDate(release.targetDate)}`}><span>{release.name}</span><i /></div>;
          })}
        </div>
        {areas.map((area) => {
          const areaCards = scheduled.filter((card) => card.area === area).filter((card) => {
            const cardStart = monthKey(card.startDate || card.targetDate);
            const cardEnd = monthKey(card.targetDate || card.startDate);
            return cardEnd >= firstMonth && cardStart <= lastMonth;
          });
          return (
            <div className="timeline-row timeline-grid" key={area}>
              <div className="timeline-area-label"><strong>{area}</strong><span>{areaCards.length}</span></div>
              {areaCards.map((card) => {
                const release = releaseFor(card, releases);
                return (
                  <button key={card.id} type="button" className={`timeline-item priority-${card.priority} stage-${card.stage}`} style={position(card)} onClick={() => onSelect(card.id)}>
                    <span>{card.title}</span>
                    <small>{release?.name ?? STAGE_LABEL[card.stage]}</small>
                  </button>
                );
              })}
            </div>
          );
        })}
        {!areas.length && <div className="timeline-empty"><CalendarDays size={22} /><strong>No scheduled work yet.</strong><span>Add a start or target date to an item and it’ll appear here.</span></div>}
      </div>

      <section className="unscheduled-section">
        <div className="panel-heading"><div><span className="eyebrow">No dates</span><h3>Unscheduled</h3></div><span>{unscheduled.length}</span></div>
        <div className="unscheduled-grid">
          {unscheduled.slice(0, 12).map((card) => <RoadmapCardTile key={card.id} card={card} release={releaseFor(card, releases)} compact dependencyTitles={dependencyTitles(card, allCards)} onClick={() => onSelect(card.id)} />)}
          {!unscheduled.length && <div className="quiet-empty"><CheckCircle2 size={16} /> Every visible item has a date.</div>}
        </div>
      </section>
    </div>
  );
}

export function ReleasesView({
  cards,
  releases,
  onSelectCard,
  onEditRelease,
  onCreateRelease,
}: {
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  onSelectCard: (id: string) => void;
  onEditRelease: (id: string) => void;
  onCreateRelease: () => void;
}) {
  const statusWeight = { active: 0, planned: 1, released: 2 } as const;
  const ordered = [...releases].sort((a, b) => statusWeight[a.status] - statusWeight[b.status] || (a.targetDate || '9999').localeCompare(b.targetDate || '9999'));

  if (!releases.length) {
    return (
      <div className="release-empty-page">
        <div className="welcome-orb"><PackageCheck size={27} /></div>
        <span className="eyebrow">Version planning</span>
        <h2>Give the next chunk of Deme a name.</h2>
        <p>Releases group roadmap items into actual shipping goals, with one target date and a clear progress readout.</p>
        <button className="primary-button" type="button" onClick={onCreateRelease}><Plus size={17} /> Create a release</button>
      </div>
    );
  }

  return (
    <div className="releases-page">
      <div className="page-inline-actions"><p>Group work into versions without turning this into Jira.</p><button className="primary-button small" type="button" onClick={onCreateRelease}><Plus size={16} /> New release</button></div>
      <div className="release-grid">
        {ordered.map((release) => {
          const releaseCards = cards.filter((card) => card.releaseId === release.id && !card.archived);
          const shipped = releaseCards.filter((card) => card.stage === 'shipped').length;
          const percent = completionPercent(releaseCards);
          return (
            <article className={`release-card-v2 status-${release.status}`} key={release.id}>
              <button className="release-card-head" type="button" onClick={() => onEditRelease(release.id)}>
                <span className="release-status">{release.status}</span>
                <h3>{release.name}</h3>
                <p>{release.notes || 'No release goal written yet.'}</p>
                <div className="release-card-date">{release.targetDate ? <><CalendarDays size={14} /> {formatLongDate(release.targetDate)}</> : <><CalendarClock size={14} /> No target date</>}</div>
              </button>
              <div className="release-card-progress"><div><strong>{percent}%</strong><span>{shipped}/{releaseCards.length} shipped</span></div><div className="progress-track"><i style={{ width: `${percent}%` }} /></div></div>
              <div className="release-item-preview">
                {sortByOrder(releaseCards).slice(0, 5).map((card) => (
                  <button key={card.id} type="button" onClick={() => onSelectCard(card.id)}><span className={`stage-mini stage-${card.stage}`} /> <strong>{card.title}</strong><small>{STAGE_LABEL[card.stage]}</small></button>
                ))}
                {!releaseCards.length && <div className="quiet-empty">No items assigned yet.</div>}
                {releaseCards.length > 5 && <div className="more-items">+{releaseCards.length - 5} more</div>}
              </div>
              <button className="edit-release-button" type="button" onClick={() => onEditRelease(release.id)}>Edit release <ChevronRight size={15} /></button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

type ListSort = 'title' | 'stage' | 'area' | 'priority' | 'target' | 'updated';

export function ListView({ cards, releases, onSelect }: { cards: RoadmapCard[]; releases: RoadmapRelease[]; onSelect: (id: string) => void }) {
  const [sort, setSort] = useState<ListSort>('updated');
  const ordered = useMemo(() => [...cards].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'stage') return STAGES.findIndex((item) => item.id === a.stage) - STAGES.findIndex((item) => item.id === b.stage);
    if (sort === 'area') return a.area.localeCompare(b.area);
    if (sort === 'priority') return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (sort === 'target') return (a.targetDate || '9999').localeCompare(b.targetDate || '9999');
    return b.updatedAt.localeCompare(a.updatedAt);
  }), [cards, sort]);

  return (
    <div className="list-page">
      <div className="list-toolbar"><div><ListFilter size={16} /><span>{ordered.length} visible item{ordered.length === 1 ? '' : 's'}</span></div><label>Sort by <select value={sort} onChange={(event) => setSort(event.target.value as ListSort)}><option value="updated">Recently updated</option><option value="title">Title</option><option value="stage">Stage</option><option value="area">Area</option><option value="priority">Priority</option><option value="target">Target date</option></select></label></div>
      <div className="roadmap-table-wrap">
        <table className="roadmap-table">
          <thead><tr><th>Item</th><th>Stage</th><th>Area</th><th>Priority</th><th>Release</th><th>Target</th><th>Effort</th></tr></thead>
          <tbody>
            {ordered.map((card) => {
              const release = releaseFor(card, releases);
              return (
                <tr key={card.id} onClick={() => onSelect(card.id)}>
                  <td><div className="table-title"><span className={`priority-line ${card.priority}`} /><span><strong>{card.title}</strong><small>{card.description || card.labels.join(' · ') || 'No description'}</small></span>{card.pinned && <Pin size={13} />}{card.blockedBy.length > 0 && <LockKeyhole size={13} />}</div></td>
                  <td><span className={`stage-table stage-${card.stage}`}>{STAGE_LABEL[card.stage]}</span></td>
                  <td>{card.area}</td>
                  <td><span className={`priority-text ${card.priority}`}>{card.priority}</span></td>
                  <td>{release?.name ?? <span className="muted">—</span>}</td>
                  <td className={isOverdue(card) ? 'overdue-cell' : ''}>{card.targetDate ? formatShortDate(card.targetDate) : <span className="muted">—</span>}</td>
                  <td>{card.effort.toUpperCase()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!ordered.length && <div className="table-empty"><ListFilter size={20} /><strong>No items match this view.</strong></div>}
      </div>
    </div>
  );
}

export function ArchiveView({ cards, allCards, releases, onSelect, onRestore }: { cards: RoadmapCard[]; allCards: RoadmapCard[]; releases: RoadmapRelease[]; onSelect: (id: string) => void; onRestore: (id: string) => void }) {
  if (!cards.length) return <div className="archive-empty"><Sparkles size={24} /><h2>Archive is empty.</h2><p>Things you archive stay out of the way here until you need them again.</p></div>;
  return (
    <div className="archive-grid">
      {cards.map((card) => (
        <div className="archive-card" key={card.id}>
          <RoadmapCardTile card={card} release={releaseFor(card, releases)} compact dependencyTitles={dependencyTitles(card, allCards)} onClick={() => onSelect(card.id)} />
          <button type="button" onClick={() => onRestore(card.id)}><ArchiveRestore size={15} /> Restore</button>
        </div>
      ))}
    </div>
  );
}

export function SettingsView({
  settings,
  dataPath,
  onChange,
  onBackup,
  onRestore,
  onRevealData,
}: {
  settings: RoadmapSettings;
  dataPath: string;
  onChange: (patch: Partial<RoadmapSettings>) => void;
  onBackup: () => void;
  onRestore: () => void;
  onRevealData: () => void;
}) {
  const [newArea, setNewArea] = useState('');

  function addArea() {
    const value = newArea.trim();
    if (!value || settings.areas.some((area) => area.toLowerCase() === value.toLowerCase())) return;
    onChange({ areas: [...settings.areas, value] });
    setNewArea('');
  }

  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Behaviour</span><h3>Make it fit how you work</h3></div>
        <label className="settings-row"><span><strong>Start screen</strong><small>What opens first when Deme Roadmap launches.</small></span><select value={settings.startView} onChange={(event) => onChange({ startView: event.target.value as RoadmapSettings['startView'] })}><option value="focus">Focus</option><option value="board">Board</option><option value="timeline">Roadmap</option><option value="releases">Releases</option><option value="list">All items</option></select></label>
        <label className="settings-row"><span><strong>Compact board cards</strong><small>Fit more cards on screen with less description text.</small></span><input type="checkbox" checked={settings.compactCards} onChange={(event) => onChange({ compactCards: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Show Shipped on the board</strong><small>Hide the final column if you prefer a tighter active-work board.</small></span><input type="checkbox" checked={settings.showShippedOnBoard} onChange={(event) => onChange({ showShippedOnBoard: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Confirm permanent deletion</strong><small>Ask before an item is removed forever.</small></span><input type="checkbox" checked={settings.confirmPermanentDelete} onChange={(event) => onChange({ confirmPermanentDelete: event.target.checked })} /></label>
        <label className="settings-row"><span><strong>Due-soon window</strong><small>How many days Focus should treat as “due soon”.</small></span><div className="number-setting"><input type="number" min={1} max={30} value={settings.dueSoonDays} onChange={(event) => onChange({ dueSoonDays: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /><span>days</span></div></label>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Areas</span><h3>Deme product areas</h3><p>These power the Area dropdown and roadmap lanes. Add or remove them whenever Deme changes shape.</p></div>
        <div className="area-settings-list">
          {settings.areas.map((area) => <span key={area}>{area}<button type="button" disabled={settings.areas.length <= 1} onClick={() => onChange({ areas: settings.areas.filter((item) => item !== area) })}><Trash2 size={12} /></button></span>)}
        </div>
        <div className="inline-add settings-inline-add"><input value={newArea} onChange={(event) => setNewArea(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addArea())} placeholder="New area" /><button type="button" onClick={addArea}><Plus size={15} /> Add area</button></div>
      </section>

      <section className="settings-section">
        <div className="settings-heading"><span className="eyebrow">Local data</span><h3>Your roadmap stays on this PC</h3><p>No account, sync server or Deme production dependency. Backups are normal JSON files you control.</p></div>
        <div className="data-location"><div><strong>Roadmap file</strong><code>{dataPath || 'Loading local path…'}</code></div><button type="button" onClick={onRevealData}><FolderOpen size={15} /> Show in folder</button></div>
        <div className="settings-data-actions"><button type="button" onClick={onBackup}><Download size={16} /> Back up roadmap</button><button type="button" onClick={onRestore}><Upload size={16} /> Restore backup</button></div>
      </section>

      <section className="about-card"><div className="about-mark"><span>D</span><i /></div><div><span>Deme Roadmap</span><strong>Version 0.2.0</strong><small>Local-first Windows build · Deme App LTD</small></div></section>
    </div>
  );
}
