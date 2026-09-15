const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

const DEFAULT_PORT = 43165;
const MAX_BODY = 28 * 1024 * 1024;
const MAX_ATTACHMENT = 20 * 1024 * 1024;
const PAIRING_TTL_MS = 5 * 60 * 1000;

function nowIso() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function hashToken(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function safeName(value, fallback = 'file') {
  const cleaned = String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();
  return (cleaned || fallback).slice(0, 160);
}
function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}
function html(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}
async function readBody(req, limit = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Request body is too large.');
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); }
  catch {
    const error = new Error('Request body must be valid JSON.');
    error.code = 'BAD_JSON';
    throw error;
  }
}
async function atomicJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temp, filePath);
}
async function readJson(filePath, fallback) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    return fallback;
  }
}
function privateIpv4Addresses() {
  const values = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      if (entry.address.startsWith('169.254.')) continue;
      values.push(entry.address);
    }
  }
  return [...new Set(values)];
}
function validMonitorUrl(value) {
  try {
    const url = new URL(String(value));
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.toString() : '';
  } catch { return ''; }
}
function emptyNetworkConfig() {
  return { version: 1, hookSecret: crypto.randomBytes(24).toString('base64url'), devices: [], monitors: [] };
}
function normaliseNetworkConfig(raw) {
  const fallback = emptyNetworkConfig();
  const source = raw && typeof raw === 'object' ? raw : {};
  const devices = Array.isArray(source.devices) ? source.devices.filter((item) => item && typeof item === 'object').map((item) => ({
    id: typeof item.id === 'string' ? item.id : id('device'),
    name: typeof item.name === 'string' ? item.name.slice(0, 80) : 'Paired device',
    tokenHash: typeof item.tokenHash === 'string' ? item.tokenHash : '',
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
    lastSeen: typeof item.lastSeen === 'string' ? item.lastSeen : '',
  })).filter((item) => item.tokenHash) : [];
  const monitors = Array.isArray(source.monitors) ? source.monitors.filter((item) => item && typeof item === 'object').map((item) => {
    const url = validMonitorUrl(item.url);
    if (!url) return null;
    return {
      id: typeof item.id === 'string' ? item.id : id('monitor'),
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : new URL(url).hostname,
      url,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso(),
    };
  }).filter(Boolean) : [];
  return {
    version: 1,
    hookSecret: typeof source.hookSecret === 'string' && source.hookSecret.length >= 24 ? source.hookSecret : fallback.hookSecret,
    devices,
    monitors,
  };
}
let companionTemplate = '';
function companionHtml() { return companionTemplate.replace('__MAX_ATTACHMENT__', String(MAX_ATTACHMENT)); }

