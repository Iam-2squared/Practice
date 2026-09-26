import test from 'node:test';
import assert from 'node:assert/strict';
import { productionConfig, normalizeOrigin, normalizeSupabaseUrl } from '../lib/config.mjs';
import { createApp } from '../lib/app.mjs';
import { createMarket } from '../lib/market.mjs';
import { SupabaseStore } from '../lib/store.mjs';
const env = () => ({ PRACTICE_STORE:'supabase', SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_SECRET_KEY:'sb_secret_fixture_not_a_real_key', APP_SECRET:'test-only-existing-lookup-key-'.repeat(3), APP_ORIGIN:'https://practice.example', MARKET_PROVIDER:'demo' });
test('copy/paste slash and surrounding whitespace no longer disable storage',()=>{
 const e=env();e.SUPABASE_URL=' \nhttps://example.supabase.co/\n';e.APP_ORIGIN=' https://practice.example/ ';e.PRACTICE_STORE='supabase\n';
 const c=productionConfig(e);assert.deepEqual(c.issues,[]);assert.equal(c.databaseUrl,'https://example.supabase.co');assert.equal(c.origin,'https://practice.example');
 assert.equal(new SupabaseStore(e.SUPABASE_URL,e.SUPABASE_SECRET_KEY).url,'https://example.supabase.co/rest/v1');
});
for(const value of ['http://example.supabase.co','https://evil.example','https://example.supabase.co.evil.example','https://example.supabase.co@evil.example','https://example.supabase.co/rest/v1','https://example.supabase.co?x=1','https://example.supabase.co#x','https://example.supabase.co:444','https://user@example.supabase.co',null])
 test(`database URL rejects unsupported target ${value}`,()=>assert.equal(normalizeSupabaseUrl(value),null));
for(const value of ['http://practice.example','https://practice.example/path','https://user:pass@practice.example','https://practice.example?x=1','https://practice.example#x','not-a-url',null])
 test(`public origin rejects non-origin ${value}`,()=>assert.equal(normalizeOrigin(value),null));
for(const key of ['PRACTICE_STORE','SUPABASE_URL','SUPABASE_SECRET_KEY','APP_SECRET','APP_ORIGIN'])
 test(`setup diagnostics isolate ${key} without exposing its value`,()=>{const e=env();delete e[key];assert.deepEqual(productionConfig(e).issues,[key]);});
test('short or multiline app secret is rejected, never silently normalized',()=>{
 const e=env();e.APP_SECRET='x'.repeat(63);assert.ok(productionConfig(e).issues.includes('APP_SECRET'));
 e.APP_SECRET='x'.repeat(64)+'\n';assert.ok(productionConfig(e).issues.includes('APP_SECRET'));
 e.APP_SECRET='x'.repeat(64);assert.equal(productionConfig(e).secret,e.APP_SECRET);
});
test('lookup secret remains unchanged, quote signing key depends on private server key',()=>{
 const e=env();const c=productionConfig(e);assert.equal(c.secret,e.APP_SECRET);assert.match(c.quoteSecret,/^[a-f0-9]{64}$/);assert.notEqual(c.quoteSecret,c.secret);
 const d=productionConfig({...e,SUPABASE_SECRET_KEY:e.SUPABASE_SECRET_KEY+'changed'});assert.equal(d.secret,c.secret);assert.notEqual(d.quoteSecret,c.quoteSecret);
});
test('public config reports only allowlisted issue names, never private values',async()=>{
 const e=env();const c=productionConfig({...e,SUPABASE_URL:'invalid'});
 const app=createApp({market:createMarket(),origin:c.origin,secret:c.secret,setupIssues:[...c.issues,e.APP_SECRET,e.SUPABASE_SECRET_KEY]});
 const response=await app(new Request('https://practice.example/api?action=config'));const text=await response.text();const data=JSON.parse(text);
 assert.equal(data.accountsAvailable,false);assert.deepEqual(data.setupIssues,['SUPABASE_URL']);assert.equal(data.publicOrigin,'https://practice.example');
 assert.ok(!text.includes(e.APP_SECRET));assert.ok(!text.includes(e.SUPABASE_SECRET_KEY));assert.equal(data.marketStatus,'demo');
});
test('Yahoo authorization must be explicit and is independent from account storage',()=>{
 assert.equal(productionConfig({...env(),MARKET_PROVIDER:'yahoo'}).yahooApproved,false);
 assert.equal(productionConfig({...env(),YAHOO_DATA_USE_APPROVED:'false'}).yahooApproved,false);
});
