// Shared world data + economy formulas (used by both server and browser).
// Coastlines: Natural Earth 1:50m (public domain), equirectangular, simplified.
// Map space: x 0..1000 = lon -180..180, y 0..400 = lat 83..-60 (same scale on both axes).
(function (root) {
  const ORES = {
    coal:    { name: 'Coal',    value: 5,   color: '#6b6b78', rarity: 0.00, seed: 101 },
    iron:    { name: 'Iron',    value: 9,   color: '#c4693d', rarity: 0.04, seed: 202 },
    copper:  { name: 'Copper',  value: 14,  color: '#e8913f', rarity: 0.09, seed: 303 },
    silver:  { name: 'Silver',  value: 32,  color: '#d5dee9', rarity: 0.16, seed: 404 },
    gold:    { name: 'Gold',    value: 70,  color: '#ffd23f', rarity: 0.24, seed: 505 },
    diamond: { name: 'Diamond', value: 160, color: '#5be3ff', rarity: 0.33, seed: 606 },
  };
  let LAND = [];

  const MAP_W = 1000, MAP_H = 400, LAT0 = 83, CELL = 5;
  const geo = (lon, lat) => [(lon + 180) / 360 * 1000, (LAT0 - lat) / 360 * 1000];
  const unGeo = (x, y) => [x / 1000 * 360 - 180, LAT0 - y / 1000 * 360];

  // ---- land test (even-odd across a polygon's rings, bbox-accelerated) ----
  let landBox = [];
  function setLand(l) {
    LAND = l; W.LAND = l; cache.clear();
    landBox = LAND.map((rings) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x0, y0, x1, y1];
    });
  }
  function isLand(x, y) {
    for (let i = 0; i < LAND.length; i++) {
      const b = landBox[i];
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      let inside = false;
      for (const ring of LAND[i]) {
        for (let a = 0, c = ring.length - 1; a < ring.length; c = a++) {
          const xi = ring[a][0], yi = ring[a][1], xj = ring[c][0], yj = ring[c][1];
          if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  // ---- deterministic geology ----
  function hash(ix, iy, seed) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.3, y * 2.3, s + 11) * 0.3 + vnoise(x * 5.1, y * 5.1, s + 23) * 0.15;
  const oreKeys = Object.keys(ORES);
  // Returns { ore, score(0..1), rich } for any map point. Fields are ~15-25 degrees wide with sharp hot-spots.
  function deposit(x, y) {
    let best = null, bs = -9;
    for (const k of oreKeys) {
      const o = ORES[k];
      const v = fbm(x / 38, y / 38, o.seed);
      const s = Math.max(0, Math.min(1, (v - 0.30) / 0.42)) - o.rarity;
      if (s > bs) { bs = s; best = k; }
    }
    const score = Math.max(0, Math.min(1, bs));
    return { ore: best, score, rich: Math.round((0.12 + 2.8 * Math.pow(Math.max(0, (score - 0.35) / 0.65), 2.2)) * 100) / 100 };
  }
  const QUALITY = [[0.3, 'Barren'], [0.7, 'Poor'], [1.2, 'Fair'], [1.9, 'Good'], [2.7, 'Rich'], [99, 'Motherlode']];
  const quality = (rich) => QUALITY.find((q) => rich < q[0])[1];

  const ADJ = ['Lost', 'Deep', 'Silent', 'Red', 'Black', 'Frost', 'Dusty', 'Windy', 'Old', 'Hidden', 'Broken', 'Lone', 'Grey', 'Bright', 'Hollow', 'High'];
  const NOUN = ['Ridge', 'Hollow', 'Basin', 'Pit', 'Creek', 'Flats', 'Canyon', 'Mesa', 'Vein', 'Peak', 'Quarry', 'Shaft', 'Rift', 'Bluff'];
  function mineFromCell(gx, gy) {
    const x = (gx + 0.5) * CELL, y = (gy + 0.5) * CELL;
    if (x < 0 || y < 0 || x > MAP_W || y > MAP_H || !isLand(x, y)) return null;
    const d = deposit(x, y), ore = ORES[d.ore];
    const [lon, lat] = unGeo(x, y);
    const h = hash(gx, gy, 77);
    return {
      id: gx + '_' + gy, gx, gy, x, y, ore: d.ore, rich: d.rich,
      cost: Math.round(ore.value * 40 * (0.4 + 0.6 * d.rich)),
      name: `${ADJ[Math.floor(h * ADJ.length)]} ${NOUN[Math.floor(hash(gx, gy, 78) * NOUN.length)]} ${ore.name}`,
      loc: `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`,
    };
  }
  const cache = new Map();
  function mineFromId(id) {
    if (cache.has(id)) return cache.get(id);
    const m = /^(\d{1,3})_(\d{1,3})$/.exec(String(id));
    const r = m ? mineFromCell(+m[1], +m[2]) : null;
    if (cache.size < 5000) cache.set(id, r);
    return r;
  }
  const mineAt = (x, y) => mineFromCell(Math.floor(x / CELL), Math.floor(y / CELL));

  const rawCities = [
    ['nyc', 'New York', 40.7, -74.0, ['iron', 'diamond']],
    ['la', 'Los Angeles', 34.0, -118.2, ['gold', 'copper']],
    ['hou', 'Houston', 29.7, -95.3, ['coal', 'silver']],
    ['rio', 'Rio', -22.9, -43.2, ['silver', 'coal']],
    ['bue', 'Buenos Aires', -34.6, -58.4, ['copper', 'iron']],
    ['lon', 'London', 51.5, -0.1, ['gold', 'diamond']],
    ['los', 'Lagos', 6.5, 3.4, ['iron', 'coal']],
    ['cpt', 'Cape Town', -33.9, 18.4, ['copper', 'silver']],
    ['dxb', 'Dubai', 25.2, 55.3, ['gold', 'diamond']],
    ['mum', 'Mumbai', 19.0, 72.8, ['silver', 'gold']],
    ['sin', 'Singapore', 1.3, 103.8, ['silver', 'copper']],
    ['sha', 'Shanghai', 31.2, 121.5, ['copper', 'iron', 'coal']],
    ['tok', 'Tokyo', 35.7, 139.7, ['copper', 'gold']],
    ['syd', 'Sydney', -33.9, 151.2, ['coal', 'gold']],
  ];
  const CITIES = rawCities.map(([id, name, lat, lon, hot]) => { const [x, y] = geo(lon, lat); return { id, name, x, y, hot }; });

  const MAX = { rigs: 20, rigLvl: 15, up: 15, fleet: 8, mines: 12 };
  const COOP = { per: 0.15, maxOthers: 6 };


  // ---------- progression rules (shared by server and client) ----------
  const MAX_LEVEL = 30;
  const xpFor = (lvl) => (lvl <= 1 ? 0 : Math.round(80 * Math.pow(lvl - 1, 1.8))); // total XP needed to reach `lvl`
  const ORE_LEVEL = { coal: 1, iron: 1, copper: 3, silver: 5, gold: 8, diamond: 12 };   // player level needed to open a mine of this ore
  const slots = (lvl) => Math.min(MAX.mines, 2 + Math.floor(lvl / 2));                    // how many mines you may run
  const TECHS = {
    drill:  { name: 'Deep Drilling',     icon: '⛏', max: 8, desc: '+10% ore output per level',                 per: 0.10 },
    haggle: { name: 'Trade Contracts',   icon: '💱', max: 8, desc: '+4% sale price at ports per level',          per: 0.04 },
    survey: { name: 'Geological Survey', icon: '🧭', max: 8, desc: '-5% claim, rig and upgrade costs per level', per: 0.05 },
    insure: { name: 'Cargo Insurance',   icon: '🛟', max: 5, desc: '-20% cargo lost to storms per level',        per: 0.20 },
  };
  const techCost = (lvl) => Math.round(300 * Math.pow(1.9, lvl));   // cost to go from lvl -> lvl+1
  const techReqLevel = (lvl) => 2 + 2 * lvl;                          // player level needed for lvl -> lvl+1
  const STORM_LOSS = 0.3;                                              // base fraction of cargo lost if a route crosses a storm
  const QUESTS = [
    { id: 'mine1', title: 'Break ground', desc: 'Click any land on the map and found your first mine.', stat: 'mines', goal: 1, money: 50, xp: 20 },
    { id: 'rigs3', title: 'Expand operations', desc: 'Own 3 rigs in total. Open a mine and press "+ Rig".', stat: 'rigsTotal', goal: 3, money: 75, xp: 25 },
    { id: 'ship10', title: 'First delivery', desc: 'Ship ore to a port city and sell 10 units.', stat: 'shippedUnits', goal: 10, money: 100, xp: 40 },
    { id: 'earn500', title: 'Pocket money', desc: 'Earn $500 in total.', stat: 'earned', goal: 500, money: 150, xp: 50 },
    { id: 'upg2', title: 'Better drills', desc: 'Upgrade a rig to level 2 with the "Level" button.', stat: 'maxRigLevel', goal: 2, money: 100, xp: 50 },
    { id: 'lvl3', title: 'Rising star', desc: 'Reach player level 3 (earn XP by mining, selling and upgrading).', stat: 'level', goal: 3, money: 200, xp: 60 },
    { id: 'mine2', title: 'Second site', desc: 'Found a second mine. Different places hold different ores.', stat: 'mines', goal: 2, money: 150, xp: 60 },
    { id: 'trade20', title: 'Trader', desc: 'Buy 20 ore from other players on the trade board (Trade tab).', stat: 'boughtUnits', goal: 20, money: 150, xp: 50 },
    { id: 'coop', title: 'Teamwork', desc: 'Work a mine at the same time as an established player (they need $100+ earned and a different network).', stat: 'coopSeen', goal: 1, money: 200, xp: 80 },
    { id: 'tech1', title: 'Research', desc: 'Buy your first technology upgrade in the Fleet tab.', stat: 'techLevels', goal: 1, money: 200, xp: 80 },
    { id: 'hire1', title: 'Delegate', desc: 'Hire a worker in the Fleet tab to ship ore for you automatically.', stat: 'workers', goal: 1, money: 400, xp: 120 },
    { id: 'contr25', title: 'Answer the call', desc: 'Deliver 25 ore to a global contract.', stat: 'contractUnits', goal: 25, money: 300, xp: 100 },
    { id: 'earn5k', title: 'Small fortune', desc: 'Earn $5,000 in total.', stat: 'earned', goal: 5000, money: 500, xp: 200 },
    { id: 'ally', title: 'Stronger together', desc: 'Be in an alliance at level 3 or higher (Ally tab).', stat: 'inGuild', goal: 1, money: 300, xp: 100 },
    { id: 'ships3', title: 'Fleet commander', desc: 'Own 3 ships.', stat: 'ships', goal: 3, money: 700, xp: 250 },
    { id: 'lvl8', title: 'Mining baron', desc: 'Reach player level 8 (unlocks gold mines).', stat: 'level', goal: 8, money: 1500, xp: 400 },
    { id: 'earn50k', title: 'Tycoon', desc: 'Earn $50,000 in total.', stat: 'earned', goal: 50000, money: 4000, xp: 800 },
    { id: 'lvl15', title: 'Industry legend', desc: 'Reach player level 15.', stat: 'level', goal: 15, money: 8000, xp: 1500 },
  ];
  // ---------- hired workers: automatic shipping ----------
  const WORKER_FEE = 0.10;                                             // share of each worker delivery paid as wages
  const workerSlots = (lvl) => Math.floor(lvl / 3);                    // level 3 -> 1 worker, 6 -> 2, ...
  const workerCost = (n) => Math.round(500 * Math.pow(2, n));          // hiring cost, n = workers you already have
  const WORKER_DEST = { best: 'Best price (avoids storms)', near: 'Nearest port (fast)' };
  const WORKER_LOAD = { full: 'Wait for a full load', any: 'Go with 10+ ore' };
  const RANKS = [[1, 'Prospector'], [3, 'Digger'], [5, 'Foreman'], [8, 'Mine Boss'], [12, 'Baron'], [16, 'Tycoon'], [22, 'Magnate'], [28, 'Legend']];
  const rankOf = (lvl) => { let r = RANKS[0][1]; for (const [l, n] of RANKS) if (lvl >= l) r = n; return r; };

  const W = {
    MAX_LEVEL, xpFor, ORE_LEVEL, slots, TECHS, techCost, techReqLevel, STORM_LOSS, QUESTS, RANKS, rankOf, WORKER_FEE, workerSlots, workerCost, WORKER_DEST, WORKER_LOAD,
    ORES, LAND, CITIES, MAX, COOP, CELL, MAP_W, MAP_H,
    geo, unGeo, isLand, setLand, deposit, quality, mineFromId, mineAt, fbm,
    START_MONEY: 400,
    TRADE_FEE: 0.05,
    HOT: 1.4,
    BOOM: 1.8,
    rigCost: (site, n, d = 0) => Math.round(site.cost * 0.5 * Math.pow(1.35, n) * (1 - d)),
    rigLvlCost: (site, l, d = 0) => Math.round(site.cost * 0.8 * Math.pow(1.6, l - 1) * (1 - d)),
    claimCost: (site, d = 0) => Math.round(site.cost * (1 - d)),
    rigRate: (l) => 0.4 * (1 + 0.5 * (l - 1)),
    shipCap: (l) => Math.round(40 * Math.pow(1.4, l - 1)),
    shipSpd: (l) => 20 * Math.pow(1.2, l - 1),
    capCost: (l) => Math.round(250 * Math.pow(1.8, l - 1)),
    spdCost: (l) => Math.round(250 * Math.pow(1.8, l - 1)),
    fleetCost: (n) => Math.round(500 * Math.pow(2.2, n - 1)),
    whCap: (l) => Math.round(200 * Math.pow(1.5, l - 1)),
    whCost: (l) => Math.round(200 * Math.pow(1.8, l - 1)),
    distBonus: (d) => 1 + d / 400,
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = W;
  else root.WORLD = W;
})(typeof window !== 'undefined' ? window : this);
