# Market data — current implementation

Implementation checkpoint: 2026-09-28. Japan/foreign-equity active data retrieval is not enabled. Saved legacy orders remain account records. See `MARKET_EXPANSION.md` for the expanded catalog and rollout.

## CoinGecko Demo

The existing official Demo `/simple/price` endpoint with the server-only `x-cg-demo-api-key` returns JPY prices for bitcoin, ethereum, solana, ripple, binancecoin, cardano, dogecoin, avalanche-2, chainlink and litecoin in one request with `include_last_updated_at=true`. The list is derived from the fixed server catalog; users cannot submit arbitrary provider IDs.

Reference documentation:
https://docs.coingecko.com/demo/reference/simple-price
https://docs.coingecko.com/reference/coins-id-market-chart
https://www.coingecko.com/en/api_terms
https://www.coingecko.com/en/api/pricing

A missing key disables crypto quotes rather than silently trying another API. 401/403/429 do not trigger identity or endpoint workarounds. Attribution and a clickable source link are shown. This implementation does not claim that the free Demo plan permits every commercial or redistribution use; the actual plan/use case still needs an appropriate license assessment before changing monetization or scope. Expanding the catalog does not itself establish additional rights.

Current prices use one shared ten-symbol batch, at most once every five minutes per active cache generation across Vercel instances. The steady-state arithmetic remains 8,928 scheduled opportunities over 31 days, regardless of whether there are four or ten IDs in that batch. The application additionally guards crypto history misses at 500 calls per UTC month across all ten coins. These are application controls, not a promise about provider quota terms, other clients using the same key, or overlapping deployment generations. The current rollout uses `crypto-v2`; old `crypto` cache rows are retained and an additional cold request during overlap is possible.

Historical charts use official `/coins/{id}/market_chart` for one requested symbol and period per call. The existing UI periods remain 24H / 7D / 30D / 90D / 1Y with approximate 5-minute / hourly / daily point-sample descriptions. No fabricated one-minute candles or OHLC are introduced. Existing plan assumptions were recorded on 2026-09-26; provider documentation/terms can change independently of the application.

Chart data is fetched on demand when a detail sheet opens or its period changes, and by the existing weekly-baseline resolver when required. There is no all-symbol/all-period prefetch, favorites-triggered fetching or chart polling. Shared cache TTLs are 1 hour for 24H, 6 hours for 7–90D and 24 hours for 1Y. 429/access/timeouts enter a bounded cooldown with no automatic retry loop. When the shared 500-call history guard is exhausted, new Crypto chart fetches pause until the next UTC month while current prices and eligible orders remain separate. No paid quota increase is configured.

Crypto quotes require the provider timestamp, no more than 15 minutes old and not future-dated by more than 30 seconds. The cache cannot make an old quote fresh. Missing or invalid new-asset provider fields fail closed rather than creating invented prices.

## Frankfurter / ECB

https://frankfurter.dev/docs/v1/
https://frankfurter.dev/

Daily reference rates, not intraday/real-time. One EUR-base batch requests JPY, USD, GBP, AUD, CAD, CHF and NZD, providing USDJPY, EURJPY, GBPJPY, AUDJPY, CADJPY, CHFJPY and NZDJPY. Cross rates are calculated in JPY per unit; the actual reference date is preserved and no intraday timestamp is invented. Missing/invalid/future or more-than-10-day-old dates block quotes. Current-price cache TTL remains four hours, under `fx-v2`, independently from crypto. This cache interval is not the upstream publication frequency.

History continues to use the existing v1 time-series route for 7D / 1M / 3M / 1Y / 5Y and the same EUR-base cross calculation. Returned working dates are sorted and validated; weekends/holidays stay absent and are never filled with invented rates. Shared FX chart cache TTL remains 24 hours; there is no background polling or favorites-triggered fetch.

## Execution and evidence

Simulation only, no broker/exchange transactions. Prices are rounded to 0.01 JPY. Quantities use integer millionths; monetary products and basis use integer arithmetic. Purchases round up and sales/values round down to avoid creating profit by splitting rounded orders. Signed per-account quotes expire after 60 seconds and their original provider date is checked again at execution. Failed valuation remains unknown, never replaced by zero or cost price.

The 17-instrument quote, chart and trading tests use isolated provider fixtures. Production release smoke verifies exact deployed files, configuration and authentication boundaries without creating accounts, placing orders or exhaustively querying live quotes/history. Config `enabled` describes setup, not proof that every provider request succeeds.
