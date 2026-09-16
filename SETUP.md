# Fourteen Nights in Peru — setup

A private shared trip planner. The plan lives on the server and is returned
only after Matteo's or Levin's personal access key has been validated.

Four files, all at the repo root:

```
index.html
plan.json        ← deliberately contains no itinerary data
package.json
api/plan.js      ← api is a FOLDER
```

## Deploying to Vercel

1. Put the four files in a GitHub repo.
2. vercel.com/new → import the repo. Framework **Other**, build command
   **empty**, output directory **empty**.
3. Project → **Storage** → **Create Database** → **Blob** → connect it to this
   project. That adds `BLOB_READ_WRITE_TOKEN` on its own; you never touch it.
4. Redeploy.

Viewing and saving are deliberately disabled until both access keys are configured.

### Check it worked

Open `https://your-site.vercel.app/api/plan?diag=1`. You should get JSON with
`"openMode": false`, `"usableEditors": 2`, and both names. If you get Vercel's own 404 page instead, `api/plan.js` is
in the wrong place or `package.json` is missing.

The page itself prints its build at the bottom — handy for confirming a deploy
actually landed.

## What is in a stop

Each stop is a panel, coloured down the left edge by elevation. Everything on
it can be changed in place — click a piece of text and type.

- **Subtitle** — an optional short line beside the stop name, e.g. *"Arrive,
  eat well, settle in."* Set it under **Edit stop**. Left blank, nothing shows.
- **Activities** — one row each, the name in bold. Straight from the row you can
  change the **day pill**, the **status pill**, and the **note** underneath, and
  **open ↗** follows the link.
  Press **Edit** on a row to rename it or set its link, then **Done**. The link
  box only shows while editing, so a finished row stays quiet. Type a link
  without `https://` and it is completed when you click away.

  Rows sort by day, with *Any day* last. A day beyond the stop's length is
  marked ⚠ rather than thrown away, so shortening a stay never loses anything.
- **Notes** — the box at the bottom for whatever does not belong to one
  activity.

Anything marked **To book** is collected in the Checks panel above the
itinerary, so the outstanding bookings are always in one place.

Activities can also be moved up or down, moved to another stop, or moved into
a stop in a different option tab. Open **Edit** on an activity to duplicate its
full contents. **Browse activities** and **Earlier saves**
are collapsed until needed so the main itinerary stays compact. The page
heading and subtitle can be changed with **Edit heading**.

**Edit stop** (name, kind, elevation, travel time, minimum nights) is for
correcting the stop itself, and for the ones you invent. The Checks panel reads
its warnings from the built-in catalogue, so a stop you created yourself is not
counted as an Amazon stop, a beach, or a travel day.

## Using it

| Button | What it does |
|---|---|
| **Save** | Writes your screen back for everyone. Greyed out when there is nothing to save. |
| **Share link** | Copies the clean address without a key. The recipient enters their own access key. |
| **Reload** | Throws away your unsaved edits and reloads the saved version. |
| **You** | Your name, so saves are labelled. Optional, remembered locally. |
| **More** | Save with a note, reset to the starting plan, download a copy, load a file. |

Once your access key is known, edits save themselves about 2.5 seconds after
you stop typing — the status line briefly says **Unsaved changes**, then
**Saved**. The Save button still works too, for a save right now or one with
a note. The page also re-checks the server every 6 seconds and whenever you
come back to the tab; if somebody else saved and you have nothing unsaved, it
just updates itself. See **Live updates** below to make that instant instead
of a few seconds.

### If two people save at once

Every save carries the version it started from. If somebody saved in between,
your save is **refused** rather than quietly overwriting theirs. You get the
choice: **Load theirs**, or **Save over it**.

### Earlier saves

The last ten versions are listed at the bottom of the page with who saved them
and when. **Restore** puts one back on your screen; it becomes the shared plan
only once you save it. Nothing is ever lost for good.

## Required access keys

The address is not treated as a secret. Add this environment variable under
Settings → Environment Variables, apply it to all environments, then redeploy:

| Name | Value |
|---|---|
| `PLAN_EDIT_KEYS` | `matteo:A_LONG_RANDOM_KEY,levin:ANOTHER_LONG_RANDOM_KEY` |

Both `matteo` and `levin` must be present, comma-separated, with at least four
characters per key. Use long random values in practice. The same personal key
unlocks viewing, identifies each person's decisions, and authorizes saving.

Then:

- The itinerary is hidden until a valid key is entered.
- You type your key once per browser unless you use **More → Forget access key**.
- **Share link** never places a key in the URL. Each person enters their own.
- Each save is labelled with the name belonging to the key that was used.
- Activity decisions are tied to those names: Matteo's key edits Matteo's field,
  and Levin's key edits Levin's field. An activity turns fully green or red only
  when both people make the same final decision.
- To revoke one person: remove their pair, redeploy. Everyone else is
  unaffected. They get *"That access key was not accepted"* and the page clears
  the stored key.
- **More → Forget access key** locks the page and wipes it from that browser.

The Vercel Blob token is infrastructure credentials. Never paste it into the
page, send it to another person, or put it in a URL.

## Live updates

