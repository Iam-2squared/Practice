# Practice v0.2 — 最新状況

保存時刻: **2026-09-26 14:35:08 JST**
Repository: `Iam-2squared/Practice`。基点: `69e06a5eb61dd169de5244f75cdb9986fec867d7`。

## 完了した変更

- 初期資金10万円を維持し、購入・売却とも**100株単位**に変更。画面、API、DB制約の3層で端株を拒否。
- 最小100株、±100株、100／200／500株プリセット、買付可能数の100株切り下げ、1単元の必要資金表示。
- 緑を使わない**モノトーン＋ブルー**。濃紺の資産カードと、小画面では下から開く売買シート。
- 資産／取引／履歴・アカウントの3タブ、持ち株から直接売却、パスワードだけのログインを維持。
- パスワード再確認＋明示確認を要求する口座削除を追加。全セッション・履歴もDBで連鎖削除。

## 検証結果

- Node.js **88件 / 88 PASS**。構文チェック、ビルドPASS。
- 画面→実ローカルAPIの接続テスト: 登録→検索→300株購入→持ち株から100株売却→履歴→ログアウト→再ログイン→口座削除PASS。
- 1／99／101／150／199株の拒否、買付可能数の切り下げ、資金不足、保有超過、±100操作も検証。
- 320、360、375、390、430、768、844（横向き）、1280px。全3タブと売買シートの横はみ出しなし。ナビのタップ高さ44px以上。未捕捉JSエラーなし。
- 検証はPlaywright 1.57.0 + Chromium。agent-browserは未導入でオフラインキャッシュにもなく利用不可。管理ブラウザーのlocalhost直接ナビゲーションはERR_BLOCKED_BY_ADMINISTRATORのため、前版と同じ**隔離レンダラー＋実HTTP APIブリッジ**で検証。ブラウザーの制限は変更していません。
- **iOS Safari実機・公開URLでのCookie/CSP/REST検証は未実施**。表示テストで本番E2E済みとは扱いません。

## Supabase — 作成・スキーマ・実SQL検証済み

Project **Practice** / `mitowlxrsrhbtmehiyvh` / 東京。作成時の費用確認は月額0。
`practice_v02_cash_lots`適用。4テーブルRLS=true、anon SELECT=false、authenticated UPDATE=false、server SELECT=true。
3関数のSECURITY DEFINER=false、anon EXECUTE=false、server EXECUTE=true。
service_roleで売買、端株拒否、原価・損益、二重注文、改ざん拒否、削除連鎖を確認。fixtureはROLLBACK、実データは0件。
Security AdvisorはERROR/WARNなし、意図したserver-only設計によるRLS-policy未定義INFOが4件。
既存の別Supabaseプロジェクトは未変更。DBの準備完了とアプリの本番接続完了は別です。

## 未完了 — 外部接続が必要

1. **Vercel公開・本番環境変数**。接続結果はチーム0件、デプロイ機能は `-32602 Tool deploy_to_vercel not found`。公開URLは未発行。本番用Supabase秘密鍵・APP_SECRET・APP_ORIGINは未設定。
2. **Yahoo実データ取得・公開利用条件**。取得アダプターはあるがライブ確認と公開再配信条件の確認は未了。標準は明示的なDEMO。許諾・実データを確認できたと装わない。
3. **公開URLでの端末間ログイン・永続化・Cookie・CSP検証**と運用連絡先・バックアップ保持・濫用対策の確認。

## GitHub / 次の方針

元のv0.1 CI（run 36220044097）はapp/database両方SUCCESSを確認済み。
v0.2はこの保存内容をGitHubへ反映し、対象コミットのapp/database/モバイルUIのCIを確認する段階です。
最新のCI結果はGitHub Actionsの対象HEADで確認してください。過去のCI成功を新HEADの成功に流用しません。
接続復旧後は `docs/DEPLOY.md` に従い、作成済みDBを使って本番公開を完了する。DBを再作成したりデモ価格をYahoo価格として表示したりしない。

`.local/`、秘密値、テスト口座のパスワード・Cookie・状態は保存対象外です。
