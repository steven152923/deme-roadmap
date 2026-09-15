import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  BookOpen,
  Brain,
  Bug,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Code2,
  Columns3,
  Copy,
  ExternalLink,
  Gauge,
  HardDrive,
  Inbox,
  LayoutDashboard,
  Link2,
  List,
  LockKeyhole,
  Map as MapIcon,
  MonitorUp,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Rocket,
  RotateCw,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  Trash2,
  Unplug,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { APP_VERSION } from '../appVersion';
import { DEFAULT_ROADMAP, normaliseRoadmap } from '../data';
import type { IncomingNetworkEvent, IncomingSeverity, NetworkStatus, PairingInfo, PendingPairing, RoadmapData, ServiceMonitor } from '../types';

type Section = 'overview' | 'work' | 'signals' | 'systems' | 'settings';
type WorkTool = 'board' | 'qa' | 'calendar' | 'inbox' | 'notes' | 'decisions' | 'launch' | 'timeline' | 'list' | 'archive';

type QAPlatformSummary = { passed: number; failed: number; blocked: number; untested: number; total: number };
type QASummary = { ios: QAPlatformSummary; android: QAPlatformSummary };

const EMPTY_STATUS: NetworkStatus = {
  running: false, port: 0, addresses: [], primaryUrl: '', loopbackUrl: '', webhookUrl: '', pairedDevices: 0, devices: [], pendingPairings: [], monitors: [],
  eventsTotal: 0, eventsUnread: 0, attachmentsCount: 0, attachmentBytes: 0, activeConnections: 0, liveStreams: 0, startedAt: '', uptimeSeconds: 0, lastError: '', backendLogPath: '',
};

const WORK_TOOLS: { id: WorkTool; label: string; detail: string; icon: ReactNode; legacy: string }[] = [
  { id: 'board', label: 'Delivery', detail: 'Release board', icon: <Columns3 size={17} />, legacy: 'Release board' },
  { id: 'qa', label: 'Quality', detail: 'QA test runs', icon: <ClipboardCheck size={17} />, legacy: 'QA test runs' },
  { id: 'calendar', label: 'Schedule', detail: 'Calendar', icon: <CalendarDays size={17} />, legacy: 'Calendar' },
  { id: 'inbox', label: 'Ideas', detail: 'Idea inbox', icon: <Inbox size={17} />, legacy: 'Idea inbox' },
  { id: 'notes', label: 'Knowledge', detail: 'Notes', icon: <BookOpen size={17} />, legacy: 'Notes' },
  { id: 'decisions', label: 'Decisions', detail: 'Decision log', icon: <Brain size={17} />, legacy: 'Decision log' },
  { id: 'launch', label: 'Ship', detail: 'Launch center', icon: <Rocket size={17} />, legacy: 'Launch center' },
  { id: 'timeline', label: 'Plan', detail: 'Roadmap timeline', icon: <MapIcon size={17} />, legacy: 'Roadmap' },
  { id: 'list', label: 'All work', detail: 'List view', icon: <List size={17} />, legacy: 'All items' },
  { id: 'archive', label: 'Archive', detail: 'Completed history', icon: <Archive size={17} />, legacy: 'Archive' },
];

