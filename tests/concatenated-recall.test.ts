import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createConcatenatedRecall, type ConcatenatedSnapshot} from '../web/src/concatenated-recall.js';
import {verifyConcatenatedAssets} from '../scripts/verify-assets.mjs';
const manifest=JSON.parse(fs.readFileSync('web/src/concatenated-recall-manifest.json','utf8'));
class Audio extends EventTarget {
 src='original.mp3';loop=true;currentTime=0;paused=true;error:{code:number}|null=null;plays=0;
 request:()=>Promise<void>=()=>Promise.resolve();
 play(){this.plays++;this.paused=false;this.dispatchEvent(new Event('playing'));return this.request();}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
 load(){}
}
function setup(){
 const audio=new Audio(),snapshots:ConcatenatedSnapshot[]=[];
 const controller=createConcatenatedRecall(audio,manifest.lessons[0],'/English-Audio-ETCL/',snapshot=>snapshots.push(snapshot));
 return {audio,controller,snapshots,last:()=>snapshots.at(-1)!};
}
test('all12 generated files and272 contiguous timeline entries match source pins and recorded hashes',()=>{
 const result=verifyConcatenatedAssets();
 assert.equal(result.phrases,68);assert.equal(result.concatenatedMp3,12);assert(result.bytes>0);
 assert.equal(manifest.lessons.reduce((n:any,t:any)=>n+t.timeline.length,0),272);
});
test('asset verifier rejects missing lessons, phrase order, recall duration and repetition corruption',()=>{
 for(const mutate of [
  (m:any)=>m.lessons.pop(),
  (m:any)=>m.lessons[0].timeline[0].phrase=2,
  (m:any)=>m.lessons[0].timeline[1].endSample++,
  (m:any)=>m.lessons[0].timeline[3].repetition=3,
 ]){
  const copy=structuredClone(manifest);mutate(copy);assert.throws(()=>verifyConcatenatedAssets(copy));
 }
});
test('concatenated pause/native resume preserves time; ended never auto-plays and Stop restores source/loop',async()=>{
 const {audio,controller,last}=setup();controller.start();await Promise.resolve();
 assert.equal(audio.plays,1);assert.equal(audio.loop,false);
 audio.currentTime=12;audio.pause();assert.equal(last().state,'paused');
 controller.resume();assert.equal(audio.currentTime,12);assert.equal(audio.plays,2);
 audio.currentTime=manifest.lessons[0].duration;audio.dispatchEvent(new Event('ended'));
 assert.equal(last().state,'ended');controller.resume();assert.equal(audio.plays,2);
 controller.stop();assert.equal(audio.src,'original.mp3');assert.equal(audio.loop,true);assert(!controller.ownsAudio);
});
test('NotAllowedError stays visible with no retry; a fresh user start can recover',async()=>{
 const {audio,controller,last}=setup();
 audio.request=()=>Promise.reject(Object.assign(new Error('Denied'),{name:'NotAllowedError'}));
 controller.start();await Promise.resolve();assert.equal(last().state,'error');assert(last().message.includes('NotAllowedError'));
 await Promise.resolve();assert.equal(audio.plays,1);assert(audio.paused);
 audio.request=()=>Promise.resolve();controller.start();await Promise.resolve();assert.equal(last().state,'playing');
 assert.equal(audio.currentTime,0);assert.equal(audio.plays,2);controller.stop();
});
test('a rejected play from a stopped run cannot overwrite the next run state',async()=>{
 const {audio,controller,last}=setup();let reject!:(error:Error)=>void;
 audio.request=()=>new Promise<void>((_,r)=>{reject=r;});
 controller.start();controller.stop();audio.request=()=>Promise.resolve();controller.start();await Promise.resolve();
 reject(new Error('Retired request'));await Promise.resolve();assert.equal(last().state,'playing');assert(controller.ownsAudio);
 controller.stop();
});
