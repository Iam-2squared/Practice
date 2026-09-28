import { ASSETS, assetFor, attribution } from './catalog.mjs';
import { AppError, invariant, normalizeSymbol, validMoney } from './domain.mjs';

// A new generation avoids serving the old four-symbol batches during rollout.
export const QUOTE_CACHE_KEYS = Object.freeze({crypto: 'crypto-v2', fx: 'fx-v2'});
const cryptoIds = ASSETS.filter(a => a.type === 'crypto').map(a => a.id).join(',');
const fxUnits = ['JPY', ...ASSETS.filter(a => a.type === 'fx' && a.unit !== 'EUR').map(a => a.unit)].join(',');
const CRYPTO_TTL = 300_000;
const FX_TTL = 14_400_000;
const MAX_QUOTE_BYTES = 262_144;
const MAX_CHART_BYTES = 1_048_576;
const MAX_CHART_POINTS = 5_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const finite = n => typeof n === 'number' && Number.isFinite(n);

export const CHART_PERIODS = Object.freeze({
  crypto: Object.freeze({
    '24H': Object.freeze({ days: 1, granularity: '5-minute', granularityLabel: '約5分ごと', ttl: 3_600_000 }),
    '7D': Object.freeze({ days: 7, granularity: 'hourly', granularityLabel: '約1時間ごと', ttl: 21_600_000 }),
    '30D': Object.freeze({ days: 30, granularity: 'hourly', granularityLabel: '約1時間ごと', ttl: 21_600_000 }),
    '90D': Object.freeze({ days: 90, granularity: 'hourly', granularityLabel: '約1時間ごと', ttl: 21_600_000 }),
    '1Y': Object.freeze({ days: 365, granularity: 'daily', granularityLabel: '日次（UTC）', ttl: 86_400_000 }),
  }),
  fx: Object.freeze({
    '7D': Object.freeze({ calendar: { days: 7 }, granularity: 'daily', granularityLabel: '日次（営業日のみ）', ttl: 86_400_000 }),
    '1M': Object.freeze({ calendar: { months: 1 }, granularity: 'daily', granularityLabel: '日次（営業日のみ）', ttl: 86_400_000 }),
    '3M': Object.freeze({ calendar: { months: 3 }, granularity: 'daily', granularityLabel: '日次（営業日のみ）', ttl: 86_400_000 }),
    '1Y': Object.freeze({ calendar: { years: 1 }, granularity: 'daily', granularityLabel: '日次（営業日のみ）', ttl: 86_400_000 }),
    '5Y': Object.freeze({ calendar: { years: 5 }, granularity: 'daily', granularityLabel: '日次（営業日のみ）', ttl: 86_400_000 }),
  }),
});

export function assertFresh(q, now = Date.now()) {
  const a = assetFor(q?.symbol);
  invariant(a && q.type === a.type && q.unit === a.unit && q.source === a.source && q.currency === 'JPY' && validMoney(q.priceMinor) && q.priceMinor > 0,
    'MARKET_PRICE', '価格情報を確認できません。', 503);
  invariant(finite(q.fetchedAt) && q.fetchedAt > 0 && q.fetchedAt <= now + 30_000,
    'MARKET_TIME', '取得時刻を確認できません。', 503);
  if (a.type === 'crypto') {
    invariant(finite(q.quoteAt) && q.quoteAt > 0 && q.quoteAt <= now + 30_000 && now - q.quoteAt <= 900_000,
      'MARKET_STALE', '暗号資産の価格が古いか、価格時刻を確認できません。', 503);
  } else {
    const date = q.quoteDate;
    const t = typeof date === 'string' ? Date.parse(`${date}T00:00:00Z`) : NaN;
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === date &&
      date <= new Date(now).toISOString().slice(0, 10) && now - t <= 10 * DAY && q.quoteAt === null,
    'MARKET_STALE', '為替レートの対象日が古いか、確認できません。', 503);
  }
  return q;
}

function quote(a, price, when, now) {
  const priceMinor = Math.round(price * 100);
  invariant(finite(price) && price > 0 && validMoney(priceMinor) && priceMinor > 0,
    'MARKET_PRICE', '有効な参考価格がありません。', 503);
  return assertFresh({
    ...a,
    priceMinor,
    currency: 'JPY',
    quoteAt: a.type === 'crypto' ? when : null,
    quoteDate: a.type === 'fx' ? when : null,
    fetchedAt: now,
    referenceOnly: true,
    attribution: attribution(a.source),
  }, now);
}

