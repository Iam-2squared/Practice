// Display preference only. Never use this result for authorization or pricing.
export const LANGUAGES=Object.freeze(['ja','en']);
export const VERSION='1.2.0';
export const validLanguage=value=>LANGUAGES.includes(value)?value:null;
export function browserLanguage(header=''){
 const items=String(header).slice(0,2048).split(',').map((entry,index)=>{const [tag,...params]=entry.trim().split(';');const qpart=params.find(p=>/^\s*q=/i.test(p));const q=qpart?Number(qpart.split('=')[1]):1;return{tag:tag.toLowerCase(),q,index};}).filter(x=>Number.isFinite(x.q)&&x.q>0&&x.q<=1).sort((a,b)=>b.q-a.q||a.index-b.index);
 for(const {tag}of items){if(tag==='ja'||tag.startsWith('ja-'))return'ja';if(tag==='en'||tag.startsWith('en-'))return'en';}
 return'en';
}
export function requestLanguage(request){
 const url=new URL(request.url),explicit=validLanguage(url.searchParams.get('lang'))||validLanguage(request.headers.get('x-practice-language'));
 if(explicit)return{language:explicit,source:'explicit'};
 const country=(request.headers.get('x-vercel-ip-country')||'').trim().toUpperCase();
 if(/^[A-Z]{2}$/.test(country)&&!['XX','ZZ','EU'].includes(country))return{language:country==='JP'?'ja':'en',source:'country'};
 return{language:browserLanguage(request.headers.get('accept-language')||''),source:'browser'};
}
const EN_ERRORS={
 METHOD:'This operation is not supported.',SETUP_REQUIRED:'Practice account storage is being prepared. Please try again later.',
 AUTH:'Please sign in with your password.',LOGIN:'Please check your password.',USERNAME:'Use a username of 2 to 15 characters.',USERNAME_UNAVAILABLE:'This username is already in use.',PASSWORD_UNAVAILABLE:'This password is unavailable. Please choose another.',PASSWORD:'Use a password of 6 to 128 characters without control characters.',
 RATE_LIMIT:'Too many requests. Please wait a minute and try again.',ORIGIN:'Open the official Practice site to continue.',CSRF:'This request could not be verified. Please reopen the official Practice site.',CONTENT_TYPE:'Send a JSON request.',BODY:'The request body is invalid.',BODY_SIZE:'The request is too large.',BODY_TOO_LARGE:'The request is too large.',JSON:'The request is not valid JSON.',CONFIRM_DELETE:'Confirm account deletion before continuing.',
 SYMBOL:'Select a supported market.',SIDE:'Choose Buy or Sell.',QUANTITY:'Use the minimum trade size for this market.',TOTAL:'The trade amount is outside the allowed range.',ORDER:'Please check the order details.',REQUEST_ID:'The order identifier is invalid.',QUOTE:'The quote does not match this market.',QUOTE_TOKEN:'This quote could not be verified. Refresh the reference price.',QUOTE_EXPIRED:'This quote has expired. Refresh the reference price before placing a new order.',STALE_QUOTE:'The reference price is too old. Please refresh it.',INSUFFICIENT_CASH:'Not enough virtual cash for this purchase.',INSUFFICIENT_SHARES:'You cannot sell more than you hold.',
 IDEMPOTENCY_CONFLICT:'Do not reuse an order identifier for a different order.',CONCURRENT_ORDER:'Another order is being processed. Retry using the same order identifier.',STATE:'The account state could not be verified.',OFFSET:'The history position is invalid.',
 COMMENT:'Enter a comment of 1 to 280 characters without control characters.',COMMENT_ROOM:'This discussion room is not supported.',COMMENT_NOT_FOUND:'The comment was not found.',
 BADGES:'Select up to three distinct earned achievements.',BADGE_LOCKED:'Only earned achievements can be selected.',RANKING_MODE:'Choose Weekly or Total assets.',RANKING_BUSY:'The ranking is temporarily unavailable. Please try again later.',PROGRESS:'Progress could not be loaded.',PROGRESS_EVENT:'This progress event is not supported.',WEEK:'The weekly period could not be verified.',WEEK_BASELINE:'The starting balance for this week could not be verified.',WEEK_PRICE:'The starting reference price for this week is unavailable.',
 CRYPTO_SETUP:'Crypto reference data is not configured yet. FX remains available.',CONFIG:'Please check the service configuration.',MIGRATION_REQUIRED:'Account storage is being updated. Your records are retained.',DB_UNAVAILABLE:'Account storage is temporarily unavailable. Retry uncertain orders using the same order identifier.',
 CHART_PERIOD:'Select a supported chart period.',CHART_BUDGET:'The shared monthly chart allowance has been reached. Current quotes and trading remain separate.',CHART_UNAVAILABLE:'Price history is temporarily unavailable. Current quotes are requested separately.',CHART_DATA:'The price history could not be verified.',CHART_RESPONSE:'The data provider returned an invalid history response.',CHART_RATE_LIMIT:'The data provider is busy. Wait before retrying.',MARKET_PRICE:'The reference price could not be verified.',MARKET_TIME:'The reference quote timestamp could not be verified.',MARKET_STALE:'The reference price or its date is too old or unavailable. Please refresh.',MARKET_UNAVAILABLE:'Reference prices are temporarily unavailable. Please try again later.',NOT_FOUND:'This operation was not found.',INTERNAL:'The operation could not be completed. For an uncertain order, retry using the same order identifier.'
};
export function englishError(error){return{...error,message:EN_ERRORS[error?.code]||'The operation could not be completed. Please try again later. For an uncertain order, reuse the same order identifier.'};}
export const DISPLAY_LABELS=Object.freeze({
 '仮想口座を作る':'Create a practice account','仮想の10万円でスタート':'Start with JPY 100,000 in virtual funds','チャートを見る':'Explore a chart','相場の動きとデータの日付を確認':'Check price movements and data dates','はじめての仮想購入':'Make your first virtual purchase','好きな銘柄を少額で体験':'Try a small virtual purchase','はじめての仮想売却':'Make your first virtual sale','保有した銘柄を売ってみる':'Try selling a holding','資産と損益を確認':'Review your portfolio','仮想資産の増減を振り返る':'Review changes in your virtual assets',
 '＋1,000円突破':'+JPY 1,000 reached','＋2,000円突破':'+JPY 2,000 reached','仮想通貨3売買':'3 Crypto trades','FX3売買':'3 FX trades','−1,000円を経験':'Experienced -JPY 1,000','−2,000円を経験':'Experienced -JPY 2,000',
 '総資産が初期10万円より1,000円以上増えた':'Total assets rose at least JPY 1,000 above the initial JPY 100,000','総資産が初期10万円より2,000円以上増えた':'Total assets rose at least JPY 2,000 above the initial JPY 100,000','仮想通貨の購入・売却を合計3回成立させた':'Completed 3 Crypto purchases or sales in total','FXの購入・売却を合計3回成立させた':'Completed 3 FX purchases or sales in total','総資産が初期10万円より1,000円以上減った経験':'Total assets fell at least JPY 1,000 below the initial JPY 100,000','総資産が初期10万円より2,000円以上減った経験':'Total assets fell at least JPY 2,000 below the initial JPY 100,000',
 '約5分ごと':'Approximately every 5 minutes','約1時間ごと':'Approximately hourly','日次（UTC）':'Daily (UTC)','日次（営業日のみ）':'Daily (business days only)',
 '約5分':'About 5 minutes','約1時間':'About 1 hour','日次':'Daily','営業日日次':'Business-day daily','営業日ごと':'Business-day daily'
});
// Localize only trusted display fields. Usernames, comments, ledger values,
// symbols, account IDs, quote tokens and error codes are never translated.
export function withLocalization(handle){return async request=>{
 const choice=requestLanguage(request),headers={'Cache-Control':'private, no-store','Vary':'X-Vercel-IP-Country, Accept-Language, X-Practice-Language','Content-Language':choice.language,'X-Content-Type-Options':'nosniff'};
 const action=new URL(request.url).searchParams.get('action')||'config';
 if(request.method==='GET'&&action==='locale')return Response.json({...choice,languages:LANGUAGES},{headers});
 const response=await handle(request);
 if(!response.headers.get('content-type')?.includes('application/json'))return response;
 const data=await response.json();
 if(action==='config'&&response.ok){data.version=VERSION;data.languages=LANGUAGES;data.language=choice.language;}
 if(choice.language==='en'){
  if(data.error)data.error=englishError(data.error);
  if(action==='progress'&&response.ok){for(const field of ['missions','achievements'])for(const item of data[field]||[])for(const key of ['label','description'])if(DISPLAY_LABELS[item[key]])item[key]=DISPLAY_LABELS[item[key]];}
  if(action==='price-history'&&data.chart){const label=data.chart.granularityLabel;data.chart.granularityLabel=DISPLAY_LABELS[label]||(data.chart.type==='fx'?'Business-day reference prices':'Historical reference prices');}
 }
 return Response.json(data,{status:response.status,headers:{...Object.fromEntries(response.headers),...headers}});
};}
