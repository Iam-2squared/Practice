# practice.

**10万円からはじめる、日本株の仮想売買。**

スマホ中心の、現物取引だけの小さな練習アプリです。実際の注文・入出金・証券口座連携はありません。

## できること

- 初期資金 **100,000円**、練習用に **1株単位**。信用取引・空売り・借入なし。
- 下部3タブ：**資産**（現金・持ち株・評価額・損益）、**取引**（銘柄検索・購入・売却）、**履歴・アカウント**。
- 持ち株を押して直接売買。確認画面を経由し、残高・保有数をサーバーで検証。
- メール登録なし、**専用パスワードのみ**で口座作成・再ログイン。
- 注文番号による二重売買防止、同時注文の残高保護、株価の改ざん防止。

## 現在の状態

**v0.1: ローカル実装・検証済み。公開は未完了。**

標準設定は **DEMO（架空の固定価格）** です。実際の株価ではありません。
Yahooアダプターは実装しましたが、実データ取得は未検証です。公開利用・再配信の許可を確認するまでは有効にしません。

専用Supabaseの作成・接続とVercelの公開先設定が残っています。最新の保存時刻、検証結果、次の手順は [docs/STATUS.md](docs/STATUS.md) を参照してください。

## ローカルで動かす

Node.js 22 が必要です。外部npm依存はありません。

```sh
npm ci
npm test
npm run dev
```

`http://localhost:3000` を開きます。初回起動時に `.local/` へ開発専用の保存ファイル・秘密鍵を作ります。**このフォルダーはGitに入れないでください。** 同一開発サーバーでは再起動後も口座を保持します。複数プロセス・本番用の保存先ではありません。

パスワードは20〜128文字、異なる文字10種類以上。画面の **安全なパスワードを自動生成** を推奨します。忘れた場合の復旧はありません。他サービスのパスワードを流用しないでください。

```sh
npm run check   # JavaScript構文チェック
npm test        # ドメイン・認証・API・同時注文・株価のテスト
npm run build   # dist/ へ静的クライアントを生成
```

## 構成

今回の小ささを優先し、Next.jsではなく **HTML/CSS/JavaScript + Node.js Web API** を採用しました。Vercel Functionsが `api/index.js` を、Vercelが `dist/` を配信する構成です。

| 場所 | 内容 |
|---|---|
| `public/` | 3タブのスマホ向け画面 |
| `lib/domain.mjs` | 現物売買・整数金額・取得原価・損益 |
| `lib/security.mjs` | scrypt / HMAC / セッション / CSRF |
| `lib/app.mjs` | 認証・検索・売買のHTTP API |
| `lib/store.mjs` | ローカル／Supabase REST保存アダプター |
| `lib/market.mjs` | DEMO／Yahoo価格アダプター |
| `db/` | 専用DBの定義・権限確認・SQLスモークテスト |
| `docs/DEPLOY.md` | 本番接続・公開手順 |

## 練習モードの割り切り

参照価格で即時に仮想成立します。実際の板・約定順・流動性・単元株の売買条件・受渡・手数料・税金・株式分割・配当は再現しません。営業時間外も、期限内の参照価格があれば仮想売買できます。長期間保有した場合の損益は、実際の投資成績を再現しません。

価格を取得できない保有銘柄があるときは、資産合計を **未算出** にします。取得原価や0円を現在値として代用しません。DEMOとYahooの口座は混在できません。

## セキュリティ・データ利用

パスワードの平文保存、ブラウザーへのDB秘密鍵配布は行いません。サーバーが口座単位のアクセス制御を行い、DBはRLS有効・匿名アクセス不可です。詳しくは [SECURITY.md](SECURITY.md)。

Yahooの利用許可はライブラリやアプリの実装だけでは得られません。参考：
- [yfinanceのデータ利用に関する注意](https://github.com/ranaroussi/yfinance#download-market-data-from-yahoo-finances-api)
- [Yahoo Terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)

本アプリはYahoo・証券会社・取引所の公式サービスではありません。投資助言や実際の投資成果の保証は行いません。