export function parseCrypto(body, now) {
  return ASSETS.filter(a => a.type === 'crypto').map(a => {
    const r = body?.[a.id];
    invariant(finite(r?.last_updated_at), 'MARKET_TIME', 'CoinGeckoの価格時刻がありません。', 503);
    return quote(a, r.jpy, r.last_updated_at * 1000, now);
  });
}

export function parseFx(body, now) {
  invariant(body?.base === 'EUR' && body.amount === 1,
    'MARKET_CURRENCY', '為替レートの基準通貨を確認できません。', 503);
  invariant(finite(body.rates?.JPY) && body.rates.JPY > 0,
    'MARKET_PRICE', '円レートがありません。', 503);
  return ASSETS.filter(a => a.type === 'fx').map(a => {
    const rate = a.unit === 'EUR' ? 1 : body.rates[a.unit];
    invariant(finite(rate) && rate > 0, 'MARKET_PRICE', '外貨レートがありません。', 503);
    return quote(a, body.rates.JPY / rate, body.date, now);
  });
}

const isoDate = value => value.toISOString().slice(0, 10);

function calendarStart(now, delta) {
  const current = new Date(now);
  const day = current.getUTCDate();
  const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), day));
  if (delta.days) start.setUTCDate(start.getUTCDate() - delta.days);
  if (delta.months) {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - delta.months);
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, last));
  }
  if (delta.years) {
    start.setUTCDate(1);
    start.setUTCFullYear(start.getUTCFullYear() - delta.years);
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    start.setUTCDate(Math.min(day, last));
  }
  return start;
}

export function chartSpec(symbol, period, now = Date.now()) {
  const a = assetFor(normalizeSymbol(symbol));
  invariant(typeof period === 'string' && CHART_PERIODS[a.type][period],
    'CHART_PERIOD', 'この期間のチャートは利用できません。');
  const rule = CHART_PERIODS[a.type][period];
  if (a.type === 'crypto') {
    return {
      asset: a,
      period,
      ...rule,
      startAt: now - rule.days * DAY,
      endAt: now,
      url: `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(a.id)}/market_chart?vs_currency=jpy&days=${rule.days}`,
    };
  }
  const start = calendarStart(now, rule.calendar);
  const end = new Date(now);
  const symbols = a.unit === 'EUR' ? 'JPY' : `JPY,${a.unit}`;
  return {
    asset: a,
    period,
    ...rule,
    startAt: start.getTime(),
    endAt: end.getTime(),
    startDate: isoDate(start),
    endDate: isoDate(end),
    url: `https://api.frankfurter.dev/v1/${isoDate(start)}..${isoDate(end)}?base=EUR&symbols=${encodeURIComponent(symbols)}`,
  };
}

function chartResult(spec, points, fetchedAt) {
  if (!points.length) return {
    symbol: spec.asset.symbol,
    name: spec.asset.name,
    type: spec.asset.type,
    unit: spec.asset.unit,
    currency: 'JPY',
    period: spec.period,
    granularity: spec.granularity,
    granularityLabel: spec.granularityLabel,
    source: spec.asset.source,
    attribution: attribution(spec.asset.source),
    referenceOnly: true,
    fetchedAt,
    changeBps: null,
    points: [],
  };
  const first = points[0].priceMinor;
  const last = points.at(-1).priceMinor;
  return {
    symbol: spec.asset.symbol,
    name: spec.asset.name,
    type: spec.asset.type,
    unit: spec.asset.unit,
    currency: 'JPY',
    period: spec.period,
    granularity: spec.granularity,
    granularityLabel: spec.granularityLabel,
    source: spec.asset.source,
    attribution: attribution(spec.asset.source),
    referenceOnly: true,
    fetchedAt,
    changeBps: Math.round((last - first) * 10_000 / first),
    points,
  };
}

function asPriceMinor(value) {
  const minor = Math.round(value * 100);
  invariant(finite(value) && value > 0 && validMoney(minor) && minor > 0,
    'CHART_DATA', '価格履歴に無効な値があります。', 503);
  return minor;
}

