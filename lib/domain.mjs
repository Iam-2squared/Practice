/** Money is stored in integer 1/100 JPY. Orders use whole shares, no leverage. */
export const INITIAL_CASH = 10_000_000;
export const MAX_MONEY = 1_000_000_000_000;
export const SYMBOL = /^[1-9][0-9A-Z]{3}\.T$/;
export class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function invariant(ok, code, message, status = 400) {
  if (!ok) throw new AppError(code, message, status);
}
export function initialState() { return { cashMinor: INITIAL_CASH, realizedMinor: 0, positions: [], version: 0 }; }
export function validMoney(n) { return Number.isSafeInteger(n) && n >= 0 && n <= MAX_MONEY; }
export function normalizeSymbol(value) {
  const s = String(value ?? '').normalize('NFKC').toUpperCase().trim();
  const symbol = s.endsWith('.T') ? s : `${s}.T`;
  invariant(SYMBOL.test(symbol), 'SYMBOL', '日本株の4桁の銘柄コードを入力してください。');
  return symbol;
}
export function validateOrder(order) {
  invariant(order && typeof order === 'object', 'ORDER', '注文内容が正しくありません。');
  invariant(SYMBOL.test(order.symbol), 'SYMBOL', '対応していない銘柄です。');
  invariant(order.side === 'buy' || order.side === 'sell', 'SIDE', '売買区分が正しくありません。');
  invariant(Number.isSafeInteger(order.quantity) && order.quantity > 0 && order.quantity <= 1_000_000,
    'QUANTITY', '株数は1〜1,000,000の整数で入力してください。');
  invariant(typeof order.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order.requestId),
    'REQUEST_ID', '注文番号が正しくありません。');
}
export function executeTrade(state, order, quote, timestamp) {
  validateOrder(order);
  invariant(quote.symbol === order.symbol && quote.currency === 'JPY', 'QUOTE', '株価の通貨・銘柄が一致しません。');
  invariant(validMoney(quote.priceMinor) && quote.priceMinor > 0, 'PRICE', '有効な株価を取得できません。');
  invariant(validMoney(state.cashMinor), 'STATE', '口座残高に不整合があります。', 500);
  const total = quote.priceMinor * order.quantity;
  invariant(validMoney(total) && total > 0, 'TOTAL', '注文金額が上限を超えています。');
  const next = structuredClone(state);
  const index = next.positions.findIndex(p => p.symbol === order.symbol);
  const position = next.positions[index];
  let realized = 0;
  if (order.side === 'buy') {
    invariant(next.cashMinor >= total, 'INSUFFICIENT_CASH', '買付余力が不足しています。');
    invariant(position || next.positions.length < 100, 'POSITIONS_LIMIT', '保有銘柄は100銘柄までです。');
    if (position) {
      invariant(validMoney(position.costMinor + total) && Number.isSafeInteger(position.shares + order.quantity), 'TOTAL', '保有上限を超えています。');
      position.shares += order.quantity; position.costMinor += total;
    } else next.positions.push({ symbol: order.symbol, name: quote.name, shares: order.quantity, costMinor: total });
    next.cashMinor -= total;
  } else {
    invariant(position && position.shares >= order.quantity, 'INSUFFICIENT_SHARES', '保有株数を超えて売ることはできません。');
    // Allocate basis proportionally; the final sale consumes the exact residual basis.
    const basis = order.quantity === position.shares ? position.costMinor : Number(BigInt(position.costMinor) * BigInt(order.quantity) / BigInt(position.shares));
    realized = total - basis;
    invariant(validMoney(next.cashMinor + total), 'TOTAL', '口座残高が上限を超えます。');
    next.cashMinor += total; next.realizedMinor += realized;
    position.shares -= order.quantity; position.costMinor -= basis;
    if (position.shares === 0) next.positions.splice(index, 1);
  }
  next.version += 1;
  return { state: next, trade: {
    requestId: order.requestId, symbol: order.symbol, name: quote.name, side: order.side,
    quantity: order.quantity, priceMinor: quote.priceMinor, totalMinor: total,
    realizedMinor: realized, quoteAt: quote.quoteAt, executedAt: timestamp,
    source: quote.source, cashAfterMinor: next.cashMinor,
  } };
}
