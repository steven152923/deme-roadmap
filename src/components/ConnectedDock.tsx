import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  Archive,
  Bug,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clipboard,
  Cloud,
  Code2,
  Copy,
  ExternalLink,
  File,
  FileImage,
  FilePlus2,
  Files,
  FolderOpen,
  Gauge,
  Github,
  HardDrive,
  Inbox,
  KeyRound,
  Link2,
  LoaderCircle,
  MonitorCog,
  MonitorUp,
  PackageCheck,
  PlayCircle,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCw,
  Server,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Store,
  Trash2,
  Unplug,
  UploadCloud,
  Webhook,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import type {
  AttachmentRecord,
  AttachmentTarget,
  IncomingNetworkEvent,
  IncomingSeverity,
  NetworkStatus,
  PairedDevice,
  PairingInfo,
  PendingPairing,
  ServiceMonitor,
} from '../types';

type Workspace = 'connected' | 'incoming' | 'control' | null;

type Provider = {
  id: string;
  name: string;
  icon: ReactNode;
  description: string;
  capability: string;
};

const EMPTY_STATUS: NetworkStatus = {
  running: false,
  port: 0,
  addresses: [],
  primaryUrl: '',
  loopbackUrl: '',
  webhookUrl: '',
  pairedDevices: 0,
  devices: [],
  pendingPairings: [],
  monitors: [],
  eventsTotal: 0,
  eventsUnread: 0,
  attachmentsCount: 0,
  attachmentBytes: 0,
  activeConnections: 0,
  liveStreams: 0,
  startedAt: '',
  uptimeSeconds: 0,
  lastError: '',
  backendLogPath: '',
};

const PROVIDERS: Provider[] = [
  { id: 'deme-api', name: 'Deme Production API', icon: <Radio size={19} />, description: 'Production health, API status and app-side operational signals.', capability: 'Health checks, deploy context and production incidents.' },
  { id: 'github', name: 'GitHub', icon: <Github size={19} />, description: 'Repository activity and CI signals for Deme.', capability: 'Actions failures, pull requests, releases and deploy commits.' },
  { id: 'render', name: 'Render', icon: <Cloud size={19} />, description: 'Deme server deploy and service health.', capability: 'Deploy states, service incidents, logs and metrics.' },
  { id: 'cloudflare', name: 'Cloudflare', icon: <ShieldCheck size={19} />, description: 'Pages, Workers and edge status.', capability: 'Deploy status, errors and edge availability.' },
  { id: 'qase', name: 'Qase', icon: <CheckCircle2 size={19} />, description: 'QA runs and regression results.', capability: 'Failed tests, run progress and release readiness.' },
  { id: 'sentry', name: 'Sentry', icon: <AlertTriangle size={19} />, description: 'Crash and issue monitoring.', capability: 'New issues, regressions and error spikes.' },
  { id: 'appstore', name: 'App Store / iOS', icon: <Store size={19} />, description: 'Apple release pipeline.', capability: 'Build status, review state and release availability.' },
  { id: 'play', name: 'Google Play / Android', icon: <PlayCircle size={19} />, description: 'Android release pipeline.', capability: 'Track status, rollout state and store release checks.' },
];

