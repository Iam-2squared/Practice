import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ASSETS,assetFor} from '../lib/catalog.mjs';
import {createMarket,QUOTE_CACHE_KEYS,parseCrypto,parseFx,chartSpec} from '../lib/market.mjs';
import {validateState} from '../lib/domain.mjs';
import {MemoryStore} from '../lib/store.mjs';
import {payload,setup,register,order} from './fixtures.mjs';
const now=Date.now();
const crypto=['BTC','ETH','SOL','XRP','BNB','ADA','DOGE','AVAX','LINK','LTC'];
const fx=['USDJPY','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY','NZDJPY'];
test('catalog has 10 crypto and 7 FX, unique IDs and valid quantity steps',()=>{
 assert.deepEqual(ASSETS.filter(a=>a.type==='crypto').map(a=>a.symbol),crypto);assert.deepEqual(ASSETS.filter(a=>a.type==='fx').map(a=>a.symbol),fx);assert.equal(new Set(ASSETS.map(a=>a.symbol)).size,17);assert.equal(new Set(ASSETS.filter(a=>a.id).map(a=>a.id)).size,10);
 for(const a of ASSETS){assert.ok(Number.isSafeInteger(a.stepUnits)&&a.stepUnits>0);assert.equal(a.defaultUnits%a.stepUnits,0);assert.ok(Object.isFrozen(a));}assert.equal(assetFor('AVAX').id,'avalanche-2');
});
test('SQL and JavaScript catalogs agree on all canonical names, steps and sources',async()=>{
 const sql=await readFile(new URL('../db/market_expansion.sql',import.meta.url),'utf8'),json=sql.match(/select '(\[.*?\])'::jsonb;/s);assert.ok(json);assert.deepEqual(JSON.parse(json[1]),ASSETS.map(a=>({symbol:a.symbol,name:a.name,type:a.type,unit:a.unit,step:a.stepUnits,source:a.source})));
});
test('17 quotes use only two shared upstream batches with exact allowlisted parameters',async()=>{
 const urls=[],store=new MemoryStore(),args={store,clock:()=>now,coinGeckoKey:'fixture',fetcher:async u=>{urls.push(new URL(u));return Response.json(payload(u,now));}},m=createMarket(args);
 assert.equal((await Promise.all(ASSETS.map(a=>m.quote(a.symbol)))).length,17);assert.equal(urls.length,2);
 const c=urls.find(u=>u.hostname==='api.coingecko.com'),f=urls.find(u=>u.hostname==='api.frankfurter.dev');
 assert.deepEqual(c.searchParams.get('ids').split(','),ASSETS.filter(a=>a.id).map(a=>a.id));assert.equal(c.searchParams.get('vs_currencies'),'jpy');assert.equal(c.searchParams.get('include_last_updated_at'),'true');assert.deepEqual(f.searchParams.get('symbols').split(','),['JPY','USD','GBP','AUD','CAD','CHF','NZD']);assert.equal(f.searchParams.get('base'),'EUR');
 for(const a of ASSETS)await createMarket(args).quote(a.symbol);assert.equal(urls.length,2);assert.equal((await store.getCache(QUOTE_CACHE_KEYS.crypto)).nextFetchAt-now,300000);assert.equal((await store.getCache(QUOTE_CACHE_KEYS.fx)).nextFetchAt-now,14400000);
});
test('old four-asset caches remain untouched and cannot hide new assets',async()=>{
 const store=new MemoryStore(),legacy={payload:parseFx(payload('fx',now),now).slice(0,4),fetchedAt:now,nextFetchAt:now+14400000,error:null};store.data.cache.fx=structuredClone(legacy);let calls=0;const m=createMarket({store,clock:()=>now,fetcher:async u=>{calls++;return Response.json(payload(u,now));}});
 assert.equal((await m.quote('NZDJPY')).symbol,'NZDJPY');assert.equal(calls,1);assert.deepEqual(store.data.cache.fx,legacy);assert.equal((await store.getCache('fx-v2')).payload.length,7);
});
test('new FX aliases and cross rates retain real reference date rather than fabricated time',async()=>{
 const data=payload('fx',now),quotes=parseFx(data,now),m=createMarket();
 for(const symbol of ['CADJPY','CHFJPY','NZDJPY']){const a=assetFor(symbol),q=quotes.find(x=>x.symbol===symbol);assert.equal(q.priceMinor,Math.round(data.rates.JPY/data.rates[a.unit]*100));assert.equal(q.quoteDate,data.date);assert.equal(q.quoteAt,null);assert.equal((await m.search(a.nameEn,'fx'))[0]?.symbol,symbol);}
 assert.equal((await m.search('スイスフラン','fx'))[0].symbol,'CHFJPY');assert.equal((await m.search('ドージコイン','crypto'))[0].symbol,'DOGE');assert.deepEqual((await m.search('Dollar','fx')).map(a=>a.symbol),['USDJPY','AUDJPY','CADJPY','NZDJPY']);
});
test('all 17 charts retain honest provider granularity and separate keys',async()=>{
 const m=createMarket({coinGeckoKey:'fixture',clock:()=>now,fetcher:async u=>Response.json(payload(u,now))});
 for(const a of ASSETS){const period=a.type==='crypto'?'24H':'7D',chart=await m.history(a.symbol,period);assert.equal(chart.symbol,a.symbol);assert.equal(chart.name,a.name);assert.equal(chart.source,a.source);assert.ok(chart.points.length>=2);assert.equal(chart.referenceOnly,true);assert.equal(chart.granularity,a.type==='crypto'?'5-minute':'daily');const url=new URL(chartSpec(a.symbol,period,now).url);if(a.type==='crypto')assert.ok(url.pathname.includes('/'+a.id+'/'));else assert.ok(url.searchParams.get('symbols').includes('JPY'));}
});
test('all new crypto charts share the 500 monthly guard; FX and quotes remain independent',async()=>{
 const store=new MemoryStore();store.data.chartBudget={window:new Date(now).toISOString().slice(0,7),count:500};let calls=0;const m=createMarket({store,clock:()=>now,coinGeckoKey:'fixture',fetcher:async u=>{calls++;return Response.json(payload(u,now));}});
 for(const symbol of crypto)await assert.rejects(m.history(symbol,'24H'),e=>e.code==='CHART_BUDGET');assert.equal(calls,0);assert.equal((await m.quote('BNB')).symbol,'BNB');assert.equal(calls,1);await m.history('CADJPY','7D');assert.equal(calls,2);assert.equal(store.data.chartBudget.count,500);
});
test('new symbols cannot spend the last monthly chart credit twice concurrently',async()=>{
 const store=new MemoryStore();store.data.chartBudget={window:new Date(now).toISOString().slice(0,7),count:499};let calls=0;const m=createMarket({store,clock:()=>now,coinGeckoKey:'fixture',fetcher:async u=>{calls++;return Response.json(payload(u,now));}});const results=await Promise.allSettled([m.history('BNB','24H'),m.history('DOGE','24H')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal(store.data.chartBudget.count,500);
});
test('invalid new provider fields fail closed without fictional prices',()=>{
 const c=payload('coingecko',now);delete c.binancecoin;assert.throws(()=>parseCrypto(c,now));const f=payload('fx',now);delete f.rates.CHF;assert.throws(()=>parseFx(f,now));
});
test('a wallet holds and trades 17 assets with progress, history and original roundings intact',async()=>{
 const t=setup(),c=t.client();await register(c);for(const a of ASSETS){const r=await c.call('trade',await order(c,{symbol:a.symbol,quantity:a.stepUnits}));assert.equal(r.status,200,a.symbol+JSON.stringify(r.error));}
 const p=await c.call('portfolio');assert.equal(p.valuationComplete,true);assert.equal(p.account.state.positions.length,17);validateState(p.account.state);assert.throws(()=>validateState({...p.account.state,positions:[...p.account.state.positions,p.account.state.positions[0]]}));
 const progress=await c.call('progress');assert.equal(progress.stats.cryptoCount,10);assert.equal(progress.stats.fxCount,7);assert.ok(progress.achievements.find(x=>x.id==='crypto3').earnedAt);assert.ok(progress.achievements.find(x=>x.id==='fx3').earnedAt);
 t.advance(61000); // Keep real rate limiting enabled, move to another fixture minute.
 for(const a of ASSETS){const r=await c.call('trade',await order(c,{symbol:a.symbol,quantity:a.stepUnits,side:'sell'}));assert.equal(r.status,200,a.symbol+JSON.stringify(r.error));}
 const end=await c.call('portfolio');assert.equal(end.account.state.positions.length,0);assert.ok(end.account.state.cashMinor<=10000000);assert.equal((await c.call('history')).items.length,34);
});
test('new discussion rooms work but equities and unknown symbols remain rejected',async()=>{
 const t=setup(),c=t.client();await register(c);for(const a of ASSETS)assert.equal((await c.call('comments',undefined,{room:a.symbol})).status,200);for(const room of ['BNB','CADJPY','CHFJPY'])assert.equal((await c.call('comment',{room,body:'Local fixture only'})).status,201);assert.equal((await c.call('comments',undefined,{room:'AAPL'})).status,400);assert.equal((await c.call('quote',undefined,{symbol:'9434.T'})).status,400);
});
