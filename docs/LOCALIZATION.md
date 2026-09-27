# Practice Japanese / English localization

Approved scope: Japanese by default for visitors in Japan; English elsewhere; manual override retained in the current browser. No new account, paid service, GPS prompt or database migration.

## Language selection

Automatic entry URLs remain `/` and `/app.html`. Explicit language pages are `/ja/index.html`, `/en/index.html`, `/ja/app.html`, `/en/app.html`, plus each language's terms, privacy and market-data pages.

Priority:
1. Valid explicit `?lang=ja` or `?lang=en`.
2. Explicit `/ja/` or `/en/` URL (so shared language-specific links are predictable).
3. Valid manually saved `practice.language` in this browser's local storage.
4. `/api/index?action=locale`, using Vercel's `x-vercel-ip-country`: JP -> ja, other supplied country codes -> en.
5. Supported browser language, then English.

A manually saved language therefore overrides country detection on automatic entry URLs; an explicitly language-specific link overrides that saved default. The language selector can change either language at any time when no modal is open. It navigates to the matching language URL, not a different origin. Password, trade, profile and comment dialogs block language navigation until closed, so switching does not silently discard a draft or interrupted order. Existing pending-order IDs stay in same-origin session storage and remain retryable.

No location permission is requested. Existing Permissions-Policy continues to disable geolocation. The application does not store the IP-derived country in the database for localization. Country inference can be wrong with VPN/proxy connections; the manual selector remains available. Blocked local storage does not prevent explicit-language links from working. If the locale endpoint fails or exceeds 2.5 seconds, browser language is used without an endless spinner.

The country header is a display hint, never an authentication or authorization factor. `x-test-country` is interpreted ONLY by the isolated localhost fixture server; production ignores it.

## Data semantics are unchanged

- One account, one wallet and one history across both languages.
- Initial virtual funds remain JPY 100,000. English displays JPY explicitly; there is no conversion to USD.
- Prices, rounded trade totals, quantities, request IDs, quote signatures and idempotency are unchanged.
- Weekly rankings still use Monday 00:00 Asia/Tokyo, not the visitor's local week.
- Timestamps remain JST (UTC+9); English date formatting does not imply a timezone conversion.
- Stored usernames and public comment text are never automatically translated or sent to a translation provider.
- Server-generated mission/achievement labels and error messages are localized separately from their stable IDs and status codes.
- Chart granularity labels retain approximately five-minute, hourly, daily UTC or business-day meaning. No real-time FX claim is added.
- Market search accepts English FX names while preserving canonical stored symbols and names.

## Implementation and maintenance

`public/app.js` and `public/progress-ui.js` remain the Japanese source clients. `scripts/localize.mjs` creates independently served, content-hashed Japanese and English bundles and static HTML pages. It translates immutable repository source only, BEFORE user data is interpolated. It is not a runtime DOM replacement engine and never rewrites API payloads containing user data.

Copy is reviewed in `locales/en.mjs`, `locales/en-pages.mjs` and `locales/en-context.mjs`. The build fails when unmapped Japanese text remains in English sources/pages. This is a completeness guard, not a substitute for language review; inspect rendered English for natural wording after source changes. Future string additions must include English copy and tests. The language bootstrap, loader and layout stylesheet also use content hashes. Localized manifests identify the same application and give language-specific start URLs.

`lib/locale.mjs` wraps the existing API. Locale/config and all account responses use private, no-store caching. Errors keep their HTTP status and stable code. The locale endpoint does not need an account, database or market provider. User-specific results are never CDN-cached for another visitor.

All sources use the existing CSP and same-origin requests; no SDK, translation API, dependency or provider key is added. Static English legal pages are translations of the current Japanese product policies; new privacy copy describes language preference storage and country inference.

## Required verification

- Node resolver, precedence, unknown/malformed header, no-store, stable-data, idempotency and source-coverage tests.
- Existing Japanese HTTP trading and progression browser tests.
- English HTTP purchase/sale, charts, missions, selected profile badges, rankings, comments and share-text tests.
- Switching languages preserves account ID, wallet state and history; replay of a saved uncertain order does not duplicate trades.
- Country permutations and storage/network failures in isolated fixtures.
- 320 / 390 / 768 / 1280px English layout checks and screenshot inspection.
- Main CI compares the deployed bilingual pages, loader and content-hashed bundles against the checked-out build. Public smoke is anonymous only; it does not trade with existing production accounts.
- Real user phone verification remains separate from browser emulation. Testing simulated country headers is not proof of every physical country/network.

## Official implementation references

- https://vercel.com/docs/headers/request-headers — `x-vercel-ip-country` is an IP-associated two-letter country code.
- https://vercel.com/docs/caching/cache-control-headers — private/no-store response caching and hashed static assets.

Checked 2026-09-27 JST. Source files and tests, rather than external pricing assumptions, define this release.
