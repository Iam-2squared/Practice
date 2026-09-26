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
async function newOrder(c,extra={}){const q=await c.call('quote',undefined,{symbol:'7203'});assert.equal(q.status,200);return {symbol:'7203.T',side:'buy',quantity:1,requestId:randomUUID(),quoteToken:q.quoteToken,...extra};}
test('server registration, buy, sell, history, and logout',async()=>{
 const {c,p,result}=await registered();assert.equal(result.account.state.cashMinor,10000000);assert.equal(result.account.hash,undefined);assert.equal(result.account.lookup,undefined);
 const order=await newOrder(c,{quantity:3});const buy=await c.call('trade',order);assert.equal(buy.status,200);assert.equal(buy.account.state.positions[0].shares,3);
 const sell=await c.call('trade',await newOrder(c,{side:'sell',quantity:2}));assert.equal(sell.status,200);assert.equal(sell.account.state.positions[0].shares,1);
 const history=await c.call('history');assert.equal(history.items.length,2);assert.equal(history.items[0].side,'sell');assert.equal(history.items[0].fingerprint,undefined);
 const held=await c.call('portfolio');assert.equal(held.totalMinor,10000000);
 const oldCookie=c.cookie;assert.equal((await c.call('logout',{})).status,200);assert.equal((await c.call('history',undefined,{}, {cookie:oldCookie})).status,401);
 assert.equal((await c.call('login',{password:p})).status,200);assert.equal((await c.call('portfolio')).account.state.positions[0].shares,1);
});
test('password-only duplicate registration never opens an existing account',async()=>{const {c,p}=await registered();const r=await c.call('register',{password:p});assert.equal(r.status,409);});
test('same-password login works from another client, wrong password fails',async()=>{const {c,p,result}=await registered();const b=client(c.store);assert.equal((await b.call('login',{password:password('wrong')})).status,401);assert.equal((await b.call('login',{password:p})).account.id,result.account.id);});
test('accounts are isolated, quote tokens cannot cross accounts',async()=>{
 const {c,result}=await registered();const b=client(c.store);await b.call('register',{password:password('two')});const order=await newOrder(c);
 assert.equal((await b.call('trade',order)).status,400);assert.equal((await b.call('history')).items.length,0);
 assert.notEqual((await b.call('portfolio')).account.id,result.account.id);
});
test('same idempotency key is executed exactly once even concurrently',async()=>{
 const {c}=await registered();const order=await newOrder(c,{quantity:30});const rs=await Promise.all([c.call('trade',order),c.call('trade',order)]);
 assert.deepEqual(rs.map(r=>r.status),[200,200]);assert.equal((await c.call('history')).items.length,1);assert.equal((await c.call('portfolio')).account.state.positions[0].shares,30);
});
test('different concurrent orders cannot overspend',async()=>{const {c}=await registered();const a=await newOrder(c,{quantity:30});const b={...a,requestId:randomUUID()};const rs=await Promise.all([c.call('trade',a),c.call('trade',b)]);assert.equal(rs.filter(r=>r.status===200).length,1);assert.ok((await c.call('portfolio')).account.state.cashMinor>=0);});
test('different concurrent sell orders cannot oversell',async()=>{const {c}=await registered();await c.call('trade',await newOrder(c,{quantity:3}));const a=await newOrder(c,{quantity:2,side:'sell'});const rs=await Promise.all([c.call('trade',a),c.call('trade',{...a,requestId:randomUUID()})]);assert.equal(rs.filter(r=>r.status===200).length,1);assert.equal((await c.call('portfolio')).account.state.positions[0].shares,1);});
test('reusing order id with a different quantity is rejected',async()=>{const {c}=await registered();const order=await newOrder(c);await c.call('trade',order);assert.equal((await c.call('trade',{...order,quantity:2})).error.code,'IDEMPOTENCY_CONFLICT');});
test('expired quote is rejected, old fulfilled order remains replayable',async()=>{const {c}=await registered();const order=await newOrder(c);await c.call('trade',order);time+=61000;assert.equal((await c.call('trade',order)).status,200);assert.equal((await c.call('trade',{...order,requestId:randomUUID()})).error.code,'QUOTE_EXPIRED');});
test('CSRF origin rejection precedes all mutation work',async()=>{const c=client();assert.equal((await c.call('register',{password:password('x')},{},{origin:'https://evil.example'})).status,403);assert.equal(Object.keys(c.store.data.accounts).length,0);});
test('unconfigured production fails closed instead of using local memory',async()=>{const c=client(null);assert.equal((await c.call('config')).accountsAvailable,false);assert.equal((await c.call('register',{password:password('x')})).status,503);});
test('unknown valuation is never shown as zero or cost price',async()=>{let broken=false;const m=createMarket();const original=m.quote;m.quote=async(...args)=>{if(broken)throw Error('down');return original.apply(m,args);};const c=client(new MemoryStore(),m);await c.call('register',{password:password('v')});await c.call('trade',await newOrder(c));broken=true;const p=await c.call('portfolio');assert.equal(p.valuationComplete,false);assert.equal(p.totalMinor,null);assert.equal(p.holdingsMinor,null);});
test('price supplied directly by client is ignored',async()=>{const {c}=await registered();const order=await newOrder(c);const r=await c.call('trade',{...order,priceMinor:1});assert.equal(r.trade.priceMinor,280050);});
test('unknown login and password failure use same generic error',async()=>{const c=client();const r=await c.call('login',{password:password('absent')});assert.equal(r.status,401);assert.equal(r.error.code,'LOGIN');});
test('shared limiter is atomic and resets per time window',async()=>{const s=new MemoryStore();const r=await Promise.all(Array.from({length:15},()=>s.rate('a',10,60000,0)));assert.equal(r.filter(Boolean).length,10);assert.equal(await s.rate('a',10,60000,60001),true);});
test('cloud adapter rejects arbitrary SSRF endpoint',()=>assert.throws(()=>new SupabaseStore('http://127.0.0.1','secret')));
test('cloud adapter uses encoded owner-bound query and rejects upstream failure',async()=>{let path;const s=new SupabaseStore('https://example.supabase.co','server-secret',async(url)=>{path=url;return Response.json([]);});assert.equal(await s.getAccount('a&b'),null);assert.ok(path.includes('a%26b'));const down=new SupabaseStore('https://example.supabase.co','key',async()=>{throw Error();});await assert.rejects(down.getAccount('x'),e=>e.code==='DB_UNAVAILABLE');});
test('new Supabase secret key is not incorrectly sent as a bearer JWT',async()=>{let headers;const s=new SupabaseStore('https://example.supabase.co','sb_secret_test_only',async(url,options)=>{headers=options.headers;return Response.json([]);});await s.getAccount('a');assert.equal(headers.apikey,'sb_secret_test_only');assert.equal(headers.Authorization,undefined);});
