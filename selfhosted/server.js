'use strict';
// OreWorld 2 server: HTTP (static files + /healthz) and WebSocket (game). Game rules live in game.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const W = require('./public/world.js');
const { makeGame } = require('./game.js');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC = path.join(__dirname, 'public');
const TRUST_PROXY = !!(process.env.TRUST_PROXY || process.env.RENDER || process.env.FLY_APP_NAME);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
const LIMITS = {
  players: 3000, accountsPerIp: Number(process.env.ACCOUNTS_PER_IP) || 3, connsPerIp: Number(process.env.CONNS_PER_IP) || 6,
  maxConns: Number(process.env.MAX_CONNS) || 1500, activeMs: 5 * 60 * 1000,
};
const nul = (o) => Object.assign(Object.create(null), o || {});

// ---------- persistence (local file; optional Upstash Redis REST for hosts without a disk) ----------
const db = { players: nul(), listings: [], mines: nul(), guilds: nul(), nextId: 1 };
function applySnapshot(raw) {
  db.listings = Array.isArray(raw.listings) ? raw.listings : [];
  db.nextId = raw.nextId || 1; db.mines = nul(raw.mines); db.guilds = nul(raw.guilds);
  for (const [k, p] of Object.entries(raw.players || {})) { p.stock = nul(p.stock); p.rigs = nul(p.rigs); p.shipments = p.shipments || []; db.players[k] = p; }
}
try { applySnapshot(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); } catch (_) { /* fresh world */ }
const KV_URL = process.env.UPSTASH_REDIS_REST_URL, KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN, KV_KEY = process.env.KV_KEY || 'oreworld2:db';
async function kv(cmd) {
  const r = await fetch(KV_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('KV http ' + r.status);
  return (await r.json()).result;
}
async function kvLoad() {
  if (!KV_URL || !KV_TOKEN) return;
  try { const v = await kv(['GET', KV_KEY]); if (v) { applySnapshot(JSON.parse(v)); console.log('restored world from remote store:', Object.keys(db.players).length, 'players'); } }
  catch (e) { console.error('remote restore failed:', e.message); }
}
let kvBusy = false, lastKvHash = '';
async function kvSave() {
  if (!KV_URL || !KV_TOKEN || kvBusy) return;
  const body = JSON.stringify(db), h = crypto.createHash('sha1').update(body).digest('hex');
  if (h === lastKvHash) return;
  kvBusy = true;
  try { await kv(['SET', KV_KEY, body]); lastKvHash = h; } catch (e) { console.error('remote save failed:', e.message); }
  kvBusy = false;
}
let saving = false;
function save() {
  if (saving) return;
  saving = true;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(db), (e) => {
    if (e) { saving = false; return console.error('save failed', e.message); }
    fs.rename(tmp, DATA_FILE, (e2) => { saving = false; if (e2) console.error('save failed', e2.message); });
  });
}
const saveSync = () => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch (e) { console.error(e.message); } };

// ---------- game wiring ----------
const clients = new Map(); // ws -> player
const chatLog = [];
function send(ws, obj) {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > 1e6) { ws.terminate(); return; }
  ws.send(JSON.stringify(obj));
}
const toPlayer = (p, obj) => { for (const [ws, pl] of clients) if (pl === p) send(ws, obj); };
const broadcastAll = (obj) => { for (const ws of clients.keys()) send(ws, obj); };
const game = makeGame(db, {
  toast: (p, m, bad) => toPlayer(p, { t: bad ? 'err' : 'msg', m }),
  notify: (p, obj) => toPlayer(p, obj),
  online: () => { const s = new Set(); const now = Date.now(); for (const p of clients.values()) if (now - (p.lastAct || 0) < LIMITS.activeMs) s.add(p); return s; },
  chatAll: (msg) => { chatLog.push(msg); if (chatLog.length > 50) chatLog.shift(); broadcastAll(msg); },
  chatGuild: (tag, msg) => { for (const [ws, p] of clients) if (p.guild === tag) send(ws, msg); },
  broadcast: broadcastAll,
});
for (const p of Object.values(db.players)) game.ensure(p);

