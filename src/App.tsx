import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  CircleDot,
  ClipboardCheck,
  Columns3,
  DatabaseBackup,
  Download,
  GripVertical,
  Inbox,
  LayoutDashboard,
  ListChecks,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DEFAULT_ROADMAP } from './defaultData';
import type { ChecklistItem, Priority, RoadmapCard, RoadmapData, Stage } from './types';

type View = 'focus' | 'board' | 'releases' | 'archive';

const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: 'ideas', label: 'Ideas', hint: 'Worth remembering' },
  { id: 'planned', label: 'Planned', hint: 'Ready when you are' },
  { id: 'progress', label: 'In progress', hint: 'Being built now' },
  { id: 'testing', label: 'Testing', hint: 'Needs a proper poke' },
  { id: 'shipped', label: 'Shipped', hint: 'Out in the world' },
];

const STAGE_LABEL = Object.fromEntries(STAGES.map((stage) => [stage.id, stage.label])) as Record<Stage, string>;
const AREAS = ['Core', 'Home', 'Communities', 'Profiles', 'Chats', 'Journals', 'Safety', 'Premium', 'Performance', 'Polish'];

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

function makeCard(stage: Stage): RoadmapCard {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: 'Untitled idea',
    description: '',
    stage,
    area: 'Core',
    priority: 'normal',
    release: '',
    targetDate: '',
    checklist: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

function matchesSearch(card: RoadmapCard, search: string) {
  if (!search.trim()) return true;
  const haystack = [card.title, card.description, card.area, card.release, STAGE_LABEL[card.stage]].join(' ').toLowerCase();
  return haystack.includes(search.trim().toLowerCase());
}

function checklistProgress(card: RoadmapCard) {
  if (!card.checklist.length) return null;
  return `${card.checklist.filter((item) => item.done).length}/${card.checklist.length}`;
}

export default function App() {
  const [data, setData] = useState<RoadmapData>(DEFAULT_ROADMAP);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [view, setView] = useState<View>('focus');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const next = window.demeRoadmap ? await window.demeRoadmap.load(DEFAULT_ROADMAP) : DEFAULT_ROADMAP;
        if (active) setData(next);
      } catch {
        if (active) setData(DEFAULT_ROADMAP);
      } finally {
        if (active) setLoaded(true);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !window.demeRoadmap) return;
    setSaveState('saving');
    const timeout = window.setTimeout(async () => {
      try {
        await window.demeRoadmap?.save(data);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [data, loaded]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createCard(view === 'board' ? 'ideas' : 'planned');
      }
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = selectedId ? data.cards.find((card) => card.id === selectedId) ?? null : null;
  const activeCards = useMemo(() => data.cards.filter((card) => !card.archived && matchesSearch(card, search)), [data.cards, search]);
  const archivedCards = useMemo(() => data.cards.filter((card) => card.archived && matchesSearch(card, search)), [data.cards, search]);

  function createCard(stage: Stage) {
    const card = makeCard(stage);
    setData((current) => ({ ...current, cards: [...current.cards, card] }));
    setSelectedId(card.id);
  }

  function updateCard(id: string, patch: Partial<RoadmapCard>) {
    setData((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === id ? { ...card, ...patch, updatedAt: new Date().toISOString() } : card,
      ),
    }));
  }

  function archiveCard(id: string) {
    updateCard(id, { archived: true });
    setSelectedId(null);
    setToast('Moved to archive');
  }

  function restoreCard(id: string) {
    updateCard(id, { archived: false });
    setToast('Restored to the board');
  }

  function deleteCard(id: string) {
    setData((current) => ({ ...current, cards: current.cards.filter((card) => card.id !== id) }));
    setSelectedId(null);
    setToast('Deleted');
  }

  function moveCard(id: string, stage: Stage) {
    updateCard(id, { stage });
  }

  async function exportBackup() {
    if (!window.demeRoadmap) return;
    const result = await window.demeRoadmap.exportBackup(data);
    if (!result.canceled) setToast('Backup saved');
  }

  async function importBackup() {
    if (!window.demeRoadmap) return;
    try {
      const result = await window.demeRoadmap.importBackup();
      if (!result.canceled && result.data) {
        setData(result.data);
        setSelectedId(null);
        setToast('Backup restored');
      }
    } catch {
      setToast('That backup could not be opened');
    }
  }

  const totalOpen = data.cards.filter((card) => !card.archived && card.stage !== 'shipped').length;
  const inProgress = data.cards.filter((card) => !card.archived && card.stage === 'progress').length;
  const testing = data.cards.filter((card) => !card.archived && card.stage === 'testing').length;

  return (
    <div className="app-shell">
      <div className="window-drag-region" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <img src="./deme-logo-final-transparent.png" alt="" onError={(event) => event.currentTarget.classList.add('logo-missing')} />
            <span>D</span>
          </div>
          <div>
            <strong>Deme</strong>
            <small>Roadmap</small>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Roadmap views">
          <NavButton active={view === 'focus'} icon={<LayoutDashboard size={18} />} label="Focus" onClick={() => setView('focus')} />
          <NavButton active={view === 'board'} icon={<Columns3 size={18} />} label="Board" count={totalOpen} onClick={() => setView('board')} />
          <NavButton active={view === 'releases'} icon={<PackageCheck size={18} />} label="Releases" onClick={() => setView('releases')} />
          <NavButton active={view === 'archive'} icon={<Archive size={18} />} label="Archive" onClick={() => setView('archive')} />
        </nav>

        <div className="sidebar-spacer" />

        <div className="mini-stats">
          <div><span>Building</span><strong>{inProgress}</strong></div>
          <div><span>Testing</span><strong>{testing}</strong></div>
        </div>

        <div className="sidebar-tools">
          <button type="button" onClick={exportBackup}><Download size={16} /> Back up</button>
          <button type="button" onClick={importBackup}><Upload size={16} /> Restore</button>
        </div>
        <div className={`save-state ${saveState}`}>
          <span /> {saveState === 'saving' ? 'Saving locally…' : saveState === 'error' ? 'Couldn’t save' : 'Saved on this PC'}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">Deme product roadmap</p>
            <h1>{view === 'focus' ? 'What matters now' : view === 'board' ? 'Roadmap board' : view === 'releases' ? 'Releases' : 'Archive'}</h1>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roadmap" />
              <kbd>Ctrl K</kbd>
            </label>
            <button className="primary-button" type="button" onClick={() => createCard(view === 'board' ? 'ideas' : 'planned')}>
              <Plus size={18} /> Add item
            </button>
          </div>
        </header>

        <section className={`content ${view === 'board' ? 'board-content' : ''}`}>
          {!loaded ? (
            <LoadingState />
          ) : view === 'focus' ? (
            <FocusView cards={activeCards} onSelect={setSelectedId} onAdd={() => createCard('planned')} />
          ) : view === 'board' ? (
            <BoardView cards={activeCards} onSelect={setSelectedId} onMove={moveCard} onAdd={createCard} />
          ) : view === 'releases' ? (
            <ReleasesView cards={activeCards} onSelect={setSelectedId} />
          ) : (
            <ArchiveView cards={archivedCards} onSelect={setSelectedId} />
          )}
        </section>
      </main>

      {selected && (
        <CardEditor
          card={selected}
          onClose={() => setSelectedId(null)}
          onChange={(patch) => updateCard(selected.id, patch)}
          onArchive={() => archiveCard(selected.id)}
          onRestore={() => restoreCard(selected.id)}
          onDelete={() => deleteCard(selected.id)}
        />
      )}

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}<span>{label}</span>{typeof count === 'number' && count > 0 && <small>{count}</small>}
    </button>
  );
}

