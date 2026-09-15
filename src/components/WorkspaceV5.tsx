import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BookOpen, Brain, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  Clipboard, Clock3, Flag, Pause, Pin, Play, Plus, Rocket, RotateCcw, Sparkles, TimerReset, Trash2, WandSparkles,
} from 'lucide-react';
import type { DecisionEntry, DecisionStatus, FocusSessionRecord, LaunchPlan, NoteColor, RoadmapCard, RoadmapRelease, ViewId, WorkspaceNote } from '../types';

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function displayDate(value: string) {
  if (!value) return 'No date';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function WorkspaceBrief({ cards, releases, notes, decisions, focusSessions, onNavigate }: {
  cards: RoadmapCard[]; releases: RoadmapRelease[]; notes: WorkspaceNote[]; decisions: DecisionEntry[]; focusSessions: FocusSessionRecord[]; onNavigate: (view: ViewId) => void;
}) {
  const today = isoDate(new Date());
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
  const active = cards.filter((card) => !card.archived && card.stage !== 'shipped');
  const due = active.filter((card) => card.targetDate && card.targetDate <= today).length;
  const pinned = notes.filter((note) => note.pinned).length;
  const review = decisions.filter((item) => item.status !== 'superseded' && item.reviewDate && item.reviewDate <= isoDate(nextWeek)).length;
  const focused = focusSessions.filter((session) => session.completedAt.slice(0, 10) === today).reduce((sum, session) => sum + session.minutes, 0);
  const activeRelease = releases.find((release) => release.status === 'active');
  return <section className="workspace-brief">
    <div className="brief-intro"><span>Today at a glance</span><strong>{activeRelease ? `${activeRelease.name} is the release in motion` : 'Your private Deme desk'}</strong></div>
    <button type="button" onClick={() => onNavigate('calendar')}><CalendarDays size={17} /><span><strong>{due}</strong><small>due / overdue</small></span></button>
    <button type="button" onClick={() => onNavigate('notes')}><BookOpen size={17} /><span><strong>{pinned}</strong><small>pinned notes</small></span></button>
    <button type="button" onClick={() => onNavigate('decisions')}><Brain size={17} /><span><strong>{review}</strong><small>decisions to revisit</small></span></button>
    <div className="brief-static"><Clock3 size={17} /><span><strong>{focused}m</strong><small>focused today</small></span></div>
  </section>;
}

type CalendarEvent = { id: string; type: 'card' | 'release' | 'decision'; date: string; title: string; meta: string };
export function CalendarView({ cards, releases, decisions, onSelectCard, onOpenRelease, onOpenDecision }: {
  cards: RoadmapCard[]; releases: RoadmapRelease[]; decisions: DecisionEntry[]; onSelectCard: (id: string) => void; onOpenRelease: (id: string) => void; onOpenDecision: (id: string) => void;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const events = useMemo<CalendarEvent[]>(() => [
    ...cards.filter((card) => !card.archived && card.targetDate).map((card) => ({ id: card.id, type: 'card' as const, date: card.targetDate, title: card.title, meta: card.stage === 'ideas' ? 'Bug' : card.area })),
    ...releases.filter((release) => release.targetDate).map((release) => ({ id: release.id, type: 'release' as const, date: release.targetDate, title: release.name, meta: 'Release target' })),
    ...decisions.filter((item) => item.reviewDate && item.status !== 'superseded').map((item) => ({ id: item.id, type: 'decision' as const, date: item.reviewDate, title: item.title, meta: 'Decision review' })),
  ], [cards, releases, decisions]);
  const year = month.getFullYear(), monthIndex = month.getMonth();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate(), offset = new Date(year, monthIndex, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, index) => { const day = index - offset + 1; return day >= 1 && day <= dayCount ? day : 0; });
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month), today = isoDate(new Date());
  const shift = (by: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + by, 1));
  const openEvent = (event: CalendarEvent) => event.type === 'card' ? onSelectCard(event.id) : event.type === 'release' ? onOpenRelease(event.id) : onOpenDecision(event.id);
  return <div className="calendar-page">
    <section className="calendar-hero"><div><span className="eyebrow">Target dates + release days + revisit dates</span><h2>{label}</h2><p>Your roadmap dates stop hiding inside cards.</p></div><div className="calendar-controls"><button type="button" onClick={() => shift(-1)}><ChevronLeft size={17} /></button><button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button type="button" onClick={() => shift(1)}><ChevronRight size={17} /></button></div></section>
    <div className="calendar-legend"><span className="event-card-dot" />Work target <span className="event-release-dot" />Release <span className="event-decision-dot" />Decision review</div>
    <section className="calendar-grid">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{cells.map((day, index) => {
      if (!day) return <div className="calendar-day empty" key={`empty-${index}`} />;
      const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`, dayEvents = events.filter((event) => event.date === date);
      return <div className={`calendar-day ${date === today ? 'today' : ''}`} key={date}><div className="calendar-day-number"><span>{day}</span>{date === today && <small>today</small>}</div><div className="calendar-events">{dayEvents.slice(0, 4).map((event) => <button type="button" key={`${event.type}-${event.id}`} className={`calendar-event ${event.type}`} onClick={() => openEvent(event)}><strong>{event.title}</strong><small>{event.meta}</small></button>)}{dayEvents.length > 4 && <span className="calendar-more">+{dayEvents.length - 4} more</span>}</div></div>;
    })}</section>
  </div>;
}

const NOTE_COLORS: NoteColor[] = ['pink', 'lilac', 'blue', 'mint', 'peach'];
export function NotesView({ notes, search, onCreate, onUpdate, onDelete, onPromote }: {
  notes: WorkspaceNote[]; search: string; onCreate: () => string; onUpdate: (id: string, patch: Partial<WorkspaceNote>) => void; onDelete: (id: string) => void; onPromote: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const visible = useMemo(() => notes.filter((note) => !search.trim() || `${note.title} ${note.body}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)), [notes, search]);
  const selected = notes.find((note) => note.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => { if (!selectedId && visible[0]) setSelectedId(visible[0].id); }, [selectedId, visible]);
  const create = () => setSelectedId(onCreate());
  return <div className="notes-workspace"><aside className="notes-list-panel"><div className="workspace-list-head"><div><span className="eyebrow">Private notebook</span><h3>Your notes</h3></div><button type="button" onClick={create}><Plus size={15} /> Note</button></div><div className="notes-list">{visible.map((note) => <button type="button" key={note.id} className={`note-list-item color-${note.color} ${selected?.id === note.id ? 'active' : ''}`} onClick={() => setSelectedId(note.id)}><span className="note-color-dot" /><span><strong>{note.title || 'Untitled note'}</strong><small>{note.body.trim().slice(0, 72) || 'Empty note'}</small></span>{note.pinned && <Pin size={12} />}</button>)}{!visible.length && <div className="workspace-empty-mini">No notes match this search.</div>}</div></aside>
    <section className="note-editor-panel">{!selected ? <div className="workspace-empty"><BookOpen size={28} /><h2>A blank page, but cute</h2><p>Keep launch copy, meeting scraps, research, or anything that does not deserve a roadmap card yet.</p><button type="button" onClick={create}><Plus size={16} /> Create your first note</button></div> : <><div className="note-editor-toolbar"><div className="note-colors">{NOTE_COLORS.map((color) => <button type="button" aria-label={`${color} note`} key={color} className={`note-swatch ${color} ${selected.color === color ? 'active' : ''}`} onClick={() => onUpdate(selected.id, { color })} />)}</div><button type="button" className={selected.pinned ? 'active' : ''} onClick={() => onUpdate(selected.id, { pinned: !selected.pinned })}><Pin size={15} /> {selected.pinned ? 'Pinned' : 'Pin'}</button><button type="button" onClick={() => onPromote(selected.id)}><ArrowRight size={15} /> Make work item</button><button type="button" className="danger" onClick={() => { onDelete(selected.id); setSelectedId(''); }}><Trash2 size={15} /></button></div><input className="note-title-input" value={selected.title} onChange={(event) => onUpdate(selected.id, { title: event.target.value })} placeholder="Note title" /><textarea className={`note-body-input color-${selected.color}`} value={selected.body} onChange={(event) => onUpdate(selected.id, { body: event.target.value })} placeholder="Type absolutely anything…" /><div className="note-editor-footer"><span>Saved locally</span><small>Edited {new Date(selected.updatedAt).toLocaleString()}</small></div></>}</section>
  </div>;
}

