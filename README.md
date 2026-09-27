# Practice 1.2 — Play. Learn. Practice trading.

A free, ad-free Crypto/FX paper trading game, starting with **JPY 100,000 in virtual funds**.
**No real money, deposits, withdrawals, real orders or cash redemption.**

仮想の10万円でトレードを体験するゲームです。本物のお金は使いません。

- Automatic entry: https://practice-ashy-delta.vercel.app/
- 日本語: https://practice-ashy-delta.vercel.app/ja/index.html
- English: https://practice-ashy-delta.vercel.app/en/index.html
- Game: https://practice-ashy-delta.vercel.app/app.html
- Current implementation/deployment state, evidence and next steps: [docs/STATUS.md](docs/STATUS.md)

## Japanese / English

Japan defaults to Japanese; other countries default to English, using the existing Vercel country header rather than GPS. Unknown location falls back to browser language. Manual language selection is saved in the current browser and takes priority on automatic entry URLs. Explicit `/ja/` and `/en/` links preserve the requested language. A selector is available on the public pages and game.

Both languages use the same account, wallet, transaction ledger and achievements. **Money remains JPY; English does not convert the game to USD.** Ranking weeks remain Monday 00:00 JST (UTC+9). Usernames and comments are not translated. No translation provider, new API key or dependency is used.

Details and verification boundaries: [docs/LOCALIZATION.md](docs/LOCALIZATION.md).

## Five tabs / 5つのタブ

**Portfolio / Markets / Challenges / Rankings / Account**

**資産 / マーケット / チャレンジ / ランキング / アカウント**

Markets switches between Crypto and FX. Portfolio shows total assets, cash, holding returns, recent trades and result sharing. Spot-style virtual trades only; no leverage or short selling.

Challenges contains five beginner missions and six permanent achievements. Select up to three earned achievements in Profile to display alongside your name in rankings. Rankings switches between weekly JPY change and total assets, retains sell-only counts and links to community discussion. Each of the eight markets also has its own comments.

## Weekly rankings and achievements

- Weekly score = current total assets minus starting assets this week, not percentage or realized-only P/L.
- Monday 00:00 Asia/Tokyo is the boundary. Starting cash and quantities are reconstructed from the trade ledger and valued using actual earlier historical reference points.
- Per-symbol/week prices are frozen once for everyone. Crypto uses approximately hourly history; FX uses the prior business-day reference.
- New participants compare against their initial virtual JPY100,000. Missing prices/results are shown as unknown, never invented zero values.
- Six achievements: +JPY1,000, +JPY2,000, 3 Crypto trades, 3 FX trades, experiencing -JPY1,000 or -JPY2,000.
- Amount thresholds measure total-asset change from initial funds. Each completed purchase or sale counts once for trade achievements; ranking sales counts remain sell-only.
- Earned achievements persist. Historical unobserved P/L peaks are not invented; recorded trade counts carry forward.
- No monetary rewards or ads for missions. Loss achievements record experience, not a goal to lose money.

Calculation details: [docs/CHALLENGES.md](docs/CHALLENGES.md).

## Market data

Crypto: BTC / ETH / SOL / XRP, JPY reference data via CoinGecko Demo with the existing server key. FX: USD/JPY / EUR/JPY / GBP/JPY / AUD/JPY, business-day daily reference rates through Frankfurter / ECB, **not real-time FX**.

Current four-symbol batches use a shared cache: Crypto 5 minutes; FX 4 hours. Charts cover Crypto 24H / 7D / 30D / 90D / 1Y and FX 7D / 1M / 3M / 1Y / 5Y. No fabricated holiday prices or OHLC. History is fetched on demand, independently of current quotes; chart/weekly-reference prices never become execution quotes. Weekly history shares the existing CoinGecko monthly 500-history-call DB guard. Data licensing and provider quotas remain the operator's responsibility.

## Account safety

Usernames: 2–15 characters. Passwords: 6–128 characters. Password-only sign-in; no email recovery. Never reuse important passwords. Account deletion requires password verification and explicit confirmation, and cascades to history, sessions, comments and progression. Legacy Japanese-equity data previously removed at the user's request is not restored; old equities are not available for new trades.

## Run and verify

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm run dev
```

Both build and dev compile static `/ja/` and `/en/` pages into `dist/`. Source-time translations are maintained in `locales/`; untranslated English surfaces fail the build. Do not add runtime replacement of user content.

Local data lives in `.local-crypto-fx/`. Production uses Supabase. For a NEW empty database only, apply `db/bootstrap.sql`, `db/crypto_fx.sql`, `db/price_charts.sql`, `db/comments.sql`, `db/ranking_activity.sql`, `db/progression.sql` in order. **The 1.2 language release requires no database migration.** Never replay initialization SQL to reset existing users.

`db/smoke.sql` and `db/progression_smoke.sql` use isolated fixtures and roll back. For browser tests, run `node tests/ui-server.mjs`, then:

```sh
python tests/browser_smoke.py
python tests/progression_browser.py
python tests/localization_browser.py
```

These exercise actual localhost HTTP/Cookie flows with fixture market prices, not production user trades. English tests cover country/default selection, manual preference, blocked storage, locale-request failure, trading, badges, comments, result sharing, language changes and uncertain-order replay, plus 320/390/768/1280px layouts. Production CI checks anonymous configuration, authentication boundaries and exact deployed bilingual assets separately.

Configuration: `.env.example`, `docs/DEPLOY.md`. Provider rules: `docs/MARKET_DATA.md`.
Never commit passwords, cookies, private keys or DB credentials. The original v1.0.0 tag is preserved.
