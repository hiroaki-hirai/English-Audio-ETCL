import './style.css';
import { createAudioTransitionDiagnostic } from './audio-transition-diagnostic.js';
import { createSpeechDiagnostic } from './speech-diagnostic.js';
import { createJapaneseCueTestSessionStore, japaneseCueTestPhraseCount } from './japanese-cue-test-session.js';
import {
  createJapaneseMp3Player,
  getJapaneseCueMode,
  playJapaneseCue,
} from './japanese-cue.js';

import {
  createNextActiveRecallRound,
  createActiveRecallSessionStore,
  prepareActiveRecallSession,
  prepareActiveRecallRoundState,
  type ActiveRecallQueueMode,
  type ActiveRecallRoundState,
} from './active-recall.js';
import {
  createIdlePlaybackContext,
  dispatchMediaSessionAction,
  type AudioPlayOwner,
  type TrainingRuntimeKind,
} from './media-session.js';
import { selectLegacyActiveRecallLessons, orderLegacyActiveRecallLessons } from './legacy-active-recall-library.js';
import lessonsData from './etcl-lessons-v2.json';
import {learningModeFor,lessonsForMode,selectModeLesson,countModeWeak,sessionProgress,type LearningMode} from './learning-mode.js';
import {EtclRecallTransport} from './etcl-recall-transport.js';
import explanationData from './etcl-explanations-v2.json';
import etclCatalog from './etcl-lessons-v2.json';
import {validateEtclCatalog} from './etcl-catalog.js';
import {createEtclRecallPlan,assertEtclPlayable} from './etcl-recall-plan.js';
import {etclLessonId, escapeHtml, validateExplanations, renderExplanation} from './etcl-lesson1.js';
import {appStorageKey} from './app-storage.js';
import { previewRecallLessons } from './preview-lesson-scope.js';
import diagnosticFixture from './diagnostic-cues.json';
import { createTwentyCueSessionStore } from './twenty-cue-diagnostic.js';
import { lessonMediaPath } from './diagnostic-fixture.js';

type TrainingPhrase = {
  en: string;
  ja: string;
};

type TrainingScript = {
  id: string;
  domain: 'delivery' | 'everyday' | 'etcl';
  scenario: string;
  scenarioJa: string;
  phrases: TrainingPhrase[];
};

type PhraseMetadata = {
  index: number;
  end?: number;
  start: number;
};

type LessonMetadata = {
  phrases: PhraseMetadata[];
};

type PhraseSegment = {
  start: number;
  end: number;
};

const lessons = lessonsData as TrainingScript[];
const etclExplanations = validateEtclCatalog(etclCatalog, explanationData);
const legacyActiveRecallLessons = selectLegacyActiveRecallLessons(lessons);
const lessonsByDomain = orderLegacyActiveRecallLessons(legacyActiveRecallLessons);
const activeRecallPhraseCount = lessons.reduce(
  (total, lesson) => total + lesson.phrases.length,
  0,
);

const weakPhrasesStorageKey = 'etcl.app.v1.weakPhrases.v1';
const selectedLessonStorageKey = 'etcl.app.v1.selectedLesson.v1';
const activeRecallSessionStorageKey = 'etcl.app.v1.activeRecallSession.v1';
const sequentialActiveRecallSessionStorageKey =
  'etcl.app.v1.sequentialCategoryActiveRecallSession.v1';
const orderedActiveRecallSessionStorageKey =
  'etcl.app.v1.sequentialCategoryOrderedActiveRecallSession.v1';
const activeRecallRoundStorageKey = 'etcl.app.v1.activeRecallDiagnosticRound.v1';
const sequentialActiveRecallRoundStorageKey =
  'etcl.app.v1.sequentialCategoryActiveRecallDiagnosticRound.v1';
const orderedActiveRecallRoundStorageKey =
  'etcl.app.v1.sequentialCategoryOrderedActiveRecallDiagnosticRound.v1';

const activeRecallSessionStores: Record<
  ActiveRecallQueueMode,
  ReturnType<typeof createActiveRecallSessionStore>
> = {
  global: createActiveRecallSessionStore(
    () => window.localStorage,
    activeRecallSessionStorageKey,
  ),
  'sequential-category': createActiveRecallSessionStore(
    () => window.localStorage,
    sequentialActiveRecallSessionStorageKey,
  ),
  'sequential-category-order': createActiveRecallSessionStore(
    () => window.localStorage,
    orderedActiveRecallSessionStorageKey,
  ),
};

const etclActiveRecallSessionStores = {
  global:createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(activeRecallSessionStorageKey,etclLessonId)),
  'sequential-category':createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(sequentialActiveRecallSessionStorageKey,etclLessonId)),
  'sequential-category-order':createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(orderedActiveRecallSessionStorageKey,etclLessonId)),
};
const etclLessonSessionStores=new Map([[etclLessonId,etclActiveRecallSessionStores]]);
function getEtclLessonSessionStores(lessonId:string){
  const existing=etclLessonSessionStores.get(lessonId);if(existing)return existing;
  const stores={
    global:createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(activeRecallSessionStorageKey,lessonId)),
    'sequential-category':createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(sequentialActiveRecallSessionStorageKey,lessonId)),
    'sequential-category-order':createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(orderedActiveRecallSessionStorageKey,lessonId)),
  };
  etclLessonSessionStores.set(lessonId,stores);return stores;
}
const etclLibrarySessionStores = {
 global:createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(activeRecallSessionStorageKey,etclLessonId,'all')),
 'sequential-category':createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(sequentialActiveRecallSessionStorageKey,etclLessonId,'all')),
 'sequential-category-order':createActiveRecallSessionStore(()=>window.localStorage,appStorageKey(orderedActiveRecallSessionStorageKey,etclLessonId,'all')),
};
function getActiveRecallRoundStorageKey(mode: ActiveRecallQueueMode, lessonId: string, scope:'lesson'|'all'='lesson'): string {
  if (mode === 'sequential-category-order') {
    return appStorageKey(orderedActiveRecallRoundStorageKey, lessonId, scope);
  }

  return appStorageKey(mode === 'sequential-category' ? sequentialActiveRecallRoundStorageKey : activeRecallRoundStorageKey, lessonId, scope);
}

function loadActiveRecallRoundState(mode: ActiveRecallQueueMode, lessonId: string, scope:'lesson'|'all'='lesson'): string | null {
  try {
    return localStorage.getItem(getActiveRecallRoundStorageKey(mode, lessonId, scope));
  } catch {
    return null;
  }
}

function saveActiveRecallRoundState(
  roundState: ActiveRecallRoundState,
  mode: ActiveRecallQueueMode,
  lessonId: string,
  scope:'lesson'|'all'='lesson',
): void {
  try {
    localStorage.setItem(
      getActiveRecallRoundStorageKey(mode, lessonId, scope),
      JSON.stringify(roundState),
    );
  } catch {
    // Round persistence is temporary diagnostic state only.
  }
}

function loadSelectedLesson(): TrainingScript | undefined {
  let selectedLessonId: string|null=null;
  try { selectedLessonId=localStorage.getItem(appStorageKey(selectedLessonStorageKey, etclLessonId)); } catch { /* Storage may be unavailable. */ }

  return lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons.find((lesson) => lesson.id === 'etcl-01-talking-about-my-job') ?? lessons[0];
}

function getWeakPhraseKey(lessonId: string, phraseIndex: number): string {
  return `${lessonId}:${phraseIndex}`;
}

function loadWeakPhrases(lessonId: string): Set<string> {
  let storedValue: string|null=null;
  try { storedValue=localStorage.getItem(appStorageKey(weakPhrasesStorageKey, lessonId)); } catch { return new Set(); }

  if (!storedValue) {
    return new Set();
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return new Set();
    }

    return new Set(
      parsedValue.filter((value): value is string => typeof value === 'string'),
    );
  } catch {
    return new Set();
  }
}

