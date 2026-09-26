import { createApp } from '../lib/app.mjs';
import { SupabaseStore } from '../lib/store.mjs';
import { createMarket } from '../lib/market.mjs';
const env = process.env;
const market = createMarket({ provider: env.MARKET_PROVIDER || 'demo', yahooApproved: env.YAHOO_DATA_USE_APPROVED === 'true' });
const configured = env.PRACTICE_STORE === 'supabase' && env.SUPABASE_URL && env.SUPABASE_SECRET_KEY &&
  env.APP_SECRET?.length >= 64 && /^https:\/\/[^/]+$/.test(env.APP_ORIGIN || '');
let store = null;
try { if (configured) store = new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY); } catch { /* Fail closed, show setup state. */ }
const handler = createApp({ store, market, secret: env.APP_SECRET, origin: env.APP_ORIGIN, secure: true });
export default { fetch: handler };
