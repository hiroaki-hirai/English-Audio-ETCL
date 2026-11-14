import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {build} from 'vite';
const base='/English-Audio-ETCL/',origin='https://example.test';
const lessons=JSON.parse(fs.readFileSync('web/src/etcl-lessons-v2.json','utf8'));
const flush=()=>new Promise(r=>setTimeout(r,5));
async function poll(fn:()=>boolean){for(let i=0;i<120;i++){if(fn())return;await flush();}throw Error('Runtime checkpoint timed out');}
let gesture=false;
class Control{
 handlers=new Map<string,Function[]>();dataset:any={};disabled=false;textContent='';src='';currentSrc='';currentTime=0;duration=10000;paused=true;loop=false;error=null;plays=0;muted=false;readyState=1;seeking=false;requireGesture=false;unlocked=false;rejectPlay=false;deferPlay=false;pendingResolve:(()=>void)|null=null;
 constructor(public classes=''){}
 addEventListener(name:string,fn:Function){this.handlers.set(name,[...(this.handlers.get(name)??[]),fn]);}
 removeEventListener(name:string,fn:Function){this.handlers.set(name,(this.handlers.get(name)??[]).filter(f=>f!==fn));}
 emit(name:string){for(const fn of [...(this.handlers.get(name)??[])])fn({});}
 click(){gesture=true;try{this.emit('click');}finally{gesture=false;}}
 play(){
  if(gesture)this.unlocked=true;
  if(this.rejectPlay||(this.requireGesture&&!this.unlocked))return Promise.reject(Object.assign(new Error('Playback requires user activation'),{name:'NotAllowedError'}));
  if(!this.muted)this.plays++;
  this.paused=false;this.currentSrc=this.src;
  if(this.deferPlay&&!this.muted)return new Promise<void>(resolve=>{this.pendingResolve=()=>{this.emit('playing');resolve();};});
  this.emit('playing');return Promise.resolve();
 }
 pause(){this.paused=true;this.emit('pause');}load(){}
 setAttribute(name:string,value:string){(this as any)[name]=value;}
}
// Advance to the same metadata-derived boundary as the production player.
function completeEnglish(p:Awaited<ReturnType<typeof page>>){
 const relative=new URL(p.audio.src,origin).pathname.replace(base,'');
 const m=JSON.parse(fs.readFileSync('web/public/'+relative.replace('lesson.mp3','metadata.json'),'utf8'));
 const index=m.phrases.findLastIndex((x:any)=>x.start<=p.audio.currentTime+0.501);
 const phrase=m.phrases[index],next=m.phrases[index+1];
 p.audio.currentTime=phrase.end??phrase.start+((next?.start??p.audio.duration)-phrase.start-(next?5:0)-5)/2;
 p.audio.emit('timeupdate');
}
let code:Promise<string>|undefined;
function bundle(){return code??=(async()=>{
 const entry=path.resolve('web/src/main.ts');
 const result:any=await build({configFile:false,root:path.resolve('web'),base,logLevel:'silent',
 plugins:[{name:'capture-initial-render',enforce:'pre',transform(source,id){if(path.resolve(id)===entry)return source.replace('void renderLesson(initialLesson);','globalThis.__initialization=renderLesson(initialLesson);');}}],
 build:{write:false,rollupOptions:{input:entry}}});
 return result.output.find((x:any)=>x.type==='chunk'&&x.isEntry).code;
})();}
async function page(initial:Record<string,string>={},options:{requireGesture?:boolean,rejectPlay?:boolean}={}){
 let html='',buttons:Control[]=[];
 const audio=new Control(),japanese:Control[]=[],status=new Control(),diagnostic=new Control(),progress=new Control(),weakCount=new Control();
 audio.requireGesture=!!options.requireGesture;audio.rejectPlay=!!options.rejectPlay;
 const sentinels:any={'eag.weakPhrases.v1':'KEEP-EAG','eag.preview.etcl01.etcl-v2.activeRecallSession.v1':'KEEP-PREVIEW'};
 const saved={...sentinels,...initial};const writes:string[]=[];
 const storage={getItem:(k:string)=>saved[k]??null,setItem:(k:string,v:string)=>{saved[k]=v;writes.push(k)},removeItem:(k:string)=>{delete saved[k];writes.push(k)}};
 const app:any={
  set innerHTML(value:string){html=value;audio.src=value.match(/<audio\b[^>]*src="([^"]*)"/)?.[1]??'';buttons=[...value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>{const b=new Control(m[1].match(/class="([^"]*)"/)?.[1]??'');b.textContent=m[2].trim();b.disabled=/\sdisabled(?:\s|$)/.test(m[1]);for(const a of m[1].matchAll(/data-([a-z-]+)="([^"]*)"/g))b.dataset[a[1].replace(/-([a-z])/g,(_,l)=>l.toUpperCase())]=a[2];return b;});},
  querySelectorAll(selector:string){return buttons.filter(b=>b.classes.split(/\s+/).includes(selector.slice(1)));},
  querySelector(selector:string){if(selector==='audio')return audio;if(selector==='.learning-panel')return null;
   if(selector==='.training-status')return status;if(selector==='.resume-diagnostic')return diagnostic;
   if(selector==='.mode-progress')return progress;if(selector==='.mode-weak-count')return weakCount;
   if(selector==='.japanese-cue-mode')return {value:'mp3',disabled:false};
   return this.querySelectorAll(selector)[0]??null;}
 };
 const mediaHandlers:any={};
 const context:any={document:{querySelector:(s:string)=>s==='#app'?app:null,createElement:()=>({relList:{supports:()=>true}}),addEventListener:()=>{},visibilityState:'visible'},
 window:{localStorage:storage,addEventListener:()=>{},location:{href:origin+base},setTimeout:(fn:()=>void,ms:number)=>setTimeout(fn,ms===5000?1:ms),clearTimeout,
 speechSynthesis:{speaking:false,pending:false,paused:false,cancel:()=>{}}},
 localStorage:storage,navigator:{mediaSession:{playbackState:'none',setActionHandler:(key:string,fn:Function)=>{mediaHandlers[key]=fn}}},console,URL,performance,setTimeout:(fn:()=>void,ms:number)=>setTimeout(fn,ms===5000?1:ms),clearTimeout,
 Audio:class extends Control{constructor(){super();japanese.push(this);}},
 fetch:async(url:string)=>({ok:true,json:async()=>JSON.parse(fs.readFileSync('web/public/'+url.replace(base,''),'utf8'))})};
 vm.runInNewContext(await bundle(),context);await context.__initialization;
 return {app,audio,japanese,status,progress,saved,writes,sentinels,mediaHandlers,html:()=>html};
}
test('actual bundled app renders only12 ETCL lessons and wires every Recall mode without initial storage writes',async()=>{
 const p=await page();assert.equal(p.app.querySelectorAll('.lesson-button').length,12);
 assert.equal(p.app.querySelectorAll('.active-recall-button').length,3);assert.equal(p.app.querySelectorAll('.etcl-library-button').length,2);
 assert(!p.html().includes('existing-mode-tab'));assert(p.html().includes('68'));assert.equal(p.writes.length,0);
 for(const b of [...p.app.querySelectorAll('.active-recall-button'),...p.app.querySelectorAll('.etcl-library-button')])assert.equal(b.handlers.get('click').length,1);
});
test('actual Lesson12 selector starts its six-item Recall with v2 Cue and stops all media',async()=>{
 const p=await page();p.app.querySelectorAll('.lesson-button')[11].click();await flush();
 const button=p.app.querySelectorAll('.active-recall-button')[2];button.click();await poll(()=>p.japanese.length>0);
 assert(p.japanese[0].src.includes(lessons[11].id+'/japanese-cues-v2/phrase-001.mp3'));
 const key='etcl.app.v1.lesson.'+lessons[11].id+'.sequentialCategoryOrderedActiveRecallSession.v1';
 assert.equal(JSON.parse(p.saved[key]).queue.length,6);button.click();await flush();
 assert(p.japanese.every(a=>a.paused));assert(p.audio.paused);
});
test('actual Cue/Recall/English pipeline plays twice and Media Session pause/resume respects Stop ownership',async()=>{
 const p=await page(),button=p.app.querySelectorAll('.active-recall-button')[2];button.click();await poll(()=>p.japanese.length>0);
 p.mediaHandlers.pause();assert(p.japanese[0].paused);p.mediaHandlers.play();assert(!p.japanese[0].paused);
 p.japanese[0].emit('ended');await poll(()=>p.audio.plays===1);assert(p.status.textContent.endsWith('Answer'));
 completeEnglish(p);await poll(()=>p.audio.plays===2);
 button.click();await flush();assert(p.audio.paused);const plays=p.audio.plays;p.mediaHandlers.play();await flush();assert.equal(p.audio.plays,plays);
 for(const[k,v]of Object.entries(p.sentinels))assert.equal(p.saved[k],v);
 assert(p.writes.every(k=>k.startsWith('etcl.app.v1.')));
});
test('actual all68 buttons persist independent unique/ordered queues and preserve lesson sessions',async()=>{
 const p=await page();
 for(const mode of ['global','sequential-category-order']){
  const button=p.app.querySelectorAll('.etcl-library-button').find((b:Control)=>b.dataset.libraryMode===mode);
  button.click();await poll(()=>p.japanese.some(a=>!a.paused));
  const suffix=mode==='global'?'activeRecallSession.v1':'sequentialCategoryOrderedActiveRecallSession.v1';
  const session=JSON.parse(p.saved['etcl.app.v1.library68.'+suffix]);assert.equal(session.queue.length,68);
  assert.equal(new Set(session.queue.map((e:any)=>e.lessonId+':'+e.phraseIndex)).size,68);
  if(mode!=='global')assert.deepEqual(session.queue,lessons.flatMap((l:any)=>l.phrases.map((_:any,i:number)=>({lessonId:l.id,phraseIndex:i}))));
  button.click();await flush();
 }
 assert(Object.keys(p.saved).every(k=>!k.startsWith('etcl.app.v1.lesson.')));
});

