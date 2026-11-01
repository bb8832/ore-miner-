'use strict';
// Minimal Upstash/Vercel-KV REST client (works with the Upstash Redis integration's env vars).
let URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
if (URL_ && !/^https?:\/\//.test(URL_)) URL_ = 'https://' + URL_;
URL_ = URL_.replace(/\/+$/, '');

const configured = () => !!(URL_ && TOKEN);
async function pipe(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds.map((c) => c.map((x) => (typeof x === 'number' ? String(x) : x)))), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('redis http ' + r.status);
  const j = await r.json();
  return j.map((x) => { if (x && x.error) throw new Error('redis: ' + x.error); return x ? x.result : null; });
}
const cmd = async (...c) => (await pipe([c]))[0];
module.exports = { configured, pipe, cmd };
