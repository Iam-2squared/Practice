# Market data: verified status and publication boundary

Checked: 2026-09-26 JST. This is a technical integration note, not a legal opinion.

## Current production

Production uses `demo`, a synthetic fixed-price provider. Do not describe this as live data. Read-only DB verification found one demo account, two trades, zero positions and JPY 100,000 cash. This change performs no production SQL writes or migrations.

## Yahoo public distribution is not approved

Yahoo's official help explicitly says not to redistribute information displayed on or provided by Yahoo Finance:
https://uk.help.yahoo.com/kb/SLN2352.html

Yahoo Japan's separate notice prohibits repurposing/selling stock information:
https://finance.yahoo.co.jp/feature/promotion/caution

Using a chart endpoint, caching, adding attribution, calling the app educational, or accepting delayed quotes does not itself establish distribution permission. `YAHOO_DATA_USE_APPROVED=true` is an operator assertion, **not a license**. Do not change it to true simply to get past an error. No permission has been obtained for this public app. No paid subscription has been purchased.

Official alternative to evaluate: JPX 15-minute-delayed stock API explicitly covers acquisition/external distribution subject to its agreement and applicable fees. Do not assume a free API key or blanket free distribution:
https://www.jpx.co.jp/markets/paid-info-equities/realtime/06.html

Twelve Data also distinguishes personal/internal plans from external display/redistribution and requires additional approval for non-US price data:
https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage

A paid personal subscription is not automatically a public-app redistribution license. Obtain a quote/approval for the actual audience, instruments, display and simulated execution use before activating a provider. No substitute provider is silently enabled.

## Implemented adapter behavior (fixture-tested, NOT a live-access claim)

- Japanese `.T` equities and JPY only; reject unknown currency/type, zero/invalid price, and invalid/future timestamp.
- Freshness: up to 30 minutes when in-session or session metadata is unknown; a known outside-session reference may be at most 5 days old. Quote time is kept separately from HTTP fetch time.
- Outside-session prices are explicitly labelled reference prices. Simulator may execute against those references; it does not reproduce exchange hours, liquidity, board prices, taxes, dividends or splits.
- Prefer `previousClose` over the chart-window starting close. Request one-day chart metadata.
- Per-instance 15-second quote cache plus concurrent request coalescing; freshness is revalidated on cache use. This is NOT distributed caching across all Vercel instances.
- HTTP 401/403 stop retrieval; HTTP 429 honors Retry-After. No proxy/identity/cookie workarounds. Max 512 KiB response and 8-second request timeout.
- Failed live prices never silently fall back to synthetic prices. A local-name catalog fallback is not a price fallback.

## Switching without deleting existing practice data

An account's `market` value remains immutable. After changing the site's default provider to Yahoo, existing demo accounts continue to use the demo provider and retain all history and balances. A new approved live-price account requires a different password. Do not relabel or reset the old account.

If live data is later disabled, a live account retains login, deletion, history and cash balances. Valuations requiring missing prices are unknown, not zero or purchase price; new live trades are blocked. Replaying an already committed order remains idempotent.

## Activation gate

1. Obtain permission covering actual access and redistribution; store the agreement privately, not in this public repository.
2. Verify the provider from the intended hosting runtime and inspect quote timestamps, market/currency validation and limits. This has NOT yet passed for live Yahoo.
3. Confirm publication limits/costs with the user. Do not purchase a plan on assumption.
4. Only then change production `MARKET_PROVIDER` and the relevant approval flag and deploy.
5. Verify a separate live-price account, delayed/reference labels, persistence and failure handling. Do not use the user's demo password or delete their history.
