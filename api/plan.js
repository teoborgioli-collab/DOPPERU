import { put, head } from '@vercel/blob';
import Pusher from 'pusher';

const KEY = 'plan.json';
const HISTORY = 10;
const STATUSES = ['', 'unsure', 'optional', 'tobook', 'booked'];
const DECISIONS = ['', 'approved', 'unsure', 'disapproved'];

function editors() {
  const out = [];
  (process.env.PLAN_EDIT_KEYS || '').split(',').forEach((pair) => {
    const p = pair.trim();
    const i = p.indexOf(':');
    if (i > 0) out.push({ name: p.slice(0, i).trim().toLowerCase(), key: p.slice(i + 1).trim() });
  });
  return out.filter((e) => ['matteo', 'levin'].includes(e.name) && e.key.length >= 4);
}

function safeEq(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function whoIs(given) {
  for (const editor of editors()) if (safeEq(editor.key, given)) return editor.name;
  return null;
}

/* the client percent-encodes the key before putting it in a header — a
   header value has to be ISO-8859-1, and a key with a smart quote or emoji
   in it (easy to end up with from phone autocorrect) is not */
function headerKey(req) {
  const raw = String(req.headers['x-edit-key'] || '');
  try { return decodeURIComponent(raw); } catch (error) { return raw; }
}

function randomId() {
  return 'a' + Math.random().toString(36).slice(2, 10);
}

/* @vercel/blob looks for exactly BLOB_READ_WRITE_TOKEN by default. Connecting
   a store through the dashboard can instead name it after the store itself
   (e.g. DOPPERU_READ_WRITE_TOKEN) to avoid collisions with other stores in
   the same project — so look for that shape too before giving up. */
function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => /_READ_WRITE_TOKEN$/.test(k));
  return key ? process.env[key] : undefined;
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Edit-Key');
  res.setHeader('X-Plan-Open', '0');
}

function send(res, status, data) {
  setHeaders(res);
  return res.status(status).json(data);
}

async function readPlan() {
  try {
    const meta = await head(KEY, { token: blobToken() });
    if (!meta || !meta.url) return null;
    const response = await fetch(meta.url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('storage_read_failed');
    const plan = await response.json();
    if (!plan || !Array.isArray(plan.items)) throw new Error('invalid_stored_plan');
    return plan;
  } catch (error) {
    /* nothing saved yet is the expected, common case — the very first read
       against a brand-new store included — so match loosely (exact error
       shapes have drifted across @vercel/blob versions) rather than treat
       it as a real storage failure */
    const text = String((error && error.name) || '') + ' ' + String((error && error.message) || '');
    if (/not\s*found/i.test(text)) return null;
    throw error;
  }
}

async function writePlan(plan) {
  await put(KEY, JSON.stringify(plan, null, 2), {
    access: 'public', addRandomSuffix: false, allowOverwrite: true,
    contentType: 'application/json', cacheControlMaxAge: 60, token: blobToken(),
  });
}

/* Optional: an instant nudge to any open tab, instead of it waiting for the
   next poll. Entirely skipped if the four PUSHER_* variables are not set —
   the periodic poll on the page still covers everything on its own. */
async function announce(rev) {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) return;
  try {
    const pusher = new Pusher({
      appId: PUSHER_APP_ID, key: PUSHER_KEY, secret: PUSHER_SECRET,
      cluster: PUSHER_CLUSTER, useTLS: true,
    });
    await pusher.trigger('plan', 'updated', { rev });
    console.log('Pusher: announced rev', rev);
  } catch (error) {
    console.error('Pusher announce failed (save still succeeded):', error && error.message);
  }
}

function snapshot(plan) {
  return {
    rev: plan.rev || 0, updated: plan.updated || '', by: plan.by || '', label: plan.label || '',
    title: plan.title || '', subtitle: plan.subtitle || '', start: plan.start || '', end: plan.end || '',
    defs: plan.defs || {}, items: plan.items || [], scenarios: plan.scenarios,
    activeScenario: plan.activeScenario,
  };
}

function cleanVotes(votes) {
  const v = votes && typeof votes === 'object' ? votes : {};
  return {
    matteo: DECISIONS.includes(v.matteo) ? v.matteo : '',
    levin: DECISIONS.includes(v.levin) ? v.levin : '',
  };
}

function cleanItem(item) {
  const it = item || {};
  return {
    id: String(it.id || '').slice(0, 60),
    nights: Math.min(60, Math.max(1, parseInt(it.nights, 10) || 1)),
    note: typeof it.note === 'string' ? it.note.slice(0, 2000) : '',
    vibe: typeof it.vibe === 'string' ? it.vibe.slice(0, 120) : '',
    acts: Array.isArray(it.acts) ? it.acts.slice(0, 60).map((activity) => ({
      id: String((activity && activity.id) || '').slice(0, 40) || randomId(),
      d: Math.min(60, Math.max(0, parseInt(activity && activity.d, 10) || 0)),
      t: String((activity && activity.t) || '').slice(0, 120),
      u: typeof (activity && activity.u) === 'string' ? activity.u.slice(0, 500) : '',
      s: STATUSES.includes(activity && activity.s) ? activity.s : '',
      n: typeof (activity && activity.n) === 'string' ? activity.n.slice(0, 300) : '',
      votes: cleanVotes(activity && activity.votes),
    })).filter((activity) => activity.t) : [],
  };
}

