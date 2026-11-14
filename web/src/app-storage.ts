import {etclLessonIds} from './etcl-catalog.js';
const prefix = 'etcl.app.v1.';
export function appStorageKey(key:string, lessonId:string, scope:'lesson'|'all'='lesson'):string {
  if(!key.startsWith(prefix)) throw new Error('Unexpected ETCL storage key');
  if(!etclLessonIds.includes(lessonId)) throw new Error('Unknown ETCL lesson');
  const suffix=key.slice(prefix.length);
  if(suffix==='weakPhrases.v1'||suffix==='selectedLesson.v1') return prefix+suffix;
  return prefix+(scope==='all'?'library68.':'lesson.'+lessonId+'.')+suffix;
}
