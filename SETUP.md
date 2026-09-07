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
connect it to this project.

That automatically adds the `BLOB_READ_WRITE_TOKEN` environment variable. You
never touch it yourself.

## 2. Add the edit key

Project → **Settings** → **Environment Variables** → Add:

| Name | Value |
|---|---|
| `PLAN_EDIT_KEY` | any password you invent, e.g. `chuncho2026` |

Apply it to **Production, Preview and Development**.

Without this variable set, publishing is refused — that is deliberate, so an
unconfigured deployment can never be overwritten by a stranger.

## 3. Redeploy

Vercel → **Deployments** → the newest one → **⋯** → **Redeploy**.
Environment variables only take effect on a fresh deploy.

## 4. Use it

Open the site. A **Publish for everyone** row appears once the API answers.

- Change the plan however you like — it stays in your browser.
- Press **Publish this plan…**, write one line about what changed, enter the
  edit key, press **Publish**.
- Everyone else sees a banner next time they open the page. Their own version
  is not touched; they choose whether to take yours.

The key is remembered in your browser after the first successful publish.

## Notes

- `plan.json` in the repo stays as the fallback for the very first visit,
  before anything has been published.
- Anyone with the edit key can publish. Do not put it in the shared link.
- **Check for updates** re-reads the API; it also re-checks automatically
  whenever you switch back to the tab.
- On a host without the API (GitHub Pages, Netlify Drop), the page silently
  falls back to reading `plan.json` and the publish row stays hidden.
