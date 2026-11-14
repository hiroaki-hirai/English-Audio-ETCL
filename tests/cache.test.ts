import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
const scope='https://example.test/English-Audio-ETCL/';
const hash=(b:any)=>createHash('sha256').update(b).digest('hex');
function worker(corrupt=false){
 const bodies=new Map([['index.html','ETCL'],['clip.mp3','0123456789']]);
 const payload=[...bodies].map(([path,b])=>({path,size:Buffer.byteLength(b),sha256:hash(b)}));
 const releaseId=hash(JSON.stringify(payload));
 const manifest={version:1,basePath:'/English-Audio-ETCL/',releaseId,assets:payload};
 const cachesData=new Map<string,Map<string,Response>>([['eag-training-v8',new Map()],['unrelated',new Map()]]);
 const events:any={};let forbidden=0;
 const caches={open:async(name:string)=>{const data=cachesData.get(name)??new Map();cachesData.set(name,data);return {put:async(k:any,v:Response)=>{data.set(String(k.url??k),v.clone())},match:async(k:any)=>data.get(String(k.url??k))?.clone()};},delete:()=>{forbidden++;throw Error('No cleanup allowed')}};
 const fetcher=async(input:any)=>{
  const url=String(input.url??input);
  if(url===scope+'offline-assets.json')return Response.json(manifest);
  const name=url.slice(scope.length),body=bodies.get(name);
  if(body===undefined)throw Error('Network offline');
  return new Response(corrupt&&name==='clip.mp3'?'bad':body);
 };
 const self={registration:{scope},addEventListener:(name:string,fn:any)=>{events[name]=fn},skipWaiting:()=>{forbidden++},clients:{claim:()=>{forbidden++}}};
 vm.runInNewContext(fs.readFileSync('scripts/sw-template.js','utf8').replaceAll('__ETCL_RELEASE__',releaseId),{self,caches,fetch:fetcher,URL,Response,TextEncoder,Uint8Array,crypto:webcrypto,Promise,Set,Number,Error,Array});
 return {events,cachesData,get forbidden(){return forbidden},install:async()=>{let p:Promise<any>=Promise.resolve();events.install({waitUntil:(x:any)=>{p=x}});await p;},
 request:async(url:string,range?:string)=>{let result:any;events.fetch({request:new Request(url,{headers:range?{range}:undefined}),respondWith:(p:any)=>{result=p}});return result?await result:undefined;}};
}
test('dedicated cache installs all validated assets without touching EAG caches or claiming clients',async()=>{
 const w=worker();await w.install();assert(w.cachesData.has('eag-training-v8'));assert(w.cachesData.has('unrelated'));assert.equal(w.forbidden,0);
 assert.equal(await (await w.request(scope)).text(),'ETCL');
 assert.equal(await w.request('https://example.test/English-Audio-Generator/'),undefined);
});
test('offline audio Range supports normal, suffix, clamped and invalid requests',async()=>{
 const w=worker();await w.install();
 for(const [range,status,text] of [['bytes=2-5',206,'2345'],['bytes=-3',206,'789'],['bytes=8-999',206,'89'],['bytes=99-',416,'']] as const){
  const response=await w.request(scope+'clip.mp3',range);assert.equal(response.status,status);assert.equal(await response.text(),text);
 }
});
test('corrupt audio rejects installation and never creates completion manifest',async()=>{
 const w=worker(true);await assert.rejects(w.install(),/hash mismatch/);assert.equal(w.forbidden,0);
 const own=[...w.cachesData].find(([name])=>name.startsWith('etcl-app-'))![1];
 assert(!own.has(scope+'offline-assets.json'));
});
