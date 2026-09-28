import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {EN} from '../locales/en.mjs';
import {EN_PAGES} from '../locales/en-pages.mjs';
import {EN_CONTEXT,englishTemplates} from '../locales/en-context.mjs';
import {DISPLAY_LABELS} from '../lib/locale.mjs';
import {ASSETS} from '../lib/catalog.mjs';
const favoritePrivacy='お気に入りの銘柄は、このブラウザのローカルストレージに保存します。口座への同期や他の端末との共有は行いません。同じブラウザではログアウト後も残ります。ブラウザのサイトデータを削除するとお気に入りも消えます。保存が制限されている場合は、ページを閉じるまでの一時保存になります。';
const dictionary={...EN,...EN_PAGES,...DISPLAY_LABELS,...EN_CONTEXT,'お気に入り':'Favorites',[favoritePrivacy]:'Favorite markets are stored in this browser’s local storage, not synced to an account or another device. They remain after signing out in the same browser. Clearing site data removes them. When browser storage is unavailable, preferences last only until the page is closed.'};
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pattern=new RegExp(Object.keys(dictionary).sort((a,b)=>b.length-a.length).map(escapeRegExp).join('|'),'gu');
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
export function translateSource(text,{js=false,name='source'}={}){
 const result=text.replace(pattern,key=>js?dictionary[key].replace(/[\\'"`]/g,c=>'\\x'+c.charCodeAt(0).toString(16).padStart(2,'0')):dictionary[key]);
 if(cjk.test(result)){const missing=[...new Set(result.split(/[<>\n'"`]/).filter(s=>cjk.test(s)))];throw Error(`Missing English copy in ${name}:\n${missing.join('\n')}`);}
 return result;
}
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,12);
const pages=['index.html','app.html','terms.html','privacy.html','data.html'];
const names=Object.fromEntries(ASSETS.map(a=>[a.symbol,a.nameEn||a.name]));
const privacy='<h2>表示言語</h2><p>初回表示はVercelがアクセス元IPから推定する国情報を使い、日本は日本語、それ以外は英語を選びます。国情報が不明な場合はブラウザ言語を使います。GPS・精密な位置情報の許可は求めず、言語判定のために国情報をデータベースへ追加保存しません。手動で選んだ言語は、このブラウザのローカルストレージに保存します。VPN等により推定国が実際の所在地と異なる場合は手動で変更できます。</p>'+`<h2>お気に入り</h2><p>${favoritePrivacy}</p>`;
export async function buildSite(root=resolve(import.meta.dirname,'..')){
 // Report all missing static copy in one pass, before replacing a prior build.
 const issues=[];
 for(const name of [...pages,'app.js','progress-ui.js']){const source=await readFile(resolve(root,'public',name),'utf8');try{translateSource(englishTemplates(source)+(name==='privacy.html'?privacy:''),{js:name.endsWith('.js'),name});}catch(e){issues.push(e.message);}}
 if(issues.length)throw Error(issues.join('\n\n'));
 const out=resolve(root,'dist');await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await cp(resolve(root,'public'),out,{recursive:true});
 const write=(path,text)=>writeFile(resolve(out,path),text),bundleNames={};
 const languageSource=await readFile(resolve(root,'public/site-language.js'),'utf8');
 const languageName=`site-language.${hash(languageSource)}.js`;await write(languageName,languageSource);
 const css=await readFile(resolve(root,'public/locale.css'),'utf8'),cssName=`locale.${hash(css)}.css`;await write(cssName,css);
 const favoritesLogic=await readFile(resolve(root,'public/favorites.js'),'utf8');
 const favoritesLogicName=`favorites.${hash(favoritesLogic)}.js`;await write(favoritesLogicName,favoritesLogic);
 let favoritesUi=await readFile(resolve(root,'public/market-favorites.js'),'utf8');
 if(!favoritesUi.includes("'./favorites.js'"))throw Error('Favorites import changed: review build integration.');
 favoritesUi=favoritesUi.replace("'./favorites.js'",`'./${favoritesLogicName}'`);
 const favoritesUiName=`market-favorites.${hash(favoritesUi)}.js`;await write(favoritesUiName,favoritesUi);
 const favoritesCss=await readFile(resolve(root,'public/market-favorites.css'),'utf8');
 const favoritesCssName=`market-favorites.${hash(favoritesCss)}.css`;await write(favoritesCssName,favoritesCss);
 for(const language of ['ja','en']){
  let progress=await readFile(resolve(root,'public/progress-ui.js'),'utf8');
  if(language==='en')progress=translateSource(englishTemplates(progress),{js:true,name:'progress-ui.js'}).replaceAll("'ja-JP'","'en-GB'");
  const progressName=`progress-ui.${language}.${hash(progress)}.js`;await write(progressName,progress);
  let app=await readFile(resolve(root,'public/app.js'),'utf8');
  if(!/\.\/progress-ui\.js\?v=/.test(app))throw Error('Progress import changed: review localization integration.');
  app=app.replace(/\.\/progress-ui\.js\?v=[^']+/g,'./'+progressName);
  const header="headers:body===undefined?{}:{'Content-Type'";
  if(!app.includes(header))throw Error('API transport changed: review locale header integration.');
  app=app.replace(header,`headers:body===undefined?{'X-Practice-Language':'${language}'}:{'X-Practice-Language':'${language}','Content-Type'`);
  app=app.replace("url:location.origin+'/'",`url:location.origin+'/${language}/index.html'`);
  if(language==='en'){
   // Translate immutable source literals, NEVER assembled HTML or user strings.
   app=translateSource(englishTemplates(app),{js:true,name:'app.js'}).replaceAll("'ja-JP'","'en-GB'");
   app=app.replace("currency:'JPY',maximumFractionDigits", "currency:'JPY',currencyDisplay:'code',maximumFractionDigits");
   app=app.replace(/esc\((t|pos|a|q|c)\.name\)/g,(_,id)=>`esc(displayAssetName(${id}.symbol,${id}.name))`);
   app=`const displayAssetName=(symbol,fallback)=>(${JSON.stringify(names)})[symbol]||fallback;\n`+app;
  }
  const rooms={GENERAL:language==='en'?'General discussion':'総合コメント',...Object.fromEntries(ASSETS.map(a=>[a.symbol,language==='en'?(a.nameEn||a.name):a.name]))};
  if(!/const roomNames=\{[^;]+\};/.test(app))throw Error('Discussion labels changed: review catalog integration.');
  app=app.replace(/const roomNames=\{[^;]+\};/,`const roomNames=${JSON.stringify(rooms)};`);
  const appName=`app.${language}.${hash(app)}.js`;await write(appName,app);bundleNames[language]=appName;
 }
 const loader=`import {ready,language,navigating} from './${languageName}';\nawait ready;\nif(!navigating){const {mountMarketFavorites}=await import('./${favoritesUiName}');mountMarketFavorites({language});await import('./'+(${JSON.stringify(bundleNames)})[language]);}\n`;
 const loaderName=`app-loader.${hash(loader)}.js`;await write(loaderName,loader);await write('app-loader.js',loader);
 const manifest=JSON.parse(await readFile(resolve(root,'public/manifest.json'),'utf8'));
 for(const language of ['ja','en']){await mkdir(resolve(out,language),{recursive:true});await write(language+'/manifest.json',JSON.stringify({...manifest,id:'/app.html',scope:'/',lang:language,start_url:`/${language}/app.html`,description:language==='en'?'Crypto and FX paper trading with virtual JPY funds':manifest.description},null,2)+'\n');}
 for(const page of pages){
  let source=await readFile(resolve(root,'public',page),'utf8');
  if(page==='privacy.html')source=source.replace('</main>',privacy+'</main>');
  source=source.replace(/<script type="module" src="\/app\.js[^\"]*"><\/script>/,`<script type="module" src="/${loaderName}"></script>`);
  if(page!=='app.html')source=source.replace('</head>',`<script type="module" src="/${languageName}"></script></head>`);
  source=source.replace('</head>',`<link rel="stylesheet" href="/${cssName}"></head>`);
  if(page==='app.html')source=source.replace('</head>',`<link rel="stylesheet" href="/${favoritesCssName}"></head>`);
  for(const language of ['auto','ja','en']){
   let html=language==='en'?translateSource(source,{name:page}):source;
   html=html.replace('lang="ja"',`lang="${language==='en'?'en':'ja'}"`).replace('<html ',`<html data-locale-mode="${language}" `);
   if(language!=='auto')html=html.replace(/href="\/(index\.html|app\.html|terms\.html|privacy\.html|data\.html)?"/g,(_,file)=>`href="/${language}/${file||'index.html'}"`).replace('href="/manifest.json"',`href="/${language}/manifest.json"`);
   const base='https://practice-ashy-delta.vercel.app';const path=language==='auto'?'/'+(page==='index.html'?'':page):`/${language}/${page}`;
   const alternates=`<link rel="canonical" href="${base}${path}"><link rel="alternate" hreflang="ja" href="${base}/ja/${page}"><link rel="alternate" hreflang="en" href="${base}/en/${page}"><link rel="alternate" hreflang="x-default" href="${base}/${page==='index.html'?'':page}">`;
   html=html.replace('</head>',alternates+'</head>');
   await write(language==='auto'?page:language+'/'+page,html);
  }
 }
 await write('locale-build.json',JSON.stringify({version:'1.2.0',languages:['ja','en'],bundles:bundleNames,loader:loaderName,languageScript:languageName,stylesheet:cssName,favorites:{logic:favoritesLogicName,ui:favoritesUiName,stylesheet:favoritesCssName},marketSymbols:ASSETS.map(a=>a.symbol),policy:'explicit URL > saved preference > Vercel country > browser language > English',currency:'JPY',rankingTimezone:'Asia/Tokyo'},null,2)+'\n');
 return{out,bundles:bundleNames};
}
