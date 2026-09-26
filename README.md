# Practice 0.4 — Crypto / FX

10万円からの仮想売買。実際の暗号資産・外貨の注文や入出金はありません。

**資産 / 仮想通貨 / FX / ランキング / 履歴・アカウント** の5タブ。
資産画面はサマリーと最近の売買記録だけ。保有銘柄一覧・チャート・お気に入りはありません。
保有数量は内部で保存し、各銘柄の売る画面で確認できます。現物のみ、信用・空売り・レバレッジなし。

## 市場

- 仮想通貨: BTC / ETH / SOL / XRP、円建て、CoinGecko Demo。サーバーの無料APIキーが必要です。
- FX: USD/JPY / EUR/JPY / GBP/JPY / AUD/JPY、Frankfurter v1の日次参考レート。リアルタイムFXではありません。
- データの日時と出典リンクを表示。価格不明・古い価格は約定しません。合成価格への切替なし。
- 4通貨を一度に取得、Supabaseで全インスタンス共有キャッシュ。Cryptoは5分、FXは4時間。同時取得をロック。
- 無料枠や利用許諾を保証するものではありません。CoinGecko契約上の用途・割当量は利用者が確認してください。

## 口座と記録

ユーザーネーム、6〜128文字のパスワード。ログインはパスワードだけ。長いランダムなパスワードを推奨。
口座削除には本人確認と明示確認が必要です。旧・新ウォレット、履歴、セッションは連鎖削除され、ランキングから消えます。

旧日本株口座のID・名前・認証情報・元の状態・売買履歴は変更しません。
新しいCrypto/FXウォレットを各口座に10万円で一度だけ追加します。
旧履歴は「旧市場の保存記録」として閲覧でき、現在のランキングや残高には混ぜません。
旧銘柄の検索・価格取得・新規注文は実装から削除しました。

## 実行・検証

```sh
npm ci --ignore-scripts
npm test
npm run check
npm run build
npm run dev
```

開発用のデータは `.local-crypto-fx/`。本番はSupabase専用。
新DBは `db/bootstrap.sql` → `db/crypto_fx.sql`。既存DBは追加移行 `db/crypto_fx.sql` だけ。
`db/smoke.sql` はサービスロールで検証し全fixtureをROLLBACKします。
本番移行は既存の口座や履歴を削除・リセットしません。

UIテストは `node tests/ui-server.mjs` と `python tests/browser_smoke.py`。
通常はHTTP/Cookie付きの実APIを、外部価格だけ合成fixtureで検証します。
`PRACTICE_UI_ISOLATED=1` はネットワーク接続をしない純粋な表示テストで、HTTP・本番E2Eとは別です。

本番設定は `.env.example` と `docs/DEPLOY.md`、価格の条件は `docs/MARKET_DATA.md`。
秘密鍵・パスワード・CookieをGitに保存しないでください。
