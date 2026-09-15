import type { Effort, Priority, Stage, ViewId } from './types';

export const STAGES: { id: Stage; label: string; short: string; hint: string }[] = [
  { id: 'ideas', label: 'Ideas', short: 'Ideas', hint: 'Capture it before it disappears' },
  { id: 'planned', label: 'Planned', short: 'Planned', hint: 'Ready to pick up' },
  { id: 'progress', label: 'In progress', short: 'Building', hint: 'Actively being built' },
  { id: 'testing', label: 'Testing', short: 'Testing', hint: 'QA, feedback and fixes' },
  { id: 'shipped', label: 'Shipped', short: 'Shipped', hint: 'Out in the world' },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((stage) => [stage.id, stage.label])) as Record<Stage, string>;

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
];

export const PRIORITY_WEIGHT: Record<Priority, number> = { critical: 4, high: 3, normal: 2, low: 1 };

export const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'xs', label: 'XS' },
  { id: 's', label: 'S' },
  { id: 'm', label: 'M' },
  { id: 'l', label: 'L' },
  { id: 'xl', label: 'XL' },
];

export const VIEW_TITLES: Record<ViewId, { eyebrow: string; title: string }> = {
  focus: { eyebrow: 'your little Deme control room', title: 'What matters now' },
  inbox: { eyebrow: 'thoughts before they become tasks', title: 'Idea inbox' },
  board: { eyebrow: 'everything finding its place', title: 'Board' },
  timeline: { eyebrow: 'the next few months', title: 'Roadmap' },
  releases: { eyebrow: 'versions we are growing toward', title: 'Releases' },
  list: { eyebrow: 'everything, without the clutter', title: 'All items' },
  archive: { eyebrow: 'sleeping ideas live here', title: 'Archive' },
  settings: { eyebrow: 'make the space yours', title: 'Settings' },
};