const DECISION_STATUS: { id: DecisionStatus; label: string }[] = [{ id: 'active', label: 'Active' }, { id: 'revisit', label: 'Revisit' }, { id: 'superseded', label: 'Superseded' }];
export function DecisionsView({ decisions, releases, search, onCreate, onUpdate, onDelete, onPromote }: {
  decisions: DecisionEntry[]; releases: RoadmapRelease[]; search: string; onCreate: () => string; onUpdate: (id: string, patch: Partial<DecisionEntry>) => void; onDelete: (id: string) => void; onPromote: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const visible = useMemo(() => decisions.filter((item) => !search.trim() || `${item.title} ${item.decision} ${item.rationale}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => a.status.localeCompare(b.status) || b.updatedAt.localeCompare(a.updatedAt)), [decisions, search]);
  const selected = decisions.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  useEffect(() => { if (!selectedId && visible[0]) setSelectedId(visible[0].id); }, [selectedId, visible]);
  const create = () => setSelectedId(onCreate());
  return <div className="decisions-workspace"><aside className="decision-list-panel"><div className="workspace-list-head"><div><span className="eyebrow">Founder brain backup</span><h3>Decisions</h3></div><button type="button" onClick={create}><Plus size={15} /> Decide</button></div><div className="decision-list">{visible.map((item) => <button type="button" key={item.id} className={`decision-list-item status-${item.status} ${selected?.id === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}><Flag size={14} /><span><strong>{item.title}</strong><small>{item.decision.trim().slice(0, 80) || 'Decision not written yet'}</small></span><em>{item.status}</em></button>)}{!visible.length && <div className="workspace-empty-mini">No decisions match this search.</div>}</div></aside>
    <section className="decision-editor-panel">{!selected ? <div className="workspace-empty"><Brain size={28} /><h2>Stop asking “why did I do that?”</h2><p>Record the call, the reasoning, and when you want to reconsider it.</p><button type="button" onClick={create}><Plus size={16} /> Record a decision</button></div> : <><div className="decision-editor-head"><span className={`decision-status-badge ${selected.status}`}>{selected.status}</span><div><button type="button" onClick={() => onPromote(selected.id)}><ArrowRight size={15} /> Make follow-up</button><button type="button" className="danger" onClick={() => { onDelete(selected.id); setSelectedId(''); }}><Trash2 size={15} /></button></div></div><label className="workspace-field"><span>Decision title</span><input value={selected.title} onChange={(event) => onUpdate(selected.id, { title: event.target.value })} /></label><div className="workspace-field-grid"><label className="workspace-field"><span>Status</span><select value={selected.status} onChange={(event) => onUpdate(selected.id, { status: event.target.value as DecisionStatus })}>{DECISION_STATUS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="workspace-field"><span>Related release</span><select value={selected.releaseId} onChange={(event) => onUpdate(selected.id, { releaseId: event.target.value })}><option value="">None</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label><label className="workspace-field"><span>Revisit on</span><input type="date" value={selected.reviewDate} onChange={(event) => onUpdate(selected.id, { reviewDate: event.target.value })} /></label></div><label className="workspace-field grow"><span>What did we decide?</span><textarea value={selected.decision} onChange={(event) => onUpdate(selected.id, { decision: event.target.value })} placeholder="The actual call you made…" /></label><label className="workspace-field grow"><span>Why?</span><textarea value={selected.rationale} onChange={(event) => onUpdate(selected.id, { rationale: event.target.value })} placeholder="Context, trade-offs, what you rejected, what mattered…" /></label><div className="decision-footer"><small>Created {new Date(selected.createdAt).toLocaleDateString()}</small>{selected.reviewDate && <span><Clock3 size={12} /> Revisit {displayDate(selected.reviewDate)}</span>}</div></>}</section>
  </div>;
}

function buildReleaseNotes(release: RoadmapRelease, cards: RoadmapCard[]) {
  const completed = cards.filter((card) => !card.archived && card.releaseId === release.id && card.stage === 'shipped');
  const groups: Array<[RoadmapCard['kind'], string]> = [['feature', 'New'], ['polish', 'Improved'], ['performance', 'Performance'], ['bug', 'Fixed'], ['chore', 'Under the hood']];
  const lines = [release.name, ''];
  for (const [kind, heading] of groups) { const rows = completed.filter((card) => card.kind === kind); if (!rows.length) continue; lines.push(heading, ...rows.map((card) => `• ${card.title}`), ''); }
  if (lines.length <= 2) lines.push('No completed roadmap items are assigned to this release yet.');
  return lines.join('\n').trim();
}
function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea'); textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); return Promise.resolve();
}

export function LaunchCenter({ releases, cards, plans, onCreatePlan, onUpdatePlan, onOpenCard, onNavigateQA }: {
  releases: RoadmapRelease[]; cards: RoadmapCard[]; plans: LaunchPlan[]; onCreatePlan: (releaseId: string) => void; onUpdatePlan: (releaseId: string, patch: Partial<LaunchPlan>) => void; onOpenCard: (id: string) => void; onNavigateQA: () => void;
}) {
  const [releaseId, setReleaseId] = useState(() => releases.find((release) => release.status === 'active')?.id ?? releases[0]?.id ?? '');
  const [category, setCategory] = useState<'QA' | 'Store' | 'Release' | 'Comms'>('Release'), [newItem, setNewItem] = useState('');
  useEffect(() => { if (!releaseId && releases[0]) setReleaseId(releases[0].id); }, [releaseId, releases]);
  const release = releases.find((item) => item.id === releaseId) ?? null, plan = plans.find((item) => item.releaseId === releaseId) ?? null;
  useEffect(() => { if (releaseId && !plan) onCreatePlan(releaseId); }, [releaseId, plan, onCreatePlan]);
  if (!release) return <div className="workspace-empty launch-empty"><Rocket size={30} /><h2>No release to launch yet</h2><p>Create a release board first, then Launch Center will build the ship checklist around it.</p></div>;
  if (!plan) return <div className="workspace-empty launch-empty"><Sparkles size={30} /><h2>Preparing launch desk…</h2></div>;
  const activeRelease = release, activePlan = plan;
  const releaseCards = cards.filter((card) => !card.archived && card.releaseId === activeRelease.id), blockers = releaseCards.filter((card) => card.kind === 'bug' && card.bugSeverity === 'blocker' && card.stage !== 'shipped');
  const completed = releaseCards.filter((card) => card.stage === 'shipped').length, checked = activePlan.checklist.filter((item) => item.done).length, readiness = activePlan.checklist.length ? Math.round(checked / activePlan.checklist.length * 100) : 0;
  const groups = ['QA', 'Store', 'Release', 'Comms'] as const;
  const patchChecklist = (next: LaunchPlan['checklist']) => onUpdatePlan(activeRelease.id, { checklist: next, updatedAt: new Date().toISOString() });
  function addChecklist() { const text = newItem.trim(); if (!text) return; patchChecklist([...activePlan.checklist, { id: `launch-${Date.now()}-${Math.random().toString(16).slice(2)}`, text, category, done: false }]); setNewItem(''); }
  return <div className="launch-center"><section className="launch-hero"><div className="launch-title"><div className="launch-icon"><Rocket size={24} /></div><div><span className="eyebrow">Release desk</span><h2>{activeRelease.name}</h2><p>{activeRelease.notes || 'Turn completed work into something you can actually ship with confidence.'}</p></div></div><label className="launch-release-picker"><span>Release</span><select value={activeRelease.id} onChange={(event) => setReleaseId(event.target.value)}>{releases.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="launch-stats"><div><strong>{readiness}%</strong><span>checklist ready</span></div><div><strong>{completed}/{releaseCards.length}</strong><span>work completed</span></div><div className={blockers.length ? 'danger' : ''}><strong>{blockers.length}</strong><span>blocker bugs</span></div><div><strong>{activeRelease.targetDate ? displayDate(activeRelease.targetDate) : 'No date'}</strong><span>release target</span></div></div></section>
    {blockers.length > 0 && <section className="launch-warning"><AlertTriangle size={18} /><div><strong>{blockers.length} blocker {blockers.length === 1 ? 'bug is' : 'bugs are'} still open.</strong><span>Launch Center will not pretend that is fine.</span></div><div>{blockers.slice(0, 3).map((card) => <button type="button" key={card.id} onClick={() => onOpenCard(card.id)}>{card.title}</button>)}</div></section>}
    <div className="launch-grid"><section className="launch-panel checklist-panel"><div className="launch-panel-head"><div><span className="eyebrow">Readiness</span><h3>Launch checklist</h3></div><div className="readiness-ring"><strong>{checked}</strong><span>/ {activePlan.checklist.length}</span></div></div>{groups.map((group) => <div className="launch-check-group" key={group}><div className="launch-check-group-title"><span>{group}</span>{group === 'QA' && <button type="button" onClick={onNavigateQA}>Open QA <ArrowRight size={12} /></button>}</div>{activePlan.checklist.filter((item) => item.category === group).map((item) => <label key={item.id} className={`launch-check ${item.done ? 'done' : ''}`}><input type="checkbox" checked={item.done} onChange={(event) => patchChecklist(activePlan.checklist.map((row) => row.id === item.id ? { ...row, done: event.target.checked } : row))} /><CheckCircle2 size={15} /><span>{item.text}</span><button type="button" onClick={(event) => { event.preventDefault(); patchChecklist(activePlan.checklist.filter((row) => row.id !== item.id)); }}><Trash2 size={12} /></button></label>)}</div>)}<div className="launch-add-row"><select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{groups.map((group) => <option key={group} value={group}>{group}</option>)}</select><input value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addChecklist()} placeholder="Add your own launch check…" /><button type="button" onClick={addChecklist}><Plus size={14} /> Add</button></div></section>
      <section className="launch-panel notes-panel"><div className="launch-panel-head"><div><span className="eyebrow">Copy-ready</span><h3>Release notes builder</h3></div><div className="release-note-actions"><button type="button" onClick={() => onUpdatePlan(activeRelease.id, { notesDraft: buildReleaseNotes(activeRelease, cards), updatedAt: new Date().toISOString() })}><WandSparkles size={14} /> Generate</button><button type="button" disabled={!activePlan.notesDraft.trim()} onClick={() => copyText(activePlan.notesDraft)}><Clipboard size={14} /> Copy</button></div></div><p className="launch-panel-help">Generate from completed roadmap work, then edit it into App Store, Google Play, Discord, or announcement copy.</p><textarea value={activePlan.notesDraft} onChange={(event) => onUpdatePlan(activeRelease.id, { notesDraft: event.target.value, updatedAt: new Date().toISOString() })} placeholder="Generate notes from completed work or write from scratch…" /></section></div>
  </div>;
}

export function FocusTimer({ onComplete }: { onComplete: (minutes: number) => void }) {
  const [open, setOpen] = useState(false), [minutes, setMinutes] = useState(25), [remaining, setRemaining] = useState(25 * 60), [running, setRunning] = useState(false);
  useEffect(() => { if (!running) return; const interval = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(interval); }, [running]);
  useEffect(() => { if (remaining !== 0 || !running) return; setRunning(false); onComplete(minutes); }, [remaining, running, minutes, onComplete]);
  const choose = (value: number) => { setMinutes(value); setRemaining(value * 60); setRunning(false); }, reset = () => { setRunning(false); setRemaining(minutes * 60); };
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0'), ss = String(remaining % 60).padStart(2, '0');
  return <div className="focus-timer-wrap"><button type="button" className={`focus-timer-button ${running ? 'running' : ''}`} onClick={() => setOpen((value) => !value)} title="Focus session"><TimerReset size={17} />{running && <span>{mm}:{ss}</span>}</button>{open && <div className="focus-timer-popover"><div className="timer-pop-head"><div><span>Focus session</span><strong>{mm}:{ss}</strong></div><Clock3 size={18} /></div><div className="timer-presets">{[25,50,90].map((value) => <button type="button" className={minutes === value ? 'active' : ''} key={value} onClick={() => choose(value)}>{value}m</button>)}</div><div className="timer-actions"><button type="button" className="timer-primary" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? 'Pause' : remaining === 0 ? 'Start again' : 'Start'}</button><button type="button" onClick={reset}><RotateCcw size={15} /> Reset</button></div><small>Completed sessions are kept in your local workspace history.</small></div>}</div>;
}
