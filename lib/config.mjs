import { createHmac } from 'node:crypto';

// Only normalize harmless copy/paste variations. Never accept another host/path.
export function normalizeSupabaseUrl(value) {
  const url = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  return /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) ? url : null;
}
export function normalizeOrigin(value) {
  const text = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}
export function productionConfig(env) {
  const issues = [];
  const text = key => typeof env[key] === 'string' ? env[key].trim() : '';
  if (text('PRACTICE_STORE') !== 'supabase') issues.push('PRACTICE_STORE');
  const databaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);
  if (!databaseUrl) issues.push('SUPABASE_URL');
  const databaseKey = text('SUPABASE_SECRET_KEY');
  if (!databaseKey) issues.push('SUPABASE_SECRET_KEY');
  // This is also the credential lookup key. Changing/normalizing it could lock out existing accounts.
  const secret = env.APP_SECRET;
  if (typeof secret !== 'string' || secret.length < 64 || /[\r\n]/.test(secret)) issues.push('APP_SECRET');
  const origin = normalizeOrigin(env.APP_ORIGIN);
  if (!origin) issues.push('APP_ORIGIN');
  const provider = text('MARKET_PROVIDER') || 'demo';
  const yahooApproved = text('YAHOO_DATA_USE_APPROVED') === 'true';
  // Separate quote signing from the account lookup key. Knowledge of APP_SECRET alone
  // must not allow a client to manufacture a price. Rotating a DB key only expires quotes.
  const quoteSecret = issues.length ? null : createHmac('sha256', databaseKey)
    .update('practice-quote-v1\0').update(secret).digest('hex');
  return { issues, databaseUrl, databaseKey, secret, quoteSecret, origin, provider, yahooApproved };
}