function relativeTime(value: string) {
  if (!value) return 'never';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function cleanAgent(agent: string) {
  if (!agent) return 'Unknown device';
  return agent.length > 100 ? `${agent.slice(0, 97)}…` : agent;
}

async function copyText(value: string) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function severityRank(severity: IncomingSeverity) {
  return severity === 'critical' ? 4 : severity === 'high' ? 3 : severity === 'warning' ? 2 : 1;
}

export function ConnectedDock() {
  const api = window.demeRoadmap;
  const [navHost, setNavHost] = useState<Element | null>(null);
  const [mainHost, setMainHost] = useState<Element | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(null);
  const [status, setStatus] = useState<NetworkStatus>(EMPTY_STATUS);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [events, setEvents] = useState<IncomingNetworkEvent[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [targets, setTargets] = useState<AttachmentTarget[]>([]);
  const [monitors, setMonitors] = useState<ServiceMonitor[]>([]);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('general::');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | IncomingSeverity>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [monitorName, setMonitorName] = useState('');
  const [monitorUrl, setMonitorUrl] = useState('');

  useEffect(() => {
    const locate = () => {
      setNavHost(document.querySelector('.v5-nav'));
      setMainHost(document.querySelector('.main-area'));
    };
    locate();
    const timer = window.setInterval(locate, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target.closest('.nav-button') : null;
      if (element && !element.hasAttribute('data-connected-nav')) setWorkspace(null);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const nextStatus = await api.networkStatus();
      setStatus(nextStatus);
      if (!nextStatus.running) {
        setEvents([]);
        setAttachments([]);
        setTargets([]);
        setMonitors([]);
        setWebhookSecret('');
        return;
      }
      const [nextEvents, nextAttachments, nextTargets, nextMonitors, nextWebhook] = await Promise.all([
        api.networkEvents(),
        api.networkAttachments(),
        api.networkAttachmentTargets(),
        api.networkMonitors(),
        api.networkWebhookSecret(),
      ]);
      setEvents(nextEvents);
      setAttachments(nextAttachments);
      setTargets(nextTargets);
      setMonitors(nextMonitors);
      setWebhookSecret(nextWebhook.secret || '');
    } catch (error) {
      setStatus((current) => ({ ...current, running: false, lastError: error instanceof Error ? error.message : 'Connected Workspace is unavailable.' }));
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    refresh();
    const timer = window.setInterval(refresh, workspace ? 3000 : 7000);
    const dispose = api.onNetworkChanged(refresh);
    return () => {
      window.clearInterval(timer);
      dispose?.();
    };
  }, [api, refresh, workspace]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const visibleEvents = useMemo(() => events
    .filter((event) => !event.archived)
    .filter((event) => sourceFilter === 'all' || event.source === sourceFilter)
    .filter((event) => severityFilter === 'all' || event.severity === severityFilter)
    .filter((event) => !unreadOnly || !event.read)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [events, severityFilter, sourceFilter, unreadOnly]);
  const archivedEvents = useMemo(() => events.filter((event) => event.archived), [events]);
  const sources = useMemo(() => Array.from(new Set(events.map((event) => event.source))).sort(), [events]);
  const devices = status.devices || [];
  const pending = status.pendingPairings || [];

  async function runAction(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'That action did not complete.');
    } finally {
      setBusy('');
    }
  }

  async function startPairing() {
    if (!api) return;
    await runAction('pair', async () => {
      const next = await api.networkCreatePairing();
      setPairing(next);
      setMessage('Pairing session ready for 5 minutes.');
      await refresh();
    });
  }

  async function restartBackend() {
    if (!api) return;
    await runAction('restart', async () => {
      const result = await api.networkRestart();
      setMessage(result.ok ? 'Connected Workspace restarted.' : result.error || 'Backend could not restart.');
      setPairing(null);
      await refresh();
    });
  }

  async function approvePairing(request: PendingPairing) {
    if (!api) return;
    await runAction(`approve-${request.id}`, async () => {
      const result = await api.networkApprovePairing(request.id);
      setMessage(result.ok ? `${request.name} approved.` : result.error || 'Could not approve this device.');
      await refresh();
    });
  }

  async function rejectPairing(request: PendingPairing) {
    if (!api) return;
    await runAction(`reject-${request.id}`, async () => {
      const result = await api.networkRejectPairing(request.id);
      setMessage(result.ok ? `${request.name} rejected.` : result.error || 'Could not reject this device.');
      await refresh();
    });
  }

  async function revokeDevice(device: PairedDevice) {
    if (!api || !window.confirm(`Revoke ${device.name}? It will need to pair again.`)) return;
    await runAction(`revoke-${device.id}`, async () => {
      const result = await api.networkRevokeDevice(device.id);
      setMessage(result.ok ? 'Device access revoked.' : result.error || 'Could not revoke device.');
      await refresh();
    });
  }

  async function revokeAll() {
    if (!api || !devices.length || !window.confirm('Revoke every paired device?')) return;
    await runAction('revoke-all', async () => {
      const result = await api.networkRevokeAllDevices();
      setMessage(result.ok ? 'All companion access revoked.' : result.error || 'Could not revoke devices.');
      await refresh();
    });
  }

  async function regenerateWebhook() {
    if (!api || !window.confirm('Regenerate the webhook secret? Anything using the old token will stop working.')) return;
    await runAction('webhook', async () => {
      const result = await api.networkRegenerateWebhook();
      setMessage(result.ok ? 'Webhook secret regenerated.' : result.error || 'Could not regenerate the secret.');
      await refresh();
    });
  }

  async function sendTestEvent() {
    if (!api) return;
    await runAction('test-event', async () => {
      const result = await api.networkSendTestEvent();
      setMessage(result.ok ? 'Test event landed in Incoming.' : result.error || 'Test event failed.');
      await refresh();
    });
  }

  async function updateEvent(event: IncomingNetworkEvent, patch: Partial<Pick<IncomingNetworkEvent, 'read' | 'archived'>>) {
    if (!api) return;
    const result = await api.networkUpdateEvent(event.id, patch);
    if (!result.ok) setMessage(result.error || 'Could not update event.');
    await refresh();
  }

  async function convertEvent(event: IncomingNetworkEvent, kind: 'bug' | 'work') {
    if (!api) return;
    await runAction(`convert-${event.id}-${kind}`, async () => {
      const result = await api.networkConvertEvent(event.id, kind);
      setMessage(result.ok ? `${kind === 'bug' ? 'Bug' : 'Work item'} created and linked.` : result.error || 'Could not create roadmap item.');
      await refresh();
    });
  }

  async function deleteEvent(event: IncomingNetworkEvent) {
    if (!api || !window.confirm(`Delete “${event.title}”?`)) return;
    const result = await api.networkDeleteEvent(event.id);
    if (!result.ok) setMessage(result.error || 'Could not delete event.');
    await refresh();
  }

  function selectedAttachmentTarget() {
    const separator = selectedTarget.indexOf('::');
    if (separator < 0) return { ownerType: 'general', ownerId: '' };
    return { ownerType: selectedTarget.slice(0, separator) || 'general', ownerId: selectedTarget.slice(separator + 2) };
  }

  async function chooseAttachment() {
    if (!api) return;
    await runAction('attachment', async () => {
      const target = selectedAttachmentTarget();
      const result = await api.networkChooseAttachment(target.ownerType, target.ownerId);
      if (result.error) setMessage(result.error);
      else if (!result.canceled) setMessage('Attachment saved locally.');
      await refresh();
    });
  }

  async function uploadDroppedFile(file: globalThis.File) {
    if (!api) return;
    if (file.size > 20 * 1024 * 1024) {
      setMessage('Attachments are limited to 20 MB.');
      return;
    }
    await runAction('drop', async () => {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsDataURL(file);
      });
      const target = selectedAttachmentTarget();
      await api.networkAddAttachment({ name: file.name, mime: file.type || 'application/octet-stream', dataBase64, ownerType: target.ownerType, ownerId: target.ownerId });
      setMessage('Attachment dropped into Roadmap.');
      await refresh();
    });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) uploadDroppedFile(file);
  }

  async function addMonitor() {
    if (!api || !monitorUrl.trim()) return;
    await runAction('monitor-add', async () => {
      const result = await api.networkAddMonitor(monitorName.trim(), monitorUrl.trim());
      if (!result.ok) setMessage(result.error || 'Could not add monitor.');
      else {
        setMonitorName('');
        setMonitorUrl('');
        setMessage('Local health check added.');
      }
      await refresh();
    });
  }

  async function checkMonitors() {
    if (!api) return;
    await runAction('monitor-check', async () => {
      const next = await api.networkCheckMonitors();
      setMonitors(next);
      setMessage('Health checks refreshed.');
      await refresh();
    });
  }

  if (!api || !navHost || !mainHost) return null;

  const nav = createPortal(
    <>
      <div className="nav-section-label connected-nav-label">Connect</div>
      <button data-connected-nav className={`nav-button ${workspace === 'connected' ? 'active' : ''}`} type="button" onClick={() => setWorkspace('connected')}>
        <Wifi size={18} /><span>Connected</span>{!status.running ? <small>!</small> : undefined}
      </button>
      <button data-connected-nav className={`nav-button ${workspace === 'incoming' ? 'active' : ''}`} type="button" onClick={() => setWorkspace('incoming')}>
        <Inbox size={18} /><span>Incoming</span>{status.eventsUnread > 0 ? <small>{status.eventsUnread}</small> : undefined}
      </button>
      <button data-connected-nav className={`nav-button ${workspace === 'control' ? 'active' : ''}`} type="button" onClick={() => setWorkspace('control')}>
        <MonitorUp size={18} /><span>Control Room</span>
      </button>
    </>,
    navHost,
  );

  const page = workspace ? createPortal(
    <div className="connected-workspace-layer">
      <WorkspaceHeader
        workspace={workspace}
        status={status}
        onRefresh={refresh}
        onRestart={restartBackend}
        busy={busy}
      />
      <div className="connected-workspace-scroll">
        {workspace === 'connected' ? (
          <ConnectedPage
            api={api}
            status={status}
            pairing={pairing}
            pending={pending}
            devices={devices}
            attachments={attachments}
            targets={targets}
            webhookSecret={webhookSecret}
            selectedTarget={selectedTarget}
            setSelectedTarget={setSelectedTarget}
            busy={busy}
            onPair={startPairing}
            onApprove={approvePairing}
            onReject={rejectPairing}
            onRevoke={revokeDevice}
            onRevokeAll={revokeAll}
            onCopyMessage={setMessage}
            onRegenerateWebhook={regenerateWebhook}
            onTestEvent={sendTestEvent}
            onChooseAttachment={chooseAttachment}
            onDrop={handleDrop}
            onRefresh={refresh}
          />
        ) : workspace === 'incoming' ? (
          <IncomingPage
            events={visibleEvents}
            archivedEvents={archivedEvents}
            sources={sources}
            sourceFilter={sourceFilter}
            severityFilter={severityFilter}
            unreadOnly={unreadOnly}
            setSourceFilter={setSourceFilter}
            setSeverityFilter={setSeverityFilter}
            setUnreadOnly={setUnreadOnly}
            onUpdate={updateEvent}
            onConvert={convertEvent}
            onDelete={deleteEvent}
            busy={busy}
          />
        ) : (
          <ControlRoomPage
            api={api}
            status={status}
            monitors={monitors}
            monitorName={monitorName}
            monitorUrl={monitorUrl}
            setMonitorName={setMonitorName}
            setMonitorUrl={setMonitorUrl}
            onAddMonitor={addMonitor}
            onCheckMonitors={checkMonitors}
            onMessage={setMessage}
            onRefresh={refresh}
            busy={busy}
          />
        )}
      </div>
      {message && <div className="connected-toast"><CircleDot size={13} />{message}</div>}
    </div>,
    mainHost,
  ) : null;

  return <>{nav}{page}</>;
}

