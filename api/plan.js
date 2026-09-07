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
      const expected = process.env.PLAN_EDIT_KEY;
      const given = request.headers.get('x-edit-key') || '';
      if (!expected || given !== expected) return json({ error: 'bad_key' }, 401);

      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: 'bad_json' }, 400);
      }
      if (!body || !Array.isArray(body.items)) return json({ error: 'bad_plan' }, 400);

      const plan = {
        updated: new Date().toISOString(),
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
