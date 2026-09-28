import test from 'node:test';
import assert from 'node:assert/strict';
import {FAVORITES_KEY,parseFavorites,favoriteFirst,createFavorites} from '../public/favorites.js';
const storage=()=>{const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data};};
test('favorites persist toggle and removal across instances',()=>{
 const local=storage(),a=createFavorites(()=>local);assert.deepEqual(a.symbols,[]);
 assert.deepEqual(a.toggle('SOL'),{selected:true,saved:true});
 const b=createFavorites(()=>local);assert.equal(b.has('SOL'),true);b.toggle('USDJPY');b.toggle('SOL');
 assert.deepEqual(createFavorites(()=>local).symbols,['USDJPY']);assert.deepEqual([...local.data.keys()],[FAVORITES_KEY]);
});
test('stable favorite partition restores original catalog order without mutating input',()=>{
 const items=['BTC','ETH','SOL','XRP'].map(symbol=>({symbol}));
 assert.deepEqual(favoriteFirst(items,['XRP','SOL']).map(x=>x.symbol),['SOL','XRP','BTC','ETH']);
 assert.deepEqual(favoriteFirst(items,[]).map(x=>x.symbol),['BTC','ETH','SOL','XRP']);assert.deepEqual(items.map(x=>x.symbol),['BTC','ETH','SOL','XRP']);
});
test('favorites cannot inject another market or bypass a search filter',()=>{
 const items=['EURJPY','CADJPY'].map(symbol=>({symbol}));assert.deepEqual(favoriteFirst(items,['BTC','USDJPY','CADJPY']).map(x=>x.symbol),['CADJPY','EURJPY']);
});
for(const raw of [null,'','{','null','[]','{"version":2,"symbols":["BTC"]}','{"version":1,"symbols":{}}',' '.repeat(8193)])test(`malformed preference ignored: ${String(raw).slice(0,40)}`,()=>assert.deepEqual(parseFavorites(raw),[]));
test('preferences deduplicate and reject markup and invalid identifiers',()=>{
 assert.deepEqual(parseFavorites(JSON.stringify({version:1,symbols:['BTC',null,12,'BTC','<img>','../x','btc','CADJPY']})),['BTC','CADJPY']);assert.throws(()=>createFavorites(storage).toggle('<script>'),TypeError);
});
test('denied storage falls back to in-memory preferences without claiming persistence',()=>{
 const a=createFavorites(()=>{throw Error('blocked');});assert.equal(a.saved,false);assert.deepEqual(a.toggle('BNB'),{selected:true,saved:false});assert.equal(a.has('BNB'),true);assert.deepEqual(a.toggle('BNB'),{selected:false,saved:false});
});
test('quota failure retains existing and changed favorites in memory',()=>{
 const local=storage();local.setItem(FAVORITES_KEY,JSON.stringify({version:1,symbols:['BTC']}));local.setItem=()=>{throw Error('quota');};const a=createFavorites(()=>local);assert.deepEqual(a.toggle('CHFJPY'),{selected:true,saved:false});assert.deepEqual(a.symbols,['BTC','CHFJPY']);
});
test('cross-tab reload and clear never write back or expose internal arrays',()=>{
 const local=storage(),a=createFavorites(()=>local);a.reload(JSON.stringify({version:1,symbols:['LTC','NZDJPY']}));assert.deepEqual(a.symbols,['LTC','NZDJPY']);assert.equal(local.data.size,0);a.symbols.push('BTC');assert.equal(a.has('BTC'),false);a.reload(null);assert.deepEqual(a.symbols,[]);
});