export function parseCryptoHistory(body, symbol, period, now = Date.now()) {
  const spec = chartSpec(symbol, period, now);
  invariant(spec.asset.type === 'crypto' && body && typeof body === 'object' && !Array.isArray(body) && Array.isArray(body.prices),
    'CHART_RESPONSE', 'CoinGeckoの価格履歴を読み取れません。', 503);
  if (!body.prices.length) return chartResult(spec, [], now);
  invariant(body.prices.length >= 2 && body.prices.length <= MAX_CHART_POINTS,
    'CHART_DATA', '表示できる価格履歴がありません。', 503);
  let previous = 0;
  const tolerance = spec.granularity === 'daily' ? 2 * DAY : 2 * HOUR;
  const points = body.prices.map(row => {
    invariant(Array.isArray(row) && row.length === 2 && Number.isSafeInteger(row[0]) && row[0] > previous &&
      row[0] >= spec.startAt - tolerance && row[0] <= now + 300_000,
    'CHART_DATA', '価格履歴の日時または順序が正しくありません。', 503);
    previous = row[0];
    return { at: row[0], priceMinor: asPriceMinor(row[1]) };
  });
  return chartResult(spec, points, now);
}

export function parseFxHistory(body, symbol, period, now = Date.now()) {
  const spec = chartSpec(symbol, period, now);
  invariant(spec.asset.type === 'fx' && body && typeof body === 'object' && !Array.isArray(body) && body.base === 'EUR' && body.amount === 1 &&
    body.rates && typeof body.rates === 'object' && !Array.isArray(body.rates),
  'CHART_RESPONSE', 'Frankfurterの価格履歴を読み取れません。', 503);
  const providerFloor = isoDate(new Date(spec.startAt - 7 * DAY));
  const allDates = Object.keys(body.rates).sort();
  for (const date of allDates) {
    const at = Date.parse(`${date}T00:00:00Z`);
    const rates = body.rates[date];
    const baseRate = spec.asset.unit === 'EUR' ? 1 : rates?.[spec.asset.unit];
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(at) && isoDate(new Date(at)) === date &&
      date >= providerFloor && date <= spec.endDate && rates && typeof rates === 'object' && !Array.isArray(rates) &&
      finite(rates.JPY) && rates.JPY > 0 && finite(baseRate) && baseRate > 0,
    'CHART_DATA', '為替履歴の日付または円レートが正しくありません。', 503);
  }
  const dates = allDates.filter(date => date >= spec.startDate);
  if (!dates.length) return chartResult(spec, [], now);
  invariant(dates.length >= 2 && dates.length <= MAX_CHART_POINTS,
    'CHART_DATA', '表示できる為替履歴がありません。', 503);
  const points = dates.map(date => {
    const at = Date.parse(`${date}T00:00:00Z`);
    const rates = body.rates[date];
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(at) && isoDate(new Date(at)) === date &&
      date >= spec.startDate && date <= spec.endDate && rates && typeof rates === 'object' && !Array.isArray(rates) &&
      finite(rates.JPY) && rates.JPY > 0,
    'CHART_DATA', '為替履歴の日付または円レートが正しくありません。', 503);
    const baseRate = spec.asset.unit === 'EUR' ? 1 : rates[spec.asset.unit];
    invariant(finite(baseRate) && baseRate > 0,
      'CHART_DATA', '為替履歴に対象通貨がありません。', 503);
    return { at, date, priceMinor: asPriceMinor(rates.JPY / baseRate) };
  });
  return chartResult(spec, points, now);
}

export function assertChart(chart, symbol, period) {
  const spec = chartSpec(symbol, period, chart?.fetchedAt);
  invariant(chart && chart.symbol === spec.asset.symbol && chart.name === spec.asset.name && chart.type === spec.asset.type &&
    chart.unit === spec.asset.unit && chart.currency === 'JPY' && chart.period === period && chart.granularity === spec.granularity &&
    chart.granularityLabel === spec.granularityLabel && chart.source === spec.asset.source && chart.referenceOnly === true &&
    finite(chart.fetchedAt) && chart.fetchedAt > 0 && Array.isArray(chart.points) && (chart.points.length === 0 || chart.points.length >= 2) && chart.points.length <= MAX_CHART_POINTS,
  'CHART_CACHE', '保存された価格履歴を確認できません。', 503);
  if (!chart.points.length) {
    invariant(chart.changeBps === null, 'CHART_CACHE', '保存された騰落率を確認できません。', 503);
    return chart;
  }
  let previous = 0;
  for (const point of chart.points) {
    invariant(point && Number.isSafeInteger(point.at) && point.at > previous && validMoney(point.priceMinor) && point.priceMinor > 0 &&
      (spec.asset.type === 'crypto' || /^\d{4}-\d{2}-\d{2}$/.test(point.date || '')),
    'CHART_CACHE', '保存された価格履歴を確認できません。', 503);
    previous = point.at;
  }
  const expected = Math.round((chart.points.at(-1).priceMinor - chart.points[0].priceMinor) * 10_000 / chart.points[0].priceMinor);
  invariant(chart.changeBps === expected, 'CHART_CACHE', '保存された騰落率を確認できません。', 503);
  return chart;
}

