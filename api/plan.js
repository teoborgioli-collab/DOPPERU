import { put, head } from '@vercel/blob';

const KEY = 'plan.json';

function editors() {
  const out = [];
  (process.env.PLAN_EDIT_KEYS || '').split(',').forEach((pair) => {
    const p = pair.trim();
    const i = p.indexOf(':');
    if (i > 0) out.push({ name: p.slice(0, i).trim(), key: p.slice(i + 1).trim() });
  });
  const single = (process.env.PLAN_EDIT_KEY || '').trim();
  if (single) out.push({ name: 'editor', key: single });
  return out.filter((e) => e.name && e.key.length >= 8);
}

function safeEq(a = '', b = '') {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function whoIs(given) {
  for (const e of editors()) if (safeEq(e.key, given)) return e.name;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readPlan() {
  try {
    const meta = await head(KEY);
    if (!meta?.url) return null;
    const r = await fetch(meta.url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const plan = await r.json();
    return plan && Array.isArray(plan.items) ? plan : null;
  } catch {
    return null;
  }
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Edit-Key');
}

export default async function handler(req, res) {
  setHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });

  if (req.method === 'GET') {
    const plan = await readPlan();
    return plan ? res.status(200).json(plan) : res.status(404).json({ error: 'no_plan_yet' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!editors().length) return res.status(503).json({ error: 'not_configured' });

  const who = whoIs(req.headers['x-edit-key'] || '');
  if (!who) {
    await sleep(600);
    return res.status(401).json({ error: 'bad_key' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad_json' }); }
  }
  if (!body || !Array.isArray(body.items)) return res.status(400).json({ error: 'bad_plan' });

  const current = await readPlan();
  const expected = typeof body.expectedUpdated === 'string' ? body.expectedUpdated : '';
  const currentUpdated = current && typeof current.updated === 'string' ? current.updated : '';
  if (expected && currentUpdated && expected !== currentUpdated) {
    return res.status(409).json({ error: 'stale_plan', currentUpdated });
  }

  const plan = {
    updated: new Date().toISOString(),
    by: who,
    label: typeof body.label === 'string' ? body.label.slice(0, 200) : '',
    start: typeof body.start === 'string' ? body.start : '',
    end: typeof body.end === 'string' ? body.end : '',
    defs: body.defs && typeof body.defs === 'object' ? body.defs : {},
    items: body.items.slice(0, 100),
  };

  try {
    await put(KEY, JSON.stringify(plan, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
    });
  } catch (err) {
    console.error('Blob write failed:', err);
    return res.status(500).json({ error: 'blob_write_failed', message: err?.message || 'Unknown Blob error' });
  }

  return res.status(200).json(plan);
}
