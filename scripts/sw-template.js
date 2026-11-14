const RELEASE='__ETCL_RELEASE__';
const SCOPE=self.registration.scope;
const BASE=new URL(SCOPE);
const CACHE='etcl-app-'+encodeURIComponent(BASE.pathname)+'-'+RELEASE;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const response=await fetch(new URL('offline-assets.json',SCOPE),{cache:'no-store'});
 if(!response.ok)throw Error('Offline manifest unavailable');
 const manifest=await response.json();
 if(manifest.version!==1||manifest.basePath!==BASE.pathname||manifest.releaseId!==RELEASE||!Array.isArray(manifest.assets))throw Error('Wrong offline manifest');
 const payload=manifest.assets.filter(a=>a.path!=='sw.js').map(a=>({path:a.path,size:a.size,sha256:a.sha256}));
 if(await digest(new TextEncoder().encode(JSON.stringify(payload)))!==RELEASE)throw Error('Offline identity mismatch');
 const seen=new Set();
 for(const a of manifest.assets){
  if(!/^[a-zA-Z0-9_./-]+$/.test(a.path)||a.path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(a.path.toLowerCase()))throw Error('Invalid cache asset');
  seen.add(a.path.toLowerCase());
 }
 const cache=await caches.open(CACHE);
 for(const asset of manifest.assets){
  const url=new URL(asset.path,SCOPE),r=await fetch(url,{cache:'no-store'});
  if(r.status!==200||r.headers.has('content-range'))throw Error('Incomplete offline asset');
  const bytes=await r.clone().arrayBuffer();
  if(bytes.byteLength!==asset.size||await digest(bytes)!==asset.sha256)throw Error('Offline asset hash mismatch');
  await cache.put(url,r);
 }
 await cache.put(new URL('offline-assets.json',SCOPE),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
})()));
// Natural activation only. Never claim clients or delete other caches.
self.addEventListener('activate',event=>event.waitUntil(Promise.resolve()));
async function rangeResponse(request,response){
 const range=request.headers.get('range'),data=await response.arrayBuffer(),length=data.byteLength;
 const invalid=()=>new Response(null,{status:416,headers:{'Content-Range':'bytes */'+length}});
 const match=/^bytes=(\d*)-(\d*)$/i.exec(range.trim());
 if(!match||(!match[1]&&!match[2]))return invalid();
 let start,end;
 if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();start=Math.max(0,length-suffix);end=length-1;}
 else {start=Number(match[1]);end=match[2]?Number(match[2]):length-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=length||start>end)return invalid();
 end=Math.min(end,length-1);
 return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':response.headers.get('Content-Type')||'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+length}});
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==BASE.origin||!url.pathname.startsWith(BASE.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const key=url.pathname===BASE.pathname?new URL('index.html',SCOPE):url;
  const cached=await cache.match(key);
  if(cached){
   if(url.pathname.endsWith('.mp3')&&event.request.headers.has('range'))return rangeResponse(event.request,cached);
   return cached;
  }
  return fetch(event.request);
 })());
});