const PROVIDERS = [
  ['Deme Production API', <Radio size={18} />, 'App health and operational signals'],
  ['GitHub', <Code2 size={18} />, 'CI, pull requests and releases'],
  ['Render', <Cloud size={18} />, 'Deploys, logs and service health'],
  ['Cloudflare', <ShieldCheck size={18} />, 'Pages, Workers and edge availability'],
  ['Qase', <CheckCircle2 size={18} />, 'QA run progress and failures'],
  ['Sentry', <AlertTriangle size={18} />, 'Crashes and regressions'],
  ['App Store / iOS', <Store size={18} />, 'Build review and release state'],
  ['Google Play / Android', <Store size={18} />, 'Track and rollout state'],
] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function relativeTime(value: string) {
  if (!value) return 'never';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
function qaSummary(): QASummary {
  const blank = (): QAPlatformSummary => ({ passed: 0, failed: 0, blocked: 0, untested: 0, total: 0 });
  const result: QASummary = { ios: blank(), android: blank() };
  try {
    const raw = JSON.parse(window.localStorage.getItem('deme-roadmap.qa-workspace.v1') || '{}') as { runs?: Record<string, { results?: Record<string, { status?: string }> }> };
    (['ios', 'android'] as const).forEach((platform) => {
      const values = Object.values(raw.runs?.[platform]?.results || {});
      result[platform].total = values.length;
      for (const value of values) {
        const status = value.status || 'untested';
        if (status === 'passed') result[platform].passed += 1;
        else if (status === 'failed') result[platform].failed += 1;
        else if (status === 'blocked') result[platform].blocked += 1;
        else result[platform].untested += 1;
      }
    });
  } catch { /* optional */ }
  return result;
}

export function OpsShell() {
  const api = window.demeRoadmap;
  const [section, setSection] = useState<Section>('overview');
  const [workTool, setWorkTool] = useState<WorkTool>('board');
  const [data, setData] = useState<RoadmapData>(DEFAULT_ROADMAP);
  const [status, setStatus] = useState<NetworkStatus>(EMPTY_STATUS);
  const [events, setEvents] = useState<IncomingNetworkEvent[]>([]);
  const [monitors, setMonitors] = useState<ServiceMonitor[]>([]);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [message, setMessage] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | IncomingSeverity>('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [monitorName, setMonitorName] = useState('');
  const [monitorUrl, setMonitorUrl] = useState('');
  const [qa, setQa] = useState<QASummary>(() => qaSummary());

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const raw = await api.load(DEFAULT_ROADMAP);
      setData(normaliseRoadmap(raw));
      setQa(qaSummary());
      const nextStatus = await api.networkStatus();
      setStatus(nextStatus);
      if (nextStatus.running) {
        const [nextEvents, nextMonitors, secret] = await Promise.all([api.networkEvents(), api.networkMonitors(), api.networkWebhookSecret()]);
        setEvents(nextEvents); setMonitors(nextMonitors); setWebhookSecret(secret.secret || '');
      }
    } catch { /* desktop app owns the error surface */ }
  }, [api]);

  useEffect(() => {
    document.title = `Deme Ops ${APP_VERSION}`;
    document.documentElement.dataset.opsSection = section;
    refresh();
    const timer = window.setInterval(refresh, section === 'overview' || section === 'signals' || section === 'systems' ? 3500 : 9000);
    const dispose = api?.onNetworkChanged(refresh);
    return () => { window.clearInterval(timer); dispose?.(); };
  }, [api, refresh, section]);

  useEffect(() => {
    document.documentElement.dataset.opsContext = section === 'work' ? 'work' : 'base';
    if (section === 'work') openLegacy(WORK_TOOLS.find((item) => item.id === workTool)?.legacy || 'Release board');
    if (section === 'settings') openLegacy('Settings');
  }, [section, workTool]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  function openLegacy(label: string) {
    window.setTimeout(() => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar button'));
      buttons.find((button) => button.textContent?.toLowerCase().includes(label.toLowerCase()))?.click();
    }, 0);
  }
  function openWork(tool: WorkTool) { setWorkTool(tool); setSection('work'); }
  function addWork() { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })); }
  function lockOps() { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', ctrlKey: true, bubbles: true })); }
  async function copy(value: string, success: string) {
    try { await navigator.clipboard.writeText(value); setMessage(success); } catch { setMessage('Could not copy that.'); }
  }

  const visibleEvents = useMemo(() => events.filter((event) => !event.archived)
    .filter((event) => severityFilter === 'all' || event.severity === severityFilter)
    .filter((event) => sourceFilter === 'all' || event.source === sourceFilter)
    .filter((event) => !unreadOnly || !event.read)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [events, severityFilter, sourceFilter, unreadOnly]);
  const sources = useMemo(() => Array.from(new Set(events.map((event) => event.source))).sort(), [events]);

  const activeRelease = data.releases.find((release) => release.status === 'active') || null;
  const releaseCards = activeRelease ? data.cards.filter((card) => card.releaseId === activeRelease.id && !card.archived) : [];
  const released = releaseCards.filter((card) => card.stage === 'shipped').length;
  const releaseProgress = releaseCards.length ? Math.round(released / releaseCards.length * 100) : 0;
  const blockers = data.cards.filter((card) => !card.archived && card.kind === 'bug' && card.bugSeverity === 'blocker' && card.stage !== 'shipped');
  const highBugs = data.cards.filter((card) => !card.archived && card.kind === 'bug' && ['blocker', 'high'].includes(card.bugSeverity) && card.stage !== 'shipped');
  const testing = data.cards.filter((card) => !card.archived && card.stage === 'testing');
  const working = data.cards.filter((card) => !card.archived && card.stage === 'progress');
  const attention = data.cards.filter((card) => !card.archived && card.stage !== 'shipped' && (card.priority === 'critical' || card.bugSeverity === 'blocker' || card.today)).slice(0, 7);

  return (
    <>
      <aside className="ops-rail">
        <div className="ops-brand"><span>D</span><b>OPS</b></div>
        <div className="ops-primary-nav">
          <PrimaryButton active={section === 'overview'} icon={<LayoutDashboard size={20} />} label="Overview" onClick={() => setSection('overview')} />
          <PrimaryButton active={section === 'work'} icon={<Columns3 size={20} />} label="Work" onClick={() => setSection('work')} />
          <PrimaryButton active={section === 'signals'} icon={<Activity size={20} />} label="Signals" badge={status.eventsUnread} onClick={() => setSection('signals')} />
          <PrimaryButton active={section === 'systems'} icon={<Server size={20} />} label="Systems" warning={!status.running} onClick={() => setSection('systems')} />
        </div>
        <div className="ops-rail-bottom"><PrimaryButton active={section === 'settings'} icon={<Settings size={20} />} label="Settings" onClick={() => setSection('settings')} /></div>
      </aside>

      {section === 'work' && <aside className="ops-context-panel"><div className="ops-context-head"><span>WORKSPACE</span><strong>Work</strong><small>Build, test, ship, remember.</small></div><nav>{WORK_TOOLS.map((tool) => <button key={tool.id} className={workTool === tool.id ? 'active' : ''} onClick={() => setWorkTool(tool.id)}>{tool.icon}<span><strong>{tool.label}</strong><small>{tool.detail}</small></span></button>)}</nav></aside>}

      <header className="ops-topbar"><div><span className="ops-kicker">Deme Ops</span><h1>{section === 'overview' ? 'Overview' : section === 'work' ? WORK_TOOLS.find((item) => item.id === workTool)?.label : section === 'signals' ? 'Signals' : section === 'systems' ? 'Systems' : 'Settings'}</h1></div><div className="ops-top-actions"><button onClick={refresh}><RefreshCw size={15} />Refresh</button><button onClick={lockOps}><LockKeyhole size={15} />Lock</button><button className="primary" onClick={addWork}><Plus size={16} />Add work</button></div></header>

      {section === 'overview' && <main className="ops-surface"><Overview data={data} status={status} events={events} monitors={monitors} qa={qa} activeRelease={activeRelease?.name || ''} releaseProgress={releaseProgress} blockers={blockers} highBugs={highBugs} testing={testing.length} working={working.length} attention={attention} onWork={openWork} onSignals={() => setSection('signals')} onSystems={() => setSection('systems')} onAdd={addWork} /></main>}
      {section === 'signals' && <main className="ops-surface"><Signals events={visibleEvents} allEvents={events} sources={sources} sourceFilter={sourceFilter} severityFilter={severityFilter} unreadOnly={unreadOnly} setSourceFilter={setSourceFilter} setSeverityFilter={setSeverityFilter} setUnreadOnly={setUnreadOnly} refresh={refresh} setMessage={setMessage} /></main>}
      {section === 'systems' && <main className="ops-surface"><Systems status={status} monitors={monitors} pairing={pairing} setPairing={setPairing} webhookSecret={webhookSecret} monitorName={monitorName} monitorUrl={monitorUrl} setMonitorName={setMonitorName} setMonitorUrl={setMonitorUrl} refresh={refresh} copy={copy} setMessage={setMessage} /></main>}
      {message && <div className="ops-toast">{message}</div>}
    </>
  );
}

