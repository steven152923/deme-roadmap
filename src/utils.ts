import { STAGE_LABEL } from './constants';
import type { RoadmapCard, RoadmapRelease } from './types';

export function formatShortDate(value: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

export function formatLongDate(value: string) {
  if (!value) return 'No date';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function formatActivityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isOverdue(card: RoadmapCard) {
  return Boolean(card.targetDate && card.stage !== 'shipped' && card.targetDate < todayIso());
}

export function isDueSoon(card: RoadmapCard, days: number) {
  return Boolean(
    card.targetDate &&
      card.stage !== 'shipped' &&
      card.targetDate >= todayIso() &&
      card.targetDate <= addDaysIso(days),
  );
}

export function releaseFor(card: RoadmapCard, releases: RoadmapRelease[]) {
  return releases.find((release) => release.id === card.releaseId) ?? null;
}

export function checklistRatio(card: RoadmapCard) {
  if (!card.checklist.length) return null;
  return {
    done: card.checklist.filter((item) => item.done).length,
    total: card.checklist.length,
  };
}

export function completionPercent(cards: RoadmapCard[]) {
  if (!cards.length) return 0;
  return Math.round((cards.filter((card) => card.stage === 'shipped').length / cards.length) * 100);
}

export function matchesSearch(card: RoadmapCard, releases: RoadmapRelease[], query: string) {
  const clean = query.trim().toLowerCase();
  if (!clean) return true;
  const release = releaseFor(card, releases);
  const haystack = [
    card.title,
    card.description,
    card.area,
    STAGE_LABEL[card.stage],
    card.priority,
    card.effort,
    release?.name ?? '',
    ...card.labels,
    ...card.links.flatMap((link) => [link.label, link.url]),
    ...card.updates.map((update) => update.text),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(clean);
}

export function monthKey(value: string | Date) {
  const date = typeof value === 'string' ? new Date(`${value}T12:00:00`) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string) {
  const date = new Date(`${key}-01T12:00:00`);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit' }).format(date);
}

export function nextMonths(count = 6) {
  const now = new Date();
  now.setDate(1);
  now.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setMonth(date.getMonth() + index);
    return monthKey(date);
  });
}

export function sortByOrder(cards: RoadmapCard[]) {
  return [...cards].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function safeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
