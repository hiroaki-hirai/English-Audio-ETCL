export type RecallTimelineEntry = {
  phrase: number;
  kind: string;
  repetition: number | null;
  start: number;
  end: number;
};
export type ConcatenatedTrack = {
  lessonId: string;
  path: string;
  duration: number;
  phraseCount: number;
  timeline: RecallTimelineEntry[];
};
type PlaybackAudio = Pick<HTMLAudioElement,
  'src' | 'currentTime' | 'loop' | 'paused' | 'play' | 'pause' | 'load' |
  'addEventListener' | 'removeEventListener' | 'error'>;
export type ConcatenatedState = 'idle' | 'starting' | 'playing' | 'paused' | 'ended' | 'error';
export type ConcatenatedSnapshot = {
  state: ConcatenatedState;
  entry: RecallTimelineEntry | null;
  currentTime: number;
  message: string;
};

// A complete Lesson is one audible play request. No timers, source changes,
// storage access, or automatic play requests occur at phrase boundaries.
export function createConcatenatedRecall(
  audio: PlaybackAudio,
  track: ConcatenatedTrack,
  baseUrl: string,
  update: (snapshot: ConcatenatedSnapshot) => void,
) {
  let ownsAudio = false;
  let generation = 0;
  let state: ConcatenatedState = 'idle';
  let message = '';
  let originalSrc = audio.src;
  let originalLoop = audio.loop;
  const emit = (): void => update({
    state, message, currentTime: audio.currentTime,
    entry: ownsAudio ? track.timeline.find(x => audio.currentTime >= x.start && audio.currentTime < x.end) ?? null : null,
  });
  const fail = (error: unknown, run: number): void => {
    if (!ownsAudio || run !== generation) return;
    if (state === 'paused' && error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return;
    state = 'error';
    message = error && typeof error === 'object' && 'message' in error
      ? String('name' in error ? error.name : 'Error') + ': ' + String(error.message)
      : String(error);
    audio.pause();
    emit();
  };
  const requestPlay = (): void => {
    const run = generation;
    try {
      void audio.play().then(() => {
        if (ownsAudio && run === generation && state === 'starting' && !audio.paused) {
          state = 'playing'; emit();
        }
      }, error => fail(error, run));
    } catch (error) { fail(error, run); }
  };
  const playing = (): void => {
    if (!ownsAudio || audio.paused) return;
    state = 'playing'; emit();
  };
  const pause = (): void => {
    if (!ownsAudio || state === 'error' || state === 'ended') return;
    state = 'paused'; emit();
  };
  const ended = (): void => {
    if (!ownsAudio) return;
    state = 'ended'; emit(); // Never loop or start another Lesson/Round.
  };
  const timeupdate = (): void => { if (ownsAudio) emit(); };
  const error = (): void => fail(new Error('連結音声の読込に失敗しました（media error ' + (audio.error?.code ?? 'unknown') + '）。'), generation);
  audio.addEventListener('playing', playing);
  audio.addEventListener('pause', pause);
  audio.addEventListener('ended', ended);
  audio.addEventListener('timeupdate', timeupdate);
  audio.addEventListener('error', error);
  return {
    get ownsAudio(): boolean { return ownsAudio; },
    start(): void {
      if (!ownsAudio) { originalSrc = audio.src; originalLoop = audio.loop; }
      generation += 1;
      ownsAudio = true;
      state = 'starting'; message = '';
      audio.pause();
      audio.loop = false;
      audio.src = baseUrl + track.path;
      audio.currentTime = 0;
      emit();
      requestPlay(); // Directly inside the user's start/restart click.
    },
    pause(): void { if (ownsAudio && state !== 'ended' && state !== 'error') audio.pause(); },
    resume(): void {
      if (!ownsAudio || state === 'error' || state === 'ended') return;
      state = 'starting'; requestPlay();
    },
    stop(): void {
      if (!ownsAudio) return;
      generation += 1;
      ownsAudio = false;
      state = 'idle'; message = '';
      audio.pause();
      audio.loop = originalLoop;
      audio.src = originalSrc;
      audio.load();
      emit();
    },
  };
}
