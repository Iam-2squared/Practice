# Practice v1 — PUBLIC RELEASE FREEZE

保存時刻: 2026-09-27 01:18 JST

Freeze candidate base: `aa8dfe8872647df833d6303cedcda742d8c824b7`

Production: https://practice-ashy-delta.vercel.app/

## v1 scope

Practice is a free paper-trading game using virtual JPY only. It performs no real orders, deposits, withdrawals, transfers, leverage or short selling.

Public entry:
- Landing page: `/`
- Trading app: `/app.html`
- Explicit “本物のお金は使いません / すべて仮想資金での練習です” onboarding.
- User-facing account wording is “仮想口座”.
- Terms, Privacy Policy, market-data explanation and provider attribution are public.

Markets:
- Crypto: BTC / ETH / SOL / XRP via CoinGecko Demo.
- FX: USD/JPY / EUR/JPY / GBP/JPY / AUD/JPY via Frankfurter / ECB reference data.
- Crypto charts: 24H / 7D / 30D / 90D / 1Y.
- FX charts: 7D / 1M / 3M / 1Y / 5Y.
- Chart history is reference-only and never becomes the signed execution quote.

Game:
- Initial virtual cash: JPY 100,000.
- Cash, valuation, unrealized/realized P/L, per-position percentage return.
- Buy/sell history, username, login/logout, leaderboard and virtual-account deletion.
- Password minimum remains six characters by product choice; reuse of important passwords is discouraged and there is no email recovery.

## Data and free-tier controls

- CoinGecko current quotes: shared four-symbol cache, maximum modelled 8,928 provider calls in a 31-day month.
- Crypto chart provider misses: DB hard limit 500 per UTC month.
- Modelled application maximum: 9,428 CoinGecko calls/month, leaving 572 calls of the 10,000 Demo allowance as buffer.
- Chart cache: Crypto 24H 1h; 7D–90D 6h; 1Y 24h. FX history 24h.
- No all-period prefetch, chart polling or infinite retry.
- FX history keeps actual business dates and does not invent weekend/holiday values.
- Provider attribution is shown publicly: Powered by CoinGecko API; Frankfurter / ECB reference rates.

## Release evidence

Chart release:
- PR #5 merged: `dfba3386ba839a61e91fa8712ae3527a22256ffa`.
- FX holiday-boundary fix PR #6 merged: `76f90cd50330e75c7061c069f7b64622814342be`.
- Production real-data verification succeeded for all eight instruments: Crypto 24H returned 288–289 approximately five-minute points; each FX 7D query returned five business-day points.
- No production trades were made for chart verification; the isolated temporary verification account was deleted.

Public-readiness:
- PR #7 legal/privacy/attribution: `752cfb5eecbdfa8edc0fa2b46dbb160ff7d84e97`.
- PR #8 public landing: `825daa3d4806f2ede969ff8981c8ee4042cae047`.
- PR #9 no-real-money emphasis: `769ffb970caf75344643a80acce86185037ea57b`.
- PR #10 virtual-account wording: `e59397a319cd8023e26da0d0c0207e17fa06b8a0`.
- PR #11 Vercel Web Analytics: `aa8dfe8872647df833d6303cedcda742d8c824b7`.
- Main CI Run `36254501377`: app / database / mobile-ui / public-deployment all SUCCESS.
- Vercel production status for the same commit: SUCCESS.
- Vercel Web Analytics Hobby is enabled; user-visible dashboard confirmed collection (4 visitors / 9 page views at the first check). No paid Analytics plan or custom events were enabled.

## Security / data gate

Final Supabase audit on 2026-09-27 JST:
- Nine `practice_*` tables have RLS enabled.
- `anon` and `authenticated` have no SELECT privilege on all nine.
- Security advisor reports INFO only for “RLS enabled, no policy”; this is intentional for server-only service-role tables.
- Existing user data was not reset or deleted by release preparation.
- At final audit the database contained 3 accounts, 3 wallets and 18 Crypto/FX asset-trade records. These are production records and are not release fixtures.
- Secrets remain server-side; no API key or Supabase secret is intentionally shipped to browser code.
- Signed per-account execution quotes, expiry, CSRF/origin controls, secure session cookies, idempotency and integer money/quantity rules remain in place.

