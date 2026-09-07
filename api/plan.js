import { put, head } from '@vercel/blob';

/* One file in Blob storage holds the published plan. Fixed name, no random
   suffix, overwritten in place — so every visitor reads the same thing. */
const KEY = 'plan.json';

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

/* Editors are configured as PLAN_EDIT_KEYS = "matteo:xxxx,ana:yyyy".
   Each person gets their own key, so one can be revoked without disturbing
   the others, and every publish records who did it.
   PLAN_EDIT_KEY (single, unnamed) still works for a one-person setup. */
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

/* compare without leaking where the difference is */
function safeEq(a, b) {
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

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return json({ ok: true });

    if (request.method === 'GET') {
      const plan = await readPlan();
      return plan ? json(plan) : json({ error: 'no_plan_yet' }, 404);
    }

    if (request.method === 'POST') {
      if (!editors().length) {
        return json({ error: 'not_configured' }, 503);
      }
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

      /* Refuse an obvious stale overwrite: if this browser loaded version A,
         but Blob is already on version B, ask it to load latest first. */
      const current = await readPlan();
      const expected = typeof body.expectedUpdated === 'string' ? body.expectedUpdated : '';
      const currentUpdated = current && typeof current.updated === 'string' ? current.updated : '';
      if (expected && currentUpdated && expected !== currentUpdated) {
        return json({ error: 'stale_plan', currentUpdated }, 409);
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

      await put(KEY, JSON.stringify(plan, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });

      return json(plan);
    }

    return json({ error: 'method_not_allowed' }, 405);
  },
};
