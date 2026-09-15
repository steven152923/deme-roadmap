import { useMemo, useState } from 'react';
import {
  Archive,
  CalendarCheck2,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  Link2,
  ListChecks,
  LockKeyhole,
  MessageSquareText,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { BUG_SEVERITIES, EFFORTS, PRIORITIES, STAGES, WORK_KINDS } from '../constants';
import { uid } from '../data';
import type { ChecklistItem, RoadmapCard, RoadmapRelease } from '../types';
import { formatActivityDate, safeExternalUrl } from '../utils';

type EditorTab = 'details' | 'work' | 'updates';

interface CardEditorProps {
  card: RoadmapCard;
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  areas: string[];
  onClose: () => void;
  onChange: (patch: Partial<RoadmapCard>) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function CardEditor({ card, cards, releases, areas, onClose, onChange, onArchive, onRestore, onDelete, onDuplicate }: CardEditorProps) {
  const [tab, setTab] = useState<EditorTab>('details');
  const [newCheck, setNewCheck] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newUpdate, setNewUpdate] = useState('');
  const dependencyOptions = useMemo(() => cards.filter((item) => item.id !== card.id && !item.archived).sort((a, b) => a.title.localeCompare(b.title)), [cards, card.id]);

  function addChecklist() {
    const text = newCheck.trim();
    if (!text) return;
    const item: ChecklistItem = { id: uid('check'), text, done: false };
    onChange({ checklist: [...card.checklist, item] }); setNewCheck('');
  }
  function addLabel() {
    const label = newLabel.trim();
    if (!label || card.labels.some((item) => item.toLowerCase() === label.toLowerCase())) return;
    onChange({ labels: [...card.labels, label] }); setNewLabel('');
  }
  function addLink() {
    const url = safeExternalUrl(newLinkUrl);
    if (!url) return;
    onChange({ links: [...card.links, { id: uid('link'), label: newLinkLabel.trim() || new URL(url).hostname, url }] });
    setNewLinkLabel(''); setNewLinkUrl('');
  }
  function addUpdate() {
    const text = newUpdate.trim();
    if (!text) return;
    onChange({ updates: [...card.updates, { id: uid('update'), text, createdAt: new Date().toISOString() }] }); setNewUpdate('');
  }
  function toggleDependency(id: string) {
    onChange({ blockedBy: card.blockedBy.includes(id) ? card.blockedBy.filter((value) => value !== id) : [...card.blockedBy, id] });
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="card-editor" aria-label={`Edit ${card.title}`}>
        <div className="editor-head">
          <div className="editor-head-copy"><span className="editor-kicker">{card.archived ? 'Archived item' : card.kind === 'bug' ? 'Bug report' : 'Work item'}</span><strong>{card.title || 'Untitled item'}</strong></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close editor"><X size={20} /></button>
        </div>
        <div className="editor-tabs" role="tablist">
          <button className={tab === 'details' ? 'active' : ''} type="button" onClick={() => setTab('details')}><CalendarDays size={15} /> Details</button>
          <button className={tab === 'work' ? 'active' : ''} type="button" onClick={() => setTab('work')}><ListChecks size={15} /> Work</button>
          <button className={tab === 'updates' ? 'active' : ''} type="button" onClick={() => setTab('updates')}><MessageSquareText size={15} /> Updates</button>
        </div>

        <div className="editor-scroll">
          {tab === 'details' && (
            <div className="editor-panel">
              <div className="editor-quick-flags">
                <button type="button" className={card.today ? 'active' : ''} onClick={() => onChange({ today: !card.today })}><CalendarCheck2 size={15} /> Today</button>
                <button type="button" className={card.pinned ? 'active' : ''} onClick={() => onChange({ pinned: !card.pinned })}><Pin size={15} /> Pin</button>
              </div>
              <label className="field full-field"><span>Title</span><input value={card.title} onChange={(event) => onChange({ title: event.target.value })} autoFocus /></label>
              <label className="field full-field"><span>Description</span><textarea value={card.description} onChange={(event) => onChange({ description: event.target.value })} rows={6} placeholder={card.kind === 'bug' ? 'What happened, what should happen, and how can it be reproduced?' : 'What are we changing, why does it matter, and what does done look like?'} /></label>

              <div className="field-grid three">
                <label className="field"><span>Type</span><select value={card.kind} onChange={(event) => { const kind = event.target.value as RoadmapCard['kind']; onChange({ kind, ...(kind === 'bug' && card.stage === 'planned' ? { stage: 'ideas' as const } : {}) }); }}>{WORK_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
                <label className="field"><span>Lane</span><select value={card.stage} onChange={(event) => onChange({ stage: event.target.value as RoadmapCard['stage'], ...(event.target.value === 'ideas' ? { kind: 'bug' as const } : {}) })}>{STAGES.map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
                <label className="field"><span>Area</span><select value={card.area} onChange={(event) => onChange({ area: event.target.value })}>{areas.map((area) => <option key={area} value={area}>{area}</option>)}{!areas.includes(card.area) && <option value={card.area}>{card.area}</option>}</select></label>
              </div>

              <div className="field-grid three">
                <label className="field"><span>Priority</span><select value={card.priority} onChange={(event) => onChange({ priority: event.target.value as RoadmapCard['priority'] })}>{PRIORITIES.map((priority) => <option key={priority.id} value={priority.id}>{priority.label}</option>)}</select></label>
                <label className="field"><span>Effort</span><select value={card.effort} onChange={(event) => onChange({ effort: event.target.value as RoadmapCard['effort'] })}>{EFFORTS.map((effort) => <option key={effort.id} value={effort.id}>{effort.label}</option>)}</select></label>
                {card.kind === 'bug' ? <label className="field"><span>Severity</span><select value={card.bugSeverity} onChange={(event) => onChange({ bugSeverity: event.target.value as RoadmapCard['bugSeverity'] })}>{BUG_SEVERITIES.map((severity) => <option key={severity.id} value={severity.id}>{severity.label}</option>)}</select></label> : <label className="field"><span>Release</span><select value={card.releaseId} onChange={(event) => onChange({ releaseId: event.target.value })}><option value="">Unassigned</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label>}
              </div>
              {card.kind === 'bug' && <label className="field full-field"><span>Release</span><select value={card.releaseId} onChange={(event) => onChange({ releaseId: event.target.value })}><option value="">Unassigned</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label>}

              <div className="field-grid two"><label className="field"><span>Start date</span><input type="date" value={card.startDate} onChange={(event) => onChange({ startDate: event.target.value })} /></label><label className="field"><span>Target date</span><input type="date" value={card.targetDate} onChange={(event) => onChange({ targetDate: event.target.value })} /></label></div>

              <div className="editor-section"><div className="editor-section-title"><span>Labels</span><small>Use these however you want</small></div>{card.labels.length > 0 && <div className="editable-labels">{card.labels.map((label) => <button type="button" key={label} onClick={() => onChange({ labels: card.labels.filter((item) => item !== label) })}>{label}<X size={12} /></button>)}</div>}<div className="inline-add"><input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addLabel())} placeholder="e.g. android, beta, polish" /><button type="button" onClick={addLabel}><Plus size={15} /> Add</button></div></div>
            </div>
          )}

          {tab === 'work' && (
            <div className="editor-panel">
              <div className="editor-section first"><div className="editor-section-title"><span>Checklist</span><small>{card.checklist.filter((item) => item.done).length}/{card.checklist.length} complete</small></div><div className="checklist-editor">{card.checklist.map((item) => <div className="checklist-row" key={item.id}><button className={`check-button ${item.done ? 'done' : ''}`} type="button" onClick={() => onChange({ checklist: card.checklist.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) })}>{item.done && <Check size={13} />}</button><input className={item.done ? 'done' : ''} value={item.text} onChange={(event) => onChange({ checklist: card.checklist.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry) })} /><button className="bare-icon" type="button" onClick={() => onChange({ checklist: card.checklist.filter((entry) => entry.id !== item.id) })}><X size={15} /></button></div>)}</div><div className="inline-add"><input value={newCheck} onChange={(event) => setNewCheck(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addChecklist())} placeholder="Add a step" /><button type="button" onClick={addChecklist}><Plus size={15} /> Add</button></div></div>
              <div className="editor-section"><div className="editor-section-title"><span>Blocked by</span><small>Things that must land first</small></div>{dependencyOptions.length ? <div className="dependency-list">{dependencyOptions.map((item) => <label key={item.id} className={card.blockedBy.includes(item.id) ? 'selected' : ''}><input type="checkbox" checked={card.blockedBy.includes(item.id)} onChange={() => toggleDependency(item.id)} /><LockKeyhole size={15} /><span><strong>{item.title}</strong><small>{item.area}</small></span></label>)}</div> : <div className="editor-empty">No other active items to depend on yet.</div>}</div>
              <div className="editor-section"><div className="editor-section-title"><span>Links</span><small>Figma, GitHub, docs, references</small></div><div className="link-list">{card.links.map((link) => <div className="link-row" key={link.id}><Link2 size={15} /><a href={link.url} target="_blank" rel="noreferrer"><span>{link.label || link.url}</span><ExternalLink size={13} /></a><button className="bare-icon" type="button" onClick={() => onChange({ links: card.links.filter((entry) => entry.id !== link.id) })}><X size={15} /></button></div>)}</div><div className="link-add-grid"><input value={newLinkLabel} onChange={(event) => setNewLinkLabel(event.target.value)} placeholder="Label (optional)" /><input value={newLinkUrl} onChange={(event) => setNewLinkUrl(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addLink())} placeholder="https://…" /><button type="button" onClick={addLink}><Plus size={15} /> Add link</button></div></div>
            </div>
          )}

          {tab === 'updates' && (
            <div className="editor-panel"><div className="update-composer"><MessageSquareText size={18} /><textarea rows={4} value={newUpdate} onChange={(event) => setNewUpdate(event.target.value)} placeholder="Progress note, decision, QA result, reminder…" /><button className="primary-button small" type="button" onClick={addUpdate}>Add update</button></div><div className="updates-list">{[...card.updates].reverse().map((update) => <div className="update-entry" key={update.id}><div className="update-dot" /><div><p>{update.text}</p><span>{formatActivityDate(update.createdAt)}</span></div><button className="bare-icon" type="button" onClick={() => onChange({ updates: card.updates.filter((entry) => entry.id !== update.id) })}><Trash2 size={14} /></button></div>)}{!card.updates.length && <div className="editor-empty">No updates yet. This stays local to your PC.</div>}</div></div>
          )}
        </div>

        <div className="editor-footer"><div><button type="button" className="footer-action" onClick={onDuplicate}><Copy size={15} /> Duplicate</button>{card.archived ? <button type="button" className="footer-action" onClick={onRestore}><RotateCcw size={15} /> Restore</button> : <button type="button" className="footer-action" onClick={onArchive}><Archive size={15} /> Archive</button>}</div><button type="button" className="danger-button" onClick={onDelete}><Trash2 size={15} /> Delete</button></div>
      </aside>
    </div>
  );
}
