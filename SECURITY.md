# Security / v0.2

## Authentication model

This application deliberately implements a password-only **bearer-secret account**. There is no email, username, identity verification, or password recovery. Anyone who knows the password can access that practice account. Existing accounts cannot be claimed by registering a duplicate password. New users should use the cryptographically generated 256-bit secret instead of a memorable or reused password.

Passwords are normalized with NFKC, constrained to 20–128 characters with at least 10 distinct characters, located with a server-secret HMAC, and verified with salted scrypt (`N=32768,r=8,p=3`). The lookup index is not a replacement for scrypt. Losing/changing `APP_SECRET` makes existing password lookups unavailable; preserve it securely. A password+username design would avoid the global-secret namespace but is intentionally outside the requested v1 UX.

Random session tokens are stored only as SHA-256 hashes. Production cookies use `__Host-`, `Secure`, `HttpOnly`, `SameSite=Strict`, and a 30-day expiry. Logout revokes the server-side session. Account deletion requires password reauthentication and an explicit confirmation, then cascades atomically to the ledger and all sessions. Hosting backups/log retention are managed separately by the provider; deleting an application account is not a claim that provider backups disappear immediately. No password is stored in browser storage. A pending order payload can be kept in sessionStorage for exact-id retry; it cannot authorize access without the account's session.

## Authority

The client never supplies the execution price. A server HMAC binds the displayed quote to the account and a 60-second expiry. The server validates cash, shares, source, symbol, currency, 100-share lot quantities, and idempotency. A PostgreSQL account row lock + version check commits state and ledger together. SQL independently recomputes cash, holdings, proportional cost basis, and realized profit and rejects any disagreement with the proposed state. Table constraints also reject missing state fields and odd-lot holdings/trades. The memory adapter supplies equivalent serialized behavior for tests only.

Every mutation requires the exact configured Origin, JSON, and a custom request header. The API does not enable CORS. The server requires authentication before querying market data. Persistent rate buckets cover login/registration and per-account requests. Vercel Firewall abuse limits and capacity review remain necessary before a broad public launch; rate limits are not a complete DDoS defense.

## Database

Use a NEW dedicated Practice project. All four tables enable RLS and revoke anon/authenticated access. RPC functions are SECURITY INVOKER, have an empty search_path, and revoke public execution. Only the server's secret/service-role key can access them. The app, not Supabase Auth, validates the user's session and ownership before privileged requests. This is why a server secret MUST NOT reach a browser, repository, screenshot, or chat.

`sb_secret_` is sent only as `apikey`. Legacy service-role JWTs additionally use Authorization. These forms are different; never substitute an anon/publishable key for the server secret.

## Operational boundaries

- Local `.local/` persistence is single-process development only and refuses production/Vercel.
- Database misconfiguration fails closed; production never silently uses an ephemeral memory account.
- HTTP auth/session/trade responses are no-store. Scripts/styles are same-origin and no inline script is shipped.
- Demo prices are explicitly synthetic. Yahoo has no assumed redistribution permission and is off by default.
- Corporate actions, delistings, production backup retention, and secret rotation UX need a separate release decision.
- No analytics, advertising tags, or brokerage connections are included. App logs do not include request bodies, passwords, cookies, or upstream raw errors. Hosting providers may maintain their own access logs.

Do not put secrets in issues. Report a suspected vulnerability with a minimal redacted reproduction. This is a practice app, not a hardened financial-account system.

## Provisioned database audit

Dedicated project: `mitowlxrsrhbtmehiyvh` (Practice, Tokyo). Migration `practice_v02_cash_lots` was applied and service-role SQL smoke tests passed, with all fixtures rolled back. Advisor results: no ERROR/WARN; four INFO `rls_enabled_no_policy` findings are intentional: direct browser table access is denied, while only the server role can execute the API contracts. Do not add broad public policies merely to silence this informational finding.

[Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