function saveWeakPhrases(weakPhrases: Set<string>, lessonId: string): void {
  try { localStorage.setItem(appStorageKey(weakPhrasesStorageKey, lessonId), JSON.stringify([...weakPhrases])); } catch { /* Playback remains available without storage. */ }
}

let weakPhrases = new Set<string>();

const appCandidate = document.querySelector<HTMLDivElement>('#app');

let stopCurrentTraining: (() => void) | null = null;
let renderSequence=0;
let requestedLearningMode:LearningMode|null=null;

if (!appCandidate) {
  throw new Error('App root was not found.');
}
const app=appCandidate;

async function renderLesson(selectedLesson: TrainingScript): Promise<void> {
  stopCurrentTraining?.();
  const previousPanel=app.querySelector<HTMLElement>(".learning-panel");
  if(previousPanel)previousPanel.inert=true;
  const sequence=++renderSequence;
  const learningMode=learningModeFor(selectedLesson);
  requestedLearningMode=learningMode;
  const modeLessons=lessonsForMode(lessons,learningMode);
  const modePhraseCount=modeLessons.reduce((sum,l)=>sum+l.phrases.length,0);
  const isEtclLesson = learningMode === 'etcl';
  const lessonRecallPlan=isEtclLesson?createEtclRecallPlan(lessons,selectedLesson.id,'lesson'):null;
  const libraryRecallPlan=isEtclLesson?createEtclRecallPlan(lessons,selectedLesson.id,'all'):null;
  const metadataResponse = await fetch(
    `${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/metadata.json`,
  );

  if (!metadataResponse.ok) {
    throw new Error(`Failed to load metadata for ${selectedLesson.id}.`);
  }

  const metadata = (await metadataResponse.json()) as LessonMetadata;
  if(sequence!==renderSequence)return; // Ignore stale fetches after rapid mode switches.
  weakPhrases = loadWeakPhrases(selectedLesson.id);

  const renderLessonButtons = (domain: TrainingScript['domain']): string =>
    modeLessons
      .filter((lesson) => lesson.domain === domain)
      .map(
        (lesson) => `
        <button
          class="lesson-button"
          type="button"
          data-lesson-id="${lesson.id}"
          aria-pressed="${lesson.id === selectedLesson.id}"
        >
          <strong>${lesson.scenarioJa}</strong>
          <span>${lesson.scenario}</span>
          ${lesson.domain==='etcl'?'<small class="lesson-recall-support">'+(createEtclRecallPlan(lessons,lesson.id,'lesson').canPlay?'Active Recall対応：'+lesson.phrases.length+'件':'教材閲覧可能・Active Recall未対応')+'</small>':''}
        </button>
      `,
      )
      .join('');

  const phrases = selectedLesson.phrases
    .map((phrase, index) => {
      const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, index);
      const isWeak = weakPhrases.has(weakPhraseKey);

      return `
        <li>
          <button
            class="phrase-button"
            type="button"
            data-phrase-index="${index}"
          >
            <strong>${escapeHtml(phrase.en)}</strong>
          </button>

          <span>${escapeHtml(phrase.ja)}</span>
          ${isEtclLesson ? renderExplanation(etclExplanations.get(selectedLesson.id)!.get(index)!) : ''}

          <button
            class="weak-button"
            type="button"
            data-phrase-index="${index}"
            aria-pressed="${isWeak}"
          >
            ${isWeak ? '★ Weak' : '☆ Weak'}
          </button>
        </li>
      `;
    })
    .join('');

  const player = `
    <div class="player">
      <audio
        controls
        loop
        preload="metadata"
        src="${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/lesson.mp3"
      ></audio>

      <label class="cue-mode-setting">
        <span>Japanese Cue Mode</span>
        <small id="cue-mode-help">Used for Active Recall. Training plays English only.</small>
        <select class="japanese-cue-mode" aria-describedby="cue-mode-help">
          <option value="mp3" selected>MP3 (recommended)</option>

        </select>
      </label>

      <section class="control-group training-controls" aria-labelledby="training-heading">
        <h3 id="training-heading">Training</h3>
      <button
        class="training-button"
        type="button"
      >
        Start Training
      </button>

      </section>
      <section class="control-group recall-controls" aria-labelledby="recall-heading">
        <h3 id="recall-heading">${isEtclLesson ? 'Lesson Recall（選択Lessonのみ）' : 'Existing Active Recall'}</h3>
        ${isEtclLesson ? '<p class="cue-unavailable" role="note">全12 Lessonsで正式v2音声を再生できます。Cue→5秒想起→英文2回（Weakは3回）。音声はAI生成です。</p>' : ''}
        <small>During playback, the running button becomes Stop Active Recall.</small>
        ${isEtclLesson ? '<button class="training-button etcl-pause-button" type="button" disabled>Pause ETCL Recall</button>' : ''}
      <button
        class="training-button active-recall-button"
        type="button"
        data-active-recall-mode="global"
      >
        Start Global Shuffle Active Recall
      </button>

      <button
        class="training-button active-recall-button"
        type="button"
        data-active-recall-mode="sequential-category"
      >
        Start Sequential Category Shuffle
      </button>

      <button
        class="training-button active-recall-button"
        type="button"
        data-active-recall-mode="sequential-category-order"
      >
        Start Sequential Category Order
      </button>

      </section>
      ${isEtclLesson ? '<section class="etcl-library-scopes"><h3>ETCL全体のモード（全68フレーズ）</h3><button class="training-button etcl-library-button" type="button" data-library-mode="global">ETCL Global Shuffle — 全68件</button><button class="training-button etcl-library-button" type="button" data-library-mode="sequential-category-order">ETCL Sequential Category Order — Lesson 1〜12</button><p>Lesson別の保存位置とは独立して再開します。1巡後は既存仕様どおり次Roundへ進みます。</p></section>' : ''}
      <p class="training-status" aria-live="polite">
        Training stopped
      </p>

      <details class="diagnostic-details">
        <summary>Resume / Audio transition diagnostics</summary>
      <pre class="resume-diagnostic" aria-live="polite">Resume diagnostic v2
Active Recall has not started.</pre>
      </details>
    </div>
  `;

  app.innerHTML = `
    <section class="app-shell">
      <header>
        <p class="eyebrow">English Audio · ETCL</p>
        <h1>${isEtclLesson?'ETCL Active Recall':'Existing Active Recall'}</h1>
      </header>

      <section class="learning-panel" aria-label="ETCL教材">
        <p class="mode-description">${isEtclLesson?'Expressing Thoughts &amp; Communicating Clearly':'Delivery English / Everyday English'}</p>
        <p class="mode-count"><strong class="mode-phrase-count">${modePhraseCount}</strong> フレーズ · Weak <span class="mode-weak-count">${countModeWeak(modeLessons,weakPhrases)}</span></p>
        <div class="mode-progress" aria-label="選択モードの保存済み進捗"></div>
        ${isEtclLesson ? '<p class="lesson-target">Lesson Recall対象：'+selectedLesson.phrases.length+'フレーズ · '+(lessonRecallPlan!.canPlay?'Active Recall対応':'教材閲覧可能・Active Recall未対応（v2 Cue未生成）')+'</p>' : ''}
        ${isEtclLesson?'<p class="mode-availability">12 Lessons・68フレーズすべて音声Recall対応。Lesson Recallは選択Lessonのみ、全体モードは68件です。</p>':''}
        ${!isEtclLesson?`<nav class="lesson-selector" aria-label="Delivery English lessons"><p class="lesson-label">Delivery English</p><div class="lesson-buttons">${renderLessonButtons('delivery')}</div></nav><nav class="lesson-selector" aria-label="Everyday English lessons"><p class="lesson-label">Everyday English</p><div class="lesson-buttons">${renderLessonButtons('everyday')}</div></nav>`:`<nav class="lesson-selector" aria-label="ETCL lessons"><p class="lesson-label">ETCL · 12 Lessons</p><div class="lesson-buttons">${renderLessonButtons('etcl')}</div></nav>`}

      <section class="lesson-card" aria-live="polite">
        <h2>${selectedLesson.scenario}</h2>
        <p class="scenario-ja">${selectedLesson.scenarioJa}</p>

        ${player}

        <ol class="phrases">
          ${phrases}
        </ol>
      </section>
      </section>
    </section>
  `;

  const modeProgressNode=app.querySelector<HTMLDivElement>('.mode-progress');
  const modeWeakNode=app.querySelector<HTMLSpanElement>('.mode-weak-count');
  function updateModeProgress():void {
    if(!modeProgressNode)return;
    const entries=[
      ['Global Shuffle',activeRecallSessionStorageKey],
      ['Category Shuffle',sequentialActiveRecallSessionStorageKey],
      ['Sequential Category Order',orderedActiveRecallSessionStorageKey],
    ];
    const text=entries.map(([label,key])=>{
      let raw:string|null=null;
      try{raw=localStorage.getItem(appStorageKey(key,selectedLesson.id));}catch{}
      return (isEtclLesson?'Lesson Recall · ':'')+label+': '+sessionProgress(raw,isEtclLesson?selectedLesson.phrases.length:modePhraseCount);
    }).join(' · ');
    const libraryText=isEtclLesson?entries.filter(([label])=>label!=='Category Shuffle').map(([label,key])=>{
      let raw:string|null=null;try{raw=localStorage.getItem(appStorageKey(key,selectedLesson.id,'all'));}catch{}
      return '全68件 · '+label+': '+sessionProgress(raw,68);
    }).join(' · '):'';
    const display=text+(libraryText?' · '+libraryText:'');
    if(modeProgressNode.textContent!==display)modeProgressNode.textContent=display;
  }
  updateModeProgress();
  const buttons = app.querySelectorAll<HTMLButtonElement>('.lesson-button');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const lesson = lessons.find(
        (candidate) => candidate.id === button.dataset.lessonId,
      );

      if (lesson && modeLessons.some(candidate=>candidate.id===lesson.id)) {
        stopCurrentTraining?.();
        try { localStorage.setItem(appStorageKey(selectedLessonStorageKey, lesson.id), lesson.id); } catch {}
        void renderLesson(lesson);
      }
    });
  });

  const audioCandidate = app.querySelector<HTMLAudioElement>('audio');

  if (!audioCandidate) {
    throw new Error('Audio player was not found.');
  }
  const audio=audioCandidate;

  const trainingButtonCandidate =
    app.querySelector<HTMLButtonElement>('.training-button');

  const activeRecallButtons = [
    ...app.querySelectorAll<HTMLButtonElement>('.active-recall-button'),
  ];

  const libraryRecallButtons=[...app.querySelectorAll<HTMLButtonElement>('.etcl-library-button')];
  const recallButtons=[...activeRecallButtons,...libraryRecallButtons];
  const trainingStatusCandidate =
    app.querySelector<HTMLParagraphElement>('.training-status');

  const resumeDiagnosticCandidate =
    app.querySelector<HTMLPreElement>('.resume-diagnostic');
  const japaneseCueModeSelector =
    app?.querySelector<HTMLSelectElement>('.japanese-cue-mode');

  if (
    !trainingButtonCandidate ||
    activeRecallButtons.length !== 3 ||
    !trainingStatusCandidate ||
    !resumeDiagnosticCandidate ||
    !japaneseCueModeSelector
  ) {
    throw new Error('Training controls were not found.');
  }

  const trainingButton=trainingButtonCandidate;
  const trainingStatus=trainingStatusCandidate;
  const resumeDiagnostic=resumeDiagnosticCandidate;
  japaneseCueModeSelector.disabled = isEtclLesson;
  const etclTransport = new EtclRecallTransport();
  let etclPausedMedia: "none"|"english"|"japanese" = "none";
  const etclPauseButton=app.querySelector<HTMLButtonElement>(".etcl-pause-button");
  const repeatGapMilliseconds = 0;
  const trainingSeekLeadSeconds = 0.5;
  const recallMilliseconds = 5000;
  const originalSilenceSeconds = 5;
  const lessonAudioUrl =
    `${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/lesson.mp3`;
  const continuousTrainingAudioUrl =
    `${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/continuous-training.mp3`;

  let trainingActive = false;
  let trainingRunId = 0;
  let cancelActiveSegment: (() => void) | null = null;
  let cancelPendingWait: (() => void) | null = null;
  let loopBeforeTraining = audio.loop;
  let runtimeKind: TrainingRuntimeKind = 'none';
  let runtimeQueueIndex: number | null = null;
  let audioPlayOwner: AudioPlayOwner = 'none';
  let expectedPhraseEnd: number | null = null;
  let lastAudioEvent = 'none';
  let lastPlayRequestSource = 'none';
  let lastPlayRejection = 'none';
  let lastPlayTrigger = 'none';
  let pendingPlayTrigger: string | null = null;
  let mediaSessionLastAction = 'none';
  let activeRecallStartAttemptCount = 0;
  let lastDiagnosticSecond = -1;
  let currentRound = 1;
  let lastCompletedRound = 0;
  let sessionClearedThisRound = false;
  let japaneseCueMode = getJapaneseCueMode();
  let diagnosticTestStatus = 'not-started';
  let diagnosticDisplayPhraseCount = isEtclLesson?selectedLesson.phrases.length:modePhraseCount;
  const audioTransitionDiagnostic = createAudioTransitionDiagnostic(() => ({
    time: performance.now(), visibility: document.visibilityState,
    isActive: navigator.userActivation?.isActive,
    hasBeenActive: navigator.userActivation?.hasBeenActive,
    readyState: audio.readyState, networkState: audio.networkState,
    paused: audio.paused, currentTime: audio.currentTime,
    src: audio.src, currentSrc: audio.currentSrc,
    owner: audioPlayOwner, runtimeActive: trainingActive,
    queueIndex: runtimeQueueIndex, element: audio,
    errorCode: audio.error?.code ?? null, errorMessage: audio.error?.message ?? '',
  }));
  const japaneseMp3Player = createJapaneseMp3Player(
    () => new Audio(),
    () => ({ visibility: document.visibilityState, time: performance.now() }),
    updateResumeDiagnostic,
    undefined,
    (kind) => audioTransitionDiagnostic.record(kind, 'element=japanese-mp3 (dedicated Audio)', 'Japanese MP3'),
  );
  const speechDiagnostic = createSpeechDiagnostic(() => ({
    visibility: document.visibilityState,
    time: performance.now(),
    speaking: window.speechSynthesis.speaking,
    pending: window.speechSynthesis.pending,
    paused: window.speechSynthesis.paused,
  }));
  let resumeDecisionLines = [
    'saved session: not-checked',
    'action: not-started',
  ];

  function getCurrentAudioLesson(): string {
    const match = /\/(?:lessons|diagnostics)\/([^/]+)\//.exec(audio.currentSrc || audio.src);

    return match?.[1] ?? 'unknown';
  }

  function updateResumeDiagnostic(): void {
    updateModeProgress();
    try {
      resumeDiagnostic.textContent = [
        'Resume diagnostic v2',
        ...resumeDecisionLines,
        `round: ${currentRound}`,
        `round phrase position: ${runtimeQueueIndex === null ? 'n/a' : `${runtimeQueueIndex + 1}/${diagnosticDisplayPhraseCount}`}`,
        `last completed round: ${lastCompletedRound || 'none'}`,
        `runtime active: ${trainingActive ? 'yes' : 'no'}`,
        `runtime kind: ${runtimeKind}`,
        `runtime queue index: ${runtimeQueueIndex ?? 'n/a'}`,
        `UI displayed position: ${runtimeQueueIndex === null ? 'n/a' : `${runtimeQueueIndex + 1}/${diagnosticDisplayPhraseCount}`}`,
        `audio owner: ${audioPlayOwner}`,
        `audio paused: ${audio.paused}`,
        `audio lesson: ${getCurrentAudioLesson()}`,
        `audio currentTime: ${audio.currentTime.toFixed(2)}`,
        `expected phrase end: ${expectedPhraseEnd?.toFixed(2) ?? 'n/a'}`,
        `last audio event: ${lastAudioEvent}`,
        `last play request source: ${lastPlayRequestSource}`,
        `last play rejection: ${lastPlayRejection}`,
        `last play trigger: ${lastPlayTrigger}`,
        `media session last action: ${mediaSessionLastAction}`,
        `Active Recall start attempts: ${activeRecallStartAttemptCount}`,
        `visibility state: ${document.visibilityState}`,
        `session cleared this round: ${sessionClearedThisRound ? 'yes' : 'no'}`,
        ...speechDiagnostic.lines(),
        `Japanese cue mode (last/current run): ${japaneseCueMode}`,
        `Japanese cue fresh test: ${diagnosticTestStatus}`,
        ...japaneseMp3Player.lines(),
        ...audioTransitionDiagnostic.lines(),
      ].join('\n');
    } catch {
      // Diagnostics must not affect training playback.
    }
  }

  function recordPlayRequest(source: string, trigger: string): void {
    lastPlayRequestSource = source;
    lastPlayRejection = 'none';
    lastPlayTrigger = trigger;
    pendingPlayTrigger = trigger;
    updateResumeDiagnostic();
  }

  function recordPlayRejection(error: unknown): void {
    lastPlayRejection =
      error instanceof Error ? error.name : 'unknown-error';
    pendingPlayTrigger = null;
    updateResumeDiagnostic();
  }

  document.addEventListener('visibilitychange', () => {
    audioTransitionDiagnostic.record('document visibilitychange');
    updateResumeDiagnostic();
  });

  function setMediaSessionPlaybackState(
    state: MediaSessionPlaybackState,
  ): void {
    if(sequence!==renderSequence)return;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  function clearPlaybackContext(): void {
    const idleContext = createIdlePlaybackContext();

    audioPlayOwner = idleContext.audioPlayOwner;
    expectedPhraseEnd = idleContext.expectedPhraseEnd;
    pendingPlayTrigger = idleContext.pendingPlayTrigger;
    setMediaSessionPlaybackState('none');
    audioTransitionDiagnostic.record('english owner-cleared');
  }

  function updateEtclPauseControl():void {
    if(!etclPauseButton)return;
    etclPauseButton.disabled=!(trainingActive&&runtimeKind==='active-recall');
    etclPauseButton.textContent=etclTransport.isPaused?'Resume ETCL Recall':'Pause ETCL Recall';
    etclPauseButton.setAttribute('aria-pressed',String(etclTransport.isPaused));
  }
  function pauseEtclRecall():void {
    if(!isEtclLesson||!trainingActive||runtimeKind!=='active-recall'||!etclTransport.pause())return;
    etclPausedMedia=japaneseMp3Player.pause()?'japanese':
      audioPlayOwner==='active-recall'&&expectedPhraseEnd!==null?'english':'none';
    if(etclPausedMedia==='english')audio.pause();
    setMediaSessionPlaybackState('paused');updateEtclPauseControl();
  }
  function resumeEtclRecall():void {
    if(!isEtclLesson||!trainingActive||runtimeKind!=='active-recall'||!etclTransport.isPaused)return;
    const runId = trainingRunId;
    const resumeFailed = (error: unknown): void => {
      if (!trainingActive || trainingRunId !== runId) return;
      if (etclTransport.isPaused && error instanceof Error && error.name === 'AbortError') return;
      stopTraining(error);
    };
    const media=etclPausedMedia;etclPausedMedia='none';
    if(media==='japanese')void japaneseMp3Player.resume().catch(resumeFailed);
    else if(media==='english'&&expectedPhraseEnd!==null){
      recordPlayRequest('active-recall','etcl-user-resume');
      void audio.play().catch(resumeFailed);
    }
    etclTransport.resume();setMediaSessionPlaybackState('playing');updateEtclPauseControl();
  }
  etclPauseButton?.addEventListener('click',()=>{
    if(etclTransport.isPaused)resumeEtclRecall();else pauseEtclRecall();
  });

  function getMediaSessionPolicyState() {
    return {
      runtimeActive: trainingActive,
      runtimeKind,
      audioPlayOwner,
      expectedPhraseEnd,
    };
  }

  function restoreLessonAudio(): void {
    if (audio.src === new URL(lessonAudioUrl, window.location.href).href) {
      return;
    }

    audioTransitionDiagnostic.record('english src-setting', `restore target=${lessonAudioUrl}`);
    audio.src = lessonAudioUrl;
    audioTransitionDiagnostic.record('english src-set', 'restore');
    audio.load();
    audioTransitionDiagnostic.record('english load-called', 'restore');
  }

  if ('mediaSession' in navigator) {
    if ('MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Continuous Training',
        artist: 'English Audio Generator',
        album: selectedLesson.scenario,
      });
    }

    navigator.mediaSession.setActionHandler('play', () => {
      if(sequence!==renderSequence)return; // Retired mode must not reclaim playback.
      if(isEtclLesson&&trainingActive&&runtimeKind==='active-recall'){resumeEtclRecall();return;}
      const handled = dispatchMediaSessionAction(
        getMediaSessionPolicyState(),
        'play',
        {
          play: () => {
            lastAudioEvent = 'media-session-play';
            mediaSessionLastAction = 'play';
            recordPlayRequest('media-session', 'media-session-play');
            void audio.play().catch((error: unknown) => {
              recordPlayRejection(error);
            });
          },
          pause: () => undefined,
        },
      );

      if (!handled) {
        lastAudioEvent = 'media-session-play-rejected';
        mediaSessionLastAction = 'play-rejected-no-context';
        updateResumeDiagnostic();
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      if(sequence!==renderSequence)return;
      if(isEtclLesson&&trainingActive&&runtimeKind==='active-recall'){pauseEtclRecall();return;}
      const handled = dispatchMediaSessionAction(
        getMediaSessionPolicyState(),
        'pause',
        {
          play: () => undefined,
          pause: () => {
            lastAudioEvent = 'media-session-pause';
            mediaSessionLastAction = 'pause';
            updateResumeDiagnostic();
            audio.pause();
          },
        },
      );

      if (!handled) {
        lastAudioEvent = 'media-session-pause-rejected';
        mediaSessionLastAction = 'pause-rejected-no-context';
        updateResumeDiagnostic();
      }
    });
  }

  for (const event of ['loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'ended', 'error', 'seeking', 'seeked', 'emptied']) {
    audio.addEventListener(event, () => {
      audioTransitionDiagnostic.record(`english ${event}`);
      updateResumeDiagnostic();
    });
  }

  audio.addEventListener('play', () => {
    if(isEtclLesson&&audio.paused)return; // Ignore stale native play events after explicit Stop.
    if(isEtclLesson&&trainingActive&&runtimeKind==='active-recall'&&etclTransport.isPaused&&etclPausedMedia==='english'){
      etclPausedMedia='none';etclTransport.resume();updateEtclPauseControl();
    }
    if (pendingPlayTrigger === null) {
      if (!trainingActive) {
        audioPlayOwner = 'lesson-player';
      }

      lastPlayRequestSource = 'audio-native-control';
      lastPlayTrigger = 'audio-native-control';
    }

    pendingPlayTrigger = null;
    lastAudioEvent = 'play';
    setMediaSessionPlaybackState('playing');
    updateResumeDiagnostic();
  });
  audio.addEventListener('pause', () => {
    if(isEtclLesson&&trainingActive&&runtimeKind==='active-recall'&&!etclTransport.isPaused&&audio.paused&&audioPlayOwner==='active-recall'&&expectedPhraseEnd!==null&&audio.currentTime<expectedPhraseEnd)pauseEtclRecall();
    lastAudioEvent = 'pause';
    setMediaSessionPlaybackState('paused');
    updateResumeDiagnostic();
  });
  audio.addEventListener('timeupdate', () => {
    const currentSecond = Math.floor(audio.currentTime);

    if (currentSecond !== lastDiagnosticSecond) {
      lastDiagnosticSecond = currentSecond;
      lastAudioEvent = 'timeupdate';
      updateResumeDiagnostic();
    }
  });
  audio.addEventListener('ended', () => {
    lastAudioEvent = 'ended';
    updateResumeDiagnostic();

    if (trainingActive && audio.src.endsWith('/continuous-training.mp3')) {
      stopTraining();
    }
  });

  function wait(milliseconds: number): Promise<void> {
    if(isEtclLesson&&runtimeKind==="active-recall")return etclTransport.wait(milliseconds);
    return new Promise((resolve) => {
      let settled = false;

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);

        if (cancelPendingWait === finish) {
          cancelPendingWait = null;
        }

        resolve();
      };

      const timeoutId = window.setTimeout(finish, milliseconds);
      cancelPendingWait = finish;
    });
  }

  let cancelJapaneseCue: (() => void) | null = null;

  function speakJapaneseCue(text: string, speechRequestId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const utterance = new SpeechSynthesisUtterance(text);

      utterance.lang = 'ja-JP';

      const cleanup = (): void => {
        utterance.removeEventListener('start', handleStart);
        utterance.removeEventListener('end', handleEnd);
        utterance.removeEventListener('error', handleError);

        if (cancelJapaneseCue === cancel) {
          cancelJapaneseCue = null;
        }
      };

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };

      const cancel = (): void => {
        window.speechSynthesis.cancel();
        finish();
      };

      const handleStart = (): void => {
        speechDiagnostic.record(speechRequestId, 'onstart');
        updateResumeDiagnostic();
      };

      const handleEnd = (): void => {
        speechDiagnostic.record(speechRequestId, 'onend');
        updateResumeDiagnostic();
        finish();
      };

      const handleError = (event: SpeechSynthesisErrorEvent): void => {
        speechDiagnostic.record(speechRequestId, 'onerror', event.error);
        updateResumeDiagnostic();
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error(`Japanese cue playback failed: ${event.error}`));
      };

      cancelJapaneseCue = cancel;

      utterance.addEventListener('start', handleStart);
      utterance.addEventListener('end', handleEnd);
      utterance.addEventListener('error', handleError);

      // Record immediately before invocation; this does not imply speak returned.
      speechDiagnostic.record(speechRequestId, 'speak');
      window.speechSynthesis.speak(utterance);
      updateResumeDiagnostic();
    });
  }

  let cancelMetadataWait: (() => void) | null = null;

  function playbackError(error: unknown): string {
    const detail = error && typeof error === 'object' && 'message' in error
      ? String(('name' in error ? error.name : 'Error')) + ': ' + String(error.message)
      : String(error);
    return 'Active Recall failed — ' + trainingStatus.textContent + ' — ' + detail;
  }

  // Invoke play directly from the click; retain activation on this English element.
  function prepareEnglishPlayback(): Promise<void> {
    const muted = audio.muted;
    audio.muted = true;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (cancelActiveSegment === cancel) cancelActiveSegment = null;
        audio.pause();
        audio.muted = muted;
        if (error !== undefined) reject(error); else resolve();
      };
      const cancel = (): void => finish();
      const timeout = window.setTimeout(() => finish(new Error('English audio preparation timed out.')), 20000);
      cancelActiveSegment = cancel;
      try { void audio.play().then(() => finish(), error => finish(error)); }
      catch (error) { finish(error); }
    });
  }

  function waitForAudioMetadata(): Promise<void> {
    if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error?: Error): void => {
        audio.removeEventListener('loadedmetadata', ready);
        audio.removeEventListener('durationchange', ready);
        audio.removeEventListener('error', failed);
        window.clearTimeout(timeout);
        if (cancelMetadataWait === cancel) cancelMetadataWait = null;
        if (error) reject(error); else resolve();
      };
      const ready = (): void => {
        if (audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0) finish();
      };
      const failed = (): void => finish(new Error('English metadata failed (media error ' + (audio.error?.code ?? 'unknown') + ').'));
      const cancel = (): void => finish();
      const timeout = window.setTimeout(() => finish(new Error('English metadata timed out.')), 20000);
      cancelMetadataWait = cancel;
      // load() can queue an abort for the previous source; it is not a failure
      // of the new source. Error or timeout handles actual loading failures.
      audio.addEventListener('loadedmetadata', ready);
      audio.addEventListener('durationchange', ready);
      audio.addEventListener('error', failed);
      ready();
    });
  }

  function getPhraseSegments(lessonMetadata: LessonMetadata): PhraseSegment[] {
    return lessonMetadata.phrases.map((phrase, index) => {
      if (phrase.end !== undefined) return { start: phrase.start, end: phrase.end };
      const nextPhrase = lessonMetadata.phrases[index + 1];

      const blockEnd = nextPhrase?.start ?? audio.duration;

      const interPhraseSilence =
        nextPhrase === undefined ? 0 : originalSilenceSeconds;

      const blockDuration = blockEnd - phrase.start - interPhraseSilence;

      const phraseDuration = (blockDuration - originalSilenceSeconds) / 2;

      return {
        start: phrase.start,
        end: phrase.start + phraseDuration,
      };
    });
  }

  async function loadLessonMetadata(
    lessonId: string,
  ): Promise<LessonMetadata> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}${lessonMediaPath(lessonId, 'metadata.json')}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to load metadata for ${lessonId}.`);
    }

    return (await response.json()) as LessonMetadata;
  }

  async function useLessonAudio(lessonId: string): Promise<void> {
    const audioUrl = `${import.meta.env.BASE_URL}${lessonMediaPath(lessonId, 'lesson.mp3')}`;
    const absoluteAudioUrl = new URL(audioUrl, window.location.href).href;

    audioTransitionDiagnostic.record('english src-check', `resolved target=${absoluteAudioUrl}`);
    if (audio.src !== absoluteAudioUrl) {
      audioTransitionDiagnostic.record('english src-setting', `target=${absoluteAudioUrl}`);
      audio.src = audioUrl;
      audioTransitionDiagnostic.record('english src-set');
      audio.load();
      audioTransitionDiagnostic.record('english load-called');
    } else {
      audioTransitionDiagnostic.record('english src-unchanged');
    }

    audioTransitionDiagnostic.record('english metadata-wait');
    await waitForAudioMetadata();
    audioTransitionDiagnostic.record('english metadata-ready');
  }

  function playSegment(
    segment: PhraseSegment,
    runId: number,
    owner: 'active-recall' | 'training',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let playbackStarted = false;

      const cleanup = (): void => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        audio.removeEventListener('playing', handlePlaying);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);

        if (cancelActiveSegment === cancel) {
          cancelActiveSegment = null;
        }
      };

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        audioPlayOwner = 'none';
        audioTransitionDiagnostic.record('english owner-cleared', 'segment finish');
        expectedPhraseEnd = null;
        updateResumeDiagnostic();
        resolve();
      };

      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const handlePlaying = (): void => { playbackStarted = true; };
      const handleError = (): void => fail(new Error('English playback failed (media error ' + (audio.error?.code ?? 'unknown') + ').'));
      const handleEnded = (): void => {
        if (isEtclLesson && etclTransport.isPaused) return;
        if (playbackStarted && audio.currentTime >= segment.end - 0.05) finish();
        else fail(new Error('English audio ended before the phrase completed.'));
      };

      const cancel = (): void => {
        finish();
      };

      const handleTimeUpdate = (): void => {
        if (!trainingActive || trainingRunId !== runId) {
          finish();
          return;
        }

        if(isEtclLesson&&runtimeKind==="active-recall"&&etclTransport.isPaused)return;
        if (playbackStarted && !audio.seeking && !audio.paused && audio.currentTime >= segment.end) {
          audio.pause();
          finish();
        }
      };

      if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start) {
        reject(new Error('Invalid English phrase boundaries.'));
        return;
      }
      cancelActiveSegment = cancel;
      audioPlayOwner = owner;
      audioTransitionDiagnostic.record('english owner-set', `owner=${owner}`);
      expectedPhraseEnd = segment.end;
      lastAudioEvent = 'segment-play-requested';

      audioTransitionDiagnostic.record('english seek-setting', `target=${Math.max(0, segment.start - trainingSeekLeadSeconds)}`);
      audio.currentTime = Math.max(0, segment.start - trainingSeekLeadSeconds);
      audioTransitionDiagnostic.record('english seek-set');
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('playing', handlePlaying);
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      audioTransitionDiagnostic.record('english play-request', `owner=${owner}`);
      recordPlayRequest(owner, owner);
      updateResumeDiagnostic();

      const diagnosticPlayId = audioTransitionDiagnostic.record('english play-call', `run=${runId}`, 'English');
      void audio.play().then(() => {
        playbackStarted = true;
        audioTransitionDiagnostic.record('english play-resolved', `request=${diagnosticPlayId}; run=${runId}`);
        updateResumeDiagnostic();
      }, (error: unknown) => {
        if(isEtclLesson&&etclTransport.isPaused&&error instanceof Error&&error.name==="AbortError")return;
        audioTransitionDiagnostic.record('english play-rejected', `request=${diagnosticPlayId}; run=${runId}; ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
        recordPlayRejection(error);
        lastAudioEvent =
          error instanceof Error
            ? `play-rejected:${error.name}`
            : 'play-rejected';
        updateResumeDiagnostic();

        if (settled) {
          return;
        }

        fail(error);
      });
    });
  }

  function getActiveRecallButtonLabel(mode: ActiveRecallQueueMode): string {
    if (mode === 'sequential-category-order') {
      return isEtclLesson ? 'Lesson Recall · Sequential Order' : 'Start Sequential Category Order';
    }

    return mode === 'sequential-category'
      ? isEtclLesson ? 'Lesson Recall · Category Shuffle' : 'Start Sequential Category Shuffle'
      : isEtclLesson ? 'Lesson Recall · Global Shuffle' : 'Start Global Shuffle Active Recall';
  }

  function resetActiveRecallButtons(): void {
    activeRecallButtons.forEach((button) => {
      const mode = button.dataset.activeRecallMode as ActiveRecallQueueMode;
      button.disabled = isEtclLesson && (!lessonRecallPlan!.canPlay || button.dataset.diagnosticFresh === "true");
      button.textContent = button.dataset.diagnosticTwenty === 'true'
        ? 'Start Fresh 20-Cue MP3 Diagnostic'
        : button.dataset.diagnosticFresh === 'true'
        ? 'Start Fresh 3-Cue A/B Test'
        : getActiveRecallButtonLabel(mode);
    });
    libraryRecallButtons.forEach(button=>{
      button.disabled=!libraryRecallPlan?.canPlay;
      button.textContent=button.dataset.libraryMode==='global'?'ETCL Global Shuffle — 全68件':'ETCL Sequential Category Order — Lesson 1〜12';
    });
  }

  async function runActiveRecall(
    mode: ActiveRecallQueueMode,
    activeButton: HTMLButtonElement,
    diagnosticFresh = false,
    diagnosticTwenty = false,
    scope:'lesson'|'all'='lesson',
  ): Promise<void> {
    if (isEtclLesson && diagnosticFresh) {
      trainingStatus.textContent = 'ETCLでは通常のRecallボタンを使用してください。';
      return;
    }

    if(isEtclLesson){
      try{assertEtclPlayable(scope==='all'?libraryRecallPlan!:lessonRecallPlan!);}catch(error){trainingStatus.textContent=String(error);return;}
    }
    const activeRecallLessons = diagnosticTwenty
      ? [{ ...diagnosticFixture, domain: 'delivery' as const, scenarioJa: '20-Cue診断' }]
      : isEtclLesson&&scope==='all'?libraryRecallPlan!.lessons:previewRecallLessons(selectedLesson, legacyActiveRecallLessons, lessonsByDomain, mode);
    diagnosticDisplayPhraseCount = diagnosticTwenty ? diagnosticFixture.phrases.length : activeRecallLessons.reduce((count, lesson) => count + lesson.phrases.length, 0);
    const diagnosticCueCount = diagnosticTwenty ? diagnosticFixture.phrases.length : japaneseCueTestPhraseCount;
    const activeRecallSessionStore = diagnosticTwenty
      ? createTwentyCueSessionStore()
      : diagnosticFresh
      ? createJapaneseCueTestSessionStore(activeRecallLessons)
      : (isEtclLesson ? scope==='all'?etclLibrarySessionStores:getEtclLessonSessionStores(selectedLesson.id) : activeRecallSessionStores)[mode];
    audioTransitionDiagnostic.reset();
    audioTransitionDiagnostic.record('active-recall start', `diagnosticFresh=${diagnosticFresh}`);
    japaneseCueMode = isEtclLesson ? 'mp3' : diagnosticTwenty ? 'mp3-diagnostic' : getJapaneseCueMode(japaneseCueModeSelector?.value);
    diagnosticTestStatus = diagnosticFresh ? `running (fresh, memory-only, ${diagnosticCueCount} cues)` : 'not-used (normal resume)';
    trainingActive = true;
    runtimeKind = 'active-recall';
    if(isEtclLesson){etclTransport.start();etclPausedMedia='none';updateEtclPauseControl();}
    trainingRunId += 1;

    const runId = trainingRunId;
    const storageAvailableBeforeLoad =
      activeRecallSessionStore.isAvailable();
    const storedSession = activeRecallSessionStore.load();
    let preparedSession = prepareActiveRecallSession(
      activeRecallLessons,
      storedSession,
      undefined,
      mode,
    );
    let { queue, session } = preparedSession;
    let roundState = preparedSession.resumed
      ? prepareActiveRecallRoundState(loadActiveRecallRoundState(mode, selectedLesson.id, scope))
      : prepareActiveRecallRoundState(null);

    currentRound = roundState.currentRound;
    lastCompletedRound = roundState.lastCompletedRound;
    sessionClearedThisRound = false;
    if (!diagnosticFresh) saveActiveRecallRoundState(roundState, mode, selectedLesson.id, scope);

    const initialCheckpointSaved = activeRecallSessionStore.save(session);
    const diagnosticReason =
      storageAvailableBeforeLoad && !activeRecallSessionStore.isAvailable()
        ? 'storage-read-failed'
        : preparedSession.diagnostic.reason;

    resumeDecisionLines = [
      `saved session: ${preparedSession.diagnostic.savedSession}`,
      `saved currentIndex: ${preparedSession.diagnostic.savedCurrentIndex ?? 'n/a'}`,
      `queue length: ${queue.length}`,
      `signature: ${preparedSession.diagnostic.signature}`,
      `queue validation: ${preparedSession.diagnostic.queueValidation}`,
      `action: ${preparedSession.diagnostic.action}`,
      `reason: ${diagnosticReason}`,
      `storage: ${diagnosticFresh ? 'memory-only (normal saved session untouched)' : activeRecallSessionStore.isAvailable() ? 'enabled' : 'disabled'}`,
      `checkpoint save: ${initialCheckpointSaved ? diagnosticFresh ? 'memory-only' : 'saved' : 'unavailable'}`,
    ];
    runtimeQueueIndex = session.currentIndex;
    updateResumeDiagnostic();

    loopBeforeTraining = audio.loop;
    audio.loop = false;

    trainingButton.disabled = true;
    recallButtons.forEach((button) => {
      button.disabled = button !== activeButton;
    });
    activeButton.textContent = 'Stop Active Recall';

    let failureMessage: string | null = null;
    try {
      trainingStatus.textContent = 'Preparing English audio';
      // Start preparation now, but do not await a media event before starting
      // the first Japanese cue: that would lose its original activation timing.
      const englishPreparation = prepareEnglishPlayback();
      const metadataPromisesByLessonId = new Map<
        string,
        Promise<LessonMetadata>
      >();

      const getLessonMetadata = (lessonId: string): Promise<LessonMetadata> => {
        const existingPromise = metadataPromisesByLessonId.get(lessonId);

        if (existingPromise) {
          return existingPromise;
        }

        const metadataPromise = loadLessonMetadata(lessonId);

        metadataPromisesByLessonId.set(lessonId, metadataPromise);
        return metadataPromise;
      };

      while (trainingActive && trainingRunId === runId) {
        for (
          let queueIndex = session.currentIndex;
          queueIndex < queue.length;
          queueIndex += 1
        ) {
          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          const entry = queue[queueIndex];

          if (!entry) {
            throw new Error(
              `Active Recall queue entry ${queueIndex} is missing.`,
            );
          }

          if(isEtclLesson)await etclTransport.checkpoint();
          if(!trainingActive||trainingRunId!==runId)break;
          session.currentIndex = queueIndex;
          const checkpointSaved = activeRecallSessionStore.save(session);

          runtimeQueueIndex = queueIndex;
          resumeDecisionLines[8] =
            `checkpoint save: ${checkpointSaved ? diagnosticFresh ? 'memory-only' : 'saved' : 'unavailable'}`;
          updateResumeDiagnostic();

          const statusPrefix =
            mode !== 'global'
              ? `Round ${currentRound} — Category: ${activeRecallLessons.find((lesson) => lesson.id === entry.lessonId)?.scenario ?? entry.lessonId}`
              : `Round ${currentRound}`;

          trainingStatus.textContent = `${statusPrefix} — Phrase ${queueIndex + 1} / ${queue.length} — Meaning`;

          await Promise.all([englishPreparation, playJapaneseCue(
            japaneseCueMode,
            () => {
              const speechRequestId = speechDiagnostic.request({
                phraseId: `${entry.lessonId}:${entry.phraseIndex}`,
                queueIndex,
                textLength: entry.ja.length,
              });
              updateResumeDiagnostic();
              return speakJapaneseCue(entry.ja, speechRequestId);
            },
            () => japaneseMp3Player.play({
              lessonId: entry.lessonId,
              phraseIndex: entry.phraseIndex,
              queueIndex,
              assetScope: diagnosticFresh ? 'diagnostic' : 'lesson',
            }, import.meta.env.BASE_URL),
          )]);

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          trainingStatus.textContent = `${statusPrefix} — Phrase ${queueIndex + 1} / ${queue.length} — Recall`;

          if(isEtclLesson)await etclTransport.checkpoint();
          if(!trainingActive||trainingRunId!==runId)break;
          const recallDelay = wait(recallMilliseconds);

          // Prepare English media during Recall so the Japanese cue starts first.
          const [entryMetadata] = await Promise.all([
            getLessonMetadata(entry.lessonId),
            useLessonAudio(entry.lessonId),
            recallDelay,
          ]);

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          if(isEtclLesson)await etclTransport.checkpoint();
          if(!trainingActive||trainingRunId!==runId)break;
          const segment = getPhraseSegments(entryMetadata)[entry.phraseIndex];

          if (!segment) {
            throw new Error(
              `Phrase segment was not found for ${entry.lessonId}:${entry.phraseIndex}.`,
            );
          }

          const weakPhraseKey = getWeakPhraseKey(
            entry.lessonId,
            entry.phraseIndex,
          );

          const repetitions = weakPhrases.has(weakPhraseKey) ? 3 : 2;

          for (
            let repetition = 0;
            repetition < repetitions;
            repetition += 1
          ) {
            if (!trainingActive || trainingRunId !== runId) {
              break;
            }

            if(isEtclLesson)await etclTransport.checkpoint();
            if(!trainingActive||trainingRunId!==runId)break;
            const phase =
              repetition === 0
                ? 'Answer'
                : repetition === 1
                  ? 'Repeat'
                  : 'Weak Repeat';

            trainingStatus.textContent = `${statusPrefix} — Phrase ${queueIndex + 1} / ${queue.length} — ${phase}`;

            await playSegment(segment, runId, 'active-recall');

            if (!trainingActive || trainingRunId !== runId) {
              break;
            }

            if (repetition < repetitions - 1) {
              await wait(repeatGapMilliseconds);
            }
          }

          if (diagnosticFresh && queueIndex + 1 === diagnosticCueCount) {
            if (trainingActive && trainingRunId === runId) {
              diagnosticTestStatus = `completed (${diagnosticCueCount} cues)`;
            }
            return;
          }
        }

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        if(isEtclLesson)await etclTransport.checkpoint();
        if(!trainingActive||trainingRunId!==runId)break;
        // Replace the checkpoint directly; never delete progress between rounds.

        const nextRound = createNextActiveRecallRound(
          activeRecallLessons,
          roundState,
          undefined,
          mode,
        );

        roundState = nextRound.roundState;
        preparedSession = nextRound.preparedSession;
        ({ queue, session } = preparedSession);
        currentRound = roundState.currentRound;
        lastCompletedRound = roundState.lastCompletedRound;
        if (!diagnosticFresh) saveActiveRecallRoundState(roundState, mode, selectedLesson.id, scope);

        sessionClearedThisRound = false;
        runtimeQueueIndex = session.currentIndex;
        const nextRoundCheckpointSaved =
          activeRecallSessionStore.save(session);
        resumeDecisionLines = [
          'saved session: created-after-round-completion',
          'saved currentIndex: 0',
          `queue length: ${queue.length}`,
          'signature: valid',
          'queue validation: valid',
          'action: fresh',
          'reason: normal-round-completion',
          `storage: ${activeRecallSessionStore.isAvailable() ? 'enabled' : 'disabled'}`,
          `checkpoint save: ${nextRoundCheckpointSaved ? 'saved' : 'unavailable'}`,
        ];
        updateResumeDiagnostic();
      }
    } catch (error) {
      failureMessage = playbackError(error);
      audioTransitionDiagnostic.record('active-recall failed', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      console.error('Active Recall playback failed:', error);
    } finally {
      if (trainingRunId === runId) {
        if (diagnosticFresh && diagnosticTestStatus.startsWith('running')) {
          diagnosticTestStatus = 'stopped before completion';
        }
        cancelMetadataWait?.();
        cancelPendingWait?.();
        cancelActiveSegment?.();
        trainingActive = false;
        runtimeKind = 'none';
        if(isEtclLesson){etclTransport.stop();etclPausedMedia='none';updateEtclPauseControl();}

        cancelJapaneseCue?.();
        cancelJapaneseCue = null;
        japaneseMp3Player.cancel();

        audio.pause();
        audio.loop = loopBeforeTraining;
        restoreLessonAudio();
        clearPlaybackContext();

        trainingButton.disabled = false;
        resetActiveRecallButtons();
        trainingStatus.textContent = diagnosticFresh && diagnosticTestStatus === `completed (${diagnosticCueCount} cues)`
          ? `Diagnostic test completed — ${diagnosticCueCount} cues`
          : failureMessage ?? 'Training stopped';
        updateResumeDiagnostic();
      }
    }
  }

  async function runTraining(): Promise<void> {
    diagnosticDisplayPhraseCount = isEtclLesson?selectedLesson.phrases.length:modePhraseCount;
    const hasWeakPhrases = selectedLesson.phrases.some((_, index) =>
      weakPhrases.has(getWeakPhraseKey(selectedLesson.id, index)),
    );

    if (!hasWeakPhrases) {
      trainingActive = true;
      runtimeKind = 'training';
      trainingRunId += 1;
      loopBeforeTraining = audio.loop;
      audio.loop = false;
      audio.src = continuousTrainingAudioUrl;
      audioPlayOwner = 'training';
      expectedPhraseEnd = null;
      trainingButton.textContent = 'Stop Training';
      recallButtons.forEach((button) => {
        button.disabled = true;
      });
      trainingStatus.textContent = 'Continuous Training playing';

      try {
        recordPlayRequest('training', 'training-button');
        await audio.play();
      } catch (error) {
        recordPlayRejection(error);
        console.error('Continuous Training playback failed:', error);
        stopTraining();
      }

      return;
    }

    await waitForAudioMetadata();

    trainingActive = true;
    runtimeKind = 'training';
    trainingRunId += 1;

    const runId = trainingRunId;
    const segments = getPhraseSegments(metadata);

    loopBeforeTraining = audio.loop;
    audio.loop = false;
    trainingButton.textContent = 'Stop Training';
    recallButtons.forEach((button) => {
      button.disabled = true;
    });

    try {
      for (const [index, segment] of segments.entries()) {
        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, index);

        const repetitions = weakPhrases.has(weakPhraseKey) ? 3 : 2;

        for (let repetition = 0; repetition < repetitions; repetition += 1) {
          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          const phase =
            repetition === 0
              ? 'Listen'
              : repetition === 1
                ? 'Repeat'
                : 'Weak Repeat';

          trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — ${phase}`;

          await playSegment(segment, runId, 'training');

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          if (repetition < repetitions - 1) {
            await wait(repeatGapMilliseconds);
          }
        }

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — Recall`;

        await wait(recallMilliseconds);
      }
    } catch (error) {
      console.error('Training playback failed:', error);
    } finally {
      if (trainingRunId === runId) {
        trainingActive = false;
        runtimeKind = 'none';
        audio.pause();
        audio.loop = loopBeforeTraining;
        clearPlaybackContext();
        trainingButton.textContent = 'Start Training';
        resetActiveRecallButtons();
        trainingStatus.textContent = 'Training stopped';
      }
    }
  }

  function stopTraining(error?: unknown): void {
    const failureMessage = error === undefined ? null : playbackError(error);
    cancelMetadataWait?.();
    if (diagnosticTestStatus.startsWith('running')) {
      diagnosticTestStatus = 'stopped before completion';
    }
    trainingActive = false;
    runtimeKind = 'none';
    trainingRunId += 1;
    if(isEtclLesson){etclTransport.stop();etclPausedMedia='none';updateEtclPauseControl();}

    cancelActiveSegment?.();
    cancelActiveSegment = null;

    cancelJapaneseCue?.();
    cancelJapaneseCue = null;
    japaneseMp3Player.cancel();

    cancelPendingWait?.();
    cancelPendingWait = null;

    audio.pause();
    lastAudioEvent = 'stop-training';
    audio.loop = loopBeforeTraining;
    restoreLessonAudio();
    clearPlaybackContext();

    trainingButton.disabled = false;
    trainingButton.textContent = 'Start Training';

    resetActiveRecallButtons();

    trainingStatus.textContent = failureMessage ?? 'Training stopped';
    updateResumeDiagnostic();
  }

  libraryRecallButtons.forEach(button=>{
    button.addEventListener('click',()=>{
      if(!isEtclLesson)return;
      if(trainingActive){stopTraining();return;}
      const mode=button.dataset.libraryMode;
      if(mode!=='global'&&mode!=='sequential-category-order')return;
      activeRecallStartAttemptCount+=1;updateResumeDiagnostic();
      void runActiveRecall(mode,button,false,false,'all');
    });
  });
  resetActiveRecallButtons();
  stopCurrentTraining = stopTraining;

  activeRecallButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (trainingActive) {
        stopTraining();
        return;
      }

      const mode = button.dataset.activeRecallMode;

      if (
        mode !== 'global' &&
        mode !== 'sequential-category' &&
        mode !== 'sequential-category-order'
      ) {
        return;
      }

      activeRecallStartAttemptCount += 1;
      updateResumeDiagnostic();
      void runActiveRecall(mode, button, button.dataset.diagnosticFresh === 'true', button.dataset.diagnosticTwenty === 'true');
    });
  });

  trainingButton.addEventListener('click', () => {
    if (trainingActive) {
      stopTraining();
      return;
    }

    void runTraining();
  });

  const phraseButtons =
    app.querySelectorAll<HTMLButtonElement>('.phrase-button');

  phraseButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      if (trainingActive) {
        stopTraining();
      }

      restoreLessonAudio();
      await waitForAudioMetadata();

      const phraseIndex = Number(button.dataset.phraseIndex);
      const phraseMetadata = metadata.phrases.find(
        (candidate) => candidate.index === phraseIndex,
      );

      if (!phraseMetadata) {
        return;
      }

      const seekLeadSeconds = 0.5;
      const requestedTime = Math.max(0, phraseMetadata.start - seekLeadSeconds);

      audio.currentTime = requestedTime;
      audioPlayOwner = 'phrase-tap';
      expectedPhraseEnd = null;
      lastAudioEvent = 'phrase-tap-play-requested';
      updateResumeDiagnostic();

      try {
        recordPlayRequest('phrase-tap', 'phrase-tap');
        await audio.play();
      } catch (error) {
        recordPlayRejection(error);
        console.error('Failed to play lesson audio:', error);
      }
    });
  });

  const weakButtons = app.querySelectorAll<HTMLButtonElement>('.weak-button');

  weakButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const phraseIndex = Number(button.dataset.phraseIndex);

      if (!Number.isInteger(phraseIndex)) {
        return;
      }

      const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, phraseIndex);

      const isCurrentlyWeak = weakPhrases.has(weakPhraseKey);

      if (isCurrentlyWeak) {
        weakPhrases.delete(weakPhraseKey);
      } else {
        weakPhrases.add(weakPhraseKey);
      }

      saveWeakPhrases(weakPhrases, selectedLesson.id);
      if(modeWeakNode)modeWeakNode.textContent=String(countModeWeak(modeLessons,weakPhrases));

      const isWeak = weakPhrases.has(weakPhraseKey);

      button.textContent = isWeak ? '★ Weak' : '☆ Weak';
      button.setAttribute('aria-pressed', String(isWeak));
    });
  });
}

const initialLesson = loadSelectedLesson();

if (!initialLesson) {
  throw new Error('No training lessons were found.');
}

void renderLesson(initialLesson);

if(import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js')
      .catch(error => console.warn('Offline cache unavailable:',error));
  });
}
