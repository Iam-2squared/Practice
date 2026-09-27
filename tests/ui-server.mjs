// Local-only HTTP fixture server. Never bundled by Vercel; never uses live data.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {setup,origin} from './fixtures.mjs';
import {withLocalization} from '../lib/locale.mjs';
import {buildSite} from '../scripts/localize.mjs';
if(process.env.VERCEL||process.env.NODE_ENV==='production')throw Error('Fixture server is forbidden in production.');
const t=setup({historyDelay:true}),app=withLocalization(t.app),{out:root}=await buildSite();
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,origin);
 if(u.pathname.startsWith('/_vercel/insights/')){res.writeHead(204);res.end();return;}
 if(u.pathname==='/api/index'){
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4096){res.writeHead(413);res.end();return;}chunks.push(c);}
  // Deterministic Japan default for existing Japanese UI tests. x-test-country
  // is only interpreted here, never by the production locale resolver.
  const headers={...req.headers,'x-vercel-ip-country':req.headers['x-test-country']??'JP'};
  const r=await app(new Request(u,{method:req.method,headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})}));res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
 }
 const path=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname,file=resolve(root,'.'+path);
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
 if(!file.startsWith(root+sep)||!mime[extname(file)]){res.writeHead(404);res.end();return;}
 let data;try{data=await readFile(file);}catch{res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':mime[extname(file)],'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",'Cache-Control':'no-store'});res.end(data);
}catch{res.writeHead(500);res.end('fixture server error');}}).listen(3000,'127.0.0.1',()=>console.log('Local-only bilingual Crypto/FX fixture server ready'));
