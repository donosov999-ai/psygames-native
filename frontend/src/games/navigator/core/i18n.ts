import type {
  CardinalDirection,
  HomeSector,
  NavigatorLocale,
  NavigatorMode,
  TurnInstruction,
} from './types';

export interface NavigatorStrings {
  title: string;
  /**
   * Описание игры для карточки и экрана настроек. Канон ru/en от автора модуля —
   * ровно тот текст, который уедет в общий словарь ключом `navigatorDesc`
   * (см. INTEGRATION.md §2). Держим его здесь, чтобы у слова был один источник:
   * пока ключа в словаре нет, экран берёт текст отсюда.
   */
  catalogDesc: string;
  skill: string;
  rulesTitle: string;
  rulesBody: string;
  routeRecallRule: string;
  turnSequenceRule: string;
  homeDirectionRule: string;
  progressionInfo: string;
  start: string;
  study: string;
  recall: string;
  delay: string;
  delayBody: string;
  continue: string;
  ready: string;
  pause: string;
  resume: string;
  restart: string;
  exit: string;
  resultTitle: string;
  playAgain: string;
  noAutoAdvance: string;
  routeAccuracy: string;
  extraSteps: string;
  angularError: string;
  turnAccuracy: string;
  duration: string;
  seed: string;
  grid: string;
  routeProgress: string;
  turnProgress: string;
  routePrompt: string;
  turnPrompt: string;
  homePrompt: string;
  swipeHint: string;
  mapHidden: string;
  startCell: string;
  finishCell: string;
  currentCell: string;
  routeCell: string;
  falseBranch: string;
  landmark: string;
  keyboardHelp: string;
}

const STRINGS: Record<NavigatorLocale, NavigatorStrings> = {
  ru: {
    title: 'Навигатор',
    catalogDesc: 'Запоминайте маршруты, последовательности поворотов и направление к старту.',
    skill: 'Пространственная навигация и мысленная карта',
    rulesTitle: 'Три способа держать маршрут в уме',
    rulesBody: 'Логический маршрут остаётся тем же, даже когда карта повёрнута.',
    routeRecallRule: 'Маршрут: изучите путь, затем повторите направления без линии.',
    turnSequenceRule: 'Повороты: запомните лево, прямо и право, затем воспроизведите.',
    homeDirectionRule: 'Домой: после маршрута укажите направление к стартовой клетке.',
    progressionInfo: 'После обучения появляются ориентиры, ложные ветви, поворот, скрытая карта и пауза на воспоминание.',
    start: 'Начать раунд',
    study: 'Изучите маршрут',
    recall: 'Восстановите маршрут',
    delay: 'Удержите карту в уме',
    delayBody: 'Маршрут скрыт. Сохраните его мысленный образ перед ответом.',
    continue: 'Продолжить',
    ready: 'Готов — перейти к ответу',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    exit: 'Выйти',
    resultTitle: 'Раунд завершён',
    playAgain: 'Повторить тот же маршрут',
    noAutoAdvance: 'Следующий уровень не запускается автоматически.',
    routeAccuracy: 'Точность маршрута',
    extraSteps: 'Лишние шаги',
    angularError: 'Угловая ошибка',
    turnAccuracy: 'Точность поворотов',
    duration: 'Время',
    seed: 'Seed',
    grid: 'Сетка {size}×{size} · маршрут {steps}',
    routeProgress: 'Шаг {current} из {total}',
    turnProgress: 'Поворот {current} из {total}',
    routePrompt: 'Выберите следующее направление на экране',
    turnPrompt: 'Какой поворот был следующим?',
    homePrompt: 'В каком направлении находится старт?',
    swipeHint: 'Можно нажать кнопку, клавишу или провести по полю.',
    mapHidden: 'Карта скрыта на этом уровне.',
    startCell: 'Старт',
    finishCell: 'Финиш',
    currentCell: 'Текущая позиция',
    routeCell: 'Шаг маршрута {index}',
    falseBranch: 'Ложная ветвь',
    landmark: 'Ориентир {index}',
    keyboardHelp: 'Стрелки/WASD — направления; ←/↑/→ — повороты; NumPad 1–9 — восемь направлений домой. P — пауза, R — перезапуск.',
  },
  en: {
    title: 'Navigator',
    catalogDesc: 'Remember routes, turn sequences, and the direction back to the start.',
    skill: 'Spatial navigation and mental mapping',
    rulesTitle: 'Three ways to hold a route in mind',
    rulesBody: 'The logical route stays the same even when the map rotates.',
    routeRecallRule: 'Route Recall: study a path, then repeat its directions without the line.',
    turnSequenceRule: 'Turn Sequence: remember left, straight, and right, then reproduce them.',
    homeDirectionRule: 'Home Direction: after the route, point toward the starting cell.',
    progressionInfo: 'After tutorials, landmarks, false branches, rotation, hidden maps, and a recall delay appear.',
    start: 'Start round',
    study: 'Study the route',
    recall: 'Recall the route',
    delay: 'Hold the map in mind',
    delayBody: 'The route is hidden. Keep its mental image before answering.',
    continue: 'Continue',
    ready: 'Ready — answer',
    pause: 'Paused',
    resume: 'Resume',
    restart: 'Restart',
    exit: 'Exit',
    resultTitle: 'Round complete',
    playAgain: 'Repeat the same route',
    noAutoAdvance: 'The next level does not start automatically.',
    routeAccuracy: 'Route accuracy',
    extraSteps: 'Extra steps',
    angularError: 'Angular error',
    turnAccuracy: 'Turn accuracy',
    duration: 'Time',
    seed: 'Seed',
    grid: '{size}×{size} grid · {steps}-step route',
    routeProgress: 'Step {current} of {total}',
    turnProgress: 'Turn {current} of {total}',
    routePrompt: 'Choose the next screen direction',
    turnPrompt: 'Which turn came next?',
    homePrompt: 'Which direction leads to the start?',
    swipeHint: 'Use a button, keyboard key, or swipe across the field.',
    mapHidden: 'The map is hidden at this level.',
    startCell: 'Start',
    finishCell: 'Finish',
    currentCell: 'Current position',
    routeCell: 'Route step {index}',
    falseBranch: 'False branch',
    landmark: 'Landmark {index}',
    keyboardHelp: 'Arrows/WASD choose directions; ←/↑/→ choose turns; Numpad 1–9 chooses eight home directions. P pauses; R restarts.',
  },
};

