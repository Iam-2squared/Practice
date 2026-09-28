# Practice — current handoff

保存時刻: 2026-09-27 23:42 JST

## 現在の本番状態

**Practice 1.2.0：日本語・英語対応の実装、PR merge、本番配信確認まで完了。**

- 実装PR: #21 / `feature/ja-en-localization`
- 本番実装commit: `d8e3829c7855ead5de8c34676f9bf97608cfe26f`
- 検証済みPR head: `6ff001ac3b3dcf011c9b26c6e0bb71b1e3d10be0`
- 最終PR CI: `36326047463` (#192)、SUCCESS
- 実装merge後main CI: `36326644215` (#193)、app / database / mobile-ui / public-deployment 全SUCCESS
- Vercel: 同実装commitのdeployment SUCCESSをGitHub連携の状態で確認
- 本番smoke: 2026-09-27 23:40:34 JST、version 1.2.0 / Japanese + English / exactBuiltAssets=true / PASS
- 本番locale APIも応答し、検証実行元では `language=en, source=country` を確認

自動判定入口: https://practice-ashy-delta.vercel.app/
日本語紹介: https://practice-ashy-delta.vercel.app/ja/index.html
English landing: https://practice-ashy-delta.vercel.app/en/index.html
ゲーム: https://practice-ashy-delta.vercel.app/app.html
日本語ゲーム: https://practice-ashy-delta.vercel.app/ja/app.html
English game: https://practice-ashy-delta.vercel.app/en/app.html

後続のdocs-only commitは上記の実装を変更しません。最新main SHAと最終CIはGitHubで再確認してください。`v1.0.0`タグは元の`3ebee92e436a02e4d3d6d5cecb7507d2cb155dec`のまま維持し、今回1.2.0のRelease/tagは新規作成していません。

## 言語機能

- 初回の自動判定入口では、日本のアクセスは日本語、それ以外の国はEnglish。VercelのIP由来の国ヘッダーを表示上のヒントとして使い、GPS許可は要求しません。
- 国が不明・不正、またはlocale APIが応答しない場合はブラウザの対応言語を使い、該当がなければEnglish。判定待ちは2.5秒で打ち切ります。
- ページ上部に日本語 / Englishの手動切替。選択は現在のブラウザに保存し、自動判定入口では国より優先します。
- 優先順は有効なlangクエリ → 明示された/ja/・/en/ URL → 保存済み手動選択 → 国 → ブラウザ言語 → English。英語専用リンクは保存済み日本語設定より優先されます。
- 紹介、ゲーム、利用規約、プライバシー、データ説明を両言語で配信。UI、エラー、ミッション、実績、週間/総資産ランキング、チャート説明、結果共有文も英語対応。
- ユーザーネームと投稿コメントは翻訳・書き換えません。英語の通貨名でのFX検索に対応しますが、保存済み銘柄名・識別子は変えません。
- 入力中のダイアログが開いている間は言語移動を防ぎ、閉じてから切り替えます。未確認注文の識別子は同一originのsessionStorageに残り、切替後も同じ注文として再確認できます。

## データと安全性

両言語は同じ口座、セッションCookie、残高、保有、売買履歴、実績・称号を使います。**ゲーム内通貨は引き続きJPY、初期資金は仮想10万円です。英語化によるUSD換算は行いません。** 週間境界は日本時間の月曜0時、時刻表記もJSTです。

今回、既存ユーザーのデータ操作、DB migration、課金設定変更、新規外部アカウント・APIキー・依存パッケージ・広告追加は行っていません。売買の丸め、価格署名、認証・CSRF、冪等性、現在値/履歴の共有キャッシュ、既存の市場データ予算ガードは維持しています。

翻訳は信頼できるリポジトリ内ソースをビルド時に処理し、実行時のユーザー文章や完成済みDOMを一括置換する方式ではありません。英語ページ・ソースに未翻訳文が残るとbuildが失敗します。JS・言語初期化・ローダー・追加CSSは内容ハッシュ付きで配信します。APIはprivate/no-storeで、Cookie、HTTP status、error code、Retry-Afterを維持します。

## 検証結果と限界

- Nodeテスト141/141成功、失敗・スキップ0。構文確認30 JSファイル成功、両言語build成功。
- 日本語の既存売買・進捗テストに加え、英語の登録、検索、チャート、購入・売却、5ミッション、称号保存、ランキング、コメントを実HTTP/Cookieで検証。
- JA/EN切替前後の口座ID・ウォレット・履歴が一致。結果不明注文の再確認でも二重約定なし。日本語ユーザー名・コメント本文の維持とHTMLエスケープも検証。
- 国ヒントJP/US/GB/不明、保存済み手動言語、ストレージ拒否、locale通信失敗を隔離環境で検証。
- 320 / 390 / 768 / 1280pxで横幅崩れと操作を検証。英語紹介、チャレンジ、320pxランキング、FXチャートのスクリーンショットを確認。未捕捉ブラウザエラー0。
- 結果共有はnavigator.shareをスタブし、英語の文章・JPY・英語URLを検証。英語モードでの実スマホ共有シート成功はまだユーザー未報告。
- CI artifact `10933129082` / `mobile-ui-evidence` / SHA256 `61b040cb741a01569a48671b112d697a57de47ce22f34e5c4e8730ccc5b8f460`。短期保管のため長期記録は`docs/verification/v1.2-release.json`を参照。
- 本番検証はログイン不要のconfig、locale、認証拒否、日英各5ページ、manifest、内容ハッシュ付きbundle等が当該commitのbuildと一致することを確認するものです。既存ユーザーを使った本番売買や全ての国の実回線テストではありません。
- Vercel管理・保護Previewの直接コネクターはteam scope権限で拒否されました。権限変更や回避はせず、既存のGitHub連携deploymentと匿名本番smokeで配信を確認しました。

## 維持する既存機能

5タブ: 資産 / マーケット / チャレンジ / ランキング / アカウント。8銘柄のCrypto/FX、チャート、総合・銘柄別コメント、テキスト結果共有、15文字の名前上限、ランキングの売却回数表示を維持。

5つの初心者ミッションと6実績（+JPY1,000 / +JPY2,000 / 仮想通貨3売買 / FX3売買 / -JPY1,000の経験 / -JPY2,000の経験）。獲得済み称号はプロフィールで最大3つ。週間成績は現在の総資産から週初の総資産を引いた円差額で、不明価格は架空の0円にしません。損失実績は経験の記録であり損失を増やす目標ではありません。

1.1実装はPR #19 / `6913c7ae375a036320d48803ef1c1a6ce6408394`、直前mainは`78d1f79bb732d60da33b27c7dbb9bd251162c659`。2026-09-27にユーザーから1.1全機能の実スマホ確認成功が報告済みです。これは1.2の実機確認とは区別します。

## 次の方針・再開手順

1. このSTATUS、`docs/LOCALIZATION.md`、`docs/CHALLENGES.md`、`docs/verification/v1.2-release.json`と最新main/CIを確認して再開する。
2. ユーザーの実スマホで日本語 / English切替を確認し、結果が報告されたらJST時刻付きで追記する。VPN等による国誤判定は手動切替を案内する。
3. 今回の承認範囲は完了。次の候補は英語版の実画面を用いたPractice紹介Reel。別途承認なく動画の有料クレジットや外部契約を使わない。
4. 外部掲載・新規接続の設定作業は保留。公開ブランドはSOLUYRA、公開プロダクト紹介はPracticeのみ。他の未公開プロジェクト名を広告素材へ追加しない。
5. 広告・有料サービス・既存データ整理・権利契約が必要な新市場追加は別途確認する。

大きな変更ごとに、現在状況・確認したcommit/CI/deployment・検証限界・データ操作・次の方針・JST保存時刻をGitHubへ保存する。過去の証跡は`docs/verification/`に残す。
