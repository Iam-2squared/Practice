"""One-time fail-fast integration. Development branch only; never used at runtime."""
from pathlib import Path
import re,json
ROOT=Path(__file__).resolve().parents[1]
def replace(s,old,new,count=1):
 assert s.count(old)==count,(old[:110],s.count(old),count)
 return s.replace(old,new)
def edit(path,fn):
 p=ROOT/path;p.write_text(fn(p.read_text()))
def server(s):
 s="import { createProgression } from './progression.mjs';\n"+s
 s=replace(s,"  const response=","  const progression=createProgression({store,market,clock});\n  const response=")
 s=s.replace("version:'0.5.0'","version:'1.1.0'")
 marker="      if(request.method==='POST'&&action==='username')"
 s=replace(s,marker,"      if(request.method==='GET'&&action==='progress')return response(await progression.profile(account.id));\n      if(request.method==='POST'&&action==='profile-badges'){const b=await readBody(request);return response(await progression.setBadges(account.id,b.badges));}\n"+marker)
 old="      if(request.method==='GET'&&action==='price-history')return response({chart:await market.history(u.searchParams.get('symbol'),u.searchParams.get('period'))});"
 s=replace(s,old,"      if(request.method==='GET'&&action==='price-history'){const chart=await market.history(u.searchParams.get('symbol'),u.searchParams.get('period'));if(chart?.points?.length)try{await progression.observe(account,null,'chart');}catch{console.error('practice_progress_observation_failed');}return response({chart});}")
 old="      if(request.method==='GET'&&action==='portfolio')return response((await values([account]))[0]);"
 s=replace(s,old,"      if(request.method==='GET'&&action==='portfolio'){const result=(await values([account]))[0];try{await progression.observe(account,result.totalMinor,'portfolio');}catch{console.error('practice_progress_observation_failed');}return response(result);}")
 start=s.index("      if(request.method==='GET'&&action==='leaderboard'){");end=s.index("      if(request.method==='GET'&&action==='history')",start)
 s=s[:start]+"      if(request.method==='GET'&&action==='leaderboard'){await limited('leaderboard-global',60);return response(await progression.rankings(account.id,u.searchParams.get('mode')||'total'));}\n"+s[end:]
 return s
edit('lib/app.mjs',server)
def store(s):
 return replace(s,'this.data.comments=this.data.comments.filter(x=>x.accountId!==id);delete this.data.accounts[id];','this.data.comments=this.data.comments.filter(x=>x.accountId!==id);if(this.data.progress)delete this.data.progress[id];delete this.data.accounts[id];')
edit('lib/store.mjs',store)
def app(s):
 s="import { createProgressUi } from './progress-ui.js?v=1.1.0';\n"+s
 s=replace(s,"if(b.dataset.tab===state.tab)","if(b.dataset.tab===(['crypto','fx'].includes(state.tab)?'market':state.tab))")
 s=replace(s,"else if(state.tab==='ranking')renderRanking();else renderHistory();","else if(state.tab==='ranking')renderRanking();else if(state.tab==='challenges')progressUi.renderChallenges();else renderHistory();")
 s=replace(s,"${section(title,type==='crypto'?'CRYPTO MARKET':'FOREIGN EXCHANGE')}","${section('マーケット','MARKETS')}<div class=\"view-switch market-switch\" aria-label=\"市場の種類\"><button type=\"button\" data-market=\"crypto\" class=\"${type==='crypto'?'active':''}\" aria-pressed=\"${type==='crypto'}\">仮想通貨</button><button type=\"button\" data-market=\"fx\" class=\"${type==='fx'?'active':''}\" aria-pressed=\"${type==='fx'}\">FX</button></div>")
 s=s.replace('下の「仮想通貨」または「FX」から練習できます。','下の「マーケット」から仮想通貨・FXを選べます。')
 start=s.index('function renderRanking(){');end=s.index('async function refreshPortfolio()',start)
 s=s[:start]+'function renderRanking(){progressUi.renderRanking();}\n'+s[end:]
 start=s.index('async function leaderboard(){');end=s.index('async function refresh(){',start)
 s=s[:start]+'async function leaderboard(){return progressUi.leaderboard();}\n'+s[end:]
 s=replace(s,"else if(state.tab==='ranking')await leaderboard();else await searchAssets();","else if(state.tab==='ranking')await leaderboard();else if(state.tab==='challenges')await progressUi.refreshChallenges();else await searchAssets();")
 s=replace(s,"async function changeTab(tab){if(!['assets','crypto','fx','ranking','history'].includes(tab))return;","async function changeTab(tab){if(tab==='market')tab=state.marketType||'crypto';if(!['assets','crypto','fx','challenges','ranking','history'].includes(tab))return;if(['crypto','fx'].includes(tab))state.marketType=tab;")
 s=replace(s,"function clearSession(){state.epoch++;","function clearSession(){progressUi.reset();state.epoch++;")
 s=replace(s,"${section('履歴・アカウント','YOUR ACTIVITY')}","${section('アカウント','YOUR PROFILE')}<button class=\"community-entry\" data-action=\"profile\"><span><strong>プロフィール・称号</strong><small>獲得した実績を3つまで表示</small></span></button>")
 s=replace(s,"${head('アカウント')}<form id=\"username-form\">","${head('アカウント')}<button class=\"community-entry\" data-action=\"profile\"><span><strong>プロフィール・称号を設定</strong><small>ランキングに表示する実績を選ぶ</small></span></button><form id=\"username-form\">")
 s=replace(s,"document.addEventListener('submit',e=>{if(e.target.id==='comment-form')","document.addEventListener('submit',e=>{if(progressUi.onSubmit(e.target)){e.preventDefault();return;}if(e.target.id==='comment-form')")
 s=replace(s,"document.addEventListener('input',e=>{if(e.target.id==='quantity')","document.addEventListener('input',e=>{progressUi.onInput(e.target);if(e.target.id==='quantity')")
 s=replace(s,"if(!b||b.disabled||state.busy)return;if(b.dataset.tab)","if(!b||b.disabled||state.busy)return;if(progressUi.onClick(b))return;if(b.dataset.market)return changeTab(b.dataset.market);if(b.dataset.tab)")
 s=replace(s,"const title=roomNames[room]||'コメント';showDialog(","const req=++state.request,epoch=state.epoch,title=roomNames[room]||'コメント';showDialog(")
 s=replace(s,"if(!$('#dialog').open)return;showDialog(`${head(title)}","if(!$('#dialog').open||req!==state.request||epoch!==state.epoch)return;showDialog(`${head(title)}")
 s=replace(s,"}catch(e){showDialog(`${head(title)}","}catch(e){if(req!==state.request||epoch!==state.epoch||!$('#dialog').open)return;showDialog(`${head(title)}")
 s=replace(s,'boot();\nsetInterval(',"const progressUi=createProgressUi({state,$,esc,yen,signed,stamp,head,section,guest,api,render,showDialog,closeDialog,toast,changeTab,openAsset});\nboot();\nsetInterval(")
 return s