function WorkspaceHeader({ workspace, status, onRefresh, onRestart, busy }: { workspace: Exclude<Workspace, null>; status: NetworkStatus; onRefresh: () => void; onRestart: () => void; busy: string }) {
  const copy = workspace === 'connected'
    ? { eyebrow: 'Connected Workspace', title: 'Your Roadmap, now on the room-scale internet ✦', detail: 'Local-first stays local. Your PC is still the source of truth.' }
    : workspace === 'incoming'
      ? { eyebrow: 'Machine inbox', title: 'Incoming', detail: 'System events land here without getting mixed into Idea Inbox.' }
      : { eyebrow: 'Production foundation', title: 'Control Room', detail: 'One calm place for local health now and real production integrations later.' };
  return (
    <header className="connected-page-header">
      <div className="connected-header-copy">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.detail}</p>
      </div>
      <div className="connected-header-actions">
        <span className={`connected-backend-pill ${status.running ? 'online' : 'offline'}`}><i />{status.running ? 'Backend online' : 'Backend unavailable'}</span>
        <button className="connected-mini-button" type="button" onClick={onRefresh}><RefreshCw size={14} />Refresh</button>
        {workspace === 'connected' && <button className="connected-mini-button" type="button" disabled={busy === 'restart'} onClick={onRestart}>{busy === 'restart' ? <LoaderCircle className="spin" size={14} /> : <RotateCw size={14} />}Restart backend</button>}
      </div>
    </header>
  );
}