test('actual Weak control writes only ETCL state and requests three English repetitions',async()=>{
 const p=await page();p.app.querySelectorAll('.weak-button')[0].click();
 assert.deepEqual(JSON.parse(p.saved['etcl.app.v1.weakPhrases.v1']),[lessons[0].id+':0']);
 const button=p.app.querySelectorAll('.active-recall-button')[2];button.click();await poll(()=>p.japanese.length>0);
 p.japanese[0].emit('ended');await poll(()=>p.audio.plays===1);
 completeEnglish(p);await poll(()=>p.audio.plays===2);
 completeEnglish(p);await poll(()=>p.audio.plays===3);
 button.click();await flush();
 for(const[k,v]of Object.entries(p.sentinels))assert.equal(p.saved[k],v);
});
test('actual app reload shows saved progress and resumes the same phrase without resetting storage',async()=>{
 const p=await page(),button=p.app.querySelectorAll('.active-recall-button')[2];
 button.click();await poll(()=>p.japanese.length>0);p.japanese[0].emit('ended');await poll(()=>p.audio.plays===1);
 completeEnglish(p);await poll(()=>p.audio.plays===2);
 completeEnglish(p);await poll(()=>p.japanese[0].src.endsWith('japanese-cues-v2/phrase-002.mp3'));button.click();await flush();
 const key='etcl.app.v1.lesson.'+lessons[0].id+'.sequentialCategoryOrderedActiveRecallSession.v1';
 assert.equal(JSON.parse(p.saved[key]).currentIndex,1);
 const reloaded=await page(p.saved);assert.equal(reloaded.writes.length,0);assert(reloaded.progress.textContent.includes('保存位置 2 / 5'));
 const resume=reloaded.app.querySelectorAll('.active-recall-button')[2];resume.click();await poll(()=>reloaded.japanese.length>0);
 assert(reloaded.japanese[0].src.endsWith('japanese-cues-v2/phrase-002.mp3'));resume.click();await flush();
});

