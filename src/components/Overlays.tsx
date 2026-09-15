import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Columns3,
  Download,
  FileStack,
  LayoutDashboard,
  List,
  Map,
  PackageCheck,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { PRIORITIES, STAGES, STAGE_LABEL } from '../constants';
import type { Priority, RoadmapCard, RoadmapRelease, Stage, ViewId } from '../types';
import { formatShortDate, matchesSearch, releaseFor } from '../utils';

export interface QuickCaptureValue {
  title: string;
  stage: Stage;
  area: string;
  priority: Priority;
  releaseId: string;
  targetDate: string;
}

export function QuickCapture({
  open,
  areas,
  releases,
  onClose,
  onCreate,
}: {
  open: boolean;
  areas: string[];
  releases: RoadmapRelease[];
  onClose: () => void;
  onCreate: (value: QuickCaptureValue) => void;
}) {
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<Stage>('ideas');
  const [area, setArea] = useState(areas[0] ?? 'Core');
  const [priority, setPriority] = useState<Priority>('normal');
  const [releaseId, setReleaseId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setArea(areas[0] ?? 'Core');
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open, areas]);

  if (!open) return null;

  function submit() {
    const clean = title.trim();
    if (!clean) return;
    onCreate({ title: clean, stage, area, priority, releaseId, targetDate });
    setTitle('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="quick-capture modal-card">
        <div className="modal-head">
          <div><span className="modal-kicker">Quick capture</span><h2>Get it out of your head.</h2></div>
          <button className="icon-button" type="button" onClick={onClose}><X size={19} /></button>
        </div>
        <input
          ref={inputRef}
          className="capture-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') onClose();
          }}
          placeholder="What does Deme need?"
        />
        <div className="capture-fields">
          <label><span>Stage</span><select value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>Area</span><select value={area} onChange={(event) => setArea(event.target.value)}>{areas.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>Release</span><select value={releaseId} onChange={(event) => setReleaseId(event.target.value)}><option value="">None</option>{releases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Target</span><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
        </div>
        <div className="capture-footer">
          <span>Enter to create</span>
          <button className="primary-button" type="button" onClick={submit}><Plus size={17} /> Create item</button>
        </div>
      </div>
    </div>
  );
}

export function ReleaseEditor({
  release,
  onClose,
  onChange,
  onDelete,
}: {
  release: RoadmapRelease | null;
  onClose: () => void;
  onChange: (patch: Partial<RoadmapRelease>) => void;
  onDelete: () => void;
}) {
  if (!release) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="release-editor modal-card">
        <div className="modal-head">
          <div><span className="modal-kicker">Release</span><h2>{release.name || 'Untitled release'}</h2></div>
          <button className="icon-button" type="button" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="release-form">
          <label className="field"><span>Name</span><input value={release.name} onChange={(event) => onChange({ name: event.target.value })} autoFocus /></label>
          <div className="field-grid two">
            <label className="field"><span>Status</span><select value={release.status} onChange={(event) => onChange({ status: event.target.value as RoadmapRelease['status'] })}><option value="planned">Planned</option><option value="active">Active</option><option value="released">Released</option></select></label>
            <label className="field"><span>Target date</span><input type="date" value={release.targetDate} onChange={(event) => onChange({ targetDate: event.target.value })} /></label>
          </div>
          <label className="field"><span>Release notes / goal</span><textarea rows={7} value={release.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="What is this release trying to achieve?" /></label>
        </div>
        <div className="modal-footer split">
          <button className="danger-button" type="button" onClick={onDelete}><Trash2 size={15} /> Delete release</button>
          <button className="primary-button" type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

const COMMAND_VIEWS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'focus', label: 'Go to Focus', icon: <LayoutDashboard size={17} /> },
  { id: 'board', label: 'Go to Board', icon: <Columns3 size={17} /> },
  { id: 'timeline', label: 'Go to Roadmap', icon: <Map size={17} /> },
  { id: 'releases', label: 'Go to Releases', icon: <PackageCheck size={17} /> },
  { id: 'list', label: 'Go to All items', icon: <List size={17} /> },
  { id: 'archive', label: 'Go to Archive', icon: <Archive size={17} /> },
  { id: 'settings', label: 'Go to Settings', icon: <Settings size={17} /> },
];

export function CommandPalette({
  open,
  cards,
  releases,
  onClose,
  onSelectCard,
  onNavigate,
  onNewItem,
  onNewRelease,
  onBackup,
}: {
  open: boolean;
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  onClose: () => void;
  onSelectCard: (id: string) => void;
  onNavigate: (view: ViewId) => void;
  onNewItem: () => void;
  onNewRelease: () => void;
  onBackup: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const matched = useMemo(
    () => cards.filter((card) => !card.archived && matchesSearch(card, releases, query)).slice(0, 8),
    [cards, releases, query],
  );
  const clean = query.trim().toLowerCase();
  const viewCommands = COMMAND_VIEWS.filter((item) => !clean || item.label.toLowerCase().includes(clean));

  if (!open) return null;

  return (
    <div className="modal-backdrop command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command-palette">
        <label className="command-search"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && onClose()} placeholder="Search items or type a command…" /><kbd>Esc</kbd></label>
        <div className="command-results">
          {!clean && (
            <section>
              <span className="command-section-title">Quick actions</span>
              <button type="button" onClick={() => (onNewItem(), onClose())}><Plus size={17} /><span><strong>New roadmap item</strong><small>Capture an idea quickly</small></span><kbd>Ctrl N</kbd></button>
              <button type="button" onClick={() => (onNewRelease(), onClose())}><Sparkles size={17} /><span><strong>New release</strong><small>Create a version milestone</small></span></button>
              <button type="button" onClick={() => (onBackup(), onClose())}><Download size={17} /><span><strong>Back up roadmap</strong><small>Save a local JSON copy</small></span></button>
            </section>
          )}
          {viewCommands.length > 0 && (
            <section>
              <span className="command-section-title">Navigate</span>
              {viewCommands.map((item) => <button type="button" key={item.id} onClick={() => (onNavigate(item.id), onClose())}>{item.icon}<span><strong>{item.label}</strong></span></button>)}
            </section>
          )}
          {matched.length > 0 && (
            <section>
              <span className="command-section-title">Roadmap items</span>
              {matched.map((card) => {
                const release = releaseFor(card, releases);
                return (
                  <button type="button" key={card.id} onClick={() => (onSelectCard(card.id), onClose())}>
                    <FileStack size={17} />
                    <span><strong>{card.title}</strong><small>{STAGE_LABEL[card.stage]} · {card.area}{release ? ` · ${release.name}` : ''}{card.targetDate ? ` · ${formatShortDate(card.targetDate)}` : ''}</small></span>
                  </button>
                );
              })}
            </section>
          )}
          {clean && !matched.length && !viewCommands.length && <div className="command-empty">Nothing matches “{query}”.</div>}
        </div>
      </div>
    </div>
  );
}
