import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {root,verifyAssets} from './verify-assets.mjs';
verifyAssets();
const dist=path.join(root,'dist'),manifest=JSON.parse(await fs.readFile(path.join(dist,'offline-assets.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const a of manifest.assets){const b=await fs.readFile(path.join(dist,a.path));assert.equal(b.length,a.size);assert.equal(hash(b),a.sha256);}
await fs.mkdir(path.join(root,'release'),{recursive:true});
const target=path.join(root,'release/pages');
await fs.mkdir(target,{recursive:true});
await fs.cp(dist,target,{recursive:true});
await fs.writeFile(path.join(root,'release/package.json'),JSON.stringify({repository:'English-Audio-ETCL',basePath:manifest.basePath,releaseId:manifest.releaseId,assets:manifest.assets,published:false},null,2));
console.log('Verified publish package: release/pages');
