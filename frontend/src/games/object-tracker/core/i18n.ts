/**
 * СЛОВАРЬ МОДУЛЯ «Трекер объектов» — ru/en, как пришёл из лаборатории
 * (`~/dev/psygames-game-lab`, ветка `codex/game-object-tracker`).
 *
 * ⚠️ РАСХОЖДЕНИЕ С ЛАБОРАТОРИЕЙ, НАМЕРЕННОЕ. Добавлены три ключа: `levelLine`,
 * `stepProgress`, `reducedModeBadge`. В лабораторном адаптере строка уровня была
 * зашита по-английски прямо в вёрстке (`Level 5 · 12 / 5`) — в приложении с
 * двенадцатью языками так нельзя, а гейт зашитых строк смотрит только в
 * `app/games/*`, то есть эту строку он бы не увидел и пропустил. Остальные ключи
 * — один в один с лабораторией; сверять при следующем переносе.
 */
import type { ObjectTrackerLocale } from './types';

export interface ObjectTrackerStrings {
  title: string;
  skill: string;
  rulesTitle: string;
  rulesBody: string;
  rulesSelection: string;
  reducedMotionInfo: string;
  start: string;
  beginMotion: string;
  preview: string;
  moving: string;
  selection: string;
  selectProgress: string;
  stepMotion: string;
  motionProgress: string;
  submit: string;
  pause: string;
  resume: string;
  restart: string;
  exit: string;
  resultTitle: string;
  playAgain: string;
  noAutoAdvance: string;
  accuracy: string;
  hits: string;
  misses: string;
  falseSelections: string;
  closeApproaches: string;
  duration: string;
  seed: string;
  objectLabel: string;
  targetPreviewLabel: string;
  selectedLabel: string;
  keyboardHelp: string;
  levelLine: string;
  stepProgress: string;
  reducedModeBadge: string;
}

const STRINGS: Record<ObjectTrackerLocale, ObjectTrackerStrings> = {
  ru: {
    title: 'Трекер объектов',
    skill: 'Динамическое распределённое внимание',
    rulesTitle: 'Следите, не угадывайте',
    rulesBody: 'Запомните отмеченные объекты. После запуска отметки исчезнут, а все объекты начнут двигаться одинаково.',
    rulesSelection: 'Когда движение остановится, выберите ровно столько объектов, сколько было отмечено в начале.',
    reducedMotionInfo: 'При уменьшении движения траектория проходит контролируемыми шагами — игра и оценка остаются доступными.',
    start: 'Начать раунд',
    beginMotion: 'Запомнил — запустить движение',
    preview: 'Запомните цели',
    moving: 'Следите за целями',
    selection: 'Выберите цели',
    selectProgress: 'Выбрано {selected} из {total}',
    stepMotion: 'Следующий шаг движения',
    motionProgress: 'Движение {current} из {total} с',
    submit: 'Проверить выбор',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    exit: 'Выйти',
    resultTitle: 'Раунд завершён',
    playAgain: 'Повторить тот же раунд',
    noAutoAdvance: 'Следующий уровень не запускается автоматически.',
    accuracy: 'Точность',
    hits: 'Найдено',
    misses: 'Пропущено',
    falseSelections: 'Ложные выборы',
    closeApproaches: 'Сближения',
    duration: 'Время',
    seed: 'Seed',
    objectLabel: 'Объект {index}',
    targetPreviewLabel: 'Цель {index}',
    selectedLabel: 'Объект {index}, выбран',
    keyboardHelp: 'Tab и Enter — навигация и выбор. R — начать раунд заново.',
    levelLine: 'Уровень {level} · объектов {objects} · целей {targets}',
    stepProgress: 'Шаг {current} из {total}',
    reducedModeBadge: 'Щадящий режим: движение идёт шагами по вашей кнопке',
  },
  en: {
    title: 'Object Tracker',
    skill: 'Dynamic distributed attention',
    rulesTitle: 'Track, do not guess',
    rulesBody: 'Remember the highlighted objects. Their marks disappear when identical objects start moving.',
    rulesSelection: 'After motion stops, select exactly as many objects as were highlighted at the start.',
    reducedMotionInfo: 'With reduced motion, the trajectory advances in controlled steps, keeping the game and scoring available.',
    start: 'Start round',
    beginMotion: 'Ready — start motion',
    preview: 'Remember the targets',
    moving: 'Track the targets',
    selection: 'Select the targets',
    selectProgress: 'Selected {selected} of {total}',
    stepMotion: 'Next motion step',
    motionProgress: 'Motion {current} of {total} s',
    submit: 'Check selection',
    pause: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    exit: 'Exit',
    resultTitle: 'Round complete',
    playAgain: 'Repeat the same round',
    noAutoAdvance: 'The next level does not start automatically.',
    accuracy: 'Accuracy',
    hits: 'Hits',
    misses: 'Misses',
    falseSelections: 'False selections',
    closeApproaches: 'Close approaches',
    duration: 'Time',
    seed: 'Seed',
    objectLabel: 'Object {index}',
    targetPreviewLabel: 'Target {index}',
    selectedLabel: 'Object {index}, selected',
    keyboardHelp: 'Tab and Enter navigate and select. R restarts the round.',
    levelLine: 'Level {level} · {objects} objects · {targets} targets',
    stepProgress: 'Step {current} of {total}',
    reducedModeBadge: 'Reduced motion: the round advances step by step on your button',
  },
};

export function getObjectTrackerStrings(locale: ObjectTrackerLocale): ObjectTrackerStrings {
  return STRINGS[locale];
}

export function interpolateObjectTracker(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
