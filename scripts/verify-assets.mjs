import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name));
const json=name=>JSON.parse(read(name).toString('utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function verifyAssets() {
 const lessons=json('web/src/etcl-lessons-v2.json'),notes=json('web/src/etcl-explanations-v2.json'),assets=json('web/src/etcl-all-cue-assets.json');
 assert.equal(lessons.length,12);assert.equal(notes.length,68);assert.equal(assets.lessons.length,12);
 const pins=json('assets/english-baseline.json');let count=0;
 for(const [lessonIndex,lesson] of lessons.entries()){
  const a=assets.lessons[lessonIndex];assert.equal(a.lessonId,lesson.id);
  const raw=read('assets/provenance/'+lesson.id+'.json');
  assert.equal(hash(raw),a.manifestSha256);const manifest=JSON.parse(raw.toString('utf8'));assert.equal(manifest.status,'verified');
  assert.equal(a.entries.length,lesson.phrases.length);assert.equal(manifest.entries.length,lesson.phrases.length);
  const metadata=json('web/public/lessons/'+lesson.id+'/metadata.json');
  assert.equal(metadata.phrases.length,lesson.phrases.length);
  for(const [i,phrase] of lesson.phrases.entries()){
   const e=a.entries[i],m=manifest.entries[i],n=notes.find(n=>n.lessonId===lesson.id&&n.phraseIndex===i);
   assert.equal(e.phraseIndex,i);assert.equal(m.phraseIndex,i);assert.equal(metadata.phrases[i].index,i);
   assert.equal(e.en,phrase.en);assert.equal(e.ja,phrase.ja);assert.equal(m.ja,phrase.ja);
   assert(n&&n.en===phrase.en&&n.ja===phrase.ja&&n.grammar&&n.chunks);
   assert.equal(e.path,'lessons/'+lesson.id+'/japanese-cues-v2/phrase-'+String(i+1).padStart(3,'0')+'.mp3');
   assert.equal(m.audioSha256,e.sha256);assert.equal(m.audioBytes,e.size);
   const bytes=read('web/public/'+e.path);assert.equal(bytes.length,e.size);assert.equal(hash(bytes),e.sha256);
   count++;
  }
 }
 assert.equal(count,68);
 for(const [name,pin] of Object.entries(pins)){const bytes=read(name);assert.equal(bytes.length,pin.size);assert.equal(hash(bytes),pin.sha256);}
 const lessonDirs=fs.readdirSync(path.join(root,'web/public/lessons'));assert.deepEqual(lessonDirs.sort(),lessons.map(l=>l.id).sort());
 return {lessons:12,phrases:68,japaneseCues:count,englishMp3:24,metadata:12};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyAssets()));
