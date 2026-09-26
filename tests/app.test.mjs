import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createApp} from '../lib/app.mjs';import {MemoryStore,SupabaseStore} from '../lib/store.mjs';import {createMarket} from '../lib/market.mjs';
const origin='https://practice.example';const secret='a'.repeat(64);let time=1_800_000_000_000;
function client(store=new MemoryStore(),market=createMarket({clock:()=>time})){
 const handle=createApp({store,market,secret,origin,clock:()=>time});let cookie='';
 return {store,handle,get cookie(){return cookie;},async call(action,body,params={},headers={}){
  const result=await handle(new Request(`${origin}/api/index?${new URLSearchParams({action,...params})}`,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'Content-Type':'application/json','X-Practice-Request':'1',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  if(result.headers.get('set-cookie'))cookie=result.headers.get('set-cookie').split(';')[0];
  return {status:result.status,headers:result.headers,...await result.json()};
 }};
}
const password=id=>`Practice_Test_Password_Only_${id}_${randomUUID()}`;
async function registered(){const c=client();const p=password('one');const result=await c.call('register',{password:p});assert.equal(result.status,200);return {...c,c,p,result};}
async function newOrder(c,extra={}){const q=await c.call('quote',undefined,{symbol:'9432'});assert.equal(q.status,200);return {symbol:'9432.T',side:'buy',quantity:100,requestId:randomUUID(),quoteToken:q.quoteToken,...extra};}
test('server registration, buy, sell, history, and logout',async()=>{
 const {c,p,result}=await registered();assert.equal(result.account.state.cashMinor,10000000);assert.equal(result.account.hash,undefined);assert.equal(result.account.lookup,undefined);
 const order=await newOrder(c,{quantity:300});const buy=await c.call('trade',order);assert.equal(buy.status,200);assert.equal(buy.account.state.positions[0].shares,300);
 const sell=await c.call('trade',await newOrder(c,{side:'sell',quantity:200}));assert.equal(sell.status,200);assert.equal(sell.account.state.positions[0].shares,100);
 const history=await c.call('history');assert.equal(history.items.length,2);assert.equal(history.items[0].side,'sell');assert.equal(history.items[0].fingerprint,undefined);
 const held=await c.call('portfolio');assert.equal(held.totalMinor,10000000);
 const oldCookie=c.cookie;assert.equal((await c.call('logout',{})).status,200);assert.equal((await c.call('history',undefined,{}, {cookie:oldCookie})).status,401);
 assert.equal((await c.call('login',{password:p})).status,200);assert.equal((await c.call('portfolio')).account.state.positions[0].shares,100);
});
test('password-only duplicate registration never opens an existing account',async()=>{const {c,p}=await registered();const r=await c.call('register',{password:p});assert.equal(r.status,409);});
test('same-password login works from another client, wrong password fails',async()=>{const {c,p,result}=await registered();const b=client(c.store);assert.equal((await b.call('login',{password:password('wrong')})).status,401);assert.equal((await b.call('login',{password:p})).account.id,result.account.id);});
test('accounts are isolated, quote tokens cannot cross accounts',async()=>{
 const {c,result}=await registered();const b=client(c.store);await b.call('register',{password:password('two')});const order=await newOrder(c);
 assert.equal((await b.call('trade',order)).status,400);assert.equal((await b.call('history')).items.length,0);
 assert.notEqual((await b.call('portfolio')).account.id,result.account.id);
});
test('same idempotency key is executed exactly once even concurrently',async()=>{
 const {c}=await registered();const order=await newOrder(c,{quantity:400});const rs=await Promise.all([c.call('trade',order),c.call('trade',order)]);
 assert.deepEqual(rs.map(r=>r.status),[200,200]);assert.equal((await c.call('history')).items.length,1);assert.equal((await c.call('portfolio')).account.state.positions[0].shares,400);
});
test('different concurrent orders cannot overspend',async()=>{const {c}=await registered();const a=await newOrder(c,{quantity:400});const b={...a,requestId:randomUUID()};const rs=await Promise.all([c.call('trade',a),c.call('trade',b)]);assert.equal(rs.filter(r=>r.status===200).length,1);assert.ok((await c.call('portfolio')).account.state.cashMinor>=0);});
test('different concurrent sell orders cannot oversell',async()=>{const {c}=await registered();await c.call('trade',await newOrder(c,{quantity:300}));const a=await newOrder(c,{quantity:200,side:'sell'});const rs=await Promise.all([c.call('trade',a),c.call('trade',{...a,requestId:randomUUID()})]);assert.equal(rs.filter(r=>r.status===200).length,1);assert.equal((await c.call('portfolio')).account.state.positions[0].shares,100);});
test('reusing order id with a different quantity is rejected',async()=>{const {c}=await registered();const order=await newOrder(c);await c.call('trade',order);assert.equal((await c.call('trade',{...order,quantity:200})).error.code,'IDEMPOTENCY_CONFLICT');});
test('expired quote is rejected, old fulfilled order remains replayable',async()=>{const {c}=await registered();const order=await newOrder(c);await c.call('trade',order);time+=61000;assert.equal((await c.call('trade',order)).status,200);assert.equal((await c.call('trade',{...order,requestId:randomUUID()})).error.code,'QUOTE_EXPIRED');});
test('CSRF origin rejection precedes all mutation work',async()=>{const c=client();assert.equal((await c.call('register',{password:password('x')},{},{origin:'https://evil.example'})).status,403);assert.equal(Object.keys(c.store.data.accounts).length,0);});
test('unconfigured production fails closed instead of using local memory',async()=>{const c=client(null);assert.equal((await c.call('config')).accountsAvailable,false);assert.equal((await c.call('register',{password:password('x')})).status,503);});
test('unknown valuation is never shown as zero or cost price',async()=>{let broken=false;const m=createMarket();const original=m.quote;m.quote=async(...args)=>{if(broken)throw Error('down');return original.apply(m,args);};const c=client(new MemoryStore(),m);await c.call('register',{password:password('v')});await c.call('trade',await newOrder(c));broken=true;const p=await c.call('portfolio');assert.equal(p.valuationComplete,false);assert.equal(p.totalMinor,null);assert.equal(p.holdingsMinor,null);});
test('price supplied directly by client is ignored',async()=>{const {c}=await registered();const order=await newOrder(c);const r=await c.call('trade',{...order,priceMinor:1});assert.equal(r.trade.priceMinor,15030);});
test('unknown login and password failure use same generic error',async()=>{const c=client();const r=await c.call('login',{password:password('absent')});assert.equal(r.status,401);assert.equal(r.error.code,'LOGIN');});
test('shared limiter is atomic and resets per time window',async()=>{const s=new MemoryStore();const r=await Promise.all(Array.from({length:15},()=>s.rate('a',10,60000,0)));assert.equal(r.filter(Boolean).length,10);assert.equal(await s.rate('a',10,60000,60001),true);});
test('cloud adapter rejects arbitrary SSRF endpoint',()=>assert.throws(()=>new SupabaseStore('http://127.0.0.1','secret')));
test('cloud adapter uses encoded owner-bound query and rejects upstream failure',async()=>{let path;const s=new SupabaseStore('https://example.supabase.co','server-secret',async(url)=>{path=url;return Response.json([]);});assert.equal(await s.getAccount('a&b'),null);assert.ok(path.includes('a%26b'));const down=new SupabaseStore('https://example.supabase.co','key',async()=>{throw Error();});await assert.rejects(down.getAccount('x'),e=>e.code==='DB_UNAVAILABLE');});
test('new Supabase secret key is not incorrectly sent as a bearer JWT',async()=>{let headers;const s=new SupabaseStore('https://example.supabase.co','sb_secret_test_only',async(url,options)=>{headers=options.headers;return Response.json([]);});await s.getAccount('a');assert.equal(headers.apikey,'sb_secret_test_only');assert.equal(headers.Authorization,undefined);});

for(const quantity of [1,99,101,150,199,0,-100,100.5]) test(`API rejects non-lot quantity ${quantity} without touching balance`,async()=>{
 const {c}=await registered();const r=await c.call('trade',await newOrder(c,{quantity}));assert.equal(r.error.code,'QUANTITY');assert.equal((await c.call('history')).items.length,0);assert.equal((await c.call('portfolio')).account.state.cashMinor,10000000);
});
test('API config publishes 100-share lot size',async()=>{assert.equal((await client().call('config')).lotSize,100);});
test('single lot above initial cash cannot be bought',async()=>{const {c}=await registered();const q=await c.call('quote',undefined,{symbol:'7203'});const r=await c.call('trade',{symbol:'7203.T',side:'buy',quantity:100,requestId:randomUUID(),quoteToken:q.quoteToken});assert.equal(r.error.code,'INSUFFICIENT_CASH');});
test('deletion requires password and confirmation, revokes every session and leaves other accounts intact',async()=>{
 const {c,p,result}=await registered();const other=client(c.store);await other.call('register',{password:password('other')});const b=client(c.store);await b.call('login',{password:p});
 await c.call('trade',await newOrder(c));assert.equal((await c.call('delete-account',{password:p})).error.code,'CONFIRM_DELETE');
 assert.equal((await c.call('delete-account',{password:password('wrong'),confirm:'DELETE'})).status,401);
 assert.equal((await c.call('delete-account',{password:p,confirm:'DELETE'})).status,200);
 assert.equal(await c.store.getAccount(result.account.id),null);assert.equal((await b.call('history')).status,401);assert.equal((await other.call('portfolio')).status,200);
 assert.equal((await b.call('login',{password:p})).status,401);assert.equal((await c.call('session')).account,null);
});

test('switching default to Yahoo preserves an existing demo account and history',async()=>{
 const {c,p,result}=await registered();await c.call('trade',await newOrder(c));let fetches=0;
 const live=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>time,fetcher:async()=>{fetches++;throw Error('not expected');}});
 const after=client(c.store,live);assert.equal((await after.call('login',{password:p})).account.id,result.account.id);
 assert.equal((await after.call('quote',undefined,{symbol:'9432'})).quote.source,'demo');assert.equal((await after.call('history')).items.length,1);
 const sale=await after.call('trade',await newOrder(after,{side:'sell'}));assert.equal(sale.status,200);assert.equal(sale.account.state.cashMinor,10000000);assert.equal(fetches,0);
});
test('missing Yahoo permission blocks new live accounts but not existing demo login',async()=>{
 const {c,p}=await registered();const after=client(c.store,createMarket({provider:'yahoo'}));
 const config=await after.call('config');assert.equal(config.accountsAvailable,true);assert.equal(config.marketStatus,'permission-required');
 assert.equal((await after.call('register',{password:password('unapproved')})).error.code,'MARKET_PERMISSION');
 assert.equal(Object.keys(c.store.data.accounts).length,1);assert.equal((await after.call('login',{password:p})).status,200);
 assert.equal((await after.call('quote',undefined,{symbol:'9432'})).quote.source,'demo');
});
test('disabling live provider keeps live history and balances without fabricating valuations',async()=>{
 const store=new MemoryStore();const pw=password('live');const live=client(store,createMarket({provider:'yahoo',yahooApproved:true,clock:()=>time,fetcher:async()=>Response.json({chart:{result:[{meta:{symbol:'9432.T',currency:'JPY',instrumentType:'EQUITY',regularMarketPrice:152,regularMarketTime:time/1000-60}}]}})}));
 assert.equal((await live.call('register',{password:pw})).account.market,'yahoo');const order=await newOrder(live);assert.equal((await live.call('trade',order)).status,200);
 const disabled=client(store,createMarket());await disabled.call('login',{password:pw});assert.equal((await disabled.call('history')).items.length,1);
 const portfolio=await disabled.call('portfolio');assert.equal(portfolio.account.state.cashMinor,8480000);assert.equal(portfolio.totalMinor,null);assert.equal(portfolio.valuationComplete,false);
 assert.equal((await disabled.call('quote',undefined,{symbol:'9432'})).error.code,'MARKET_DISABLED');
 assert.equal((await disabled.call('trade',order)).duplicate,true); // Replay does not execute another trade.
 assert.equal((await disabled.call('trade',{...order,requestId:randomUUID()})).error.code,'MARKET_DISABLED');
});
test('private quote-signing key prevents forgery with the account lookup secret alone',async()=>{
 const {signQuote}=await import('../lib/security.mjs');const store=new MemoryStore();const market=createMarket({clock:()=>time});const privateSigning='private-server-only-fixture-key';
 const app=createApp({store,market,secret,quoteSecret:privateSigning,origin,clock:()=>time});
 const registration=await app(new Request(`${origin}/api?action=register`,{method:'POST',headers:{origin,'content-type':'application/json','x-practice-request':'1'},body:JSON.stringify({password:password('signing')})}));
 const account=(await registration.json()).account;const cookie=registration.headers.get('set-cookie').split(';')[0];
 const quote=await market.quote('9432');quote.priceMinor=1;
 const request=token=>new Request(`${origin}/api?action=trade`,{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-practice-request':'1'},body:JSON.stringify({symbol:'9432.T',side:'buy',quantity:100,requestId:randomUUID(),quoteToken:token})});
 const forged=await app(request(signQuote(quote,secret,account.id,time)));assert.equal(forged.status,400);assert.equal((await forged.json()).error.code,'QUOTE_TOKEN');
 assert.equal((await store.getAccount(account.id)).state.cashMinor,10000000);
 const realQuote=await market.quote('9432');assert.equal((await app(request(signQuote(realQuote,privateSigning,account.id,time)))).status,200);
});