async function startLanServer(options) {
  companionTemplate = await fs.readFile(path.join(__dirname, 'companion.html'), 'utf8');
  const userData = options.app.getPath('userData');
  const configPath = path.join(userData, 'network.json');
  const eventsPath = path.join(userData, 'incoming-events.json');
  const attachmentsPath = path.join(userData, 'attachments.json');
  const attachmentsDir = path.join(userData, 'attachments');
  let config = normaliseNetworkConfig(await readJson(configPath, emptyNetworkConfig()));
  await atomicJson(configPath, config);
  const initialEvents = await readJson(eventsPath, []);
  const initialAttachments = await readJson(attachmentsPath, []);
  let incomingEvents = Array.isArray(initialEvents) ? initialEvents : [];
  let attachments = Array.isArray(initialAttachments) ? initialAttachments : [];
  const pairingCodes = new Map();
  const streamClients = new Set();
  const monitorStatus = new Map();
  let server = null;
  let port = 0;
  let monitorTimer = null;

  function addresses() { return privateIpv4Addresses(); }
  function primaryUrl() {
    const address = addresses()[0];
    return address && port ? `http://${address}:${port}` : port ? `http://127.0.0.1:${port}` : '';
  }
  function loopbackUrl() { return port ? `http://127.0.0.1:${port}` : ''; }
  function hookUrl() { return primaryUrl() ? `${primaryUrl()}/hook/${config.hookSecret}` : ''; }
  function publicDevice(device) {
    return { id: device.id, name: device.name, createdAt: device.createdAt, lastSeen: device.lastSeen || '' };
  }
  function monitorPublic(item) {
    const value = monitorStatus.get(item.id) || { state: 'unknown', statusCode: 0, latencyMs: 0, checkedAt: '', error: '' };
    return { ...item, ...value };
  }
  function status() {
    return {
      running: Boolean(server && server.listening),
      port,
      addresses: addresses(),
      primaryUrl: primaryUrl(),
      loopbackUrl: loopbackUrl(),
      hookUrl: hookUrl(),
      pairedDevices: config.devices.length,
      devices: config.devices.map(publicDevice),
      monitors: config.monitors.map(monitorPublic),
      eventsOpen: incomingEvents.filter((item) => !item.resolved).length,
      attachmentsCount: attachments.length,
    };
  }
  async function saveConfig() { await atomicJson(configPath, config); }
  async function saveEvents() { await atomicJson(eventsPath, incomingEvents.slice(0, 500)); }
  async function saveAttachments() { await atomicJson(attachmentsPath, attachments.slice(0, 1000)); }
  function notifyDesktopNetwork() { options.notifyNetworkChanged?.(); }
  function broadcast(type, payload = {}) {
    const message = `data: ${JSON.stringify({ type, at: nowIso(), ...payload })}\n\n`;
    for (const client of [...streamClients]) {
      try { client.write(message); } catch { streamClients.delete(client); }
    }
    notifyDesktopNetwork();
  }
  async function authorize(req, url) {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const raw = bearer || url.searchParams.get('token') || '';
    if (!raw) return null;
    const hashed = hashToken(raw);
    const device = config.devices.find((item) => item.tokenHash === hashed);
    if (!device) return null;
    device.lastSeen = nowIso();
    return device;
  }
  function requireDesktopUnlocked(res) {
    if (options.isUnlocked()) return true;
    json(res, 423, { error: 'Deme Roadmap is locked on the desktop.' });
    return false;
  }
  async function readCurrentRoadmap() {
    try {
      const value = await options.readRoadmap();
      return value && typeof value === 'object' && Array.isArray(value.cards) ? value : null;
    } catch { return null; }
  }
  async function writeExternalRoadmap(next, eventType) {
    await options.writeRoadmap(next);
    options.notifyRoadmapChanged?.();
    broadcast(eventType || 'roadmap-changed');
  }
  async function createPairing() {
    if (!server?.listening) throw new Error('The Wi-Fi backend is not running.');
    for (const [code, value] of pairingCodes) if (value.expiresAt < Date.now()) pairingCodes.delete(code);
    let code = '';
    do { code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); } while (pairingCodes.has(code));
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    pairingCodes.set(code, { expiresAt });
    const url = `${primaryUrl()}/?pair=${code}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: '#66546fff', light: '#fffafdff' } });
    return { code, url, qrDataUrl, expiresAt: new Date(expiresAt).toISOString() };
  }
  async function revokeDevice(deviceId) {
    const before = config.devices.length;
    config.devices = config.devices.filter((item) => item.id !== deviceId);
    if (config.devices.length === before) return { ok: false, error: 'Device not found.' };
    await saveConfig(); broadcast('device-revoked'); return { ok: true };
  }
  async function addIncomingEvent(input, sourceFallback = 'Roadmap') {
    const severity = ['info', 'warning', 'critical'].includes(String(input.severity)) ? String(input.severity) : 'info';
    const event = {
      id: id('event'),
      source: safeName(input.source, sourceFallback).slice(0, 80),
      title: safeName(input.title, 'Incoming event').slice(0, 160),
      details: typeof input.details === 'string' ? input.details.slice(0, 8000) : '',
      severity,
      createdAt: nowIso(),
      resolved: false,
      resolvedAt: '',
    };
    incomingEvents = [event, ...incomingEvents].slice(0, 500);
    await saveEvents();
    broadcast('incoming-event', { eventId: event.id });
    return event;
  }
  async function resolveEvent(eventId, resolved = true) {
    let found = false;
    incomingEvents = incomingEvents.map((item) => {
      if (item.id !== eventId) return item;
      found = true;
      return { ...item, resolved: Boolean(resolved), resolvedAt: resolved ? nowIso() : '' };
    });
    if (!found) return { ok: false, error: 'Event not found.' };
    await saveEvents(); broadcast('event-updated', { eventId }); return { ok: true };
  }
  async function deleteEvent(eventId) {
    const before = incomingEvents.length;
    incomingEvents = incomingEvents.filter((item) => item.id !== eventId);
    if (incomingEvents.length === before) return { ok: false, error: 'Event not found.' };
    await saveEvents(); broadcast('event-deleted', { eventId }); return { ok: true };
  }
  async function storeAttachment({ name, mime, buffer, source = 'desktop', targetType = 'inbox', targetId = '' }) {
    if (!Buffer.isBuffer(buffer) || buffer.length <= 0) throw new Error('Attachment is empty.');
    if (buffer.length > MAX_ATTACHMENT) throw new Error('Attachments are limited to 20 MB.');
    await fs.mkdir(attachmentsDir, { recursive: true });
    const attachmentId = id('file');
    const original = safeName(name, 'attachment');
    const extension = path.extname(original).slice(0, 12);
    const storedName = `${attachmentId}${extension}`;
    const filePath = path.join(attachmentsDir, storedName);
    await fs.writeFile(filePath, buffer);
    const record = {
      id: attachmentId,
      name: original,
      mime: typeof mime === 'string' && mime ? mime.slice(0, 120) : 'application/octet-stream',
      size: buffer.length,
      source: safeName(source, 'desktop').slice(0, 40),
      targetType: safeName(targetType, 'inbox').slice(0, 40),
      targetId: typeof targetId === 'string' ? targetId.slice(0, 120) : '',
      storedName,
      createdAt: nowIso(),
    };
    attachments = [record, ...attachments].slice(0, 1000);
    await saveAttachments(); broadcast('attachment-added', { attachmentId });
    return record;
  }
  async function chooseAttachment(parentWindow) {
    const result = await options.dialog.showOpenDialog(parentWindow, { title: 'Add to Roadmap Drop Zone', properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_ATTACHMENT) return { canceled: false, error: 'Attachments are limited to 20 MB.' };
    const buffer = await fs.readFile(filePath);
    const record = await storeAttachment({ name: path.basename(filePath), buffer, source: 'desktop' });
    return { canceled: false, attachment: record };
  }
  async function deleteAttachment(attachmentId) {
    const record = attachments.find((item) => item.id === attachmentId);
    if (!record) return { ok: false, error: 'Attachment not found.' };
    attachments = attachments.filter((item) => item.id !== attachmentId);
    try { await fs.unlink(path.join(attachmentsDir, record.storedName)); } catch { /* metadata still removed */ }
    await saveAttachments(); broadcast('attachment-deleted', { attachmentId }); return { ok: true };
  }
  async function revealAttachment(attachmentId) {
    const record = attachments.find((item) => item.id === attachmentId);
    if (!record) return { ok: false, error: 'Attachment not found.' };
    options.shell.showItemInFolder(path.join(attachmentsDir, record.storedName));
    return { ok: true };
  }
  async function runMonitor(item) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(item.url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': `Deme-Roadmap/${options.app.getVersion()}` } });
      try { await response.body?.cancel(); } catch { /* ignore */ }
      const latencyMs = Date.now() - started;
      const state = response.status >= 500 ? 'offline' : response.status >= 400 ? 'warning' : 'online';
      const value = { state, statusCode: response.status, latencyMs, checkedAt: nowIso(), error: '' };
      monitorStatus.set(item.id, value); return value;
    } catch (error) {
      const value = { state: 'offline', statusCode: 0, latencyMs: Date.now() - started, checkedAt: nowIso(), error: error.name === 'AbortError' ? 'Timed out' : String(error.message || error) };
      monitorStatus.set(item.id, value); return value;
    } finally { clearTimeout(timeout); }
  }
  async function checkMonitors() {
    await Promise.all(config.monitors.map(runMonitor));
    broadcast('monitors-updated');
    return config.monitors.map(monitorPublic);
  }
  async function addMonitor(name, urlValue) {
    const url = validMonitorUrl(urlValue);
    if (!url) return { ok: false, error: 'Use a valid http:// or https:// URL.' };
    const monitor = { id: id('monitor'), name: safeName(name, new URL(url).hostname).slice(0, 80), url, createdAt: nowIso() };
    config.monitors.push(monitor); await saveConfig(); await runMonitor(monitor); broadcast('monitor-added'); return { ok: true, monitor: monitorPublic(monitor) };
  }
  async function removeMonitor(monitorId) {
    const before = config.monitors.length;
    config.monitors = config.monitors.filter((item) => item.id !== monitorId);
    monitorStatus.delete(monitorId);
    if (before === config.monitors.length) return { ok: false, error: 'Monitor not found.' };
    await saveConfig(); broadcast('monitor-removed'); return { ok: true };
  }
  async function snapshot() {
    const roadmap = await readCurrentRoadmap();
    if (!roadmap) return null;
    const cards = Array.isArray(roadmap.cards) ? roadmap.cards : [];
    const releases = Array.isArray(roadmap.releases) ? roadmap.releases : [];
    const notes = Array.isArray(roadmap.notes) ? roadmap.notes : [];
    return {
      version: roadmap.version || 0,
      cards: cards.map((card) => ({ id: card.id, title: card.title, stage: card.stage, kind: card.kind, bugSeverity: card.bugSeverity, today: Boolean(card.today), area: card.area, priority: card.priority, releaseId: card.releaseId, targetDate: card.targetDate, archived: Boolean(card.archived) })),
      releases: releases.map((release) => ({ id: release.id, name: release.name, status: release.status, targetDate: release.targetDate })),
      notes: notes.map((note) => ({ id: note.id, title: note.title, body: note.body, color: note.color, pinned: Boolean(note.pinned) })),
      openBugs: cards.filter((card) => !card.archived && card.kind === 'bug' && card.stage !== 'shipped').length,
      eventsOpen: incomingEvents.filter((item) => !item.resolved).length,
      monitors: config.monitors.map(monitorPublic),
    };
  }
  async function addCard(input) {
    const roadmap = await readCurrentRoadmap();
    if (!roadmap) throw new Error('Roadmap data is not ready yet.');
    const cards = Array.isArray(roadmap.cards) ? roadmap.cards : [];
    const releases = Array.isArray(roadmap.releases) ? roadmap.releases : [];
    const kind = ['feature', 'bug', 'polish', 'performance', 'chore'].includes(String(input.kind)) ? String(input.kind) : 'feature';
    const stage = kind === 'bug' ? 'ideas' : 'planned';
    const areas = Array.isArray(roadmap.settings?.areas) && roadmap.settings.areas.length ? roadmap.settings.areas : ['Core'];
    const requestedRelease = typeof input.releaseId === 'string' && releases.some((release) => release.id === input.releaseId) ? input.releaseId : '';
    const activeRelease = releases.find((release) => release.status === 'active')?.id || '';
    const releaseId = requestedRelease || activeRelease;
    const maxOrder = Math.max(0, ...cards.filter((card) => !card.archived && card.stage === stage).map((card) => Number(card.sortOrder) || 0)) + 1000;
    const createdAt = nowIso();
    const card = {
      id: id('card'), title: safeName(input.title, 'Companion item').slice(0, 200), description: typeof input.description === 'string' ? input.description.slice(0, 8000) : '',
      stage, kind, bugSeverity: 'medium', today: Boolean(input.today), area: areas[0], priority: kind === 'bug' ? 'high' : 'normal', effort: 'm', releaseId, startDate: '', targetDate: '',
      labels: ['companion'], checklist: [], blockedBy: [], links: [], updates: [], pinned: false, archived: false, sortOrder: maxOrder, createdAt, updatedAt: createdAt,
    };
    roadmap.cards = [...cards, card];
    roadmap.activity = [...(Array.isArray(roadmap.activity) ? roadmap.activity : []).slice(-299), { id: id('activity'), type: 'created', cardId: card.id, message: `Created “${card.title}” from Wi-Fi companion`, createdAt }];
    await writeExternalRoadmap(roadmap, 'card-added');
    return card;
  }
  async function addNote(input) {
    const roadmap = await readCurrentRoadmap();
    if (!roadmap) throw new Error('Roadmap data is not ready yet.');
    const createdAt = nowIso();
    const note = { id: id('note'), title: safeName(input.title, 'Companion note').slice(0, 160), body: typeof input.body === 'string' ? input.body.slice(0, 20000) : '', color: 'lilac', pinned: false, createdAt, updatedAt: createdAt };
    roadmap.notes = [note, ...(Array.isArray(roadmap.notes) ? roadmap.notes : [])];
    roadmap.activity = [...(Array.isArray(roadmap.activity) ? roadmap.activity : []).slice(-299), { id: id('activity'), type: 'note', message: 'Created a note from Wi-Fi companion', createdAt }];
    await writeExternalRoadmap(roadmap, 'note-added');
    return note;
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/companion')) return html(res, 200, companionHtml());
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, app: 'Deme Roadmap', version: options.app.getVersion(), locked: !options.isUnlocked(), port });
      if (req.method === 'POST' && url.pathname === '/api/pair') {
        if (!options.isUnlocked()) return json(res, 423, { error: 'Unlock Deme Roadmap on the desktop before pairing.' });
        const body = await readBody(req, 64 * 1024);
        const code = String(body.code || '').trim();
        const pair = pairingCodes.get(code);
        if (!pair || pair.expiresAt < Date.now()) { pairingCodes.delete(code); return json(res, 400, { error: 'That pairing code expired or is not valid.' }); }
        pairingCodes.delete(code);
        const token = crypto.randomBytes(32).toString('base64url');
        const device = { id: id('device'), name: safeName(body.name, 'Companion device').slice(0, 80), tokenHash: hashToken(token), createdAt: nowIso(), lastSeen: nowIso() };
        config.devices = [device, ...config.devices].slice(0, 20);
        await saveConfig(); broadcast('device-paired');
        return json(res, 200, { ok: true, token, device: publicDevice(device) });
      }
      if (req.method === 'POST' && url.pathname === `/hook/${config.hookSecret}`) {
        const body = await readBody(req, 512 * 1024);
        const event = await addIncomingEvent(body, 'Webhook');
        return json(res, 202, { ok: true, eventId: event.id });
      }

      const device = await authorize(req, url);
      if (!device) return json(res, 401, { error: 'Pair this device with Deme Roadmap first.' });
      if (req.method === 'GET' && url.pathname === '/api/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`data: ${JSON.stringify({ type: 'connected', at: nowIso() })}\n\n`);
        streamClients.add(res);
        req.on('close', () => streamClients.delete(res));
        return;
      }
      if (!requireDesktopUnlocked(res)) return;
      if (req.method === 'GET' && url.pathname === '/api/snapshot') {
        const value = await snapshot();
        return value ? json(res, 200, value) : json(res, 503, { error: 'Roadmap data is not ready yet.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/card') return json(res, 201, { card: await addCard(await readBody(req, 512 * 1024)) });
      if (req.method === 'POST' && url.pathname === '/api/note') return json(res, 201, { note: await addNote(await readBody(req, 512 * 1024)) });
      if (req.method === 'POST' && url.pathname === '/api/lock') {
        await options.lockSession();
        broadcast('desktop-locked');
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, { events: incomingEvents.slice(0, 100) });
      if (req.method === 'POST' && url.pathname === '/api/events') return json(res, 201, { event: await addIncomingEvent(await readBody(req, 512 * 1024), device.name) });
      if (req.method === 'GET' && url.pathname === '/api/attachments') return json(res, 200, { attachments: attachments.slice(0, 100) });
      if (req.method === 'POST' && url.pathname === '/api/attachment') {
        const body = await readBody(req, MAX_BODY);
        const buffer = Buffer.from(String(body.dataBase64 || ''), 'base64');
        if (buffer.length > MAX_ATTACHMENT) return json(res, 413, { error: 'Attachments are limited to 20 MB.' });
        const record = await storeAttachment({ name: body.name, mime: body.mime, buffer, source: body.source || device.name, targetType: body.targetType, targetId: body.targetId });
        return json(res, 201, { attachment: record });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/attachment/')) {
        const attachmentId = decodeURIComponent(url.pathname.slice('/api/attachment/'.length));
        const record = attachments.find((item) => item.id === attachmentId);
        if (!record) return json(res, 404, { error: 'Attachment not found.' });
        const filePath = path.join(attachmentsDir, record.storedName);
        const buffer = await fs.readFile(filePath);
        res.writeHead(200, { 'Content-Type': record.mime || 'application/octet-stream', 'Content-Length': buffer.length, 'Content-Disposition': `inline; filename="${record.name.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff' });
        return res.end(buffer);
      }
      return json(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (error?.code === 'BODY_TOO_LARGE') return json(res, 413, { error: error.message });
      if (error?.code === 'BAD_JSON') return json(res, 400, { error: error.message });
      options.log?.(`LAN request failed ${req.method} ${req.url}: ${error.stack || error.message || String(error)}`);
      return json(res, 500, { error: 'The Roadmap backend could not complete that request.' });
    }
  }

  async function listen(preferredPort) {
    return new Promise((resolve, reject) => {
      const candidate = http.createServer(handle);
      candidate.keepAliveTimeout = 30_000;
      candidate.headersTimeout = 35_000;
      const onError = (error) => { candidate.removeAllListeners(); reject(error); };
      candidate.once('error', onError);
      candidate.listen(preferredPort, '0.0.0.0', () => {
        candidate.removeListener('error', onError);
        server = candidate;
        port = candidate.address().port;
        resolve();
      });
    });
  }
  try { await listen(DEFAULT_PORT); }
  catch (error) {
    if (error && error.code === 'EADDRINUSE') await listen(0);
    else throw error;
  }
  await fs.mkdir(attachmentsDir, { recursive: true });
  options.log?.(`Connected Workspace backend listening on ${primaryUrl()} (${loopbackUrl()})`);
  monitorTimer = setInterval(() => { checkMonitors().catch((error) => options.log?.(`Monitor check failed: ${error.message || error}`)); }, 60_000);
  monitorTimer.unref?.();
  if (config.monitors.length) checkMonitors().catch(() => undefined);

  return {
    status,
    createPairing,
    listDevices: () => config.devices.map(publicDevice),
    revokeDevice,
    listEvents: () => incomingEvents.slice(0, 500),
    resolveEvent,
    deleteEvent,
    addIncomingEvent,
    listAttachments: () => attachments.slice(0, 1000),
    chooseAttachment,
    deleteAttachment,
    revealAttachment,
    listMonitors: () => config.monitors.map(monitorPublic),
    addMonitor,
    removeMonitor,
    checkMonitors,
    broadcast,
    async openCompanion() {
      const url = primaryUrl() || loopbackUrl();
      if (!url) return { ok: false, error: 'The Wi-Fi backend is not running.' };
      await options.shell.openExternal(url);
      return { ok: true };
    },
    async stop() {
      if (monitorTimer) clearInterval(monitorTimer);
      for (const client of streamClients) { try { client.end(); } catch { /* ignore */ } }
      streamClients.clear();
      if (!server) return;
      await new Promise((resolve) => server.close(() => resolve()));
      server = null;
    },
  };
}

module.exports = { startLanServer };
