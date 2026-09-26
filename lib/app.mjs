import { AppError,invariant,executeTrade,validateOrder,validateState,amountMinor,QUANTITY_SCALE } from './domain.mjs';
import { assertFresh } from './market.mjs';
import { passwordText,passwordHash,passwordMatches,hmac,digest,randomToken,orderFingerprint,signQuote,verifyQuote,sessionCookie,readSession,checkMutation,readBody,SESSION_SECONDS } from './security.mjs';
const dummy={salt:'0'.repeat(32),hash:'0'.repeat(128)};
const publicTrade=t=>{const {fingerprint,...safe}=t;return safe;};
function usernameText(v){invariant(typeof v==='string','USERNAME','ユーザーネームを入力してください。');const name=v.normalize('NFKC').trim();invariant([...name].length>=2&&[...name].length<=20&&!/[<>\p{Cc}\p{Cf}]/u.test(name),'USERNAME','ユーザーネームは2〜20文字で入力してください。');return name;}
export function createApp({store=null,market,secret,quoteSecret=secret,origin,secure=true,storageName='supabase',clock=Date.now,setupIssues=[]}) {
  const response=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  async function limited(key,n,window=60_000){invariant(await store.rate(hmac(secret,`rate:${key}`),n,window,clock()),'RATE_LIMIT','操作が続いています。少し時間をおいてください。',429);}
  async function values(accounts){const quotes={},errors=new Set();const symbols=[...new Set(accounts.flatMap(a=>{validateState(a.state);return a.state.positions.map(p=>p.symbol);} ))];await Promise.all(symbols.map(async s=>{try{quotes[s]=await market.quote(s);}catch{errors.add(s);}}));return accounts.map(a=>{const unavailable=a.state.positions.filter(p=>errors.has(p.symbol)).map(p=>p.symbol);const holdings=unavailable.length?null:a.state.positions.reduce((n,p)=>n+amountMinor(quotes[p.symbol].priceMinor,p.quantity),0);return {account:a,quotes,valuationComplete:!unavailable.length,unavailableSymbols:unavailable,holdingsMinor:holdings,totalMinor:holdings===null?null:a.state.cashMinor+holdings,valuedAt:clock()};});}
  return async function handle(request){
    try {
      const u=new URL(request.url),action=u.searchParams.get('action')||'config';
      invariant(['GET','POST'].includes(request.method),'METHOD','対応していない操作です。',405);
      if(request.method==='GET'&&action==='config')return response({version:'0.5.0',provider:'multi',markets:market.status(),chartPeriods:{crypto:market.periods('crypto'),fx:market.periods('fx')},accountsAvailable:!!(store&&secret),storage:store?storageName:'unconfigured',initialCashMinor:10_000_000,quantityScale:QUANTITY_SCALE,publicOrigin:origin||null,setupIssues:store?[]:setupIssues.filter(x=>['PRACTICE_STORE','SUPABASE_URL','SUPABASE_SECRET_KEY','APP_SECRET','APP_ORIGIN','DATABASE_INITIALIZATION'].includes(x)),cryptoRefreshSeconds:300,fxRateFrequency:'daily'});
      invariant(store&&secret,'SETUP_REQUIRED','口座保存の接続準備中です。',503);
      const client=secure?(request.headers.get('x-vercel-forwarded-for')||'shared'):'local';
      if(request.method==='POST')checkMutation(request,origin);
      const token=readSession(request,secure),sessionHash=token?digest(token):null;
      if(request.method==='POST'&&['register','login'].includes(action)){
        await limited(`auth:${client}`,10,900_000);await limited('auth-global',200);
        const body=await readBody(request),password=passwordText(body.password),lookup=hmac(secret,`account:${password}`);let account;
        if(action==='register'){const username=usernameText(body.username);const credentials=await passwordHash(password);account=await store.register({...credentials,lookup},'multi',username);}
        else {const c=await store.findCredential(lookup),matches=await passwordMatches(password,c||dummy);invariant(c&&matches,'LOGIN','パスワードを確認してください。',401);account=await store.getAccount(c.id);invariant(account,'LOGIN','パスワードを確認してください。',401);}
        const t=randomToken();await store.newSession(digest(t),account.id,clock()+SESSION_SECONDS*1000);return response({account},200,{'Set-Cookie':sessionCookie(t,secure)});
      }
      if(request.method==='POST'&&action==='logout'){await readBody(request);if(sessionHash)await store.logout(sessionHash);return response({ok:true},200,{'Set-Cookie':sessionCookie('',secure,true)});}
      const account=sessionHash?await store.sessionAccount(sessionHash,clock()):null;
      if(request.method==='GET'&&action==='session')return response({account});
      invariant(account,'AUTH','パスワードでログインしてください。',401);await limited(`account:${account.id}`,120);
      if(request.method==='POST'&&action==='username'){const b=await readBody(request);return response({account:await store.updateUsername(account.id,usernameText(b.username))});}
      if(request.method==='POST'&&action==='delete-account'){
        await limited(`delete:${account.id}`,5,900_000);const b=await readBody(request);invariant(b.confirm==='DELETE','CONFIRM_DELETE','削除の確認が必要です。');
        const p=passwordText(b.password),c=await store.findCredential(hmac(secret,`account:${p}`)),ok=await passwordMatches(p,c||dummy);invariant(c?.id===account.id&&ok,'LOGIN','パスワードを確認してください。',401);
        await store.deleteAccount(account.id);return response({ok:true},200,{'Set-Cookie':sessionCookie('',secure,true)});
      }
      if(request.method==='GET'&&action==='search')return response({items:await market.search(u.searchParams.get('q')||'',u.searchParams.get('type')||'crypto')});
      if(request.method==='GET'&&action==='quote'){const quote=await market.quote(u.searchParams.get('symbol'));return response({quote,quoteToken:signQuote(quote,quoteSecret,account.id,clock())});}
      if(request.method==='GET'&&action==='price-history')return response({chart:await market.history(u.searchParams.get('symbol'),u.searchParams.get('period'))});
      if(request.method==='GET'&&action==='portfolio')return response((await values([account]))[0]);
      if(request.method==='GET'&&action==='leaderboard'){
        await limited('leaderboard-global',60);const rows=(await values(await store.leaderboardAccounts())).map(p=>({username:p.account.username,totalMinor:p.totalMinor,me:p.account.id===account.id}));
        rows.sort((a,b)=>(a.totalMinor===null)-(b.totalMinor===null)||(b.totalMinor??0)-(a.totalMinor??0)||a.username.localeCompare(b.username,'ja'));
        let rank=0,previous=null;return response({items:rows.map((r,i)=>{if(r.totalMinor!==null&&r.totalMinor!==previous)rank=i+1;previous=r.totalMinor;return{...r,rank:r.totalMinor===null?null:rank};}),valuedAt:clock()});
      }
      if(request.method==='GET'&&action==='history'){const offset=Number(u.searchParams.get('offset')||0);invariant(Number.isSafeInteger(offset)&&offset>=0&&offset<=1_000_000,'OFFSET','履歴の位置が正しくありません。');const r=await store.history(account.id,offset);return response({...r,items:r.items.map(publicTrade)});}
      if(request.method==='POST'&&action==='trade'){
        await limited(`trade:${account.id}`,20);const b=await readBody(request);validateOrder(b);const fingerprint=orderFingerprint(b);
        for(let i=0;i<4;i++){
          const old=await store.getTrade(account.id,b.requestId);if(old){invariant(old.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','同じ注文番号で異なる注文は送れません。',409);return response({duplicate:true,trade:publicTrade(old),account:await store.getAccount(account.id)});}
          const q=verifyQuote(b.quoteToken,quoteSecret,account.id,clock());market.assertReady(b.symbol);assertFresh(q,clock());
          const latest=await store.getAccount(account.id);invariant(latest,'AUTH','ログインしてください。',401);
          const next=executeTrade(latest.state,b,q,clock()),done=await store.commit(account.id,latest.state.version,next.state,next.trade,fingerprint);
          if(done.conflict)continue;return response({duplicate:done.duplicate,trade:publicTrade(done.trade),account:{...latest,state:done.state}});
        }
        throw new AppError('CONCURRENT_ORDER','ほかの注文を処理中です。同じ注文で再試行してください。',409);
      }
      throw new AppError('NOT_FOUND','操作が見つかりません。',404);
    }catch(e){if(e instanceof AppError)return response({error:{code:e.code,message:e.message}},e.status,e.status===429?{'Retry-After':'60'}:{});console.error('practice_unexpected_error');return response({error:{code:'INTERNAL',message:'処理を完了できませんでした。同じ注文で再試行してください。'}},500);}
  };
}
