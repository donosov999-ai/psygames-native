/* psygames-rhythm-pitch-i18n · VER 1 · 19.08.2026 */
/**
 * Словарь модуля, привезён из лаборатории как есть. При приёмке добавлены ЧЕТЫРЕ
 * строки, которых там не было, — их показывает экран приложения, а не партия:
 * `catalogDesc`, `soundOffNotice`, `enableSound`, `calmNotice`.
 *
 * ⚠️ ПОЧЕМУ ОНИ ЗДЕСЬ, А НЕ В ОБЩЕМ СЛОВАРЕ. Общий словарь (`LanguageContext`)
 * правится один раз на все семь приёмок сразу, иначе заходы затирают друг друга.
 * А ключ, которого в словаре ещё нет, `t()` возвращает КАК ЕСТЬ — человек увидел
 * бы на экране «rhythmPitchSoundOff». Пока ключи не заведены (точные строки — в
 * INTEGRATION.md), экран берёт текст отсюда: ru и en, как и вся остальная игра.
 */
import type {
  PitchDirection,
  PitchLevel,
  RhythmPitchLocale,
  RhythmPitchMode,
} from './types';

export interface RhythmPitchStrings {
  title: string;
  skill: string;
  /** Описание игры на экране настроек — до ключа словаря `rhythmPitchDesc`. */
  catalogDesc: string;
  /** Звук выключен тумблером приложения: игра звуковая, играть нечем. */
  soundOffNotice: string;
  /** Подпись кнопки, которая включает звук обратно. */
  enableSound: string;
  /** Спокойный шаг зарядки: звук приглушён нарочно, игра дневная. */
  calmNotice: string;
  rulesTitle: string;
  rulesBody: string;
  rhythmRule: string;
  pitchRule: string;
  privacy: string;
  start: string;
  calibrationTitle: string;
  calibrationBody: string;
  volume: string;
  quieter: string;
  louder: string;
  playCalibration: string;
  calibrationPlaying: string;
  calibrationTap: string;
  calibrationReady: string;
  calibrationNeedTaps: string;
  offset: string;
  continue: string;
  readyTitle: string;
  readyBodyRhythm: string;
  readyBodyPitch: string;
  play: string;
  listening: string;
  noVisualAnswer: string;
  rhythmPrompt: string;
  rhythmTap: string;
  tapsProgress: string;
  submit: string;
  pitchDirectionPrompt: string;
  pitchSequencePrompt: string;
  sequenceProgress: string;
  undo: string;
  replay: string;
  replayTutorialOnly: string;
  pause: string;
  resume: string;
  restart: string;
  exit: string;
  unavailableTitle: string;
  unavailableBody: string;
  retry: string;
  resultTitle: string;
  playAgain: string;
  noAutoAdvance: string;
  accuracy: string;
  timingAccuracy: string;
  meanTimingError: string;
  missingTaps: string;
  extraTaps: string;
  pitchAccuracy: string;
  duration: string;
  seed: string;
  keyboardHelp: string;
}

