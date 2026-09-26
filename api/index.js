import { createApp } from '../lib/app.mjs';
import { SupabaseStore } from '../lib/store.mjs';
import { createMarket } from '../lib/market.mjs';
import { productionConfig } from '../lib/config.mjs';
const config = productionConfig(process.env);
const market = createMarket({ provider: config.provider, yahooApproved: config.yahooApproved });
let store = null;
try {
  if (!config.issues.length) store = new SupabaseStore(config.databaseUrl, config.databaseKey);
} catch { config.issues.push('DATABASE_INITIALIZATION'); }
const handler = createApp({ store, market, secret: config.secret, quoteSecret: config.quoteSecret,
  origin: config.origin, setupIssues: config.issues, secure: true });
export default { fetch: handler };