function LoadingState() {
  return <div className="loading-state"><div className="loading-orb" /><p>Opening your roadmap…</p></div>;
}

function FocusView({ cards, onSelect, onAdd }: { cards: RoadmapCard[]; onSelect: (id: string) => void; onAdd: () => void }) {
  const progress = cards.filter((card) => card.stage === 'progress');
  const testing = cards.filter((card) => card.stage === 'testing');
  const planned = cards.filter((card) => card.stage === 'planned').slice(0, 6);

  if (!cards.length) {
    return (
      <div className="empty-welcome">
        <div className="welcome-icon"><Sparkles size={26} /></div>
        <p className="eyebrow">Nothing noisy here</p>
        <h2>Your roadmap starts clean.</h2>
        <p>Add the first thing Deme needs. Give it a stage, optional release, and checklist. That’s it.</p>
        <button className="primary-button" type="button" onClick={onAdd}><Plus size={18} /> Add the first item</button>
        <div className="starter-flow">
          <span>Ideas</span><ArrowRight size={14} /><span>Planned</span><ArrowRight size={14} /><span>Building</span><ArrowRight size={14} /><span>Testing</span><ArrowRight size={14} /><span>Shipped</span>
        </div>
      </div>
    );
  }

  return (
    <div className="focus-layout">
      <div className="focus-hero">
        <div>
          <p className="eyebrow">Right now</p>
          <h2>{progress.length ? `${progress.length} thing${progress.length === 1 ? '' : 's'} actively being built` : 'Nothing is marked in progress'}</h2>
          <p>{testing.length ? `${testing.length} more ${testing.length === 1 ? 'item is' : 'items are'} waiting in testing.` : 'Move a card to In progress when work starts.'}</p>
        </div>
        <div className="focus-number">{progress.length}</div>
      </div>

      <FocusSection title="In progress" subtitle="Keep this list deliberately small" cards={progress} empty="Nothing currently being built." onSelect={onSelect} />
      <FocusSection title="Testing" subtitle="Ready for QA, poking and breaking" cards={testing} empty="Testing is clear." onSelect={onSelect} />
      <FocusSection title="Up next" subtitle="The nearest planned work" cards={planned} empty="Nothing planned yet." onSelect={onSelect} compact />
    </div>
  );
}

