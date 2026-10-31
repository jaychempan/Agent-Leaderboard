# GitHub login and favorites API

GitHub Pages continues to serve `https://agentskills.media`. This Cloudflare
Worker serves a separate `https://agent-leaderboard-api.jaychempan.workers.dev`
API, so the domain can keep Tencent Cloud / DNSPod nameservers. GitHub verifies
the visitor's identity; D1 stores this website's favorites. The application does
not change GitHub Stars, request repository/Gist/email scopes, or retain GitHub
access tokens.

## Configuration and deployment

Use Node 22.13 or newer. From `worker/`:

```sh
npm install
npx wrangler login
npx wrangler d1 create agent-leaderboard
```

Put the returned database ID in `wrangler.jsonc`. Set `PUBLIC_ORIGIN` to the
website's exact origin, and `API_ORIGIN` to the Worker's exact HTTPS origin;
neither value may include a path, query, credentials, or fragment. Enable the
Worker's `workers.dev` endpoint. This setup requires no Cloudflare DNS zone,
custom-domain route, or Tencent DNS changes. Apply **both** migrations:

```sh
npm run db:migrate:remote
```

`0001_initial.sql` is immutable once applied. `0002_cross_origin_login.sql` adds
the frontend login proof and the one-time login handoff table without changing
existing users, favorites, sessions, or import receipts. Previously pending
OAuth attempts lack the new proof and must be restarted.

Create a GitHub OAuth App with homepage `https://agentskills.media/` and callback
`https://agent-leaderboard-api.jaychempan.workers.dev/api/auth/github/callback`
(using the actual `API_ORIGIN`). It needs no extra scope. Set the credentials
and a random server secret of at least 32 bytes using interactive prompts:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npm run check
npm run deploy
```

Configure the same public API origin in the website's client configuration.
Client ID/secret, SESSION_SECRET, and GitHub access tokens must never be placed
in static assets. Ignored `.dev.vars` can hold local test values. For local
HTTP development only, origin validation also accepts localhost, 127.0.0.1,
and [::1]; use a separate OAuth App and matching origin configuration. When both
origins equal the same local HTTP origin, a browser bootstrap GET may omit
Origin if `Sec-Fetch-Site: same-origin` or its Referer proves that exact origin.
This exception does not apply to production or cross-origin calls.

Before enabling login, check `/api/health` returns
`{"ok":true,"authConfigured":true}`, then perform a real GitHub login, save,
reload, and sign in in a second browser to restore the same favorites. Health
checks that credentials exist and all required database tables are accessible;
it does not prove the OAuth App credentials or callback are correct. See
[the site setup guide](../docs/github-favorites-setup.md).

## API contract

| Request | Result |
| --- | --- |
| `GET /api/health` | `{ok, authConfigured}` |
| `GET /api/bootstrap?after=<repo_id>` | `{authConfigured, user, favorites, nextCursor}`; omit `after` for the first page |
| `GET /api/auth/github?client_challenge=<S256>&client_state=<random>&return_to=/#mcp` | Starts browser-bound GitHub authorization |
| `GET /api/auth/github/callback` | Identifies the user, redirects to the primary website with `login_code` and `login_state` |
| `POST /api/auth/exchange` | `{code, verifier, state}` → `{token, expiresAt, user}` |
| `POST /api/auth/logout` | Revokes the current site bearer session |
| `PUT /api/favorites/:repo_id` | Saves `{repository: <public display snapshot>}` |
| `DELETE /api/favorites/:repo_id` | Removes that user's favorite |
| `POST /api/favorites/import` | First-login merge: `{migration_id, batch_id, favorites:[{repo_id,repository}]}` |

`user` contains its string GitHub ID, login, and public avatar URL. `expiresAt`
is an ISO 8601 timestamp. Each favorite has numeric `repo_id` and a sanitized
`repository` snapshot; repositories that leave the directory remain displayable.
Old local IDs without a snapshot remain valid but have no invented repository
link. A snapshot is not proof that a repository exists.

