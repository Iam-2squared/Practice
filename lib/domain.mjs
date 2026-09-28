import { ASSETS, assetFor } from './catalog.mjs';
export const INITIAL_CASH=10_000_000, MAX_MONEY=1_000_000_000_000, QUANTITY_SCALE=1_000_000, MAX_QUANTITY=1_000_000_000_000;
export class AppError extends Error { constructor(code,message,status=400) { super(message);this.code=code;this.status=status; } }
export function invariant(ok,code,message,status=400) { if(!ok) throw new AppError(code,message,status); }
export const validMoney = n => Number.isSafeInteger(n)&&n>=0&&n<=MAX_MONEY;
export const initialState = () => ({cashMinor:INITIAL_CASH,realizedMinor:0,positions:[],version:0});
export function normalizeSymbol(value) {
  invariant(typeof value==='string','SYMBOL','銘柄を選択してください。');
  const symbol=value.normalize('NFKC').toUpperCase().trim().replace('/','');
  invariant(assetFor(symbol),'SYMBOL','対応していない銘柄です。');return symbol;
}
export function validateState(s) {
  invariant(s&&validMoney(s.cashMinor)&&Number.isSafeInteger(s.realizedMinor)&&Number.isSafeInteger(s.version)&&s.version>=0&&Array.isArray(s.positions)&&s.positions.length<=ASSETS.length,'STATE','口座状態を確認できません。',500);
  const seen=new Set();
  for(const p of s.positions) {const a=assetFor(p.symbol);invariant(a&&!seen.has(p.symbol)&&p.type===a.type&&p.unit===a.unit&&p.name===a.name&&Number.isSafeInteger(p.quantity)&&p.quantity>0&&p.quantity<=MAX_QUANTITY&&p.quantity%a.stepUnits===0&&validMoney(p.costMinor),'STATE','保有情報を確認できません。',500);seen.add(p.symbol);}
}
export function validateOrder(o) {
  invariant(o&&typeof o==='object'&&!Array.isArray(o),'ORDER','注文内容が正しくありません。');
  const a=typeof o.symbol==='string'?assetFor(o.symbol):null;invariant(a,'SYMBOL','対応していない銘柄です。');
  invariant(['buy','sell'].includes(o.side),'SIDE','売買区分が正しくありません。');
  invariant(Number.isSafeInteger(o.quantity)&&o.quantity>0&&o.quantity<=MAX_QUANTITY&&o.quantity%a.stepUnits===0,'QUANTITY','銘柄の最小数量単位に合わせて入力してください。');
  invariant(typeof o.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.requestId),'REQUEST_ID','注文番号が正しくありません。');
}
// Integer arithmetic: buys round UP, sales/valuations round DOWN to 0.01 JPY.
// Splitting a round trip cannot manufacture cash through floating-point/rounding errors.
export function amountMinor(price,quantity,side='sell') {
  invariant(validMoney(price)&&price>0&&Number.isSafeInteger(quantity)&&quantity>=0&&quantity<=MAX_QUANTITY,'TOTAL','金額・数量が正しくありません。');
  const p=BigInt(price)*BigInt(quantity),scale=BigInt(QUANTITY_SCALE);
  const value=Number((p+(side==='buy'?scale-1n:0n))/scale);
  invariant(validMoney(value),'TOTAL','金額が上限を超えています。');return value;
}
export function executeTrade(state,order,quote,timestamp) {
  validateOrder(order);validateState(state);const a=assetFor(order.symbol);
  invariant(quote?.symbol===a.symbol&&quote.currency==='JPY'&&quote.source===a.source&&quote.type===a.type&&quote.unit===a.unit,'QUOTE','価格の銘柄・通貨・提供元が一致しません。');
  const total=amountMinor(quote.priceMinor,order.quantity,order.side);invariant(total>0,'TOTAL','注文金額が小さすぎます。');
  const next=structuredClone(state),i=next.positions.findIndex(p=>p.symbol===a.symbol),p=next.positions[i];let realized=0;
  if(order.side==='buy') {
    invariant(next.cashMinor>=total,'INSUFFICIENT_CASH','買付余力が不足しています。');
    if(p) {invariant(p.quantity+order.quantity<=MAX_QUANTITY&&validMoney(p.costMinor+total),'TOTAL','保有上限を超えます。');p.quantity+=order.quantity;p.costMinor+=total;}
    else next.positions.push({symbol:a.symbol,name:a.name,type:a.type,unit:a.unit,quantity:order.quantity,costMinor:total});
    next.cashMinor-=total;
  } else {
    invariant(p&&p.quantity>=order.quantity,'INSUFFICIENT_SHARES','保有数量を超えて売ることはできません。');
    const basis=Number(BigInt(p.costMinor)*BigInt(order.quantity)/BigInt(p.quantity));realized=total-basis;
    invariant(validMoney(next.cashMinor+total),'TOTAL','口座残高が上限を超えます。');next.cashMinor+=total;next.realizedMinor+=realized;
    p.quantity-=order.quantity;p.costMinor-=basis;if(!p.quantity)next.positions.splice(i,1);
  }
  next.version++;validateState(next);
  return {state:next,trade:{requestId:order.requestId,symbol:a.symbol,name:a.name,type:a.type,unit:a.unit,quantity:order.quantity,quantityScale:QUANTITY_SCALE,side:order.side,priceMinor:quote.priceMinor,totalMinor:total,realizedMinor:realized,cashAfterMinor:next.cashMinor,source:a.source,quoteAt:quote.quoteAt,quoteDate:quote.quoteDate??null,executedAt:timestamp}};
}