The page re-checks the server every 6 seconds, so a save by one of you shows
up for the other within a few seconds without either of you doing anything.

An earlier version of this app pushed updates instantly via Pusher. That's
been removed (2026-09-10) — now that saving is a deliberate Save-button press
rather than something that happens automatically on every edit, saves are
infrequent enough that a plain 6-second poll is not worth trading for an
extra external service and its secrets. If `PUSHER_*` environment variables
are still set in Vercel from before, they're simply unused now — safe to
remove whenever you like, nothing reads them.

## Notes

- `PLAN_OPEN` and `PLAN_EDIT_KEY` are ignored. Only `PLAN_EDIT_KEYS` is accepted.
- Missing or invalid key configuration refuses all saves instead of allowing anonymous writes.
- The page no longer reveals a fallback itinerary when hosted without the API.
- `?diag=1` also requires a valid personal access key.


## Save errors

Access keys and storage credentials are separate. Even with access keys configured,
Vercel needs `BLOB_READ_WRITE_TOKEN` from a connected **public** Blob store to save.
Ensure environment variables apply to the deployed environment, then redeploy.
The new API reports storage configuration failures on screen rather than `http_500`.
If saving still fails, inspect `/api/plan?diag=1` and the Vercel function logs.
Before reloading after a failed save, use **More → Download a copy** to keep edits.


## Debounced autosaving

Content changes save automatically after 15 seconds without another change.
Further edits restart that countdown, so one editing session normally produces
one version instead of a version every minute. The Save button remains available
for an immediate save and cancels any pending automatic save. If another edit is
made while a save is running, that newer edit remains pending and saves after its
own quiet period. Live updates pause while local changes are unsaved. A real save
conflict still requires reconciliation and never silently overwrites a newer plan.

## Activity catalogue and guide

The catalogue is at the bottom of the planner. Filter 41 activities by category,
region, current scenario, or search. Explore an idea for details and add it to a
chosen stop — most now show a page reference (`p. N`) into your own copy of
the Lonely Planet Peru guide. These changes still require Save.

### Guide PDF viewer (2026-09-10)

**Open the guide** in that section opens an in-app viewer for your own guide
PDF — gated behind the same edit key as everything else. It stores the file
in the *same* Blob store the plan already uses (just as `guide.pdf` next to
`plan.json`), so **no extra setup is needed beyond what saving the plan
already requires** — if saving the plan works, this works too.

(An earlier version of this doc had you connect a second, dedicated Blob
store for the guide. That turned out not to generate its own read-write
token — only a `STORE_ID` and a webhook key — so rather than chase exactly
how Vercel's multi-store token model works, this reuses the existing store
instead. If you already connected that second store, it's unused now and
safe to disconnect or leave alone.)

The file is never linked anywhere public; the API only ever hands its URL to
a request that already proved it holds one of the two edit keys.

To use it: open the app → **Open the guide** → **Upload / replace PDF** →
pick your PDF. It uploads straight from your browser to Blob storage (not
through Vercel's function, so its ~4.5 MB request limit doesn't apply) — this
can take a little while on a big file. Re-uploading replaces the previous
one. After that, either of you can open it from any device by clicking
**Open the guide** and entering your edit key — no re-uploading needed.

If Blob storage isn't configured, **Open the guide** shows a message saying
so rather than failing silently — the same storage that already backs the
plan and the PDF; there's nothing separate to set up for this.

### Guide EPUB reader (2026-09-10)

**Read the guide (EPUB)** works differently from the PDF: a browser can't
display an EPUB natively the way it can a PDF, so instead of rendering it
inside this app, that button opens your EPUB in a **separate, dedicated
reader app** — a plain static page (`index.html` + `package.json` +
`vercel.json`) that reads the file entirely in the browser, no server, no
upload. This app just stores the file and points the reader at it.

Setup:

1. Deploy the reader app to its own Vercel project — put its three files in
   a repo (or a folder in this same repo, deployed as a separate Vercel
   project pointed at that folder), import it at vercel.com/new, framework
   **Other**, no build step, no environment variables. You'll get a URL like
   `https://your-reader.vercel.app`.
2. In **this** app's `index.html`, find `var READER_URL = "";` near the
   guide EPUB code and put that URL in the quotes (no trailing slash needed).
3. Redeploy this app (the planner). `GUIDE_BLOB_TOKEN` from an earlier
   version of this doc is not needed — the EPUB uses the same storage the
   PDF and the plan already use.
4. In the app: **Upload / replace EPUB** → pick your file. Like the PDF
   upload, this goes straight from your browser to Blob storage (multipart,
   since an EPUB can be much bigger than a PDF), so it can take a while.
5. **Read the guide (EPUB)** opens a new tab at your reader app with the
   file's link attached — the reader fetches it and opens straight to
   reading, no manual "Open EPUB" step needed there.

Leave `READER_URL` blank and the button just explains that it isn't set up
yet, instead of failing confusingly.

The reader app also still works completely on its own — open it directly,
drag and drop any EPUB onto it, and it works fully offline after the first
load. That's unrelated to this integration; the `?url=` handling was added
specifically so this app could hand it a file automatically.
