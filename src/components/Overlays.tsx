import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bug,
  Columns3,
  Command,
  Download,
  FileStack,
  Gauge,
  Inbox,
  LayoutDashboard,
  List,
  Map,
  Paintbrush2,
  Plus,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { BUG_SEVERITIES, PRIORITIES, STAGES, STAGE_LABEL, WORK_KINDS } from '../constants';
import type { BugSeverity, Priority, RoadmapCard, RoadmapRelease, Stage, ViewId, WorkKind } from '../types';
import { formatShortDate, matchesSearch, releaseFor } from '../utils';

export interface QuickCaptureValue {
  title: string;
  stage: Stage;
  area: string;
  priority: Priority;
  kind: WorkKind;
  bugSeverity: BugSeverity;
  releaseId: string;
  targetDate: string;
  today: boolean;
}

const TEMPLATES: { id: WorkKind; label: string; icon: React.ReactNode; stage: Stage; priority: Priority }[] = [
  { id: 'feature', label: 'Feature', icon: <Sparkles size={15} />, stage: 'planned', priority: 'normal' },
  { id: 'bug', label: 'Bug', icon: <Bug size={15} />, stage: 'ideas', priority: 'high' },
  { id: 'polish', label: 'Polish', icon: <Paintbrush2 size={15} />, stage: 'planned', priority: 'normal' },
  { id: 'performance', label: 'Performance', icon: <Gauge size={15} />, stage: 'planned', priority: 'high' },
  { id: 'chore', label: 'Chore', icon: <Wrench size={15} />, stage: 'planned', priority: 'normal' },
];

