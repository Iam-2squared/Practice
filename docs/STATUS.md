# Practice — current handoff

保存時刻: 2026-09-28 13:48 JST

## ✅ 現在の本番状態

**Crypto / FXの銘柄拡張と⭐お気に入り機能は、実装・DB更新・PR merge・本番配信検証まで完了。**

| 項目 | 確認結果 |
| --- | --- |
| 仮想通貨 | 4 → 10銘柄 |
| FX | 4 → 7通貨ペア |
| 合計 | 8 → 17銘柄 |
| PR | #23 / feature/market-expansion-favorites / merged |
| 本番実装commit | 68d5377e2a278df7586165d3ac961997566d33e1 |
| 検証済みPR head | 5bb91b029602b1b352f96f6561d347fb37b7f546 |
| 最終PR CI | 36378565745 (#201): app / database / mobile-ui SUCCESS |
| 実装merge後main CI | 36379051037 (#202): app / database / mobile-ui / public-deployment 全SUCCESS |
| Nodeテスト | 176 / 176 PASS、失敗・スキップ・キャンセル0 |
| 構文確認 | 34 JavaScriptファイル PASS |
| 本番smoke | 2026-09-28 13:47:14.064 JST / PASS / exactBuiltAssets=true / favoritesAssets=true |
| Vercel連携 | 当該実装commitに対するdeployment status SUCCESS |
| 公開API version | 1.2.0を維持。今回の差分はcommitとlocale-build manifestで識別 |

本番: https://practice-ashy-delta.vercel.app/
日本語ゲーム: https://practice-ashy-delta.vercel.app/ja/app.html
English game: https://practice-ashy-delta.vercel.app/en/app.html

この記録を保存する後続docs-only commitは、本番実装・DB・ビルド出力を変更しません。最新mainと後続CIは再取得して確認してください。新たなRelease/tagは作成していません。

## 🪙 採用銘柄

Crypto: BTC / ETH / SOL / XRP / **BNB / ADA / DOGE / AVAX / LINK / LTC**。
FX: USDJPY / EURJPY / GBPJPY / AUDJPY / **CADJPY / CHFJPY / NZDJPY**。

追加銘柄も検索・現在参考価格・履歴チャート・仮想購入/売却・保有評価・売買履歴・銘柄コメント・取引実績集計・週間基準価格に接続しました。JavaScriptとSQLの銘柄名・数量刻み・提供元は一致テスト済みです。既存銘柄の識別子・保存名・数量刻みを変更していません。

提供元はCoinGeckoとFrankfurter / ECBのままです。株式、レバレッジ、空売り、実売買、新たな有料データ契約は追加していません。FXは引き続き営業日の日次参考レートであり、リアルタイム化していません。

## ⭐ お気に入り

各マーケット行の右側に☆を追加し、選択すると塗りつぶしの星になります。お気に入りは現在の市場・検索結果内で先頭に並びます。お気に入り同士・通常銘柄同士は元のカタログ順を保ち、解除すると通常の位置に戻ります。

保存先は同一ブラウザ/originのlocalStorage、キーは `practice.market-favorites.v1`。再読み込み・JA/EN切替で保持し、同一originの別タブとも同期します。**アカウント同期・他端末同期ではありません。** 同じブラウザではログアウト後も残り、サイトデータ削除で消えます。ストレージ拒否・容量不足の場合は一時保存と表示し、ページを閉じるまでメモリ内で動作します。不正な保存JSONは無視します。

星は銘柄詳細ボタンとは別のボタンです。星操作から価格API・履歴API・注文APIへの通信は発生せず、注文画面も開きません。キーボード操作、並べ替え後のフォーカス、aria-pressed、日英の操作名、最小44pxのタップ領域を検証済みです。

## 🔒 DB・データ・予算

Production migration `market_expansion_favorites_20260928` をPracticeへ適用済み。内容は `db/market_expansion.sql`、Git blob `5ea9fb8ba2c6f08b860b26767c300b8f2b87eaec`。

既存の口座・認証情報・残高・保有・売買履歴・獲得実績・予算行をリセットする処理は実行していません。本番でテスト口座・テスト注文・テストコメントも作成していません。DB変更は銘柄対応に必要な関数・制約の拡張です。売買確定RPC、署名、CSRF、冪等性、JPY整数計算の規則は維持しています。

適用後のread-only構造確認（2026-09-28 13:43:59 JST）で17 / Crypto10 / FX7、新規チャートキーの受理、株式・不正キーの拒否を確認。確認した8テーブルはRLS有効、anon/authenticatedのSELECT権限なし、service_roleのSELECT権限あり。新規関数もserver-onlyです。これは全口座の更新前後ハッシュ比較や実ユーザー取引監査ではありません。

現在値は各提供元の一括取得を維持し、銘柄ごとの個別定期取得にはしていません。Cryptoは共有キャッシュ最大5分に1回、FXは共有キャッシュ4時間・実データは営業日日次です。旧4銘柄キャッシュと混ざらないよう `crypto-v2` / `fx-v2` に分離し、旧 `crypto` / `fx` は消去していません。移行中は世代ごとの初回取得があり得ます。

Cryptoチャートは全10銘柄で既存の月500回ガードを共有します。上限を増やしたり銘柄ごとに別枠を作ったりしていません。お気に入り登録でのチャート先読みもありません。提供元の欠落・不正・古い価格は架空値で補わず停止します。利用規約や再配布の許諾範囲を今回新たに保証したものではありません。

## 🧪 検証と証跡

- 元のNode/SQL/UI回帰を維持。SQLは隔離Postgresで旧構成の回帰 → migrationを2回適用 → 旧回帰と拡張回帰の順に実行し、全成功。
- 全17銘柄の最小数量・部分売却・全売却、17銘柄同時保有、履歴34件、旧データの構造互換、数量/価格の異常、共有キャッシュ/lease、月間予算・並列最後の1回、銘柄コメント、実績集計・週間価格を検証。
- お気に入りはJA/EN、320 / 390 / 768 / 1280pxで操作確認。クリックと注文の分離、安定並び替え、検索/市場の分離、キーボード/フォーカス、reload/言語切替、別タブ/clear、不正JSON/ストレージ拒否を検証。未捕捉ブラウザエラー0。
- 既存UI回帰は320 / 360 / 390 / 430 / 768 / 1280pxを継続。JA/ENの売買・ミッション・称号・ランキング・コメント・結果不明注文の再確認も通過。
- PR CI artifact `10951397999` / `mobile-ui-evidence` / SHA256 `5e6911b854d2dac11e8834abecd50c20a269a902f225477181d13db616b7ffa0`。ZIPを取得してdigest一致を確認。日本語Crypto390px、英語FX320pxのスクリーンショットを目視確認。
- 本番smokeは両言語HTML・app bundle・loader・言語JS・CSS・お気に入りJS/CSS・manifestの当該commitビルドとの完全一致、configの10/7、日次/更新間隔、匿名アクセスの認証拒否を確認。
- 本番APIはcrypto/fxともenabled、storage=supabase。これはライブ全銘柄の提供元応答や全履歴期間、本番ユーザーでの売買成功を保証するものではありません。取引・星の操作テストは隔離環境です。
- Vercel管理/保護Previewの直接接続はteam scope権限がなく、変更・回避していません。既存GitHub連携deploymentとmain CIの匿名本番smokeで配信を確認しました。

長期記録: `docs/verification/market-expansion-release.json`。仕様と運用注意: `docs/MARKET_EXPANSION.md`。旧1.2のhandoff原本は `docs/verification/status-before-market-expansion.md` に保存しています。

## 🌍 維持した既存機能

JA/ENの初回国判定、日本は日本語・それ以外はEnglish、手動言語切替と保存、同一口座の継続を維持。通貨はJPY、初期仮想資金は10万円。週の境界はJST月曜0時です。

5タブ、5ミッション、6実績、最大3つの称号、総資産/週間ランキング、テキスト結果共有、15文字ユーザーネーム、総合/銘柄別コメント、チャート、既存の取引安全性を維持。公開ブランドはSOLUYRA、今回の対象製品はPracticeのみです。

## 🎯 次の方針・再開手順

今回承認された銘柄拡張・⭐機能は完了。ユーザーは本番を再読み込みしてマーケットで利用できます。実スマホでの確認が報告されたら、CI/隔離環境の検証とは区別して日時付きで追記してください。

次回は最新main/CIとこのSTATUS、MARKET_EXPANSION、release JSONを確認してから着手します。新たな市場・データ契約・課金・アカウント同期は別途承認なしに追加しません。

**新銘柄を保有する利用者がいる可能性があるため、旧8銘柄だけのvalidatorへ戻すrollbackは禁止。** 不具合修正時も17銘柄の保存データを読めるカタログ/validatorを維持し、残高・保有を削除して復旧しないでください。
