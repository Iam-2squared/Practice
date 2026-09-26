# Market data — 0.5

Japan-equity active data retrieval was removed. Saved legacy orders remain private account records.

## CoinGecko Demo

Official Demo /simple/price with `x-cg-demo-api-key`; JPY prices for bitcoin, ethereum, solana, ripple in one request and `include_last_updated_at=true`.
https://docs.coingecko.com/v3.0.1/reference/simple-price
Official `/coins/{id}/market_chart` for JPY history, one requested symbol and period per call.
https://docs.coingecko.com/reference/coins-id-market-chart
https://www.coingecko.com/en/api_terms
https://www.coingecko.com/en/api/pricing

A missing key disables crypto quotes rather than silently trying another API. 401/403/429 do not trigger identity or endpoint workarounds. Attribution and a clickable source link are shown. This implementation does not claim that the free Demo plan permits every commercial or redistribution use; assess the actual plan and use case before monetization or wider release.

As checked on 2026-09-26, Demo lists 10,000 call credits/month, 100 calls/minute, one year of daily/hourly history, and one day of 5-minute history. The UI therefore enables 24H / 7D / 30D / 90D / 1Y only. Automatic provider granularity is shown honestly: approximately 5-minute points for 24H, hourly for 7–90D and daily (00:00 UTC) for 1Y. These are point samples, not fabricated one-minute candles or OHLC.

Current prices use one shared four-symbol batch refresh at most every five minutes across Vercel instances. At that ceiling continuous 31-day use is 8,928 calls. Crypto chart misses are additionally hard-limited in the database to 500 provider calls per UTC calendar month; current-price calls are not charged to this chart allowance. Thus the application-controlled maximum is 9,428 calls/month before any other client using the same key. The remaining 572 calls are a buffer, not a guarantee against other clients or provider accounting changes.

Chart data is fetched only when a detail sheet opens or its period changes; no all-symbol/all-period prefetch and no chart polling. Shared cache TTLs are 1 hour for 24H, 6 hours for 7–90D and 24 hours for 1Y. 429/access/timeouts enter a bounded cooldown with no automatic retry loop. When the 500-call chart guard is exhausted, new Crypto chart fetches pause until the next UTC month while current prices and eligible orders remain independent.

Crypto requires the provider timestamp, no more than 15 minutes old, not future-dated by more than 30 seconds. The cache cannot make an old quote fresh.

## Frankfurter

https://frankfurter.dev/docs/v1/
https://frankfurter.dev/

Daily reference rates, not intraday/real-time. One EUR-base batch provides JPY, USD, GBP and AUD; cross rates are calculated in JPY per unit. The calendar date is preserved; no intraday timestamp is invented. Missing/invalid/future or >10-day-old dates block quotes. Cached four hours, keyed separately from crypto. Show the data source and actual rate date.

History uses the v1 time-series endpoint for 7D / 1M / 3M / 1Y / 5Y, consistent with the existing EUR-base cross-rate calculation. v1 is deprecated in favor of v2 but is documented to continue working. Returned working dates are sorted and validated; weekends/holidays remain absent and are never filled with invented rates. Shared chart cache TTL is 24 hours and no background polling occurs.

## Execution

Simulation, no broker/exchange transactions. Prices rounded to 0.01 JPY. Quantities use integer millionths; monetary products and basis use integer arithmetic. Purchases round up and sales/value round down to avoid creating profit by splitting rounded orders. Signed per-account quotes expire in 60 seconds and their original provider date is checked again at execution. Failed valuation is unknown, never zero or cost price.
