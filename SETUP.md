# Setup — shared plan on Vercel

Repo layout (everything at the root):

```
index.html
plan.json        ← fallback, used until something is published
package.json
api/plan.js
```

## 1. Add a Blob store

Vercel dashboard → your project → **Storage** → **Create Database** → **Blob** →
connect it to this project. That adds `BLOB_READ_WRITE_TOKEN` automatically;
you never touch it yourself.

## 2. Add the edit keys

Project → **Settings** → **Environment Variables**:

| Name | Value |
|---|---|
| `PLAN_EDIT_KEYS` | `matteo:LONG-RANDOM-1,ana:LONG-RANDOM-2` |

One `name:key` pair per person, separated by commas. Minimum 8 characters per
key — use far more. Generate them, don't invent them:

```bash
openssl rand -base64 24
```

Apply to **Production, Preview and Development**.

Every publish records which name was used, and it shows up in the banner
everyone else sees. That gives you a trail and lets you revoke one person
without disturbing the others.

`PLAN_EDIT_KEY` (single, unnamed) still works for a one-person setup and
records the publisher as `editor`.

With no keys configured, publishing is refused — so an unconfigured deployment
can never be written to.

## 3. Redeploy

**Deployments** → newest → **⋯** → **Redeploy**. Environment variables only take
effect on a fresh deploy.

## 4. Use it

The plan lives on the server. Nothing about it is stored in anybody's browser,
so everyone who opens the page sees the same thing and several people can work
on it.

- Open the page → it loads the current plan from the server.
- Edit freely. The strip shows **Unsaved changes** — only on your screen.
- **Save for everyone** writes it back. **Save with a note…** adds one line
  describing the change, which everyone else sees.
- The page re-checks every 20 seconds and whenever you come back to the tab.
  If someone else saved and you have nothing unsaved, it just updates.

### If two people save at once

A save carries the revision it started from. If somebody saved in between, the
save is **refused**, not merged and not silently overwritten. You get a notice
naming who saved and the choice: **Load theirs** (drops your screen's version)
or **Save over it**.

### Earlier saves

The last ten versions are kept, listed at the bottom of the page with who saved
them and when. **Restore** loads one onto your screen; it only becomes the
shared plan once you save it.

Only the edit key is kept in your browser, as a convenience.
**Forget edit key** removes it — use that on a shared or borrowed machine.

## Handing a key to someone

Send it through a password manager's share function, or any one-time-secret
link. Not chat, not email, and **never** in the shared plan link — that link is
meant to be forwarded, and the key must not travel with it.

Give each person their own named key rather than sharing one.

## Rotating a key

1. **Settings → Environment Variables → `PLAN_EDIT_KEYS`** → change or remove
   that person's pair. Removing the pair revokes exactly that person.
2. **Redeploy.** The change is not live until you do.
3. Anyone still holding the old key gets *"Key rejected — it may have been
   rotated"* on their next publish, and the page clears the stored key so they
   can enter the new one cleanly.

Rotate when someone leaves the trip, when a key was sent somewhere careless, or
just periodically. Nothing published in the past is affected — only who may
publish next.

## Limits worth knowing

- A key is a shared secret, not a login. Whoever holds it can publish, and the
  recorded name is only as trustworthy as the key's handling.
- A wrong key costs the caller a deliberate delay, which slows guessing but is
  not a real rate limit.
- On a host without the API (GitHub Pages, Netlify Drop), the page reads
  `plan.json` read-only, hides the save row, and says so.
- **Copy link with this plan** still works, but it is now a snapshot of your
  screen for someone to look at — not a way to edit the shared plan.
