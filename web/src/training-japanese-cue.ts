import {etclLessonIds} from './etcl-catalog.js';
import etclCues from './etcl-all-cue-assets.json';
export function trainingJapaneseCueMp3Path(lessonId: string, phraseIndex: number): string {
  if (!/^[a-z0-9-]+$/.test(lessonId) || !Number.isInteger(phraseIndex) || phraseIndex < 0) {
    throw new Error('Invalid Japanese cue identity.');
  }
  if(etclLessonIds.includes(lessonId)){
    const entry=etclCues.lessons.find(l=>l.lessonId===lessonId)?.entries.find(e=>e.phraseIndex===phraseIndex);
    if(!entry)throw new Error('Unverified ETCL cue identity');
    return entry.path;
  }
  if(lessonId.startsWith('etcl-'))throw new Error('Unknown ETCL cue identity; no v1 fallback');
  return `lessons/${lessonId}/japanese-cues/phrase-${String(phraseIndex + 1).padStart(3, '0')}.mp3`;
}