function PrimaryButton({ active, icon, label, badge, warning, onClick }: { active: boolean; icon: ReactNode; label: string; badge?: number; warning?: boolean; onClick: () => void }) {
  return <button className={`ops-primary-button ${active ? 'active' : ''}`} title={label} onClick={onClick}>{icon}<span>{label}</span>{badge ? <b>{badge}</b> : warning ? <i /> : null}</button>;
}

function Overview(props: { data: RoadmapData; status: NetworkStatus; events: IncomingNetworkEvent[]; monitors: ServiceMonitor[]; qa: QASummary; activeRelease: string; releaseProgress: number; blockers: RoadmapData['cards']; highBugs: RoadmapData['cards']; testing: number; working: number; attention: RoadmapData['cards']; onWork: (tool: WorkTool) => void; onSignals: () => void; onSystems: () => void; onAdd: () => void }) {
  const { data, status, events, monitors, qa, activeRelease, releaseProgress, blockers, highBugs, testing, working, attention, onWork, onSignals, onSystems, onAdd } = props;
  const recent = [...data.activity].slice(-6).reverse();
  const offline = monitors.filter((monitor) => monitor.state === 'offline').length;
  const unread = events.filter((event) => !event.read && !event.archived).length;
  return <div className="ops-page ops-dashboard">
    <section className="ops-dashboard-hero"><div><span className="ops-kicker">OPERATING VIEW</span><h2>What needs your attention across Deme?</h2><p>Work, quality, systems and incoming signals in one place. No treasure hunt through tabs.</p></div><button className="ops-hero-action" onClick={onAdd}><Plus size={18} />Capture work</button></section>
    <div className="ops-metric-grid"><Metric title="Active release" value={activeRelease || 'None'} detail={`${releaseProgress}% complete`} tone="purple" /><Metric title="Blockers" value={String(blockers.length)} detail={`${highBugs.length} high severity bugs`} tone={blockers.length ? 'danger' : 'green'} /><Metric title="In testing" value={String(testing)} detail={`${working} currently in progress`} tone="blue" /><Metric title="Signals" value={String(unread)} detail={`${events.length} total events`} tone={unread ? 'amber' : 'green'} /><Metric title="Backend" value={status.running ? 'Online' : 'Offline'} detail={`${status.pairedDevices} paired devices`} tone={status.running ? 'green' : 'danger'} /><Metric title="Service checks" value={offline ? `${offline} down` : monitors.length ? 'Healthy' : 'None'} detail={`${monitors.length} configured`} tone={offline ? 'danger' : 'green'} /></div>
    <div className="ops-dashboard-columns"><section className="ops-panel span-2"><PanelHead title="Release pulse" action="Open delivery" onClick={() => onWork('board')} /><div className="ops-release-row"><div><strong>{activeRelease || 'No active release'}</strong><span>{releaseProgress}% complete</span></div><div className="ops-progress"><i style={{ width: `${releaseProgress}%` }} /></div></div><div className="ops-lane-summary"><Lane label="Planned" value={data.cards.filter((c) => !c.archived && c.stage === 'planned').length} /><Lane label="Working" value={working} /><Lane label="Testing" value={testing} /><Lane label="Bugs" value={data.cards.filter((c) => !c.archived && c.kind === 'bug' && c.stage !== 'shipped').length} /><Lane label="Done" value={data.cards.filter((c) => !c.archived && c.stage === 'shipped').length} /></div></section>
      <section className="ops-panel"><PanelHead title="Needs attention" action="All work" onClick={() => onWork('list')} />{attention.length ? attention.map((card) => <div className="ops-attention" key={card.id}><span className={`ops-dot ${card.priority}`} /><div><strong>{card.title}</strong><small>{card.kind} · {card.stage} · {card.priority}</small></div></div>) : <Empty text="Nothing critical is waving a red flag." />}</section>
      <section className="ops-panel"><PanelHead title="Quality gate" action="Open QA" onClick={() => onWork('qa')} /><QARow label="iOS" value={qa.ios} /><QARow label="Android" value={qa.android} /></section>
      <section className="ops-panel"><PanelHead title="Recent signals" action="Open signals" onClick={onSignals} />{events.filter((e) => !e.archived).slice(0, 5).map((event) => <div className="ops-signal-mini" key={event.id}><span className={`severity ${event.severity}`} /><div><strong>{event.title}</strong><small>{event.source} · {relativeTime(event.timestamp)}</small></div></div>)}{!events.length && <Empty text="No incoming system events yet." />}</section>
      <section className="ops-panel"><PanelHead title="Systems" action="Open systems" onClick={onSystems} /><SystemLine icon={<Server size={15} />} title="Connected backend" state={status.running ? 'Online' : 'Offline'} good={status.running} /><SystemLine icon={<Smartphone size={15} />} title="Companion devices" state={String(status.pairedDevices)} good /><SystemLine icon={<HardDrive size={15} />} title="Attachments" state={`${status.attachmentsCount} · ${formatBytes(status.attachmentBytes)}`} good /></section>
      <section className="ops-panel"><PanelHead title="App intelligence" /><div className="ops-future-grid"><Future title="Product stats" text="DAU, retention, posting, communities and growth." /><Future title="Moderation" text="Reports, actions, escalations and safety load." /><Future title="Store health" text="Builds, reviews, rollout and release state." /></div></section>
      <section className="ops-panel span-2"><PanelHead title="Recent Ops activity" />{recent.length ? <div className="ops-activity-list">{recent.map((item) => <div key={item.id}><CircleIcon /><span><strong>{item.message}</strong><small>{relativeTime(item.createdAt)}</small></span></div>)}</div> : <Empty text="Activity will collect here as Deme Ops is used." />}</section>
    </div>
  </div>;
}

