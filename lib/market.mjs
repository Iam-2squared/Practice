import { AppError, invariant, normalizeSymbol, validMoney } from './domain.mjs';
import { CATALOG, catalogSearch } from './catalog.mjs';
// Deliberately synthetic, stable test fixtures. Never present these as actual prices.
const DEMO_PRICES = [280050, 340020, 950000, 810030, 180050, 15030, 4400000, 370000, 260000, 510000, 430000, 350000, 270000, 150000, 310000, 330000, 5800000, 2600000, 410000, 220000];
export function parseYahooChart(body, symbol, now = Date.now()) {
  const m = body?.chart?.result?.[0]?.meta;
  invariant(m && !body?.chart?.error && m.symbol === symbol && m.currency === 'JPY' && m.instrumentType === 'EQUITY',
    'MARKET_UNSUPPORTED', 'この銘柄の日本株データを取得できません。', 503);
  const priceMinor = Math.round(Number(m.regularMarketPrice) * 100);
  invariant(typeof m.regularMarketPrice === 'number' && validMoney(priceMinor) && priceMinor > 0, 'MARKET_PRICE', '有効な株価がありません。', 503);
  const quoteAt = Number(m.regularMarketTime) * 1000;
  invariant(Number.isFinite(quoteAt) && quoteAt > 0 && quoteAt <= now + 60_000, 'MARKET_TIME', '株価時刻を確認できません。', 503);
  // A delayed regular-session quote must be <=30 minutes old. Off-session reference <=5 days.
  const regular = m.currentTradingPeriod?.regular;
  const inSession = regular && now >= regular.start * 1000 && now <= regular.end * 1000;
  invariant(now - quoteAt <= (inSession ? 30 * 60_000 : 5 * 24 * 60 * 60_000), 'MARKET_STALE', '株価が古いため注文を停止しています。', 503);
  const previous = typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose : m.previousClose;
  return { symbol, name: CATALOG.find(x => x.symbol === symbol)?.name || String(m.longName || m.shortName || symbol).slice(0,100),
    priceMinor, currency: 'JPY', quoteAt, fetchedAt: now, source: 'yahoo',
    previousCloseMinor: previous > 0 ? Math.round(previous * 100) : null,
    delayMinutes: typeof m.exchangeDataDelayedBy === 'number' ? m.exchangeDataDelayedBy : null,
    referenceOnly: !inSession };
}
export function createMarket({ provider = 'demo', yahooApproved = false, fetcher = fetch, clock = Date.now } = {}) {
  const cache = new Map();
  function enabled() {
    invariant(provider === 'demo' || provider === 'yahoo', 'PROVIDER', 'データ配信の設定を確認してください。', 503);
    if (provider === 'yahoo') invariant(yahooApproved, 'MARKET_PERMISSION', 'Yahooの公開データ利用条件が未確認のため配信を停止しています。', 503);
  }
  async function yahoo(path) {
    enabled();
    let response;
    try { response = await fetcher(`https://query1.finance.yahoo.com${path}`, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json', 'user-agent': 'PracticePaperTrading/0.2' } }); }
    catch { throw new AppError('MARKET_UNAVAILABLE', '株価を取得できません。時間をおいて更新してください。', 503); }
    invariant(response.ok, 'MARKET_UNAVAILABLE', 'Yahooから株価を取得できません。注文は行われません。', 503);
    try { return await response.json(); } catch { throw new AppError('MARKET_UNAVAILABLE', '株価データを読み取れません。', 503); }
  }
  return {
    provider,
    async search(query) {
      enabled(); const q = String(query).normalize('NFKC').trim().slice(0,80); const local = catalogSearch(q);
      if (!q || provider === 'demo') return local;
      let result = [...local];
      try {
        const body = await yahoo(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&enableFuzzyQuery=false`);
        for (const item of body.quotes || []) {
          if (!/^[1-9][0-9A-Z]{3}\.T$/.test(item.symbol || '') || item.quoteType !== 'EQUITY') continue;
          if (!result.some(x => x.symbol === item.symbol)) result.push({ symbol: item.symbol, name: String(item.longname || item.shortname || item.symbol).slice(0,100), sector: '日本株' });
        }
      } catch (error) { if (!local.length && !/^[1-9][0-9a-z]{3}(\.t)?$/i.test(q)) throw error; }
      // Exact code discovery still requires a valid quote before anything can be traded.
      if (!result.length && /^[1-9][0-9a-z]{3}(\.t)?$/i.test(q)) {
        const quote = await this.quote(normalizeSymbol(q)); result = [{ symbol: quote.symbol, name: quote.name, sector: '日本株' }];
      }
      return result.slice(0,20);
    },
    async quote(input) {
      enabled(); const symbol = normalizeSymbol(input); const now = clock();
      if (provider === 'demo') {
        const index = CATALOG.findIndex(x => x.symbol === symbol);
        invariant(index >= 0, 'MARKET_UNSUPPORTED', 'デモでは一覧の20銘柄に対応しています。', 404);
        return { symbol, name: CATALOG[index].name, priceMinor: DEMO_PRICES[index], currency: 'JPY',
          quoteAt: null, fetchedAt: now, source: 'demo', previousCloseMinor: null, delayMinutes: null, referenceOnly: true };
      }
      const found = cache.get(symbol);
      if (found && now - found.fetchedAt < 15_000) return found;
      const quote = parseYahooChart(await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`), symbol, now);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(symbol, quote); return quote;
    },
  };
}
