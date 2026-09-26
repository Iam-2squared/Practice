import { createHmac } from 'node:crypto';
export function normalizeSupabaseUrl(value) {
  const url=typeof value==='string'?value.trim().replace(/\/+$/,''):'';
  return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)?url:null;
}
export function normalizeOrigin(value) {
  const text=typeof value==='string'?value.trim().replace(/\/+$/,''):'';
  try {const u=new URL(text);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'?u.origin:null;}catch{return null;}
}
export function productionConfig(env) {
  const issues=[],text=k=>typeof env[k]==='string'?env[k].trim():'';
  if(text('PRACTICE_STORE')!=='supabase')issues.push('PRACTICE_STORE');
  const databaseUrl=normalizeSupabaseUrl(env.SUPABASE_URL),databaseKey=text('SUPABASE_SECRET_KEY');
  if(!databaseUrl)issues.push('SUPABASE_URL');if(!databaseKey)issues.push('SUPABASE_SECRET_KEY');
  // Preserve the exact account lookup secret; changing it locks out old passwords.
  const secret=env.APP_SECRET;if(typeof secret!=='string'||secret.length<64||/[\r\n]/.test(secret))issues.push('APP_SECRET');
  const origin=normalizeOrigin(env.APP_ORIGIN);if(!origin)issues.push('APP_ORIGIN');
  const quoteSecret=issues.length?null:createHmac('sha256',databaseKey).update('practice-quote-v1\0').update(secret).digest('hex');
  return {issues,databaseUrl,databaseKey,secret,quoteSecret,origin,coinGeckoKey:text('COINGECKO_DEMO_API_KEY')};
}
