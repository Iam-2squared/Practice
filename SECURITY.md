# Security

Paper trading only. No deposits, payments, exchange credentials or real orders.
Server-only Supabase key and separate derived quote-signing key; keys never shipped to the browser.
The existing APP_SECRET is also the password lookup key; changing it without a credential migration locks out existing accounts. Keep it stable.

Passwords are salted scrypt hashes. The requested six-character minimum is a convenience setting, not a recommendation for public security; use long random passwords. Password-only login means anyone who knows the password can access that account. No recovery by email is implemented.
Sessions are random server-stored digests with HttpOnly/Secure/SameSite cookies. API writes require canonical origin and an application header. Rate limits are enforced in the database.

Wallets, ledgers, cache, accounts and sessions are server-only with RLS and revoked browser-role privileges. Trade RPC recomputes transitions under a row lock, verifies instrument/source, quantity, funds, quote date, idempotency and expected version.

History is preserved on migration, erased only on user-confirmed account deletion (including all sessions). Leaderboard exposes username/total/rank/self only, never credentials or another user's positions.

No source-code visibility setting makes a deployed URL private. Vercel access protection is separate. Do not share old passwords/keys in screenshots or commit logs. Report issues privately to the repository owner.
