/** Money is stored in integer 1/100 JPY. Asset quantity is stored as integer micro-units (1e-6). */
export const INITIAL_CASH=10_000_000; export const MAX_MONEY=1_000_000_000_000; export const QUANTITY_SCALE=1_000_000;
export const SYMBOL=/^(BTC|ETH|SOL|XRP|USDJPY|EURJPY|GBPJPY|AUDJPY)$/;
export class AppError extends Error{constructor(code,message,status=400){super(message);this.code=code;this.status=status}}
export function invariant(ok,code,message,status=400){if(!ok)throw new AppError(code,message,status)}
export function initialState(){return{cashMinor:INITIAL_CASH,realizedMinor:0,positions:[],version:0}}
export function validMoney(n){return Number.isSafeInteger(n)&&n>=0&&n<=MAX_MONEY}
export function normalizeSymbol(v){const s=String(v??'').normalize('NFKC').toUpperCase().trim();invariant(SYMBOL.test(s),'SYMBOL','対応していない銘柄です。');return s}
export function validateOrder(o){invariant(o&&typeof o==='object','ORDER','注文内容が正しくありません。');invariant(SYMBOL.test(o.symbol),'SYMBOL','対応していない銘柄です。');invariant(['buy','sell'].includes(o.side),'SIDE','売買区分が正しくありません。');invariant(Number.isSafeInteger(o.quantity)&&o.quantity>=1&&o.quantity<=1_000_000_000_000,'QUANTITY','数量が正しくありません。');invariant(typeof o.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.requestId),'REQUEST_ID','注文番号が正しくありません。')}
export function executeTrade(state,order,quote,timestamp){
 validateOrder(order);invariant(quote.symbol===order.symbol&&quote.currency==='JPY','QUOTE','価格の通貨・銘柄が一致しません。');invariant(validMoney(quote.priceMinor)&&quote.priceMinor>0,'PRICE','有効な価格を取得できません。');invariant(validMoney(state.cashMinor),'STATE','口座残高に不整合があります。',500);
 const total=Math.round(quote.priceMinor*order.quantity/QUANTITY_SCALE);invariant(validMoney(total)&&total>0,'TOTAL','注文金額が小さすぎるか上限を超えています。');
 const next=structuredClone(state),i=next.positions.findIndex(p=>p.symbol===order.symbol);const p=next.positions[i];let realized=0;
 if(order.side==='buy'){invariant(next.cashMinor>=total,'INSUFFICIENT_CASH','買付余力が不足しています。');invariant(p||next.positions.length<100,'POSITIONS_LIMIT','保有銘柄は100銘柄までです。');if(p){p.quantity+=order.quantity;p.costMinor+=total}else next.positions.push({symbol:order.symbol,name:quote.name,type:quote.type,unit:quote.unit,quantity:order.quantity,costMinor:total});next.cashMinor-=total}
 else{invariant(p&&p.quantity>=order.quantity,'INSUFFICIENT_SHARES','保有数量を超えて売ることはできません。');const basis=order.quantity===p.quantity?p.costMinor:Number(BigInt(p.costMinor)*BigInt(order.quantity)/BigInt(p.quantity));realized=total-basis;invariant(validMoney(next.cashMinor+total),'TOTAL','口座残高が上限を超えます。');next.cashMinor+=total;next.realizedMinor+=realized;p.quantity-=order.quantity;p.costMinor-=basis;if(p.quantity===0)next.positions.splice(i,1)}
 next.version+=1;return{state:next,trade:{requestId:order.requestId,symbol:order.symbol,name:quote.name,type:quote.type,unit:quote.unit,side:order.side,quantity:order.quantity,priceMinor:quote.priceMinor,totalMinor:total,realizedMinor:realized,quoteAt:quote.quoteAt,executedAt:timestamp,source:quote.source,cashAfterMinor:next.cashMinor}}
}