test('English is activated in the user gesture before the asynchronous Cue chain',async()=>{
 const p=await page({}, {requireGesture:true}),b=p.app.querySelectorAll('.active-recall-button')[2];
 b.click();await poll(()=>p.japanese.length>0);
 assert(p.audio.unlocked);assert.equal(p.audio.muted,false);
 p.japanese[0].emit('ended');await poll(()=>p.audio.plays===1);
 assert(p.status.textContent.endsWith('Answer'));b.click();await flush();
});

test('play rejection is visible and does not skip silently to another Cue',async()=>{
 const p=await page(),b=p.app.querySelectorAll('.active-recall-button')[2];
 b.click();await poll(()=>p.japanese.length>0);p.audio.rejectPlay=true;p.japanese[0].emit('ended');
 await poll(()=>p.status.textContent.includes('Active Recall failed'));
 assert(p.status.textContent.includes('NotAllowedError'));
 assert.equal(p.japanese[0].plays,1);assert(p.audio.paused);
});

test('stale timeupdate cannot finish English before play has started',async()=>{
 const p=await page(),b=p.app.querySelectorAll('.active-recall-button')[2];
 b.click();await poll(()=>p.japanese.length>0);p.audio.deferPlay=true;p.japanese[0].emit('ended');
 await poll(()=>p.audio.pendingResolve!==null);
 p.audio.currentTime=9999;p.audio.emit('timeupdate');await flush();
 assert.equal(p.audio.plays,1);assert.equal(p.japanese[0].plays,1);
 p.audio.pendingResolve!();await flush();p.audio.emit('timeupdate');
 await poll(()=>p.audio.plays===2);b.click();await flush();
});