async function readJson(response, maxBytes) {
  invariant(Number(response.headers.get('content-length') || 0) <= maxBytes,
    'MARKET_RESPONSE', '価格データが大きすぎます。', 503);
  const reader = response.body?.getReader();
  invariant(reader, 'MARKET_RESPONSE', '価格データがありません。', 503);
  let size = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError('MARKET_RESPONSE', '価格データが大きすぎます。', 503);
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError('MARKET_RESPONSE', '価格データを読み取れません。', 503);
  }
}

function upstreamError(response, prefix = 'MARKET') {
  const code = response.status === 429 ? `${prefix}_RATE_LIMIT` : [401, 403].includes(response.status) ? `${prefix}_ACCESS` : `${prefix}_UNAVAILABLE`;
  return new AppError(code, prefix === 'CHART'
    ? '価格チャートを取得できません。時間をおいて再度お試しください。'
    : 'データ提供元から価格を取得できません。キー・取得制限を確認してください。', 503);
}

function retryAfter(response, clock) {
  const raw = response.headers.get('retry-after');
  const value = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw || '') - clock();
  return Number.isFinite(value) ? Math.min(DAY, Math.max(300_000, value)) : 300_000;
}

function chartCachedError(code) {
  return new AppError(code, code === 'CHART_BUDGET'
    ? '今月の無料履歴API枠を保護するため、仮想通貨チャートの新規取得を一時停止しています。現在価格と売買機能は利用できます。'
    : '価格チャートの再取得を待機中です。時間をおいて更新してください。', 503);
}

