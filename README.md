# Epub Reader

A single-page EPUB reader that remembers one book for you. Whoever opens
the deployed link sees the same book, automatically — no picking a file
every time. Reading position, font size, and theme are remembered per-device
in `localStorage`.

## Files

```
index.html    the whole app
api/book.js   stores/serves the one book, in Vercel Blob
package.json  declares the @vercel/blob dependency
vercel.json   marks this as a plain static + serverless-functions deploy
```

## Run locally

```bash
npx serve .
```

The `/api/book` calls will fail locally unless you also run `vercel dev`
(which needs a linked Vercel project + Blob store) — plain `serve` is fine
for checking the reader itself; it'll just show the "choose a file" screen
since it can't reach a real `/api/book`.

## Deploy to Vercel

1. Put these files in a GitHub repo (or run `npx vercel` from this folder
   with the Vercel CLI — no GitHub needed either way).
2. vercel.com/new → import the repo. Framework **Other**, build command
   **empty**, output directory **empty** (or the repo root).
3. Project → **Storage** → **Create Database** → **Blob** → connect it to
   this project. That adds `BLOB_READ_WRITE_TOKEN` on its own.
4. Settings → **Environment Variables** → add `BOOK_EDIT_KEY` with a
   password of your choosing (at least 4 characters), all environments.
5. Redeploy.

### Check it worked

Open `https://your-reader.vercel.app/api/book?diag=1`. You should see
`"tokenConfigured": true` and `"keyConfigured": true`. If you get Vercel's
own 404 page instead, `api/book.js` is in the wrong place or `package.json`
is missing.

## Using it

- First visit: pick an `.epub` file (or drop one on the page) and enter the
  password you set as `BOOK_EDIT_KEY`. It opens immediately and uploads in
  the background — reading doesn't wait on the upload.
- After that, anyone who opens the link sees that same book automatically.
- **Replace book** (top bar) swaps in a different file — same password
  flow. The password is remembered in your browser after the first time, so
  you won't be asked again on that device.
- Reading itself is always open to anyone with the link — only replacing
  the book needs the password.
- Click the left/right edges of the page (or use arrow keys) to turn pages.
- **☰ Contents** opens the table of contents.
- **Aa** opens font size and theme (light/sepia/dark) controls.
- **✕** closes the current reading view and reloads the saved book.

## Opening a file by link

Add `?url=` with a direct link to an `.epub` file and this reader fetches
and opens it directly, ignoring whatever's saved on this app's own server —
e.g. `https://your-reader.vercel.app/?url=https://example.com/book.epub`.

The linked file has to be fetchable cross-origin (a plain URL with
permissive CORS headers — Vercel Blob serves files this way). This is meant
for another app to host and manage the actual file and just link here to
read it, rather than duplicating the file into this reader's own storage.

## If saving fails

`api/book.js?diag=1` reports whether the Blob token and `BOOK_EDIT_KEY` are
configured (never the values themselves). A wrong password shows "Wrong
password — opened locally, but not saved" without losing your reading
session; try **Replace book** again with the right one.
