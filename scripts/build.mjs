import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'vite';
import {root,verifyAssets} from './verify-assets.mjs';
verifyAssets();
await build();
const dist=path.join(root,'dist'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function walk(dir,prefix=''){const out=[];for(const name of await fs.readdir(dir)){const rel=prefix+name;const file=path.join(dir,name);if((await fs.stat(file)).isDirectory())out.push(...await walk(file,rel+'/'));else out.push(rel);}return out.sort();}
const payload=[];
for(const name of await walk(dist)){if(name==='sw.js'||name==='offline-assets.json')continue;const b=await fs.readFile(path.join(dist,name));payload.push({path:name,size:b.length,sha256:hash(b)});}
const releaseId=hash(JSON.stringify(payload));
const template=await fs.readFile(path.join(root,'scripts/sw-template.js'),'utf8');
await fs.writeFile(path.join(dist,'sw.js'),template.replaceAll('__ETCL_RELEASE__',releaseId));
const worker=await fs.readFile(path.join(dist,'sw.js'));
const assets=[...payload,{path:'sw.js',size:worker.length,sha256:hash(worker)}].sort((a,b)=>a.path<b.path?-1:1);
await fs.writeFile(path.join(dist,'offline-assets.json'),JSON.stringify({version:1,basePath:'/English-Audio-ETCL/',releaseId,assets},null,2)+'\n');
console.log(JSON.stringify({releaseId,assets:assets.length,bytes:assets.reduce((n,a)=>n+a.size,0)}));