const STRINGS: Record<RhythmPitchLocale, RhythmPitchStrings> = {
  ru: {
    title: 'Ритм и высота',
    skill: 'Невербальный слух, временной порядок и рабочая память',
    catalogDesc: 'Повторяйте ритмы и запоминайте последовательности высот — на слух, без микрофона',
    soundOffNotice: 'Звук выключен в настройках, а этот тренажёр — звуковой: задание можно только услышать. Включите звук — и начнём.',
    enableSound: 'Включить звук',
    calmNotice: 'Сейчас спокойный шаг зарядки — звук приглушён нарочно, перед сном он ни к чему. «Ритм и высота» без звука не тренируется: вернитесь к ней днём.',
    rulesTitle: 'Слушайте — затем отвечайте',
    rulesBody: 'Звук создаётся локально. Во время прослушивания экран не показывает правильный ритм или высоту заранее.',
    rhythmRule: 'Ритм: повторите услышанные удары в том же времени.',
    pitchRule: 'Высота: определите выше/ниже или повторите путь Низко–Средне–Высоко.',
    privacy: 'Микрофон не используется. Сетевой TTS и загрузка звуков не нужны.',
    start: 'Начать',
    calibrationTitle: 'Проверка громкости и задержки',
    calibrationBody: 'Запустите четыре сигнала и нажимайте «Тап» вместе с ними. Громкость можно настроить до запуска.',
    volume: 'Громкость {value}%',
    quieter: 'Тише',
    louder: 'Громче',
    playCalibration: 'Запустить калибровку',
    calibrationPlaying: 'Слушайте и нажимайте вместе с сигналом',
    calibrationTap: 'Тап вместе с сигналом',
    calibrationReady: 'Калибровка готова: {samples} замеров',
    calibrationNeedTaps: 'Нужно хотя бы два тапа вместе с сигналами. Запустите калибровку ещё раз.',
    offset: 'Поправка задержки: {value} мс',
    continue: 'Продолжить',
    readyTitle: 'Готовы слушать?',
    readyBodyRhythm: 'После воспроизведения сразу повторите ритм кнопкой «Тап».',
    readyBodyPitch: 'После воспроизведения выберите направление или последовательность высот.',
    play: 'Воспроизвести задание',
    listening: 'Слушайте…',
    noVisualAnswer: 'Правильный звук не показывается на экране заранее.',
    rhythmPrompt: 'Повторите услышанный ритм',
    rhythmTap: 'Тап',
    tapsProgress: 'Тапов: {current}; в образце: {total}',
    submit: 'Завершить ответ',
    pitchDirectionPrompt: 'Второй звук был выше или ниже?',
    pitchSequencePrompt: 'Повторите путь высот',
    sequenceProgress: 'Выбрано {current} из {total}',
    undo: 'Отменить последний',
    replay: 'Повторить звук',
    replayTutorialOnly: 'Повтор доступен в обучающих уровнях.',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    exit: 'Выйти',
    unavailableTitle: 'Аудиовыход недоступен',
    unavailableBody: 'Игра не может воспроизвести локальный звук на этом устройстве. Микрофон для продолжения не требуется.',
    retry: 'Проверить аудио снова',
    resultTitle: 'Раунд завершён',
    playAgain: 'Повторить тот же раунд',
    noAutoAdvance: 'Следующий уровень не запускается автоматически.',
    accuracy: 'Точность',
    timingAccuracy: 'Точность времени',
    meanTimingError: 'Средняя ошибка',
    missingTaps: 'Пропущено',
    extraTaps: 'Лишние тапы',
    pitchAccuracy: 'Точность высоты',
    duration: 'Время',
    seed: 'Seed',
    keyboardHelp: 'Пробел/T — ритм; 1/2/3 — Низко/Средне/Высоко; ↑/↓ — выше/ниже; P — пауза, R — перезапуск.',
  },
  en: {
    title: 'Rhythm & Pitch',
    skill: 'Nonverbal hearing, temporal order, and working memory',
    catalogDesc: 'Echo rhythms and remember pitch sequences — by ear, no microphone',
    soundOffNotice: 'Sound is off in settings, and this trainer is all about sound: the task can only be heard. Turn sound on and we start.',
    enableSound: 'Turn sound on',
    calmNotice: 'This is a calm warm-up step — sound is muted on purpose, it has no place before sleep. Rhythm & Pitch does not work without sound: come back to it during the day.',
    rulesTitle: 'Listen, then respond',
    rulesBody: 'Sound is generated locally. During playback, the screen never previews the correct rhythm or pitch.',
    rhythmRule: 'Rhythm: repeat the heard beats at the same timing.',
    pitchRule: 'Pitch: choose higher/lower or reproduce a Low–Mid–High path.',
    privacy: 'No microphone is used. Network TTS and downloaded sounds are unnecessary.',
    start: 'Start',
    calibrationTitle: 'Volume and latency check',
    calibrationBody: 'Play four pulses and press Tap with each one. Adjust volume before playback.',
    volume: 'Volume {value}%',
    quieter: 'Quieter',
    louder: 'Louder',
    playCalibration: 'Start calibration',
    calibrationPlaying: 'Listen and tap with each pulse',
    calibrationTap: 'Tap with pulse',
    calibrationReady: 'Calibration ready: {samples} samples',
    calibrationNeedTaps: 'At least two taps with the pulses are needed. Run calibration again.',
    offset: 'Latency offset: {value} ms',
    continue: 'Continue',
    readyTitle: 'Ready to listen?',
    readyBodyRhythm: 'After playback, immediately echo the rhythm with Tap.',
    readyBodyPitch: 'After playback, choose the direction or pitch-level sequence.',
    play: 'Play task',
    listening: 'Listen…',
    noVisualAnswer: 'The correct sound is not previewed visually.',
    rhythmPrompt: 'Echo the rhythm you heard',
    rhythmTap: 'Tap',
    tapsProgress: 'Taps: {current}; sample: {total}',
    submit: 'Finish response',
    pitchDirectionPrompt: 'Was the second sound higher or lower?',
    pitchSequencePrompt: 'Repeat the pitch path',
    sequenceProgress: 'Selected {current} of {total}',
    undo: 'Undo last',
    replay: 'Replay sound',
    replayTutorialOnly: 'Replay is available in tutorial levels.',
    pause: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    exit: 'Exit',
    unavailableTitle: 'Audio output unavailable',
    unavailableBody: 'This device cannot play the local task sound. A microphone is not required to continue.',
    retry: 'Check audio again',
    resultTitle: 'Round complete',
    playAgain: 'Repeat the same round',
    noAutoAdvance: 'The next level does not start automatically.',
    accuracy: 'Accuracy',
    timingAccuracy: 'Timing accuracy',
    meanTimingError: 'Mean error',
    missingTaps: 'Missing',
    extraTaps: 'Extra taps',
    pitchAccuracy: 'Pitch accuracy',
    duration: 'Time',
    seed: 'Seed',
    keyboardHelp: 'Space/T taps rhythm; 1/2/3 chooses Low/Mid/High; ↑/↓ chooses higher/lower; P pauses; R restarts.',
  },
};

