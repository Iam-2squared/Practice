import { AppError, invariant, validMoney } from './domain.mjs';
const MAX_RESPONSE_BYTES=256*1024; const CACHE_MS=30_000;
const ASSETS=[
 {symbol:'BTC',name:'Bitcoin',type:'crypto',source:'coingecko',id:'bitcoin',unit:'BTC',step:0.00001},
 {symbol:'ETH',name:'Ethereum',type:'crypto',source:'coingecko',id:'ethereum',unit:'ETH',step:0.0001},
 {symbol:'SOL',name:'Solana',type:'crypto',source:'coingecko',id:'solana',unit:'SOL',step:0.001},
 {symbol:'XRP',name:'XRP',type:'crypto',source:'coingecko',id:'ripple',unit:'XRP',step:1},
 {symbol:'USDJPY',name:'米ドル / 円',type:'fx',source:'frankfurter',base:'USD',unit:'USD',step:1},
 {symbol:'EURJPY',name:'ユーロ / 円',type:'fx',source:'frankfurter',base:'EUR',unit:'EUR',step:1},
 {symbol:'GBPJPY',name:'英ポンド / 円',type:'fx',source:'frankfurter',base:'GBP',unit:'GBP',step:1},
 {symbol:'AUDJPY',name:'豪ドル / 円',type:'fx',source:'frankfurter',base:'AUD',unit:'AUD',step:1},
];
const bySymbol=s=>ASSETS.find(x=>x.symbol===String(s||'').toUpperCase());
async function json(response){
 invariant(response.ok,'MARKET_UNAVAILABLE','価格を取得できません。時間をおいて更新してください。',503);
 invariant(Number(response.headers.get('content-length')||0)<=MAX_RESPONSE_BYTES,'MARKET_RESPONSE','価格データが大きすぎます。',503);
 const text=await response.text(); invariant(text.length<=MAX_RESPONSE_BYTES,'MARKET_RESPONSE','価格データが大きすぎます。',503);
 try{return JSON.parse(text)}catch{throw new AppError('MARKET_RESPONSE','価格データを読み取れません。',503)}
}
export function createMarket({fetcher=fetch,clock=Date.now,coinGeckoKey=''}={}){
 const cache=new Map();
 async function fetchQuote(asset){
  const now=clock(), hit=cache.get(asset.symbol); if(hit&&now-hit.fetchedAt<CACHE_MS)return structuredClone(hit.quote);
  let price,quoteAt=now,attribution,url;
  if(asset.type==='crypto'){
   const headers={accept:'application/json'}; if(coinGeckoKey)headers['x-cg-demo-api-key']=coinGeckoKey;
   const body=await json(await fetcher(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(asset.id)}&vs_currencies=jpy&include_last_updated_at=true`,{headers,signal:AbortSignal.timeout(8000)}));
   price=body?.[asset.id]?.jpy; if(Number.isFinite(body?.[asset.id]?.last_updated_at))quoteAt=body[asset.id].last_updated_at*1000;
   attribution='CoinGecko';url='https://www.coingecko.com/';
  }else{
   const body=await json(await fetcher(`https://api.frankfurter.dev/v1/latest?base=${asset.base}&symbols=JPY`,{headers:{accept:'application/json'},signal:AbortSignal.timeout(8000)}));
   price=body?.rates?.JPY; const parsed=Date.parse(String(body?.date||'')); if(Number.isFinite(parsed))quoteAt=parsed;
   attribution='Frankfurter';url='https://frankfurter.dev/';
  }
  const priceMinor=Math.round(Number(price)*100);
  invariant(Number.isFinite(price)&&price>0&&validMoney(priceMinor),'MARKET_PRICE','有効な価格を取得できません。',503);
  const quote={...asset,priceMinor,currency:'JPY',quoteAt,fetchedAt:now,attribution,attributionUrl:url,referenceOnly:true};
  cache.set(asset.symbol,{quote,fetchedAt:now}); return structuredClone(quote);
 }
 return {provider:'multi',status:()=> 'enabled',assertReady(){},
  async search(query,type='all'){const q=String(query||'').normalize('NFKC').toLowerCase().trim();return ASSETS.filter(a=>(type==='all'||a.type===type)&&(!q||a.symbol.toLowerCase().includes(q)||a.name.toLowerCase().includes(q))).slice(0,20)},
  async quote(symbol){const a=bySymbol(symbol);invariant(a,'MARKET_UNSUPPORTED','対応していない銘柄です。',404);return fetchQuote(a)},
  assets:ASSETS
 };
}