function ConnectedPage(props: {
  api: NonNullable<Window['demeRoadmap']>;
  status: NetworkStatus;
  pairing: PairingInfo | null;
  pending: PendingPairing[];
  devices: PairedDevice[];
  attachments: AttachmentRecord[];
  targets: AttachmentTarget[];
  webhookSecret: string;
  selectedTarget: string;
  setSelectedTarget: (value: string) => void;
  busy: string;
  onPair: () => void;
  onApprove: (request: PendingPairing) => void;
  onReject: (request: PendingPairing) => void;
  onRevoke: (device: PairedDevice) => void;
  onRevokeAll: () => void;
  onCopyMessage: (message: string) => void;
  onRegenerateWebhook: () => void;
  onTestEvent: () => void;
  onChooseAttachment: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRefresh: () => void;
}) {
  const { api, status, pairing, pending, devices, attachments, targets, webhookSecret, selectedTarget, setSelectedTarget, busy, onPair, onApprove, onReject, onRevoke, onRevokeAll, onCopyMessage, onRegenerateWebhook, onTestEvent, onChooseAttachment, onDrop, onRefresh } = props;
  const recentDevices = [...devices].sort((a, b) => new Date(b.lastSeen || b.pairedAt).getTime() - new Date(a.lastSeen || a.pairedAt).getTime()).slice(0, 4);
  const isOnline = status.running;
  return (
    <div className="connected-page-grid">
      <section className="connected-card connected-status-card span-2">
        <div className="connected-card-head">
          <div className="connected-card-icon"><Server size={20} /></div>
          <div><span className="eyebrow">Local network backend</span><h2>{isOnline ? 'Roadmap is broadcasting safely inside your LAN' : 'Desktop still works, Connected does not'}</h2></div>
          <span className={`connected-health-dot ${isOnline ? 'good' : 'bad'}`}>{isOnline ? <Check size={14} /> : <XCircle size={14} />}{isOnline ? 'Running' : 'Stopped'}</span>
        </div>
        <div className="connected-metrics">
          <Metric label="LAN address" value={status.addresses[0] ? `${status.addresses[0]}:${status.port}` : status.loopbackUrl || 'Unavailable'} />
          <Metric label="Uptime" value={formatDuration(status.uptimeSeconds)} />
          <Metric label="Paired devices" value={String(status.pairedDevices)} />
          <Metric label="Active connections" value={String(status.activeConnections)} />
          <Metric label="Live updates" value={String(status.liveStreams)} />
          <Metric label="Attachments" value={`${status.attachmentsCount} · ${formatBytes(status.attachmentBytes)}`} />
        </div>
        {status.lastError && <div className="connected-alert danger"><AlertTriangle size={16} /><div><strong>Backend diagnostic</strong><span>{status.lastError}</span></div></div>}
        {!status.addresses.length && isOnline && <div className="connected-alert"><ShieldOff size={16} /><div><strong>Localhost works, LAN address was not detected</strong><span>Check that the PC is on Wi-Fi/Ethernet and allow Deme Roadmap through Windows Firewall on private networks. Roadmap does not modify firewall rules for you.</span></div></div>}
      </section>

      <section className="connected-card span-2">
        <div className="connected-card-head">
          <div className="connected-card-icon candy"><Smartphone size={20} /></div>
          <div><span className="eyebrow">Phone / tablet companion</span><h2>Pair deliberately, never by accident</h2></div>
          <button className="connected-primary" type="button" disabled={!isOnline || busy === 'pair'} onClick={onPair}>{busy === 'pair' ? <LoaderCircle className="spin" size={15} /> : <QrCode size={15} />}Pair device</button>
        </div>
        <p className="connected-card-copy">A code only creates an approval request. The device receives its real token after you approve it on this PC.</p>
        <div className="connected-url-box">
          <div><small>Companion URL</small><code>{status.primaryUrl || status.loopbackUrl || 'Backend offline'}</code></div>
          <button type="button" disabled={!status.primaryUrl && !status.loopbackUrl} onClick={async () => onCopyMessage(await copyText(status.primaryUrl || status.loopbackUrl) ? 'Companion URL copied.' : 'Could not copy URL.')}><Copy size={14} /></button>
          <button type="button" disabled={!isOnline} onClick={() => api.networkOpenCompanion()}><ExternalLink size={14} />Open</button>
        </div>
        {pairing && <div className="pairing-panel">
          <div className="pairing-qr">{pairing.qrDataUrl ? <img src={pairing.qrDataUrl} alt="Pairing QR code" /> : <QrCode size={68} />}</div>
          <div className="pairing-details"><span className="eyebrow">Manual pairing code</span><strong>{pairing.code}</strong><p>Expires {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Scan the QR or open the companion URL, then approve the request below.</p><button className="connected-text-button" type="button" onClick={async () => onCopyMessage(await copyText(pairing.url) ? 'Pairing link copied.' : 'Could not copy link.')}><Copy size={13} />Copy pairing link</button></div>
        </div>}
      </section>

      {pending.length > 0 && <section className="connected-card pending-card span-2">
        <div className="connected-card-head"><div className="connected-card-icon warm"><KeyRound size={20} /></div><div><span className="eyebrow">Approval needed</span><h2>{pending.length} device {pending.length === 1 ? 'is' : 'are'} knocking</h2></div></div>
        <div className="connected-list">
          {pending.map((request) => <div className="connected-list-row pending" key={request.id}>
            <div className="connected-list-icon"><Smartphone size={16} /></div>
            <div className="connected-list-copy"><strong>{request.name}</strong><span>{request.deviceType || 'device'} · {cleanAgent(request.userAgent)}</span><small>Requested {relativeTime(request.requestedAt)} · expires {new Date(request.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
            <div className="connected-row-actions"><button className="good" type="button" disabled={busy.includes(request.id)} onClick={() => onApprove(request)}><Check size={14} />Approve</button><button className="danger" type="button" disabled={busy.includes(request.id)} onClick={() => onReject(request)}><XCircle size={14} />Reject</button></div>
          </div>)}
        </div>
      </section>}

      <section className="connected-card">
        <div className="connected-card-head"><div className="connected-card-icon mint"><ShieldCheck size={19} /></div><div><span className="eyebrow">Paired devices</span><h2>{devices.length ? `${devices.length} trusted` : 'No devices yet'}</h2></div>{devices.length > 1 && <button className="connected-icon-button danger" type="button" onClick={onRevokeAll} title="Revoke all"><Unplug size={15} /></button>}</div>
        <div className="connected-list compact">
          {devices.map((device) => <div className="connected-list-row" key={device.id}><div className="connected-list-icon"><Smartphone size={15} /></div><div className="connected-list-copy"><strong>{device.name}</strong><span>{device.deviceType || cleanAgent(device.userAgent)}</span><small>Paired {new Date(device.pairedAt).toLocaleDateString()} · seen {relativeTime(device.lastSeen)}</small></div><button className="connected-icon-button danger" type="button" onClick={() => onRevoke(device)} title="Revoke"><Trash2 size={14} /></button></div>)}
          {!devices.length && <EmptyMini icon={<Smartphone size={22} />} text="Pair a phone or tablet when you need it. Nothing on the Wi-Fi gets access automatically." />}
        </div>
      </section>

      <section className="connected-card">
        <div className="connected-card-head"><div className="connected-card-icon blue"><Activity size={19} /></div><div><span className="eyebrow">Recent companion activity</span><h2>Who has been around</h2></div></div>
        <div className="activity-stack">
          {pending.slice(0, 2).map((request) => <ActivityLine key={request.id} icon={<KeyRound size={14} />} title={`${request.name} requested pairing`} meta={relativeTime(request.requestedAt)} />)}
          {recentDevices.map((device) => <ActivityLine key={device.id} icon={<Smartphone size={14} />} title={device.name} meta={device.lastSeen ? `seen ${relativeTime(device.lastSeen)}` : 'not used yet'} />)}
          {!pending.length && !recentDevices.length && <EmptyMini icon={<Activity size={22} />} text="Companion activity will appear here after the first pairing." />}
        </div>
      </section>

      <section className="connected-card span-2">
        <div className="connected-card-head"><div className="connected-card-icon peach"><Webhook size={19} /></div><div><span className="eyebrow">Incoming event API</span><h2>Authenticated LAN webhook</h2></div><button className="connected-mini-button" type="button" disabled={!isOnline || busy === 'test-event'} onClick={onTestEvent}><PlayCircle size={14} />Send test event</button></div>
        <p className="connected-card-copy">Post JSON to the endpoint with <code>Authorization: Bearer &lt;secret&gt;</code> or <code>x-deme-webhook-token</code>. Public GitHub/Render webhooks cannot reach a private LAN address without a future bridge, which is intentional in 0.6.</p>
        <div className="webhook-grid">
          <SecretRow label="Endpoint" value={status.webhookUrl || 'Backend offline'} onCopy={async () => onCopyMessage(await copyText(status.webhookUrl) ? 'Webhook endpoint copied.' : 'Could not copy endpoint.')} />
          <SecretRow label="Secret" value={webhookSecret || 'Unavailable'} secret onCopy={async () => onCopyMessage(await copyText(webhookSecret) ? 'Webhook secret copied.' : 'Could not copy secret.')} />
        </div>
        <div className="connected-actions"><button className="connected-text-button danger" type="button" disabled={!isOnline || busy === 'webhook'} onClick={onRegenerateWebhook}><RotateCw size={14} />Regenerate secret</button></div>
      </section>

      <section className="connected-card span-2">
        <div className="connected-card-head"><div className="connected-card-icon lilac"><Files size={19} /></div><div><span className="eyebrow">Attachments</span><h2>Evidence lives with the workspace</h2></div><span className="connected-health-dot neutral"><HardDrive size={13} />{formatBytes(status.attachmentBytes)}</span></div>
        <div className="attachment-toolbar"><label>Attach to<select value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value)}><option value="general::">General workspace</option>{targets.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}::${target.id}`}>{target.label}</option>)}</select></label><button className="connected-primary" type="button" disabled={busy === 'attachment'} onClick={onChooseAttachment}><FilePlus2 size={15} />Add attachment</button></div>
        <div className="attachment-drop" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><UploadCloud size={22} /><div><strong>Drop a screenshot, PDF, video or log here</strong><span>Maximum 20 MB · safe generated filenames are used on disk</span></div></div>
        <div className="attachment-grid">
          {attachments.slice(0, 30).map((attachment) => <AttachmentTile key={attachment.id} attachment={attachment} api={api} onRefresh={onRefresh} onMessage={onCopyMessage} />)}
          {!attachments.length && <EmptyMini icon={<Files size={24} />} text="No attachments yet. Add screenshots or logs without scattering them around the desktop." />}
        </div>
      </section>

      <section className="connected-card span-2 firewall-card">
        <div className="connected-card-head"><div className="connected-card-icon blue"><Wifi size={19} /></div><div><span className="eyebrow">If your phone cannot connect</span><h2>Windows Firewall may need a private-network allowance</h2></div></div>
        <div className="firewall-steps"><span>1</span><p>Confirm the backend says <strong>Running</strong> and localhost opens on this PC.</p><span>2</span><p>Put the phone and PC on the same Wi-Fi, not a guest network with device isolation.</p><span>3</span><p>If Windows asks for network access, allow Deme Roadmap on <strong>Private networks</strong>. Roadmap never runs PowerShell or changes firewall rules itself.</p></div>
        {status.backendLogPath && <small>Backend diagnostics: {status.backendLogPath}</small>}
      </section>
    </div>
  );
}

function IncomingPage(props: {
  events: IncomingNetworkEvent[];
  archivedEvents: IncomingNetworkEvent[];
  sources: string[];
  sourceFilter: string;
  severityFilter: 'all' | IncomingSeverity;
  unreadOnly: boolean;
  setSourceFilter: (value: string) => void;
  setSeverityFilter: (value: 'all' | IncomingSeverity) => void;
  setUnreadOnly: (value: boolean) => void;
  onUpdate: (event: IncomingNetworkEvent, patch: Partial<Pick<IncomingNetworkEvent, 'read' | 'archived'>>) => void;
  onConvert: (event: IncomingNetworkEvent, kind: 'bug' | 'work') => void;
  onDelete: (event: IncomingNetworkEvent) => void;
  busy: string;
}) {
  const { events, archivedEvents, sources, sourceFilter, severityFilter, unreadOnly, setSourceFilter, setSeverityFilter, setUnreadOnly, onUpdate, onConvert, onDelete, busy } = props;
  return (
    <div className="incoming-layout">
      <section className="connected-card incoming-toolbar">
        <div className="incoming-toolbar-copy"><span className="eyebrow">Event inbox</span><h2>{events.filter((event) => !event.read).length} unread in this view</h2></div>
        <div className="incoming-filters">
          <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as 'all' | IncomingSeverity)}><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="warning">Warning</option><option value="info">Info</option></select>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">All sources</option>{sources.map((source) => <option key={source} value={source}>{source}</option>)}</select>
          <label className="incoming-check"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />Unread only</label>
        </div>
      </section>
      <div className="incoming-feed">
        {events.map((event) => <article className={`incoming-event-card severity-${event.severity} ${event.read ? 'is-read' : ''}`} key={event.id}>
          <div className="incoming-event-rail"><span>{event.severity}</span></div>
          <div className="incoming-event-body">
            <div className="incoming-event-meta"><span>{event.source}</span><ChevronRight size={12} /><span>{event.eventType}</span><span>{new Date(event.timestamp).toLocaleString()}</span>{!event.read && <b>NEW</b>}</div>
            <h2>{event.title}</h2>
            {event.summary && <p>{event.summary}</p>}
            {Object.keys(event.metadata || {}).length > 0 && <details><summary>Metadata</summary><pre>{JSON.stringify(event.metadata, null, 2)}</pre></details>}
            {event.linkedCardId && <div className="event-linked"><Link2 size={13} />Linked to roadmap item <code>{event.linkedCardId}</code></div>}
            <div className="incoming-event-actions">
              <button type="button" onClick={() => onUpdate(event, { read: !event.read })}>{event.read ? <CircleDot size={14} /> : <Check size={14} />}{event.read ? 'Mark unread' : 'Mark read'}</button>
              {!event.linkedCardId && <button type="button" disabled={busy.includes(event.id)} onClick={() => onConvert(event, 'bug')}><Bug size={14} />Create bug</button>}
              {!event.linkedCardId && <button type="button" disabled={busy.includes(event.id)} onClick={() => onConvert(event, 'work')}><Plus size={14} />Create work item</button>}
              {event.externalUrl && <button type="button" onClick={() => window.open(event.externalUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={14} />Open source</button>}
              <button type="button" onClick={() => onUpdate(event, { archived: true })}><Archive size={14} />Archive</button>
              <button className="danger" type="button" onClick={() => onDelete(event)}><Trash2 size={14} />Delete</button>
            </div>
          </div>
        </article>)}
        {!events.length && <div className="incoming-empty"><Inbox size={34} /><h2>Nothing is shouting at you ✦</h2><p>Send a test event from Connected, or post an authenticated event to the local webhook endpoint.</p></div>}
      </div>
      {archivedEvents.length > 0 && <details className="connected-card archived-events"><summary>{archivedEvents.length} archived event{archivedEvents.length === 1 ? '' : 's'}</summary><div className="connected-list compact">{archivedEvents.slice(0, 30).map((event) => <div className="connected-list-row" key={event.id}><div className="connected-list-icon"><Archive size={14} /></div><div className="connected-list-copy"><strong>{event.title}</strong><small>{event.source} · {relativeTime(event.timestamp)}</small></div><button className="connected-icon-button" type="button" onClick={() => onUpdate(event, { archived: false })} title="Restore"><RotateCw size={14} /></button></div>)}</div></details>}
    </div>
  );
}

function ControlRoomPage(props: {
  api: NonNullable<Window['demeRoadmap']>;
  status: NetworkStatus;
  monitors: ServiceMonitor[];
  monitorName: string;
  monitorUrl: string;
  setMonitorName: (value: string) => void;
  setMonitorUrl: (value: string) => void;
  onAddMonitor: () => void;
  onCheckMonitors: () => void;
  onMessage: (message: string) => void;
  onRefresh: () => void;
  busy: string;
}) {
  const { api, status, monitors, monitorName, monitorUrl, setMonitorName, setMonitorUrl, onAddMonitor, onCheckMonitors, onMessage, onRefresh, busy } = props;
  return (
    <div className="control-room-grid">
      <section className="control-hero connected-card span-2">
        <div className="connected-card-head"><div className="connected-card-icon mint"><MonitorCog size={20} /></div><div><span className="eyebrow">Foundation first</span><h2>No pretend dashboards</h2></div></div>
        <p>0.6 gives Control Room a real provider architecture and a live local-backend card. External providers stay visibly disconnected until a real credentialed integration is added in a later release.</p>
      </section>

      <section className="connected-card span-2 backend-health-card">
        <div className="connected-card-head"><div className="connected-card-icon blue"><Server size={20} /></div><div><span className="eyebrow">Connected Workspace backend</span><h2>{status.running ? 'Healthy on this PC' : 'Unavailable'}</h2></div><span className={`connected-health-dot ${status.running ? 'good' : 'bad'}`}><i />{status.running ? 'Live' : 'Offline'}</span></div>
        <div className="connected-metrics wide"><Metric label="Address" value={status.addresses[0] ? `${status.addresses[0]}:${status.port}` : status.loopbackUrl || '—'} /><Metric label="Uptime" value={formatDuration(status.uptimeSeconds)} /><Metric label="Devices" value={String(status.pairedDevices)} /><Metric label="Connections" value={String(status.activeConnections)} /><Metric label="Events" value={`${status.eventsTotal} · ${status.eventsUnread} unread`} /><Metric label="Storage" value={formatBytes(status.attachmentBytes)} /></div>
      </section>

      <div className="provider-grid span-2">
        {PROVIDERS.map((provider) => <article className="provider-card" key={provider.id}><div className="provider-card-top"><div className="provider-icon">{provider.icon}</div><span className="provider-state"><i />Not connected</span></div><h3>{provider.name}</h3><p>{provider.description}</p><small>{provider.capability}</small><button type="button" onClick={() => onMessage(`${provider.name} is a connection shell in 0.6. No fake live data or credentials were created.`)}><MonitorCog size={14} />Setup / config</button></article>)}
      </div>

      <section className="connected-card span-2">
        <div className="connected-card-head"><div className="connected-card-icon lilac"><Gauge size={19} /></div><div><span className="eyebrow">Optional URL checks</span><h2>Simple local health monitors</h2></div><button className="connected-mini-button" type="button" disabled={busy === 'monitor-check'} onClick={onCheckMonitors}><RefreshCw size={14} />Check now</button></div>
        <p className="connected-card-copy">These are real HTTP checks run by your desktop. They are not treated as official Render/GitHub integrations.</p>
        <div className="monitor-form"><input value={monitorName} onChange={(event) => setMonitorName(event.target.value)} placeholder="Label, e.g. Deme API" /><input value={monitorUrl} onChange={(event) => setMonitorUrl(event.target.value)} placeholder="https://api.example.com/health" /><button className="connected-primary" type="button" disabled={!monitorUrl.trim() || busy === 'monitor-add'} onClick={onAddMonitor}><Plus size={14} />Add check</button></div>
        <div className="monitor-list">
          {monitors.map((monitor) => <div className="monitor-row" key={monitor.id}><span className={`monitor-state ${monitor.state}`}><i /></span><div><strong>{monitor.name}</strong><small>{monitor.url}</small></div><div className="monitor-result"><strong>{monitor.state}</strong><small>{monitor.checkedAt ? `${monitor.statusCode || '—'} · ${monitor.latencyMs} ms · ${relativeTime(monitor.checkedAt)}` : 'Not checked yet'}</small></div><button className="connected-icon-button danger" type="button" onClick={async () => { const result = await api.networkRemoveMonitor(monitor.id); onMessage(result.ok ? 'Health check removed.' : result.error || 'Could not remove check.'); onRefresh(); }}><Trash2 size={14} /></button></div>)}
          {!monitors.length && <EmptyMini icon={<Gauge size={23} />} text="No URL checks configured. Add one only when it represents something real you want Roadmap to ping." />}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="connected-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ActivityLine({ icon, title, meta }: { icon: ReactNode; title: string; meta: string }) {
  return <div className="activity-line"><span>{icon}</span><div><strong>{title}</strong><small>{meta}</small></div></div>;
}

function EmptyMini({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="connected-empty-mini">{icon}<span>{text}</span></div>;
}

function SecretRow({ label, value, onCopy, secret = false }: { label: string; value: string; onCopy: () => void; secret?: boolean }) {
  return <div className="secret-row"><div><small>{label}</small><code>{secret && value !== 'Unavailable' ? `${value.slice(0, 8)}••••••••••••${value.slice(-6)}` : value}</code></div><button type="button" onClick={onCopy}><Copy size={14} />Copy</button></div>;
}

function AttachmentTile({ attachment, api, onRefresh, onMessage }: { attachment: AttachmentRecord; api: NonNullable<Window['demeRoadmap']>; onRefresh: () => void; onMessage: (message: string) => void }) {
  const [preview, setPreview] = useState('');
  const isImage = attachment.mimeType.startsWith('image/');
  useEffect(() => {
    let active = true;
    if (isImage) api.networkAttachmentPreview(attachment.id).then((result) => { if (active && result.ok && result.dataUrl) setPreview(result.dataUrl); }).catch(() => undefined);
    return () => { active = false; };
  }, [api, attachment.id, isImage]);
  return <article className="attachment-tile"><div className="attachment-preview">{preview ? <img src={preview} alt="" /> : isImage ? <FileImage size={24} /> : <File size={24} />}</div><div className="attachment-info"><strong title={attachment.fileName}>{attachment.fileName}</strong><small>{formatBytes(attachment.size)} · {attachment.ownerType}{attachment.ownerId ? ' linked' : ''}</small><span>{relativeTime(attachment.createdAt)}</span></div><div className="attachment-actions"><button type="button" title="Open" onClick={() => api.networkOpenAttachment(attachment.id)}><ExternalLink size={13} /></button><button type="button" title="Reveal file" onClick={() => api.networkRevealAttachment(attachment.id)}><FolderOpen size={13} /></button><button className="danger" type="button" title="Remove" onClick={async () => { if (!window.confirm(`Remove ${attachment.fileName}?`)) return; const result = await api.networkDeleteAttachment(attachment.id); onMessage(result.ok ? 'Attachment removed.' : result.error || 'Could not remove attachment.'); onRefresh(); }}><Trash2 size={13} /></button></div></article>;
}
