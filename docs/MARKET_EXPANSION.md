# Market expansion and browser-local favorites

Checkpoint: 2026-09-28 JST. Release verification is recorded in STATUS.md.

## Scope

Crypto expands from 4 to 10: BTC, ETH, SOL, XRP, BNB, ADA, DOGE, AVAX, LINK, LTC.
FX expands from 4 to 7: USDJPY, EURJPY, GBPJPY, AUDJPY, CADJPY, CHFJPY, NZDJPY.
Existing providers, JPY accounting, quantity scale, execution rounding, quote signing, CSRF, idempotency and delayed/reference-price disclosure remain unchanged. No stocks, leverage, short sales, paid API plans or new providers are introduced.

Stars are sibling buttons, not nested inside instrument buttons. They use aria-pressed, translated labels, a minimum 44px target, keyboard controls and retained focus after sorting. Favorites are placed at the top within the current market and current search results; both partitions preserve catalog order. Removing a star restores its normal position. Stars issue no API requests and do not open order dialogs.

Storage key: `practice.market-favorites.v1`, versioned JSON. Saved in this browser/origin, not the account: reload and JA/EN changes preserve it; signing out does not clear it; other devices do not sync. Same-origin tabs synchronize with storage events. Invalid JSON is ignored; refused/quota-limited storage falls back to memory with an explicit temporary-storage message. No balance or credential data is written to localStorage.

## Server and database

The catalog builds one CoinGecko batch of ten IDs and one Frankfurter EUR-base batch for seven JPY cross rates. Shared quote TTLs remain 300 seconds and 14,400 seconds respectively; FX still represents business-day reference data, not intraday prices. New quote keys `crypto-v2` and `fx-v2` prevent mixing with old four-instrument payloads. Old keys are preserved for overlap during rollout; there may be one additional cold fetch per provider while changing generations.

All ten crypto symbols share the existing 500/month chart-call guard, not a separate allowance per symbol. Historical charts are loaded on demand, never prefetched by favoriting. Increasing the catalog does not increase the chart budget. Invalid, missing or stale provider data continues to fail closed; there is no fake-price fallback.

`db/market_expansion.sql` is additive and repeatable, applied after `db/progression.sql`. It expands canonical SQL assets, maximum distinct holdings, quote-cache generations, chart keys and budget enforcement, comment rooms, weekly baseline constraints, and achievement counting. Existing identifiers/names/steps remain unchanged. No account, credential, balance, holding, history, earned-badge or budget data is reset. RLS and server-only privileges remain enforced. `practice_commit_asset_trade` is unchanged.

Deploy order: verified CI -> apply the exact migration -> read-only schema/integrity checks -> merge/deploy application -> anonymous exact-built-assets production smoke. A rollback to the original eight-symbol application is NOT safe after users hold new assets. Preserve the expanded catalog/validators and use a forward fix; do not shrink database constraints or remove stored positions.

## Tests

Original app and database regression remains enabled. Added coverage includes exact SQL/JS catalog parity, 17-instrument wallet/API round trips, shared API batching, generation isolation, new charts, global chart-budget exhaustion/concurrency, aliases, comments, malformed fields, and preference storage/sorting.

Database integration runs against isolated Postgres, checks the original schema before upgrade, applies the migration twice, then reruns old and new smoke tests. Every SQL trade fixture rolls back. Browser journeys cover Japanese/English, 320/390/768/1280px, star clicks without network calls or trades, keyboard/focus, stable sorting, search, reload, language switching, cross-tab sync, corrupt/blocked storage and newly added instrument round trips.

Production smoke is anonymous/read-only: exact built HTML/JS/CSS, manifest, 10/7 config, disclosure frequency and authentication rejection. It is not evidence of live user trading or every provider chart period.
