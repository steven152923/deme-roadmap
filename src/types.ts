export type Stage = 'ideas' | 'planned' | 'progress' | 'testing' | 'shipped';
export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type Effort = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ReleaseStatus = 'planned' | 'active' | 'released';
export type WorkKind = 'feature' | 'bug' | 'polish' | 'performance' | 'chore';
export type BugSeverity = 'low' | 'medium' | 'high' | 'blocker';
export type ThemePreset = 'candy' | 'night' | 'paper';
export type NoteColor = 'pink' | 'lilac' | 'blue' | 'mint' | 'peach';
export type DecisionStatus = 'active' | 'revisit' | 'superseded';
export type ViewId = 'focus' | 'inbox' | 'board' | 'qa' | 'calendar' | 'notes' | 'decisions' | 'launch' | 'timeline' | 'releases' | 'list' | 'archive' | 'settings';

export interface ChecklistItem { id: string; text: string; done: boolean; }
export interface CardLink { id: string; label: string; url: string; }
export interface CardUpdate { id: string; text: string; createdAt: string; }
export interface IdeaInboxNote { id: string; text: string; createdAt: string; }

export interface RoadmapCard {
  id: string; title: string; description: string; stage: Stage; kind: WorkKind; bugSeverity: BugSeverity; today: boolean;
  area: string; priority: Priority; effort: Effort; releaseId: string; startDate: string; targetDate: string; labels: string[];
  checklist: ChecklistItem[]; blockedBy: string[]; links: CardLink[]; updates: CardUpdate[]; pinned: boolean; archived: boolean;
  sortOrder: number; createdAt: string; updatedAt: string;
}

export interface RoadmapRelease { id: string; name: string; status: ReleaseStatus; targetDate: string; notes: string; createdAt: string; updatedAt: string; }
export interface WorkspaceNote { id: string; title: string; body: string; color: NoteColor; pinned: boolean; createdAt: string; updatedAt: string; }
export interface DecisionEntry { id: string; title: string; decision: string; rationale: string; status: DecisionStatus; releaseId: string; reviewDate: string; createdAt: string; updatedAt: string; }
export interface LaunchChecklistItem { id: string; text: string; category: 'QA' | 'Store' | 'Release' | 'Comms'; done: boolean; }
export interface LaunchPlan { releaseId: string; checklist: LaunchChecklistItem[]; notesDraft: string; updatedAt: string; }
export interface FocusSessionRecord { id: string; minutes: number; note: string; completedAt: string; }

export interface RoadmapSettings {
  startView: Exclude<ViewId, 'archive' | 'settings'>;
  compactCards: boolean;
  showShippedOnBoard: boolean;
  dueSoonDays: number;
  confirmPermanentDelete: boolean;
  areas: string[];
  themePreset: ThemePreset;
}

export interface ActivityEntry {
  id: string;
  type: 'created' | 'moved' | 'updated' | 'archived' | 'restored' | 'release' | 'inbox' | 'note' | 'decision' | 'launch' | 'focus';
  cardId?: string;
  message: string;
  createdAt: string;
}

export interface RoadmapData {
  version: 5;
  cards: RoadmapCard[];
  releases: RoadmapRelease[];
  settings: RoadmapSettings;
  activity: ActivityEntry[];
  inbox: IdeaInboxNote[];
  notes: WorkspaceNote[];
  decisions: DecisionEntry[];
  launchPlans: LaunchPlan[];
  focusSessions: FocusSessionRecord[];
}

export interface SecurityStatus { configured: boolean; unlocked: boolean; autoLockMinutes: number; }
export interface SecurityActionResult { ok: boolean; error?: string; }
export interface NetworkActionResult { ok: boolean; error?: string; [key: string]: unknown; }

export interface PairedDevice {
  id: string;
  name: string;
  deviceType: string;
  userAgent: string;
  pairedAt: string;
  lastSeen: string;
}

export interface PendingPairing {
  id: string;
  name: string;
  deviceType: string;
  userAgent: string;
  requestedAt: string;
  expiresAt: string;
  status: 'pending';
}

export type MonitorState = 'unknown' | 'online' | 'warning' | 'offline';
export interface ServiceMonitor {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  state: MonitorState;
  statusCode: number;
  latencyMs: number;
  checkedAt: string;
  error: string;
}

export interface NetworkStatus {
  running: boolean;
  port: number;
  addresses: string[];
  primaryUrl: string;
  loopbackUrl: string;
  webhookUrl: string;
  pairedDevices: number;
  devices: PairedDevice[];
  pendingPairings: PendingPairing[];
  monitors: ServiceMonitor[];
  eventsTotal: number;
  eventsUnread: number;
  attachmentsCount: number;
  attachmentBytes: number;
  activeConnections: number;
  liveStreams: number;
  startedAt: string;
  uptimeSeconds: number;
  lastError: string;
  backendLogPath: string;
}

