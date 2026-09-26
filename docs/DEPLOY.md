# Vercel + Supabase 接続

## 1. 専用DB — 構築・SQL検証済み

- Project: **Practice** / `mitowlxrsrhbtmehiyvh`
- Region: **ap-northeast-1（東京）**
- 作成時に接続ツールが提示した費用: **月額0**（将来の利用上限・追加機能の料金保証ではありません）
- Migration: `practice_v02_cash_lots`
- 4テーブルのRLSと非公開権限、3つのSECURITY INVOKER関数を確認済み。
- service_roleで100株制限、買い／一部売却／全売却、二重注文、改ざん拒否、口座削除連鎖を検証。検証レコードはROLLBACKして0件。

**同じプロジェクトを再作成する必要はありません。** 既存の別プロジェクトには変更していません。`db/bootstrap.sql` は新規環境用で、旧バージョンの実データ入りDBの移行スクリプトではありません。

## 2. Vercel — 現在ここが接続待ち

接続ツールは `list_teams` が0件、`deploy_to_vercel` が `-32602 Tool deploy_to_vercel not found` でした。CLIの認証情報もこの作業環境にはありません。公開済みURLはありません。

Vercelの「Add New → Project」でGitHub `Iam-2squared/Practice` をインポートし、Frameworkを **Other** にします。`vercel.json` がビルドと `dist/` を指定します。APIは `api/index.js`、Node.js 22、東京リージョンです。

秘密値はVercelのEnvironment Variablesに直接設定し、チャットやGitHubには貼り付けないでください。

| 環境変数 | 設定 |
|---|---|
| `PRACTICE_STORE` | `supabase` |
| `SUPABASE_URL` | `https://mitowlxrsrhbtmehiyvh.supabase.co` |
| `SUPABASE_SECRET_KEY` | サーバー専用の `sb_secret_...`（推奨）またはservice-role JWT |
| `APP_SECRET` | 独立した64文字以上の秘密鍵 |
| `APP_ORIGIN` | 実際の公開HTTPS origin。末尾 `/` なし |
| `MARKET_PROVIDER` | まず `demo` |
| `YAHOO_DATA_USE_APPROVED` | まず `false` |

APP_SECRETの生成例（結果は非公開で保管）:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

PreviewとProductionで別DB・別秘密値を使うか、Previewでは口座を無効にしてください。APP_ORIGINは接続先ごとに厳密に一致させます。サブドメインのワイルドカード許可はしません。

## 3. 公開URLでの確認（未実施）

`/api/index?action=config` で accountsAvailable=trueを確認。公開URLを普通のブラウザーと別端末で開き、登録→買い→売り→履歴→ログアウト→再ログインを確認します。同じ注文番号の再送、残高超過・保有超過、別アカウントの履歴分離、Cookie属性・CSRF拒否、DB再起動後の永続化も検証します。

画面だけ見えても公開完了ではありません。Vercel上のルーティング・Cookie・DB gateway・SQL RPCの接続まで通ってから公開完了とします。

## 4. Yahooを使う前に

アダプターは非公式の `query1.finance.yahoo.com` chart/searchエンドポイントを使用します。Yahoo JAPAN画面のスクレイピングではありません。到達性・銘柄カバー率・遅延・利用許諾は保証していません。

自動取得と公開再配信の利用権が確認できてから、MARKET_PROVIDER=yahoo / YAHOO_DATA_USE_APPROVED=trueを設定します。このフラグは許諾を取得するものではありません。公開可否が未確認ならDEMOのまま、または公開配信契約のあるプロバイダーへ差し替えます。

Yahoo取得が失敗すると注文は停止し、デモ価格で補完しません。価格時刻・取得時刻を区別して記録します。営業中と判断できるデータは30分、営業時間外の参照価格は5日を取得時点の上限とし、注文トークンの期限は60秒です。

## 残る公開運用の確認

公衆向けアクセス数・濫用制御、バックアップと保持期間、削除済み口座のバックアップ保持、運営者連絡先、プライバシー説明の運用実態との一致を公開前に決定してください。株式分割などコーポレートアクションは未対応なので、長期保有の正確な損益再現には使用しないでください。

## 公開時の必須チェック

1. Productionの環境変数だけを設定し、未設定のPreviewは口座を無効なままにする。
2. `/api/index?action=config` の `accountsAvailable=true`、`lotSize=100`、`version=0.2.0` を確認する。
3. 新規口座で100株購入・100株売却・再ログイン・別端末ログインを確認。1株／99株／101株の改変リクエストは拒否されること。
4. ローカルの表示テストは公開URLのCookie、CSP、ルーティング、Supabase REST接続を代替しない。これらが通るまでは公開完了としない。

Yahooの権利確認はこのアプリの設定フラグだけで成立しません。本番で勝手に承認済み扱いにしないでください。
