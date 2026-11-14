export const etclLessonId = 'etcl-01-talking-about-my-job';
export type Explanation = {phraseId:string;lessonId:string;phraseIndex:number;en:string;ja:string;grammar:string;chunks:string};
type Lesson = {id:string;phrases:Array<{en:string;ja:string}>};
export function escapeHtml(value:string):string {
  return value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function validateExplanations(lesson:Lesson, notes:Explanation[]):Map<number,Explanation> {
  if (lesson.id !== etclLessonId || lesson.phrases.length !== 5 || notes.length !== 5) throw new Error('Invalid Lesson 1 explanation scope');
  const ids=new Set<string>(),indices=new Set<number>(),result=new Map<number,Explanation>();
  for (const note of notes) {
    const phrase=lesson.phrases[note.phraseIndex];
    if (note.lessonId!==lesson.id || !Number.isInteger(note.phraseIndex) || !phrase
      || !note.phraseId || ids.has(note.phraseId) || indices.has(note.phraseIndex)
      || note.en!==phrase.en || note.ja!==phrase.ja
      || typeof note.grammar!=='string' || !note.grammar || typeof note.chunks!=='string' || !note.chunks) throw new Error('Explanation identity/text mismatch');
    ids.add(note.phraseId);indices.add(note.phraseIndex);result.set(note.phraseIndex,note);
  }
  return result;
}
export function renderExplanation(note:Explanation):string {
  return '<details class="etcl-explanation"><summary>文法・意味の塊を表示</summary>'
    +'<div class="explanation-body"><h4>文法・構文</h4><p>'+escapeHtml(note.grammar)
    +'</p><h4>意味の塊・チャンク</h4><p>'+escapeHtml(note.chunks)+'</p></div></details>';
}
