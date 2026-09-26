// Anonymous configuration check only; never creates users, quotes or trades.
const origin='https://practice-ashy-delta.vercel.app';
let error='Deployment not ready';
for(let i=0;i<36;i++){
 try{
  const r=await fetch(`${origin}/api/index?action=config`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
  const c=await r.json();
  if(r.ok&&c.version==='0.4.0'&&c.provider==='multi'&&c.storage==='supabase'&&c.accountsAvailable&&c.quantityScale===1000000){
   console.log(JSON.stringify({result:'PASS',version:c.version,provider:c.provider,markets:c.markets,storage:c.storage,note:'Configuration only; not live-provider or DB trade verification.'}));process.exit(0);
  }
  error=`Unexpected configuration: version=${c.version}, provider=${c.provider}`;
 }catch{error='Public configuration unavailable';}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
throw new Error(error);
