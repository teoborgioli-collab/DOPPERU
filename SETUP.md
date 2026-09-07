# Setup — shared plan on Vercel Blob

Repo layout:

```
index.html
plan.json
package.json
api/plan.js
```

## 1. Connect Vercel Blob

In your Vercel project, create/connect a Blob store under **Storage**. The API in
`api/plan.js` reads and overwrites one shared `plan.json` object in Blob.

## 2. Add one edit key per person

Vercel → Project → **Settings → Environment Variables**:

| Name | Example value |
|---|---|
| `PLAN_EDIT_KEYS` | `matteo:LONG-RANDOM-1,friend:LONG-RANDOM-2` |

Generate long keys, for example:

```bash
openssl rand -base64 24
```

Apply the environment variable to the environments you use, then redeploy.

## 3. How saving now works

- Opening the site loads the newest shared plan from Vercel Blob.
- You can make several edits in the page.
- **Save changes for everyone** writes the whole current plan to Blob.
- The first save on a browser asks for that person's edit key; after a
  successful save the key is remembered in that browser.
- Another person sees the saved plan when they reopen the page or press
  **Load latest**.
- `localStorage` is only a draft/failure backup; it is not the shared source of
  truth.
- If somebody else saved a newer Blob version after you loaded the page, the
  API returns a conflict instead of knowingly overwriting it. Press **Load
  latest**, review the changes, then edit/save again.

This is shared saving, not realtime simultaneous editing.

## 4. Security note

An edit key is a shared secret, not a full user account. Give every editor a
different key so one person's access can be revoked without changing everyone
else's key. Do not put edit keys in GitHub or inside the HTML.
