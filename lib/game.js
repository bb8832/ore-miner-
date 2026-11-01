'use strict';
// OreWorld 2 for serverless hosting (Vercel). No process memory is relied on: all state lives in Redis.
// Players are simulated lazily (production / arrivals computed from elapsed time on each request).
// World events (rushes, storms, booms, gluts) are a pure function of the clock, so they need no storage.
const crypto = require('crypto');
const W = require('../public/world.js');
require('./land');
const R = require('./redis');

const LIM = { accountsPerIp: Number(process.env.ACCOUNTS_PER_IP) || 3, listings: 8, minEarnedToBuy: 100, activeMs: 40000, guildMax: 20, guildCost: 1000, guildLevel: 3 };
const oreKeys = Object.keys(W.ORES);
const cityById = new Map(W.CITIES.map((c) => [c.id, c]));
const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const nul = (o) => Object.assign(Object.create(null), o || {});
const lc = (s) => String(s).toLowerCase();
const rid = () => crypto.randomBytes(5).toString('hex');
const jparse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
function pairs(arr) {
  const o = nul();
  if (Array.isArray(arr)) for (let i = 0; i + 1 < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  else if (arr && typeof arr === 'object') Object.assign(o, arr);
  return o;
}

// ---------- deterministic world events ----------
const EV_SLOT = 60000, EV_BACK = 4, DUR = { rush: 180000, storm: 150000, boom: 100000, glut: 120000 };
function h32(n) { let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; }
const r01 = (n) => h32(n) / 4294967296;
const where = (x, y) => { const [lon, lat] = W.unGeo(x, y); return `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`; };
const evCache = new Map();
function eventOfSlot(s) {
  if (evCache.has(s)) return evCache.get(s);
  const r = r01(s * 13 + 1), type = r < 0.35 ? 'rush' : r < 0.7 ? 'storm' : r < 0.85 ? 'boom' : 'glut', start = s * EV_SLOT, until = start + DUR[type];
  let ev = null;
  if (type === 'rush' || type === 'storm') {
    for (let k = 0; k < 60 && !ev; k++) {
      const x = 20 + r01(s * 31 + k * 7 + 2) * 960, y = 30 + r01(s * 37 + k * 11 + 3) * (type === 'rush' ? 300 : 340);
      if (type === 'rush' ? W.isLand(x, y) : !W.isLand(x, y)) {
        ev = { id: 'e' + s, type, x, y, r: type === 'rush' ? 55 : 70, start, until,
          label: type === 'rush' ? `Mineral rush near ${where(x, y)}: mines here produce 1.8x` : `Storm at sea near ${where(x, y)}: ships crossing it lose cargo` };
      }
    }
  } else {
    const c = W.CITIES[h32(s * 17 + 5) % W.CITIES.length], ore = oreKeys[h32(s * 19 + 7) % oreKeys.length];
    ev = { id: 'e' + s, type, city: c.id, ore, x: c.x, y: c.y, r: 0, start, until, mult: type === 'boom' ? W.BOOM : 0.6,
      label: type === 'boom' ? `${c.name} wants ${W.ORES[ore].name}: +80% price` : `${c.name} is flooded with ${W.ORES[ore].name}: -40% price` };
  }
  if (evCache.size > 500) evCache.clear();
  evCache.set(s, ev);
  return ev;
}
function eventsBetween(t0, t1) { // events whose active window overlaps [t0, t1]
  const out = [];
  for (let s = Math.floor(t0 / EV_SLOT) - EV_BACK; s <= Math.floor(t1 / EV_SLOT); s++) { const e = eventOfSlot(s); if (e && e.until > t0 && e.start <= t1) out.push(e); }
  return out;
}
const eventsAt = (t) => eventsBetween(t, t);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function satNow(raw, t) {
  if (!raw) return 1;
  const [s, ts] = String(raw).split('|').map(Number);
  if (!Number.isFinite(s) || !Number.isFinite(ts)) return 1;
  return Math.min(1.3, Math.max(0.35, 1 - (1 - s) * Math.exp(-0.02 * Math.max(0, t - ts) / 1000)));
}
function unitPrice(city, ore, t, satMap, p) {
  let m = cityById.get(city).hot.includes(ore) ? W.HOT : 1;
  for (const e of eventsAt(t)) if ((e.type === 'boom' || e.type === 'glut') && e.city === city && e.ore === ore) m *= e.mult;
  return W.ORES[ore].value * satNow(satMap[city + ':' + ore], t) * m * (p ? 1 + W.TECHS.haggle.per * (p.tech.haggle || 0) : 1);
}

// ---------- players ----------
function ensure(p) {
  p.level = p.level || 1; p.xp = p.xp || 0;
  p.stats = Object.assign({ shippedUnits: 0, listedUnits: 0, contractUnits: 0, boughtUnits: 0, coopSeen: 0 }, p.stats || {});
  p.tech = Object.assign({ drill: 0, haggle: 0, survey: 0, insure: 0 }, p.tech || {});
  p.quests = p.quests || {}; p.guild = p.guild || null;
  p.stock = nul(p.stock); p.rigs = nul(p.rigs); p.shipments = p.shipments || [];
  return p;
}
const parsePlayer = (raw) => { const p = raw ? jparse(raw) : null; return p ? ensure(p) : null; };
const tech = (p, k) => p.tech[k] || 0;
const disc = (p) => W.TECHS.survey.per * tech(p, 'survey');
function stat(p, key) {
  switch (key) {
    case 'mines': return Object.keys(p.rigs).length;
    case 'rigsTotal': return Object.values(p.rigs).reduce((a, r) => a + r.n, 0);
    case 'maxRigLevel': return Object.values(p.rigs).reduce((a, r) => Math.max(a, r.l), 0);
    case 'level': return p.level;
    case 'earned': return Math.floor(p.earned);
    case 'ships': return p.ships.n;
    case 'techLevels': return Object.values(p.tech).reduce((a, b) => a + b, 0);
    case 'inGuild': return p.guild && p.level >= 3 ? 1 : 0;
    default: return p.stats[key] || 0;
  }
}
function unlockText(l) {
  const u = Object.entries(W.ORE_LEVEL).filter(([, v]) => v === l).map(([k]) => W.ORES[k].name), parts = [];
  if (u.length) parts.push(`${u.join(', ')} mines unlocked`);
  if (W.slots(l) > W.slots(l - 1)) parts.push(`${W.slots(l)} mine slots`);
  return parts.length ? ' Unlocked: ' + parts.join(', ') + '.' : '';
}
function addXp(p, n, ctx) {
  if (!(n > 0)) return;
  p.xp += n;
  while (p.level < W.MAX_LEVEL && p.xp >= W.xpFor(p.level + 1)) {
    p.level++;
    ctx.events.push({ k: 'levelup', level: p.level, rank: W.rankOf(p.level), m: `LEVEL UP! You are now level ${p.level} (${W.rankOf(p.level)}).` + unlockText(p.level) });
  }
}
function earn(p, amt, ctx) { amt = round2(amt); p.money = round2(p.money + amt); p.earned = round2(p.earned + amt); addXp(p, amt / 8, ctx); }
function evalQuests(p, ctx) {
  for (const q of W.QUESTS) {
    if (p.quests[q.id] || stat(p, q.stat) < q.goal) continue;
    p.quests[q.id] = ctx.now;
    p.money = round2(p.money + q.money); addXp(p, q.xp, ctx);
    ctx.events.push({ k: 'quest', title: q.title, money: q.money, xp: q.xp, m: `Goal complete: ${q.title}! +$${q.money} and ${q.xp} XP` });
  }
}

// ---------- shared world snapshot (cached ~2.5 s per warm instance to save database calls) ----------
let wcache = { t: 0, data: null };
async function getWorld(fresh) {
  const now = Date.now();
  if (!fresh && wcache.data && now - wcache.t < 2500) return wcache.data;
  const [satR, lstR, lqR, ctR, cnext, actR, topR, minesR, fleetR, chatR, gmetaR, gtopR, gcntR] = await R.pipe([
    ['HGETALL', 'sat'], ['HGETALL', 'listings'], ['HGETALL', 'lq'], ['HGETALL', 'contract'], ['GET', 'cnext'], ['HGETALL', 'act'],
    ['ZREVRANGE', 'top', 0, 9, 'WITHSCORES'], ['HGETALL', 'mines'], ['HGETALL', 'fleet'], ['LRANGE', 'chat', 0, 29],
    ['HGETALL', 'guilds'], ['ZREVRANGE', 'gtop', 0, 9, 'WITHSCORES'], ['HGETALL', 'gcount'],
  ]);
  const sat = pairs(satR), lq = pairs(lqR), ct = pairs(ctR), act = pairs(actR), cleanup = [], online = [], workers = nul();
  for (const [name, v] of Object.entries(act)) {
    const a = jparse(v);
    if (!a) continue;
    if (now - a.t > 6e5) { cleanup.push(['HDEL', 'act', name]); continue; }
    if (now - a.t > LIM.activeMs) continue;
    online.push(a.n || name);
    for (const m of a.m || []) workers[m] = (workers[m] || 0) + 1;
  }
  const mines = nul();
  for (const [id, founder] of Object.entries(pairs(minesR))) mines[id] = { w: workers[id] || 0, f: founder };
  const listings = [];
  for (const [id, v] of Object.entries(pairs(lstR))) {
    const m = jparse(v), qty = Number(lq[id]);
    if (m && qty > 0) listings.push(Object.assign({ id, qty }, m));
    else if (m && now - m.ts > 60000) cleanup.push(['HDEL', 'listings', id], ['HDEL', 'lq', id]);
  }
  listings.sort((a, b) => b.ts - a.ts); listings.length = Math.min(listings.length, 100);
  const fleet = [];
  for (const [id, v] of Object.entries(pairs(fleetR))) {
    const f = jparse(v);
    if (!f) continue;
    if (f.t1 < now - 120000) { cleanup.push(['HDEL', 'fleet', id]); continue; }
    if (f.t1 > now - 3000) fleet.push(f);
  }
  let contract = null;
  const meta = ct._ ? jparse(ct._) : null;
  if (meta && now < meta.expires) {
    const by = nul();
    for (const [k, v] of Object.entries(ct)) if (k.startsWith('u:')) by[k.slice(2)] = Number(v);
    contract = { id: meta.id, ore: meta.ore, target: meta.target, reward: meta.reward, expires: meta.expires, progress: Number(ct._total) || 0, by };
  } else if (online.length && now >= (Number(cnext) || 0)) {
    if (meta) await R.cmd('DEL', 'contract');
    const pool = ['coal', 'coal', 'iron', 'iron', 'copper', 'silver', 'gold', 'diamond'], ore = pool[Math.floor(Math.random() * pool.length)];
    const target = Math.round((120 + Math.random() * 180) * Math.sqrt(Math.min(10, Math.max(2, online.length))) / 10) * 10;
    const m = { id: rid(), ore, target, reward: Math.round(target * W.ORES[ore].value), expires: now + 10 * 60000 };
    if ((await R.cmd('HSETNX', 'contract', '_', JSON.stringify(m))) === 1) contract = Object.assign({ progress: 0, by: nul() }, m);
  }
  if (cleanup.length) R.pipe(cleanup).catch(() => {});
  const prices = {};
  for (const c of W.CITIES) { prices[c.id] = {}; for (const o of oreKeys) prices[c.id][o] = round2(unitPrice(c.id, o, now, sat)); }
  const tp = Array.isArray(topR) ? topR : [], top = [];
  for (let i = 0; i + 1 < tp.length; i += 2) { const sc = Number(tp[i + 1]); top.push({ name: tp[i], level: sc % 100, earned: Math.floor(sc / 100) }); }
  const gm = pairs(gmetaR), gc = pairs(gcntR), gt = Array.isArray(gtopR) ? gtopR : [], guilds = [];
  for (let i = 0; i + 1 < gt.length; i += 2) { const g = jparse(gm[gt[i]]); if (g) guilds.push({ tag: gt[i], name: g.name, members: Number(gc[gt[i]]) || 0, earned: Math.floor(Number(gt[i + 1])) }); }
  const evs = eventsAt(now);
  const data = {
    now, prices, events: evs, mods: evs.filter((e) => e.type === 'boom' || e.type === 'glut').map((e) => ({ kind: e.type, city: e.city, ore: e.ore, mult: e.mult, until: e.until })),
    mines, fleet, top, online, listings, contract, guilds, chat: (Array.isArray(chatR) ? chatR : []).map(jparse).filter(Boolean).reverse().map((c) => Object.assign({ ch: 'all' }, c)),
    _sat: sat, _act: act,
  };
  wcache = { t: now, data };
  return data;
}
const publicWorld = (w) => { const o = Object.assign({}, w); delete o._sat; delete o._act; return o; };

// ---------- simulation ----------
function makeCtx(world, p, creditRaw, now) {
  // Partners only count if they have earned $100+ and play from a different network (blocks alt-account farming).
  const mineNets = nul(), guildNets = new Set(), myNet = p.ip || lc(p.name);
  for (const [name, v] of Object.entries(world._act)) {
    const a = jparse(v);
    if (!a || lc(name) === lc(p.name) || now - a.t > LIM.activeMs || !a.e || (a.i || lc(name)) === myNet) continue;
    for (const m of a.m || []) (mineNets[m] = mineNets[m] || new Set()).add(a.i || lc(name));
    if (p.guild && a.g === p.guild) guildNets.add(a.i || lc(name));
  }
  const others = nul(); for (const [m, set] of Object.entries(mineNets)) others[m] = set.size;
  const guildOthers = guildNets.size;
  const credit = Number(creditRaw) > 0 ? round2(Number(creditRaw)) : 0;
  return { now, sat: Object.assign(nul(), world._sat), workers: others, guildOthers, after: [], extra: [], events: [], changed: false, credit };
}
function stormLoss(sh, p) {
  const s = W.mineFromId(sh.site), c = cityById.get(sh.city);
  if (!s || !c) return 0;
  const dx = c.x - s.x, dy = c.y - s.y, l2 = dx * dx + dy * dy || 1e-9;
  const hit = eventsBetween(sh.t0, sh.t1).some((e) => {
    if (e.type !== 'storm') return false;
    const u = Math.max(0, Math.min(1, ((e.x - s.x) * dx + (e.y - s.y) * dy) / l2)), passAt = sh.t0 + u * (sh.t1 - sh.t0);
    return passAt >= e.start && passAt <= e.until && segDist(e.x, e.y, s.x, s.y, c.x, c.y) < e.r;
  });
  return hit ? Math.max(0, W.STORM_LOSS * (1 - W.TECHS.insure.per * tech(p, 'insure'))) : 0;
}
function settle(p, now, ctx) {
  const dt = Math.min(6 * 3600, Math.max(0, (now - (p.t || now)) / 1000)), cap = W.whCap(p.ships.wh);
  const rushes = eventsAt(now).filter((e) => e.type === 'rush');
  p.rate = nul();
  const guildBonus = p.guild ? 0.04 * Math.min(8, ctx.guildOthers) : 0;
  for (const [id, r] of Object.entries(p.rigs)) {
    const s = W.mineFromId(id);
    if (!s) continue;
    const others = ctx.workers[id] || 0;
    if (others > p.stats.coopSeen) p.stats.coopSeen = others;
    const rush = rushes.some((e) => Math.hypot(s.x - e.x, s.y - e.y) < e.r) ? 1.8 : 1;
    const rate = r.n * W.rigRate(r.l) * s.rich * rush * (1 + W.COOP.per * Math.min(W.COOP.maxOthers, others) + guildBonus) * (1 + W.TECHS.drill.per * tech(p, 'drill'));
    p.rate[id] = rate;
    const cur = p.stock[id] || 0;
    if (cur < cap) p.stock[id] = round2(Math.min(cap, cur + rate * dt));
  }
  for (let i = p.shipments.length - 1; i >= 0; i--) {
    const sh = p.shipments[i];
    if (now < sh.t1) continue;
    p.shipments.splice(i, 1);
    const loss = stormLoss(sh, p), sold = Math.max(0, Math.floor(sh.qty * (1 - loss))), key = sh.city + ':' + sh.ore;
    const gross = round2(sold * unitPrice(sh.city, sh.ore, now, ctx.sat, p) * W.distBonus(sh.d));
    const raw = Math.max(0.35, satNow(ctx.sat[key], now) - sold * 0.004) + '|' + now;
    ctx.sat[key] = raw; ctx.after.push(['HSET', 'sat', key, raw], ['HDEL', 'fleet', String(sh.id)]);
    earn(p, gross, ctx); p.stats.shippedUnits += sold;
    ctx.events.push({ k: 'sale', m: `${sold} ${W.ORES[sh.ore].name} reached ${cityById.get(sh.city).name}: +$${gross.toFixed(2)}` + (loss > 0 ? ` (a storm cost you ${sh.qty - sold} units)` : '') });
    ctx.changed = true;
  }
  if (ctx.credit > 0) {
    earn(p, ctx.credit, ctx); ctx.after.push(['HINCRBYFLOAT', 'credits', lc(p.name), -ctx.credit]);
    ctx.events.push({ k: 'msg', m: `Trade / contract income: +$${ctx.credit.toFixed(2)}` }); ctx.changed = true;
  }
  const ql = Object.keys(p.quests).length; evalQuests(p, ctx);
  if (Object.keys(p.quests).length !== ql) ctx.changed = true;
  p.t = now;
}

// ---------- guild helpers ----------
async function loadGuild(tag) {
  if (!tag) return null;
  const [meta, members, gchat] = await R.pipe([['HGET', 'guilds', tag], ['HGETALL', 'gm:' + tag], ['LRANGE', 'gchat:' + tag, 0, 29]]);
  const m = jparse(meta);
  return m ? { tag, name: m.name, owner: m.owner, members: pairs(members), gchat: (Array.isArray(gchat) ? gchat : []).map(jparse).filter(Boolean).reverse().map((c) => Object.assign({ ch: 'guild' }, c)) } : null;
}
function guildView(g, world) {
  if (!g) return null;
  const onl = new Set(world.online.map(lc));
  const members = Object.entries(g.members).map(([n, v]) => { const x = jparse(v) || {}; return { name: n, level: x.l || 1, earned: x.e || 0, online: onl.has(lc(n)) }; });
  return { tag: g.tag, name: g.name, owner: g.owner, members, bonus: Math.round(4 * Math.min(8, Math.max(0, members.filter((m) => m.online).length - 1))) };
}

function meView(p, now, g, world) {
  const stats = {};
  for (const q of W.QUESTS) stats[q.stat] = stat(p, q.stat);
  return {
    name: p.name, money: p.money, earned: p.earned, level: p.level, rank: W.rankOf(p.level), xp: Math.floor(p.xp),
    xpPrev: W.xpFor(p.level), xpNext: p.level >= W.MAX_LEVEL ? null : W.xpFor(p.level + 1),
    stock: p.stock, rigs: p.rigs, rate: p.rate || {}, ships: p.ships, shipments: p.shipments, tech: p.tech, quests: p.quests, stats,
    slots: W.slots(p.level), guild: guildView(g, world),
    shipCap: W.shipCap(p.ships.cap), shipSpd: W.shipSpd(p.ships.spd), whCap: W.whCap(p.ships.wh), t: now,
  };
}

// ---------- actions (async; mutate p; return error string or null) ----------
const UPGRADES = new Set(['cap', 'spd', 'wh', 'fleet']);
async function claimQty(id, want) {
  const res = Number(await R.cmd('HINCRBY', 'lq', id, -want));
  if (res < 0) { await R.cmd('HINCRBY', 'lq', id, want); return null; }
  return res;
}
const mineOf = (id) => (typeof id === 'string' ? W.mineFromId(id) : null);
const actions = {
  async claim(p, m, ctx) {
    if (typeof m.x !== 'number' || typeof m.y !== 'number' || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return 'Bad location';
    const s = W.mineAt(m.x, m.y);
    if (!s) return 'You can only build mines on land';
    if (p.rigs[s.id]) return 'You already work this mine';
    if (p.level < W.ORE_LEVEL[s.ore]) return `${W.ORES[s.ore].name} mines unlock at level ${W.ORE_LEVEL[s.ore]}`;
    if (Object.keys(p.rigs).length >= W.slots(p.level)) return `Mine slots full (${W.slots(p.level)}). Level up for more.`;
    const cost = W.claimCost(s, disc(p));
    if (p.money < cost) return 'Not enough money';
    p.money = round2(p.money - cost); p.rigs[s.id] = { n: 1, l: 1 };
    ctx.extra.push(['HSETNX', 'mines', s.id, p.name]); addXp(p, 15, ctx);
    return null;
  },
  async buyRig(p, m, ctx) {
    const s = mineOf(m.site), r = s && p.rigs[s.id];
    if (!r) return 'Claim this mine first';
    if (r.n >= W.MAX.rigs) return 'Max rigs reached';
    const c = W.rigCost(s, r.n, disc(p));
    if (p.money < c) return 'Not enough money';
    p.money = round2(p.money - c); r.n++; addXp(p, 3, ctx); return null;
  },
  async upRig(p, m, ctx) {
    const s = mineOf(m.site), r = s && p.rigs[s.id];
    if (!r) return 'Claim this mine first';
    if (r.l >= W.MAX.rigLvl) return 'Max level reached';
    const c = W.rigLvlCost(s, r.l, disc(p));
    if (p.money < c) return 'Not enough money';
    p.money = round2(p.money - c); r.l++; addXp(p, 6, ctx); return null;
  },
  async upShip(p, m, ctx) {
    if (typeof m.what !== 'string' || !UPGRADES.has(m.what)) return 'Unknown upgrade';
    const sh = p.ships;
    let lvl, max, cost;
    if (m.what === 'cap') { lvl = sh.cap; max = W.MAX.up; cost = W.capCost(lvl); }
    else if (m.what === 'spd') { lvl = sh.spd; max = W.MAX.up; cost = W.spdCost(lvl); }
    else if (m.what === 'wh') { lvl = sh.wh; max = W.MAX.up; cost = W.whCost(lvl); }
    else { lvl = sh.n; max = W.MAX.fleet; cost = W.fleetCost(lvl); }
    if (lvl >= max) return 'Already maxed';
    if (p.money < cost) return 'Not enough money';
    p.money = round2(p.money - cost);
    if (m.what === 'fleet') sh.n++; else sh[m.what]++;
    addXp(p, 8, ctx); return null;
  },
  async research(p, m, ctx) {
    const t = typeof m.tech === 'string' && Object.prototype.hasOwnProperty.call(W.TECHS, m.tech) ? W.TECHS[m.tech] : null;
    if (!t) return 'Unknown technology';
    const lvl = tech(p, m.tech);
    if (lvl >= t.max) return 'Already at max level';
    if (p.level < W.techReqLevel(lvl)) return `Needs player level ${W.techReqLevel(lvl)}`;
    const cost = W.techCost(lvl);
    if (p.money < cost) return 'Not enough money';
    p.money = round2(p.money - cost); p.tech[m.tech] = lvl + 1; addXp(p, 10 * (lvl + 1), ctx);
    ctx.events.push({ k: 'research', m: `Researched ${t.name} level ${lvl + 1}` });
    return null;
  },
  async ship(p, m, ctx) {
    const s = mineOf(m.site), c = typeof m.city === 'string' ? cityById.get(m.city) : null;
    if (!s || !c) return 'Bad route';
    if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
    if (m.qty > Math.floor(p.stock[s.id] || 0)) return 'Not enough ore in stock';
    const cap = W.shipCap(p.ships.cap);
    if (m.qty > cap) return `Ship capacity is ${cap}`;
    if (p.shipments.length >= p.ships.n) return 'All ships are at sea';
    const d = W.dist(s, c), id = rid();
    p.stock[s.id] = round2(p.stock[s.id] - m.qty);
    const sh = { id, site: s.id, city: c.id, ore: s.ore, qty: m.qty, t0: ctx.now, t1: ctx.now + (d / W.shipSpd(p.ships.spd)) * 1000, d };
    p.shipments.push(sh);
    ctx.extra.push(['HSET', 'fleet', id, JSON.stringify({ o: p.name, from: s.id, to: c.id, t0: sh.t0, t1: sh.t1 })]);
    return null;
  },
  async list(p, m, ctx) {
    const s = mineOf(m.site);
    if (!s) return 'Unknown mine';
    if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
    const price = round2(Number(m.price)), base = W.ORES[s.ore].value;
    if (!(price >= base * 0.5 && price <= base * 3)) return `Price must be between ${(base * 0.5).toFixed(2)} and ${(base * 3).toFixed(2)} per unit`;
    if (m.qty > Math.floor(p.stock[s.id] || 0)) return 'Not enough ore in stock';
    const all = pairs(await R.cmd('HGETALL', 'listings'));
    let mine = 0; for (const v of Object.values(all)) { const l = jparse(v); if (l && l.seller === p.name) mine++; }
    if (mine >= LIM.listings) return `Max ${LIM.listings} listings`;
    const id = rid();
    p.stock[s.id] = round2(p.stock[s.id] - m.qty);
    ctx.extra.push(['HSET', 'lq', id, m.qty], ['HSET', 'listings', id, JSON.stringify({ seller: p.name, site: s.id, ore: s.ore, price, ts: ctx.now })]);
    return null;
  },
  async cancel(p, m, ctx) {
    if (typeof m.id !== 'string') return 'Listing not found';
    const l = jparse(await R.cmd('HGET', 'listings', m.id));
    if (!l || l.seller !== p.name) return 'Listing not found';
    for (let i = 0; i < 4; i++) {
      const q = Number(await R.cmd('HGET', 'lq', m.id));
      if (!(q > 0)) return 'Listing not found';
      if ((await claimQty(m.id, q)) === 0) { p.stock[l.site] = round2((p.stock[l.site] || 0) + q); ctx.extra.push(['HDEL', 'listings', m.id], ['HDEL', 'lq', m.id]); return null; }
    }
    return 'Listing changed, try again';
  },
  async buy(p, m, ctx) {
    if (typeof m.id !== 'string') return 'Listing is gone';
    const l = jparse(await R.cmd('HGET', 'listings', m.id));
    if (!l) return 'Listing is gone';
    if (l.seller === p.name) return 'That is your own listing';
    if (p.earned < LIM.minEarnedToBuy) return `Earn ${LIM.minEarnedToBuy} from mining first to use the trade board`;
    if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
    const cost = round2(m.qty * l.price);
    if (p.money < cost) return 'Not enough money';
    if ((p.stock[l.site] || 0) + m.qty > W.whCap(p.ships.wh)) return 'Your warehouse is too small for that';
    const rem = await claimQty(m.id, m.qty);
    if (rem === null) return 'Not enough left in that listing';
    p.money = round2(p.money - cost); p.stock[l.site] = round2((p.stock[l.site] || 0) + m.qty); p.stats.boughtUnits += m.qty;
    ctx.extra.push(['HINCRBYFLOAT', 'credits', lc(l.seller), round2(cost * (1 - W.TRADE_FEE))]);
    if (rem === 0) ctx.extra.push(['HDEL', 'listings', m.id], ['HDEL', 'lq', m.id]);
    return null;
  },
  async contribute(p, m, ctx) {
    const s = mineOf(m.site), ct = pairs(await R.cmd('HGETALL', 'contract')), meta = ct._ ? jparse(ct._) : null;
    if (!meta || ctx.now >= meta.expires) return 'No active contract';
    if (!s || s.ore !== meta.ore) return `Contract needs ${W.ORES[meta.ore].name}`;
    if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
    const q = Math.min(m.qty, meta.target - (Number(ct._total) || 0));
    if (q <= 0) return 'Contract already filled';
    if (q > Math.floor(p.stock[s.id] || 0)) return 'Not enough ore in stock';
    const total = Number(await R.cmd('HINCRBY', 'contract', '_total', q));
    if (total - q >= meta.target) { await R.cmd('HINCRBY', 'contract', '_total', -q); return 'Contract already filled'; }
    p.stock[s.id] = round2(p.stock[s.id] - q);
    earn(p, q * W.ORES[meta.ore].value * 0.4, ctx); p.stats.contractUnits += q; addXp(p, q / 4, ctx);
    ctx.events.push({ k: 'msg', m: `Delivered ${q} ${W.ORES[meta.ore].name} to the contract` });
    await R.cmd('HINCRBY', 'contract', 'u:' + p.name, q);
    if (total >= meta.target && total - q < meta.target) {
      const by = pairs(await R.cmd('HGETALL', 'contract')), minQ = Math.max(5, Math.ceil(meta.target * 0.1));
      const names = Object.keys(by).filter((k) => k.startsWith('u:') && Number(by[k]) >= minQ), sum = names.reduce((a, k) => a + Number(by[k]), 0), cmds = [];
      const docs = names.length ? await R.pipe(names.map((k) => ['GET', 'p:' + lc(k.slice(2))])) : [];
      const nets = new Set(docs.map((d, i) => { const x = jparse(d); return (x && x.ip) || names[i]; }));
      if (names.length < 2 || nets.size < 2) names.length = 0;
      for (const k of names) cmds.push(['HINCRBYFLOAT', 'credits', lc(k.slice(2)), round2(meta.reward * Number(by[k]) / sum)]);
      cmds.push(['DEL', 'contract'], ['SET', 'cnext', String(ctx.now + 60000)]);
      await R.pipe(cmds);
      ctx.events.push({ k: 'msg', m: names.length ? 'Contract complete! Team bonus paid out to the contributors.' : 'Contract filled: no team bonus (it needs 2+ independent players who each delivered 10% or at least 5 units).' });
    }
    return null;
  },
  async gCreate(p, m, ctx) {
    if (p.guild) return 'You are already in an alliance';
    if (p.level < LIM.guildLevel) return `Alliances unlock at level ${LIM.guildLevel}`;
    const tag = String(m.tag || '').toUpperCase(), name = String(m.name || '').trim();
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) return 'Tag must be 2-5 letters or numbers';
    if (!/^[A-Za-z0-9 ]{3,24}$/.test(name)) return 'Name must be 3-24 letters, numbers or spaces';
    if (p.money < LIM.guildCost) return `Creating an alliance costs $${LIM.guildCost}`;
    if ((await R.cmd('HSETNX', 'guilds', tag, JSON.stringify({ name, owner: p.name, created: ctx.now }))) !== 1) return 'That tag is taken';
    p.money = round2(p.money - LIM.guildCost); p.guild = tag; p.gJoinEarned = p.earned;
    ctx.extra.push(['HSET', 'gcount', tag, 1], ['ZADD', 'gtop', 0, tag]);
    return null;
  },
  async gJoin(p, m, ctx) {
    if (p.guild) return 'Leave your current alliance first';
    const tag = typeof m.tag === 'string' ? m.tag.toUpperCase() : '';
    if (!/^[A-Z0-9]{2,5}$/.test(tag) || !jparse(await R.cmd('HGET', 'guilds', tag))) return 'No such alliance';
    if (Number(await R.cmd('HGET', 'gcount', tag)) >= LIM.guildMax) return 'That alliance is full';
    p.guild = tag; p.gJoinEarned = p.earned; ctx.extra.push(['HINCRBY', 'gcount', tag, 1]);
    return null;
  },
  async gLeave(p, m, ctx) {
    const tag = p.guild;
    if (!tag) return 'You are not in an alliance';
    p.guild = null;
    ctx.extra.push(['HDEL', 'gm:' + tag, p.name], ['HINCRBY', 'gcount', tag, -1], ['ZINCRBY', 'gtop', -Math.floor(Math.max(0, p.earned - (p.gJoinEarned || 0))), tag]);
    const left = Object.keys(pairs(await R.cmd('HGETALL', 'gm:' + tag))).filter((n) => n !== p.name);
    if (!left.length) ctx.extra.push(['HDEL', 'guilds', tag], ['HDEL', 'gcount', tag], ['ZREM', 'gtop', tag], ['DEL', 'gchat:' + tag]);
    else { const g = jparse(await R.cmd('HGET', 'guilds', tag)); if (g && g.owner === p.name) { g.owner = left[0]; ctx.extra.push(['HSET', 'guilds', tag, JSON.stringify(g)]); } }
    return null;
  },
  async chat(p, m, ctx) {
    const text = String(m.text || '').trim().slice(0, 200);
    if (!text) return null;
    if ((await R.cmd('SET', 'cd:' + lc(p.name), '1', 'NX', 'PX', 1000)) !== 'OK') return 'Slow down: one message per second';
    const msg = JSON.stringify({ from: p.name, text, ts: ctx.now });
    if (m.ch === 'guild') { if (!p.guild) return 'Join an alliance to use alliance chat'; ctx.extra.push(['LPUSH', 'gchat:' + p.guild, msg], ['LTRIM', 'gchat:' + p.guild, 0, 49]); }
    else ctx.extra.push(['LPUSH', 'chat', msg], ['LTRIM', 'chat', 0, 49]);
    return null;
  },
};

// ---------- request handlers ----------
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const body = (req) => (typeof req.body === 'string' ? jparse(req.body) || {} : req.body && typeof req.body === 'object' ? req.body : {});
const presenceCmd = (p, now) => ['HSET', 'act', lc(p.name), JSON.stringify({ t: now, n: p.name, m: Object.keys(p.rigs), g: p.guild, i: p.ip || lc(p.name), e: p.earned >= 100 })];
const tokenOk = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const ipOf = (req) => String(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || req.socket.remoteAddress || 'x').trim();
function authParts(req) {
  const h = String(req.headers['x-auth'] || ''), i = h.indexOf(':');
  if (i < 1) return null;
  const name = h.slice(0, i), token = h.slice(i + 1);
  return /^[A-Za-z][A-Za-z0-9_]{1,15}$/.test(name) && /^[0-9a-f]{32}$/.test(token) ? { name, token } : null;
}
const noDb = (res) => send(res, 503, { err: 'db', m: 'The game database is not connected yet.' });

async function handleLogin(req, res) {
  if (!R.configured()) return noDb(res);
  if (req.method !== 'POST') return send(res, 405, { err: 'method' });
  const b = body(req), name = String(b.name || '').trim(), key = 'p:' + lc(name);
  if (!/^[A-Za-z][A-Za-z0-9_]{1,15}$/.test(name)) return send(res, 400, { err: 'Name: 2-16 chars, start with a letter, then letters, numbers or _' });
  const existing = parsePlayer(await R.cmd('GET', key));
  if (existing) return tokenOk(b.token || '', existing.tok) ? send(res, 200, { name: existing.name, token: existing.tok, fresh: false }) : send(res, 403, { err: 'That name is taken (wrong key for it).' });
  const ipk = 'ipacc:' + crypto.createHash('sha256').update('oreworld:' + ipOf(req)).digest('hex').slice(0, 16);
  if (Number(await R.cmd('INCR', ipk)) > LIM.accountsPerIp) { await R.cmd('DECR', ipk); return send(res, 429, { err: 'Too many accounts from your network.' }); }
  const tok = crypto.randomBytes(16).toString('hex'), now = Date.now();
  const p = ensure({ name, tok, ip: ipk.slice(6), money: W.START_MONEY, earned: 0, stock: {}, rigs: {}, shipments: [], ships: { n: 1, cap: 1, spd: 1, wh: 1 }, created: now, t: now });
  if ((await R.cmd('SET', key, JSON.stringify(p), 'NX')) !== 'OK') { await R.cmd('DECR', ipk); return send(res, 409, { err: 'That name was just taken.' }); }
  return send(res, 200, { name, token: tok, fresh: true });
}

async function authedRead(req) {
  const a = authParts(req);
  if (!a) return { err: 'auth' };
  const [raw, credit] = await R.pipe([['GET', 'p:' + lc(a.name)], ['HGET', 'credits', lc(a.name)]]);
  const p = parsePlayer(raw);
  return p && tokenOk(a.token, p.tok) ? { a, p, credit } : { err: 'auth' };
}

async function respond(res, p, now, world, ctx, g) {
  const out = { me: meView(p, now, g, world), world: publicWorld(world), events: ctx.events };
  if (g) out.gchat = g.gchat;
  send(res, 200, out);
}

// Periodic poll: computes the settled view; writes only if something happened (arrival / income / goal / level).
async function handleState(req, res) {
  if (!R.configured()) return noDb(res);
  const r = await authedRead(req);
  if (r.err) return send(res, 401, { err: 'auth' });
  const now = Date.now(), world = await getWorld(false), { p } = r, ctx = makeCtx(world, p, r.credit, now);
  settle(p, now, ctx);
  if (ctx.changed) {
    const out = await mutate(r.a, async () => null);
    if (!out.busy && !out.err) return respond(res, out.p, now, out.world, { events: out.events }, out.g);
  }
  await R.cmd(...presenceCmd(p, now)).catch(() => {});
  const g = p.guild ? await loadGuild(p.guild) : null;
  return respond(res, p, now, world, ctx, g);
}

async function mutate(a, fn) {
  const lcn = lc(a.name), lockK = 'lock:' + lcn;
  const [lock, raw, credit] = await R.pipe([['SET', lockK, '1', 'NX', 'PX', 6000], ['GET', 'p:' + lcn], ['HGET', 'credits', lcn]]);
  if (lock !== 'OK') return { busy: true };
  let done = false;
  try {
    const p = parsePlayer(raw);
    if (!p || !tokenOk(a.token, p.tok)) return { err: 'auth' };
    const now = Date.now(), world = await getWorld(false), ctx = makeCtx(world, p, credit, now), prevEarned = p.earned, prevGuild = p.guild;
    settle(p, now, ctx);
    const err = await fn(p, ctx);
    if (err) return { err, p, world, events: [], g: p.guild ? await loadGuild(p.guild) : null };
    evalQuests(p, ctx);
    const rate = p.rate; delete p.rate;
    const cmds = [['SET', 'p:' + lcn, JSON.stringify(p)], ['ZADD', 'top', Math.floor(p.earned) * 100 + p.level, p.name], ...ctx.after, ...ctx.extra, presenceCmd(p, now)];
    if (p.guild) cmds.push(['HSET', 'gm:' + p.guild, p.name, JSON.stringify({ l: p.level, e: Math.floor(p.earned) })], ['ZINCRBY', 'gtop', Math.floor(p.earned - prevEarned), p.guild]);
    cmds.push(['DEL', lockK]);
    await R.pipe(cmds); done = true;
    p.rate = rate; void prevGuild;
    const fresh = await getWorld(true);
    return { p, world: fresh, events: ctx.events, g: p.guild ? await loadGuild(p.guild) : null };
  } finally { if (!done) await R.cmd('DEL', lockK).catch(() => {}); }
}

async function handleAct(req, res) {
  if (!R.configured()) return noDb(res);
  if (req.method !== 'POST') return send(res, 405, { err: 'method' });
  const a = authParts(req);
  if (!a) return send(res, 401, { err: 'auth' });
  const m = body(req), fn = typeof m.t === 'string' && Object.prototype.hasOwnProperty.call(actions, m.t) ? actions[m.t] : null;
  if (!fn) return send(res, 400, { err: 'Unknown action' });
  const out = await mutate(a, (p, ctx) => fn(p, m, ctx));
  if (out.busy) return send(res, 409, { err: 'Busy - try again' });
  if (out.err === 'auth') return send(res, 401, { err: 'auth' });
  const payload = { me: meView(out.p, Date.now(), out.g, out.world), world: publicWorld(out.world), events: out.events || [] };
  if (out.g) payload.gchat = out.g.gchat;
  if (out.err) payload.err = out.err;
  send(res, out.err ? 400 : 200, payload);
}

async function handleHealth(req, res) {
  const out = { ok: true, db: R.configured() };
  if (out.db) { try { out.ping = await R.cmd('PING'); } catch (e) { out.ok = false; out.dbError = e.message; } }
  send(res, out.ok ? 200 : 500, out);
}
const wrap = (h) => async (req, res) => { try { await h(req, res); } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { err: 'server error' }); } };
module.exports = { handleLogin: wrap(handleLogin), handleState: wrap(handleState), handleAct: wrap(handleAct), handleHealth: wrap(handleHealth) };
