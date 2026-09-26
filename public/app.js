const LOT_SIZE = 100;
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const yen = (minor, decimals = 0) => minor == null ? '—' : new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(minor/100);
const signed = value => value == null ? '—' : `${value >= 0 ? '+' : '−'}${yen(Math.abs(value),2)}`;
const tone = n => n < 0 ? 'negative' : 'positive';
const stamp = t => t ? new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(t) : '架空の固定価格';
const paths = {arrow:'M5 12h14m-5-5 5 5-5 5',back:'m15 6-6 6 6 6',chevron:'m9 5 7 7-7 7',close:'m6 6 12 12M6 18 18 6',refresh:'M20 7v5h-5M4 17v-5h5M6.5 6a7 7 0 0 1 11.7 1.5L20 12M4 12l1.8 4.5A7 7 0 0 0 17.5 18',search:'M16 16l5 5',wallet:'M4 7h16v14H4zM4 7V3h13v4M15 12h5v5h-5z',user:'M7 21v-3a5 5 0 0 1 10 0v3M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6zM8 12l3 3 5-6',chart:'M4 4v16h17M8 16v-5M13 16V7M18 16v-8',check:'m5 12 4 4L20 5',history:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',key:'M14 8a5 5 0 1 0-4 5L21 2M17 6l3 3'};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name === 'search' ? '<circle cx="10.5" cy="10.5" r="6.5"/>' : ''}<path d="${paths[name] || paths.chart}"/></svg>`;
const state = { tab:'assets', account:null, portfolio:null, config:null, search:[], history:[], ranking:[], offset:0, hasMore:false, filter:'all', stock:null, side:'buy', pending:null, busy:false, query:'', request:0 };
let toastTimer;
function toast(text) { $('#toast').textContent=text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4200); }
async function api(action, body, params = {}) {
 const query = new URLSearchParams({action,...params});
 const controller = new AbortController(); const timeout=setTimeout(()=>controller.abort(),30_000);
 try {
  const response=await fetch(`/api/index?${query}`,{method:body === undefined ? 'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body === undefined ? {} : {'Content-Type':'application/json','X-Practice-Request':'1'},...(body === undefined ? {} : {body:JSON.stringify(body)}),signal:controller.signal});
  let data; try { data=await response.json(); } catch { throw Object.assign(new Error('応答を確認できません。注文は同じ番号で再試行してください。'),{uncertain:true}); }
  if(!response.ok) throw Object.assign(new Error(data.error?.message || '処理に失敗しました。'),{code:data.error?.code,status:response.status,uncertain:response.status>=500});
  return data;
 } catch(error) { if(error.name==='AbortError' || error instanceof TypeError) throw Object.assign(new Error('通信を確認できません。同じ注文を再試行してください。'),{uncertain:true}); throw error; }
 finally { clearTimeout(timeout); }
}
function closeDialog() { if(!state.busy) { state.request++; $('#dialog').close(); } }
function showDialog(html) { $('#dialog').innerHTML=`<div class="dialog-content">${html}</div>`; if(!$('#dialog').open) $('#dialog').showModal(); }
const dialogHead = title => `<div class="dialog-header"><h2 id="dialog-title">${title}</h2><button class="close" data-action="close" aria-label="閉じる">${icon('close')}</button></div>`;
const currentProvider = () => state.account?.market || state.config?.provider || 'demo';
const wrongOrigin = () => /^https?:$/.test(location.protocol) && state.config?.publicOrigin && location.origin !== state.config.publicOrigin;
function originNotice() {
 return wrongOrigin() ? `<div class="notice error">このURLでは口座の作成・売買はできません。<a href="${esc(state.config.publicOrigin)}" rel="noreferrer">本番サイトを開く</a></div>` : '';
}
function environment() {
 const c=state.config;const provider=currentProvider();$('#environment').classList.toggle('real',provider==='yahoo');
 const label=provider==='demo'?'DEMO · 架空の固定価格で練習中（実際の株価ではありません）':c?.marketStatus==='enabled'?'Yahoo参考株価 · 遅延あり／リアルタイム保証なし':'実株価の配信は停止中 · 口座と履歴は保持されています';
 $('#environment').textContent=c?`${label}${c.storage==='local'?' · ローカル保存':''}`:'サーバーに接続できません';
}

const empty = (title,text,action,label,ico='wallet') => `<div class="card empty"><div class="empty-icon">${icon(ico)}</div><h3>${title}</h3><p>${text}</p>${action?`<button class="primary" data-action="${action}">${label}${icon('arrow')}</button>`:''}</div>`;
function savePending(value) {
 state.pending=value;
 try { const key=`practice.pending.${state.account.id}`; if(value) sessionStorage.setItem(key,JSON.stringify(value)); else sessionStorage.removeItem(key); } catch { /* In-memory retry remains possible in restricted browsers. */ }
}
function loadPending() {
 try { state.pending=JSON.parse(sessionStorage.getItem(`practice.pending.${state.account.id}`)||'null'); } catch { state.pending=null; }
}
function pendingHtml() { return state.pending ? '<div class="pending" role="alert">結果を確認できていない注文があります。新しい注文の前に確認してください。<button data-action="retry-order">同じ注文番号で結果を確認</button></div>' : ''; }
function render() {
 environment();
 document.querySelectorAll('[data-tab]').forEach(button=>{ if(button.dataset.tab===state.tab) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
 if(state.tab==='assets') renderAssets(); else if(state.tab==='trade') renderSearch(); else if(state.tab==='ranking') renderRanking(); else renderHistory();
}
function renderAssets() {
 const a=state.account; const p=state.portfolio; const s=a?.state; const total=a?(p?.totalMinor??null):10_000_000;
 const gain=total==null?null:total-10_000_000; const basis=s?.positions.reduce((n,x)=>n+x.costMinor,0)||0;
 const unrealized=p?.holdingsMinor==null ? (a?null:0) : p.holdingsMinor-basis;
 $('#main').innerHTML=`<div class="section-head"><div><p class="eyebrow">MY PORTFOLIO</p><h1>あなたの資産</h1></div><button class="icon-button" data-action="refresh" aria-label="資産を更新">${icon('refresh')}</button></div>
 ${originNotice()}${!state.config?.accountsAvailable?'<div class="notice">口座保存は接続準備中です。現在は画面のプレビューを表示しています。</div>':''}
 ${pendingHtml()}
 <section class="hero" aria-label="資産サマリー"><div class="hero-label">資産合計<span class="pill">${a?'現物のみ':'初期資金'}</span></div><div class="balance"><span class="currency">¥</span>${total==null?'—':new Intl.NumberFormat('ja-JP',{maximumFractionDigits:2}).format(total/100)}</div><div class="return"><span>${signed(gain)}</span><span class="return-caption">${gain==null?'評価額を取得できません':`${gain>=0?'+':''}${(gain/100000).toFixed(2)}% · 初期10万円比`}</span></div><dl class="hero-bottom"><div><dt>買付余力（現金）</dt><dd>${yen(s?.cashMinor??10_000_000,2)}</dd></div><div><dt>持ち株の評価額</dt><dd>${yen(a?p?.holdingsMinor:0,2)}</dd></div></dl></section>
 <dl class="small-grid"><div class="stat"><dt>評価損益</dt><dd class="${tone(unrealized)}">${signed(unrealized)}</dd></div><div class="stat"><dt>確定損益</dt><dd class="${tone(s?.realizedMinor||0)}">${signed(s?.realizedMinor||0)}</dd></div></dl>
 ${p&&!p.valuationComplete?'<div class="notice error">一部の株価を取得できません。資産合計は未算出です。保有数・現金は保存されています。</div>':''}
 <div class="row-head"><h2>持ち株<span class="count">${s?.positions.length||0}銘柄</span></h2><button class="link-button" data-action="to-trade">銘柄を探す ↗</button></div>
 ${s?.positions.length?`<div class="card">${s.positions.map(x=>holdingRow(x,p?.quotes[x.symbol])).join('')}</div>`:empty(a?'最初の100株から、はじめよう。':'10万円から、気軽にはじめよう。',a?'100株単位で、現物取引を練習。<br>持ち株はここに表示されます。':'メール登録も、入金も不要。<br>パスワードをひとつ作って、株の練習をはじめよう。',a?'to-trade':'register',a?'銘柄を探す':'練習をはじめる')}
 ${!a?'<p class="zero-note">すでに口座がある方は <button class="link-button" data-action="login">ログイン</button></p>':''}
 <div class="tip"><strong>まずは一単元。自分のペースで。</strong><br>100株単位のシンプルな練習モード。信用取引・空売りはありません。</div>`;
}
function holdingRow(p,q) {
 const value=q?q.priceMinor*p.shares:null; const gain=value==null?null:value-p.costMinor;
 return `<button class="stock-row" data-symbol="${esc(p.symbol)}" data-side="sell"><span class="stock-avatar">${esc(p.symbol.slice(0,4))}</span><span class="stock-info"><span class="stock-name">${esc(p.name)}</span><span class="stock-meta">${p.shares.toLocaleString()}株 · 平均 ${yen(p.costMinor/p.shares,2)}</span></span><span class="stock-value">${yen(value,2)}<small class="${tone(gain)}">${gain==null?'株価取得不可':signed(gain)}</small></span>${icon('chevron','chevron')}</button>`;
}
function renderSearch() {
 $('#main').innerHTML=`<div class="section-head"><div><p class="eyebrow">DISCOVER & TRADE</p><h1>銘柄を探す</h1></div><span class="pill">日本株・現物</span></div>
 ${pendingHtml()}<div class="search-box">${icon('search')}<label class="sr-only" for="search">銘柄名・コードで検索</label><input id="search" type="search" placeholder="銘柄名・コードで検索" autocomplete="off" value="${esc(state.query)}" maxlength="80"></div><p class="search-hint">例：トヨタ / 7203 / NTT</p>
 ${!state.account?empty('ログインして銘柄を探そう','口座を作ると、100株単位の仮想売買を練習できます。','register','口座を作る','search'):`<div class="row-head"><h2>${state.query?'検索結果':'銘柄一覧'}</h2><span class="muted"><small>${currentProvider()==='demo'?'デモ用20銘柄':'Yahoo検索'}</small></span></div><div id="search-results">${searchRows()}</div>`}
 <div class="intro">${icon('shield')}<div><strong>買えるのは、いま持っている資金の範囲だけ。</strong><small>100株単位。初期10万円では、1株1,000円以下の銘柄を購入できます。</small></div></div>`;
}
function searchRows() {
 return state.search.length?`<div class="card">${state.search.map(x=>`<button class="stock-row" data-symbol="${esc(x.symbol)}"><span class="stock-avatar">${esc(x.symbol.slice(0,4))}</span><span class="stock-info"><span class="stock-name">${esc(x.name)}</span><span class="stock-meta">${esc(x.symbol)} · ${esc(x.sector||'日本株')}</span></span>${icon('chevron','chevron')}</button>`).join('')}</div>`:'<div class="card empty"><h3>銘柄が見つかりませんでした</h3><p>別の銘柄名やコードで検索してください。</p></div>';
}
let searchTimer; let searchVersion=0;
async function searchStocks(query) {
 if(!state.account) return; const id=++searchVersion;
 try { const result=await api('search',undefined,{q:query}); if(id!==searchVersion)return; state.search=result.items; if(state.tab==='trade'&&$('#search-results'))$('#search-results').innerHTML=searchRows(); }
 catch(error){if(id===searchVersion&&$('#search-results'))$('#search-results').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;}
}
function renderRanking() {
 $('#main').innerHTML=`<div class='section-head'><div><p class='eyebrow'>TOTAL ASSET RANKING</p><h1>総資産ランキング</h1></div><button class='icon-button' data-action='refresh' aria-label='ランキングを更新'>${icon('refresh')}</button></div>
 ${!state.account?empty('ログインするとランキングを見られます','ユーザーネームと総資産だけを表示します。','login','ログイン','chart'):state.ranking.length?`<div class='card leaderboard'>${state.ranking.map(x=>`<div class='rank-row ${x.me?'me':''}'><span class='rank-number'>${x.rank??'—'}</span><span class='rank-name'>${esc(x.username)}${x.me?'<small>あなた</small>':''}</span><span class='rank-total'>${yen(x.totalMinor,0)}</span></div>`).join('')}</div>`:'<div class="card empty"><h3>ランキングを読み込んでいます</h3><p>総資産を現在の参考価格で評価します。</p></div>'}
 <p class='fineprint'>総資産＝現金＋保有株の現在の参考評価額。株価を取得できない口座は順位を表示しません。</p>`;
}
async function leaderboard() {
 if(!state.account){state.ranking=[];return;}
 const result=await api('leaderboard');state.ranking=result.items;if(state.tab==='ranking')render();
}
function renderHistory() {
 const rows=state.history.filter(t=>state.filter==='all'||t.side===state.filter);
 $('#main').innerHTML=`<div class="section-head"><div><p class="eyebrow">YOUR ACTIVITY</p><h1>取引の記録</h1></div><button class="icon-button" data-action="refresh" aria-label="履歴を更新">${icon('refresh')}</button></div>
 <button class="account-entry" data-action="account">${icon('user')}<span><strong>アカウント</strong><small>${state.account?`口座 ${esc(state.account.id.slice(0,8))} · パスワードでログイン`:'新しい口座を作る / ログイン'}</small></span>${icon('chevron','chevron')}</button>
 ${pendingHtml()}<div class="row-head"><h2>売買履歴</h2><span class="count">${state.history.length}件を表示</span></div><div class="filter" aria-label="履歴の絞り込み">${[['all','すべて'],['buy','購入'],['sell','売却']].map(([key,label])=>`<button data-filter="${key}" class="${state.filter===key?'active':''}" aria-pressed="${state.filter===key}">${label}</button>`).join('')}</div>
 ${rows.length?`<div class="card">${rows.map(t=>`<article class="history-row"><div class="history-top"><div class="history-main"><span class="side-pill ${t.side==='sell'?'sell':''}">${t.side==='buy'?'購入':'売却'}</span><strong>${esc(t.name)}</strong></div><span class="history-money">${yen(t.totalMinor,2)}</span></div><div class="history-bottom"><span>${t.quantity.toLocaleString()}株 × ${yen(t.priceMinor,2)}</span><time>${stamp(t.executedAt)}</time></div>${t.side==='sell'?`<div class="history-bottom"><span>確定損益</span><span class="${tone(t.realizedMinor)}">${signed(t.realizedMinor)}</span></div>`:''}<div class="history-bottom"><span>${t.source==='demo'?'DEMO・架空価格':`Yahoo参考価格 ${stamp(t.quoteAt)}`}</span><span>${esc(t.symbol)}</span></div></article>`).join('')}</div>`:empty('まだ取引の記録はありません','売買すると、銘柄・株数・価格がここに記録されます。',null,null,'history')}
 ${state.hasMore?'<button class="secondary full block-gap" data-action="more-history">次の50件を表示</button>':''}<p class="fineprint">時刻は日本時間（JST）。表示中の履歴が対象の絞り込みです。初期入金10万円は売買履歴に含みません。</p>`;
}
async function refreshPortfolio() {
 if(!state.account)return;
 const id=state.account.id;const result=await api('portfolio');if(state.account?.id!==id||result.account.state.version<state.account.state.version)return;state.portfolio=result;state.account=result.account;if(state.tab==='assets')render();
}
async function history(more=false) {
 if(!state.account)return;
 const id=state.account.id;const result=await api('history',undefined,{offset:String(more?state.history.length:0)});if(state.account?.id!==id)return;
 state.history=more?[...state.history,...result.items]:result.items;state.hasMore=result.hasMore;if(state.tab==='history')render();
}
async function changeTab(tab) {
 state.tab=tab;render();
 try {if(tab==='assets')await refreshPortfolio();if(tab==='trade')await searchStocks(state.query);if(tab==='ranking')await leaderboard();if(tab==='history')await history();}catch(error){toast(error.message);}
}
function auth(mode='register') {
 const registering=mode==='register';
 const blocked=!state.config?.accountsAvailable||wrongOrigin()||(registering&&['permission-required','invalid-provider'].includes(state.config?.marketStatus));
 showDialog(`${dialogHead(registering?'練習用の口座を作る':'おかえりなさい')}<p class="subtext">メールアドレス不要。パスワードだけで入れます。</p>
 ${originNotice()}${!state.config?.accountsAvailable?'<div class="notice error">口座保存の接続準備中です。管理者の設定後に利用できます。</div>':''}
 ${registering&&['permission-required','invalid-provider'].includes(state.config?.marketStatus)?'<div class="notice error">実株価の配信設定・利用許諾が未確認のため、新しい口座の作成は停止中です。既存のデモ口座にはログインできます。</div>':''}
 <form id="auth-form" data-mode="${mode}">${registering?'<label class="field"><span>ユーザーネーム</span><input name="username" type="text" autocomplete="nickname" minlength="2" maxlength="20" required placeholder="2〜20文字"></label>':''}<label class="field"><span>パスワード</span><input name="password" id="password" type="password" autocomplete="${registering?'new-password':'current-password'}" minlength="20" maxlength="128" required placeholder="20文字以上の、ほかで使っていないもの"></label>
 <div class="password-actions">${registering?'<button type="button" data-action="generate">安全なパスワードを自動生成</button>':'<span></span>'}<button type="button" data-action="show-password">表示する</button></div>
 ${registering?'<label class="field"><span>もう一度入力</span><input name="confirmation" type="password" autocomplete="new-password" minlength="20" maxlength="128" required></label><label class="check"><input type="checkbox" name="saved" required><span>パスワードを保存しました。忘れた場合は復旧できず、知っている人はこの口座に入れることを理解しました。</span></label>':''}
 <div id="form-error" role="alert"></div><button class="primary full" type="submit" ${blocked?'disabled':''}>${registering?'10万円で練習をはじめる':'ログイン'}</button></form>
 <p class="fineprint">現実のお金は使いません。他サービスのパスワードは使わないでください。${state.config?.storage==='local'?'現在はこの開発サーバー内だけに保存されます。':''}</p><p class="dialog-foot">${registering?'すでに口座がありますか？':'はじめてですか？'} <button data-action="${registering?'login':'register'}">${registering?'ログイン':'口座を作る'}</button></p>`);
 setTimeout(()=>$('#password')?.focus(),50);
}
function accountDialog() {
 if(!state.account)return auth('login'); const a=state.account;
 showDialog(`${dialogHead('アカウント')}<span class="pill">${currentProvider()==='demo'?'デモ練習口座':'日本株 練習口座'}</span><form id="username-form" class="username-form"><label class="field"><span>ユーザーネーム</span><input name="username" type="text" minlength="2" maxlength="20" required value="${esc(a.username)}"></label><div id="username-error" role="alert"></div><button class="primary full" type="submit">ユーザーネームを保存</button></form><dl class="details"><div><dt>口座ID</dt><dd>${esc(a.id.slice(0,8))}</dd></div><div><dt>初期資金</dt><dd>¥100,000</dd></div><div><dt>保存先</dt><dd>${state.config.storage==='local'?'ローカル開発サーバー':'クラウド（専用DB）'}</dd></div><div><dt>ログイン方法</dt><dd>パスワードのみ</dd></div></dl><div class="notice">パスワードを忘れた場合は復旧できません。新しい端末でも、同じサイトに同じパスワードでログインしてください。</div><button class="secondary full" data-action="logout">ログアウト</button><button class="link-button account-delete" data-action="delete-account">口座と履歴を削除</button><p class="fineprint">仮想売買専用。氏名・メール・証券口座・クレジットカード情報は収集しません。サーバーにはパスワードの検証用ハッシュ、口座残高、保有株、売買履歴、ログインセッションを保存します。</p>`);
}
function deleteAccountDialog() {
 if(state.pending){toast('未確認の注文結果を確認してから削除してください。');return;}
 showDialog(`${dialogHead('口座を削除')}<div class="notice error">資産・持ち株・売買履歴を削除し、すべての端末をログアウトします。取り消しはできません。</div><form id="delete-form"><label class="field"><span>本人確認のパスワード</span><input name="password" type="password" autocomplete="current-password" minlength="20" maxlength="128" required></label><label class="check"><input type="checkbox" required><span>口座と履歴を削除し、元に戻せないことを確認しました。</span></label><div id="delete-error" role="alert"></div><button class="danger-button full" type="submit">口座を完全に削除する</button></form>`);
}
async function deleteAccount(form) {
 if(state.busy)return;state.busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;
 try {
  await api('delete-account',{password:String(new FormData(form).get('password')||''),confirm:'DELETE'});
  savePending(null);form.reset();state.account=null;state.portfolio=null;state.history=[];state.search=[];state.query='';state.tab='assets';state.busy=false;closeDialog();render();toast('口座と履歴を削除しました。');
 } catch(error){state.busy=false;$('#delete-error').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;button.disabled=false;}
}
async function openStock(symbol,side='buy') {
 if(wrongOrigin()){showDialog(`${dialogHead('本番サイトを開いてください')}${originNotice()}`);return;}
 if(!state.account)return auth('login'); const id=++state.request;state.side=side;state.stock=null;
 showDialog(`${dialogHead('銘柄情報')}<div class="loading">参考価格を確認しています…</div>`);
 try { const result=await api('quote',undefined,{symbol});if(id!==state.request)return;state.stock=result;renderStock(); }
 catch(error){if(id===state.request)showDialog(`${dialogHead('株価を取得できません')}<div class="notice error">${esc(error.message)}</div><p class="fineprint">価格が確認できるまで注文はできません。</p>`);}
}
function renderStock(quantity=LOT_SIZE) {
 const {quote:q}=state.stock;const held=state.account.state.positions.find(p=>p.symbol===q.symbol)?.shares||0;
 showDialog(`${dialogHead(esc(q.name))}<span class="muted"><small>${esc(q.symbol)} · 現物 / 100株単位</small></span><div class="quote-price">${yen(q.priceMinor,2)}</div><p class="quote-meta">${q.source==='demo'?'DEMO · 実際の株価ではない架空の固定価格':`Yahoo参考価格 · ${stamp(q.quoteAt)} JST · ${q.delayMinutes==null?'遅延時間不明':`${q.delayMinutes}分遅延`}`}</p>
 ${q.source==='yahoo'&&q.referenceOnly?`<div class="notice">${q.sessionState==='outside-regular'?'取引時間外の参考値':'取引時間情報を確認できない参考値'}での練習です。上の価格時刻を確認してください。</div>`:''}
 <div class="trade-tabs" aria-label="売買区分"><button data-side-toggle="buy" class="${state.side==='buy'?'active':''}" aria-pressed="${state.side==='buy'}">買う</button><button data-side-toggle="sell" class="sell ${state.side==='sell'?'active':''}" aria-pressed="${state.side==='sell'}">売る</button></div>
 <form id="trade-form"><label class="field"><span>株数 <small class="muted">100株 = 1単元</small></span><div class="quantity-input"><button type="button" data-step="-100" aria-label="100株減らす">−</button><input name="quantity" id="quantity" type="number" inputmode="numeric" min="100" max="1000000" step="100" value="${quantity}" required aria-label="注文株数"><button type="button" data-step="100" aria-label="100株増やす">+</button><span>株</span></div></label><div class="quantity-presets"><button type="button" data-quantity="100">100株</button><button type="button" data-quantity="200">200株</button><button type="button" data-quantity="500">500株</button><button type="button" data-quantity="max">${state.side==='buy'?'買付可能数':'売却可能数'}</button></div>
 <dl class="details"><div><dt>1単元（100株）の金額</dt><dd>${yen(q.priceMinor*LOT_SIZE,2)}</dd></div><div><dt>買付余力</dt><dd>${yen(state.account.state.cashMinor,2)}</dd></div><div><dt>保有数</dt><dd>${held.toLocaleString()}株</dd></div><div><dt>概算${state.side==='buy'?'購入':'売却'}金額</dt><dd id="estimate" class="trade-estimate"></dd></div></dl><div id="trade-error" role="alert"></div><button class="${state.side==='buy'?'primary':'danger-button'} full" id="order-next" type="submit">${state.side==='buy'?'購入':'売却'}内容を確認</button></form>
 <button class="link-button" data-action="refresh-quote">株価を更新</button><p class="fineprint">参考価格で即時に仮想成立します。営業日・営業時間の判定による注文制限はありません。手数料・税金・板・株式分割・配当は再現しません。</p>`);updateEstimate();
}
function updateEstimate() {
 if(!$('#quantity')||!state.stock)return;const n=Number($('#quantity').value);const q=state.stock.quote;
 const valid=Number.isSafeInteger(n)&&n>=LOT_SIZE&&n<=1_000_000&&n%LOT_SIZE===0;const cost=valid?q.priceMinor*n:null;
 $('#estimate').textContent=yen(cost,2);const held=state.account.state.positions.find(p=>p.symbol===q.symbol)?.shares||0;
 const error=state.pending?'前の注文の結果を確認してから、新しい注文を行ってください。':!valid?'100〜1,000,000株の範囲で、100株単位で入力してください。':state.side==='buy'&&cost>state.account.state.cashMinor?`買付余力が不足しています。1単元（100株）には${yen(q.priceMinor*LOT_SIZE,2)}が必要です。`:state.side==='sell'&&n>held?'保有株数を超えて売ることはできません。':'';
 $('#trade-error').innerHTML=error?`<div class="notice error">${error}</div>`:'';$('#order-next').disabled=!!error;
}
function confirmOrder(quantity) {
 const {quote:q,quoteToken}=state.stock;const side=state.side;
 const payload={symbol:q.symbol,side,quantity,quoteToken,requestId:crypto.randomUUID()};
 showDialog(`${dialogHead('仮想売買を確認')}<div class="confirm-icon">${icon('check')}</div><h3>${esc(q.name)}を${quantity.toLocaleString()}株${side==='buy'?'購入':'売却'}</h3><dl class="details"><div><dt>参考価格</dt><dd>${yen(q.priceMinor,2)}</dd></div><div><dt>${side==='buy'?'購入':'売却'}金額</dt><dd class="trade-estimate">${yen(q.priceMinor*quantity,2)}</dd></div><div><dt>成立後の現金</dt><dd>${yen(state.account.state.cashMinor+(side==='buy'?-1:1)*q.priceMinor*quantity,2)}</dd></div></dl><div class="notice info">実際のお金や株式は動きません。${q.source==='demo'?'現在は架空価格のデモです。':''}</div><div id="confirm-error" role="alert"></div><div class="actions"><button class="secondary" data-action="back-order">戻る</button><button class="${side==='buy'?'primary':'danger-button'}" id="submit-order">仮想${side==='buy'?'購入':'売却'}する</button></div>`);
 $('#submit-order').addEventListener('click',()=>submitOrder(payload),{once:true});
}
async function submitOrder(payload=state.pending) {
 if(state.busy||!payload)return;state.busy=true;savePending(payload);
 if($('#submit-order')){$('#submit-order').disabled=true;$('#submit-order').textContent='処理中…';}
 try {
  const result=await api('trade',payload);state.account=result.account;savePending(null);
  state.busy=false;closeDialog();state.portfolio=null;render();toast(`${result.duplicate?'記録済みの注文を確認しました':'仮想'+(result.trade.side==='buy'?'購入':'売却')+'が完了しました'}。`);
  await Promise.allSettled([refreshPortfolio(),history()]);
 } catch(error) {
  state.busy=false;if(!error.uncertain)savePending(null);
  showDialog(`${dialogHead(error.uncertain?'注文結果の確認が必要です':'注文は成立していません')}<div class="notice error">${esc(error.message)}</div>${error.uncertain?'<p class="fineprint">同じ注文番号で再送するため、すでに成立していても二重に売買されません。</p><button class="primary full block-gap" data-action="retry-order">同じ注文で再試行</button>':'<button class="secondary full" data-action="close">閉じる</button>'}`);render();
 }
}
async function submitAuth(form) {
 if(wrongOrigin()||!state.config?.accountsAvailable)return;
 if(state.busy)return;const data=new FormData(form);const password=String(data.get('password')||'');
 if(form.dataset.mode==='register'&&password!==data.get('confirmation')){$('#form-error').innerHTML='<div class="notice error">パスワードが一致しません。</div>';return;}
 state.busy=true;form.querySelector('[type=submit]').disabled=true;$('#form-error').textContent='';
 try {
  const username=form.dataset.mode==='register'?String(data.get('username')||''):undefined;
  const result=await api(form.dataset.mode,form.dataset.mode==='register'?{password,username}:{password});state.account=result.account;loadPending();state.busy=false;
  form.reset();closeDialog();render();await refreshPortfolio();toast('練習用の口座にログインしました。');
 } catch(error) {state.busy=false;if($('#form-error')){$('#form-error').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;form.querySelector('[type=submit]').disabled=false;}else toast(error.message);}
}
async function submitUsername(form){
 if(state.busy)return;state.busy=true;const button=form.querySelector('[type=submit]');button.disabled=true;$('#username-error').textContent='';
 try{const result=await api('username',{username:String(new FormData(form).get('username')||'')});state.account=result.account;state.busy=false;closeDialog();render();toast('ユーザーネームを変更しました。');}
 catch(error){state.busy=false;button.disabled=false;$('#username-error').innerHTML=`<div class="notice error">${esc(error.message)}</div>`;}
}
document.addEventListener('submit',event=>{if(event.target.id==='delete-form'){event.preventDefault();deleteAccount(event.target);}if(event.target.id==='auth-form'){event.preventDefault();submitAuth(event.target);}if(event.target.id==='username-form'){event.preventDefault();submitUsername(event.target);}if(event.target.id==='trade-form'){event.preventDefault();updateEstimate();if(!$('#order-next').disabled)confirmOrder(Number($('#quantity').value));}});
document.addEventListener('input',event=>{if(event.target.id==='quantity')updateEstimate();if(event.target.id==='search'){state.query=event.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchStocks(state.query),300);}});
document.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b||b.disabled||state.busy)return;
 if(b.dataset.tab){changeTab(b.dataset.tab);return;}
 if(b.dataset.symbol){openStock(b.dataset.symbol,b.dataset.side||'buy');return;}
 if(b.dataset.filter){state.filter=b.dataset.filter;renderHistory();return;}
 if(b.dataset.sideToggle){state.side=b.dataset.sideToggle;renderStock();return;}
 if(b.dataset.step){$('#quantity').value=String(Math.min(1_000_000,Math.max(LOT_SIZE,(Math.floor(Number($('#quantity').value)/LOT_SIZE)||0)*LOT_SIZE+Number(b.dataset.step))));updateEstimate();return;}
 if(b.dataset.quantity){const q=state.stock.quote;$('#quantity').value=b.dataset.quantity==='max'?String(Math.min(1_000_000,Math.floor((state.side==='buy'?state.account.state.cashMinor/q.priceMinor:state.account.state.positions.find(p=>p.symbol===q.symbol)?.shares||0)/LOT_SIZE)*LOT_SIZE)):b.dataset.quantity;updateEstimate();return;}
 try {
 switch(b.dataset.action){
  case 'close':closeDialog();break;
  case 'register':auth('register');break;
  case 'login':auth('login');break;
  case 'account':accountDialog();break;
  case 'delete-account':deleteAccountDialog();break;
  case 'to-trade':if(state.account)changeTab('trade');else auth('register');break;
  case 'refresh':if(state.account){b.disabled=true;if(state.tab==='assets')await refreshPortfolio();else if(state.tab==='ranking')await leaderboard();else await history();toast('更新しました。');}else toast('口座を作ると資産を保存できます。');break;
  case 'generate':{const bytes=crypto.getRandomValues(new Uint8Array(32));const password=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');$('#password').value=password;$('#password').type='text';$('[name=confirmation]').value=password;toast('表示されたパスワードを安全な場所に保存してください。');break;}
  case 'show-password':$('#password').type=$('#password').type==='password'?'text':'password';b.textContent=$('#password').type==='password'?'表示する':'隠す';break;
  case 'logout':await api('logout',{});state.account=null;state.portfolio=null;state.pending=null;state.history=[];state.ranking=[];state.search=[];state.request++;closeDialog();render();toast('ログアウトしました。');break;
  case 'refresh-quote':openStock(state.stock.quote.symbol,state.side);break;
  case 'back-order':renderStock();break;
  case 'retry-order':await submitOrder();break;
  case 'more-history':b.disabled=true;await history(true);break;
 }
 }catch(error){toast(error.message);}finally{b.disabled=false;}
});
$('#dialog').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();else state.request++;});
async function boot(){
 try {state.config=await api('config');environment();render();if(state.config.accountsAvailable){const {account}=await api('session');state.account=account;if(account){loadPending();render();await refreshPortfolio();}}}
 catch(error){environment();render();toast(error.message);}
}
boot();
// Refresh only while visible, without disturbing an open order dialog or unsent form.
setInterval(()=>{if(document.visibilityState==='visible'&&state.account&&state.tab==='assets'&&!$('#dialog').open&&!state.busy)refreshPortfolio().catch(()=>{});},60_000);
