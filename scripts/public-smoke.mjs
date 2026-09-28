// Anonymous checks only: no user registration, quotes, comments or trades.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ASSETS} from '../lib/catalog.mjs';
import {buildSite} from './localize.mjs';
const expected=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const {out}=await buildSite();
const manifest=JSON.parse(await readFile(out+'/locale-build.json','utf8'));
const origin='https://practice-ashy-delta.vercel.app';let error='Deployment not ready';
const get=path=>fetch(origin+path,{cache:'no-store',signal:AbortSignal.timeout(10000)});
for(let attempt=0;attempt<30;attempt++){
 try{
  const response=await get('/api/index?action=config&lang=en'),config=await response.json();
  assert.ok(response.ok&&config.version===expected&&config.provider==='multi'&&config.storage==='supabase'&&config.accountsAvailable);
  assert.deepEqual(config.languages,['ja','en']);assert.equal(config.quantityScale,1000000);
  assert.deepEqual(config.marketCounts,{crypto:10,fx:7});assert.deepEqual(manifest.marketSymbols,ASSETS.map(a=>a.symbol));
  assert.equal(config.cryptoRefreshSeconds,300);assert.equal(config.fxRateFrequency,'daily');
  assert.equal(config.chartPeriods.crypto.length,5);assert.equal(config.chartPeriods.fx.length,5);
  const deployed=await get('/locale-build.json');assert.ok(deployed.ok);assert.deepEqual(await deployed.json(),manifest);
  for(const language of ['ja','en']){
   for(const page of ['index.html','app.html','terms.html','privacy.html','data.html']){
    const path=`/${language}/${page}`,r=await get(path);assert.ok(r.ok,path);
    assert.equal(await r.text(),await readFile(out+path,'utf8'),path+' differs from checked commit');
   }
   const path='/'+manifest.bundles[language],bundle=await get(path);assert.ok(bundle.ok);assert.equal(await bundle.text(),await readFile(out+path,'utf8'));
   const denied=await get('/api/index?action=progress&lang='+language);assert.equal(denied.status,401);assert.equal(denied.headers.get('content-language'),language);
   const body=await denied.json();assert.equal(body.error.code,'AUTH');if(language==='en')assert.match(body.error.message,/sign in/i);
  }
  for(const file of [manifest.loader,manifest.languageScript,manifest.stylesheet,...Object.values(manifest.favorites)]){const r=await get('/'+file);assert.ok(r.ok);assert.equal(await r.text(),await readFile(out+'/'+file,'utf8'));}
  const localeResponse=await get('/api/index?action=locale'),locale=await localeResponse.json();
  assert.ok(localeResponse.ok&&['ja','en'].includes(locale.language));assert.match(localeResponse.headers.get('cache-control'),/no-store/);
  const base=await get('/app.html');assert.equal(await base.text(),await readFile(out+'/app.html','utf8'));
  console.log(JSON.stringify({result:'PASS',version:config.version,languages:config.languages,marketCounts:config.marketCounts,favoritesAssets:true,currency:'JPY',rankingTimezone:'Asia/Tokyo',exactBuiltAssets:true,liveLocale:locale,checkedAt:new Date().toISOString(),markets:config.markets,storage:config.storage,note:'Anonymous production config/static/auth only. Authenticated trading and favorites journeys run with isolated fixtures, not existing production accounts.'}));process.exit(0);
 }catch(e){error=e.message;}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
throw Error('Public bilingual deployment verification failed: '+error);