const MODE_LABELS: Record<NavigatorLocale, Record<NavigatorMode, string>> = {
  ru: { 'route-recall': 'Маршрут', 'turn-sequence': 'Повороты', 'home-direction': 'Направление домой' },
  en: { 'route-recall': 'Route Recall', 'turn-sequence': 'Turn Sequence', 'home-direction': 'Home Direction' },
};

const DIRECTION_LABELS: Record<NavigatorLocale, Record<CardinalDirection, string>> = {
  ru: { north: 'Вверх', east: 'Вправо', south: 'Вниз', west: 'Влево' },
  en: { north: 'Up', east: 'Right', south: 'Down', west: 'Left' },
};

const TURN_LABELS: Record<NavigatorLocale, Record<TurnInstruction, string>> = {
  ru: { left: 'Налево', straight: 'Прямо', right: 'Направо' },
  en: { left: 'Left', straight: 'Straight', right: 'Right' },
};

const HOME_LABELS: Record<NavigatorLocale, Record<HomeSector, string>> = {
  ru: {
    north: 'Север', 'north-east': 'Северо-восток', east: 'Восток', 'south-east': 'Юго-восток',
    south: 'Юг', 'south-west': 'Юго-запад', west: 'Запад', 'north-west': 'Северо-запад',
  },
  en: {
    north: 'North', 'north-east': 'North-east', east: 'East', 'south-east': 'South-east',
    south: 'South', 'south-west': 'South-west', west: 'West', 'north-west': 'North-west',
  },
};

export function getNavigatorStrings(locale: NavigatorLocale): NavigatorStrings {
  return STRINGS[locale];
}

export function getNavigatorModeLabel(locale: NavigatorLocale, mode: NavigatorMode): string {
  return MODE_LABELS[locale][mode];
}

export function getCardinalLabel(locale: NavigatorLocale, direction: CardinalDirection): string {
  return DIRECTION_LABELS[locale][direction];
}

export function getTurnLabel(locale: NavigatorLocale, turn: TurnInstruction): string {
  return TURN_LABELS[locale][turn];
}

export function getHomeSectorLabel(locale: NavigatorLocale, sector: HomeSector): string {
  return HOME_LABELS[locale][sector];
}

export function interpolateNavigator(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}
