import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  Columns3,
  Command,
  Inbox,
  LayoutDashboard,
  List,
  Map as MapIcon,
  PackageCheck,
  Plus,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { CardEditor } from './components/CardEditor';
import { FilterBar } from './components/FilterBar';
import { IdeaInboxView } from './components/IdeaInbox';
import { CommandPalette, QuickCapture, ReleaseEditor, type QuickCaptureValue } from './components/Overlays';
import { ArchiveView, BoardView, FocusView, ListView, ReleasesView, SettingsView, TimelineView } from './components/Views';
import { STAGE_LABEL, VIEW_TITLES } from './constants';
import { DEFAULT_ROADMAP, newCard, newInboxNote, newRelease, normaliseRoadmap, uid } from './data';
import type { ActivityEntry, RoadmapCard, RoadmapData, RoadmapRelease, Stage, ViewId } from './types';
import { EMPTY_FILTERS, type RoadmapFilters } from './uiTypes';
import { isDueSoon, isOverdue, matchesSearch, sortByOrder } from './utils';

function activity(type: ActivityEntry['type'], message: string, cardId?: string): ActivityEntry {
  return { id: uid('activity'), type, message, cardId, createdAt: new Date().toISOString() };
}

function appendActivity(entries: ActivityEntry[], entry: ActivityEntry) {
  return [...entries.slice(-249), entry];
}

function maxOrder(cards: RoadmapCard[], stage: Stage) {
  return Math.max(0, ...cards.filter((card) => !card.archived && card.stage === stage).map((card) => card.sortOrder)) + 1000;
}

function applyFilters(card: RoadmapCard, filters: RoadmapFilters, data: RoadmapData, search: string) {
  if (!matchesSearch(card, data.releases, search)) return false;
  if (filters.area !== 'all' && card.area !== filters.area) return false;
  if (filters.priority !== 'all' && card.priority !== filters.priority) return false;
  if (filters.releaseId === 'none' && card.releaseId) return false;
  if (filters.releaseId !== 'all' && filters.releaseId !== 'none' && card.releaseId !== filters.releaseId) return false;
  if (filters.due === 'overdue' && !isOverdue(card)) return false;
  if (filters.due === 'soon' && !isDueSoon(card, data.settings.dueSoonDays)) return false;
  if (filters.due === 'unscheduled' && card.targetDate) return false;
  if (filters.label && !card.labels.includes(filters.label)) return false;
  return true;
}