## Deferred after v1

Not part of this release:
- Advertising / AdSense.
- Rewarded ads or virtual-cash rewards.
- Paid Vercel services.
- Custom domain.
- Real-money trading or broker/exchange integration.
- Custom analytics events.

Advertising is intentionally deferred until the product has meaningful daily usage; the current product decision is to reconsider at roughly 100 daily visitors. Any advertising/reward implementation requires a separate review of provider policy, hosting plan, ranking fairness and server-side reward verification.

## Release decision

The implemented v1 feature set and public-release controls satisfy the current project completion gate. Remaining items above are explicitly deferred product work, not blockers for the free, ad-free paper-trading v1 release.


---

# Current development handoff — 2026-09-27 18:53 JST

Current production main: `e388e384029dbbc325462335bed302e599d8c9b0`
Production: https://practice-ashy-delta.vercel.app/
GitHub release: `v1.0.0` remains the original public-release tag; current main contains post-v1 improvements.

## Changes after the v1 freeze

- Community comments shipped:
  - General room from Ranking.
  - Dedicated rooms for BTC / ETH / SOL / XRP / USDJPY / EURJPY / GBPJPY / AUDJPY.
  - Logged-in username, timestamp, 280-character limit, escaped rendering and anti-spam limits.
  - Additive server-only `practice_comments` table with RLS and account-delete cascade.
- Username policy changed from 20 to 15 characters in API, UI and database.
- One existing username longer than 15 characters was reset to `名前無し` before the new constraint was applied; that user subsequently renamed the account through the product.
- The exact production account username `S.K.` was deleted by explicit owner request. The distinct `S.K` account was retained.
- Leaderboard now displays `売却 N回` for every account. This counts SELL executions only, not total buy+sell trades. Accounts with no sales display `売却 0回`.
- Static app CSS/JS URLs now carry an asset version so mobile browsers do not remain on a stale pre-deployment UI.
- Latest observed production screenshot confirms sell-count rendering on mobile.

Relevant merged work:
- PR #13 community comments → `26e063e3f9d969e0ad5a72408e5bdda928bd1543`
- PR #14 username cap + leaderboard sell counts → `a4f9dc17020cee907e797b685c2efc2cb705bf2e`
- PR #15 static cache invalidation → `e388e384029dbbc325462335bed302e599d8c9b0`
- Final CI after PR #15: app / database / mobile-ui / public-deployment SUCCESS; Vercel production SUCCESS.

## Distribution status

- Practice is publicly usable and remains free/ad-free.
- Vercel Web Analytics is enabled.
- Tsukutta listing is live with five promotional screenshots, category Game, free pricing and direct browser link.
- Next planned external distribution target: izanami, then other suitable free indie-product directories.
- Advertising remains deferred until meaningful daily usage; prior product decision was to reconsider around 100 daily visitors rather than add ads immediately.

## Product direction / next priorities

Preserve the current working product and user data. Do not introduce paid services, destructive resets or real-money trading without explicit approval.

Growth-oriented candidates to evaluate next:
1. Daily/weekly challenges using the existing virtual portfolio (e.g. best weekly return) with clear reset/eligibility rules.
2. Shareable result cards for ranking, portfolio return or a completed challenge, designed for LINE / Instagram Stories.
3. Lightweight onboarding mission: create virtual account → inspect USD/JPY or BTC chart → make first virtual trade → view ranking/comments.
4. Retention mechanics that do not require real money: streaks/badges or learning achievements.
5. Better discovery/SEO and external directory listings.
6. Continue mobile-first design; early Vercel Analytics showed a strong mobile majority.
7. Consider additional market-data coverage only when licensing/API limits and cost permit; Japanese equities remain deferred until a properly licensed data source is financially sustainable.

## Operating rule for future work

After each meaningful implementation/merge/release milestone, update this `docs/STATUS.md` with:
- JST save time,
- current production/main commit,
- what changed,
- CI/deployment result,
- any production data operation,
- current blockers/deferred items,
- next recommended work.

This file is the canonical handoff if chat context is lost.