function cleanBody(body) {
  const scenarios = Array.isArray(body.scenarios) ? body.scenarios.slice(0, 20)
    .filter((scenario) => scenario && Array.isArray(scenario.items)).map((scenario, index) => ({
      id: String(scenario.id || 'scenario-' + index).slice(0, 80),
      name: String(scenario.name || 'Option ' + (index + 1)).slice(0, 40),
      start: typeof scenario.start === 'string' ? scenario.start : '',
      end: typeof scenario.end === 'string' ? scenario.end : '',
      defs: scenario.defs && typeof scenario.defs === 'object' ? scenario.defs : {},
      items: scenario.items.slice(0, 100).filter(Boolean).map(cleanItem),
    })) : [];
  const active = scenarios.find((scenario) => scenario.id === body.activeScenario) || scenarios[0];
  return {
    title: typeof body.title === 'string' ? body.title.slice(0, 100) : '',
    subtitle: typeof body.subtitle === 'string' ? body.subtitle.slice(0, 400) : '',
    start: typeof body.start === 'string' ? body.start : '',
    end: typeof body.end === 'string' ? body.end : '',
    defs: body.defs && typeof body.defs === 'object' ? body.defs : {},
    items: Array.isArray(body.items) ? body.items.slice(0, 100).map(cleanItem) : [],
    scenarios, activeScenario: active ? active.id : 'main',
    label: typeof body.label === 'string' ? body.label.slice(0, 200) : '',
  };
}

function storageError(error) {
  const text = String((error && error.name) || '') + ' ' + String((error && error.message) || '');
  /* exposing the raw error here is a deliberate, temporary trade-off — this
     is a two-person planner, not a public service, and it turns "check the
     Vercel dashboard logs" into "read the on-screen notice" while this is
     still being tracked down */
  const raw = { name: (error && error.name) || null, message: (error && error.message) || null };
  if (!blobToken()) return [503, { error: 'storage_not_configured', message: 'Vercel Blob is not connected. Connect a Blob store to this project and redeploy.', raw }];
  if (/token|unauthorized|forbidden/i.test(text)) return [503, { error: 'storage_auth_failed', message: 'Vercel cannot access the connected Blob store. Reconnect it and redeploy.', raw }];
  return [503, { error: 'storage_unavailable', message: 'The shared storage could not be read or saved. Check the Vercel function logs.', raw }];
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

    const configured = editors();
    if (req.method === 'GET' && req.query && req.query.diag) return send(res, 200, {
      build: '2026-09-09-expose-raw-error', openMode: false,
      PLAN_EDIT_KEYS_set: !!(process.env.PLAN_EDIT_KEYS || '').trim(),
      BLOB_TOKEN_set: !!blobToken(),
      PUSHER_configured: !!(process.env.PUSHER_APP_ID && process.env.PUSHER_KEY
        && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER),
      usableEditors: configured.length, names: configured.map((e) => e.name),
    });
    if (configured.length !== 2 || !configured.some((e) => e.name === 'matteo') || !configured.some((e) => e.name === 'levin')) {
      return send(res, 503, { error: 'invalid_edit_keys', message: 'Set PLAN_EDIT_KEYS in Vercel with exactly matteo:key,levin:key (each key at least 4 characters), then redeploy.' });
    }

    if (req.method === 'GET') {
      if (req.query && req.query.who) {
        const name = whoIs(headerKey(req));
        return name ? send(res, 200, { name }) : send(res, 401, { error: 'bad_key' });
      }
      const plan = await readPlan();
      return plan ? send(res, 200, plan) : send(res, 404, { error: 'no_plan_yet' });
    }

    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    const who = whoIs(headerKey(req));
    if (!who) return send(res, 401, { error: 'bad_key', message: 'That edit key was not accepted.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.items)) return send(res, 400, { error: 'bad_plan' });
    const current = await readPlan();
    const currentRev = current ? current.rev || 0 : 0;
    if (!body.force && current && Number(body.baseRev) !== currentRev) {
      return send(res, 409, { error: 'conflict', current });
    }

    const fields = cleanBody(body);
    const history = current ? [snapshot(current)].concat(current.history || []) : [];
    const plan = {
      rev: currentRev + 1, updated: new Date().toISOString(), by: who, label: fields.label,
      title: fields.title, subtitle: fields.subtitle, start: fields.start, end: fields.end,
      defs: fields.defs, items: fields.items, scenarios: fields.scenarios,
      activeScenario: fields.activeScenario, history: history.slice(0, HISTORY),
    };
    await writePlan(plan);
    /* awaited, not fire-and-forget: a serverless function can be frozen the
       instant the response is sent, which would cut this off mid-request */
    await announce(plan.rev);
    return send(res, 200, plan);
  } catch (error) {
    console.error('Plan API failure:', error && error.name ? error.name : 'Error');
    const [status, payload] = storageError(error);
    return send(res, status, payload);
  }
}