// ---------- tick ----------
const metrics = { ticks: 0, avgMs: 0, maxMs: 0, started: Date.now() };
let last = Date.now();
function tick() {
  const now = Date.now(), dt = Math.min(60, (now - last) / 1000);
  last = now;
  game.tick(now, dt);
  if (!clients.size) return;
  const workers = nul();
  for (const p of clients.values()) for (const id of Object.keys(p.rigs)) workers[id] = (workers[id] || 0) + 1;
  const mines = nul();
  for (const [id, info] of Object.entries(db.mines)) mines[id] = { w: workers[id] || 0, f: info.founder };
  const fleet = [];
  const all = Object.values(db.players);
  for (const p of all) for (const s of p.shipments) fleet.push({ o: p.name, from: s.site, to: s.city, t0: s.t0, t1: s.t1 });
  const top = all.slice().sort((a, b) => b.earned - a.earned).slice(0, 10).map((p) => ({ name: p.name, level: p.level, earned: Math.floor(p.earned) }));
  const shared = Object.assign(game.worldView(now, workers), { t: 'w', now, mines, fleet, top, online: [...clients.values()].map((p) => p.name) });
  const head = JSON.stringify(shared).slice(0, -1) + ',"me":';
  for (const [ws, p] of clients) {
    if (ws.readyState !== 1) continue;
    if (ws.bufferedAmount > 1e6) { ws.terminate(); continue; }
    ws.send(head + JSON.stringify(game.meView(p)) + '}');
  }
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const SEC = {
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
};
const fileCache = new Map();
function loadStatic(file) {
  const st = fs.statSync(file), hit = fileCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = fs.readFileSync(file);
  const e = { raw, gz: zlib.gzipSync(raw, { level: 9 }), etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"', mtime: st.mtimeMs };
  fileCache.set(file, e); return e;
}
const server = http.createServer((req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const raw = new URL(req.url, 'http://x').pathname;
    if (raw === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, players: Object.keys(db.players).length, online: clients.size, mines: Object.keys(db.mines).length, guilds: Object.keys(db.guilds).length, tickMsAvg: +metrics.avgMs.toFixed(2), tickMsMax: +metrics.maxMs.toFixed(2), uptimeS: Math.round((Date.now() - metrics.started) / 1000) }));
    }
    let urlPath = decodeURIComponent(raw);
    if (urlPath.includes('\0')) { res.writeHead(400); return res.end(); }
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.join(PUBLIC, path.normalize(urlPath));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
    let entry;
    try { entry = loadStatic(file); } catch (_) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file);
    const headers = Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: entry.etag, Vary: 'Accept-Encoding', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300, must-revalidate' }, SEC);
    if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers); return res.end(); }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.html', '.js', '.css', '.svg', '.json'].includes(ext);
    const body = gz ? entry.gz : entry.raw;
    if (gz) headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : body);
  } catch (_) { try { res.writeHead(400); res.end(); } catch (__) { /* ignore */ } }
});
server.keepAliveTimeout = 65000; server.headersTimeout = 66000;

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, maxPayload: 2048 });
const connsByIp = new Map();
const ipOf = (req) => { const xf = TRUST_PROXY && req.headers['x-forwarded-for']; return (xf ? String(xf).split(',').pop().trim() : req.socket.remoteAddress) || 'unknown'; };
const hashIp = (ip) => crypto.createHash('sha256').update('oreworld:' + ip).digest('hex').slice(0, 16);

