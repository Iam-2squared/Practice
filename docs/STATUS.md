# Practice v0.2.1 — 最新状況

保存時刻: **2026-09-26 17:39:40 JST**
作業基点: `ecfc3333167be226be98abf8c03699a194d959fe`。公開URL: https://practice-ashy-delta.vercel.app

## 今回の変更

- Supabase URL末尾の `/` と前後空白を安全に正規化。異なるホスト・パス・認証情報入りURLは拒否。設定の不備は値を漏らさず変数名だけで確認可能。
- Deployment個別URLで口座操作しようとすると正規の本番サイトへのリンクを表示。Origin/CSRFチェックは維持。
- 既存デモ口座は、将来サイトを実株価へ切り替えてもデモとして継続。現金・履歴の書換えや削除はしない。実株価を止めても履歴と現金は閲覧可能。
- Yahoo取得を堅牢化: 401/403/429の区別と待機、同時取得の集約、時刻・通貨・銘柄検証、キャッシュ利用時の鮮度再確認。実データ失敗時のデモ価格へのすり替えなし。
- 注文価格の署名鍵を口座検索鍵から分離。会話中に提示されたAPP_SECRET単独では価格署名を偽造できない構成へ。既存ログインは変更なし。APP_SECRET自体の安全なローテーションは別途移行設計が必要。
- mainのCIに認証不要・読取専用の公開config確認を追加。これは実DB取引テストとは区別する。

## 検証

- ローカルNodeテスト **132/132 PASS**、構文・ビルドPASS。デモ口座保持、権限未確認時の作成拒否、署名の鍵分離も含む。Yahoo部分は合成fixtureでのテスト。
- 管理ブラウザーのlocalhost直接アクセスは `ERR_BLOCKED_BY_ADMINISTRATOR`。制限解除や迂回はしていない。通常HTTPのブラウザーテストはGitHub CIで実施予定。
- GitHub CIおよび新バージョンの公開反映はこの記録時点では未確認。
- Supabase本番を読取専用で再確認: デモ口座1、取引2、残高10万円、保有0。今回のDB書込・削除・スキーマ変更は0。
- Vercel管理ツールはチームスコープ403のまま。秘密値を取得した／書き換えたとは扱わない。

## 残る必須事項

**Yahoo実株価の公開配信は未完了。** 公式案内に再配布不可の記載を確認。公開アプリへの配信許諾を得たとは扱わず、承認フラグも変更しない。公開のまま実株価を使うには、用途を満たす配信権限の確認が必要。有料契約はしていない。出典と切替条件は `docs/MARKET_DATA.md`。

既存の運用実績: ユーザーが本番で口座作成→100株購入→100株売却→履歴→再ログインを実行、DB保存を確認済み。これはデモ価格での実績であり、Yahoo・別端末実機の実績に読み替えない。

---

## 過去の記録（v0.2作成時点）

# Practice v0.2 — 最新状況

保存時刻: **2026-09-26 14:53:41 JST**
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
- GitHub CIでは別途、通常のHTTPページをChromiumで直接開いて検証。Cookie/CSPヘッダー、HttpOnly・SameSite属性、リロード後のログイン維持、購入・売却・削除、8画面幅の表示検証に成功。ブラウザーのfetchやCookieを差し替えていません。
- **iOS Safari実機・公開Vercel HTTPS/Supabase REST接続の検証は未実施**。ローカルHTTPの成功を本番E2E済みとは扱いません。

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

検証済み実装コミット: `855d48d1662f35b13dbba5ba51e18f38b039577d`。
検証済みソースtree: `9fbcdf92d23ed704013ef9bfdf5d8985164c3ab3`。
GitHub CI run **36221996836**: **app / database / mobile-ui の3ジョブすべてSUCCESS**。Nodeテスト88件、構文・ビルド、SQL検証、通常HTTPでのモバイルUI検証が完了。
この記録更新はドキュメントのみで、上記の検証済みアプリ・テスト・DBコードから変更していません。
結果一覧は `docs/verification/ci-v0.2.json`。CI URL: https://github.com/Iam-2squared/Practice/actions/runs/36221996836
接続復旧後は `docs/DEPLOY.md` に従い、作成済みDBを使って本番公開を完了する。DBを再作成したりデモ価格をYahoo価格として表示したりしない。

`.local/`、秘密値、テスト口座のパスワード・Cookie・状態は保存対象外です。