test('metadata media error is reported and Stop cancels a pending metadata wait',async()=>{
 for(const fail of [true,false]){
  const p=await page(),b=p.app.querySelectorAll('.active-recall-button')[2];
  b.click();await poll(()=>p.japanese.length>0);p.audio.duration=NaN;p.audio.readyState=0;p.japanese[0].emit('ended');
  await poll(()=>(p.audio.handlers.get('loadedmetadata')??[]).length>1);
  if(fail){p.audio.emit('error');await poll(()=>p.status.textContent.includes('metadata failed'));}
  else {b.click();await flush();assert.equal(p.status.textContent,'Training stopped');}
  assert.equal((p.audio.handlers.get('loadedmetadata')??[]).length,1);
 }
});

test('every Lesson and both 68-item modes play all English repetitions and enter Round 2',async()=>{
 for(const mode of [...Array.from({length:12},(_,i)=>i),'global','sequential-category-order']){
  const p=await page();
  if(typeof mode==='number'){p.app.querySelectorAll('.lesson-button')[mode].click();await flush();}
  const b=typeof mode==='number'?p.app.querySelectorAll('.active-recall-button')[2]:
   p.app.querySelectorAll('.etcl-library-button').find((x:Control)=>x.dataset.libraryMode===mode);
  b.click();await poll(()=>p.japanese.length>0);
  const count=typeof mode==='number'?lessons[mode].phrases.length:68;
  for(let index=0;index<count;index++){
   await poll(()=>p.japanese[0].plays===index+1);
   p.japanese[0].emit('ended');
   for(let repeat=0;repeat<2;repeat++){
    await poll(()=>p.audio.plays===index*2+repeat+1);
    // Model playback reaching the boundary, rather than resolving play() as completion.
    completeEnglish(p);
   }
  }
  await poll(()=>p.japanese[0].plays===count+1);
  assert(p.status.textContent.includes('Round 2'));assert.equal(p.audio.plays,count*2);
  assert(!p.writes.some(k=>!k.startsWith('etcl.app.v1.')));
  b.click();await flush();
 }
});

test('English Pause/Resume holds the phrase and Stop prevents pending play from advancing',async()=>{
 const p=await page(),b=p.app.querySelectorAll('.active-recall-button')[2];
 b.click();await poll(()=>p.japanese.length>0);p.japanese[0].emit('ended');await poll(()=>p.audio.plays===1);
 p.mediaHandlers.pause();assert(p.audio.paused);
 completeEnglish(p);await flush();assert.equal(p.audio.plays,1);
 p.mediaHandlers.play();await poll(()=>p.audio.plays===2);
 p.audio.emit('timeupdate');await poll(()=>p.audio.plays===3);
 b.click();p.mediaHandlers.play();await flush();assert.equal(p.audio.plays,3);
 assert.equal(p.status.textContent,'Training stopped');
});

test('premature English ended and decoder errors remain visible without next Cue',async()=>{
 for(const event of ['ended','error']){
  const p=await page(),b=p.app.querySelectorAll('.active-recall-button')[2];
  b.click();await poll(()=>p.japanese.length>0);p.japanese[0].emit('ended');await poll(()=>p.audio.plays===1);
  p.audio.emit(event);await poll(()=>p.status.textContent.includes('Active Recall failed'));
  assert.equal(p.japanese[0].plays,1);assert(p.audio.paused);
 }
});

test('source-switch abort waits for new metadata and does not falsely stop Recall',async()=>{
 const p=await page(),b=p.app.querySelectorAll('.active-recall-button')[2];
 b.click();await poll(()=>p.japanese.length>0);p.audio.readyState=0;p.audio.duration=NaN;p.japanese[0].emit('ended');
 await poll(()=>(p.audio.handlers.get('loadedmetadata')??[]).length>1);
 p.audio.emit('abort');await flush();assert(!p.status.textContent.includes('failed'));
 p.audio.readyState=1;p.audio.duration=100;p.audio.emit('loadedmetadata');
 await poll(()=>p.audio.plays===1);b.click();await flush();
});
