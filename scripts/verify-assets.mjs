import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name));
const json=name=>JSON.parse(read(name).toString('utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function verifyOriginalAssets() {
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
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify({...verifyAssets(),concatenated:verifyConcatenatedAssets()}));


export function verifyConcatenatedAssets(
 manifest=json('web/src/concatenated-recall-manifest.json'),
 provenance=json('assets/concatenated-recall-provenance.json'),
 lessons=json('web/src/etcl-lessons-v2.json'),
){
 assert.equal(manifest.version,1);assert.equal(manifest.recallSeconds,5);assert.equal(manifest.englishRepetitions,2);
 assert.equal(manifest.lessons.length,12);assert.equal(provenance.lessons.length,12);
 let phrases=0,bytes=0,duration=0;
 for(const [lessonIndex,lesson] of lessons.entries()){
  const track=manifest.lessons[lessonIndex],proof=provenance.lessons[lessonIndex];
  assert.equal(track.lessonId,lesson.id);assert.equal(proof.lessonId,lesson.id);
  assert.equal(track.path,'lessons/'+lesson.id+'/recall-concatenated-v1.mp3');
  assert.equal(track.sampleRate,24000);assert.equal(track.phraseCount,lesson.phrases.length);
  assert.equal(track.timeline.length,lesson.phrases.length*4);
  const audio=read('web/public/'+track.path);
  assert.equal(audio.length,track.size);assert.equal(hash(audio),track.sha256);
  assert.equal(proof.output.size,track.size);assert.equal(proof.output.sha256,track.sha256);
  assert.equal(proof.verification.status,'PASS');assert.equal(proof.verification.decodedSamplesExact,true);
  for(const pin of proof.sourcePins){
   assert(pin.path.startsWith('web/'));assert(!pin.path.includes('..'));
   assert(pin.normalization===undefined||pin.normalization==='lf');
   const raw=read(pin.path);
   const original=pin.normalization==='lf'?Buffer.from(raw.toString('utf8').replace(/\r\n/g,'\n')):raw;
   assert.equal(original.length,pin.size);assert.equal(hash(original),pin.sha256);
  }
  let endSample=0;
  for(const [i,phrase] of lesson.phrases.entries()){
   const group=track.timeline.slice(i*4,i*4+4);
   assert.deepEqual(group.map(x=>x.kind),['japanese','recall','english','english']);
   assert.deepEqual(group.map(x=>x.repetition),[null,null,1,2]);
   assert.equal(proof.phrases[i].en,phrase.en);assert.equal(proof.phrases[i].ja,phrase.ja);
   for(const [j,entry] of group.entries()){
    assert.equal(entry.phrase,i+1);assert.equal(entry.startSample,endSample);
    assert(Number.isInteger(entry.endSample)&&entry.endSample>entry.startSample);
    assert(Math.abs(entry.start-entry.startSample/24000)<1e-8);
    assert(Math.abs(entry.end-entry.endSample/24000)<1e-8);
    const {pcmSha256,...provenEntry}=proof.timeline[i*4+j];assert.deepEqual(entry,provenEntry);
    endSample=entry.endSample;
   }
   assert.equal(group[1].endSample-group[1].startSample,120000);
   assert.equal(group[2].endSample-group[2].startSample,group[3].endSample-group[3].startSample);
   assert.equal(proof.timeline[i*4+2].pcmSha256,proof.timeline[i*4+3].pcmSha256);
   phrases++;
  }
  assert.equal(endSample,track.totalSamples);assert.equal(endSample/24000,track.duration);
  bytes+=track.size;duration+=track.duration;
 }
 assert.equal(phrases,68);
 return {lessons:12,phrases,concatenatedMp3:12,bytes,duration};
}


export function verifyAssets(){
 const original=verifyOriginalAssets();
 verifyConcatenatedAssets();
 return original;
}