wss.on('connection', (ws, req) => {
  if (wss.clients.size > LIMITS.maxConns) return ws.close();
  const origin = req.headers.origin;
  if (origin) { try { const o = new URL(origin); if (o.host !== req.headers.host && !ALLOWED_ORIGINS.includes(o.origin)) return ws.close(); } catch (_) { return ws.close(); } }
  const ip = ipOf(req), n = (connsByIp.get(ip) || 0) + 1;
  if (n > LIMITS.connsPerIp) return ws.close();
  connsByIp.set(ip, n);

  let player = null, bucket = 0, bucketAt = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    try {
      const now = Date.now();
      bucket = Math.max(0, bucket - (now - bucketAt) / 50) + 1; bucketAt = now;
      if (bucket > 40) return;
      let m; try { m = JSON.parse(raw); } catch (_) { return; }
      if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;

      if (m.t === 'login') {
        if (player) return;
        const name = String(m.name || '').trim();
        if (!/^[A-Za-z][A-Za-z0-9_]{1,15}$/.test(name)) return send(ws, { t: 'err', login: true, m: 'Name: 2-16 chars, start with a letter, then letters, numbers or _' });
        const key = name.toLowerCase();
        let p = db.players[key], fresh = false;
        if (p) {
          const a = Buffer.from(String(m.token || '')), b = Buffer.from(String(p.token));
          if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return send(ws, { t: 'err', login: true, m: 'That name is taken (wrong key for it).' });
        } else {
          const h = hashIp(ip);
          if (Object.keys(db.players).length >= LIMITS.players) return send(ws, { t: 'err', login: true, m: 'The world is full.' });
          if (Object.values(db.players).filter((x) => x.ip === h).length >= LIMITS.accountsPerIp) return send(ws, { t: 'err', login: true, m: 'Too many accounts from your network.' });
          p = db.players[key] = game.newPlayer(name, crypto.randomBytes(16).toString('hex'), h); fresh = true;
        }
        game.ensure(p);
        for (const [ows, op] of clients) if (op === p) { clients.delete(ows); send(ows, { t: 'kicked' }); try { ows.close(); } catch (_) { /* ignore */ } }
        const away = Date.now() - (p.lastSeen || Date.now());
        player = p; p.lastAct = Date.now(); clients.set(ws, p);
        send(ws, { t: 'hello', name: p.name, token: p.token, fresh, chat: chatLog.slice(-30) });
        if (!fresh && away > 5 * 60000) {
          const ore = Math.floor(Object.values(p.stock).reduce((a, b) => a + b, 0));
          send(ws, { t: 'msg', m: `Welcome back! You were away ${away > 3600000 ? Math.round(away / 3600000) + ' h' : Math.round(away / 60000) + ' min'}. Your warehouses hold ${ore} ore.` });
        }
        return;
      }
      if (!player || clients.get(ws) !== player) return;
      const fn = Object.prototype.hasOwnProperty.call(game.actions, m.t) ? game.actions[m.t] : null;
      if (!fn) return;
      if (m.t !== 'chat') player.lastAct = Date.now();
      const err = fn(player, m);
      if (err) send(ws, { t: 'err', m: err }); else game.evalQuests(player);
    } catch (e) { console.error('handler error', e); }
  });
  ws.on('close', () => {
    connsByIp.set(ip, Math.max(0, (connsByIp.get(ip) || 1) - 1));
    if (player && clients.get(ws) === player) { player.lastSeen = Date.now(); clients.delete(ws); }
  });
  ws.on('error', () => {});
});

setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (_) { /* ignore */ } } }, 20000);
setInterval(() => {
  const t0 = process.hrtime.bigint();
  try { tick(); } catch (e) { console.error('tick error', e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  metrics.ticks++; metrics.avgMs = metrics.avgMs * 0.95 + ms * 0.05; metrics.maxMs = Math.max(metrics.maxMs * 0.999, ms);
}, 1000);
setInterval(save, 5000);
setInterval(kvSave, 30000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { saveSync(); kvBusy = false; try { await kvSave(); } catch (_) { /* ignore */ } process.exit(0); });
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('exit', saveSync);
kvLoad().then(() => server.listen(PORT, '0.0.0.0', () => console.log(`OreWorld 2 running on http://localhost:${PORT}  (progress saved to ${DATA_FILE})`)));
