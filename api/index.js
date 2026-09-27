import { createApp } from '../lib/app.mjs';
import { withLocalization } from '../lib/locale.mjs';
import { SupabaseStore } from '../lib/store.mjs';
import { createMarket } from '../lib/market.mjs';
import { productionConfig } from '../lib/config.mjs';
const config=productionConfig(process.env);
let store=null;
try{if(!config.issues.length)store=new SupabaseStore(config.databaseUrl,config.databaseKey);}catch{config.issues.push('DATABASE_INITIALIZATION');}
const market=createMarket({store,coinGeckoKey:config.coinGeckoKey});
export default {fetch:withLocalization(createApp({store,market,secret:config.secret,quoteSecret:config.quoteSecret,origin:config.origin,setupIssues:config.issues,secure:true}))};
