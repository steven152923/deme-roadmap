import type { BugSeverity, Effort, Priority, Stage, ViewId, WorkKind } from './types';

export const STAGES: { id: Stage; label: string; short: string; hint: string }[] = [
  { id: 'planned', label: 'Planned', short: 'Planned', hint: 'Ready to pick up' },
  { id: 'progress', label: 'Working on', short: 'Working', hint: 'Actively being built' },
  { id: 'testing', label: 'Testing', short: 'Testing', hint: 'QA, feedback and fixes' },
  { id: 'ideas', label: 'Bugs', short: 'Bugs', hint: 'Issues waiting for a fix' },
  { id: 'shipped', label: 'Completed', short: 'Done', hint: 'Finished and out of the way' },
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

export const WORK_KINDS: { id: WorkKind; label: string; hint: string }[] = [
  { id: 'feature', label: 'Feature', hint: 'Something new for Deme' },
  { id: 'bug', label: 'Bug', hint: 'Something broken that needs fixing' },
  { id: 'polish', label: 'Polish', hint: 'UI, UX or visual refinement' },
  { id: 'performance', label: 'Performance', hint: 'Speed, stability or memory work' },
  { id: 'chore', label: 'Chore', hint: 'Maintenance, cleanup or admin work' },
];

export const BUG_SEVERITIES: { id: BugSeverity; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'blocker', label: 'Blocker' },
];

export const VIEW_TITLES: Record<ViewId, { eyebrow: string; title: string }> = {
  focus: { eyebrow: 'your little Deme control room', title: 'What matters now' },
  inbox: { eyebrow: 'thoughts before they become tasks', title: 'Idea inbox' },
  board: { eyebrow: 'one release, one cute little flow', title: 'Release board' },
  qa: { eyebrow: 'release candidate quality control', title: 'QA test runs' },
  timeline: { eyebrow: 'the next few months', title: 'Roadmap' },
  releases: { eyebrow: 'one release, one cute little flow', title: 'Release board' },
  list: { eyebrow: 'everything, without the clutter', title: 'All items' },
  archive: { eyebrow: 'sleeping ideas live here', title: 'Archive' },
  settings: { eyebrow: 'make the space yours', title: 'Settings' },
};
