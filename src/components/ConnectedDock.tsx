import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FilePlus2,
  Files,
  FolderOpen,
  Link2,
  MonitorUp,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Trash2,
  Webhook,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  AttachmentRecord,
  IncomingNetworkEvent,
  NetworkStatus,
  PairedDevice,
  PairingInfo,
  ServiceMonitor,
} from '../types';

type ConnectedTab = 'connect' | 'events' | 'files' | 'control';

const EMPTY_STATUS: NetworkStatus = {
  running: false,
  port: 0,
  addresses: [],
  primaryUrl: '',
  loopbackUrl: '',
  hookUrl: '',
  pairedDevices: 0,
  devices: [],
  monitors: [],
  eventsOpen: 0,
  attachmentsCount: 0,
};

function relativeTime(value: string) {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

export function ConnectedDock() {
  const api = window.demeRoadmap;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ConnectedTab>('connect');
  const [status, setStatus] = useState<NetworkStatus>(EMPTY_STATUS);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [events, setEvents] = useState<IncomingNetworkEvent[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [monitors, setMonitors] = useState<ServiceMonitor[]>([]);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [monitorName, setMonitorName] = useState('');
  const [monitorUrl, setMonitorUrl] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      const nextStatus = await api.networkStatus();
      setStatus(nextStatus);
      if (!nextStatus.running) return;
      const [nextDevices, nextEvents, nextAttachments, nextMonitors] = await Promise.all([
        api.networkDevices(),
        api.networkEvents(),
        api.networkAttachments(),
        api.networkMonitors(),
      ]);
      setDevices(nextDevices);
      setEvents(nextEvents);
      setAttachments(nextAttachments);
      setMonitors(nextMonitors);
    } catch {
      setMessage('Connected Workspace is waiting for the local backend.');
    }
  }, [api]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [open, refresh]);

  useEffect(() => {
    if (!api) return;
    return api.onNetworkChanged(() => {
      if (open) refresh();
    });
  }, [api, open, refresh]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2600);
    return () => window.clearTimeout(timer);
  }, [message]);

  const openEvents = useMemo(() => events.filter((event) => !event.resolved), [events]);
  const hasLanAddress = status.addresses.length > 0;

  async function createPairing() {
    if (!api) return;
    setBusy('pair');
    try {
      const next = await api.networkCreatePairing();
      setPairing(next);
      setMessage('Pairing code ready for 5 minutes.');
    } catch {
      setMessage('Could not create a pairing code.');
    } finally {
      setBusy('');
    }
  }

  async function revoke(deviceId: string) {
    if (!api) return;
    setBusy(deviceId);
    try {
      const result = await api.networkRevokeDevice(deviceId);
      setMessage(result.ok ? 'Device access revoked.' : result.error || 'Could not revoke device.');
      await refresh();
    } finally {
      setBusy('');
    }
  }

  async function resolveEvent(eventId: string) {
    if (!api) return;
    await api.networkResolveEvent(eventId, true);
    await refresh();
  }

  async function deleteEvent(eventId: string) {
    if (!api) return;
    await api.networkDeleteEvent(eventId);
    await refresh();
  }

  async function addFile() {
    if (!api) return;
    setBusy('file');
    try {
      const result = await api.networkChooseAttachment();
      if (result.error) setMessage(result.error);
      else if (!result.canceled) setMessage('File added to the Drop Zone.');
      await refresh();
    } finally {
      setBusy('');
    }
  }

  async function addMonitor() {
    if (!api) return;
    if (!monitorUrl.trim()) return;
    setBusy('monitor');
    try {
      const result = await api.networkAddMonitor(monitorName.trim(), monitorUrl.trim());
      if (!result.ok) setMessage(result.error || 'Could not add monitor.');
      else {
        setMonitorName('');
        setMonitorUrl('');
        setMessage('Service monitor added.');
      }
      await refresh();
    } finally {
      setBusy('');
    }
  }

  if (!api) return null;

  return (
    <>
      <button
        className={`connected-fab ${status.running ? 'online' : 'offline'} ${open ? 'open' : ''}`}
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Connected Workspace"
      >
        {status.running ? <Wifi size={18} /> : <WifiOff size={18} />}
        <span>Connected</span>
        {openEvents.length > 0 && <small>{openEvents.length}</small>}
      </button>

      {open && (
        <aside className="connected-panel" aria-label="Connected Workspace">
          <header className="connected-panel-head">
            <div className="connected-head-mark"><Radio size={18} /></div>
            <div className="connected-head-copy">
              <span className="eyebrow">0.6 · Connected Workspace</span>
              <h2>Your local Deme network</h2>
            </div>
            <button className="connected-close" type="button" onClick={() => setOpen(false)}><X size={18} /></button>
          </header>

          <div className="connected-status-strip">
            <span className={status.running ? 'good' : 'bad'}><i />{status.running ? 'Backend online' : 'Backend offline'}</span>
            <span>{hasLanAddress ? `${status.addresses[0]}:${status.port}` : status.loopbackUrl || 'No LAN address'}</span>
            <button type="button" onClick={refresh}><RefreshCw size={13} /> Refresh</button>
          </div>

          <nav className="connected-tabs">
            <button type="button" className={tab === 'connect' ? 'active' : ''} onClick={() => setTab('connect')}><Smartphone size={15} /> Connect</button>
            <button type="button" className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}><Activity size={15} /> Events{openEvents.length > 0 && <small>{openEvents.length}</small>}</button>
            <button type="button" className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><Files size={15} /> Files</button>
            <button type="button" className={tab === 'control' ? 'active' : ''} onClick={() => setTab('control')}><MonitorUp size={15} /> Control</button>
          </nav>

          <div className="connected-scroll">
            {tab === 'connect' && (
              <div className="connected-stack">
                <section className="connected-card connected-hero-card">
                  <div className="connected-card-title">
                    <div><span className="eyebrow">Phone companion</span><h3>Take Roadmap around the house</h3></div>
                    <ShieldCheck size={20} />
                  </div>
                  <p>The backend starts with Roadmap and listens on your private network. A device gets nothing until you create a one-time pairing code.</p>
                  <div className="connected-actions">
                    <button className="primary-button" type="button" disabled={!status.running || busy === 'pair'} onClick={createPairing}><QrCode size={15} />{busy === 'pair' ? 'Preparing…' : 'Pair a device'}</button>
                    <button type="button" disabled={!status.running} onClick={() => api.networkOpenCompanion()}><ExternalLink size={15} /> Open companion</button>
                  </div>
                  {!hasLanAddress && status.running && <div className="connected-warning"><AlertTriangle size={15} /><span>No private IPv4 address was detected. Check Wi-Fi and allow Deme Roadmap through Windows Firewall on private networks.</span></div>}
                </section>

                {pairing && (
                  <section className="connected-card pairing-card">
                    <div className="pairing-qr">{pairing.qrDataUrl ? <img src={pairing.qrDataUrl} alt="Pairing QR code" /> : <QrCode size={60} />}</div>
                    <div className="pairing-copy">
                      <span className="eyebrow">One-time pairing</span>
                      <strong>{pairing.code}</strong>
                      <p>Scan this QR code on the device connected to the same Wi-Fi. It expires at {new Date(pairing.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.</p>
                      <div className="connected-url-row"><code>{pairing.url}</code><button type="button" onClick={async () => setMessage(await copyText(pairing.url) ? 'Companion link copied.' : 'Could not copy link.')}><Copy size={13} /></button></div>
                    </div>
                  </section>
                )}

                <section className="connected-card">
                  <div className="connected-card-title"><div><span className="eyebrow">Trusted devices</span><h3>{devices.length ? `${devices.length} paired` : 'Nothing paired yet'}</h3></div><Smartphone size={19} /></div>
                  <div className="connected-list">
                    {devices.map((device) => (
                      <div className="connected-list-row" key={device.id}>
                        <div className="connected-list-icon"><Smartphone size={15} /></div>
                        <div className="connected-list-copy"><strong>{device.name}</strong><small>Paired {new Date(device.createdAt).toLocaleDateString()} · seen {relativeTime(device.lastSeen)}</small></div>
                        <button type="button" className="connected-icon-button danger" disabled={busy === device.id} onClick={() => revoke(device.id)} title="Revoke device"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {!devices.length && <div className="connected-empty">Pair your phone, tablet or another PC when you want it. Nothing is broadcast publicly.</div>}
                  </div>
                </section>

                <section className="connected-card">
                  <div className="connected-card-title"><div><span className="eyebrow">LAN webhook</span><h3>Incoming event endpoint</h3></div><Webhook size={19} /></div>
                  <p>Anything that can reach this PC on your local network can post an event here. The random secret is part of the URL.</p>
                  <div className="connected-url-row"><code>{status.hookUrl || 'Backend offline'}</code><button type="button" disabled={!status.hookUrl} onClick={async () => setMessage(await copyText(status.hookUrl) ? 'Webhook URL copied.' : 'Could not copy URL.')}><Copy size={13} /></button></div>
                  <small className="connected-help">Public services such as GitHub or Render cannot reach a private Wi-Fi address without a tunnel. The endpoint is deliberately local for now.</small>
                </section>
              </div>
            )}

            {tab === 'events' && (
              <div className="connected-stack">
                <section className="connected-card">
                  <div className="connected-card-title"><div><span className="eyebrow">Incoming events</span><h3>{openEvents.length} need attention</h3></div><Activity size={19} /></div>
                  <p>Webhook alerts and companion events land here instead of disappearing into another dashboard.</p>
                </section>
                {events.map((event) => (
                  <section className={`connected-event connected-card severity-${event.severity} ${event.resolved ? 'resolved' : ''}`} key={event.id}>
                    <div className="connected-event-head">
                      <span className={`event-severity ${event.severity}`}>{event.severity === 'critical' ? <AlertTriangle size={13} /> : event.resolved ? <CheckCircle2 size={13} /> : <Radio size={13} />}{event.severity}</span>
                      <small>{new Date(event.createdAt).toLocaleString()}</small>
                    </div>
                    <h3>{event.title}</h3>
                    <span className="event-source">{event.source}</span>
                    {event.details && <p>{event.details}</p>}
                    <div className="connected-actions">
                      {!event.resolved && <button type="button" onClick={() => resolveEvent(event.id)}><CheckCircle2 size={14} /> Resolve</button>}
                      <button type="button" className="danger" onClick={() => deleteEvent(event.id)}><Trash2 size={14} /> Delete</button>
                    </div>
                  </section>
                ))}
                {!events.length && <div className="connected-empty connected-card">Nothing has landed here yet. Your future outage goblins are currently asleep.</div>}
              </div>
            )}

            {tab === 'files' && (
              <div className="connected-stack">
                <section className="connected-card connected-drop-card">
                  <div className="connected-card-title"><div><span className="eyebrow">Drop Zone</span><h3>Local attachments</h3></div><FilePlus2 size={20} /></div>
                  <p>Add screenshots, videos, logs, PDFs or whatever else should travel with the Roadmap workspace. Files stay in the app-data folder on this PC.</p>
                  <button className="primary-button" type="button" disabled={busy === 'file'} onClick={addFile}><Plus size={15} />{busy === 'file' ? 'Adding…' : 'Add file'}</button>
                </section>
                <section className="connected-card">
                  <div className="connected-card-title"><div><span className="eyebrow">Stored locally</span><h3>{attachments.length} attachments</h3></div><Files size={19} /></div>
                  <div className="connected-list">
                    {attachments.map((file) => (
                      <div className="connected-list-row" key={file.id}>
                        <div className="connected-list-icon"><Files size={15} /></div>
                        <div className="connected-list-copy"><strong>{file.name}</strong><small>{fileSize(file.size)} · {file.source} · {relativeTime(file.createdAt)}</small></div>
                        <button type="button" className="connected-icon-button" onClick={() => api.networkRevealAttachment(file.id)} title="Show in folder"><FolderOpen size={14} /></button>
                        <button type="button" className="connected-icon-button danger" onClick={async () => { await api.networkDeleteAttachment(file.id); await refresh(); }} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    {!attachments.length && <div className="connected-empty">The Drop Zone is empty. Your phone companion can upload here too.</div>}
                  </div>
                </section>
              </div>
            )}

            {tab === 'control' && (
              <div className="connected-stack">
                <section className="connected-card production-card">
                  <div className="connected-card-title"><div><span className="eyebrow">Production control room</span><h3>Watch the things Deme depends on</h3></div><Server size={20} /></div>
                  <p>Add any HTTP health page or endpoint. Roadmap checks it every minute while the app is running and tracks response state + latency.</p>
                  <div className="monitor-add">
                    <input value={monitorName} onChange={(event) => setMonitorName(event.target.value)} placeholder="Name, e.g. Deme API" />
                    <input value={monitorUrl} onChange={(event) => setMonitorUrl(event.target.value)} placeholder="https://api.example.com/health" />
                    <button className="primary-button" type="button" disabled={busy === 'monitor' || !monitorUrl.trim()} onClick={addMonitor}><Plus size={14} /> Add</button>
                  </div>
                </section>

                <section className="connected-card">
                  <div className="connected-card-title">
                    <div><span className="eyebrow">Live services</span><h3>{monitors.length} monitored</h3></div>
                    <button className="connected-text-button" type="button" onClick={async () => { setBusy('check'); try { setMonitors(await api.networkCheckMonitors()); } finally { setBusy(''); } }}><RefreshCw size={13} className={busy === 'check' ? 'spin' : ''} /> Check now</button>
                  </div>
                  <div className="monitor-grid">
                    {monitors.map((monitor) => (
                      <article className={`monitor-card state-${monitor.state}`} key={monitor.id}>
                        <div className="monitor-head"><span className="monitor-dot" /><strong>{monitor.name}</strong><button type="button" onClick={async () => { await api.networkRemoveMonitor(monitor.id); await refresh(); }}><X size={13} /></button></div>
                        <a href={monitor.url} onClick={(event) => event.preventDefault()}>{monitor.url}</a>
                        <div className="monitor-meta">
                          <span>{monitor.state}</span>
                          <span>{monitor.statusCode || '—'}</span>
                          <span>{monitor.latencyMs ? `${monitor.latencyMs} ms` : '—'}</span>
                        </div>
                        <small>{monitor.error || (monitor.checkedAt ? `Checked ${relativeTime(monitor.checkedAt)}` : 'Waiting for first check')}</small>
                      </article>
                    ))}
                    {!monitors.length && <div className="connected-empty">No service monitors yet. Add the Deme API or any health URL when you’re ready.</div>}
                  </div>
                </section>

                <section className="connected-card foundation-card">
                  <div className="connected-card-title"><div><span className="eyebrow">Backend foundation</span><h3>What 0.6 unlocked</h3></div><Link2 size={19} /></div>
                  <div className="foundation-grid">
                    <span><Wifi size={14} /> Wi-Fi companion</span>
                    <span><Radio size={14} /> Live SSE sync</span>
                    <span><Webhook size={14} /> Event webhooks</span>
                    <span><Files size={14} /> Attachments</span>
                    <span><MonitorUp size={14} /> Service monitoring</span>
                    <span><ShieldCheck size={14} /> Paired-device tokens</span>
                  </div>
                </section>
              </div>
            )}
          </div>

          {message && <div className="connected-toast">{message}</div>}
        </aside>
      )}
    </>
  );
}
