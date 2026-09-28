// Fixed allowlist: no remote symbol discovery and no equities.
export const ASSETS = Object.freeze([
  {symbol:'BTC', name:'Bitcoin', alias:'ビットコイン', type:'crypto', unit:'BTC', id:'bitcoin', stepUnits:10, defaultUnits:1000, source:'coingecko'},
  {symbol:'ETH', name:'Ethereum', alias:'イーサリアム', type:'crypto', unit:'ETH', id:'ethereum', stepUnits:100, defaultUnits:10000, source:'coingecko'},
  {symbol:'SOL', name:'Solana', alias:'ソラナ', type:'crypto', unit:'SOL', id:'solana', stepUnits:1000, defaultUnits:100000, source:'coingecko'},
  {symbol:'XRP', name:'XRP', alias:'リップル', type:'crypto', unit:'XRP', id:'ripple', stepUnits:1000000, defaultUnits:10000000, source:'coingecko'},
  {symbol:'BNB', name:'BNB', alias:'バイナンス Binance Coin', type:'crypto', unit:'BNB', id:'binancecoin', stepUnits:1000, defaultUnits:100000, source:'coingecko'},
  {symbol:'ADA', name:'Cardano', alias:'カルダノ エイダ ADA', type:'crypto', unit:'ADA', id:'cardano', stepUnits:1000000, defaultUnits:10000000, source:'coingecko'},
  {symbol:'DOGE', name:'Dogecoin', alias:'ドージコイン', type:'crypto', unit:'DOGE', id:'dogecoin', stepUnits:1000000, defaultUnits:100000000, source:'coingecko'},
  {symbol:'AVAX', name:'Avalanche', alias:'アバランチ', type:'crypto', unit:'AVAX', id:'avalanche-2', stepUnits:10000, defaultUnits:1000000, source:'coingecko'},
  {symbol:'LINK', name:'Chainlink', alias:'チェーンリンク', type:'crypto', unit:'LINK', id:'chainlink', stepUnits:10000, defaultUnits:1000000, source:'coingecko'},
  {symbol:'LTC', name:'Litecoin', alias:'ライトコイン', type:'crypto', unit:'LTC', id:'litecoin', stepUnits:10000, defaultUnits:100000, source:'coingecko'},
  {symbol:'USDJPY', name:'米ドル / 円', nameEn:'US Dollar / JPY', alias:'USD/JPY ドル US Dollar United States Dollar', type:'fx', unit:'USD', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'EURJPY', name:'ユーロ / 円', nameEn:'Euro / JPY', alias:'EUR/JPY Euro', type:'fx', unit:'EUR', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'GBPJPY', name:'英ポンド / 円', nameEn:'British Pound / JPY', alias:'GBP/JPY British Pound Sterling', type:'fx', unit:'GBP', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'AUDJPY', name:'豪ドル / 円', nameEn:'Australian Dollar / JPY', alias:'AUD/JPY Australian Dollar', type:'fx', unit:'AUD', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'CADJPY', name:'カナダドル / 円', nameEn:'Canadian Dollar / JPY', alias:'CAD/JPY Canadian Dollar', type:'fx', unit:'CAD', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'CHFJPY', name:'スイスフラン / 円', nameEn:'Swiss Franc / JPY', alias:'CHF/JPY Swiss Franc', type:'fx', unit:'CHF', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
  {symbol:'NZDJPY', name:'NZドル / 円', nameEn:'New Zealand Dollar / JPY', alias:'NZD/JPY ニュージーランドドル New Zealand Dollar Kiwi', type:'fx', unit:'NZD', stepUnits:1000000, defaultUnits:100000000, source:'frankfurter'},
].map(Object.freeze));
export const assetFor = symbol => ASSETS.find(a => a.symbol === symbol);
export const attribution = source => source === 'coingecko'
  ? {name:'CoinGecko', url:'https://www.coingecko.com/en/api'}
  : {name:'Frankfurter / ECB', url:'https://frankfurter.dev/'};
