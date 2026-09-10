import { head } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

/* The guide PDF lives in the same Blob store as the plan (just under a
   different filename) rather than a separate store — connecting a second
   store did not generate its own read-write token, only a STORE_ID and a
   webhook key, and chasing exactly how Vercel's multi-store token model
   works wasn't worth it when reusing the store we already know works avoids
   the question entirely. Nothing here is linked from any public page; the
   only way to ever learn the file's URL is to already hold one of the two
   edit keys. */
const GUIDE_PATH = 'guide.pdf';

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

function headerKey(req) {
  const raw = String(req.headers['x-edit-key'] || '');
  try { return decodeURIComponent(raw); } catch (error) { return raw; }
}

function guideToken() {
  return process.env.GUIDE_BLOB_TOKEN || undefined;
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Edit-Key');
}

function send(res, status, data) {
  setHeaders(res);
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });

    if (!guideToken()) {
      return send(res, 503, {
        error: 'guide_not_configured',
        message: 'Set GUIDE_BLOB_TOKEN in Vercel to a dedicated Blob store\'s read-write token, then redeploy.',
      });
    }

    if (req.method === 'GET') {
      const who = whoIs(headerKey(req));
      if (!who) return send(res, 401, { error: 'bad_key' });
      const meta = await head(GUIDE_PATH, { token: guideToken() }).catch(() => null);
      if (!meta || !meta.url) {
        return send(res, 404, { error: 'no_guide_yet', message: 'No guide has been uploaded yet.' });
      }
      return send(res, 200, { url: meta.url, uploadedAt: meta.uploadedAt || null, size: meta.size || null });
    }

    if (req.method === 'POST') {
      /* handleUpload serves two very different requests on this one route:
         (1) the browser asking for a short-lived upload token — gate this
         on the edit key, passed as clientPayload since this request is
         issued internally by the client SDK and we can't attach our own
         header to it; (2) Blob's own infrastructure confirming the upload
         finished, which carries no edit key at all because it isn't the
         browser calling — that leg is authenticated by Vercel's own signed
         token instead, not ours. */
      const jsonResponse = await handleUpload({
        body: req.body,
        request: req,
        token: guideToken(),
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const who = whoIs(String(clientPayload || ''));
          if (!who) throw new Error('bad_key');
          return {
            pathname: GUIDE_PATH,
            allowedContentTypes: ['application/pdf'],
            addRandomSuffix: false,
            allowOverwrite: true,
            tokenPayload: JSON.stringify({ by: who }),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          console.log('Guide PDF uploaded:', blob.url, tokenPayload || '');
        },
      });
      return send(res, 200, jsonResponse);
    }

    return send(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    console.error('Guide API failure:', error && error.message);
    const message = String((error && error.message) || error);
    return send(res, message === 'bad_key' ? 401 : 500, {
      error: message === 'bad_key' ? 'bad_key' : 'guide_error', message,
    });
  }
}
