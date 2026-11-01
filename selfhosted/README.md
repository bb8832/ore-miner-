# ⛏ OreWorld 2

A multiplayer mining & shipping game on a real world map. Prospect anywhere on land, found mines, ship ore to port cities,
level up, research technology, finish goals, join an alliance and rise from Prospector to Legend.

```bash
npm install
npm start              # http://localhost:3000   (PORT, DATA_FILE, ACCOUNTS_PER_IP env vars)
```

## What's new compared with OreWorld 1
- **Progression:** player level + XP (30 levels, 8 ranks). Levels unlock richer ores (copper L3, silver L5, gold L8, diamond L12) and more mine slots.
- **17 guided goals** with money + XP rewards; a goal bar on the map always shows what to do next, plus a first-run intro.
- **Research:** Deep Drilling (+output), Trade Contracts (+sale price), Geological Survey (-costs), Cargo Insurance (-storm losses).
- **World events:** mineral rushes (x1.8 output in an area), **storms** (ships whose route crosses one lose cargo - plan around them),
  market booms and gluts.
- **Alliances:** create/join (level 3, $1,000), +4% output per other member online (max +32%), private chat, alliance leaderboard.
- Sound effects (toggle 🔊), level-up and goal fanfares, coin bursts when cargo sells.

## Layout
`server.js` network, accounts, persistence, tick loop · `game.js` all rules · `public/world.js` shared data/formulas/quests · `public/index.html` client.

Hosting: same as OreWorld 1 (one long-running Node process; Docker/Render/Fly/VPS; optional Upstash Redis via
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for hosts without a disk). `GET /healthz` for monitoring.
