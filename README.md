# fpspatch-api — Phase 1 + Turnstile + Password Change + Premium Access Control

Cloudflare Worker backing the TikTok Encoder Studio's real (server-verified)
login system. Implements Phase 1 of `AUTH_SYSTEM.md` (login, logout,
session validation, First Device Lock), Cloudflare Turnstile as a
hardening layer in front of login, the authenticated Password Change
feature (§22), and Premium Access Control (§23 — server-side method
authorization + one-time trial credits). Nothing else — Admin Panel and
Secure FFmpeg Profile Delivery are later phases and are not present in
this codebase yet.

## Endpoints

| Method | Path | Namespaces touched |
|---|---|---|
| `POST` | `/auth/login` | Turnstile Siteverify (external) → `fpspatch-users` → `fpspatch-devices` → `fpspatch-sessions` |
| `POST` | `/auth/logout` | `fpspatch-sessions` |
| `GET`  | `/auth/session` | `fpspatch-sessions` → `fpspatch-users` |
| `GET`  | `/auth/password/status` | `fpspatch-sessions` → `fpspatch-users` |
| `POST` | `/auth/password/change` | Turnstile Siteverify (external) → `fpspatch-sessions` → `fpspatch-devices` (read-only) → `fpspatch-users` → `fpspatch-sessions` |
| `POST` | `/auth/method/authorize` | (`fpspatch-sessions` → `fpspatch-users`, only if a Bearer token is presented) → `fpspatch-devices` |
| `POST` | `/auth/method/complete` | same as `/auth/method/authorize` |
| `POST` | `/auth/tid/verify` | `fpspatch-devices` |
| `GET`  | `/auth/trial/status` | `fpspatch-devices` |
| `GET`  | `/health` | *(none)* |

See `AUTH_SYSTEM.md` (in the main `fpspatch` project) for the full design
rationale — this Worker is a direct implementation of §4–§9, §12–§13,
§22 (Password Change), and §23 (Premium Access Control). Turnstile,
Password Change, and Premium Access Control are all layers added on top
of the original design, not architecture changes: every KV namespace,
endpoint, and session/device-lock behavior is exactly as `AUTH_SYSTEM.md`
describes it.

- A failed Turnstile check short-circuits `/auth/login` and
  `/auth/password/change` before any other logic runs.
- Password Change never writes to `fpspatch-devices` under any
  circumstance — see §22.
- Premium Access Control's `/auth/method/authorize` and
  `/auth/method/complete` are the only endpoints in this Worker that
  work **without** a Bearer token at all — free/anonymous users (the
  existing ad-gate path) are identified by `X-Device-Id` alone, since
  they have no `username`. See §23 for why trial credits are keyed by
  device, not account.

## One-time setup

1. **Bind the KV namespaces.** Get each namespace's id:
   ```
   wrangler kv namespace list
   ```
   Paste the ids for `fpspatch-users`, `fpspatch-sessions`, and
   `fpspatch-devices` into the matching `id = "..."` lines in
   `wrangler.toml`. (`fpspatch-profiles` is deliberately not bound —
   nothing here uses it until Phase 6.)

2. **Set your site's origin** in `wrangler.toml`'s `ALLOWED_ORIGIN` var —
   comma-separated if you need more than one (e.g. localhost during dev
   plus your real domain once you have one). It ships with a placeholder
   pointing at `https://your-domain.com` — replace that with your real
   frontend domain (no trailing slash):
   ```
   ALLOWED_ORIGIN = "http://localhost:8000,https://yourdomain.com"
   ```
   Optionally, attach a custom domain to this Worker itself (e.g.
   `api.yourdomain.com`) instead of using the default
   `*.workers.dev` URL — see the commented `[[routes]]` block at the top
   of `wrangler.toml` for the exact steps. Cloudflare provisions the SSL
   certificate automatically; no separate DNS record is needed beyond
   what "Add Custom Domain" creates for you in the dashboard.

3. **Install dependencies:**
   ```
   npm install
   ```

4. **Seed at least one account** — there's no signup endpoint or Admin
   Panel yet, so accounts are created offline:
   ```
   npm run create-user -- <username> <password> premium user
   ```
   This prints a `wrangler kv key put ...` command — run the printed
   command yourself to actually write the account into `fpspatch-users`.

5. **Local dev:**
   ```
   npm run dev
   ```
   Then point the frontend's `AUTH_API_BASE` (in `js/premium.js` of the
   main `fpspatch` project) at whatever local URL `wrangler dev` prints
   (typically `http://localhost:8787`).

6. **Deploy:**
   ```
   npm run deploy
   ```
   Update `PROD_AUTH_API_BASE` in `js/premium.js` (main `fpspatch` project)
   to the deployed `https://fpspatch-api.<your-subdomain>.workers.dev` URL
   (or your custom domain, if you attached one in step 2). This is a
   one-time edit — `AUTH_API_BASE` itself auto-detects localhost vs.
   production at runtime, so no further toggling is needed between dev
   and prod after this.

## Cloudflare Turnstile setup

The login form **and** the Change Password dialog now use the real
production site key (`0x4AAAAAAD3QxkjYlZ3LFkva`) — the same site key
value is used by both (Change Password renders its widget explicitly via
the Turnstile JS API, reading the site key from the login widget's
`data-sitekey` attribute at runtime, so there's only one place it's
defined). Steps below are for reference / rotating the key later:

