import { createApp } from '../lib/app.mjs';
import { SupabaseStore } from '../lib/store.mjs';
import { createMarket } from '../lib/market.mjs';
import { productionConfig } from '../lib/config.mjs';
const config=productionConfig(process.env);
const market=createMarket({coinGeckoKey:process.env.COINGECKO_DEMO_API_KEY||''});
let store=null;try{if(!config.issues.filter(x=>!['MARKET_PROVIDER','YAHOO_DATA_USE_APPROVED'].includes(x)).length)store=new SupabaseStore(config.databaseUrl,config.databaseKey)}catch{config.issues.push('DATABASE_INITIALIZATION')}
const handler=createApp({store,market,secret:config.secret,quoteSecret:config.quoteSecret,origin:config.origin,setupIssues:config.issues,secure:true});
export default{fetch:handler};