export function createMarket({ fetcher = fetch, clock = Date.now, coinGeckoKey = '', store = null } = {}) {
  const local = new Map();
  const pending = new Map();
  const chartLocal = new Map();
  const chartPending = new Map();
  const status = () => ({ crypto: coinGeckoKey ? 'enabled' : 'key-required', fx: 'enabled' });

  function ready(symbol) {
    const a = assetFor(symbol);
    invariant(a, 'SYMBOL', '対応していない銘柄です。');
    if (a.type === 'crypto') invariant(coinGeckoKey, 'CRYPTO_SETUP', '仮想通貨は管理者のCoinGecko無料APIキー設定待ちです。FXは利用できます。', 503);
  }

  async function load(group) {
    const cacheKey = QUOTE_CACHE_KEYS[group];
    const now = clock();
    const ttl = group === 'crypto' ? CRYPTO_TTL : FX_TTL;
    let cached = local.get(group);
    if (!cached || now >= cached.nextFetchAt) cached = store ? await store.getCache(cacheKey) : cached;
    if (cached && now < cached.nextFetchAt) {
      if (cached.error) throw new AppError(cached.error, 'データ提供元への再取得を待機中です。時間をおいて更新してください。', 503);
      if (cached.payload) {
        cached.payload.forEach(q => assertFresh(q, now));
        return cached.payload;
      }
    }
    const claim = store ? await store.claimCache(cacheKey, now) : { claimed: true, token: 'local' };
    if (!claim.claimed) {
      if (claim.cached?.payload && !claim.cached.error) {
        claim.cached.payload.forEach(q => assertFresh(q, now));
        return claim.cached.payload;
      }
      throw new AppError('MARKET_BUSY', '参考価格を更新中です。少し時間をおいて再度お試しください。', 503);
    }
    let retryMs = 300_000;
    try {
      const headers = { accept: 'application/json' };
      const url = group === 'crypto'
        ? `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cryptoIds)}&vs_currencies=jpy&include_last_updated_at=true`
        : `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${encodeURIComponent(fxUnits)}`;
      if (group === 'crypto') headers['x-cg-demo-api-key'] = coinGeckoKey;
      const response = await fetcher(url, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) {
        retryMs = retryAfter(response, clock);
        await response.body?.cancel().catch(() => {});
        throw upstreamError(response);
      }
      const body = await readJson(response, MAX_QUOTE_BYTES);
      const fetchedAt = clock();
      const payload = (group === 'crypto' ? parseCrypto : parseFx)(body, fetchedAt);
      cached = { payload, fetchedAt, nextFetchAt: fetchedAt + ttl, error: null };
      local.set(group, cached);
      if (store) await store.saveCache(cacheKey, claim.token, cached);
      return payload;
    } catch (error) {
      const e = error instanceof AppError ? error : new AppError('MARKET_UNAVAILABLE', '通信を完了できません。価格未確認のため注文は停止しています。', 503);
      local.set(group, { payload: null, fetchedAt: clock(), nextFetchAt: clock() + retryMs, error: e.code });
      if (store) await store.failCache(cacheKey, claim.token, e.code, retryMs).catch(() => {});
      throw e;
    }
  }

  async function loadChart(symbol, period) {
    const now = clock();
    const spec = chartSpec(symbol, period, now);
    const key = `chart:${spec.asset.symbol}:${period}`;
    let cached = chartLocal.get(key);
    if ((!cached || now >= cached.nextFetchAt) && store?.getChartCache) cached = await store.getChartCache(key);
    if (cached && now < cached.nextFetchAt) {
      if (cached.error) throw chartCachedError(cached.error);
      if (cached.payload) return structuredClone(assertChart(cached.payload, symbol, period));
    }
    const claim = store?.claimChartCache
      ? await store.claimChartCache(key, now, spec.ttl)
      : { claimed: true, token: 'local' };
    if (!claim.claimed) {
      if (claim.cached?.payload && !claim.cached.error) return structuredClone(assertChart(claim.cached.payload, symbol, period));
      if (claim.cached?.error) throw chartCachedError(claim.cached.error);
      throw new AppError('CHART_BUSY', '価格チャートを更新中です。少し時間をおいて再度お試しください。', 503);
    }
    let retryMs = 300_000;
    try {
      const headers = { accept: 'application/json' };
      if (spec.asset.type === 'crypto') headers['x-cg-demo-api-key'] = coinGeckoKey;
      const response = await fetcher(spec.url, { headers, signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok) {
        retryMs = retryAfter(response, clock);
        await response.body?.cancel().catch(() => {});
        throw upstreamError(response, 'CHART');
      }
      const body = await readJson(response, MAX_CHART_BYTES);
      const fetchedAt = clock();
      const payload = spec.asset.type === 'crypto'
        ? parseCryptoHistory(body, symbol, period, fetchedAt)
        : parseFxHistory(body, symbol, period, fetchedAt);
      cached = { payload, fetchedAt, nextFetchAt: fetchedAt + spec.ttl, error: null };
      chartLocal.set(key, cached);
      if (store?.saveChartCache) await store.saveChartCache(key, claim.token, cached);
      return structuredClone(payload);
    } catch (error) {
      const e = error instanceof AppError ? error : new AppError('CHART_UNAVAILABLE', '価格チャートを取得できません。現在価格と売買機能は別に利用できます。', 503);
      chartLocal.set(key, { payload: null, fetchedAt: clock(), nextFetchAt: clock() + retryMs, error: e.code });
      if (store?.failChartCache) await store.failChartCache(key, claim.token, e.code, retryMs).catch(() => {});
      throw e;
    }
  }

  return {
    provider: 'multi',
    status,
    assertReady: ready,
    periods(type) {
      invariant(['crypto', 'fx'].includes(type), 'ASSET_TYPE', '仮想通貨またはFXを選んでください。');
      return Object.keys(CHART_PERIODS[type]);
    },
    async search(query, type = 'crypto') {
      invariant(['crypto', 'fx'].includes(type), 'ASSET_TYPE', '仮想通貨またはFXを選んでください。');
      const q = String(query || '').normalize('NFKC').toLowerCase().trim().slice(0, 80);
      return ASSETS.filter(a => a.type === type && (!q || `${a.symbol} ${a.name} ${a.nameEn || ''} ${a.alias}`.toLowerCase().includes(q))).map(a => ({ ...a }));
    },
    async quote(input) {
      const symbol = normalizeSymbol(input);
      ready(symbol);
      const group = assetFor(symbol).type;
      if (!pending.has(group)) {
        const task = load(group);
        pending.set(group, task);
        task.finally(() => pending.delete(group)).catch(() => {});
      }
      const rows = await pending.get(group);
      return structuredClone(assertFresh(rows.find(q => q.symbol === symbol), clock()));
    },
    async history(input, period) {
      const symbol = normalizeSymbol(input);
      ready(symbol);
      const key = `${symbol}:${period}`;
      if (!chartPending.has(key)) {
        const task = loadChart(symbol, period);
        chartPending.set(key, task);
        task.finally(() => chartPending.delete(key)).catch(() => {});
      }
      return structuredClone(await chartPending.get(key));
    },
  };
}
