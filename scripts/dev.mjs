import http from 'node:http';
import {readFile,writeFile,mkdir,rename,chmod} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../lib/app.mjs';
import {withLocalization} from '../lib/locale.mjs';
import {MemoryStore,SupabaseStore} from '../lib/store.mjs';
import {createMarket} from '../lib/market.mjs';
import {buildSite} from './localize.mjs';
if(process.env.VERCEL||process.env.NODE_ENV==='production')throw Error('Local development server cannot run in production.');
const root=resolve(import.meta.dirname,'..'),local=resolve(root,'.local-crypto-fx');
const {out}=await buildSite(root);
await mkdir(local,{recursive:true,mode:0o700});
let secret=process.env.APP_SECRET;
if(!secret){try{secret=(await readFile(resolve(local,'secret'),'utf8')).trim();}catch{secret=randomBytes(32).toString('hex');await writeFile(resolve(local,'secret'),secret,{mode:0o600});}}
class FileStore extends MemoryStore{async persist(){const temp=resolve(local,'accounts.tmp');await writeFile(temp,JSON.stringify(this.data),{mode:0o600});await rename(temp,resolve(local,'accounts.json'));await chmod(resolve(local,'accounts.json'),0o600);}}
let store;
if(process.env.PRACTICE_STORE==='supabase')store=new SupabaseStore(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY);
else{let data=null;try{data=JSON.parse(await readFile(resolve(local,'accounts.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Local account file is invalid. Refusing to reset balances.');}store=new FileStore(data);}
const port=Number(process.env.PORT||3000),origin=`http://localhost:${port}`;
const market=createMarket({store,coinGeckoKey:process.env.COINGECKO_DEMO_API_KEY||''});
const app=withLocalization(createApp({store,market,secret,origin,secure:false,storageName:process.env.PRACTICE_STORE==='supabase'?'supabase':'local'}));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const security={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/api/index'){
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
  const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  const result=await app(request);res.writeHead(result.status,{...security,...Object.fromEntries(result.headers)});res.end(Buffer.from(await result.arrayBuffer()));return;
 }
 if(url.pathname.startsWith('/_vercel/insights/')){res.writeHead(204);res.end();return;}
 const path=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,file=resolve(out,'.'+path);
 if(!file.startsWith(out+sep)||!mime[extname(file)]){res.writeHead(404);res.end('Not found');return;}
 let content;try{content=await readFile(file);}catch{res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{...security,'Content-Type':mime[extname(file)],'Cache-Control':'no-cache'});res.end(content);
}catch{res.writeHead(500);res.end('Internal error');}}).listen(port,'127.0.0.1',()=>console.log(`Practice bilingual development: ${origin} | Crypto/FX (NOT real trading)`));
