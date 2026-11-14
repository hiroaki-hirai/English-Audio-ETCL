import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyAssets} from '../scripts/verify-assets.mjs';
import {createActiveRecallLibrarySignature,prepareActiveRecallSession,createNextActiveRecallRound,createActiveRecallSessionStore} from '../web/src/active-recall.js';
import {createEtclRecallPlan} from '../web/src/etcl-recall-plan.js';
import {appStorageKey} from '../web/src/app-storage.js';
import {trainingJapaneseCueMp3Path} from '../web/src/training-japanese-cue.js';
import {validateEtclCatalog} from '../web/src/etcl-catalog.js';
import {EtclRecallTransport} from '../web/src/etcl-recall-transport.js';
import {createJapaneseMp3Player} from '../web/src/japanese-cue.js';
const lessons=JSON.parse(fs.readFileSync('web/src/etcl-lessons-v2.json','utf8'));
const notes=JSON.parse(fs.readFileSync('web/src/etcl-explanations-v2.json','utf8'));
const identity=(q:any[])=>q.map(e=>e.lessonId+':'+e.phraseIndex);
test('all 68 translations, explanations, source manifests and 104 media references are verified',()=>{
 assert.deepEqual(verifyAssets(),{lessons:12,phrases:68,japaneseCues:68,englishMp3:24,metadata:12});
 assert.equal(validateEtclCatalog(lessons,notes).size,12);
});
test('catalog refuses mismatched translation, duplicate identity and missing explanation',()=>{
 for(const mutate of [(n:any[])=>n[0].ja+='x',(n:any[])=>n[1].phraseIndex=n[0].phraseIndex,(n:any[])=>n.pop()]){
  const copy=structuredClone(notes);mutate(copy);assert.throws(()=>validateEtclCatalog(lessons,copy));
 }
});
test('all twelve lesson queues preserve scope in all three ordering modes',()=>{
 for(const l of lessons)for(const mode of ['global','sequential-category','sequential-category-order'] as const){
  const plan=createEtclRecallPlan(lessons,l.id,'lesson');assert(plan.canPlay);
  const prepared=prepareActiveRecallSession(plan.lessons,null,()=>.4,mode);
  assert.equal(prepared.queue.length,l.phrases.length);assert(prepared.queue.every(e=>e.lessonId===l.id));
 }
});
test('global shuffle covers all68 exactly once in consecutive rounds',()=>{
 const expected=lessons.flatMap((l:any)=>l.phrases.map((_:any,i:number)=>l.id+':'+i)).sort();
 for(let round=0;round<8;round++){
  const next=createNextActiveRecallRound(lessons,{version:1,currentRound:round,lastCompletedRound:Math.max(0,round-1)},Math.random,'global');
  assert.deepEqual(identity(next.preparedSession.queue).sort(),expected);assert.equal(next.roundState.currentRound,round+1);
 }
});
test('ordered mode preserves all11 boundaries and original phrase order',()=>{
 const q=prepareActiveRecallSession(lessons,null,Math.random,'sequential-category-order').queue;
 assert.deepEqual(identity(q),lessons.flatMap((l:any)=>l.phrases.map((_:any,i:number)=>l.id+':'+i)));
 assert.equal(q.filter((e,i)=>i&&q[i-1].lessonId!==e.lessonId).length,11);
});
test('saved queues resume at the same identity without randomization',()=>{
 for(const mode of ['global','sequential-category-order'] as const){
  const p=prepareActiveRecallSession(lessons,null,()=>.3,mode);p.session.currentIndex=31;
  const resumed=prepareActiveRecallSession(lessons,JSON.stringify(p.session),()=>{throw Error('Must not reshuffle')},mode);
  assert(resumed.resumed);assert.deepEqual(resumed.session,p.session);
 }
 assert.equal(createActiveRecallLibrarySignature(lessons),'fnv1a32:68:07f4f6d8');
});
test('own namespace separates Lesson1, other lessons, library68 and EAG/preview sentinels',()=>{
 const prefix='etcl.app.v1.',keys=new Set<string>();
 for(const l of lessons)for(const scope of ['lesson','all'] as const){
  const k=appStorageKey(prefix+'activeRecallSession.v1',l.id,scope);
  assert(k.startsWith(prefix));assert(!k.startsWith('eag.'));if(scope==='lesson'){assert(!keys.has(k));keys.add(k);}
 }
 const values=new Map([['eag.activeRecallSession.v1','EAG'],['eag.preview.etcl01.etcl-v2.activeRecallSession.v1','PREVIEW']]);
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 const lessonKey=appStorageKey(prefix+'activeRecallSession.v1',lessons[0].id);
 const allKey=appStorageKey(prefix+'activeRecallSession.v1',lessons[0].id,'all');
 const store=createActiveRecallSessionStore(()=>storage,lessonKey);
 store.save(prepareActiveRecallSession([lessons[0]],null,()=>.3,'global').session);
 assert.equal(storage.getItem(allKey),null);assert.equal(values.get('eag.activeRecallSession.v1'),'EAG');
 assert.equal(values.get('eag.preview.etcl01.etcl-v2.activeRecallSession.v1'),'PREVIEW');
 assert.equal(appStorageKey(prefix+'weakPhrases.v1',lessons[0].id),appStorageKey(prefix+'weakPhrases.v1',lessons[11].id));
 assert.throws(()=>appStorageKey('eag.weakPhrases.v1',lessons[0].id));
});
test('v2 routing rejects unknown identities instead of using old cues',()=>{
 assert.match(trainingJapaneseCueMp3Path(lessons[11].id,5),/japanese-cues-v2\/phrase-006.mp3$/);
 assert.throws(()=>trainingJapaneseCueMp3Path('etcl-unknown',0));
 assert.throws(()=>trainingJapaneseCueMp3Path(lessons[0].id,99));
});
test('pause retains remaining wait and Stop releases gates without restart',async()=>{
 const t=new EtclRecallTransport();t.start();let done=false;
 const pending=t.wait(35).then(()=>{done=true});assert(t.pause());assert(!t.pause());
 await new Promise(r=>setTimeout(r,50));assert(!done);assert(t.resume());await pending;
 assert(done);t.pause();const gate=t.checkpoint();t.stop();await gate;assert(!t.isActive);assert(!t.resume());
});
class AudioStub extends EventTarget{
 src='';loop=true;error=null;plays=0;pauses=0;
 play(){this.plays++;return Promise.resolve();}pause(){this.pauses++;}
}
test('Cue pause/resume retains its promise and handles ended while paused',async()=>{
 const audio=new AudioStub();const player=createJapaneseMp3Player(()=>audio,()=>({visibility:'visible',time:0}));
 let done=false;const pending=player.play({lessonId:lessons[0].id,phraseIndex:0,queueIndex:0,assetScope:'lesson'},'/English-Audio-ETCL/').then(()=>{done=true});
 assert(player.pause());audio.dispatchEvent(new Event('ended'));await Promise.resolve();assert(!done);
 assert(await player.resume());await pending;assert(done);
});
test('Cue Stop cancels pending playback and prevents stale resume',async()=>{
 const audio=new AudioStub();const player=createJapaneseMp3Player(()=>audio,()=>({visibility:'visible',time:0}));
 const pending=player.play({lessonId:lessons[0].id,phraseIndex:0,queueIndex:0,assetScope:'lesson'},'/English-Audio-ETCL/');
 player.pause();player.cancel();await pending;const before=audio.plays;
 assert.equal(await player.resume(),false);assert.equal(audio.plays,before);
});
