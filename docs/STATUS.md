# Practice 0.5 — Crypto / FX price charts

保存時刻: 2026-09-26 23:45 JST

作業ブランチ: `feature/price-charts`

開始時main: `8797e89337cf703bbb45a8d4f1dfc8b22d51b8f3`

## 現在の状態

- 0.4の5タブ、円建て現物仮想売買、10万円ウォレット、認証、ランキング、履歴、口座削除、資産ごとのコンパクトな保有損益を維持。
- BTC / ETH / SOL / XRPの詳細に24H / 7D / 30D / 90D / 1Yラインチャートを実装。履歴点の実粒度は約5分 / 約1時間 / 日次として表示し、OHLCや1分足には見せない。
- USD/JPY / EUR/JPY / GBP/JPY / AUD/JPYの詳細に7D / 1M / 3M / 1Y / 5Yラインチャートを実装。Frankfurterの日次営業日だけを表示し、休日を補間しない。
- 選択期間の騰落率はチャート先頭値基準。資産画面の取得原価基準損益とは別。マウス、タッチ、キーボードで各点の日時・価格を確認可能。
- 読込中、空データ、取得失敗を区別。チャート失敗時も現在価格と有効な注文は独立して利用可能。チャート値を価格トークン・約定・評価原価へ渡さない。
- 期間切替はチャート領域だけを更新し、数量入力を保持。request/epoch/銘柄/期間を照合し、高速切替、モーダル閉鎖、銘柄変更、ログアウト後の古い応答を破棄。
- Crypto履歴は銘柄・期間別共有キャッシュ（24H: 1時間、7〜90D: 6時間、1Y: 24時間）。FX履歴は24時間。全期間・全銘柄の先読み、背景更新、無限再試行なし。
- CoinGeckoチャート新規取得はDBでUTC月500 callに制限。現在価格の最大8,928 call/月と合わせてアプリ管理上9,428 call/月以内に抑え、現在価格用キャッシュを履歴から分離。
- 追加DBは `practice_chart_cache` と `practice_provider_budgets` のみ。既存口座、認証、ウォレット、保有、原価、取引履歴を更新・削除しない。

## 確認済み

- 開始時GitHub: mainは上記SHA、未完了PR・同名チャートブランチなし。既存mainのVercel checkはsuccess。
- 開始時Supabase: `ACTIVE_HEALTHY`、publicに既存2口座・Crypto/FX取引2件。migration直前には既存3口座・取引4件で、他利用とみられる増分も含めて変更対象外として保護。
- 公式仕様確認: CoinGecko Demoは10,000 credits/月、100 calls/min、日次/時間履歴1年、5分履歴1日。Frankfurter v1は日次時系列を提供し、v2推奨だが継続稼働と記載。
- Node実装テスト: 101 / 101 PASS。履歴形式、日時、順序、値、空/欠損/異常/過大、期間拒否、429/timeout、同時取得、共有cache、月間guard、現在価格との独立、売買/認証/ランキング回帰を含む。
- `npm run check`: 21 JavaScript files PASS。`npm run build`: PASS。`git diff --check`: PASS。
- HTTPブラウザテストは、期間高速切替、数量保持、pointer/touch、320〜1280px、閉鎖/ログアウト競合を追加済み。
- PR [#5](https://github.com/Iam-2squared/Practice/pull/5) を作成。head `b955604c93cfc8f4bc30345498e73bc835fef06e` のCI Run `36249392595` は app / database / mobile-ui が全成功し、Vercel previewもReady。
- Production Supabaseへmigration `20260926144350 practice_price_charts_v05` を適用。適用前後で既存3口座・4取引・3ウォレット・4セッションの件数は不変。新規2テーブルはRLS有効、anon/authenticated権限なし、service_role限定。claim関数はtransaction rollback内で動作確認。
- Supabase advisorはperformance指摘なし。securityのINFOは、server-onlyテーブルでRLSを有効にしbrowser向けpolicyを意図的に置かない既存方式（新規2テーブルを含む）。

## 未完了・次の手順

- ローカル環境にはChromium/Postgresがなく、Playwright Chromium取得も実行環境の配布URL制限で失敗。代わりにGitHub CIの実HTTP Playwright `mobile-ui` とPostgres `database` を成功確認済み。
- PR #5の最終文書コミット後CI、merge、main CI、Vercel本番反映、実CoinGecko Demo / Frankfurterチャート、本番スマホ/PC操作は未確認。
- Vercel管理コネクタはチームscope 403。環境変数や課金設定は変更せず、GitHub連携check、公開HTTPS、runtime errorで検証する。

次: 最終文書コミットのCI → PR #5 merge → main CI/Vercel → 隔離した一時口座で実データ表示を確認し、売買せず削除する。
