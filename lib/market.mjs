import { ASSETS, assetFor, attribution } from './catalog.mjs';
import { AppError, invariant, normalizeSymbol, validMoney } from './domain.mjs';
const CRYPTO_TTL=300_000, FX_TTL=14_400_000, MAX_BYTES=262144;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
export function assertFresh(q,now=Date.now()) {
  const a=assetFor(q?.symbol);
  invariant(a&&q.type===a.type&&q.unit===a.unit&&q.source===a.source&&q.currency==='JPY'&&validMoney(q.priceMinor)&&q.priceMinor>0,'MARKET_PRICE','価格情報を確認できません。',503);
  invariant(finite(q.fetchedAt)&&q.fetchedAt>0&&q.fetchedAt<=now+30_000,'MARKET_TIME','取得時刻を確認できません。',503);
  if(a.type==='crypto') invariant(finite(q.quoteAt)&&q.quoteAt>0&&q.quoteAt<=now+30_000&&now-q.quoteAt<=900_000,'MARKET_STALE','暗号資産の価格が古いか、価格時刻を確認できません。',503);
  else {
    const date=q.quoteDate, t=typeof date==='string'?Date.parse(date+'T00:00:00Z'):NaN;
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(date||'')&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===date&&date<=new Date(now).toISOString().slice(0,10)&&now-t<=10*86400_000&&q.quoteAt===null,'MARKET_STALE','為替レートの対象日が古いか、確認できません。',503);
  }
  return q;
}
function quote(a,price,when,now) {
  const priceMinor=Math.round(price*100);
  invariant(finite(price)&&price>0&&validMoney(priceMinor)&&priceMinor>0,'MARKET_PRICE','有効な参考価格がありません。',503);
  return assertFresh({...a,priceMinor,currency:'JPY',quoteAt:a.type==='crypto'?when:null,quoteDate:a.type==='fx'?when:null,fetchedAt:now,referenceOnly:true,attribution:attribution(a.source)},now);
}
export function parseCrypto(body,now) {
  return ASSETS.filter(a=>a.type==='crypto').map(a=>{
    const r=body?.[a.id];invariant(finite(r?.last_updated_at),'MARKET_TIME','CoinGeckoの価格時刻がありません。',503);
    return quote(a,r.jpy,r.last_updated_at*1000,now);
  });
}
export function parseFx(body,now) {
  invariant(body?.base==='EUR'&&body.amount===1,'MARKET_CURRENCY','為替レートの基準通貨を確認できません。',503);
  invariant(finite(body.rates?.JPY)&&body.rates.JPY>0,'MARKET_PRICE','円レートがありません。',503);
  return ASSETS.filter(a=>a.type==='fx').map(a=>{
    const rate=a.unit==='EUR'?1:body.rates[a.unit];invariant(finite(rate)&&rate>0,'MARKET_PRICE','外貨レートがありません。',503);
    return quote(a,body.rates.JPY/rate,body.date,now);
  });
}
async function readJson(r) {
  invariant(Number(r.headers.get('content-length')||0)<=MAX_BYTES,'MARKET_RESPONSE','価格データが大きすぎます。',503);
  const reader=r.body?.getReader();invariant(reader,'MARKET_RESPONSE','価格データがありません。',503);
  let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new AppError('MARKET_RESPONSE','価格データが大きすぎます。',503);}chunks.push(Buffer.from(value));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AppError('MARKET_RESPONSE','価格データを読み取れません。',503);}
}
export function createMarket({fetcher=fetch,clock=Date.now,coinGeckoKey='',store=null}={}) {
  const local=new Map(),pending=new Map();
  const status=()=>({crypto:coinGeckoKey?'enabled':'key-required',fx:'enabled'});
  function ready(symbol) {const a=assetFor(symbol);invariant(a,'SYMBOL','対応していない銘柄です。');if(a.type==='crypto')invariant(coinGeckoKey,'CRYPTO_SETUP','仮想通貨は管理者のCoinGecko無料APIキー設定待ちです。FXは利用できます。',503);}
  async function load(group) {
    const now=clock(),ttl=group==='crypto'?CRYPTO_TTL:FX_TTL;
    let cached=local.get(group);
    if(!cached||now>=cached.nextFetchAt)cached=store?await store.getCache(group):cached;
    if(cached&&now<cached.nextFetchAt){if(cached.error)throw new AppError(cached.error,'データ提供元への再取得を待機中です。時間をおいて更新してください。',503);if(cached.payload){cached.payload.forEach(q=>assertFresh(q,now));return cached.payload;}}
    const claim=store?await store.claimCache(group,now):{claimed:true,token:'local'};
    if(!claim.claimed){if(claim.cached?.payload&&!claim.cached.error){claim.cached.payload.forEach(q=>assertFresh(q,now));return claim.cached.payload;}throw new AppError('MARKET_BUSY','参考価格を更新中です。少し時間をおいて再度お試しください。',503);}
    // Reserve the whole five-minute interval even on failure. No rapid retries or alternate providers.
    let retryMs=300_000;
    try {
      const headers={accept:'application/json'};
      const url=group==='crypto'
        ? 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=jpy&include_last_updated_at=true'
        : 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY,USD,GBP,AUD';
      if(group==='crypto')headers['x-cg-demo-api-key']=coinGeckoKey;
      const r=await fetcher(url,{headers,signal:AbortSignal.timeout(8000),redirect:'error'});
      if(!r.ok){const raw=r.headers.get('retry-after');const t=raw&&/^\d+$/.test(raw)?Number(raw)*1000:Date.parse(raw||'')-clock();if(Number.isFinite(t))retryMs=Math.min(86400_000,Math.max(retryMs,t));await r.body?.cancel().catch(()=>{});throw new AppError(r.status===429?'MARKET_RATE_LIMIT':[401,403].includes(r.status)?'MARKET_ACCESS':'MARKET_UNAVAILABLE','データ提供元から価格を取得できません。キー・取得制限を確認してください。',503);}
      const body=await readJson(r),at=clock(),payload=(group==='crypto'?parseCrypto:parseFx)(body,at);
      cached={payload,fetchedAt:at,nextFetchAt:at+ttl,error:null};local.set(group,cached);
      if(store)await store.saveCache(group,claim.token,cached);
      return payload;
    }catch(error){const e=error instanceof AppError?error:new AppError('MARKET_UNAVAILABLE','通信を完了できません。価格未確認のため注文は停止しています。',503);local.set(group,{payload:null,fetchedAt:clock(),nextFetchAt:clock()+retryMs,error:e.code});if(store)await store.failCache(group,claim.token,e.code,retryMs).catch(()=>{});throw e;}
  }
  return {provider:'multi',status,assertReady:ready,
    async search(query,type='crypto') {invariant(['crypto','fx'].includes(type),'ASSET_TYPE','仮想通貨またはFXを選んでください。');const q=String(query||'').normalize('NFKC').toLowerCase().trim().slice(0,80);return ASSETS.filter(a=>a.type===type&&(!q||`${a.symbol} ${a.name} ${a.alias}`.toLowerCase().includes(q))).map(a=>({...a}));},
    async quote(input) {const symbol=normalizeSymbol(input);ready(symbol);const group=assetFor(symbol).type;if(!pending.has(group)){const task=load(group);pending.set(group,task);task.finally(()=>pending.delete(group)).catch(()=>{});}const rows=await pending.get(group);return structuredClone(assertFresh(rows.find(q=>q.symbol===symbol),clock()));},
  };
}
