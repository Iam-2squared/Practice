// Fixed allowlist: no remote symbol discovery and no Japanese equities.
export const ASSETS = Object.freeze([
  {symbol:'BTC', name:'Bitcoin', alias:'ビットコイン', type:'crypto', unit:'BTC', id:'bitcoin', stepUnits:10, defaultUnits:1000, source:'coingecko'},
  {symbol:'ETH', name:'Ethereum', alias:'イーサリアム', type:'crypto', unit:'ETH', id:'ethereum', stepUnits:100, defaultUnits:10000, source:'coingecko'},
  {symbol:'SOL', name:'Solana', alias:'ソラナ', type:'crypto', unit:'SOL', id:'solana', stepUnits:1000, defaultUnits:100000, source:'coingecko'},
  {symbol:'XRP', name:'XRP', alias:'リップル', type:'crypto', unit:'XRP', id:'ripple', stepUnits:1000000, defaultUnits:10000000, source:'coingecko'},
  {symbol:'USDJPY', name:'米ドル / 円', alias:'USD/JPY ドル US Dollar United States Dollar', type:'fx', unit:'USD', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'EURJPY', name:'ユーロ / 円', alias:'EUR/JPY Euro', type:'fx', unit:'EUR', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'GBPJPY', name:'英ポンド / 円', alias:'GBP/JPY British Pound Sterling', type:'fx', unit:'GBP', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'AUDJPY', name:'豪ドル / 円', alias:'AUD/JPY Australian Dollar', type:'fx', unit:'AUD', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
].map(Object.freeze));
export const assetFor = symbol => ASSETS.find(a => a.symbol === symbol);
export const attribution = source => source === 'coingecko'
  ? {name:'CoinGecko', url:'https://www.coingecko.com/en/api'}
  : {name:'Frankfurter / ECB', url:'https://frankfurter.dev/'};
