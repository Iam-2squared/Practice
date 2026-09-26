# Practice v0.2.1 — 最新状況

保存時刻: **2026-09-26 18:05:51 JST**
Repository: `Iam-2squared/Practice`
本番: https://practice-ashy-delta.vercel.app
検証済み実装: `66df8be61f65cc1d492791ff4d7f3e2a06dcb1d3`
検証済みソースtree: `3237e02738d42501b099b919c4bb5c36a7445af7`

## 現在の結論

**v0.2.1の本番反映・公開設定応答を確認済み。株価は引き続きDEMO。Yahoo実株価の公開配信は未完了。**

2026-09-26 18:04:49 JST、GitHub CIから本番の `/api?action=config` を認証情報なしで取得し、version=0.2.1、accountsAvailable=true、storage=supabase、provider=demo、marketStatus=demo、lotSize=100、publicOrigin一致、setupIssues=[]を確認。
この確認は設定応答の検証であり、DB書き込みやYahoo実株価取得の証明ではありません。

## 今回の改善

- Supabase URL・本番Originの末尾スラッシュや前後の空白を安全に正規化。任意ホスト・パスは引き続き拒否。
- 接続準備中の理由を、秘密値ではなく許可した環境変数名だけで確認できるようにした。
- 個別Deployment URLでは本番URLへのリンクを表示し、口座作成・売買を止める。サーバーのCSRF検証は緩めていない。
- デモ口座の価格モードを保持。将来サイトの既定価格ソースを変更しても、既存口座・残高・履歴を勝手に変換しない。
- 実株価配信停止時もログイン・現金・履歴を保持。取得できない時価は不明とし、0円や架空価格で補完しない。
- Yahooアダプターの時刻・通貨・銘柄検証、同時取得の集約、古い価格の再検査、401/403/429の扱いを強化。すべてfixture検証で、実データ接続成功とは扱わない。
- 口座検索用のAPP_SECRETを変えず、価格署名用の鍵をサーバー秘密情報から分離導出。既存口座をロックアウトする秘密鍵変更はしていない。

## 検証結果

- Node.jsテスト **132 / 132 PASS**。構文チェック・ビルドPASS。
- Feature CI `36231482310`: app / database / mobile-ui SUCCESS。本番確認ジョブは分岐条件によりSKIPPED。
- Main CI **`36231618510`**: **app / database / mobile-ui / public-deployment の4ジョブすべてSUCCESS**。
- Chromiumの通常HTTP、ネイティブCookie/CSPで登録・購入・保有株から売却・履歴・再ログイン・テスト口座削除、8画面幅を検証。価格モード・本番Origin案内・許諾未確認の表示はmock configによるUI契約テスト。
- iOS Safari実機での新バージョンE2E、実Yahoo価格での取引は未検証。
- 管理実行環境のlocalhostブラウザー制限は変更・回避せず、通常のブラウザー検証はGitHub CIで実行。
- VercelのGitHubステータスはSUCCESS。Vercel管理コネクターは依然403のため、管理権限が復旧したとは扱わない。

検証記録: `docs/verification/release-v0.2.1.json`
CI: https://github.com/Iam-2squared/Practice/actions/runs/36231618510

## 既存データと変更範囲

Supabase `mitowlxrsrhbtmehiyvh` を読み取り専用で再確認。口座1件、売買2件、現金100,000円、持ち株0、デモモードを維持。作業後の有効セッションは2件。
今回の実装作業による本番DBの書き込み・スキーマ変更・口座削除・環境変数変更はありません。
初期資金10万円、現物のみ、100株単位、下部3タブ、スマホ対応、白・紺・青のデザインを維持。

## 未完了と次の判断

Yahooの公式案内には再配布を認めない記載があり、この公開アプリの利用許諾は得ていません。`YAHOO_DATA_USE_APPROVED=true`を設定するだけで許諾になるわけではありません。
**無料か有料かの条件を利用者と確認し、実際の公開配信を認めるデータ供給元・契約を選定する必要があります。** 詳細と一次資料は `docs/MARKET_DATA.md`。
有料プラン購入、外部配信契約、Yahoo実データ有効化はしていません。今の口座を消したり、環境変数を再作成したりする必要はありません。

この保存は検証結果の記録のみ。実装・テスト・DBコードは上記の検証済みcommitと同一です。
