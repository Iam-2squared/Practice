import { AppError, invariant, normalizeSymbol, validMoney } from './domain.mjs';
import { CATALOG, catalogSearch } from './catalog.mjs';
// Synthetic fixed fixtures. These are never a fallback for a failed live quote.
const DEMO_PRICES = [280050, 340020, 950000, 810030, 180050, 15030, 4400000, 370000, 260000, 510000, 430000, 350000, 270000, 150000, 310000, 330000, 5800000, 2600000, 410000, 220000];
const MAX_RESPONSE_BYTES = 512 * 1024;
const QUOTE_TTL = 15_000;
const LIVE_MAX_AGE = 30 * 60_000;
const CLOSED_MAX_AGE = 5 * 86400_000;
const number = v => typeof v === 'number' && Number.isFinite(v);

export function parseYahooChart(body, symbol, now = Date.now()) {
  const m = body?.chart?.result?.[0]?.meta;
  invariant(m && !body?.chart?.error && m.symbol === symbol && m.currency === 'JPY' && m.instrumentType === 'EQUITY',
    'MARKET_UNSUPPORTED', 'この銘柄の日本株データを取得できません。', 503);
  const priceMinor = Math.round(m.regularMarketPrice * 100);
  invariant(number(m.regularMarketPrice) && validMoney(priceMinor) && priceMinor > 0, 'MARKET_PRICE', '有効な株価がありません。', 503);
  const quoteAt = m.regularMarketTime * 1000;
  invariant(number(m.regularMarketTime) && Number.isFinite(quoteAt) && quoteAt > 0 && quoteAt <= now + 60_000,
    'MARKET_TIME', '株価時刻を確認できません。', 503);
  const regular = m.currentTradingPeriod?.regular;
  const periodKnown = number(regular?.start) && number(regular?.end) && regular.start > 0 && regular.end > regular.start;
  const inSession = periodKnown && now >= regular.start * 1000 && now < regular.end * 1000;
  // Missing session metadata is NOT permission to accept a five-day-old quote.
  const maxAge = periodKnown && !inSession ? CLOSED_MAX_AGE : LIVE_MAX_AGE;
  invariant(now - quoteAt <= maxAge, 'MARKET_STALE', '株価が古いため注文を停止しています。', 503);
  const previous = number(m.previousClose) ? m.previousClose : m.chartPreviousClose;
  const previousMinor = number(previous) ? Math.round(previous * 100) : null;
  return { symbol, name: CATALOG.find(x => x.symbol === symbol)?.name || String(m.longName || m.shortName || symbol).slice(0,100),
    priceMinor, currency: 'JPY', quoteAt, fetchedAt: now, source: 'yahoo',
    previousCloseMinor: previousMinor > 0 && validMoney(previousMinor) ? previousMinor : null,
    delayMinutes: number(m.exchangeDataDelayedBy) && m.exchangeDataDelayedBy >= 0 ? m.exchangeDataDelayedBy : null,
    referenceOnly: !inSession, sessionState: !periodKnown ? 'unknown' : inSession ? 'regular' : 'outside-regular' };
}
async function readJson(response) {
  invariant(Number(response.headers.get('content-length') || 0) <= MAX_RESPONSE_BYTES,
    'MARKET_RESPONSE', '株価データの応答サイズが想定外です。', 503);
  const reader = response.body?.getReader();
  invariant(reader, 'MARKET_RESPONSE', '株価データがありません。', 503);
  const chunks = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new AppError('MARKET_RESPONSE', '株価データの応答サイズが想定外です。', 503); }
    chunks.push(Buffer.from(value));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError('MARKET_RESPONSE', '株価データを読み取れません。', 503); }
}
export function createMarket({ provider = 'demo', yahooApproved = false, fetcher = fetch, clock = Date.now } = {}) {
  // Per-instance only: not a cross-region/distributed cache.
  const cache = new Map(); const pending = new Map();
  let pausedUntil = 0; let pausedCode = 'MARKET_RATE_LIMIT';
  function status() {
    return provider === 'demo' ? 'demo' : provider !== 'yahoo' ? 'invalid-provider' : yahooApproved ? 'enabled' : 'permission-required';
  }
  function enabled() {
    invariant(provider === 'demo' || provider === 'yahoo', 'PROVIDER', 'データ配信の設定を確認してください。', 503);
    if (provider === 'yahoo') invariant(yahooApproved, 'MARKET_PERMISSION', 'Yahooの公開データ利用条件が未確認のため配信を停止しています。', 503);
  }
  async function yahoo(path) {
    enabled();
    invariant(clock() >= pausedUntil, pausedCode, 'データ提供元へのアクセスを一時停止しています。時間をおいて更新してください。', 503);
    let response;
    try {
      response = await fetcher(`https://query1.finance.yahoo.com${path}`, { signal: AbortSignal.timeout(8000), redirect: 'error',
        headers: { accept: 'application/json', 'user-agent': 'PracticePaperTrading/0.2.1' } });
    } catch { throw new AppError('MARKET_UNAVAILABLE', '株価を取得できません。時間をおいて更新してください。', 503); }
    if ([401,403,429].includes(response.status)) {
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : null;
      const date = retry ? Date.parse(retry) : NaN;
      const wait = number(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - clock() : 60_000;
      pausedUntil = clock() + Math.max(1000, Number.isFinite(wait) ? wait : 60_000);
      pausedCode = response.status === 429 ? 'MARKET_RATE_LIMIT' : 'MARKET_ACCESS';
      // No alternate proxy, identity spoofing, cookie workaround, or rapid retry.
      await response.body?.cancel().catch(() => {});
      throw new AppError(pausedCode, response.status === 429 ? 'Yahooの取得制限に達しました。時間をおいて更新してください。' : 'Yahooがデータ取得を拒否しました。取得方法・利用条件の確認が必要です。', 503);
    }
    invariant(response.ok, 'MARKET_UNAVAILABLE', 'Yahooから株価を取得できません。注文は行われません。', 503);
    try { return await readJson(response); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError('MARKET_UNAVAILABLE', '株価データの受信を完了できません。', 503); }
  }
  return {
    provider, status, assertReady: enabled,
    async search(query) {
      enabled(); const q = String(query).normalize('NFKC').trim().slice(0,80); const local = catalogSearch(q);
      if (!q || provider === 'demo') return local;
      // Exact code lookup needs only a chart request, not two requests per search.
      if (/^[1-9][0-9a-z]{3}(\.t)?$/i.test(q)) {
        if (local.length) return local;
        const quote = await this.quote(normalizeSymbol(q)); return [{ symbol: quote.symbol, name: quote.name, sector: '日本株' }];
      }
      const result = [...local];
      try {
        const body = await yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&enableFuzzyQuery=false`);
        for (const item of Array.isArray(body.quotes) ? body.quotes : []) {
          if (!/^[1-9][0-9A-Z]{3}\.T$/.test(item.symbol || '') || item.quoteType !== 'EQUITY') continue;
          if (!result.some(x => x.symbol === item.symbol)) result.push({ symbol: item.symbol, name: String(item.longname || item.shortname || item.symbol).slice(0,100), sector: '日本株' });
        }
      } catch (error) { if (!local.length) throw error; } // Catalog fallback is names only, NEVER prices.
      return result.slice(0,20);
    },
    async quote(input) {
      enabled(); const symbol = normalizeSymbol(input); const now = clock();
      if (provider === 'demo') {
        const index = CATALOG.findIndex(x => x.symbol === symbol);
        invariant(index >= 0, 'MARKET_UNSUPPORTED', 'デモでは一覧の20銘柄に対応しています。', 404);
        return { symbol, name: CATALOG[index].name, priceMinor: DEMO_PRICES[index], currency: 'JPY',
          quoteAt: null, fetchedAt: now, source: 'demo', previousCloseMinor: null, delayMinutes: null, referenceOnly: true, sessionState: 'demo' };
      }
      const found = cache.get(symbol);
      if (found && now - found.fetchedAt < QUOTE_TTL && now >= found.fetchedAt) {
        const quote = parseYahooChart(found.body, symbol, now); // Recheck freshness/session boundary at cache read.
        quote.fetchedAt = found.fetchedAt; return quote;
      }
      if (pending.has(symbol)) return structuredClone(await pending.get(symbol));
      const task = (async () => {
        const body = await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`);
        const fetchedAt = clock(); const quote = parseYahooChart(body, symbol, fetchedAt);
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(symbol, { body, fetchedAt }); return quote;
      })();
      pending.set(symbol, task);
      try { return structuredClone(await task); } finally { pending.delete(symbol); }
    },
  };
}
