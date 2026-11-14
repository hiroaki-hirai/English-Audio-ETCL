import cues from './etcl-all-cue-assets.json';
type Lesson={id:string;domain:string;phrases:Array<{en:string;ja:string}>};
export type EtclRecallScope='lesson'|'all';
export function createEtclRecallPlan<T extends Lesson>(all:readonly T[],selectedId:string,scope:EtclRecallScope){
 const catalog=all.filter(l=>l.domain==='etcl');
 const group=scope==='lesson'?catalog.filter(l=>l.id===selectedId):catalog;
 if(!group.length)throw new Error('Unknown ETCL lesson');
 const missing=group.flatMap(l=>l.phrases.flatMap((p,i)=>{
  const verified=cues.lessons.find(a=>a.lessonId===l.id)?.entries.some(e=>e.phraseIndex===i&&e.en===p.en&&e.ja===p.ja)===true;
  return verified?[]:[{lessonId:l.id,phraseIndex:i}];
 }));
 return {lessons:group,phrases:group.reduce((n,l)=>n+l.phrases.length,0),missing,canPlay:missing.length===0};
}
export function assertEtclPlayable(plan:ReturnType<typeof createEtclRecallPlan>):void{
 if(!plan.canPlay)throw new Error('未生成のv2 Cue '+plan.missing.length+'件：Active Recallは開始できません。旧v1音声で代用しません。');
}
