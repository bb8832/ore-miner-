'use strict';
// OreWorld 2 - game rules. Pure game logic: no networking here.
// The server passes in the database object and a few hooks (toasts, who is online, chat delivery).
const crypto = require('crypto');
const W = require('./public/world.js');

const oreKeys = Object.keys(W.ORES);
const cityById = new Map(W.CITIES.map((c) => [c.id, c]));
const nul = (o) => Object.assign(Object.create(null), o || {});
const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const lc = (s) => String(s).toLowerCase();
const rid = () => crypto.randomBytes(4).toString('hex');
const rnd = (a, b) => a + Math.random() * (b - a);

const LIM = { listings: 8, minEarnedToBuy: 100, guildMax: 20, guildCost: 1000, guildLevel: 3 };

function makeGame(db, hooks) {
  // hooks: toast(p, msg, bad), notify(p, obj), online() -> Set of active online players, chatGuild(guildTag, msgObj), chatAll(msgObj)
  const sat = {};                                   // sat[city][ore] -> saturation (price pressure)
  for (const c of W.CITIES) { sat[c.id] = {}; for (const o of oreKeys) sat[c.id][o] = 1; }
  const mods = [];                                  // active market modifiers {id, kind, city, ore, mult, until}
  const events = [];                                // world events (kept 10 min after ending for storm checks)
  let contract = null, nextContractAt = 0, nextEventAt = Date.now() + 20000;

  // ---------- players ----------
  function ensure(p) { // fill in fields for accounts created by older versions
    p.level = p.level || 1; p.xp = p.xp || 0;
    p.stats = Object.assign({ shippedUnits: 0, listedUnits: 0, contractUnits: 0, boughtUnits: 0, coopSeen: 0 }, p.stats || {});
    p.tech = Object.assign({ drill: 0, haggle: 0, survey: 0, insure: 0 }, p.tech || {});
    p.quests = p.quests || {}; p.guild = p.guild || null;
    return p;
  }
  function newPlayer(name, token, ipHash) {
    return ensure({
      name, token, ip: ipHash, money: W.START_MONEY, earned: 0, stock: nul(), rigs: nul(), shipments: [],
      ships: { n: 1, cap: 1, spd: 1, wh: 1 }, created: Date.now(), lastSeen: Date.now(),
    });
  }
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
  function addXp(p, n) {
    if (!(n > 0)) return;
    p.xp += n;
    while (p.level < W.MAX_LEVEL && p.xp >= W.xpFor(p.level + 1)) {
      p.level++;
      hooks.notify(p, { t: 'levelup', level: p.level, rank: W.rankOf(p.level) });
      hooks.toast(p, `LEVEL UP! You are now level ${p.level} (${W.rankOf(p.level)}).` + unlockText(p.level));
    }
  }
  function unlockText(l) {
    const u = Object.entries(W.ORE_LEVEL).filter(([, v]) => v === l).map(([k]) => W.ORES[k].name);
    const parts = [];
    if (u.length) parts.push(`${u.join(', ')} mines unlocked`);
    if (W.slots(l) > W.slots(l - 1)) parts.push(`${W.slots(l)} mine slots`);
    return parts.length ? ' Unlocked: ' + parts.join(', ') + '.' : '';
  }
  function earn(p, amt) {
    amt = round2(amt);
    p.money = round2(p.money + amt); p.earned = round2(p.earned + amt);
    addXp(p, amt / 8);
  }
  function evalQuests(p) {
    for (const q of W.QUESTS) {
      if (p.quests[q.id] || stat(p, q.stat) < q.goal) continue;
      p.quests[q.id] = Date.now();
      p.money = round2(p.money + q.money); addXp(p, q.xp);
      hooks.notify(p, { t: 'quest', id: q.id, title: q.title, money: q.money, xp: q.xp });
      hooks.toast(p, `Goal complete: ${q.title}! +$${q.money} and ${q.xp} XP`);
    }
  }

  // ---------- market ----------
  function unitPrice(cityId, ore, p) {
    const c = cityById.get(cityId), now = Date.now();
    let m = c.hot.includes(ore) ? W.HOT : 1;
    for (const e of mods) if (e.city === cityId && e.ore === ore && e.until > now) m *= e.mult;
    return W.ORES[ore].value * sat[cityId][ore] * m * (p ? 1 + W.TECHS.haggle.per * tech(p, 'haggle') : 1);
  }
  const mineById = (id) => (typeof id === 'string' && db.mines[id] ? W.mineFromId(id) : null);
  const playerByName = (n) => db.players[lc(n)];

  // ---------- world events ----------
  function randomLand() {
    for (let i = 0; i < 60; i++) { const x = rnd(20, 980), y = rnd(30, 330); if (W.isLand(x, y)) return [x, y]; }
    return [500, 150];
  }
  function randomSea() {
    for (let i = 0; i < 60; i++) { const x = rnd(20, 980), y = rnd(30, 370); if (!W.isLand(x, y)) return [x, y]; }
    return [60, 200];
  }
  const where = (x, y) => { const [lon, lat] = W.unGeo(x, y); return `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`; };
  function spawnEvent(now) {
    const r = Math.random();
    if (r < 0.35) {
      const [x, y] = randomLand();
      events.push({ id: rid(), type: 'rush', x, y, r: 55, start: now, until: now + 180000, label: `Mineral rush near ${where(x, y)}: mines here produce 1.8x` });
    } else if (r < 0.7) {
      const [x, y] = randomSea();
      events.push({ id: rid(), type: 'storm', x, y, r: 70, start: now, until: now + 150000, label: `Storm at sea near ${where(x, y)}: ships crossing it lose cargo` });
    } else if (r < 0.85) {
      const c = W.CITIES[Math.floor(Math.random() * W.CITIES.length)], ore = oreKeys[Math.floor(Math.random() * oreKeys.length)];
      mods.push({ id: rid(), kind: 'boom', city: c.id, ore, mult: W.BOOM, until: now + 100000 });
      events.push({ id: rid(), type: 'boom', x: c.x, y: c.y, r: 0, start: now, until: now + 100000, label: `${c.name} wants ${W.ORES[ore].name}: +80% price` });
    } else {
      const c = W.CITIES[Math.floor(Math.random() * W.CITIES.length)], ore = oreKeys[Math.floor(Math.random() * oreKeys.length)];
      mods.push({ id: rid(), kind: 'glut', city: c.id, ore, mult: 0.6, until: now + 120000 });
      events.push({ id: rid(), type: 'glut', x: c.x, y: c.y, r: 0, start: now, until: now + 120000, label: `${c.name} is flooded with ${W.ORES[ore].name}: -40% price` });
    }
    hooks.broadcast({ t: 'event', m: events[events.length - 1].label, kind: events[events.length - 1].type });
  }
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function stormLoss(sh, p) { // fraction of cargo lost to storms this voyage ran into
    const s = mineById(sh.site) || W.mineFromId(sh.site), c = cityById.get(sh.city);
    if (!s || !c) return 0;
    let hit = false;
    const dx = c.x - s.x, dy = c.y - s.y, l2 = dx * dx + dy * dy || 1e-9;
    for (const e of events) {
      if (e.type !== 'storm') continue;
      const u = Math.max(0, Math.min(1, ((e.x - s.x) * dx + (e.y - s.y) * dy) / l2)); // where along the route the storm sits
      const passAt = sh.t0 + u * (sh.t1 - sh.t0);                                       // when the ship passes it
      if (passAt >= e.start && passAt <= e.until && segDist(e.x, e.y, s.x, s.y, c.x, c.y) < e.r) hit = true;
    }
    return hit ? Math.max(0, W.STORM_LOSS * (1 - W.TECHS.insure.per * tech(p, 'insure'))) : 0;
  }
  const rushMult = (s, now) => { for (const e of events) if (e.type === 'rush' && e.until > now && Math.hypot(s.x - e.x, s.y - e.y) < e.r) return 1.8; return 1; };

  // ---------- simulation tick ----------
  function tick(now, dt) {
    const online = hooks.online();
    // Partners only count if they have earned $100+ and play from a different network (blocks alt-account farming).
    const ipKey = (p) => p.ip || p.name;
    const workers = nul(), guildOnline = nul();
    for (const p of online) {
      if (p.earned < 100) continue;
      for (const id of Object.keys(p.rigs)) (workers[id] = workers[id] || new Map()).set(ipKey(p), 1);
      if (p.guild) (guildOnline[p.guild] = guildOnline[p.guild] || new Map()).set(ipKey(p), 1);
    }
    const countOthers = (m, p) => (m ? [...m.keys()].filter((k) => k !== ipKey(p)).length : 0);

    for (const p of Object.values(db.players)) {
      ensure(p);
      const cap = W.whCap(p.ships.wh), isOn = online.has(p), rate = nul();
      const guildBonus = p.guild ? 0.04 * Math.min(8, countOthers(guildOnline[p.guild], p)) : 0;
      for (const [id, r] of Object.entries(p.rigs)) {
        const s = W.mineFromId(id); if (!s) continue;
        const others = countOthers(workers[id], p);
        if (others > 0 && others > p.stats.coopSeen) p.stats.coopSeen = others;
        const coop = W.COOP.per * Math.min(W.COOP.maxOthers, others);
        rate[id] = r.n * W.rigRate(r.l) * s.rich * rushMult(s, now) * (1 + coop + guildBonus) * (1 + W.TECHS.drill.per * tech(p, 'drill'));
        const cur = p.stock[id] || 0;
        if (cur < cap) p.stock[id] = round2(Math.min(cap, cur + rate[id] * dt));
      }
      p.rate = rate;
      for (let i = p.shipments.length - 1; i >= 0; i--) {
        const sh = p.shipments[i];
        if (now < sh.t1) continue;
        p.shipments.splice(i, 1);
        const loss = stormLoss(sh, p), sold = Math.max(0, Math.floor(sh.qty * (1 - loss)));
        const gross = round2(sold * unitPrice(sh.city, sh.ore, p) * W.distBonus(sh.d));
        sat[sh.city][sh.ore] = Math.max(0.35, sat[sh.city][sh.ore] - sold * 0.004);
        earn(p, gross); p.stats.shippedUnits += sold;
        hooks.notify(p, { t: 'sale', city: sh.city, amount: gross });
        hooks.toast(p, `${sold} ${W.ORES[sh.ore].name} reached ${cityById.get(sh.city).name}: +$${gross.toFixed(2)}` + (loss > 0 ? ` (a storm cost you ${sh.qty - sold} units)` : ''));
      }
      if (isOn) evalQuests(p);
    }

    // market recovery & event lifecycle
    for (const c of W.CITIES) for (const o of oreKeys) sat[c.id][o] += (1 - sat[c.id][o]) * 0.02 * dt;
    for (let i = mods.length - 1; i >= 0; i--) if (mods[i].until < now) mods.splice(i, 1);
    for (let i = events.length - 1; i >= 0; i--) if (events[i].until < now - 600000) events.splice(i, 1);
    if (now >= nextEventAt && online.size > 0) { spawnEvent(now); nextEventAt = now + rnd(45000, 90000); }

    // contract lifecycle
    if (contract && now > contract.expires) { contract = null; nextContractAt = now + 60000; }
    if (!contract && online.size > 0 && now >= nextContractAt) newContract(online.size);

    for (let i = db.listings.length - 1; i >= 0; i--) { // expire stale listings back to sellers
      const l = db.listings[i];
      if (now - l.ts > 86400000) { const s = playerByName(l.seller); if (s) s.stock[l.site] = round2((s.stock[l.site] || 0) + l.qty); db.listings.splice(i, 1); }
    }
  }
  function newContract(n) {
    const pool = ['coal', 'coal', 'iron', 'iron', 'copper', 'silver', 'gold', 'diamond'];
    const ore = pool[Math.floor(Math.random() * pool.length)];
    const target = Math.round((120 + Math.random() * 180) * Math.sqrt(Math.min(10, Math.max(2, n))) / 10) * 10;
    contract = { id: rid(), ore, target, progress: 0, by: nul(), reward: Math.round(target * W.ORES[ore].value), expires: Date.now() + 10 * 60000 };
  }
  function finishContract() {
    const c = contract, minQ = Math.max(5, Math.ceil(c.target * 0.1));
    const names = Object.keys(c.by).filter((n) => c.by[n] >= minQ), total = names.reduce((a, n) => a + c.by[n], 0);
    const nets = new Set(names.map((n) => { const pl = playerByName(n); return pl ? (pl.ip || pl.name) : n; }));
    if (names.length >= 2 && nets.size >= 2) {
      for (const n of names) { const pl = playerByName(n); if (!pl) continue; const b = round2(c.reward * c.by[n] / total); earn(pl, b); hooks.toast(pl, `Contract complete! Your share of the team bonus: +$${b.toFixed(2)}`); }
    } else hooks.broadcast({ t: 'msg', m: `Contract filled: no team bonus (it needs 2+ independent players who each delivered at least ${minQ} units).` });
    contract = null; nextContractAt = Date.now() + 60000;
  }

  // ---------- player actions: return an error string or null ----------
  const UPGRADES = new Set(['cap', 'spd', 'wh', 'fleet']);
  const actions = {
    claim(p, m) {
      if (typeof m.x !== 'number' || typeof m.y !== 'number' || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return 'Bad location';
      const s = W.mineAt(m.x, m.y);
      if (!s) return 'You can only build mines on land';
      if (p.rigs[s.id]) return 'You already work this mine';
      if (p.level < W.ORE_LEVEL[s.ore]) return `${W.ORES[s.ore].name} mines unlock at level ${W.ORE_LEVEL[s.ore]}`;
      if (Object.keys(p.rigs).length >= W.slots(p.level)) return `Mine slots full (${W.slots(p.level)}). Level up for more.`;
      const cost = W.claimCost(s, disc(p));
      if (p.money < cost) return 'Not enough money';
      p.money = round2(p.money - cost); p.rigs[s.id] = { n: 1, l: 1 };
      if (!db.mines[s.id]) db.mines[s.id] = { founder: p.name, ts: Date.now() };
      addXp(p, 15);
      return null;
    },
    buyRig(p, m) {
      const s = mineById(m.site), r = s && p.rigs[s.id];
      if (!r) return 'Claim this mine first';
      if (r.n >= W.MAX.rigs) return 'Max rigs reached';
      const c = W.rigCost(s, r.n, disc(p));
      if (p.money < c) return 'Not enough money';
      p.money = round2(p.money - c); r.n++; addXp(p, 3); return null;
    },
    upRig(p, m) {
      const s = mineById(m.site), r = s && p.rigs[s.id];
      if (!r) return 'Claim this mine first';
      if (r.l >= W.MAX.rigLvl) return 'Max level reached';
      const c = W.rigLvlCost(s, r.l, disc(p));
      if (p.money < c) return 'Not enough money';
      p.money = round2(p.money - c); r.l++; addXp(p, 6); return null;
    },
    upShip(p, m) {
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
      addXp(p, 8); return null;
    },
    research(p, m) {
      const t = typeof m.tech === 'string' && Object.prototype.hasOwnProperty.call(W.TECHS, m.tech) ? W.TECHS[m.tech] : null;
      if (!t) return 'Unknown technology';
      const lvl = tech(p, m.tech);
      if (lvl >= t.max) return 'Already at max level';
      if (p.level < W.techReqLevel(lvl)) return `Needs player level ${W.techReqLevel(lvl)}`;
      const cost = W.techCost(lvl);
      if (p.money < cost) return 'Not enough money';
      p.money = round2(p.money - cost); p.tech[m.tech] = lvl + 1; addXp(p, 10 * (lvl + 1));
      hooks.notify(p, { t: 'research', tech: m.tech });
      return null;
    },
    ship(p, m) {
      const s = mineById(m.site), c = typeof m.city === 'string' ? cityById.get(m.city) : null;
      if (!s || !c) return 'Bad route';
      if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
      if (m.qty > Math.floor(p.stock[s.id] || 0)) return 'Not enough ore in stock';
      const cap = W.shipCap(p.ships.cap);
      if (m.qty > cap) return `Ship capacity is ${cap}`;
      if (p.shipments.length >= p.ships.n) return 'All ships are at sea';
      const d = W.dist(s, c), now = Date.now();
      p.stock[s.id] = round2(p.stock[s.id] - m.qty);
      p.shipments.push({ id: db.nextId++, site: s.id, city: c.id, ore: s.ore, qty: m.qty, t0: now, t1: now + (d / W.shipSpd(p.ships.spd)) * 1000, d });
      return null;
    },
    list(p, m) {
      const s = mineById(m.site);
      if (!s) return 'Unknown mine';
      if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
      const price = round2(Number(m.price)), base = W.ORES[s.ore].value;
      if (!(price >= base * 0.5 && price <= base * 3)) return `Price must be between ${(base * 0.5).toFixed(2)} and ${(base * 3).toFixed(2)} per unit`;
      if (m.qty > Math.floor(p.stock[s.id] || 0)) return 'Not enough ore in stock';
      if (db.listings.filter((l) => l.seller === p.name).length >= LIM.listings) return `Max ${LIM.listings} listings`;
      p.stock[s.id] = round2(p.stock[s.id] - m.qty);
      db.listings.push({ id: db.nextId++, seller: p.name, site: s.id, ore: s.ore, qty: m.qty, price, ts: Date.now() });
      return null;
    },
    cancel(p, m) {
      const i = db.listings.findIndex((l) => l.id === m.id && l.seller === p.name);
      if (i < 0) return 'Listing not found';
      const l = db.listings[i]; db.listings.splice(i, 1);
      p.stock[l.site] = round2((p.stock[l.site] || 0) + l.qty); return null;
    },
    buy(p, m) {
      const l = db.listings.find((x) => x.id === m.id);
      if (!l) return 'Listing is gone';
      if (l.seller === p.name) return 'That is your own listing';
      if (p.earned < LIM.minEarnedToBuy) return `Earn ${LIM.minEarnedToBuy} from mining first to use the trade board`;
      if (!isInt(m.qty, 1, l.qty)) return 'Bad quantity';
      if ((p.stock[l.site] || 0) + m.qty > W.whCap(p.ships.wh)) return 'Your warehouse is too small for that';
      const cost = round2(m.qty * l.price);
      if (p.money < cost) return 'Not enough money';
      const seller = playerByName(l.seller);
      p.money = round2(p.money - cost); p.stock[l.site] = round2((p.stock[l.site] || 0) + m.qty); p.stats.boughtUnits += m.qty;
      if (seller) { const net = round2(cost * (1 - W.TRADE_FEE)); earn(seller, net); hooks.toast(seller, `${p.name} bought ${m.qty} ${W.ORES[l.ore].name} from you: +$${net.toFixed(2)}`); }
      l.qty -= m.qty;
      if (l.qty <= 0) db.listings.splice(db.listings.indexOf(l), 1);
      return null;
    },
    contribute(p, m) {
      const s = mineById(m.site);
      if (!contract) return 'No active contract';
      if (!s || s.ore !== contract.ore) return `Contract needs ${W.ORES[contract.ore].name}`;
      const need = contract.target - contract.progress;
      if (need <= 0) return 'Contract already filled';
      if (!isInt(m.qty, 1, 1e9)) return 'Bad quantity';
      const q = Math.min(m.qty, need);
      if (q > Math.floor(p.stock[s.id] || 0)) return 'Not enough ore in stock';
      p.stock[s.id] = round2(p.stock[s.id] - q);
      const pay = round2(q * W.ORES[contract.ore].value * 0.4);
      earn(p, pay); p.stats.contractUnits += q; addXp(p, q / 4);
      contract.progress += q; contract.by[p.name] = (contract.by[p.name] || 0) + q;
      hooks.toast(p, `Delivered ${q} ${W.ORES[contract.ore].name} to the contract: +$${pay.toFixed(2)}`);
      if (contract.progress >= contract.target) finishContract();
      return null;
    },
    // ----- alliances -----
    gCreate(p, m) {
      if (p.guild) return 'You are already in an alliance';
      if (p.level < LIM.guildLevel) return `Alliances unlock at level ${LIM.guildLevel}`;
      const tag = String(m.tag || '').toUpperCase(), name = String(m.name || '').trim();
      if (!/^[A-Z0-9]{2,5}$/.test(tag)) return 'Tag must be 2-5 letters or numbers';
      if (!/^[A-Za-z0-9 ]{3,24}$/.test(name)) return 'Name must be 3-24 letters, numbers or spaces';
      if (db.guilds[tag]) return 'That tag is taken';
      if (p.money < LIM.guildCost) return `Creating an alliance costs $${LIM.guildCost}`;
      p.money = round2(p.money - LIM.guildCost);
      db.guilds[tag] = { tag, name, owner: p.name, members: [p.name], created: Date.now() }; p.guild = tag; return null;
    },
    gJoin(p, m) {
      if (p.guild) return 'Leave your current alliance first';
      const g = typeof m.tag === 'string' && db.guilds[m.tag.toUpperCase()];
      if (!g) return 'No such alliance';
      if (g.members.length >= LIM.guildMax) return 'That alliance is full';
      g.members.push(p.name); p.guild = g.tag; return null;
    },
    gLeave(p) {
      const g = p.guild && db.guilds[p.guild];
      if (!g) return 'You are not in an alliance';
      g.members = g.members.filter((n) => n !== p.name); p.guild = null;
      if (!g.members.length) delete db.guilds[g.tag]; else if (g.owner === p.name) g.owner = g.members[0];
      return null;
    },
    chat(p, m) {
      const text = String(m.text || '').trim().slice(0, 200);
      if (!text) return null;
      const nowC = Date.now();
      if (nowC - (p.lastChat || 0) < 1000) return 'Slow down: one message per second';
      p.lastChat = nowC;
      if (m.ch === 'guild') {
        if (!p.guild) return 'Join an alliance to use alliance chat';
        hooks.chatGuild(p.guild, { t: 'chat', from: p.name, text, ts: Date.now(), ch: 'guild' });
      } else hooks.chatAll({ t: 'chat', from: p.name, text, ts: Date.now(), ch: 'all' });
      return null;
    },
  };

  // ---------- views sent to clients ----------
  function guildView(p) {
    const g = p.guild && db.guilds[p.guild];
    if (!g) return null;
    const online = hooks.online();
    const members = g.members.map((n) => { const m = playerByName(n); return { name: n, level: m ? m.level : 1, earned: m ? Math.floor(m.earned) : 0, online: !!(m && online.has(m)) }; });
    const on = members.filter((x) => x.online).length;
    return { tag: g.tag, name: g.name, owner: g.owner, members, bonus: Math.round(4 * Math.min(8, Math.max(0, on - 1))) };
  }
  function meView(p) {
    const stats = {};
    for (const q of W.QUESTS) stats[q.stat] = stat(p, q.stat);
    return {
      name: p.name, money: p.money, earned: p.earned, level: p.level, rank: W.rankOf(p.level), xp: Math.floor(p.xp),
      xpPrev: W.xpFor(p.level), xpNext: p.level >= W.MAX_LEVEL ? null : W.xpFor(p.level + 1),
      stock: p.stock, rigs: p.rigs, rate: p.rate || {}, ships: p.ships, shipments: p.shipments, tech: p.tech,
      quests: p.quests, stats, slots: W.slots(p.level), guild: guildView(p),
      shipCap: W.shipCap(p.ships.cap), shipSpd: W.shipSpd(p.ships.spd), whCap: W.whCap(p.ships.wh),
    };
  }
  function worldView(now, workers) {
    const prices = {};
    for (const c of W.CITIES) { prices[c.id] = {}; for (const o of oreKeys) prices[c.id][o] = round2(unitPrice(c.id, o)); }
    const guilds = Object.values(db.guilds).map((g) => ({
      tag: g.tag, name: g.name, members: g.members.length,
      earned: Math.floor(g.members.reduce((a, n) => a + ((playerByName(n) || {}).earned || 0), 0)),
    })).sort((a, b) => b.earned - a.earned).slice(0, 10);
    return {
      prices, mods: mods.filter((e) => e.until > now), events: events.filter((e) => e.until > now),
      guilds, listings: db.listings.slice(-100),
      contract: contract && { id: contract.id, ore: contract.ore, target: contract.target, progress: contract.progress, reward: contract.reward, expires: contract.expires, by: contract.by },
    };
  }

  return { ensure, newPlayer, actions, tick, meView, worldView, evalQuests, playerByName, addXp };
}

module.exports = { makeGame };
