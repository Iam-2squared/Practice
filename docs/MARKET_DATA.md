# Market data — 0.4

Japan-equity active data retrieval was removed. Saved legacy orders remain private account records.

## CoinGecko Demo

Official Demo /simple/price with `x-cg-demo-api-key`; JPY prices for bitcoin, ethereum, solana, ripple in one request and `include_last_updated_at=true`.
https://docs.coingecko.com/v3.0.1/reference/simple-price
https://www.coingecko.com/en/api_terms
https://www.coingecko.com/en/api/pricing

A missing key disables crypto quotes rather than silently trying another API. 401/403/429 do not trigger identity or endpoint workarounds. Attribution and a clickable source link are shown. This implementation does not claim that the free Demo plan permits every commercial or redistribution use; assess the actual plan and use case before monetization or wider release.

One shared batch refresh at most every five minutes, across Vercel instances. At that ceiling continuous 31-day use is 8,928 calls, excluding any other clients sharing the same key. No background polling. Confirm the current plan allowance; this is a traffic estimate, not a free-service guarantee.

Crypto requires the provider timestamp, no more than 15 minutes old, not future-dated by more than 30 seconds. The cache cannot make an old quote fresh.

## Frankfurter

https://frankfurter.dev/docs/v1/
https://frankfurter.dev/

Daily reference rates, not intraday/real-time. One EUR-base batch provides JPY, USD, GBP and AUD; cross rates are calculated in JPY per unit. The calendar date is preserved; no intraday timestamp is invented. Missing/invalid/future or >10-day-old dates block quotes. Cached four hours, keyed separately from crypto. Show the data source and actual rate date.

## Execution

Simulation, no broker/exchange transactions. Prices rounded to 0.01 JPY. Quantities use integer millionths; monetary products and basis use integer arithmetic. Purchases round up and sales/value round down to avoid creating profit by splitting rounded orders. Signed per-account quotes expire in 60 seconds and their original provider date is checked again at execution. Failed valuation is unknown, never zero or cost price.
