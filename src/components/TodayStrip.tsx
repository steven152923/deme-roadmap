import { CalendarCheck2, ChevronRight, Heart, Sparkles } from 'lucide-react';
import type { RoadmapCard, RoadmapRelease } from '../types';
import { releaseFor, sortByOrder } from '../utils';

export function TodayStrip({ cards, releases, onSelect, onOpenBoard }: {
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  onSelect: (id: string) => void;
  onOpenBoard: () => void;
}) {
  const today = sortByOrder(cards.filter((card) => !card.archived && card.stage !== 'shipped' && card.today));
  if (!today.length) return null;
  return (
    <section className="today-strip">
      <div className="today-strip-heading">
        <div className="today-icon"><CalendarCheck2 size={19} /></div>
        <div><span>Today</span><strong>Your tiny must-do pile</strong></div>
        <Sparkles size={17} className="today-sparkle" />
        <button type="button" onClick={onOpenBoard}>Open board <ChevronRight size={14} /></button>
      </div>
      <div className="today-card-row">
        {today.slice(0, 6).map((card) => {
          const release = releaseFor(card, releases);
          return (
            <button type="button" key={card.id} className={`today-mini-card kind-${card.kind}`} onClick={() => onSelect(card.id)}>
              <Heart size={13} />
              <span><strong>{card.title}</strong><small>{release?.name ?? 'Unassigned'} · {card.area}</small></span>
            </button>
          );
        })}
        {today.length > 6 && <div className="today-more">+{today.length - 6} more</div>}
      </div>
    </section>
  );
}
