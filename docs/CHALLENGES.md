# Challenges, weekly ranking and profile titles — 1.1

## Navigation

Five primary tabs: Assets / Market / Challenges / Rankings / Account. Market switches Crypto/FX internally. Rankings switches weekly/total internally and retains the general-comments entry. Account retains history, name/login settings and adds Profile. Native result sharing remains on Assets.

## Weekly accounting

The boundary is Monday 00:00 Asia/Tokyo (Sunday 15:00 UTC). The current weekly score is **JPY total equity now minus JPY total equity at that boundary**. Unrealized and realized changes both contribute. No weekly balance reset occurs. Total-asset ranking continues to use current equity; ties in either mode receive the same rank.

The database snapshot reads wallet state and ledger aggregates in one statement snapshot. For an account existing before the boundary:

```
weekStartCash = currentCash + thisWeekBuyTotals - thisWeekSellTotals
weekStartQuantity[symbol] = currentQuantity - thisWeekBuysQuantity + thisWeekSellsQuantity
weekStartEquity = weekStartCash + sum(floor(referencePrice * weekStartQuantity / quantityScale))
weeklyChange = currentEquity - weekStartEquity
```

A position fully sold during the week must still be valued in week-start inventory. A position first bought during the week must not be added to the baseline. Buy/sell cash rounding remains the existing 0.01 JPY integer rule. The source ledger is `practice_asset_trades`; legacy Japan-equity records are not included.

New Crypto/FX wallets created during the week use the original virtual JPY100,000 as their participation baseline. Creating or visiting an account does not pick a favorable live market baseline. Weeks are not anchored to the first login or first ranking request.

Reference prices are the last real provider history point at or before the boundary, saved once in `practice_week_prices` for each `(week_start, symbol)`. Conflicting inserts retain the first saved reference and reread it, so all users share the same baseline prices. Crypto uses budgeted 30D hourly history (at most two hours before cutoff); FX uses 1M business-daily history (at most ten days old). This is an approximate reference-data valuation, not an exchange midnight tick or executable price.

Missing history, the provider budget limit, invalid inventory reconstruction or missing current quotes produce an unknown score/rank (`—`). The app never substitutes today's price, cost basis, invented zero or a first-visit price for historical data. The other ranking mode and existing order quote path remain independent.

No cron job, paid scheduler, new API key or new external provider is added. Weekly references reuse the existing `market.history` cache and the CoinGecko **500 history calls per UTC month** guard; they consume part of that allowance rather than creating a second allowance. References are requested only for week-start holdings and retained across visits. No all-market/all-period prefetch is added.

## Beginner missions

1. Create a virtual account.
2. Retrieve a chart successfully and inspect its data date.
3. Complete a first virtual purchase.
4. Complete a first virtual sale.
5. Successfully view valued assets and profit/loss.

Progress uses authenticated server-side operations. Purchase/sale milestones derive from the full recorded ledger, not only the last 50 history rows. Profile/challenge screens cannot submit an arbitrary completion list. Mission navigation directs users to the relevant existing screens. Missions do not issue virtual money, prizes or advertising rewards.

## Six persistent achievements

| ID | Display | Condition |
|---|---|---|
| profit1000 | ＋1,000円突破 | Evaluated total equity minus initial JPY100,000 is at least JPY1,000 |
| profit2000 | ＋2,000円突破 | Same measure is at least JPY2,000 |
| crypto3 | 仮想通貨3売買 | At least three completed Crypto orders, buy or sell |
| fx3 | FX3売買 | At least three completed FX orders, buy or sell |
| loss1000 | −1,000円を経験 | Evaluated total equity minus initial JPY100,000 is at most −JPY1,000 |
| loss2000 | −2,000円を経験 | Same measure is at most −JPY2,000 |

One completed buy is one execution; one completed sell is one execution. Retries, failed orders, rejected orders and changed duplicate requests do not add executions. The existing ranking `売却 N回` is intentionally sell-only and is not the achievement counter.

Conditions are checked on successful server observations/profile reads/ranking valuations. Earned timestamps persist even when the market reverses. Historical recorded trade counts carry forward. Unobserved pre-feature peaks/troughs of total equity are not invented or retroactively asserted. If a wallet version changes while its value is fetched, that stale valuation cannot unlock a money-threshold achievement. Missing current prices are unknown, not a loss or gain.

Loss achievements are a record of experience, not encouragement to seek larger losses. The UI states this explicitly. All money remains virtual.

## Profile and privacy

Users may select zero to three distinct earned IDs, in order. Locked, unknown, duplicate or fourth selections are rejected server-side as well as constrained in the UI. Empty selection hides all public titles. Ranking names show only selected earned titles, not the entire profile, ledger, credentials or holdings. Narrow layouts may wrap badges beneath the name.

`practice_progress` and `practice_week_prices` use RLS with no anon/authenticated table access. RPCs use security invoker, an empty search path and explicit service-role-only EXECUTE. Only the application server derives current user identity, totals and event types. Account deletion cascades progress. Weekly symbol reference prices contain no user IDs and remain independent shared data.

The Privacy Policy discloses saved progress/achievements, selected titles, weekly scores and public sell counts. No custom Vercel Analytics events or third-party tracking SDK is added.

## Verification boundaries

Node tests cover boundary/year transitions, ledger reversal, fully sold positions, new entrants, negative/tied/unknown scores, frozen references, six thresholds, persistent unlocks, selection validation, authentication and existing trading regressions.

SQL smoke runs isolated fixtures inside a rollback transaction and checks RLS/RPC restrictions, thresholds, monotonic awards, three-title selection, stale version rejection and deletion cascade.

HTTP Playwright tests cover combined market switching, all five completed missions, two genuinely earned/selected titles surviving reload, weekly/total switching, 320–1280px layouts, and screenshot readiness restricted to visible main content. A separately marked mocked profile tests the three-checkbox UI limit without sending forged awards to the server.

Production CI checks anonymous configuration, delivered assets and authentication boundaries without touching existing accounts or placing orders. These checks are not a claim that all existing users or actual future weekly rollovers were exercised in production.

Primary technical references checked during this change:
- https://www.postgresql.org/docs/current/functions-datetime.html
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://docs.coingecko.com/reference/coins-id-market-chart
