// Pure in-memory UI fixtures for an isolated renderer. No network requests or real credentials.
(() => {
 if(!crypto.randomUUID)crypto.randomUUID=()=> '10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
 const now=Date.now(),initial=()=>({cashMinor:10000000,realizedMinor:0,positions:[],version:0});let account=null,saved=null,journal=[];
 const assets=[{symbol:'BTC',name:'Bitcoin',type:'crypto',unit:'BTC',stepUnits:10,defaultUnits:1000,source:'coingecko',priceMinor:1000000000},{symbol:'ETH',name:'Ethereum',type:'crypto',unit:'ETH',stepUnits:100,defaultUnits:10000,source:'coingecko',priceMinor:40000000},{symbol:'SOL',name:'Solana',type:'crypto',unit:'SOL',stepUnits:1000,defaultUnits:100000,source:'coingecko',priceMinor:2000000},{symbol:'XRP',name:'XRP',type:'crypto',unit:'XRP',stepUnits:1000000,defaultUnits:10000000,source:'coingecko',priceMinor:25000},...['USD','EUR','GBP','AUD'].map(unit=>({symbol:unit+'JPY',name:{USD:'米ドル / 円',EUR:'ユーロ / 円',GBP:'英ポンド / 円',AUD:'豪ドル / 円'}[unit],type:'fx',unit,stepUnits:1000000,defaultUnits:100000000,source:'frankfurter',priceMinor:15000}))];
 const q=a=>({...a,currency:'JPY',fetchedAt:now,quoteAt:a.type==='crypto'?now:null,quoteDate:a.type==='fx'?new Date(now).toISOString().slice(0,10):null,attribution:a.type==='crypto'?{name:'CoinGecko',url:'https://www.coingecko.com/en/api'}:{name:'Frankfurter / ECB',url:'https://frankfurter.dev/'}});
 window.fetch=async(path,options={})=>{
  const u=new URL(path,'https://fixture.invalid'),action=u.searchParams.get('action'),body=options.body?JSON.parse(options.body):null;let r;
  if(action==='config')r={version:'0.4.0',provider:'multi',accountsAvailable:true,storage:'fixture',markets:{crypto:'enabled',fx:'enabled'},publicOrigin:null};
  else if(action==='register'){saved={id:'test-only-account',username:body.username,market:'multi',state:initial(),createdAt:now};account=saved;r={account};}
  else if(action==='login'){account=saved;r={account};}
  else if(action==='session')r={account};
  else if(action==='logout'){account=null;r={ok:true};}
  else if(action==='username'){account.username=body.username;r={account};}
  else if(action==='delete-account'){account=null;saved=null;journal=[];r={ok:true};}
  else if(action==='search')r={items:assets.filter(a=>a.type===u.searchParams.get('type')&&(!u.searchParams.get('q')||a.symbol.toLowerCase().includes(u.searchParams.get('q').toLowerCase())))};
  else if(action==='quote')r={quote:q(assets.find(a=>a.symbol===u.searchParams.get('symbol'))),quoteToken:'isolated-fixture-only'};
  else if(action==='history')r={items:[...journal].reverse(),hasMore:false};
  else if(action==='portfolio'){const quotes=Object.fromEntries(assets.map(a=>[a.symbol,q(a)]));const holdings=account.state.positions.reduce((n,p)=>n+Math.floor(quotes[p.symbol].priceMinor*p.quantity/1e6),0);r={account,quotes,holdingsMinor:holdings,totalMinor:account.state.cashMinor+holdings,valuationComplete:true,valuedAt:now};}
  else if(action==='leaderboard')r={items:[{username:account.username,totalMinor:10000000,rank:1,me:true}],valuedAt:now};
  else if(action==='trade'){const a=assets.find(a=>a.symbol===body.symbol),p=account.state.positions.find(p=>p.symbol===a.symbol),total=Math.round(a.priceMinor*body.quantity/1e6);if(body.side==='buy'){account.state.cashMinor-=total;if(p){p.quantity+=body.quantity;p.costMinor+=total;}else account.state.positions.push({...a,quantity:body.quantity,costMinor:total});}else{account.state.cashMinor+=total;p.quantity-=body.quantity;p.costMinor-=total;if(!p.quantity)account.state.positions=account.state.positions.filter(x=>x!==p);}account.state.version++;const trade={...body,...a,totalMinor:total,priceMinor:a.priceMinor,quantityScale:1000000,realizedMinor:0,executedAt:now,quoteAt:a.type==='crypto'?now:null,quoteDate:new Date(now).toISOString().slice(0,10)};journal.push(trade);r={account,trade,duplicate:false};}
  else throw Error('Unexpected mock action '+action);
  return new Response(JSON.stringify(r),{status:200,headers:{'content-type':'application/json'}});
 };
})();
