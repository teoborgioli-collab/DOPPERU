# Fourteen Nights in Peru — setup

A shared trip planner. The plan lives on the server, so everyone who opens the
link sees the same one and can change it.

Four files, all at the repo root:

```
index.html
plan.json        ← the starting plan, used until the first save
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

Saving is deliberately disabled until both edit keys are configured.

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
| **Share link** | Copies the address. Send it to anyone who should see or edit the plan. |
| **Reload** | Throws away your unsaved edits and reloads the saved version. |
| **You** | Your name, so saves are labelled. Optional, remembered locally. |
| **More** | Save with a note, reset to the starting plan, download a copy, load a file. |

Once your edit key is known, edits save themselves about 2.5 seconds after
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

## Required edit keys

The address is not really secret — Vercel domains show up in public
certificate-transparency logs. If that bothers you, add one environment
variable (Settings → Environment Variables, all environments, then redeploy):

| Name | Value |
|---|---|
| `PLAN_EDIT_KEYS` | `matteo:dopperu2026,levin:tambopata26` |

Both `matteo` and `levin` must be present, comma-separated, with **at least 4
characters per key**. Reading stays open to anyone with the link; saving never
works without one of these keys.

A short word like `doppi` is fine here — the address already has to be known,
and the last ten versions are always restorable. A long random key is stronger,
but for a trip plan that is a choice, not a rule.

Then:

- You type your key **once**. It is remembered in that browser.
- **Share link** now includes the key, so whoever opens it can save
  immediately without typing anything. That link can edit — send it the way you
  would send a password.
- Each save is labelled with the name belonging to the key that was used.
- Activity decisions are tied to those names: Matteo's key edits Matteo's field,
  and Levin's key edits Levin's field. An activity turns fully green or red only
  when both people make the same final decision.
- To revoke one person: remove their pair, redeploy. Everyone else is
  unaffected. They get *"That edit key was not accepted"* and the page clears
  the stored key.
- **More → Forget edit key** wipes it from a shared or borrowed machine.

## Live updates

By default the page re-checks the server every 6 seconds, so a save by one of
you shows up for the other within a few seconds without either of you doing
anything. If that's fast enough, skip this section entirely — nothing below
is required.

To make it instant instead (push rather than poll), connect a free
[Pusher](https://pusher.com) Channels app:

1. pusher.com → sign up → **Create app** → any name, any cluster close to you.
   Pick **Channels**.
2. On the app's **App Keys** tab you'll see four values: `app_id`, `key`,
   `secret`, `cluster`.
3. In Vercel → Settings → Environment Variables, add all four, exactly named:

   | Name | Value |
   |---|---|
   | `PUSHER_APP_ID` | from the App Keys tab |
   | `PUSHER_KEY` | from the App Keys tab |
   | `PUSHER_SECRET` | from the App Keys tab |
   | `PUSHER_CLUSTER` | from the App Keys tab, e.g. `eu`, `us2` |

4. In `index.html`, find `PUSHER_KEY` and `PUSHER_CLUSTER` near the top of the
   `<script>` block and paste in the same **key** and **cluster** values (not
   the app id or secret — those stay server-side only). These two are not
   secret; they only let a browser listen, not publish.
5. `npm install` (adds the `pusher` package) if you install dependencies
   locally, then commit and redeploy.

Leave `PUSHER_KEY` blank in `index.html` (or skip steps 1–4 altogether) and
everything keeps working exactly as before — the page just falls back to the
6-second poll, silently.

## Notes

- `PLAN_OPEN` and `PLAN_EDIT_KEY` are ignored. Only `PLAN_EDIT_KEYS` is accepted.
- Missing or invalid key configuration refuses all saves instead of allowing anonymous writes.
- Hosted somewhere without the API (GitHub Pages, Netlify Drop), the page reads
  `plan.json` read-only and hides the toolbar's save controls.
- `?diag=1` reports what the server sees — key names and lengths, never the
  keys themselves.


## Save errors

Edit keys and storage credentials are separate. Even with edit keys configured,
Vercel needs `BLOB_READ_WRITE_TOKEN` from a connected **public** Blob store to save.
Ensure environment variables apply to the deployed environment, then redeploy.
The new API reports storage configuration failures on screen rather than `http_500`.
If saving still fails, inspect `/api/plan?diag=1` and the Vercel function logs.
Before reloading after a failed save, use **More → Download a copy** to keep edits.


## Manual saving (2026-09-10)

Edits stay on your screen until you press Save. There are no automatic saves.
Live updates pause while you have unsaved changes or a focused input.
If you edit during a save, those newer edits remain unsaved until the next Save.
A real conflict detected by Save still requires reconciliation; it never silently
overwrites a newer shared plan. Refresh other open tabs after deploying this update
so they stop running the previous autosave code.

## Activity catalogue and guide

The catalogue is at the bottom of the planner. Filter 20 activities by category,
region, current scenario, or search. Explore an idea for details and add it to a
chosen stop. These changes still require Save.

The catalogue does not include a book reader or guide links.
