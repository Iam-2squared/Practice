import test from 'node:test';import assert from 'node:assert/strict';
import {createMarket,parseYahooChart} from '../lib/market.mjs';
const now=1_800_000_000_000;
const chart=(change={})=>({chart:{result:[{meta:{symbol:'7203.T',currency:'JPY',instrumentType:'EQUITY',regularMarketPrice:2800.5,regularMarketTime:now/1000-60,...change}}],error:null}});
test('Yahoo values include truthful quote timestamps',()=>{const q=parseYahooChart(chart(),'7203.T',now);assert.equal(q.priceMinor,280050);assert.equal(q.quoteAt,now-60000);assert.equal(q.source,'yahoo');});
for(const change of [{currency:'USD'},{instrumentType:'ETF'},{regularMarketPrice:0},{regularMarketPrice:'2800'},{regularMarketTime:0},{regularMarketTime:now/1000+120},{symbol:'6758.T'}])test('invalid Yahoo metadata fails closed: '+JSON.stringify(change),()=>assert.throws(()=>parseYahooChart(chart(change),'7203.T',now)));
test('old off-session quote is not tradable',()=>assert.throws(()=>parseYahooChart(chart({regularMarketTime:now/1000-6*86400}),'7203.T',now),e=>e.code==='MARKET_STALE'));
test('old in-session quote is not tradable',()=>assert.throws(()=>parseYahooChart(chart({regularMarketTime:now/1000-1801,currentTradingPeriod:{regular:{start:now/1000-3600,end:now/1000+3600}}}),'7203.T',now)));
test('demo fixtures are explicitly marked non-market data',async()=>{const q=await createMarket().quote('7203');assert.equal(q.source,'demo');assert.equal(q.quoteAt,null);assert.equal(q.previousCloseMinor,null);});
test('Yahoo requires explicit data-use approval before any fetch',async()=>{let fetched=false;const m=createMarket({provider:'yahoo',fetcher:async()=>{fetched=true;}});await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_PERMISSION');assert.equal(fetched,false);});
test('network errors do not silently use demo quotes',async()=>{const m=createMarket({provider:'yahoo',yahooApproved:true,fetcher:async()=>{throw new Error('offline');}});await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_UNAVAILABLE');});
test('shared quote cache avoids repeat requests',async()=>{let n=0;const m=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>now,fetcher:async()=>{n++;return Response.json(chart());}});await m.quote('7203');await m.quote('7203');assert.equal(n,1);});
test('demo search handles Japanese names and symbol codes',async()=>{const m=createMarket();assert.equal((await m.search('トヨタ'))[0].symbol,'7203.T');assert.equal((await m.search('７２０３'))[0].symbol,'7203.T');});

test('timestamp must be numeric, not a coerced string',()=>assert.throws(()=>parseYahooChart(chart({regularMarketTime:String(now/1000-60)}),'7203.T',now),e=>e.code==='MARKET_TIME'));
test('previousClose is preferred over chart range start',()=>{const q=parseYahooChart(chart({previousClose:2700,chartPreviousClose:2500}),'7203.T',now);assert.equal(q.previousCloseMinor,270000);});
test('unknown delay remains unknown, not falsely zero minutes',()=>{for(const delay of [undefined,NaN,-1,'15'])assert.equal(parseYahooChart(chart({exchangeDataDelayedBy:delay}),'7203.T',now).delayMinutes,null);});
test('missing session metadata uses conservative freshness',()=>assert.throws(()=>parseYahooChart(chart({regularMarketTime:now/1000-1801}),'7203.T',now),e=>e.code==='MARKET_STALE'));
test('known closed session allows a labelled weekend reference, not a live quote',()=>{
 const q=parseYahooChart(chart({regularMarketTime:now/1000-86400,currentTradingPeriod:{regular:{start:now/1000-100000,end:now/1000-86400}}}),'7203.T',now);
 assert.equal(q.referenceOnly,true);assert.equal(q.sessionState,'outside-regular');assert.equal(q.quoteAt,now-86400000);
});
test('concurrent requests share one fetch without sharing mutable quote objects',async()=>{
 let n=0;const m=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>now,fetcher:async()=>{n++;await new Promise(r=>setTimeout(r,10));return Response.json(chart());}});
 const quotes=await Promise.all(Array.from({length:10},()=>m.quote('7203')));assert.equal(n,1);quotes[0].priceMinor=1;assert.equal(quotes[1].priceMinor,280050);
 assert.equal((await m.quote('7203')).priceMinor,280050);
});
test('cache preserves fetch timestamp and rechecks stale quotes at use time',async()=>{
 let time=now;let n=0;const m=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>time,fetcher:async()=>{n++;return Response.json(chart({regularMarketTime:now/1000-1795}));}});
 const first=await m.quote('7203');time+=1000;assert.equal((await m.quote('7203')).fetchedAt,first.fetchedAt);time+=10000;
 await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_STALE');assert.equal(n,1);
});
test('429 honors Retry-After without returning synthetic prices or retrying immediately',async()=>{
 let time=now;let n=0;const m=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>time,fetcher:async()=>{n++;return n===1?new Response('',{status:429,headers:{'retry-after':'120'}}):Response.json(chart());}});
 await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_RATE_LIMIT');time+=60000;await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_RATE_LIMIT');assert.equal(n,1);
 time+=60001;assert.equal((await m.quote('7203')).source,'yahoo');assert.equal(n,2);
});
for(const status of [401,403])test(`upstream ${status} is reported without an access-control workaround`,async()=>{
 let n=0;const m=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>now,fetcher:async()=>{n++;return new Response('private upstream contents',{status});}});
 await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_ACCESS'&&!e.message.includes('private'));await assert.rejects(m.quote('7203'));assert.equal(n,1);
});
test('large or malformed upstream bodies fail closed',async()=>{
 for(const response of [new Response('x'.repeat(512*1024+1)),new Response('not JSON'),new Response('{}',{headers:{'content-length':'999999999'}})]){
 const m=createMarket({provider:'yahoo',yahooApproved:true,fetcher:async()=>response});await assert.rejects(m.quote('7203'),e=>e.code==='MARKET_RESPONSE');}
});
test('exact non-catalog code needs only one quote fetch; names-only local fallback does not invent prices',async()=>{
 const calls=[];const m=createMarket({provider:'yahoo',yahooApproved:true,clock:()=>now,fetcher:async(url)=>{calls.push(url);return Response.json(chart({symbol:'1234.T'}));}});
 assert.equal((await m.search('１２３４'))[0].symbol,'1234.T');assert.equal(calls.length,1);assert.ok(calls[0].includes('range=1d'));
});
test('invalid provider never silently becomes demo',async()=>{const m=createMarket({provider:'yaho'});assert.equal(m.status(),'invalid-provider');await assert.rejects(m.quote('7203'),e=>e.code==='PROVIDER');});
