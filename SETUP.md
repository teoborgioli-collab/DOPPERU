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

That's it. **No password to set up.** Anyone with the address can save.

### Check it worked

Open `https://your-site.vercel.app/api/plan?diag=1`. You should get JSON with
`"openMode": true`. If you get Vercel's own 404 page instead, `api/plan.js` is
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

Edits stay on your screen until you press Save — the status line on the right
says **Unsaved changes** until then. The page re-checks every 20 seconds and
whenever you come back to the tab; if somebody else saved and you have nothing
unsaved, it just updates itself.

### If two people save at once

Every save carries the version it started from. If somebody saved in between,
your save is **refused** rather than quietly overwriting theirs. You get the
choice: **Load theirs**, or **Save over it**.

### Earlier saves

The last ten versions are listed at the bottom of the page with who saved them
and when. **Restore** puts one back on your screen; it becomes the shared plan
only once you save it. Nothing is ever lost for good.

## Optional: lock it with a key

The address is not really secret — Vercel domains show up in public
certificate-transparency logs. If that bothers you, add one environment
variable (Settings → Environment Variables, all environments, then redeploy):

| Name | Value |
|---|---|
| `PLAN_EDIT_KEYS` | `matteo:dopperu2026,gast:tambopata26` |

One `name:key` pair per person, comma-separated, **at least 4 characters per
key**, no spaces around the commas and colons. Reading stays open to anyone
with the link; only saving needs a key.

A short word like `doppi` is fine here — the address already has to be known,
and the last ten versions are always restorable. A long random key is stronger,
but for a trip plan that is a choice, not a rule.

Then:

- You type your key **once**. It is remembered in that browser.
- **Share link** now includes the key, so whoever opens it can save
  immediately without typing anything. That link can edit — send it the way you
  would send a password.
- Each save is labelled with the name belonging to the key that was used.
- To revoke one person: remove their pair, redeploy. Everyone else is
  unaffected. They get *"That edit key was not accepted"* and the page clears
  the stored key.
- **More → Forget edit key** wipes it from a shared or borrowed machine.

**To switch the password off again:** delete `PLAN_EDIT_KEYS` (or add
`PLAN_OPEN` = `true`) and redeploy. As long as `PLAN_EDIT_KEYS` exists, the key
is required — that is the usual reason a page still asks for one.

## Notes

- `PLAN_OPEN=true` forces open mode even when keys are configured.
- Hosted somewhere without the API (GitHub Pages, Netlify Drop), the page reads
  `plan.json` read-only and hides the toolbar's save controls.
- `?diag=1` reports what the server sees — key names and lengths, never the
  keys themselves.
