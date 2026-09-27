// Anonymous config/static checks only; no user creation, quotes or trades.
import {readFile} from 'node:fs/promises';
const expected=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const origin='https://practice-ashy-delta.vercel.app';let error='Deployment not ready';
for(let i=0;i<36;i++){
 try{
  const r=await fetch(`${origin}/api/index?action=config`,{cache:'no-store',signal:AbortSignal.timeout(10000)}),c=await r.json();
  if(r.ok&&c.version===expected&&c.provider==='multi'&&c.storage==='supabase'&&c.accountsAvailable&&c.quantityScale===1000000&&c.chartPeriods?.crypto?.length===5&&c.chartPeriods?.fx?.length===5){
   const html=await(await fetch(`${origin}/app.html`,{cache:'no-store'})).text();
   const js=await(await fetch(`${origin}/progress-ui.js`,{cache:'no-store'})).text();
   const denied=await fetch(`${origin}/api/index?action=progress`,{cache:'no-store'});
   if(html.includes('data-tab="challenges"')&&html.includes('data-tab="market"')&&js.includes('createProgressUi')&&denied.status===401){console.log(JSON.stringify({result:'PASS',version:c.version,provider:c.provider,markets:c.markets,storage:c.storage,note:'Anonymous config/static/auth checks only; not authenticated production E2E.'}));process.exit(0);}
  }
  error=`Unexpected deployment: version=${c.version}, provider=${c.provider}`;
 }catch{error='Public deployment unavailable';}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
throw new Error(error);
