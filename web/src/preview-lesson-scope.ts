import {learningModeFor,lessonsForMode} from './learning-mode.js';
import type { ActiveRecallQueueMode } from './active-recall.js';
type Lesson = { id: string; domain: string; phrases: Array<unknown> };
export function previewRecallLessons<T extends Lesson>(
  selected: T, legacy: T[], ordered: T[], mode: ActiveRecallQueueMode,
): T[] {
  // Scope only the approved representative lesson; preserve legacy mode selection.
  if (learningModeFor(selected)==='etcl') return lessonsForMode([selected],'etcl');
  const group=mode==='global'?legacy:ordered;
  if(group.some(l=>l.domain!=='delivery'&&l.domain!=='everyday'))throw new Error('Mixed Existing Recall library');
  return group;
}
