import { head } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

/* One book, one slot. Reading is always open (no password) — the GET below
   never checks a key. Replacing it does need the password, checked in
   onBeforeGenerateToken, since this app's URL is a public Vercel domain
   (those show up in certificate-transparency logs, so "nobody will guess it"
   isn't real privacy). */
const BOOK_PATH = 'book.epub';

function safeEq(a, b) {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function checkKey(given) {
  const expected = process.env.BOOK_EDIT_KEY || '';
  return expected.length >= 4 && safeEq(expected, String(given || ''));
}

/* @vercel/blob looks for BLOB_READ_WRITE_TOKEN by default; connecting a
   store through the dashboard can instead name it after the store, so fall
   back to whatever *_READ_WRITE_TOKEN is present before giving up. */
function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => /_READ_WRITE_TOKEN$/.test(k));
  return key ? process.env[key] : undefined;
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

function send(res, status, data) {
  setHeaders(res);
  return res.status(status).json(data);
}

export default async function handler(req, res) {
  try {
    if (req.query && req.query.diag === '1') {
      return send(res, 200, {
        tokenConfigured: !!blobToken(),
        keyConfigured: (process.env.BOOK_EDIT_KEY || '').length >= 4,
      });
    }

    if (!blobToken()) {
      return send(res, 503, {
        error: 'not_configured',
        message: 'No Blob read-write token found. Project → Storage → Create Database → Blob → connect it to this project, then redeploy.',
      });
    }

    if (req.method === 'GET') {
      const meta = await head(BOOK_PATH, { token: blobToken() }).catch(() => null);
      if (!meta || !meta.url) return send(res, 200, { empty: true });
      return send(res, 200, { url: meta.url, uploadedAt: meta.uploadedAt || null, size: meta.size || null });
    }

    if (req.method === 'POST') {
      /* handleUpload serves two very different requests on this one route:
         (1) the browser asking for a short-lived upload token — gated on
         the password, passed as clientPayload since this request is issued
         internally by the client SDK and we can't attach our own header to
         it; (2) Blob's own infrastructure confirming the upload finished,
         which carries no password at all because it isn't the browser
         calling — that leg is authenticated by Vercel's own signed token
         instead, not ours. */
      const jsonResponse = await handleUpload({
        body: req.body,
        request: req,
        token: blobToken(),
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          if (pathname !== BOOK_PATH) throw new Error('bad_pathname');
          if (!checkKey(clientPayload)) throw new Error('bad_key');
          return {
            pathname: BOOK_PATH,
            allowedContentTypes: ['application/epub+zip', 'application/octet-stream'],
            addRandomSuffix: false,
            allowOverwrite: true,
          };
        },
        onUploadCompleted: async ({ blob }) => {
          console.log('Book uploaded:', blob.url);
        },
      });
      return send(res, 200, jsonResponse);
    }

    return send(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    console.error('Book API failure:', error && error.message);
    const message = String((error && error.message) || error);
    return send(res, message === 'bad_key' ? 401 : 500, {
      error: message === 'bad_key' ? 'bad_key' : 'book_error', message,
    });
  }
}
