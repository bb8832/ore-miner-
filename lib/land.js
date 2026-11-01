'use strict';
// Builds the map's land polygons from Natural Earth (npm: world-atlas) in game coordinates, and installs them into the shared world module.
// Same algorithm in every instance => identical results; the browser downloads the result from /api/land.
const topo = require('topojson-client');
const W = require('../public/world.js');

const LAT0 = 83, H = 400;
const proj = ([lon, lat]) => [(lon + 180) / 360 * 1000, (LAT0 - lat) / 360 * 1000];
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  let md = 0, mi = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > md) { md = d; mi = i; }
  }
  if (md > eps) { const l = dp(pts.slice(0, mi + 1), eps), r = dp(pts.slice(mi), eps); return l.slice(0, -1).concat(r); }
  return [a, b];
}
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); };

function build() {
  const t = require('world-atlas/land-50m.json');
  const g = topo.feature(t, t.objects.land);
  const geoms = g.features ? g.features.map((f) => f.geometry) : [g.geometry];
  const polys = geoms.flatMap((geom) => (geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]));
  const unwrap = (ring) => { // make longitudes continuous across the date line
    let off = 0, prev = null;
    return ring.map((pt) => {
      const [x, y] = proj(pt); let X = x + off;
      if (prev !== null) { while (X - prev > 500) { off -= 1000; X -= 1000; } while (prev - X > 500) { off += 1000; X += 1000; } }
      prev = X; return [X, y];
    });
  };
  const mk = (ring, min) => {
    const c = ring.map(([x, y]) => [x, Math.min(y, H)]);
    if (area(c) < min) return null;
    const r = dp(c.slice(0, -1), 0.35);
    return r.length < 4 ? null : r.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]);
  };
  const out = [];
  for (const poly of polys) {
    const outer = unwrap(poly[0]);
    if (Math.min(...outer.map((p) => p[1])) >= H) continue; // Antarctica etc.
    const o = mk(outer, 3); if (!o) continue;
    const holes = poly.slice(1).map((h) => mk(unwrap(h), 6)).filter(Boolean);
    const p2 = [o, ...holes];
    const xs = o.map((p) => p[0]), mn = Math.min(...xs), mx = Math.max(...xs);
    out.push(p2);
    if (mn < 0 || mx > 1000) { const sh = mx > 1000 ? -1000 : 1000; out.push(p2.map((r) => r.map(([x, y]) => [+(x + sh).toFixed(1), y]))); }
  }
  return out;
}

const land = build();
W.setLand(land);
module.exports = { land };
