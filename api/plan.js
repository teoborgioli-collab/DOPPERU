import { put, head } from '@vercel/blob';

/* One document in Blob storage IS the plan. Everyone reads and writes it, so
   it carries a revision number: a save that was based on an older revision is
   refused instead of quietly clobbering someone else's work. The last few
   revisions are kept inline so anything can be restored. */
const KEY = 'plan.json';
const HISTORY = 10;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Key',
    },
  });
}

/* Editors: PLAN_EDIT_KEYS = "matteo:xxxx,ana:yyyy" — one key each, so one can
   be revoked alone and every save records who made it. */
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

function safeEq(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function whoIs(given) {
  for (const e of editors()) if (safeEq(e.key, given)) return e.name;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readPlan() {
  try {
    const meta = await head(KEY, { access: 'public' });
    if (!meta || !meta.url) return null;
    const res = await fetch(meta.url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return null;
    const plan = await res.json();
    return plan && Array.isArray(plan.items) ? plan : null;
  } catch (e) {
    return null; // nothing stored yet
  }
}

async function writePlan(plan) {
  await put(KEY, JSON.stringify(plan, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

/* a history entry is the plan without its own history */
function snapshot(p) {
  return {
    rev: p.rev || 0,
    updated: p.updated || '',
    by: p.by || '',
    label: p.label || '',
    start: p.start || '',
    end: p.end || '',
    defs: p.defs || {},
    items: p.items || [],
  };
}

function cleanBody(body) {
  return {
    start: typeof body.start === 'string' ? body.start : '',
    end: typeof body.end === 'string' ? body.end : '',
    defs: body.defs && typeof body.defs === 'object' ? body.defs : {},
    items: Array.isArray(body.items) ? body.items.slice(0, 100) : [],
    label: typeof body.label === 'string' ? body.label.slice(0, 200) : '',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({ ok: true });

    if (request.method === 'GET') {
      const plan = await readPlan();
      return plan ? json(plan) : json({ error: 'no_plan_yet' }, 404);
    }

    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    if (!editors().length) return json({ error: 'not_configured' }, 503);

    const who = whoIs(request.headers.get('x-edit-key') || '');
    if (!who) {
      await sleep(600); // friction against guessing
      return json({ error: 'bad_key' }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad_json' }, 400);
    }
    if (!body || !Array.isArray(body.items)) return json({ error: 'bad_plan' }, 400);

    const current = await readPlan();
    const currentRev = current ? current.rev || 0 : 0;

    /* Somebody saved since this page loaded. Hand back what is there now and
       let the person decide, rather than losing one of the two versions. */
    if (!body.force && current && Number(body.baseRev) !== currentRev) {
      return json({ error: 'conflict', current }, 409);
    }

    const fields = cleanBody(body);
    const history = current ? [snapshot(current)].concat(current.history || []) : [];

    const plan = {
      rev: currentRev + 1,
      updated: new Date().toISOString(),
      by: who,
      label: fields.label,
      start: fields.start,
      end: fields.end,
      defs: fields.defs,
      items: fields.items,
      history: history.slice(0, HISTORY),
    };

    await writePlan(plan);
    return json(plan);
  },
};
