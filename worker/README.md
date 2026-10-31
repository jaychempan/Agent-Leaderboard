# GitHub login and favorites API

This small Cloudflare Worker serves `https://agentskills.media/api/*`; GitHub Pages
continues to serve the website. GitHub verifies identity, and D1 stores website
favorites. It does not change GitHub repository Stars or retain GitHub access
tokens. The architecture follows the public [CCFDDL Worker design](https://github.com/ccfddl/ccf-deadlines/tree/main/worker),
with only login and repository favorites implemented here.

## Configure and deploy

Use Node 22.13 or newer. From `worker/`:

```sh
npm install
npx wrangler login
npx wrangler d1 create agent-leaderboard
```

Put the returned database ID in `wrangler.jsonc`. Keep `PUBLIC_ORIGIN` set to the
website's exact origin, and apply `migrations/0001_initial.sql`:

```sh
npm run db:migrate:remote
```

Create a GitHub OAuth App with homepage `https://agentskills.media/` and callback
`https://agentskills.media/api/auth/github/callback`. It needs no repository,
Gist, or email scope for this feature. Configure its credentials and a random
session secret of at least 32 bytes with the interactive secret prompts:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npm run check
npm run deploy
```

The domain must be in the deploying Cloudflare account and proxied so its
`agentskills.media/api/*` route reaches this Worker. Keep unrelated site paths on
GitHub Pages. Do not enable a public cross-origin API or put secrets in browser
configuration. Configure a separate OAuth App and `PUBLIC_ORIGIN` for local
testing if required. Ignored `.dev.vars` may hold local values; it must never be
committed or uploaded with static assets.

Before enabling the website's login entry, check `/api/health` returns
`{"ok":true,"authConfigured":true}` and complete a real GitHub login, save, reload,
and restore in a second browser. The health check verifies the favorites table
is accessible when credentials are present; it cannot prove that OAuth is
configured correctly. See [the site setup guide](../docs/github-favorites-setup.md).

## API

| Request | Result |
| --- | --- |
| `GET /api/health` | `{ok, authConfigured}` |
| `GET /api/bootstrap?after=<repo_id>` | `{authConfigured, user, favorites, nextCursor}`; omit `after` for the first page |
| `GET /api/auth/github?return_to=/#mcp` | Starts GitHub authorization with browser-bound state and PKCE |
| `GET /api/auth/github/callback` | Finishes authorization and returns to a validated local path |
| `POST /api/auth/logout` | Revokes the current site session |
| `PUT /api/favorites/:repo_id` | Saves `{repository: <public display snapshot>}` |
| `DELETE /api/favorites/:repo_id` | Removes that user's favorite |
| `POST /api/favorites/import` | First-login merge: `{migration_id, batch_id, favorites:[{repo_id,repository}]}` |

`user` contains its string GitHub ID, login, and public avatar URL. Each favorite
has numeric `repo_id` and a sanitized `repository` snapshot; repositories that
leave the directory can still be displayed. Old local IDs without a snapshot
remain valid but have no invented repository link. The snapshot is not proof
that a repository exists.

Authenticated writes require the website's exact `Origin` and
`X-Favorites-User: <GitHub ID shown by the client>`. A mismatched user returns
`409 account_changed`, preventing a stale Alice tab from writing through a
newly signed-in Bob cookie. Missing or expired sessions return `401`.

Import batches contain at most 100 records and have a stable `migration_id`
(16–100 ASCII letters/digits/underscores/hyphens) and nonnegative integer
`batch_id`. Reuse both when retrying the same frozen batch. D1 transactions
record receipts with the insert, so a lost import response cannot make a retry
restore a favorite that was later removed. Existing cloud favorites are never
overwritten by import. This is one-time migration protection, not an offline
write queue. Without an explicit migration ID, the API uses a receipt derived
from that batch's repository IDs for compatibility.

Requests are limited to 32 KiB for individual favorites and 1 MiB for an import,
enforced while reading the body. Snapshots are whitelist-sanitized, link URLs
are derived from validated GitHub repository names, and unknown fields are not
stored. Bootstrap uses keyset pagination with up to 500 favorites per response.
Continue with `?after=<nextCursor>` until `nextCursor` is `null`; even collections
larger than the directory can be restored without a fixed favorite-count cap.
Each page includes the current user. Subsequent pages should send
`X-Favorites-User` from the first page: expired sessions or account switches then
return `409 account_changed`, instead of merging two accounts' pages. An invalid
cursor returns `400 invalid_cursor`. No user means `user: null`, an empty array,
and a null cursor.

## Sessions and error handling

OAuth states expire after ten minutes, have a signed nonce, and can only be
consumed once with their initiating browser's secret cookie. PKCE verifiers
stay in D1, not inside the visible `state` parameter. Site sessions use random
tokens with only hashes stored in D1, HttpOnly/Secure/SameSite=Lax `__Host-`
cookies, and a rolling 30-day expiry renewed at most daily during authenticated
bootstrap. Signing out immediately invalidates the current session. A login
retains at most twenty active sessions per user and removes expired sessions.

OAuth failures return a safe `auth_error` code in the local return URL. API
failures return stable generic error codes, not upstream error text, tokens,
cookies, or secrets. Responses disable caching and cross-origin access. Worker
observability is disabled by default to avoid request logs containing OAuth
callback query strings; configure any future diagnostics to redact credentials.

## Tests

```sh
npm test
npm run db:migrate:local
```

The Node tests run the real SQL migration against `node:sqlite` and adapt its
prepared statements to the D1 API shape. They verify OAuth browser binding,
PKCE, replay/expiry, return-path validation, user isolation, origin checks,
logout, imports, and input limits. They do not verify a deployed Cloudflare
account, real GitHub authorization, or production D1 resources. Apply the local
migration and use Wrangler's local runtime as an additional deployment check.