function FocusSection({ title, subtitle, cards, empty, onSelect, compact = false }: { title: string; subtitle: string; cards: RoadmapCard[]; empty: string; onSelect: (id: string) => void; compact?: boolean }) {
  return (
    <section className="focus-section">
      <div className="section-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><span>{cards.length}</span></div>
      {cards.length ? (
        <div className={compact ? 'focus-list compact' : 'focus-list'}>{cards.map((card) => <RoadmapCardTile key={card.id} card={card} onClick={() => onSelect(card.id)} />)}</div>
      ) : (
        <div className="quiet-empty"><CircleDot size={17} /> {empty}</div>
      )}
    </section>
  );
}

function BoardView({ cards, onSelect, onMove, onAdd }: { cards: RoadmapCard[]; onSelect: (id: string) => void; onMove: (id: string, stage: Stage) => void; onAdd: (stage: Stage) => void }) {
  return (
    <div className="board-scroller">
      <div className="board-grid">
        {STAGES.map((stage) => {
          const stageCards = cards.filter((card) => card.stage === stage.id);
          return (
            <section
              className="board-column"
              key={stage.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/deme-card');
                if (id) onMove(id, stage.id);
              }}
            >
              <div className="column-heading">
                <div><h3>{stage.label}</h3><p>{stage.hint}</p></div>
                <span>{stageCards.length}</span>
              </div>
              <div className="column-cards">
                {stageCards.map((card) => (
                  <RoadmapCardTile key={card.id} card={card} onClick={() => onSelect(card.id)} draggable />
                ))}
                {!stageCards.length && <div className="column-empty">Drop something here</div>}
              </div>
              <button className="column-add" type="button" onClick={() => onAdd(stage.id)}><Plus size={16} /> Add</button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ReleasesView({ cards, onSelect }: { cards: RoadmapCard[]; onSelect: (id: string) => void }) {
  const grouped = useMemo(() => {
    const groups = new Map<string, RoadmapCard[]>();
    cards.forEach((card) => {
      const release = card.release.trim();
      if (!release) return;
      groups.set(release, [...(groups.get(release) ?? []), card]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [cards]);
  const unassigned = cards.filter((card) => !card.release.trim() && card.stage !== 'shipped');

  return (
    <div className="release-layout">
      {!grouped.length && !unassigned.length ? (
        <div className="plain-empty"><PackageCheck size={24} /><h2>No releases yet</h2><p>Add a release name such as “1.5” to any roadmap item and it will gather here automatically.</p></div>
      ) : (
        <>
          {grouped.map(([name, releaseCards]) => {
            const shipped = releaseCards.filter((card) => card.stage === 'shipped').length;
            return (
              <section className="release-group" key={name}>
                <div className="release-heading">
                  <div><span className="release-pill">Release</span><h2>{name}</h2></div>
                  <p>{shipped}/{releaseCards.length} shipped</p>
                </div>
                <div className="release-progress"><span style={{ width: `${releaseCards.length ? (shipped / releaseCards.length) * 100 : 0}%` }} /></div>
                <div className="release-items">{releaseCards.map((card) => <ReleaseRow key={card.id} card={card} onClick={() => onSelect(card.id)} />)}</div>
              </section>
            );
          })}
          {unassigned.length > 0 && (
            <section className="release-group muted-group">
              <div className="release-heading"><div><span className="release-pill">Loose ends</span><h2>Not assigned to a release</h2></div><p>{unassigned.length} items</p></div>
              <div className="release-items">{unassigned.map((card) => <ReleaseRow key={card.id} card={card} onClick={() => onSelect(card.id)} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ReleaseRow({ card, onClick }: { card: RoadmapCard; onClick: () => void }) {
  return (
    <button className="release-row" type="button" onClick={onClick}>
      <span className={`stage-dot stage-${card.stage}`} />
      <div><strong>{card.title}</strong><small>{card.area} · {STAGE_LABEL[card.stage]}</small></div>
      {card.targetDate && <time><CalendarDays size={14} /> {formatDate(card.targetDate)}</time>}
      <ArrowRight size={16} />
    </button>
  );
}

function ArchiveView({ cards, onSelect }: { cards: RoadmapCard[]; onSelect: (id: string) => void }) {
  if (!cards.length) return <div className="plain-empty"><Archive size={24} /><h2>Archive is empty</h2><p>Old ideas can live here without cluttering the roadmap.</p></div>;
  return <div className="archive-grid">{cards.map((card) => <RoadmapCardTile key={card.id} card={card} onClick={() => onSelect(card.id)} />)}</div>;
}

function RoadmapCardTile({ card, onClick, draggable = false }: { card: RoadmapCard; onClick: () => void; draggable?: boolean }) {
  const progress = checklistProgress(card);
  return (
    <div
      className={`roadmap-card priority-${card.priority}`}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/deme-card', card.id);
      }}
      onClick={onClick}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onClick(); }}
    >
      <div className="card-drag-row">
        <span className="area-pill">{card.area}</span>
        {draggable && <GripVertical className="drag-handle" size={15} />}
      </div>
      <h4>{card.title}</h4>
      {card.description && <p>{card.description}</p>}
      <div className="card-meta">
        {card.priority === 'high' && <span className="priority-label">High</span>}
        {card.release && <span>{card.release}</span>}
        {card.targetDate && <span><CalendarDays size={13} /> {formatDate(card.targetDate)}</span>}
        {progress && <span><ListChecks size={13} /> {progress}</span>}
      </div>
    </div>
  );
}

function CardEditor({ card, onClose, onChange, onArchive, onRestore, onDelete }: { card: RoadmapCard; onClose: () => void; onChange: (patch: Partial<RoadmapCard>) => void; onArchive: () => void; onRestore: () => void; onDelete: () => void }) {
  const [newChecklist, setNewChecklist] = useState('');

  function addChecklistItem() {
    const text = newChecklist.trim();
    if (!text) return;
    const item: ChecklistItem = { id: uid(), text, done: false };
    onChange({ checklist: [...card.checklist, item] });
    setNewChecklist('');
  }

  return (
    <div className="drawer-scrim" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <aside className="card-drawer" aria-label="Edit roadmap item">
        <div className="drawer-top">
          <div><span className={`stage-dot stage-${card.stage}`} /> {card.archived ? 'Archived item' : STAGE_LABEL[card.stage]}</div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>

        <div className="drawer-scroll">
          <input className="title-input" value={card.title} onChange={(event) => onChange({ title: event.target.value })} aria-label="Title" />
          <textarea className="description-input" value={card.description} onChange={(event) => onChange({ description: event.target.value })} placeholder="Add a short description…" rows={4} />

          <div className="editor-grid">
            <EditorField label="Stage">
              <select value={card.stage} onChange={(event) => onChange({ stage: event.target.value as Stage })}>
                {STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
              </select>
            </EditorField>
            <EditorField label="Area">
              <input list="deme-areas" value={card.area} onChange={(event) => onChange({ area: event.target.value })} />
              <datalist id="deme-areas">{AREAS.map((area) => <option value={area} key={area} />)}</datalist>
            </EditorField>
            <EditorField label="Priority">
              <select value={card.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
              </select>
            </EditorField>
            <EditorField label="Target date">
              <input type="date" value={card.targetDate} min="2020-01-01" onChange={(event) => onChange({ targetDate: event.target.value })} />
            </EditorField>
          </div>

          <EditorField label="Release">
            <input value={card.release} onChange={(event) => onChange({ release: event.target.value })} placeholder="e.g. 1.5" />
          </EditorField>

          <div className="checklist-block">
            <div className="checklist-heading"><div><ClipboardCheck size={18} /><strong>Checklist</strong></div>{card.checklist.length > 0 && <span>{card.checklist.filter((item) => item.done).length}/{card.checklist.length}</span>}</div>
            <div className="checklist-items">
              {card.checklist.map((item) => (
                <div className={`check-item ${item.done ? 'done' : ''}`} key={item.id}>
                  <button type="button" className="check-toggle" onClick={() => onChange({ checklist: card.checklist.map((current) => current.id === item.id ? { ...current, done: !current.done } : current) })}>
                    {item.done && <Check size={13} />}
                  </button>
                  <input value={item.text} onChange={(event) => onChange({ checklist: card.checklist.map((current) => current.id === item.id ? { ...current, text: event.target.value } : current) })} />
                  <button className="remove-check" type="button" onClick={() => onChange({ checklist: card.checklist.filter((current) => current.id !== item.id) })}><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="new-check-item">
              <Plus size={16} />
              <input value={newChecklist} onChange={(event) => setNewChecklist(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addChecklistItem(); }} placeholder="Add checklist item" />
              {newChecklist.trim() && <button type="button" onClick={addChecklistItem}>Add</button>}
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          {card.archived ? (
            <>
              <button className="secondary-button" type="button" onClick={onRestore}><RotateCcw size={16} /> Restore</button>
              <button className="danger-button" type="button" onClick={onDelete}><Trash2 size={16} /> Delete forever</button>
            </>
          ) : (
            <button className="secondary-button" type="button" onClick={onArchive}><Archive size={16} /> Move to archive</button>
          )}
        </div>
      </aside>
    </div>
  );
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="editor-field"><span>{label}</span>{children}</label>;
}