const MODE_LABELS: Record<RhythmPitchLocale, Record<RhythmPitchMode, string>> = {
  ru: { 'rhythm-echo': 'Эхо ритма', 'pitch-path': 'Путь высоты' },
  en: { 'rhythm-echo': 'Rhythm Echo', 'pitch-path': 'Pitch Path' },
};

const PITCH_LEVEL_LABELS: Record<RhythmPitchLocale, Record<PitchLevel, string>> = {
  ru: { low: 'Низко', mid: 'Средне', high: 'Высоко' },
  en: { low: 'Low', mid: 'Mid', high: 'High' },
};

const PITCH_DIRECTION_LABELS: Record<RhythmPitchLocale, Record<PitchDirection, string>> = {
  ru: { higher: 'Выше', lower: 'Ниже' },
  en: { higher: 'Higher', lower: 'Lower' },
};

export function getRhythmPitchStrings(locale: RhythmPitchLocale): RhythmPitchStrings {
  return STRINGS[locale];
}

export function getRhythmPitchModeLabel(locale: RhythmPitchLocale, mode: RhythmPitchMode): string {
  return MODE_LABELS[locale][mode];
}

export function getPitchLevelLabel(locale: RhythmPitchLocale, level: PitchLevel): string {
  return PITCH_LEVEL_LABELS[locale][level];
}

export function getPitchDirectionLabel(locale: RhythmPitchLocale, direction: PitchDirection): string {
  return PITCH_DIRECTION_LABELS[locale][direction];
}

export function interpolateRhythmPitch(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