export function QuickCapture({ open, areas, releases, defaultReleaseId = '', onClose, onCreate }: {
  open: boolean;
  areas: string[];
  releases: RoadmapRelease[];
  defaultReleaseId?: string;
  onClose: () => void;
  onCreate: (value: QuickCaptureValue) => void;
}) {
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<Stage>('planned');
  const [area, setArea] = useState(areas[0] ?? 'Core');
  const [priority, setPriority] = useState<Priority>('normal');
  const [kind, setKind] = useState<WorkKind>('feature');
  const [bugSeverity, setBugSeverity] = useState<BugSeverity>('medium');
  const [releaseId, setReleaseId] = useState(defaultReleaseId);
  const [targetDate, setTargetDate] = useState('');
  const [today, setToday] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(''); setArea(areas[0] ?? 'Core'); setReleaseId(defaultReleaseId); setToday(false);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open, areas, defaultReleaseId]);

  if (!open) return null;

  function useTemplate(template: (typeof TEMPLATES)[number]) {
    setKind(template.id); setStage(template.stage); setPriority(template.priority);
    if (template.id === 'bug') setBugSeverity('medium');
  }
  function submit() {
    const clean = title.trim();
    if (!clean) return;
    onCreate({ title: clean, stage, area, priority, kind, bugSeverity, releaseId, targetDate, today });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="quick-capture modal-card quick-capture-v4">
        <div className="modal-head"><div><span className="modal-kicker">Quick add</span><h2>What are we making?</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="capture-templates">{TEMPLATES.map((template) => <button key={template.id} type="button" className={kind === template.id ? 'active' : ''} onClick={() => useTemplate(template)}>{template.icon}{template.label}</button>)}</div>
        <input ref={inputRef} className="capture-title" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') onClose(); }} placeholder={kind === 'bug' ? 'What is broken?' : 'What does Deme need?'} />
        <div className="capture-fields">
          <label><span>Lane</span><select value={stage} onChange={(event) => setStage(event.target.value as Stage)}>{STAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>Area</span><select value={area} onChange={(event) => setArea(event.target.value)}>{areas.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {kind === 'bug' && <label><span>Severity</span><select value={bugSeverity} onChange={(event) => setBugSeverity(event.target.value as BugSeverity)}>{BUG_SEVERITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
          <label><span>Release</span><select value={releaseId} onChange={(event) => setReleaseId(event.target.value)}><option value="">Unassigned</option>{releases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Target</span><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label>
        </div>
        <label className="capture-today"><input type="checkbox" checked={today} onChange={(event) => setToday(event.target.checked)} /><span>Put this in Today ♡</span></label>
        <div className="capture-footer"><span>Enter to create</span><button className="primary-button" type="button" onClick={submit}><Plus size={17} /> Create {WORK_KINDS.find((item) => item.id === kind)?.label.toLowerCase()}</button></div>
      </div>
    </div>
  );
}

export function ReleaseEditor({ release, onClose, onChange, onDelete }: {
  release: RoadmapRelease | null;
  onClose: () => void;
  onChange: (patch: Partial<RoadmapRelease>) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<RoadmapRelease | null>(release ? { ...release } : null);

  useEffect(() => {
    setDraft(release ? { ...release } : null);
  }, [release?.id]);

  function patchDraft(patch: Partial<RoadmapRelease>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    onChange(patch);
  }

  if (!release || !draft) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="release-editor modal-card">
        <div className="modal-head"><div><span className="modal-kicker">Release board</span><h2>{draft.name || 'Untitled release'}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></div>
        <div className="release-form">
          <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} autoFocus /></label>
          <div className="field-grid two"><label className="field"><span>Status</span><select value={draft.status} onChange={(event) => patchDraft({ status: event.target.value as RoadmapRelease['status'] })}><option value="planned">Planned</option><option value="active">Active</option><option value="released">Released</option></select></label><label className="field"><span>Target date</span><input type="date" value={draft.targetDate} onChange={(event) => patchDraft({ targetDate: event.target.value })} /></label></div>
          <label className="field"><span>Goal / notes</span><textarea rows={7} value={draft.notes} onChange={(event) => patchDraft({ notes: event.target.value })} placeholder="What should this release achieve?" /></label>
        </div>
        <div className="modal-footer split"><button className="danger-button" type="button" onClick={onDelete}><Trash2 size={15} /> Delete release</button><button className="primary-button" type="button" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

const COMMAND_VIEWS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'focus', label: 'Go to Focus', icon: <LayoutDashboard size={17} /> },
  { id: 'inbox', label: 'Go to Idea inbox', icon: <Inbox size={17} /> },
  { id: 'board', label: 'Go to Release board', icon: <Columns3 size={17} /> },
  { id: 'timeline', label: 'Go to Roadmap', icon: <Map size={17} /> },
  { id: 'list', label: 'Go to All items', icon: <List size={17} /> },
  { id: 'archive', label: 'Go to Archive', icon: <Archive size={17} /> },
  { id: 'settings', label: 'Go to Settings', icon: <Settings size={17} /> },
];

export function CommandPalette({ open, cards, releases, onClose, onSelectCard, onNavigate, onNewItem, onNewRelease, onBackup }: {
  open: boolean; cards: RoadmapCard[]; releases: RoadmapRelease[]; onClose: () => void; onSelectCard: (id: string) => void; onNavigate: (view: ViewId) => void; onNewItem: () => void; onNewRelease: () => void; onBackup: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(''); window.setTimeout(() => inputRef.current?.focus(), 40); } }, [open]);
  const matched = useMemo(() => cards.filter((card) => !card.archived && matchesSearch(card, releases, query)).slice(0, 8), [cards, releases, query]);
  const clean = query.trim().toLowerCase();
  const viewCommands = COMMAND_VIEWS.filter((item) => !clean || item.label.toLowerCase().includes(clean));
  if (!open) return null;
  return (
    <div className="modal-backdrop command-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="command-palette">
        <label className="command-search"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Escape' && onClose()} placeholder="Search items or type a command…" /><kbd>Esc</kbd></label>
        <div className="command-results">
          {!clean && <section><span className="command-section-title">Quick actions</span><button type="button" onClick={() => (onNewItem(), onClose())}><Plus size={17} /><span><strong>New work item</strong><small>Feature, bug, polish and more</small></span><kbd>Ctrl N</kbd></button><button type="button" onClick={() => (onNewRelease(), onClose())}><Sparkles size={17} /><span><strong>New release board</strong><small>Start a new version</small></span></button><button type="button" onClick={() => (onBackup(), onClose())}><Download size={17} /><span><strong>Back up roadmap</strong><small>Save a local JSON copy</small></span></button></section>}
          {viewCommands.length > 0 && <section><span className="command-section-title">Navigate</span>{viewCommands.map((item) => <button type="button" key={item.id} onClick={() => (onNavigate(item.id), onClose())}>{item.icon}<span><strong>{item.label}</strong></span></button>)}</section>}
          {matched.length > 0 && <section><span className="command-section-title">Work items</span>{matched.map((card) => { const release = releaseFor(card, releases); return <button type="button" key={card.id} onClick={() => (onSelectCard(card.id), onClose())}><FileStack size={17} /><span><strong>{card.title}</strong><small>{STAGE_LABEL[card.stage]} · {card.kind} · {card.area}{release ? ` · ${release.name}` : ''}{card.targetDate ? ` · ${formatShortDate(card.targetDate)}` : ''}</small></span></button>; })}</section>}
          {clean && !matched.length && !viewCommands.length && <div className="command-empty">Nothing matches “{query}”.</div>}
        </div>
      </div>
    </div>
  );
}
