const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const QRCode = require('qrcode');

const DEFAULT_PORT = 43165;
const MAX_JSON_BODY = 512 * 1024;
const MAX_ATTACHMENT = 20 * 1024 * 1024;
const MAX_ATTACHMENT_BODY = 28 * 1024 * 1024;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const APPROVAL_TTL_MS = 5 * 60 * 1000;
const STREAM_TICKET_TTL_MS = 60 * 1000;
const PAIR_RATE_WINDOW_MS = 60 * 1000;
const PAIR_RATE_MAX = 8;
const PAIR_RATE_BLOCK_MS = 2 * 60 * 1000;

function nowIso() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function hashToken(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function safeText(value, fallback = '', max = 200) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, max);
}
function safeFileName(value) {
  const cleaned = String(value || 'attachment').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();
  return (cleaned || 'attachment').slice(0, 160);
}
function serialisableObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const text = JSON.stringify(value);
    if (text.length > 32_000) return {};
    return JSON.parse(text);
  } catch { return {}; }
}
function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}
function html(res, status, body) {
  const payload = Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  });
  res.end(payload);
}
async function readBody(req, limit = MAX_JSON_BODY) {
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
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
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
  } catch { return fallback; }
}
function normaliseRemoteAddress(value) {
  const raw = String(value || '').split('%')[0].toLowerCase();
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}
function isAllowedRemoteAddress(value) {
  const address = normaliseRemoteAddress(value);
  if (!address) return false;
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true;
  if (address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb')) return true;
  if (address.startsWith('fc') || address.startsWith('fd')) return true;
  const parts = address.split('.').map((item) => Number(item));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 127) return true;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  return false;
}
function lanIpv4Addresses() {
  const values = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      if (!isAllowedRemoteAddress(entry.address)) continue;
      values.push(entry.address);
    }
  }
  return [...new Set(values)];
}
function emptyNetworkConfig() {
  return { version: 2, webhookSecret: crypto.randomBytes(32).toString('base64url'), devices: [], monitors: [] };
}
function validMonitorUrl(value) {
  try {
    const url = new URL(String(value));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch { return ''; }
}
function normaliseNetworkConfig(raw) {
  const fallback = emptyNetworkConfig();
  const source = raw && typeof raw === 'object' ? raw : {};
  const legacySecret = typeof source.hookSecret === 'string' ? source.hookSecret : '';
  const devices = Array.isArray(source.devices) ? source.devices.filter(Boolean).map((item) => ({
    id: typeof item.id === 'string' ? item.id : id('device'),
    name: safeText(item.name, 'Paired device', 80),
    deviceType: safeText(item.deviceType, 'Companion', 40),
    userAgent: safeText(item.userAgent, '', 240),
    tokenHash: typeof item.tokenHash === 'string' ? item.tokenHash : '',
    pairedAt: typeof item.pairedAt === 'string' ? item.pairedAt : (typeof item.createdAt === 'string' ? item.createdAt : nowIso()),
    lastSeen: typeof item.lastSeen === 'string' ? item.lastSeen : '',
  })).filter((item) => item.tokenHash) : [];
  const monitors = Array.isArray(source.monitors) ? source.monitors.map((item) => {
    const url = validMonitorUrl(item?.url);
    if (!url) return null;
    return { id: typeof item.id === 'string' ? item.id : id('monitor'), name: safeText(item.name, new URL(url).hostname, 80), url, createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso() };
  }).filter(Boolean) : [];
  return {
    version: 2,
    webhookSecret: typeof source.webhookSecret === 'string' && source.webhookSecret.length >= 24 ? source.webhookSecret : (legacySecret.length >= 24 ? legacySecret : fallback.webhookSecret),
    devices,
    monitors,
  };
}
function publicDevice(device) {
  return { id: device.id, name: device.name, deviceType: device.deviceType, userAgent: device.userAgent, pairedAt: device.pairedAt, lastSeen: device.lastSeen || '' };
}
function isAllowedAttachment(name, mime) {
  const extension = path.extname(String(name || '')).toLowerCase();
  const allowedExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm', '.mov', '.pdf', '.txt', '.log', '.json', '.csv']);
  if (!allowedExt.has(extension)) return false;
  const value = String(mime || '').toLowerCase();
  if (!value) return true;
  return value.startsWith('image/') || value.startsWith('video/') || value.startsWith('text/') || ['application/pdf', 'application/json', 'application/octet-stream'].includes(value);
}

let companionTemplate = '';
function companionHtml() { return companionTemplate.replaceAll('__MAX_ATTACHMENT__', String(MAX_ATTACHMENT)); }

async function startLanServer(options) {
  companionTemplate = await fs.readFile(path.join(__dirname, 'companion.html'), 'utf8');
  const startedAt = Date.now();
  const userData = options.app.getPath('userData');
  const configPath = path.join(userData, 'network.json');
  const eventsPath = path.join(userData, 'incoming-events.json');
  const attachmentsPath = path.join(userData, 'attachments.json');
  const attachmentsDir = path.join(userData, 'attachments');
  let config = normaliseNetworkConfig(await readJson(configPath, emptyNetworkConfig()));
  const initialEvents = await readJson(eventsPath, []);
  const initialAttachments = await readJson(attachmentsPath, []);
  let incomingEvents = Array.isArray(initialEvents) ? initialEvents : [];
  let attachments = Array.isArray(initialAttachments) ? initialAttachments : [];
  await atomicJson(configPath, config);
  await fs.mkdir(attachmentsDir, { recursive: true });

  const pairingSessions = new Map();
  const pendingPairings = new Map();
  const streamTickets = new Map();
  const streamClients = new Set();
  const pairRate = new Map();
  const sockets = new Set();
  const monitorStatus = new Map();
  let server = null;
  let port = 0;
  let monitorTimer = null;
  let lastError = '';

  function addresses() { return lanIpv4Addresses(); }
  function primaryUrl() {
    const address = addresses()[0];
    return address && port ? `http://${address}:${port}` : port ? `http://127.0.0.1:${port}` : '';
  }
  function loopbackUrl() { return port ? `http://127.0.0.1:${port}` : ''; }
  function webhookUrl() { return primaryUrl() ? `${primaryUrl()}/api/webhook` : ''; }
  function attachmentBytes() { return attachments.reduce((sum, item) => sum + (Number(item.size) || 0), 0); }
  function cleanupEphemeral() {
    const now = Date.now();
    for (const [key, item] of pairingSessions) if (item.expiresAt <= now) pairingSessions.delete(key);
    for (const [key, item] of pendingPairings) if (item.expiresAt <= now || (item.deliveredAt && item.deliveredAt + 60_000 <= now)) pendingPairings.delete(key);
    for (const [key, item] of streamTickets) if (item.expiresAt <= now) streamTickets.delete(key);
    for (const [key, item] of pairRate) if (item.windowStart + PAIR_RATE_WINDOW_MS * 2 <= now && item.blockedUntil <= now) pairRate.delete(key);
  }
  function pendingPublic(item) {
    return { id: item.id, name: item.name, deviceType: item.deviceType, userAgent: item.userAgent, requestedAt: item.requestedAt, expiresAt: new Date(item.expiresAt).toISOString(), status: item.status };
  }
  function monitorPublic(item) {
    return { ...item, ...(monitorStatus.get(item.id) || { state: 'unknown', statusCode: 0, latencyMs: 0, checkedAt: '', error: '' }) };
  }
  function status() {
    cleanupEphemeral();
    return {
      running: Boolean(server?.listening), port, addresses: addresses(), primaryUrl: primaryUrl(), loopbackUrl: loopbackUrl(), webhookUrl: webhookUrl(),
      pairedDevices: config.devices.length, devices: config.devices.map(publicDevice), pendingPairings: [...pendingPairings.values()].filter((item) => item.status === 'pending').map(pendingPublic),
      monitors: config.monitors.map(monitorPublic), eventsTotal: incomingEvents.length, eventsUnread: incomingEvents.filter((item) => !item.read && !item.archived).length,
      attachmentsCount: attachments.length, attachmentBytes: attachmentBytes(), activeConnections: sockets.size, liveStreams: streamClients.size,
      startedAt: new Date(startedAt).toISOString(), uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)), lastError,
      backendLogPath: options.backendLogPath || '',
    };
  }
  async function saveConfig() { await atomicJson(configPath, config); }
  async function saveEvents() { await atomicJson(eventsPath, incomingEvents.slice(0, 1000)); }
  async function saveAttachments() { await atomicJson(attachmentsPath, attachments.slice(0, 2000)); }
  function notifyDesktopNetwork() { options.notifyNetworkChanged?.(); }
  function broadcast(type, payload = {}) {
    const line = `data: ${JSON.stringify({ type, at: nowIso(), ...payload })}\n\n`;
    for (const client of [...streamClients]) {
      try { client.write(line); } catch { streamClients.delete(client); }
    }
    notifyDesktopNetwork();
  }
  function requireUnlocked(res) {
    if (options.isUnlocked()) return true;
    json(res, 423, { error: 'Deme Roadmap is locked on the desktop.' });
    return false;
  }
  function checkPairRate(remote) {
    const now = Date.now();
    const current = pairRate.get(remote) || { windowStart: now, count: 0, blockedUntil: 0 };
    if (current.blockedUntil > now) return { ok: false, retryMs: current.blockedUntil - now };
    if (now - current.windowStart >= PAIR_RATE_WINDOW_MS) { current.windowStart = now; current.count = 0; }
    current.count += 1;
    if (current.count > PAIR_RATE_MAX) current.blockedUntil = now + PAIR_RATE_BLOCK_MS;
    pairRate.set(remote, current);
    return current.blockedUntil > now ? { ok: false, retryMs: PAIR_RATE_BLOCK_MS } : { ok: true };
  }
  async function authorize(req, url) {
    const header = String(req.headers.authorization || '');
    const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!raw) return null;
    const hashed = hashToken(raw);
    const device = config.devices.find((item) => item.tokenHash === hashed);
    if (!device) return null;
    const previous = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    device.lastSeen = nowIso();
    if (Date.now() - previous > 60_000) saveConfig().catch(() => undefined);
    return device;
  }
  async function readCurrentRoadmap() {
    try { return await options.readRoadmap(); } catch { return null; }
  }
  async function mutateCanonical(mutator, eventType) {
    let result;
    if (typeof options.mutateRoadmap === 'function') {
      result = await options.mutateRoadmap(mutator);
    } else {
      const roadmap = await readCurrentRoadmap();
      if (!roadmap) throw new Error('Roadmap data is not ready yet.');
      result = await mutator(roadmap);
      await options.writeRoadmap(roadmap, 'companion');
    }
    options.notifyRoadmapChanged?.();
    broadcast(eventType || 'roadmap-changed', { revision: options.getRoadmapRevision?.() ?? 0 });
    return result;
  }
  async function createPairing() {
    cleanupEphemeral();
    if (!server?.listening) throw new Error('The Wi-Fi backend is not running.');
    let code = '';
    do { code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); } while (pairingSessions.has(code));
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    pairingSessions.set(code, { code, expiresAt });
    const url = `${primaryUrl() || loopbackUrl()}/?pair=${encodeURIComponent(code)}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: '#66546fff', light: '#fffafdff' } });
    options.log?.(`Pairing session created; expires in ${Math.round(PAIRING_TTL_MS / 60000)} minutes.`);
    broadcast('pairing-session');
    return { code, url, qrDataUrl, expiresAt: new Date(expiresAt).toISOString() };
  }
  function listPendingPairings() {
    cleanupEphemeral();
    return [...pendingPairings.values()].filter((item) => item.status === 'pending').map(pendingPublic);
  }
  async function approvePairing(requestId) {
    cleanupEphemeral();
    const pending = pendingPairings.get(requestId);
    if (!pending || pending.status !== 'pending') return { ok: false, error: 'Pairing request is no longer pending.' };
    const token = crypto.randomBytes(32).toString('base64url');
    const device = { id: id('device'), name: pending.name, deviceType: pending.deviceType, userAgent: pending.userAgent, tokenHash: hashToken(token), pairedAt: nowIso(), lastSeen: '' };
    config.devices = [device, ...config.devices].slice(0, 50);
    pending.status = 'approved'; pending.approvedToken = token; pending.approvedAt = Date.now(); pending.expiresAt = Date.now() + 2 * 60 * 1000;
    await saveConfig();
    options.log?.(`Pairing approved for ${device.name} (${device.deviceType}).`);
    broadcast('pairing-approved', { requestId });
    return { ok: true, device: publicDevice(device) };
  }
  async function rejectPairing(requestId) {
    const pending = pendingPairings.get(requestId);
    if (!pending || pending.status !== 'pending') return { ok: false, error: 'Pairing request is no longer pending.' };
    pending.status = 'rejected'; pending.expiresAt = Date.now() + 60_000;
    options.log?.(`Pairing rejected for ${pending.name}.`);
    broadcast('pairing-rejected', { requestId });
    return { ok: true };
  }
  async function revokeDevice(deviceId) {
    const device = config.devices.find((item) => item.id === deviceId);
    if (!device) return { ok: false, error: 'Device not found.' };
    config.devices = config.devices.filter((item) => item.id !== deviceId);
    await saveConfig(); options.log?.(`Paired device revoked: ${device.name}.`); broadcast('device-revoked'); return { ok: true };
  }
  async function revokeAllDevices() {
    const count = config.devices.length;
    config.devices = [];
    await saveConfig(); options.log?.(`Revoked ${count} paired device(s).`); broadcast('devices-revoked'); return { ok: true, count };
  }
  async function regenerateWebhookSecret() {
    config.webhookSecret = crypto.randomBytes(32).toString('base64url');
    await saveConfig(); options.log?.('Incoming webhook secret regenerated.'); broadcast('webhook-secret-regenerated');
    return { ok: true, webhookSecret: config.webhookSecret };
  }
  function webhookSecret() { return config.webhookSecret; }

  function normaliseEvent(input, sourceFallback = 'Roadmap') {
    const severityValues = ['info', 'warning', 'high', 'critical'];
    const severity = severityValues.includes(String(input.severity)) ? String(input.severity) : 'info';
    const timestamp = typeof input.timestamp === 'string' && !Number.isNaN(Date.parse(input.timestamp)) ? new Date(input.timestamp).toISOString() : nowIso();
    let externalUrl = '';
    if (typeof input.externalUrl === 'string' && input.externalUrl) {
      try { const url = new URL(input.externalUrl); if (['http:', 'https:'].includes(url.protocol)) externalUrl = url.toString(); } catch { /* ignore */ }
    }
    return {
      id: id('event'), source: safeText(input.source, sourceFallback, 80), eventType: safeText(input.eventType, 'event', 80), title: safeText(input.title, 'Incoming event', 180),
      summary: typeof input.summary === 'string' ? input.summary.slice(0, 12_000) : (typeof input.details === 'string' ? input.details.slice(0, 12_000) : ''), severity,
      timestamp, read: false, archived: false, metadata: serialisableObject(input.metadata), externalUrl, linkedCardId: '', createdAt: nowIso(), updatedAt: nowIso(),
    };
  }
  async function addIncomingEvent(input, sourceFallback = 'Roadmap') {
    const event = normaliseEvent(input || {}, sourceFallback);
    incomingEvents = [event, ...incomingEvents].slice(0, 1000);
    await saveEvents(); broadcast('incoming-event', { eventId: event.id }); return event;
  }
  async function updateEvent(eventId, patch) {
    let found = null;
    incomingEvents = incomingEvents.map((item) => {
      if (item.id !== eventId) return item;
      found = { ...item, read: typeof patch.read === 'boolean' ? patch.read : item.read, archived: typeof patch.archived === 'boolean' ? patch.archived : item.archived, updatedAt: nowIso() };
      return found;
    });
    if (!found) return { ok: false, error: 'Event not found.' };
    await saveEvents(); broadcast('event-updated', { eventId }); return { ok: true, event: found };
  }
  async function deleteEvent(eventId) {
    const before = incomingEvents.length;
    incomingEvents = incomingEvents.filter((item) => item.id !== eventId);
    if (incomingEvents.length === before) return { ok: false, error: 'Event not found.' };
    await saveEvents(); broadcast('event-deleted', { eventId }); return { ok: true };
  }
  async function convertEvent(eventId, conversion = 'bug') {
    const event = incomingEvents.find((item) => item.id === eventId);
    if (!event) return { ok: false, error: 'Event not found.' };
    if (event.linkedCardId) return { ok: true, cardId: event.linkedCardId };
    const cardId = await mutateCanonical(async (roadmap) => {
      const kind = conversion === 'bug' ? 'bug' : 'chore';
      const stage = conversion === 'bug' ? 'ideas' : 'planned';
      const cards = Array.isArray(roadmap.cards) ? roadmap.cards : [];
      const releases = Array.isArray(roadmap.releases) ? roadmap.releases : [];
      const areas = Array.isArray(roadmap.settings?.areas) && roadmap.settings.areas.length ? roadmap.settings.areas : ['Core'];
      const activeRelease = releases.find((release) => release.status === 'active')?.id || '';
      const maxOrder = Math.max(0, ...cards.filter((card) => !card.archived && card.stage === stage).map((card) => Number(card.sortOrder) || 0)) + 1000;
      const createdAt = nowIso();
      const nextCardId = id('card');
      const card = {
        id: nextCardId, title: event.title, description: [event.summary, `Incoming event: ${event.source} · ${event.eventType}`, event.externalUrl].filter(Boolean).join('\n\n'), stage, kind,
        bugSeverity: event.severity === 'critical' ? 'blocker' : event.severity === 'high' ? 'high' : event.severity === 'warning' ? 'medium' : 'low', today: event.severity === 'critical',
        area: areas[0], priority: event.severity === 'critical' ? 'critical' : event.severity === 'high' ? 'high' : 'normal', effort: 'm', releaseId: activeRelease,
        startDate: '', targetDate: '', labels: ['incoming', safeText(event.source, 'event', 40).toLowerCase().replace(/\s+/g, '-')], checklist: [], blockedBy: [],
        links: event.externalUrl ? [{ id: id('link'), label: 'Source event', url: event.externalUrl }] : [], updates: [{ id: id('update'), text: `Created from Incoming event ${event.id}`, createdAt }],
        pinned: false, archived: false, sortOrder: maxOrder, createdAt, updatedAt: createdAt,
      };
      roadmap.cards = [...cards, card];
      roadmap.activity = [...(Array.isArray(roadmap.activity) ? roadmap.activity : []).slice(-299), { id: id('activity'), type: 'created', cardId: nextCardId, message: `Created “${card.title}” from Incoming`, createdAt }];
      return nextCardId;
    }, 'event-converted');
    event.linkedCardId = cardId; event.read = true; event.updatedAt = nowIso();
    await saveEvents(); broadcast('event-linked', { eventId, cardId });
    return { ok: true, cardId };
  }

  async function storeAttachment({ name, mime, buffer, source = 'desktop', ownerType = 'general', ownerId = '' }) {
    if (!Buffer.isBuffer(buffer) || buffer.length <= 0) throw new Error('Attachment is empty.');
    if (buffer.length > MAX_ATTACHMENT) throw new Error('Attachments are limited to 20 MB.');
    const originalName = safeFileName(name);
    if (!isAllowedAttachment(originalName, mime)) throw new Error('That file type is not allowed. Use images, small MP4/WebM/MOV videos, PDFs, or text/log/JSON/CSV files.');
    const attachmentId = id('file');
    const extension = path.extname(originalName).toLowerCase().slice(0, 10);
    const storedName = `${attachmentId}${extension}`;
    const filePath = path.join(attachmentsDir, storedName);
    await fs.writeFile(filePath, buffer);
    const record = { id: attachmentId, fileName: originalName, mimeType: safeText(mime, 'application/octet-stream', 120), size: buffer.length, createdAt: nowIso(), ownerType: safeText(ownerType, 'general', 40), ownerId: safeText(ownerId, '', 120), source: safeText(source, 'desktop', 80), storedName };
    attachments = [record, ...attachments].slice(0, 2000);
    await saveAttachments(); broadcast('attachment-added', { attachmentId }); return record;
  }
  async function chooseAttachment(parentWindow, ownerType = 'general', ownerId = '') {
    const result = await options.dialog.showOpenDialog(parentWindow, { title: 'Add attachment', properties: ['openFile'], filters: [{ name: 'Roadmap evidence', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'pdf', 'txt', 'log', 'json', 'csv'] }] });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_ATTACHMENT) return { canceled: false, error: 'Attachments are limited to 20 MB.' };
    const buffer = await fs.readFile(filePath);
    try { return { canceled: false, attachment: await storeAttachment({ name: path.basename(filePath), mime: '', buffer, source: 'desktop', ownerType, ownerId }) }; }
    catch (error) { return { canceled: false, error: error.message || String(error) }; }
  }
  async function addAttachmentFromBase64(input) {
    const raw = String(input?.dataBase64 || '');
    if (!raw || raw.length > MAX_ATTACHMENT_BODY * 1.5) throw new Error('Attachment payload is invalid.');
    const buffer = Buffer.from(raw, 'base64');
    return storeAttachment({ name: input.name, mime: input.mime, buffer, source: input.source || 'companion', ownerType: input.ownerType || input.targetType, ownerId: input.ownerId || input.targetId });
  }
  async function deleteAttachment(attachmentId) {
    const record = attachments.find((item) => item.id === attachmentId);
    if (!record) return { ok: false, error: 'Attachment not found.' };
    attachments = attachments.filter((item) => item.id !== attachmentId);
    try { await fs.unlink(path.join(attachmentsDir, record.storedName)); } catch { /* best effort */ }
    await saveAttachments(); broadcast('attachment-deleted', { attachmentId }); return { ok: true };
  }
  async function revealAttachment(attachmentId) {
    const record = attachments.find((item) => item.id === attachmentId);
    if (!record) return { ok: false, error: 'Attachment not found.' };
    options.shell.showItemInFolder(path.join(attachmentsDir, record.storedName)); return { ok: true };
  }
  async function openAttachment(attachmentId) {
    const record = attachments.find((item) => item.id === attachmentId);
    if (!record) return { ok: false, error: 'Attachment not found.' };
    const error = await options.shell.openPath(path.join(attachmentsDir, record.storedName));
    return error ? { ok: false, error } : { ok: true };
  }
  async function attachmentPreview(attachmentId) {
    const record = attachments.find((item) => item.id === attachmentId);
    if (!record || !String(record.mimeType || '').startsWith('image/') || record.size > 5 * 1024 * 1024) return { ok: false };
    try {
      const buffer = await fs.readFile(path.join(attachmentsDir, record.storedName));
      return { ok: true, dataUrl: `data:${record.mimeType};base64,${buffer.toString('base64')}` };
    } catch { return { ok: false }; }
  }
  async function attachmentTargets() {
    const roadmap = await readCurrentRoadmap();
    const targets = [{ type: 'general', id: '', label: 'General workspace' }];
    for (const card of Array.isArray(roadmap?.cards) ? roadmap.cards : []) if (!card.archived) targets.push({ type: 'card', id: card.id, label: `Work · ${card.title}` });
    for (const note of Array.isArray(roadmap?.notes) ? roadmap.notes : []) targets.push({ type: 'note', id: note.id, label: `Note · ${note.title || 'Untitled note'}` });
    for (const event of incomingEvents.filter((item) => !item.archived)) targets.push({ type: 'event', id: event.id, label: `Incoming · ${event.title}` });
    return targets.slice(0, 1000);
  }

  async function runMonitor(item) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(item.url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': `Deme-Roadmap/${options.app.getVersion()}` } });
      try { await response.body?.cancel(); } catch { /* ignore */ }
      const value = { state: response.status >= 500 ? 'offline' : response.status >= 400 ? 'warning' : 'online', statusCode: response.status, latencyMs: Date.now() - started, checkedAt: nowIso(), error: '' };
      monitorStatus.set(item.id, value); return value;
    } catch (error) {
      const value = { state: 'offline', statusCode: 0, latencyMs: Date.now() - started, checkedAt: nowIso(), error: error.name === 'AbortError' ? 'Timed out' : safeText(error.message, 'Request failed', 200) };
      monitorStatus.set(item.id, value); return value;
    } finally { clearTimeout(timeout); }
  }
  async function checkMonitors() { await Promise.all(config.monitors.map(runMonitor)); broadcast('monitors-updated'); return config.monitors.map(monitorPublic); }
  async function addMonitor(name, urlValue) {
    const url = validMonitorUrl(urlValue);
    if (!url) return { ok: false, error: 'Use a valid http:// or https:// URL.' };
    const monitor = { id: id('monitor'), name: safeText(name, new URL(url).hostname, 80), url, createdAt: nowIso() };
    config.monitors.push(monitor); await saveConfig(); await runMonitor(monitor); broadcast('monitor-added'); return { ok: true, monitor: monitorPublic(monitor) };
  }
  async function removeMonitor(monitorId) {
    const before = config.monitors.length; config.monitors = config.monitors.filter((item) => item.id !== monitorId); monitorStatus.delete(monitorId);
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
      revision: options.getRoadmapRevision?.() ?? 0,
      cards: cards.map((card) => ({ id: card.id, title: card.title, description: card.description || '', stage: card.stage, kind: card.kind, bugSeverity: card.bugSeverity, today: Boolean(card.today), area: card.area, priority: card.priority, releaseId: card.releaseId, startDate: card.startDate || '', targetDate: card.targetDate || '', archived: Boolean(card.archived), updatedAt: card.updatedAt })),
      releases: releases.map((release) => ({ id: release.id, name: release.name, status: release.status, targetDate: release.targetDate || '', notes: release.notes || '' })),
      notes: notes.map((note) => ({ id: note.id, title: note.title, body: note.body, color: note.color, pinned: Boolean(note.pinned), updatedAt: note.updatedAt })),
      events: incomingEvents.filter((item) => !item.archived).slice(0, 80),
      attachmentSummary: { count: attachments.length, bytes: attachmentBytes() },
    };
  }
  async function addCard(input) {
    return mutateCanonical(async (roadmap) => {
      const cards = Array.isArray(roadmap.cards) ? roadmap.cards : [];
      const releases = Array.isArray(roadmap.releases) ? roadmap.releases : [];
      const kind = ['feature', 'bug', 'polish', 'performance', 'chore'].includes(String(input.kind)) ? String(input.kind) : 'feature';
      const stage = ['ideas', 'planned', 'progress', 'testing', 'shipped'].includes(String(input.stage)) ? String(input.stage) : (kind === 'bug' ? 'ideas' : 'planned');
      const priority = ['low', 'normal', 'high', 'critical'].includes(String(input.priority)) ? String(input.priority) : (kind === 'bug' ? 'high' : 'normal');
      const bugSeverity = ['low', 'medium', 'high', 'blocker'].includes(String(input.bugSeverity)) ? String(input.bugSeverity) : (kind === 'bug' ? 'medium' : 'low');
      const areas = Array.isArray(roadmap.settings?.areas) && roadmap.settings.areas.length ? roadmap.settings.areas : ['Core'];
      const requestedRelease = typeof input.releaseId === 'string' && releases.some((release) => release.id === input.releaseId) ? input.releaseId : '';
      const activeRelease = releases.find((release) => release.status === 'active')?.id || '';
      const maxOrder = Math.max(0, ...cards.filter((card) => !card.archived && card.stage === stage).map((card) => Number(card.sortOrder) || 0)) + 1000;
      const createdAt = nowIso();
      const card = {
        id: id('card'), title: safeText(input.title, 'Companion item', 200), description: typeof input.description === 'string' ? input.description.slice(0, 12_000) : '', stage, kind, bugSeverity, today: Boolean(input.today),
        area: areas.includes(input.area) ? input.area : areas[0], priority, effort: 'm', releaseId: requestedRelease || activeRelease, startDate: '', targetDate: safeText(input.targetDate, '', 20), labels: ['companion'], checklist: [], blockedBy: [], links: [], updates: [], pinned: false, archived: false, sortOrder: maxOrder, createdAt, updatedAt: createdAt,
      };
      roadmap.cards = [...cards, card];
      roadmap.activity = [...(Array.isArray(roadmap.activity) ? roadmap.activity : []).slice(-299), { id: id('activity'), type: 'created', cardId: card.id, message: `Created “${card.title}” from Wi-Fi companion`, createdAt }];
      return card;
    }, 'card-added');
  }
  async function updateCard(cardId, patch) {
    return mutateCanonical(async (roadmap) => {
      const cards = Array.isArray(roadmap.cards) ? roadmap.cards : [];
      const releases = Array.isArray(roadmap.releases) ? roadmap.releases : [];
      let changed = null;
      roadmap.cards = cards.map((card) => {
        if (card.id !== cardId) return card;
        const next = { ...card };
        if (typeof patch.title === 'string' && patch.title.trim()) next.title = safeText(patch.title, card.title, 200);
        if (typeof patch.description === 'string') next.description = patch.description.slice(0, 12_000);
        if (['ideas', 'planned', 'progress', 'testing', 'shipped'].includes(String(patch.stage))) next.stage = String(patch.stage);
        if (['low', 'normal', 'high', 'critical'].includes(String(patch.priority))) next.priority = String(patch.priority);
        if (['low', 'medium', 'high', 'blocker'].includes(String(patch.bugSeverity))) next.bugSeverity = String(patch.bugSeverity);
        if (typeof patch.today === 'boolean') next.today = patch.today;
        if (typeof patch.releaseId === 'string' && (!patch.releaseId || releases.some((release) => release.id === patch.releaseId))) next.releaseId = patch.releaseId;
        next.updatedAt = nowIso(); changed = next; return next;
      });
      if (!changed) {
        const error = new Error('Roadmap item not found.'); error.code = 'NOT_FOUND'; throw error;
      }
      return changed;
    }, 'card-updated').then((card) => ({ ok: true, card })).catch((error) => error?.code === 'NOT_FOUND' ? ({ ok: false, error: error.message }) : Promise.reject(error));
  }
  async function addNote(input) {
    return mutateCanonical(async (roadmap) => {
      const createdAt = nowIso();
      const note = { id: id('note'), title: safeText(input.title, 'Companion note', 160), body: typeof input.body === 'string' ? input.body.slice(0, 30_000) : '', color: 'lilac', pinned: Boolean(input.pinned), createdAt, updatedAt: createdAt };
      roadmap.notes = [note, ...(Array.isArray(roadmap.notes) ? roadmap.notes : [])];
      roadmap.activity = [...(Array.isArray(roadmap.activity) ? roadmap.activity : []).slice(-299), { id: id('activity'), type: 'note', message: 'Created a note from Wi-Fi companion', createdAt }];
      return note;
    }, 'note-added');
  }
  async function updateNote(noteId, patch) {
    return mutateCanonical(async (roadmap) => {
      let changed = null;
      roadmap.notes = (Array.isArray(roadmap.notes) ? roadmap.notes : []).map((note) => {
        if (note.id !== noteId) return note;
        const next = { ...note };
        if (typeof patch.title === 'string') next.title = patch.title.slice(0, 160);
        if (typeof patch.body === 'string') next.body = patch.body.slice(0, 30_000);
        if (typeof patch.pinned === 'boolean') next.pinned = patch.pinned;
        next.updatedAt = nowIso(); changed = next; return next;
      });
      if (!changed) { const error = new Error('Note not found.'); error.code = 'NOT_FOUND'; throw error; }
      return changed;
    }, 'note-updated').then((note) => ({ ok: true, note })).catch((error) => error?.code === 'NOT_FOUND' ? ({ ok: false, error: error.message }) : Promise.reject(error));
  }

  async function handle(req, res) {
    const remote = normaliseRemoteAddress(req.socket.remoteAddress);
    if (!isAllowedRemoteAddress(remote)) { options.log?.(`Rejected non-LAN request from ${remote || 'unknown address'}.`); return json(res, 403, { error: 'Deme Roadmap only accepts localhost and private LAN connections.' }); }
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/companion')) return html(res, 200, companionHtml());
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, app: 'Deme Roadmap', version: options.app.getVersion(), locked: !options.isUnlocked(), port });

      if (req.method === 'POST' && url.pathname === '/api/pair/request') {
        if (!requireUnlocked(res)) return;
        const rate = checkPairRate(remote);
        if (!rate.ok) return json(res, 429, { error: 'Too many pairing attempts. Try again in a couple of minutes.' });
        cleanupEphemeral();
        const body = await readBody(req, 64 * 1024);
        const code = String(body.code || '').trim();
        const session = pairingSessions.get(code);
        if (!/^\d{6}$/.test(code) || !session || session.expiresAt <= Date.now()) return json(res, 400, { error: 'That pairing code expired or is not valid.' });
        pairingSessions.delete(code);
        const requestId = id('pair');
        const receipt = crypto.randomBytes(24).toString('base64url');
        const pending = { id: requestId, receiptHash: hashToken(receipt), name: safeText(body.name, 'Companion device', 80), deviceType: safeText(body.deviceType, 'Companion', 40), userAgent: safeText(body.userAgent || req.headers['user-agent'], '', 240), requestedAt: nowIso(), expiresAt: Date.now() + APPROVAL_TTL_MS, status: 'pending', approvedToken: '', approvedAt: 0, deliveredAt: 0 };
        pendingPairings.set(requestId, pending);
        options.log?.(`Pairing approval requested by ${pending.name} (${pending.deviceType}).`); broadcast('pairing-requested', { requestId });
        return json(res, 202, { ok: true, requestId, receipt, status: 'pending', expiresAt: new Date(pending.expiresAt).toISOString() });
      }
      if (req.method === 'GET' && url.pathname === '/api/pair/status') {
        cleanupEphemeral();
        const requestId = String(url.searchParams.get('requestId') || '');
        const receipt = String(url.searchParams.get('receipt') || '');
        const pending = pendingPairings.get(requestId);
        if (!pending || !receipt || hashToken(receipt) !== pending.receiptHash) return json(res, 404, { error: 'Pairing request was not found.' });
        if (pending.status === 'rejected') return json(res, 200, { status: 'rejected' });
        if (pending.status === 'approved') {
          if (!pending.approvedToken) return json(res, 410, { error: 'Pairing token was already collected.' });
          const token = pending.approvedToken; pending.approvedToken = ''; pending.deliveredAt = Date.now();
          return json(res, 200, { status: 'approved', token });
        }
        return json(res, 200, { status: 'pending', expiresAt: new Date(pending.expiresAt).toISOString() });
      }
      if (req.method === 'POST' && url.pathname === '/api/webhook') {
        if (!requireUnlocked(res)) return;
        const header = String(req.headers.authorization || '');
        const supplied = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-deme-webhook-token'] || '');
        if (!supplied || hashToken(supplied) !== hashToken(config.webhookSecret)) return json(res, 401, { error: 'Webhook token is not valid.' });
        const event = await addIncomingEvent(await readBody(req, MAX_JSON_BODY), 'Webhook');
        return json(res, 202, { ok: true, eventId: event.id });
      }

      if (req.method === 'GET' && url.pathname === '/api/stream') {
        const ticket = String(url.searchParams.get('ticket') || '');
        const value = streamTickets.get(ticket);
        if (!value || value.expiresAt <= Date.now() || !config.devices.some((item) => item.id === value.deviceId)) return json(res, 401, { error: 'Live-update ticket expired.' });
        streamTickets.delete(ticket);
        if (!requireUnlocked(res)) return;
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
        res.write(`data: ${JSON.stringify({ type: 'connected', at: nowIso() })}\n\n`);
        streamClients.add(res); req.on('close', () => streamClients.delete(res)); return;
      }
      const device = await authorize(req, url);
      if (!device) return json(res, 401, { error: 'Pair this device with Deme Roadmap first.' });
      if (req.method === 'POST' && url.pathname === '/api/stream-ticket') {
        if (!requireUnlocked(res)) return;
        const ticket = crypto.randomBytes(24).toString('base64url');
        streamTickets.set(ticket, { deviceId: device.id, expiresAt: Date.now() + STREAM_TICKET_TTL_MS });
        return json(res, 200, { ticket, expiresAt: new Date(Date.now() + STREAM_TICKET_TTL_MS).toISOString() });
      }
      if (!requireUnlocked(res)) return;

      if (req.method === 'GET' && url.pathname === '/api/snapshot') {
        const value = await snapshot(); return value ? json(res, 200, value) : json(res, 503, { error: 'Roadmap data is not ready yet.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/cards') return json(res, 201, { card: await addCard(await readBody(req, MAX_JSON_BODY)) });
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/cards/')) return json(res, 200, await updateCard(decodeURIComponent(url.pathname.slice('/api/cards/'.length)), await readBody(req, MAX_JSON_BODY)));
      if (req.method === 'POST' && url.pathname === '/api/notes') return json(res, 201, { note: await addNote(await readBody(req, MAX_JSON_BODY)) });
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/notes/')) return json(res, 200, await updateNote(decodeURIComponent(url.pathname.slice('/api/notes/'.length)), await readBody(req, MAX_JSON_BODY)));
      if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, { events: incomingEvents.slice(0, 250) });
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/events/')) return json(res, 200, await updateEvent(decodeURIComponent(url.pathname.slice('/api/events/'.length)), await readBody(req, 64 * 1024)));
      if (req.method === 'POST' && /\/api\/events\/[^/]+\/convert$/.test(url.pathname)) {
        const eventId = decodeURIComponent(url.pathname.split('/')[3]); const body = await readBody(req, 64 * 1024); return json(res, 200, await convertEvent(eventId, body.kind === 'bug' ? 'bug' : 'work'));
      }
      if (req.method === 'GET' && url.pathname === '/api/attachments') {
        const ownerType = url.searchParams.get('ownerType') || ''; const ownerId = url.searchParams.get('ownerId') || '';
        const filtered = attachments.filter((item) => (!ownerType || item.ownerType === ownerType) && (!ownerId || item.ownerId === ownerId)); return json(res, 200, { attachments: filtered.slice(0, 250) });
      }
      if (req.method === 'POST' && url.pathname === '/api/attachments') return json(res, 201, { attachment: await addAttachmentFromBase64({ ...(await readBody(req, MAX_ATTACHMENT_BODY)), source: device.name }) });
      if (req.method === 'GET' && url.pathname.startsWith('/api/attachments/')) {
        const attachmentId = decodeURIComponent(url.pathname.slice('/api/attachments/'.length));
        const record = attachments.find((item) => item.id === attachmentId);
        if (!record) return json(res, 404, { error: 'Attachment not found.' });
        const buffer = await fs.readFile(path.join(attachmentsDir, record.storedName));
        const inline = String(record.mimeType).startsWith('image/') || record.mimeType === 'application/pdf';
        res.writeHead(200, { 'Content-Type': record.mimeType || 'application/octet-stream', 'Content-Length': buffer.length, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${record.fileName.replace(/"/g, '')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(buffer);
      }
      return json(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (error?.code === 'BODY_TOO_LARGE') return json(res, 413, { error: error.message });
      if (error?.code === 'BAD_JSON') return json(res, 400, { error: error.message });
      lastError = safeText(error?.message, 'Backend request failed', 300);
      options.log?.(`Request failed ${req.method} ${url.pathname}: ${error.stack || error.message || String(error)}`);
      return json(res, 500, { error: error?.message?.includes('Attachments are limited') || error?.message?.includes('file type') ? error.message : 'The Roadmap backend could not complete that request.' });
    }
  }

  async function listen(preferredPort) {
    return new Promise((resolve, reject) => {
      const candidate = http.createServer(handle);
      candidate.keepAliveTimeout = 30_000; candidate.headersTimeout = 35_000; candidate.requestTimeout = 45_000;
      candidate.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      const onError = (error) => { candidate.removeAllListeners(); reject(error); };
      candidate.once('error', onError);
      candidate.listen(preferredPort, '0.0.0.0', () => { candidate.removeListener('error', onError); server = candidate; port = candidate.address().port; resolve(); });
    });
  }
  try { await listen(DEFAULT_PORT); }
  catch (error) {
    options.log?.(`Preferred port ${DEFAULT_PORT} failed: ${error.code || error.message || error}`);
    if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES') await listen(0); else throw error;
  }
  options.log?.(`Connected Workspace backend started on port ${port}. LAN addresses: ${addresses().join(', ') || 'none detected'}.`);
  monitorTimer = setInterval(() => { cleanupEphemeral(); checkMonitors().catch((error) => { lastError = safeText(error.message, 'Monitor check failed', 300); options.log?.(`Monitor check failed: ${error.message || error}`); }); }, 60_000);
  monitorTimer.unref?.();
  if (config.monitors.length) checkMonitors().catch(() => undefined);

  return {
    status, createPairing, listPendingPairings, approvePairing, rejectPairing,
    listDevices: () => config.devices.map(publicDevice), revokeDevice, revokeAllDevices,
    webhookSecret, regenerateWebhookSecret,
    listEvents: () => incomingEvents.slice(0, 1000), updateEvent, deleteEvent, convertEvent, addIncomingEvent,
    listAttachments: () => attachments.slice(0, 2000), chooseAttachment, addAttachmentFromBase64, deleteAttachment, revealAttachment, openAttachment, attachmentPreview, attachmentTargets,
    listMonitors: () => config.monitors.map(monitorPublic), addMonitor, removeMonitor, checkMonitors, broadcast,
    async openCompanion() {
      const url = primaryUrl() || loopbackUrl(); if (!url) return { ok: false, error: 'The Wi-Fi backend is not running.' }; await options.shell.openExternal(url); return { ok: true };
    },
    async stop() {
      if (monitorTimer) clearInterval(monitorTimer);
      for (const client of streamClients) { try { client.end(); } catch { /* ignore */ } }
      streamClients.clear();
      for (const socket of sockets) { try { socket.destroy(); } catch { /* ignore */ } }
      sockets.clear();
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      server = null; options.log?.('Connected Workspace backend stopped cleanly.');
    },
  };
}

module.exports = { startLanServer, isAllowedRemoteAddress };
