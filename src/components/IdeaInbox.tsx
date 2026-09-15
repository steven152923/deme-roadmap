import { ArrowUpRight, Heart, Lightbulb, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { IdeaInboxNote } from '../types';
import { formatActivityDate } from '../utils';

export function IdeaInboxView({
  notes,
  onAdd,
  onPromote,
  onDelete,
}: {
  notes: IdeaInboxNote[];
  onAdd: (text: string) => void;
  onPromote: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft('');
  }

  return (
    <div className="idea-inbox-page">
      <section className="idea-inbox-hero cute-cloud-panel">
        <div className="cute-sparkle sparkle-one">✦</div>
        <div className="cute-sparkle sparkle-two">♡</div>
        <div className="idea-hero-icon"><Lightbulb size={24} /></div>
        <div className="idea-hero-copy">
          <span className="eyebrow">No planning required</span>
          <h2>Drop the thought here before it disappears.</h2>
          <p>This is the messy little pocket before something becomes a real roadmap item. No dates, no release, no priority. Just the idea.</p>
        </div>
        <Heart className="idea-hero-heart" size={28} fill="currentColor" />
      </section>

      <section className="idea-composer cute-card-surface">
        <div className="idea-composer-title"><Sparkles size={17} /><strong>New thought</strong><span>{draft.length}/500</span></div>
        <textarea
          value={draft}
          maxLength={500}
          rows={4}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Maybe community profiles should have…"
        />
        <div className="idea-composer-footer">
          <small>Ctrl + Enter saves it</small>
          <button className="primary-button cute-primary" type="button" disabled={!draft.trim()} onClick={submit}><Plus size={17} /> Save thought</button>
        </div>
      </section>

      {notes.length ? (
        <div className="idea-note-grid">
          {[...notes].reverse().map((note, index) => (
            <article className={`idea-note idea-note-${index % 4}`} key={note.id}>
              <div className="idea-note-pin">✦</div>
              <p>{note.text}</p>
              <div className="idea-note-bottom">
                <span>{formatActivityDate(note.createdAt)}</span>
                <div>
                  <button className="idea-promote" type="button" onClick={() => onPromote(note.id)} title="Turn into a roadmap item"><ArrowUpRight size={15} /> Make item</button>
                  <button className="bare-icon" type="button" onClick={() => onDelete(note.id)} title="Delete thought"><Trash2 size={14} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="idea-empty cute-card-surface">
          <div className="idea-empty-cloud">☁</div>
          <h3>Your head is suspiciously quiet.</h3>
          <p>The next random Deme idea can live here until you decide whether it deserves the full roadmap treatment.</p>
        </div>
      )}
    </div>
  );
}
