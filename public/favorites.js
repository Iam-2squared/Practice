// Browser-local display preference only: never changes orders or account data.
export const FAVORITES_KEY = 'practice.market-favorites.v1';
const LIMIT = 128;
const validSymbol = value => typeof value === 'string' && /^[A-Z][A-Z0-9]{1,11}$/.test(value);
export function parseFavorites(raw) {
  if (typeof raw !== 'string' || raw.length > 8192) return [];
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.symbols)) return [];
    return [...new Set(data.symbols.filter(validSymbol))].slice(0, LIMIT);
  } catch { return []; }
}
export function favoriteFirst(items, symbols) {
  const selected = new Set(symbols);
  // Stable partition: removing a star restores the provider/catalog order.
  return [...items.filter(item => selected.has(item.symbol)), ...items.filter(item => !selected.has(item.symbol))];
}
export function createFavorites(getStorage = () => globalThis.localStorage) {
  let symbols = [], saved = true;
  try { symbols = parseFavorites(getStorage().getItem(FAVORITES_KEY)); } catch { saved = false; }
  return {
    get symbols() { return [...symbols]; },
    get saved() { return saved; },
    has(symbol) { return symbols.includes(symbol); },
    reload(raw) { symbols = parseFavorites(raw); },
    toggle(symbol) {
      if (!validSymbol(symbol)) throw new TypeError('Invalid favorite symbol');
      const selected = !symbols.includes(symbol);
      if (selected && symbols.length >= LIMIT) throw new RangeError('Too many favorites');
      symbols = selected ? [...symbols, symbol] : symbols.filter(value => value !== symbol);
      try {
        getStorage().setItem(FAVORITES_KEY, JSON.stringify({ version: 1, symbols }));
        saved = true;
      } catch { saved = false; }
      return { selected, saved };
    },
  };
}