export default function App() {
  const [data, setData] = useState<RoadmapData>(DEFAULT_ROADMAP);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [view, setView] = useState<ViewId>('focus');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [releaseEditorId, setReleaseEditorId] = useState<string | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RoadmapFilters>(EMPTY_FILTERS);
  const [toast, setToast] = useState('');
  const [dataPath, setDataPath] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const raw = window.demeRoadmap ? await window.demeRoadmap.load(DEFAULT_ROADMAP) : DEFAULT_ROADMAP;
        const next = normaliseRoadmap(raw);
        if (!active) return;
        setData(next);
        setView(next.settings.startView);
        if (window.demeRoadmap) window.demeRoadmap.dataPath().then((path) => active && setDataPath(path)).catch(() => undefined);
      } catch {
        if (active) setData(DEFAULT_ROADMAP);
      } finally {
        if (active) setLoaded(true);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded || !window.demeRoadmap) return;
    setSaveState('saving');
    const timer = window.setTimeout(async () => {
      try {
        await window.demeRoadmap?.save(data);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [data, loaded]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setQuickCaptureOpen(true);
      }
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && !commandOpen && !quickCaptureOpen) {
        setSelectedId(null);
        setReleaseEditorId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandOpen, quickCaptureOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = selectedId ? data.cards.find((card) => card.id === selectedId) ?? null : null;
  const editedRelease = releaseEditorId ? data.releases.find((release) => release.id === releaseEditorId) ?? null : null;
  const activeCards = useMemo(() => data.cards.filter((card) => !card.archived), [data.cards]);
  const visibleCards = useMemo(
    () => activeCards.filter((card) => applyFilters(card, filters, data, search)),
    [activeCards, filters, data, search],
  );
  const archivedCards = useMemo(
    () => data.cards.filter((card) => card.archived && matchesSearch(card, data.releases, search)),
    [data.cards, data.releases, search],
  );
  const labels = useMemo(() => Array.from(new Set(activeCards.flatMap((card) => card.labels))).sort(), [activeCards]);
  const totalOpen = activeCards.filter((card) => card.stage !== 'shipped').length;
  const activeRelease = data.releases.find((release) => release.status === 'active') ?? null;
  const title = VIEW_TITLES[view];
  const showFilters = view === 'board' || view === 'timeline' || view === 'list';

  function createItem(stage: Stage, openEditor = true, patch: Partial<RoadmapCard> = {}) {
    const card = { ...newCard(stage, data.settings.areas[0] ?? 'Core', maxOrder(data.cards, stage)), ...patch };
    setData((current) => ({
      ...current,
      cards: [...current.cards, card],
      activity: appendActivity(current.activity, activity('created', `Created “${card.title}”`, card.id)),
    }));
    if (openEditor) setSelectedId(card.id);
    return card.id;
  }

  function createQuick(value: QuickCaptureValue) {
    const id = createItem(value.stage, false, {
      title: value.title,
      area: value.area,
      priority: value.priority,
      releaseId: value.releaseId,
      targetDate: value.targetDate,
    });
    setQuickCaptureOpen(false);
    setToast('Added to roadmap ♡');
    if (value.stage === 'progress' || value.stage === 'testing') setSelectedId(id);
  }

  function addInboxThought(text: string) {
    const note = newInboxNote(text);
    setData((current) => ({
      ...current,
      inbox: [...current.inbox, note],
      activity: appendActivity(current.activity, activity('inbox', 'Saved a thought to the Idea Inbox')),
    }));
    setToast('Thought tucked away ✦');
  }

  function deleteInboxThought(id: string) {
    setData((current) => ({ ...current, inbox: current.inbox.filter((note) => note.id !== id) }));
    setToast('Thought removed');
  }

  function promoteInboxThought(id: string) {
    setData((current) => {
      const note = current.inbox.find((item) => item.id === id);
      if (!note) return current;
      const text = note.text.trim();
      const title = text.length > 88 ? `${text.slice(0, 85).trim()}…` : text;
      const card = {
        ...newCard('ideas', current.settings.areas[0] ?? 'Core', maxOrder(current.cards, 'ideas')),
        title,
        description: text.length > 88 ? text : '',
      };
      window.setTimeout(() => setSelectedId(card.id), 0);
      return {
        ...current,
        inbox: current.inbox.filter((item) => item.id !== id),
        cards: [...current.cards, card],
        activity: appendActivity(current.activity, activity('created', `Promoted “${title}” from the Idea Inbox`, card.id)),
      };
    });
    setToast('Now it is a roadmap item ✨');
  }

  function updateCard(id: string, patch: Partial<RoadmapCard>) {
    setData((current) => {
      const before = current.cards.find((card) => card.id === id);
      if (!before) return current;
      const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
      let nextActivity = current.activity;
      if (patch.stage && patch.stage !== before.stage) {
        nextActivity = appendActivity(nextActivity, activity('moved', `Moved “${before.title}” to ${STAGE_LABEL[patch.stage]}`, id));
      }
      return {
        ...current,
        cards: current.cards.map((card) => card.id === id ? { ...card, ...nextPatch } : card),
        activity: nextActivity,
      };
    });
  }

  function moveCard(id: string, stage: Stage) {
    setData((current) => {
      const card = current.cards.find((item) => item.id === id);
      if (!card || (card.stage === stage && card.sortOrder === maxOrder(current.cards, stage))) return current;
      const order = maxOrder(current.cards.filter((item) => item.id !== id), stage);
      const moved = { ...card, stage, sortOrder: order, updatedAt: new Date().toISOString() };
      return {
        ...current,
        cards: current.cards.map((item) => item.id === id ? moved : item),
        activity: card.stage === stage ? current.activity : appendActivity(current.activity, activity('moved', `Moved “${card.title}” to ${STAGE_LABEL[stage]}`, id)),
      };
    });
  }

  function reorderCard(sourceId: string, targetId: string) {
    setData((current) => {
      const source = current.cards.find((card) => card.id === sourceId);
      const target = current.cards.find((card) => card.id === targetId);
      if (!source || !target || source.id === target.id) return current;
      const stageCards = sortByOrder(current.cards.filter((card) => !card.archived && card.stage === target.stage && card.id !== source.id));
      const targetIndex = Math.max(0, stageCards.findIndex((card) => card.id === target.id));
      stageCards.splice(targetIndex, 0, { ...source, stage: target.stage });
      const orderMap = new Map(stageCards.map((card, index) => [card.id, (index + 1) * 1000]));
      const stageChanged = source.stage !== target.stage;
      return {
        ...current,
        cards: current.cards.map((card) => orderMap.has(card.id) ? { ...card, stage: target.stage, sortOrder: orderMap.get(card.id)!, updatedAt: card.id === source.id ? new Date().toISOString() : card.updatedAt } : card),
        activity: stageChanged ? appendActivity(current.activity, activity('moved', `Moved “${source.title}” to ${STAGE_LABEL[target.stage]}`, source.id)) : current.activity,
      };
    });
  }

  function archiveCard(id: string) {
    setData((current) => {
      const card = current.cards.find((item) => item.id === id);
      if (!card) return current;
      return {
        ...current,
        cards: current.cards.map((item) => item.id === id ? { ...item, archived: true, updatedAt: new Date().toISOString() } : item),
        activity: appendActivity(current.activity, activity('archived', `Archived “${card.title}”`, id)),
      };
    });
    setSelectedId(null);
    setToast('Moved to archive');
  }

  function restoreCard(id: string) {
    setData((current) => {
      const card = current.cards.find((item) => item.id === id);
      if (!card) return current;
      return {
        ...current,
        cards: current.cards.map((item) => item.id === id ? { ...item, archived: false, updatedAt: new Date().toISOString() } : item),
        activity: appendActivity(current.activity, activity('restored', `Restored “${card.title}”`, id)),
      };
    });
    setToast('Restored');
  }

  function deleteCard(id: string) {
    const card = data.cards.find((item) => item.id === id);
    if (!card) return;
    if (data.settings.confirmPermanentDelete && !window.confirm(`Delete “${card.title}” permanently? This cannot be undone.`)) return;
    setData((current) => ({
      ...current,
      cards: current.cards
        .filter((item) => item.id !== id)
        .map((item) => item.blockedBy.includes(id) ? { ...item, blockedBy: item.blockedBy.filter((dependency) => dependency !== id) } : item),
    }));
    setSelectedId(null);
    setToast('Deleted permanently');
  }

  function duplicateCard(id: string) {
    const source = data.cards.find((card) => card.id === id);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: RoadmapCard = {
      ...source,
      id: uid('card'),
      title: `${source.title} copy`,
      blockedBy: [...source.blockedBy],
      labels: [...source.labels],
      checklist: source.checklist.map((item) => ({ ...item, id: uid('check') })),
      links: source.links.map((link) => ({ ...link, id: uid('link') })),
      updates: [],
      archived: false,
      pinned: false,
      sortOrder: maxOrder(data.cards, source.stage),
      createdAt: now,
      updatedAt: now,
    };
    setData((current) => ({ ...current, cards: [...current.cards, copy], activity: appendActivity(current.activity, activity('created', `Duplicated “${source.title}”`, copy.id)) }));
    setSelectedId(copy.id);
  }

  function createRelease() {
    const release = newRelease(`Version ${data.releases.length + 1}`);
    setData((current) => ({ ...current, releases: [...current.releases, release], activity: appendActivity(current.activity, activity('release', `Created release “${release.name}”`)) }));
    setReleaseEditorId(release.id);
  }

  function updateRelease(id: string, patch: Partial<RoadmapRelease>) {
    setData((current) => {
      const before = current.releases.find((release) => release.id === id);
      if (!before) return current;
      let releases = current.releases.map((release) => release.id === id ? { ...release, ...patch, updatedAt: new Date().toISOString() } : release);
      if (patch.status === 'active') releases = releases.map((release) => release.id !== id && release.status === 'active' ? { ...release, status: 'planned', updatedAt: new Date().toISOString() } : release);
      const nextName = typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : before.name;
      const nextActivity = patch.status && patch.status !== before.status
        ? appendActivity(current.activity, activity('release', `${nextName} is now ${patch.status}`))
        : current.activity;
      return { ...current, releases, activity: nextActivity };
    });
  }

  function deleteRelease(id: string) {
    const release = data.releases.find((item) => item.id === id);
    if (!release) return;
    if (!window.confirm(`Delete release “${release.name}”? Items in it will stay on the roadmap but become unassigned.`)) return;
    setData((current) => ({
      ...current,
      releases: current.releases.filter((item) => item.id !== id),
      cards: current.cards.map((card) => card.releaseId === id ? { ...card, releaseId: '', updatedAt: new Date().toISOString() } : card),
      activity: appendActivity(current.activity, activity('release', `Deleted release “${release.name}”`)),
    }));
    setReleaseEditorId(null);
    setToast('Release deleted');
  }

  function changeSettings(patch: Partial<RoadmapData['settings']>) {
    setData((current) => {
      const settings = { ...current.settings, ...patch };
      let cards = current.cards;
      if (patch.areas && patch.areas.length) {
        const fallback = patch.areas[0];
        cards = cards.map((card) => patch.areas!.includes(card.area) ? card : { ...card, area: fallback, updatedAt: new Date().toISOString() });
      }
      return { ...current, settings, cards };
    });
  }

  async function exportBackup() {
    if (!window.demeRoadmap) return;
    try {
      const result = await window.demeRoadmap.exportBackup(data);
      if (!result.canceled) setToast('Backup saved');
    } catch {
      setToast('Could not save backup');
    }
  }

  async function importBackup() {
    if (!window.demeRoadmap) return;
    try {
      const result = await window.demeRoadmap.importBackup();
      if (!result.canceled && result.data) {
        const next = normaliseRoadmap(result.data);
        setData(next);
        setView(next.settings.startView);
        setSelectedId(null);
        setReleaseEditorId(null);
        setToast('Backup restored');
      }
    } catch {
      setToast('That backup could not be opened');
    }
  }

  async function revealData() {
    try {
      await window.demeRoadmap?.revealData();
    } catch {
      setToast('Could not open the data folder');
    }
  }

  function navigate(next: ViewId) {
    setView(next);
    setSelectedId(null);
    setReleaseEditorId(null);
  }

  return (
    <div className="app-shell v2-shell v3-shell">
      <div className="window-drag-region" />
      <aside className="sidebar v2-sidebar v3-sidebar">
        <DemeBrand />
        <div className="sidebar-cloud cloud-a" />
        <div className="sidebar-star star-a">✦</div>
        <div className="sidebar-star star-b">♡</div>

        <nav className="nav-stack" aria-label="Roadmap views">
          <NavButton active={view === 'focus'} icon={<LayoutDashboard size={18} />} label="Focus" onClick={() => navigate('focus')} />
          <NavButton active={view === 'inbox'} icon={<Inbox size={18} />} label="Idea inbox" count={data.inbox.length} onClick={() => navigate('inbox')} />
          <NavButton active={view === 'board'} icon={<Columns3 size={18} />} label="Board" count={totalOpen} onClick={() => navigate('board')} />
          <NavButton active={view === 'timeline'} icon={<MapIcon size={18} />} label="Roadmap" onClick={() => navigate('timeline')} />
          <NavButton active={view === 'releases'} icon={<PackageCheck size={18} />} label="Releases" count={data.releases.filter((release) => release.status !== 'released').length} onClick={() => navigate('releases')} />
          <NavButton active={view === 'list'} icon={<List size={18} />} label="All items" onClick={() => navigate('list')} />
          <NavButton active={view === 'archive'} icon={<Archive size={18} />} label="Archive" count={data.cards.filter((card) => card.archived).length} onClick={() => navigate('archive')} />
        </nav>

        <div className="sidebar-spacer" />

        {activeRelease && (
          <button className="sidebar-release" type="button" onClick={() => navigate('releases')}>
            <span className="live-dot" />
            <span><small>Growing now</small><strong>{activeRelease.name}</strong></span>
          </button>
        )}

        <button className={`nav-button settings-nav ${view === 'settings' ? 'active' : ''}`} type="button" onClick={() => navigate('settings')}><Settings size={18} /><span>Settings</span></button>
        <div className={`save-state ${saveState}`}><span /> {saveState === 'saving' ? 'Saving locally…' : saveState === 'error' ? 'Couldn’t save' : 'Safe on this PC'}</div>
        <div className="version-mark">v0.3 ♡</div>
      </aside>

      <main className="main-area v2-main v3-main">
        <header className="topbar v2-topbar v3-topbar">
          <div className="header-cloud header-cloud-left" />
          <div className="header-cloud header-cloud-right" />
          <span className="header-sparkle hs-one">✦</span>
          <span className="header-sparkle hs-two">✧</span>
          <div className="topbar-title"><p className="eyebrow">{title.eyebrow}</p><h1>{title.title}</h1></div>
          <div className="topbar-actions">
            <label className="search-box v2-search"><Search size={17} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find something…" /><kbd>Ctrl F</kbd></label>
            <button className="command-button" type="button" onClick={() => setCommandOpen(true)} title="Command palette"><Command size={17} /><kbd>Ctrl K</kbd></button>
            <button className="primary-button cute-primary" type="button" onClick={() => setQuickCaptureOpen(true)}><Plus size={18} /> Add item</button>
          </div>
        </header>

        {showFilters && (
          <FilterBar
            filters={filters}
            areas={data.settings.areas}
            releases={data.releases}
            labels={labels}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
        )}

        <section className={`content v2-content v3-content view-${view}`}>
          {!loaded ? (
            <LoadingState />
          ) : view === 'focus' ? (
            <FocusView cards={visibleCards} allCards={data.cards} releases={data.releases} activity={data.activity} dueSoonDays={data.settings.dueSoonDays} onSelect={setSelectedId} onAdd={() => setQuickCaptureOpen(true)} onNavigate={navigate} />
          ) : view === 'inbox' ? (
            <IdeaInboxView notes={data.inbox} onAdd={addInboxThought} onPromote={promoteInboxThought} onDelete={deleteInboxThought} />
          ) : view === 'board' ? (
            <BoardView cards={visibleCards} allCards={data.cards} releases={data.releases} compact={data.settings.compactCards} showShipped={data.settings.showShippedOnBoard} onSelect={setSelectedId} onMove={moveCard} onReorder={reorderCard} onAdd={(stage) => createItem(stage)} />
          ) : view === 'timeline' ? (
            <TimelineView cards={visibleCards} allCards={data.cards} releases={data.releases} onSelect={setSelectedId} />
          ) : view === 'releases' ? (
            <ReleasesView cards={activeCards.filter((card) => matchesSearch(card, data.releases, search))} releases={data.releases} onSelectCard={setSelectedId} onEditRelease={setReleaseEditorId} onCreateRelease={createRelease} />
          ) : view === 'list' ? (
            <ListView cards={visibleCards} releases={data.releases} onSelect={setSelectedId} />
          ) : view === 'archive' ? (
            <ArchiveView cards={archivedCards} allCards={data.cards} releases={data.releases} onSelect={setSelectedId} onRestore={restoreCard} />
          ) : (
            <SettingsView settings={data.settings} dataPath={dataPath} onChange={changeSettings} onBackup={exportBackup} onRestore={importBackup} onRevealData={revealData} />
          )}
        </section>
      </main>

      {selected && (
        <CardEditor
          card={selected}
          cards={data.cards}
          releases={data.releases}
          areas={data.settings.areas}
          onClose={() => setSelectedId(null)}
          onChange={(patch) => updateCard(selected.id, patch)}
          onArchive={() => archiveCard(selected.id)}
          onRestore={() => restoreCard(selected.id)}
          onDelete={() => deleteCard(selected.id)}
          onDuplicate={() => duplicateCard(selected.id)}
        />
      )}

      <QuickCapture open={quickCaptureOpen} areas={data.settings.areas} releases={data.releases} onClose={() => setQuickCaptureOpen(false)} onCreate={createQuick} />
      <ReleaseEditor release={editedRelease} onClose={() => setReleaseEditorId(null)} onChange={(patch) => editedRelease && updateRelease(editedRelease.id, patch)} onDelete={() => editedRelease && deleteRelease(editedRelease.id)} />
      <CommandPalette open={commandOpen} cards={data.cards} releases={data.releases} onClose={() => setCommandOpen(false)} onSelectCard={setSelectedId} onNavigate={navigate} onNewItem={() => setQuickCaptureOpen(true)} onNewRelease={createRelease} onBackup={exportBackup} />

      {toast && <div className="toast v2-toast v3-toast"><span className="toast-dot" /> {toast}</div>}
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} type="button" onClick={onClick}>{icon}<span>{label}</span>{typeof count === 'number' && count > 0 && <small>{count}</small>}</button>;
}

function DemeBrand() {
  return (
    <div className="deme-brand-v2 deme-brand-v3">
      <div className="deme-d-mark"><span>D</span><i /></div>
      <div className="deme-brand-copy"><strong>Deme</strong><small>roadmap diary ✦</small></div>
      <Sparkles className="brand-sparkle" size={18} />
    </div>
  );
}

function LoadingState() {
  return <div className="loading-state v2-loading v3-loading"><div className="loading-orb" /><p>Gathering all the little ideas…</p></div>;
}
