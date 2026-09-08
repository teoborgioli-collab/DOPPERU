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
      'X-Plan-Open': isOpen() ? '1' : '0',
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
  return out.filter((e) => e.name && e.key.length >= 4);
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

/* Saving needs no key by default: anyone with the address can save, which is
   what a small shared plan usually wants. Set PLAN_EDIT_KEYS to lock it down;
   PLAN_OPEN=true forces open even when keys exist. Either way nothing is lost
   for good — every save keeps the previous ten versions. */
function isOpen() {
  const forced = (process.env.PLAN_OPEN || '').trim().toLowerCase();
  if (forced === 'true' || forced === '1' || forced === 'yes') return true;
  return editors().length === 0;
}

function cleanName(n) {
  return typeof n === 'string'
    ? n.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 24)
    : '';
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

const STATUSES = ['', 'unsure', 'optional', 'tobook', 'booked'];

function cleanItem(it) {
  const out = {
    id: String(it.id || '').slice(0, 60),
    nights: Math.min(60, Math.max(1, parseInt(it.nights, 10) || 1)),
    note: typeof it.note === 'string' ? it.note.slice(0, 2000) : '',
    vibe: typeof it.vibe === 'string' ? it.vibe.slice(0, 120) : '',
  };
  out.acts = Array.isArray(it.acts)
    ? it.acts.slice(0, 60).map((a) => ({
        d: Math.min(60, Math.max(0, parseInt(a && a.d, 10) || 0)),
        t: String((a && a.t) || '').slice(0, 120),
        u: typeof (a && a.u) === 'string' ? a.u.slice(0, 500) : '',
        s: STATUSES.includes(a && a.s) ? a.s : '',
        n: typeof (a && a.n) === 'string' ? a.n.slice(0, 300) : '',
      })).filter((a) => a.t)
    : [];
  return out;
}

function cleanBody(body) {
  return {
    start: typeof body.start === 'string' ? body.start : '',
    end: typeof body.end === 'string' ? body.end : '',
    defs: body.defs && typeof body.defs === 'object' ? body.defs : {},
    items: Array.isArray(body.items) ? body.items.slice(0, 100).map(cleanItem) : [],
    label: typeof body.label === 'string' ? body.label.slice(0, 200) : '',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({ ok: true });

    if (request.method === 'GET') {
      /* /api/plan?diag=1 — what the server actually sees. Names and lengths
         only, never the keys themselves. */
      if (new URL(request.url).searchParams.get('diag')) {
        const list = editors();
        return json({
          build: '2026-09-08-final9',
          openMode: isOpen(),
          PLAN_EDIT_KEYS_set: !!(process.env.PLAN_EDIT_KEYS || '').trim(),
          PLAN_EDIT_KEY_set: !!(process.env.PLAN_EDIT_KEY || '').trim(),
          BLOB_TOKEN_set: !!(process.env.BLOB_READ_WRITE_TOKEN || '').trim(),
          usableEditors: list.length,
          names: list.map((e) => e.name),
          keyLengths: list.map((e) => e.key.length),
          hint: isOpen()
            ? 'Open mode: no key needed to save. Set PLAN_EDIT_KEYS (name:key pairs, key at least 4 characters) and redeploy if you want it locked.'
            : 'Keys are on. If a save is rejected, the key typed into the page does not match one of the names above.',
        });
      }

      const plan = await readPlan();
      return plan ? json(plan) : json({ error: 'no_plan_yet' }, 404);
    }

    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const open = isOpen();

    let who = null;
    if (!open) {
      who = whoIs(request.headers.get('x-edit-key') || '');
      if (!who) {
        await sleep(600); // friction against guessing
        return json({ error: 'bad_key' }, 401);
      }
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'bad_json' }, 400);
    }
    if (!body || !Array.isArray(body.items)) return json({ error: 'bad_plan' }, 400);

    if (open) who = cleanName(body.by) || 'someone';

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
