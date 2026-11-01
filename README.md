# ⛏ OreWorld 2

A multiplayer mining & shipping game on a real world map. Prospect anywhere on land, found mines, ship ore to port cities,
level up, research technology, finish goals, join an alliance and rise from Prospector to Legend.

* **Root of this repo = the Vercel version** (static client in `public/`, API in `api/` + `lib/`, shared world in Upstash Redis).
* **`selfhosted/` = the same game as a single Node + WebSocket server** (`cd selfhosted && npm install && npm start`).

## Deploy on Vercel
1. Import this repo in Vercel (framework preset **Other**, no build command, output directory `public`).
2. Storage tab → Create → **Upstash Redis** (free) → connect it to the project (adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`), then redeploy.
3. Optional env var: `ACCOUNTS_PER_IP` (default 3). `GET /api/health` shows whether the database is connected.

Free Upstash tier: 500k commands/month ≈ 500 player-hours at the default 7 s polling.

## Self-hosted
`cd selfhosted && npm install && npm start` → http://localhost:3000. See `selfhosted/README.md` (Docker, Render, Fly, free tunnel).
