# 0.4 deployment

Existing production users must retain their APP_SECRET, account ID, username and password hash.

1. Run the additive `db/crypto_fx.sql` migration on the existing Practice project. It creates separate wallets, a new ledger and shared quote cache, all server-only with RLS. No old trades, balances or positions are removed.
2. Keep `PRACTICE_STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_SECRET`, and `APP_ORIGIN` unchanged.
3. Set server-only `COINGECKO_DEMO_API_KEY` to the Demo key copied directly from CoinGecko. Do not put it in the repository, browser code, issue or chat. Missing key leaves crypto quotes disabled; FX remains available.
4. Deploy verified main through the existing Vercel integration. No paid plan or new cloud project is required by this change.
5. Check config version 0.4.0, provider multi, storage supabase, 5-tab UI. Config success alone is not a trade test.
6. Test a separate temporary account, FX reference date and crypto timestamp, buy/sell/relogin/deletion; never use another user's password.

`MARKET_PROVIDER` and `YAHOO_DATA_USE_APPROVED` are unused in 0.4. Old immutable deployments are not updated retroactively. Protect/remove obsolete deployment URLs separately when restricting access.

Do not execute an older destructive migration draft. `db/migrate_crypto_fx_only.sql` is intentionally non-executable guidance.
