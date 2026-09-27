# Practice — current handoff

保存時刻: 2026-09-27 19:39 JST

## Active work
PR #19 / `feature/challenges-weekly-achievements`: beginner missions, weekly ranking and profile achievements. Integration commit `a4804c2bef6cf7912569c68e40504c38b71664ee`; regression validation in progress. This update is not yet deployed. Last confirmed production base: `d88a0619b560ec51e1d5b07faf015dd455341d7a` (sharing feature already deployed; user confirmed native sharing works).

## Product rules
- Five tabs: 資産 / マーケット（仮想通貨・FX切替） / チャレンジ / ランキング / アカウント.
- Ranking screen switches 週間ランキング / 総資産ランキング; general comments remain there.
- Weekly result = current virtual total equity minus week-start equity, in JPY, NOT percentage or realized-only P/L. Week starts Monday 00:00 Asia/Tokyo.
- Existing trade ledger reconstructs cash and quantity at the cutoff. Week prices use the last genuine history point before cutoff, then are frozen per symbol/week. No first-login baseline, no invented historical rate. Crypto hourly reference, FX prior business-day reference. Users joining midweek compare against initial virtual JPY100,000. Unknown baseline/current price remains unranked, not zero.
- Six achievements: +JPY1,000 / +JPY2,000 total-equity change from initial cash; 3 Crypto executions / 3 FX executions; -JPY1,000 / -JPY2,000 experience. Buy and sell each count as one execution for the 3-trade achievements. Existing sell-only count stays on rankings.
- Earned achievements are persistent. Up to 3 distinct earned titles may be selected in Profile and shown alongside ranking names. Locked titles cannot be selected via UI or API.
- Five beginner missions: account / chart / first buy / first sell / portfolio review. No virtual cash reward or ads.

## Safety / deployment
Only additive `db/progression.sql` is planned; no existing balances, credentials, transactions or comments are changed. New tables and RPCs are server-only with RLS and explicit revoked browser privileges. Account deletion cascades progress.
Existing budgeted history API is reused for weekly reference prices; no new provider/key or paid service. Missing data never silently becomes cost basis/current price for the past.
Temporary source-integration workflow was development-only and has been removed. Final changes are normal tracked JS/HTML and tests.
Tests: added unit, API, DB rollback and HTTP browser coverage; final results pending CI. Do not claim completion before migration, final CI, merge and public deployment verification.

## Continuing rules
Save state, JST timestamp, checked commit/CI/deployment, limitations and next steps here after every meaningful milestone. Preserve user data and v1.0.0 tag. Ads remain deferred until meaningful daily usage, to be handled step by step with explicit user confirmation. External directory/account setup is on hold; prioritize self-contained improvements.

Earlier handoff and historical release evidence: `docs/verification/status-before-1.1.md`.