1. **Create a Turnstile widget** in the Cloudflare dashboard → Turnstile →
   Add Site.
   - **Widget Mode: Managed.** Not Invisible, not Non-Interactive — the
     widget must stay visible to the user (this is chosen when you create
     the site in the dashboard; nothing in this codebase can override it).
   - Add your site's real domain(s) as allowed hostnames. `localhost` is
     allowed automatically by Cloudflare's test keys, but a real site key
     needs your real domain(s) added explicitly.

2. **Set the secret key as a Worker secret** — never in `wrangler.toml`,
   never committed to source control:
   ```
   wrangler secret put TURNSTILE_SECRET_KEY
   ```
   Paste the Secret Key Cloudflare gave you when prompted.

   For local `wrangler dev` testing, create a `.dev.vars` file in this
   directory (already gitignored) instead:
   ```
   TURNSTILE_SECRET_KEY=your-real-or-test-secret-key
   ```

3. **Set the site key** — this one is public by design. Update
   `TURNSTILE_SITE_KEY` in `wrangler.toml`'s `[vars]` to your real site
   key (purely a documentation/reference value — the Worker's code never
   reads it), **and** paste the same value into the `data-sitekey`
   attribute on the `#loginTurnstile` div in the main `fpspatch` project's
   `index.html` (a static site has no env var mechanism of its own, so
   this one has to be set in two places by hand).

4. **Cloudflare's official test keys** (useful for verifying the
   integration itself works, independent of your real widget):

   | Key | Value | Behavior |
   |---|---|---|
   | Site key | `1x00000000000000000000AA` | Widget always passes |
   | Site key | `2x00000000000000000000AB` | Widget always blocks |
   | Secret key | `1x0000000000000000000000000000000AA` | Siteverify always returns success |
   | Secret key | `2x0000000000000000000000000000000AA` | Siteverify always returns failure |
   | Secret key | `3x0000000000000000000000000000000AA` | Siteverify always returns "token already spent" |

## What's intentionally not here

- No `/admin/*` routes (Phase 4 — Admin Panel). `role: "admin"` exists on
  the user record and is returned by `/auth/login` and `/auth/session`,
  but nothing checks it yet. Both Password Change's KV schema
  (`pwmeta:{username}`, `pwlog:{username}:*`) and Premium Access
  Control's (`trial:{deviceId}`) were deliberately built so a future
  Admin Panel can reset counters, disable/re-enable changes, grant
  credits manually, and read history without any changes to this
  codebase — see `AUTH_SYSTEM.md` §22 and §23's "Future Administrator
  Support" sections — but no such endpoints exist yet.
- No `/profiles/*` routes and no `fpspatch-profiles` binding (Phase 6 —
  Secure FFmpeg Profile Delivery).
- No real Telegram Bot API integration. `POST /auth/tid/verify` format-
  checks the submitted ID only — see `src/verification.js` and
  `AUTH_SYSTEM.md` §23's "TID verification as a replaceable provider"
  for how a real integration would slot in later without touching the
  trial-credit or premium-access logic.
- No rate limiting in code. `AUTH_SYSTEM.md` §16 recommended a Cloudflare
  edge rate-limiting rule *or* Turnstile on `/auth/login` as the primary
  defense against brute-forcing — Turnstile is now implemented on both
  `/auth/login` and `/auth/password/change`, which covers this; an edge
  rate-limiting rule is still a reasonable extra layer to configure in
  the Cloudflare dashboard, but is no longer the only mitigation in
  place.
- No "forgot password" flow (email/OTP-based recovery for a user who
  doesn't know their current password) — Password Change (§22) is a
  different, authenticated-only feature by design. Forgot-password
  remains a Future Expansion item in `AUTH_SYSTEM.md` §20.

## Production deployment checklist

Everything below is a one-time manual step tied to your real Cloudflare
account/domain — none of it can be filled in automatically, since it
requires credentials or DNS ownership only you have.

- [ ] Create the 3 KV namespaces (`fpspatch-users`, `fpspatch-sessions`,
      `fpspatch-devices`) if not already created, and paste their real
      ids into `wrangler.toml`'s `[[kv_namespaces]]` blocks (replacing
      the `REPLACE_WITH_...` placeholders).
- [ ] Set `ALLOWED_ORIGIN` in `wrangler.toml` to your real frontend
      domain (replace the `https://your-domain.com` placeholder).
- [x] Real Turnstile widget (Managed mode) created; `TURNSTILE_SITE_KEY`
      in `wrangler.toml` and the `data-sitekey` attribute on
      `#loginTurnstile` in `index.html` both set to `0x4AAAAAAD3QxkjYlZ3LFkva`.
- [ ] Set the real Turnstile secret: `wrangler secret put TURNSTILE_SECRET_KEY`
      (not done by this checklist item — verify it's set for the site key above).
- [ ] Seed at least one real account with `npm run create-user`.
- [ ] `npm run deploy`.
- [ ] Update `PROD_AUTH_API_BASE` in the main project's `js/premium.js`
      to the deployed Worker URL (or custom domain).
- [ ] Optional: attach a custom domain to this Worker (see step 2 above)
      instead of using the default `*.workers.dev` URL.
- [ ] Confirm the deployed frontend's actual origin exactly matches what
      you put in `ALLOWED_ORIGIN` (scheme + host, no trailing slash) —
      a mismatch here is the most common cause of "login silently fails"
      after a fresh deploy, since the browser's CORS check happens before
      any Worker error handling can explain why.
