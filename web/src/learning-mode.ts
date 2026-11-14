export type LearningMode = 'existing' | 'etcl';
type Lesson = {id:string;domain:string;phrases:Array<unknown>};
const representative='etcl-01-talking-about-my-job';
export function learningModeFor(lesson:Pick<Lesson,'id'|'domain'>):LearningMode {
  return lesson.domain==='etcl'?'etcl':'existing';
}
export function lessonsForMode<T extends Lesson>(lessons:readonly T[],mode:LearningMode):T[]{
  return lessons.filter(l=>mode==='etcl'?l.domain==='etcl':l.domain==='delivery'||l.domain==='everyday');
}
export function selectModeLesson<T extends Lesson>(lessons:readonly T[],mode:LearningMode,savedId:string|null):T {
  const group=lessonsForMode(lessons,mode);
  const selected=group.find(l=>l.id===savedId)??group[0];
  if(!selected)throw new Error('No lesson available for selected learning mode');
  return selected;
}
export function countModeWeak(lessons:readonly Lesson[],weak:ReadonlySet<string>):number {
  return lessons.reduce((sum,l)=>sum+l.phrases.filter((_,i)=>weak.has(l.id+':'+i)).length,0);
}
export function sessionProgress(raw:string|null,total:number):string {
  if(!raw)return '未開始';
  try{
    const session=JSON.parse(raw);
    if(session.version!==1||!Array.isArray(session.queue)||session.queue.length!==total
      ||!Number.isInteger(session.currentIndex)||session.currentIndex<0||session.currentIndex>=total)return '保存データを保持（未確認）';
    return '保存位置 '+(session.currentIndex+1)+' / '+total;
  }catch{return '保存データを保持（未確認）';}
}
