# Practice — current handoff

保存時刻: 2026-09-27 23:19 JST

## Active work / current production

**PR #21 / `feature/ja-en-localization`: Japanese and English localization. Not yet merged or deployed.**

Last confirmed production: 1.1.0, main `78d1f79bb732d60da33b27c7dbb9bd251162c659`; implementation PR #19 / `6913c7ae375a036320d48803ef1c1a6ce6408394`. The user confirmed on their phone that all 1.1 features worked on 2026-09-27 after the five-tab, mission, weekly ranking and achievement release. That feedback is user-reported evidence, separate from automated tests.

Production: https://practice-ashy-delta.vercel.app/

## Approved 1.2 scope

- Japan -> Japanese; elsewhere -> English on automatic entry. Manual preference stored in this browser and prioritized over country. Explicit language URLs remain explicit.
- Stable `/ja/` and `/en/` landing, game, terms, privacy and market-data pages.
- English app-owned UI, chart descriptions, API errors, missions, achievements, weekly/total rankings and result sharing.
- No automatic translation of usernames or comments.
- JPY remains the only game currency; initial virtual funds remain JPY100,000; weekly cutoff remains Monday 00:00 Asia/Tokyo.
- Same account, cookie, wallet, history, badges and uncertain-order IDs across language changes.
- No GPS permission, new external account/API key, paid service, advertisement, database migration or existing-user data reset.

## Implementation checkpoint

New language API wrapper, source-time copy catalogs, localized HTML/bundle compiler, persistent selector, English FX search aliases and responsive styles are in the branch. Language bootstrap, loader and client bundles use content hashes. Both local dev and the isolated UI test server serve the actual built bilingual pages.

Build completeness caught two missing profile labels; these were supplied rather than suppressing the guard. Original 122 tests passed on the earlier head, but that head's build failed, so it was NOT release-ready. New language tests and full English HTTP browser journeys have been added; latest complete CI results are still pending and must be reviewed before merge. Do not treat historical successful tests as proof of the latest head.

Detailed routing, precedence, unchanged monetary semantics, privacy and verification requirements: `docs/LOCALIZATION.md`.

## Existing product rules to preserve

Five tabs: 資産 / マーケット / チャレンジ / ランキング / アカウント. Eight Crypto/FX instruments, charts, comments, text result sharing, 15-character usernames and sell-only counts on rankings remain supported.

Five beginner missions and six achievements (+JPY1,000 / +JPY2,000 / 3 Crypto trades / 3 FX trades / -JPY1,000 experience / -JPY2,000 experience). Choose up to three earned titles in Profile. Weekly score is current total assets minus starting total assets this week, reconstructed from the existing ledger and reference prices; missing values stay unknown. Loss achievements record experience, not a goal to lose money.

Data contracts, shared quote/history cache, monthly chart budget, authorization, CSRF, signed execution quotes, integer arithmetic and trade idempotency must not change for localization. The v1.0.0 tag stays at `3ebee92e436a02e4d3d6d5cecb7507d2cb155dec`.

## Next steps

1. Finish complete build, Node, DB and Japanese/English browser regressions for final PR head.
2. Inspect actual loaded English 320/390px screenshots; fix any layout/copy defects.
3. Merge only after green final checks; verify Vercel and anonymous production bilingual smoke.
4. Save final commit IDs, test counts, deployment result, limitations and next steps here and in verification evidence.
5. User phone and actual country/network verification remain separate. No existing production user's account is used for test trades.

External listing/setup is on hold at the user's request. Current promotion is English-first under SOLUYRA and publicly concerns Practice only. Ads and paid services remain deferred. Future video generation must not consume paid credits without approval.

Earlier release evidence remains in `docs/verification/`, including `v1.1-release.json` and `status-before-1.1.md`. Save state and JST timestamps to GitHub after meaningful work so chat loss does not lose the recovery point.
