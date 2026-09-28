# Current deployment — bilingual Crypto/FX and favorites

Operational checkpoint: 2026-09-28. Current verified implementation and evidence are in `STATUS.md` and `verification/market-expansion-release.json`.

## Preserve existing production

Keep APP_SECRET, account IDs, names, password hashes, wallet balances, positions, immutable trades, earned achievements and provider budgets. Keep existing environment variables and API keys unchanged. Do not put secrets in browser code, GitHub, issues or chat. Do not execute an older destructive migration draft; `db/migrate_crypto_fx_only.sql` is intentionally non-executable guidance.

For the existing bilingual/progression production database, the market expansion needs only the additive `db/market_expansion.sql`, applied after `db/progression.sql`. It replaces catalog/validation/cache/progression functions and expands constraints; it does not reset user or budget rows. This exact migration has already been applied to the Practice production project. Do not run test smoke SQL on production.

The isolated CI/new-database migration order is `bootstrap.sql` → `crypto_fx.sql` → `price_charts.sql` → `comments.sql` → `ranking_activity.sql` → `progression.sql` → `market_expansion.sql`. Older migrations contain earlier catalog functions: never reapply them alone over the expanded live schema. The latest expansion must remain authoritative.

## Release gate

1. Confirm the latest main and branch heads. Run all app, isolated database and bilingual browser tests. Database CI runs original regression before upgrade, applies the expansion twice, and runs original plus expanded smoke tests afterwards.
2. Apply the exact tested additive SQL before deploying the expanded server. Confirm catalog 17 / crypto 10 / FX 7, valid new chart keys, unsupported-symbol rejection and server-only/RLS privileges. Do not trade an existing user's wallet.
3. Merge the verified PR head into main; use the existing Vercel integration. No new cloud project or paid plan is needed by this implementation.
4. Verify main CI including `scripts/public-smoke.mjs`. It checks version 1.2.0, exact manifest/HTML/JS/CSS, 10/7 market counts, both five-period chart lists, reference-frequency fields, locale behavior and authenticated endpoint rejection.
5. Separate evidence types: anonymous production checks prove deployment, not live-provider availability or real-user order execution. Browser trade/star journeys use isolated HTTP fixtures; actual phone reports are recorded separately.

## Data and rollback boundaries

Crypto quotes still require the existing server-side CoinGecko key; no key means crypto disabled, not a fallback to another API. FX remains independent. Quotes remain batched/shared. All ten crypto charts share the existing 500-call/month budget guard. Browser favorites use no API calls, no account synchronization, and no price/history prefetch.

New generation keys `crypto-v2` / `fx-v2` avoid four-asset cache reuse. Legacy quote keys remain compatible during overlap, which can create an extra cold fetch while switching generations. Do not erase market caches by deleting user data.

After new instruments may have been bought, reverting to the old eight-symbol validator can make wallets unreadable. Preserve all expanded canonical symbols/steps and repair forward; never shrink constraints or remove holdings to make a rollback work. Old immutable deployment URLs are separate from current production and are not rewritten retroactively.