function Signals({ events, allEvents, sources, sourceFilter, severityFilter, unreadOnly, setSourceFilter, setSeverityFilter, setUnreadOnly, refresh, setMessage }: { events: IncomingNetworkEvent[]; allEvents: IncomingNetworkEvent[]; sources: string[]; sourceFilter: string; severityFilter: 'all' | IncomingSeverity; unreadOnly: boolean; setSourceFilter: (value: string) => void; setSeverityFilter: (value: 'all' | IncomingSeverity) => void; setUnreadOnly: (value: boolean) => void; refresh: () => void; setMessage: (value: string) => void }) {
  const api = window.demeRoadmap;
  async function update(event: IncomingNetworkEvent, patch: Partial<Pick<IncomingNetworkEvent, 'read' | 'archived'>>) { const result = await api?.networkUpdateEvent(event.id, patch); if (!result?.ok) setMessage(result?.error || 'Could not update signal.'); refresh(); }
  async function convert(event: IncomingNetworkEvent, kind: 'bug' | 'work') { const result = await api?.networkConvertEvent(event.id, kind); setMessage(result?.ok ? `${kind === 'bug' ? 'Bug' : 'Work item'} created.` : result?.error || 'Could not convert signal.'); refresh(); }
  async function remove(event: IncomingNetworkEvent) { if (!window.confirm(`Delete “${event.title}”?`)) return; await api?.networkDeleteEvent(event.id); refresh(); }
  return <div className="ops-page"><section className="ops-page-intro"><div><span className="ops-kicker">SIGNAL INBOX</span><h2>Things happening around Deme</h2><p>Incidents, automation, future moderation reports and connected-service events land here.</p></div><div className="ops-count-chip">{allEvents.filter((e) => !e.read && !e.archived).length} unread</div></section><section className="ops-panel ops-filter-panel"><select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as 'all' | IncomingSeverity)}><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="warning">Warning</option><option value="info">Info</option></select><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="all">All sources</option>{sources.map((source) => <option key={source}>{source}</option>)}</select><label><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Unread only</label></section><div className="ops-signal-list">{events.map((event) => <article className={`ops-signal-card ${event.read ? 'read' : ''}`} key={event.id}><span className={`ops-signal-severity ${event.severity}`}>{event.severity}</span><div className="ops-signal-body"><div className="ops-signal-meta"><span>{event.source}</span><span>{event.eventType}</span><span>{new Date(event.timestamp).toLocaleString()}</span>{!event.read && <b>NEW</b>}</div><h3>{event.title}</h3>{event.summary && <p>{event.summary}</p>}{event.linkedCardId && <div className="ops-linked"><Link2 size={13} />Linked to work item</div>}<div className="ops-card-actions"><button onClick={() => update(event, { read: !event.read })}><Check size={14} />{event.read ? 'Unread' : 'Read'}</button>{!event.linkedCardId && <button onClick={() => convert(event, 'bug')}><Bug size={14} />Bug</button>}{!event.linkedCardId && <button onClick={() => convert(event, 'work')}><Plus size={14} />Work</button>}{event.externalUrl && <button onClick={() => window.open(event.externalUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={14} />Source</button>}<button onClick={() => update(event, { archived: true })}><Archive size={14} />Archive</button><button className="danger" onClick={() => remove(event)}><Trash2 size={14} /></button></div></div></article>)}{!events.length && <div className="ops-big-empty"><Activity size={30} /><h3>No signals match this view</h3><p>That is considerably nicer than an outage.</p></div>}</div></div>;
}

function Systems({ status, monitors, pairing, setPairing, webhookSecret, monitorName, monitorUrl, setMonitorName, setMonitorUrl, refresh, copy, setMessage }: { status: NetworkStatus; monitors: ServiceMonitor[]; pairing: PairingInfo | null; setPairing: (value: PairingInfo | null) => void; webhookSecret: string; monitorName: string; monitorUrl: string; setMonitorName: (value: string) => void; setMonitorUrl: (value: string) => void; refresh: () => void; copy: (value: string, success: string) => void; setMessage: (value: string) => void }) {
  const api = window.demeRoadmap;
  async function pair() { if (!api) return; try { setPairing(await api.networkCreatePairing()); refresh(); } catch { setMessage('Could not create pairing session.'); } }
  async function approve(request: PendingPairing) { const result = await api?.networkApprovePairing(request.id); setMessage(result?.ok ? `${request.name} approved.` : result?.error || 'Approval failed.'); refresh(); }
  async function reject(request: PendingPairing) { await api?.networkRejectPairing(request.id); refresh(); }
  async function revoke(id: string) { await api?.networkRevokeDevice(id); refresh(); }
  async function addMonitor() { if (!monitorUrl.trim()) return; const result = await api?.networkAddMonitor(monitorName.trim(), monitorUrl.trim()); setMessage(result?.ok ? 'Health check added.' : result?.error || 'Could not add check.'); if (result?.ok) { setMonitorName(''); setMonitorUrl(''); } refresh(); }
  return <div className="ops-page"><section className="ops-page-intro"><div><span className="ops-kicker">SYSTEMS</span><h2>Connections and infrastructure</h2><p>The plumbing behind Deme Ops, without pretending disconnected services are live.</p></div><span className={`ops-status-pill ${status.running ? 'good' : 'bad'}`}>{status.running ? <Wifi size={15} /> : <WifiOff size={15} />}{status.running ? 'Local backend online' : 'Backend unavailable'}</span></section><div className="ops-dashboard-columns"><section className="ops-panel span-2"><PanelHead title="Connected workspace" /><div className="ops-system-metrics"><MetricLite label="LAN" value={status.addresses[0] ? `${status.addresses[0]}:${status.port}` : status.loopbackUrl || 'Unavailable'} /><MetricLite label="Devices" value={String(status.pairedDevices)} /><MetricLite label="Connections" value={String(status.activeConnections)} /><MetricLite label="Storage" value={formatBytes(status.attachmentBytes)} /></div><div className="ops-card-actions"><button onClick={() => api?.networkRestart().then(() => refresh())}><RotateCw size={14} />Restart</button><button onClick={() => api?.networkOpenCompanion()}><ExternalLink size={14} />Open companion</button><button className="primary" onClick={pair}><QrCode size={14} />Pair device</button></div>{status.lastError && <div className="ops-warning"><AlertTriangle size={15} />{status.lastError}</div>}</section>
      {pairing && <section className="ops-panel"><PanelHead title="Pair a device" /><div className="ops-pairing"><img src={pairing.qrDataUrl} alt="Pairing QR" /><div><strong>{pairing.code}</strong><small>Expires {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small><button onClick={() => copy(pairing.url, 'Pairing link copied.')}><Copy size={13} />Copy link</button></div></div></section>}
      <section className="ops-panel"><PanelHead title="Trusted devices" />{status.pendingPairings.map((request) => <div className="ops-device-row pending" key={request.id}><KeyRoundIcon /><div><strong>{request.name}</strong><small>Waiting for approval</small></div><button className="good" onClick={() => approve(request)}><Check size={13} /></button><button className="danger" onClick={() => reject(request)}><XCircle size={13} /></button></div>)}{status.devices.map((device) => <div className="ops-device-row" key={device.id}><Smartphone size={15} /><div><strong>{device.name}</strong><small>Seen {relativeTime(device.lastSeen)}</small></div><button className="danger" onClick={() => revoke(device.id)}><Unplug size={13} /></button></div>)}{!status.devices.length && !status.pendingPairings.length && <Empty text="No paired devices." />}</section>
      <section className="ops-panel span-2"><PanelHead title="Integrations" /><div className="ops-provider-grid">{PROVIDERS.map(([name, icon, text]) => <article key={name}><div>{icon}<span>Not connected</span></div><h3>{name}</h3><p>{text}</p><button onClick={() => setMessage(`${name} is ready for a real connector when we add one.`)}>Setup</button></article>)}</div></section>
      <section className="ops-panel"><PanelHead title="Incoming API" /><div className="ops-secret"><span>Endpoint</span><code>{status.webhookUrl || 'Offline'}</code><button onClick={() => copy(status.webhookUrl, 'Endpoint copied.')}><Copy size={13} /></button></div><div className="ops-secret"><span>Secret</span><code>{webhookSecret ? `${webhookSecret.slice(0, 7)}••••${webhookSecret.slice(-5)}` : 'Unavailable'}</code><button onClick={() => copy(webhookSecret, 'Webhook secret copied.')}><Copy size={13} /></button></div><button className="ops-wide-button" onClick={() => api?.networkSendTestEvent().then(() => { setMessage('Test signal sent.'); refresh(); })}>Send test signal</button></section>
      <section className="ops-panel"><PanelHead title="Health checks" action="Check now" onClick={() => api?.networkCheckMonitors().then(() => refresh())} /><div className="ops-monitor-form"><input value={monitorName} onChange={(e) => setMonitorName(e.target.value)} placeholder="Label" /><input value={monitorUrl} onChange={(e) => setMonitorUrl(e.target.value)} placeholder="https://…/health" /><button onClick={addMonitor}><Plus size={13} /></button></div>{monitors.map((monitor) => <div className="ops-monitor-row" key={monitor.id}><span className={`state ${monitor.state}`} /><div><strong>{monitor.name}</strong><small>{monitor.state} · {monitor.latencyMs || 0}ms</small></div><button className="danger" onClick={() => api?.networkRemoveMonitor(monitor.id).then(() => refresh())}><Trash2 size={13} /></button></div>)}{!monitors.length && <Empty text="No real URL checks configured." />}</section>
    </div></div>;
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: string }) { return <div className={`ops-metric ${tone}`}><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>; }
function MetricLite({ label, value }: { label: string; value: string }) { return <div className="ops-metric-lite"><span>{label}</span><strong>{value}</strong></div>; }
function Lane({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function PanelHead({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) { return <div className="ops-panel-head"><h3>{title}</h3>{action && <button onClick={onClick}>{action}</button>}</div>; }
function Empty({ text }: { text: string }) { return <div className="ops-empty">{text}</div>; }
function Future({ title, text }: { title: string; text: string }) { return <div className="ops-future"><span>COMING INTO OPS</span><strong>{title}</strong><p>{text}</p></div>; }
function QARow({ label, value }: { label: string; value: QAPlatformSummary }) { const tested = value.passed + value.failed + value.blocked; const percent = value.total ? Math.round(value.passed / Math.max(1, value.total) * 100) : 0; return <div className="ops-qa-row"><div><strong>{label}</strong><small>{tested || 0} recorded · {value.failed} failed · {value.blocked} blocked</small></div><b>{percent}%</b></div>; }
function SystemLine({ icon, title, state, good }: { icon: ReactNode; title: string; state: string; good: boolean }) { return <div className="ops-system-line"><span>{icon}</span><strong>{title}</strong><b className={good ? 'good' : 'bad'}>{state}</b></div>; }
function CircleIcon() { return <span className="ops-activity-dot" />; }
function KeyRoundIcon() { return <span className="ops-device-key"><ShieldCheck size={14} /></span>; }
