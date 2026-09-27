import test from 'node:test';
import assert from 'node:assert/strict';
import {withLocalization} from '../lib/locale.mjs';
import {initialChoice,languagePath} from '../public/site-language.js';

const origin='https://practice.example';
const request=(action,language='en')=>new Request(`${origin}/api/index?action=${action}`,{headers:{'x-practice-language':language}});

test('localization preserves session cookies and private response caching',async()=>{
 const cookie='__Host-practice=fixture-token; Path=/; Secure; HttpOnly; SameSite=Lax';
 const account={id:'fixture-account',username:'総資産',state:{cashMinor:10000000,version:7,positions:[]}};
 const handle=withLocalization(async()=>Response.json({account},{headers:{'Set-Cookie':cookie,'Cache-Control':'no-store'}}));
 const r=await handle(request('login'));
 assert.equal(r.status,200);
 assert.equal(r.headers.get('set-cookie'),cookie);
 assert.match(r.headers.get('cache-control'),/private/);
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal(r.headers.get('content-language'),'en');
 assert.deepEqual(await r.json(),{account});
});

test('localized errors preserve the failure status, stable code and retry delay',async()=>{
 const handle=withLocalization(async()=>Response.json({error:{code:'RATE_LIMIT',message:'操作が続いています。'}},{status:429,headers:{'Retry-After':'60'}}));
 const r=await handle(request('trade'));
 assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
 const d=await r.json();assert.equal(d.error.code,'RATE_LIMIT');assert.match(d.error.message,/wait/i);
});

test('Japanese error messages remain unchanged when Japanese is selected',async()=>{
 const data={error:{code:'LOGIN',message:'パスワードを確認してください。'}};
 const r=await withLocalization(async()=>Response.json(data,{status:401}))(request('login','ja'));
 assert.equal(r.status,401);assert.equal(r.headers.get('content-language'),'ja');
 assert.deepEqual(await r.json(),data);
});

test('English localization does not alter comments, usernames or trade fingerprints',async()=>{
 const data={items:[{id:'fixture',username:'ランキング',body:'総資産 / 売却 / <script>hello</script>',createdAt:1790510000000}],trade:{symbol:'USDJPY',name:'米ドル / 円',quantity:1000000,priceMinor:15000,requestId:'fixture-id',fingerprint:'fixture-fingerprint'}};
 const r=await withLocalization(async()=>Response.json(data))(request('comments'));
 assert.deepEqual(await r.json(),data);
});

test('English progress copy retains mission IDs, completion and earned timestamps',async()=>{
 const data={missions:[{id:'chart',label:'チャートを見る',description:'相場の動きとデータの日付を確認',done:true}],achievements:[{id:'crypto3',label:'仮想通貨3売買',description:'仮想通貨の購入・売却を合計3回成立させた',earnedAt:1790510000000}],selected:['crypto3'],stats:{buyCount:2,sellCount:1},totalMinor:10000000};
 const r=await withLocalization(async()=>Response.json(data))(request('progress'));const d=await r.json();
 assert.equal(d.missions[0].label,'Explore a chart');assert.equal(d.missions[0].id,'chart');assert.equal(d.missions[0].done,true);
 assert.equal(d.achievements[0].earnedAt,data.achievements[0].earnedAt);assert.equal(d.achievements[0].id,'crypto3');
 assert.deepEqual(d.selected,data.selected);assert.deepEqual(d.stats,data.stats);assert.equal(d.totalMinor,data.totalMinor);
});

test('language links preserve campaign and fragment state without carrying locale query',()=>{
 const url=languagePath(origin+'/ja/privacy.html?lang=en&utm_source=instagram&x=1#storage','en');
 assert.equal(url.origin,origin);assert.equal(url.pathname,'/en/privacy.html');assert.equal(url.hash,'#storage');
 assert.equal(url.searchParams.get('utm_source'),'instagram');assert.equal(url.searchParams.get('x'),'1');assert.equal(url.searchParams.has('lang'),false);
 assert.equal(initialChoice({url:origin+'/app.html',saved:'en'}),'en');
 assert.equal(initialChoice({url:origin+'/ja/app.html',saved:'en'}),'ja');
});
