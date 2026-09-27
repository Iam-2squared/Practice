// Language-only preference; no GPS permission, IP lookup service or tracking ID.
const VALID=new Set(['ja','en']),KEY='practice.language';
const valid=value=>VALID.has(value)?value:null;
export function preferredBrowserLanguage(languages){for(const tag of languages||[]){const base=String(tag).toLowerCase().split('-')[0];if(VALID.has(base))return base;}return'en';}
export function languagePath(url,language){const next=new URL(url),page=next.pathname.replace(/^\/(ja|en)(?=\/|$)/,'').replace(/^\/$/,'/index.html');next.pathname=`/${language}${page.startsWith('/')?page:'/'+page}`;next.searchParams.delete('lang');return next;}
export function initialChoice({url,saved}){const u=new URL(url),query=valid(u.searchParams.get('lang')),path=valid(u.pathname.match(/^\/(ja|en)(?:\/|$)/)?.[1]);return query||path||valid(saved);}
function readSaved(){try{return localStorage.getItem(KEY);}catch{return null;}}
export let language=typeof document==='undefined'?'en':valid(document.documentElement.lang)||'en';
export let navigating=false;
async function start(){
 const url=new URL(location.href);let selected=initialChoice({url:url.href,saved:readSaved()});
 if(!selected){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),2500);try{const response=await fetch('/api/index?action=locale',{cache:'no-store',credentials:'omit',signal:ctl.signal});if(response.ok)selected=valid((await response.json()).language);}catch{}finally{clearTimeout(timer);}selected||=preferredBrowserLanguage(navigator.languages||[navigator.language]);}
 language=selected;const target=languagePath(url.href,language);
 if(target.pathname!==url.pathname||url.searchParams.has('lang')){navigating=true;location.replace(target.pathname+target.search+target.hash);return;}
 document.documentElement.lang=language;
 const holder=document.createElement('div');holder.className='language-control';
 const label=document.createElement('label');label.htmlFor='practice-language';label.textContent='Language';
 const select=document.createElement('select');select.id='practice-language';select.setAttribute('aria-label','Language / 言語');
 for(const [value,text]of [['ja','日本語'],['en','English']]){const option=document.createElement('option');option.value=value;option.textContent=text;option.selected=value===language;select.append(option);}
 holder.append(label,select);
 const header=document.querySelector('.header,.landing-header');
 if(header)header.append(holder);else{const page=document.querySelector('.legal-page');if(page)page.prepend(holder);}
 select.addEventListener('change',()=>{
  const next=valid(select.value);if(!next||next===language)return;
  // A language change must not discard a password, comment draft or order dialog.
  if(document.querySelector('dialog[open]')){select.value=language;return;}
  try{localStorage.setItem(KEY,next);}catch{}
  const target=languagePath(location.href,next);location.assign(target.pathname+target.search+target.hash);
 });
 // Preserve explicit language links even when browser storage is unavailable.
 for(const link of document.querySelectorAll('a[href]')){try{const u=new URL(link.href);if(u.origin===location.origin&&/^\/(?:index\.html|app\.html|terms\.html|privacy\.html|data\.html)?$/.test(u.pathname)){const v=languagePath(u.href,language);link.href=v.pathname+v.search+v.hash;}}catch{}}
}
export const ready=typeof document==='undefined'?Promise.resolve():start();