export interface PairingInfo {
  code: string;
  url: string;
  qrDataUrl: string;
  expiresAt: string;
}

export type IncomingSeverity = 'info' | 'warning' | 'high' | 'critical';
export interface IncomingNetworkEvent {
  id: string;
  source: string;
  eventType: string;
  title: string;
  summary: string;
  severity: IncomingSeverity;
  timestamp: string;
  read: boolean;
  archived: boolean;
  metadata: Record<string, unknown>;
  externalUrl: string;
  linkedCardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentRecord {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  ownerType: string;
  ownerId: string;
  source: string;
  storedName: string;
}
export interface AttachmentTarget { type: string; id: string; label: string; }
export interface AttachmentPreview { ok: boolean; dataUrl?: string; }
export interface ChooseAttachmentResult { canceled: boolean; error?: string; attachment?: AttachmentRecord; }
export interface MonitorActionResult extends NetworkActionResult { monitor?: ServiceMonitor; }

export interface DemeRoadmapApi {
  load: (fallback: RoadmapData) => Promise<unknown>;
  save: (data: RoadmapData) => Promise<{ ok: boolean; revision?: number }>;
  exportBackup: (data: RoadmapData) => Promise<{ canceled: boolean; filePath?: string }>;
  importBackup: () => Promise<{ canceled: boolean; data?: unknown }>;
  dataPath: () => Promise<string>;
  revealData: () => Promise<{ ok: boolean }>;
  securityStatus: () => Promise<SecurityStatus>;
  securitySetup: (passcode: string) => Promise<SecurityActionResult>;
  securityVerify: (passcode: string) => Promise<SecurityActionResult>;
  securityLock: () => Promise<SecurityActionResult>;
  securityChange: (currentPasscode: string, nextPasscode: string) => Promise<SecurityActionResult>;
  securitySetAutoLock: (minutes: number) => Promise<SecurityActionResult>;
  setWindowTheme: (theme: ThemePreset) => Promise<{ ok: boolean }>;

  networkStatus: () => Promise<NetworkStatus>;
  networkRestart: () => Promise<NetworkActionResult>;
  networkCreatePairing: () => Promise<PairingInfo>;
  networkPendingPairings: () => Promise<PendingPairing[]>;
  networkApprovePairing: (requestId: string) => Promise<NetworkActionResult>;
  networkRejectPairing: (requestId: string) => Promise<NetworkActionResult>;
  networkDevices: () => Promise<PairedDevice[]>;
  networkRevokeDevice: (deviceId: string) => Promise<NetworkActionResult>;
  networkRevokeAllDevices: () => Promise<NetworkActionResult>;
  networkWebhookSecret: () => Promise<{ secret: string }>;
  networkRegenerateWebhook: () => Promise<NetworkActionResult & { webhookSecret?: string }>;
  networkSendTestEvent: () => Promise<NetworkActionResult>;
  networkEvents: () => Promise<IncomingNetworkEvent[]>;
  networkUpdateEvent: (eventId: string, patch: Partial<Pick<IncomingNetworkEvent, 'read' | 'archived'>>) => Promise<NetworkActionResult>;
  networkDeleteEvent: (eventId: string) => Promise<NetworkActionResult>;
  networkConvertEvent: (eventId: string, kind: 'bug' | 'work') => Promise<NetworkActionResult & { cardId?: string }>;
  networkAttachments: () => Promise<AttachmentRecord[]>;
  networkAttachmentTargets: () => Promise<AttachmentTarget[]>;
  networkChooseAttachment: (ownerType?: string, ownerId?: string) => Promise<ChooseAttachmentResult>;
  networkAddAttachment: (input: { name: string; mime: string; dataBase64: string; ownerType: string; ownerId: string }) => Promise<{ attachment: AttachmentRecord }>;
  networkDeleteAttachment: (attachmentId: string) => Promise<NetworkActionResult>;
  networkRevealAttachment: (attachmentId: string) => Promise<NetworkActionResult>;
  networkOpenAttachment: (attachmentId: string) => Promise<NetworkActionResult>;
  networkAttachmentPreview: (attachmentId: string) => Promise<AttachmentPreview>;
  networkMonitors: () => Promise<ServiceMonitor[]>;
  networkAddMonitor: (name: string, url: string) => Promise<MonitorActionResult>;
  networkRemoveMonitor: (monitorId: string) => Promise<NetworkActionResult>;
  networkCheckMonitors: () => Promise<ServiceMonitor[]>;
  networkOpenCompanion: () => Promise<NetworkActionResult>;

  onNetworkChanged: (callback: () => void) => () => void;
  onRoadmapExternalChange: (callback: (payload?: { revision?: number }) => void) => () => void;
  onRemoteLock: (callback: () => void) => () => void;
}