edit('public/app.js',app)
def html(s):
 crypto=re.search(r'    <button type="button" data-tab="crypto"[\s\S]*?</button>',s).group()
 fx=re.search(r'    <button type="button" data-tab="fx"[\s\S]*?</button>',s).group()
 market=crypto.replace('data-tab="crypto"','data-tab="market"').replace('<span>仮想通貨</span>','<span>マーケット</span>')
 challenge='    <button type="button" data-tab="challenges"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 21V3m0 1h12l-2 4 2 4H6"/></svg><span>チャレンジ</span></button>'
 s=replace(s,crypto,market);s=replace(s,fx,challenge)
 s=s.replace('aria-label="履歴・仮想口座"','aria-label="アカウント"').replace('<span>履歴・仮想口座</span>','<span>アカウント</span>')
 s=re.sub(r'/app\.js\?v=[^"\s]+','/app.js?v=1.1.0',s);s=re.sub(r'/style\.css\?v=[^"\s]+','/style.css?v=1.1.0',s)
 return s.replace('</head>','<link rel="stylesheet" href="/progress.css?v=1.1.0"></head>')
edit('public/app.html',html)
def browser(s):
 s=replace(s,"ROOT=Path(__file__).resolve().parents[1]","def open_market(page,kind):\n    page.locator('[data-tab=market]').click()\n    page.locator('[data-market='+kind+']').click()\n\nROOT=Path(__file__).resolve().parents[1]")
 s=s.replace("page.locator('[data-tab=crypto]').click()","open_market(page,'crypto')").replace("page.locator('[data-tab=fx]').click()","open_market(page,'fx')")
 s=s.replace("['資産','仮想通貨','FX','ランキング','履歴・仮想口座']","['資産','マーケット','チャレンジ','ランキング','アカウント']")
 s=s.replace("['assets','crypto','fx','ranking','history']","['assets','market','challenges','ranking','history']")
 s=s.replace("(ROOT/'public/app.js').read_text(),type='module'","(ROOT/'public/progress-ui.js').read_text().replace('export function createProgressUi','function createProgressUi')+'\\n'+(ROOT/'public/app.js').read_text().replace(\"import { createProgressUi } from './progress-ui.js?v=1.1.0';\",''),type='module'")
 return s
edit('tests/browser_smoke.py',browser)
edit('tests/ui-server.mjs',lambda s:replace(s,"'/app.js','/style.css'","'/app.js','/progress-ui.js','/progress.css','/style.css'"))
edit('tests/app.test.mjs',lambda s:replace(s,"['me','rank','sellCount','totalMinor','username']","['badges','baselineAt','baselineKind','me','rank','sellCount','totalMinor','username','weeklyChangeMinor']"))
for path in ['package.json','package-lock.json']:
 p=ROOT/path;data=json.loads(p.read_text());data['version']='1.1.0'
 if 'packages' in data and '' in data['packages']:data['packages']['']['version']='1.1.0'
 p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Progression source integration complete.')
