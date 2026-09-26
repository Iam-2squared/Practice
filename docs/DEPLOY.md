# 0.5 chart deployment

Existing production users must retain their APP_SECRET, account ID, username and password hash.

1. An existing 0.4 production database needs only the additive `db/price_charts.sql` migration. It creates a server-only chart cache and a 500-call/month CoinGecko chart budget guard with RLS. It does not update or delete accounts, credentials, wallets, positions or trades. A brand-new database uses `db/bootstrap.sql`, `db/crypto_fx.sql`, then `db/price_charts.sql`.
2. Keep `PRACTICE_STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_SECRET`, and `APP_ORIGIN` unchanged.
3. Set server-only `COINGECKO_DEMO_API_KEY` to the Demo key copied directly from CoinGecko. Do not put it in the repository, browser code, issue or chat. Missing key leaves crypto quotes disabled; FX remains available.
4. Deploy verified main through the existing Vercel integration. No paid plan or new cloud project is required by this change.
5. Check config version 0.5.0, provider multi, storage supabase, both five-period chart lists and the 5-tab UI. Config success alone is not a provider, chart or trade test.
6. Test a separate temporary account: Crypto/FX chart periods, pointer/touch inspection, FX reference date, crypto timestamp, buy/sell/relogin/deletion. Never use another user's password or trade an existing user's wallet.

`MARKET_PROVIDER` and `YAHOO_DATA_USE_APPROVED` are unused in 0.4. Old immutable deployments are not updated retroactively. Protect/remove obsolete deployment URLs separately when restricting access.

Do not execute an older destructive migration draft. `db/migrate_crypto_fx_only.sql` is intentionally non-executable guidance.
