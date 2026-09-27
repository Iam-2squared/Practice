# Practice — current handoff

保存時刻: 2026-09-27 20:26 JST

## Current checkpoint

PR #19 / `feature/challenges-weekly-achievements`: implementation complete, final documentation/CI gate before merge. Last confirmed production base is `d88a0619b560ec51e1d5b07faf015dd455341d7a`. Do not report v1.1 as deployed until the main CI and public deployment checks succeed.

Runtime implementation was reviewed at `4ae6e7350a5081d76030140d5b962fb88c40b66b`. Browser verification was strengthened at `391a1d43126a4f6978702de5fb57e9aec579bae4`; later changes update documentation/privacy only. PR head changes after this checkpoint must have their own successful CI before merge.

## Implemented product rules

- Five tabs: 資産 / マーケット（仮想通貨・FX切替） / チャレンジ / ランキング / アカウント.
- Ranking screen switches 週間ランキング / 総資産ランキング; general comments and sell-only counts remain.
- Weekly score is current virtual total equity minus week-start equity, in JPY, not percentage or realized-only profit. The week starts Monday 00:00 Asia/Tokyo.
- The full immutable trade ledger reconstructs week-start cash and quantities. A genuine history point at/before the cutoff values that inventory; the reference is frozen per symbol/week. Crypto uses hourly reference points and FX the prior business-day rate. This is not an exact exchange midnight tick.
- Participants joining during the week use initial virtual JPY100,000. Missing baseline/current prices remain unknown and unranked. No invented historical price, current-price substitution or first-login baseline.
- Six permanent achievements: +JPY1,000 / +JPY2,000 total-equity changes from initial cash; 3 Crypto executions / 3 FX executions; -JPY1,000 / -JPY2,000 experiences.
- Buy and sell each count as one completed execution for the three-trade achievements. Ranking `売却 N回` remains sell-only. Failed/duplicate requests do not create extra trades.
- Five beginner missions: virtual account / chart / first buy / first sell / portfolio review. No virtual-cash rewards or ads.
- Profile allows up to three distinct earned titles, in selection order; ranking shows only selected titles next to the name, wrapping on narrow screens. Locked/duplicate/fourth titles are rejected server-side.
- Existing recorded trade counts carry forward. Unobserved pre-feature profit/loss extremes are not fabricated. Money achievements are awarded on valid server observations and persist after reversal.
- Privacy Policy and README describe the new data/visibility and current five-tab navigation. Detailed specification: `docs/CHALLENGES.md`.

## Verification completed

- PR CI Run `36314989922`, head `391a1d43126a4f6978702de5fb57e9aec579bae4`: app / database / mobile-ui all SUCCESS; public-deployment skipped as expected for a PR.
- Node: 122/122 tests PASS, zero skipped. Syntax check: 25 JS files PASS. Build PASS.
- HTTP Playwright: original trading regression plus progression flow PASS. All five missions completed, Crypto/FX achievements earned, two earned titles saved and preserved after reload, weekly/total switching and sell-count display checked.
- Browser evidence issue corrected: assertions now target visible `#main` content and await loaded content rather than matching tiles retained inside a closed dialog. Screenshots now show actual challenge/ranking contents, not loading placeholders.
- Verified 320 / 390 / 768 / 1280px layouts. Actual 390px challenge and 320px weekly screenshots inspected. No uncaught browser errors.
- Three-selection UI limit additionally tested using an explicitly mocked earned-profile response; no forged awards were submitted. Server/API/SQL tests separately reject locked, duplicate and fourth selections.
- Artifact `10929983502` (Run `36314989922`), SHA256 `f9a131923fc03ca7c46ba17b0d4ce9d858ff10e26891bcfd415ab07b7480763d`.
- Supabase migration `20260927104402 practice_progression_weekly_v110` was already applied before resumption; confirmed, not re-applied.
- Supabase rollback smoke PASS on 2026-09-27 20:17 JST: only random isolated fixtures, all changes rolled back. Verified thresholds, monotonic unlocks, three-title restriction, stale-wallet rejection, snapshots and deletion cascade.
- New RPCs are security invoker with empty search_path; anon/authenticated EXECUTE denied, service_role EXECUTE allowed. Security Advisor at 20:21 JST shows only intentional RLS-enabled/no-browser-policy INFO entries.
- At resumption audit: 22 accounts, 22 wallets, 87 Crypto/FX trades, 11 comments. No existing credentials, balances, trades or comments were changed by this work.

## Safety / operational constraints

Only the additive `db/progression.sql` schema is needed for this release. Never replay old wallet-initialization migrations on production. No new paid plan, external account, API key, cron service, ads or secret change.
Weekly references reuse the existing shared history cache and the same CoinGecko 500 history-calls-per-UTC-month guard, not an additional allowance. Missing data does not disable the independent current-quote/order path.
Vercel management connector remains team-scope 403. Use existing GitHub deployment integration and public runtime checks; do not alter credentials or billing to bypass it. Temporary source-integration workflow is removed.

## Next actions

1. Confirm final PR head CI and diff, mark PR #19 ready, then merge with exact expected head SHA.
2. Verify main app/database/mobile-ui/public-deployment checks and Vercel deployment for that merge.
3. Save the exact merge and production evidence in this handoff and PR notes. Anonymous config/static checks are not authenticated production trading E2E.
4. User can then refresh the app and check Challenges, ranking mode switch and Account → Profile. Actual future Monday rollover and existing-user phone verification remain separate from fixture tests.

## Continuing policy

Save JST time, checked commit, CI/deployment, limitations and next steps here after every meaningful milestone. Preserve existing user data and the original v1.0.0 tag. Ads remain deferred and require separate step-by-step user confirmation. External directory/account setup is on hold; prioritize self-contained changes. Do not silently introduce new growth features beyond approved scope.

Previous release/history: `docs/verification/status-before-1.1.md`.
