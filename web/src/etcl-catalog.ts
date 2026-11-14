import sourceLessons from './etcl-lessons-v2.json';
import {type Explanation} from './etcl-lesson1.js';
export const etclLessonIds:readonly string[]=sourceLessons.map(l=>l.id);
type Lesson={id:string;phrases:Array<{en:string;ja:string}>};
export function validateEtclCatalog(lessons:readonly Lesson[],notes:Explanation[]):Map<string,Map<number,Explanation>> {
 if(lessons.length!==12||lessons.reduce((n,l)=>n+l.phrases.length,0)!==68||notes.length!==68)throw new Error('Expected 12 ETCL lessons / 68 explanations');
 if(new Set(lessons.map(l=>l.id)).size!==12||lessons.some((l,i)=>l.id!==etclLessonIds[i]))throw new Error('ETCL lesson identity/order mismatch');
 const result=new Map<string,Map<number,Explanation>>(),ids=new Set<string>();
 for(const lesson of lessons){
  const entries=notes.filter(n=>n.lessonId===lesson.id),map=new Map<number,Explanation>();
  if(entries.length!==lesson.phrases.length)throw new Error('Missing explanation');
  for(const note of entries){
   const p=lesson.phrases[note.phraseIndex];
   if(!Number.isInteger(note.phraseIndex)||!p||map.has(note.phraseIndex)||ids.has(note.phraseId)
     ||!note.phraseId||note.en!==p.en||note.ja!==p.ja||!note.grammar||!note.chunks)throw new Error('Explanation mapping mismatch');
   ids.add(note.phraseId);map.set(note.phraseIndex,note);
  }
  result.set(lesson.id,map);
 }
 return result;
}