Browser API calls use `credentials: 'omit'`, an exact `Origin: PUBLIC_ORIGIN`,
and `Authorization: Bearer <site token>` when authenticated. Bootstrap requires
the website Origin even when anonymous. Authenticated writes additionally
require `X-Favorites-User: <GitHub ID shown by the client>`. An account mismatch
returns `409 account_changed`; a missing expected user returns `400`, and a
missing or expired session returns `401` on writes. A first-page bootstrap with
no valid session returns `user: null`, empty favorites, and a null cursor.
Session cookies are not accepted as API credentials.

CORS allows only `PUBLIC_ORIGIN`, never `*` or credentialed cookies. Preflight
checks the route's method and allows only `Authorization`, `Content-Type`, and
`X-Favorites-User`; other headers and origins are rejected. The API also rejects
requests addressed to any origin other than `API_ORIGIN`. A plain health check
and top-level OAuth navigations may omit Origin. All responses disable caching.

## Login handoff and sessions

1. The primary website tab creates a random 43-character base64url verifier and
   an independent state, retaining them in its own sessionStorage. It navigates
   to the API with the verifier's SHA-256 challenge and state, never the verifier.
2. The Worker stores that challenge/state and starts GitHub OAuth with a separate
   backend PKCE verifier, an HMAC-signed nonce, and a ten-minute OAuth attempt.
   A Secure/HttpOnly/SameSite=Lax `__Host-agent_oauth` cookie on the API origin
   binds the attempt to the initiating browser. This cookie is used only during
   top-level redirects; ordinary API requests do not require third-party cookies.
3. The callback consumes the browser-bound attempt once, exchanges GitHub's code,
   verifies the public GitHub identity, and discards the GitHub token. It redirects
   to a validated relative path on `PUBLIC_ORIGIN`, preserving path/query/hash,
   with a random opaque `login_code` and the tab's `login_state`. Return paths
   cannot target another origin or API endpoint. No site session exists yet.
4. The primary tab removes callback parameters from its URL, verifies the state,
   and posts the code, state, and retained verifier to `/api/auth/exchange`.
   A matching SHA-256 challenge, state, unexpired code, and exact website Origin
   are required. D1 atomically consumes the code once. Codes expire in 90 seconds
   and only their hashes are stored. A stolen URL alone cannot redeem a code.
5. Only the exchange JSON contains the random site session token. Keep it in
   sessionStorage, never URLs or persistent localStorage. D1 stores only its
   hash. Sessions expire after a fixed eight hours with no rolling renewal.
   Logout revokes the current token immediately; other sessions and favorites
   remain. A login retains at most twenty active sessions per account.

OAuth failures return a safe `auth_error` code on the primary website. API errors
contain generic codes, never upstream error text or secrets. Observability is
disabled by default to avoid logging OAuth callback query strings; any future
logging must redact credentials, authorization headers, and login codes.

## Favorites, migration, and pagination

Import batches contain at most 100 records and use a stable `migration_id`
(16–100 ASCII letters/digits/underscores/hyphens) and nonnegative integer
`batch_id`. Retry the same frozen batch with the same identifiers. A transaction
records the receipt with the inserts, so a lost response cannot make a retry
restore a subsequently removed favorite. Import never overwrites existing cloud
favorites. Without a migration ID, a compatibility receipt is derived from the
batch's repository IDs. This is one-time migration protection, not an offline
write queue.

Bodies are limited while streaming to 32 KiB per favorite and 1 MiB per import.
Snapshots are whitelist-sanitized and links are derived from validated public
GitHub repository names. Bootstrap uses keyset pagination with at most 500
favorites per response and no collection-size cap. Continue with
`?after=<nextCursor>` until the cursor is null. Subsequent pages must include
`X-Favorites-User` from the first page; an expired token or changed account then
returns `409 account_changed` instead of merging accounts. Invalid cursors
return `400 invalid_cursor`.

## Tests

```sh
npm test
npm run db:migrate:local
```

Node tests execute both real SQL migrations against `node:sqlite` adapted to the
D1 API. Coverage includes the two independent PKCE proofs, browser binding,
state/code theft, replay, expiry, URL secrecy, exact CORS/preflight, bearer
isolation/logout, import receipts, input limits, and over 5,000 favorites across
multiple pages. They do not verify a deployed Cloudflare account, real GitHub
authorization, or production D1. Use Wrangler's local runtime as an additional
check, then complete the real production OAuth and cross-browser flow.
