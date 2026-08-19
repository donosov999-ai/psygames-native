import type { MemoryPalaceLocale, RecallDirection } from './types';

export interface MemoryPalaceStrings {
  title: string;
  skill: string;
  rulesTitle: string;
  rulesBody: string;
  methodBoundary: string;
  routeRule: string;
  placeRule: string;
  recallRule: string;
  start: string;
  routeTitle: string;
  routeBody: string;
  routeCount: string;
  locusA11y: string;
  continueToPlace: string;
  placeTitle: string;
  placeBody: string;
  selectedItem: string;
  chooseItem: string;
  placeAt: string;
  emptyLocus: string;
  placedItem: string;
  placementProgress: string;
  placementChangeHint: string;
  studyPlacements: string;
  studyTitle: string;
  studyBody: string;
  startRecall: string;
  forward: string;
  reverse: string;
  recallTitle: string;
  recallPrompt: string;
  recallProgress: string;
  used: string;
  transitionTitle: string;
  transitionBody: string;
  continueReverse: string;
  pause: string;
  resume: string;
  restart: string;
  exit: string;
  resultTitle: string;
  noAutoAdvance: string;
  accuracy: string;
  itemKnowledge: string;
  locationAccuracy: string;
  orderAccuracy: string;
  forwardAccuracy: string;
  reverseAccuracy: string;
  placementChanges: string;
  duration: string;
  seed: string;
  playAgain: string;
  keyboardHelp: string;
}

const STRINGS: Record<MemoryPalaceLocale, MemoryPalaceStrings> = {
  ru: {
    title: 'Дворец памяти',
    skill: 'Метод мест: маршрут, ассоциации, порядок',
    rulesTitle: 'Создайте маршрут ассоциаций',
    rulesBody: 'Сначала изучите постоянный маршрут. Затем сами разместите предметы по местам и восстановите их в прямом и обратном порядке.',
    methodBoundary: 'Это тренировка конкретной задачи внутри игры. Она не измеряет IQ и не обещает медицинский или общий эффект для памяти.',
    routeRule: '1. Маршрут: запомните порядок мест.',
    placeRule: '2. Размещение: свяжите каждый предмет с одним местом; до проверки всё можно менять.',
    recallRule: '3. Проверка: называйте предмет для каждого места — сперва вперёд, потом назад.',
    start: 'Начать маршрут',
    routeTitle: 'Маршрут',
    routeBody: 'Пройдите места по номерам. Порядок постоянный, обход работает и с Tab/Enter.',
    routeCount: '{count} мест',
    locusA11y: 'Место {order}: {name}',
    continueToPlace: 'Перейти к размещению',
    placeTitle: 'Разместите предметы',
    placeBody: 'Выберите предмет, затем место. Выбранный ранее предмет можно перенести; занятые места поменяются содержимым.',
    selectedItem: 'Выбрано: {item}',
    chooseItem: 'Сначала выберите предмет',
    placeAt: 'Положить в место {order}: {name}',
    emptyLocus: 'Пусто',
    placedItem: '{locus}: {item}',
    placementProgress: 'Заполнено {current} из {total}',
    placementChangeHint: 'До начала проверки размещение можно менять без штрафа.',
    studyPlacements: 'Запомнить размещение',
    studyTitle: 'Оживите ассоциации',
    studyBody: 'Мысленно сделайте каждую связь яркой: представьте предмет большим, движущимся или звучащим в этом месте.',
    startRecall: 'Начать проверку',
    forward: 'Вперёд',
    reverse: 'Назад',
    recallTitle: 'Проверка · {direction}',
    recallPrompt: 'Что находилось здесь: {locus}?',
    recallProgress: 'Ответ {current} из {total}',
    used: 'Уже выбрано',
    transitionTitle: 'Теперь обратный маршрут',
    transitionBody: 'Те же места пройдите от последнего к первому. Размещение больше не показывается.',
    continueReverse: 'Начать обратную проверку',
    pause: 'Пауза',
    resume: 'Продолжить',
    restart: 'Начать заново',
    exit: 'Выйти',
    resultTitle: 'Маршрут завершён',
    noAutoAdvance: 'Следующий уровень не запускается автоматически.',
    accuracy: 'Общая точность',
    itemKnowledge: 'Знание предметов',
    locationAccuracy: 'Точность места',
    orderAccuracy: 'Порядок',
    forwardAccuracy: 'Места вперёд',
    reverseAccuracy: 'Места назад',
    placementChanges: 'Перестановки',
    duration: 'Время',
    seed: 'Зерно',
    playAgain: 'Повторить тот же маршрут',
    keyboardHelp: 'Tab/Enter работают на всех интерактивных элементах; R — перезапуск, P — пауза.',
  },
  en: {
    title: 'Memory Palace',
    skill: 'Method of loci and structured associative memory',
    rulesTitle: 'Build a route of associations',
    rulesBody: 'First study the fixed route. Then place concrete items at its loci and recall them in forward and reverse order.',
    methodBoundary: 'This trains a specific in-game task. It does not measure IQ or promise medical or general memory benefits.',
    routeRule: '1. Route: learn the order of loci.',
    placeRule: '2. Place: connect one item to each locus; everything stays editable before Recall.',
    recallRule: '3. Recall: choose the item for each locus forward, then in reverse.',
    start: 'Start route',
    routeTitle: 'Route',
    routeBody: 'Follow the numbered loci. The order is fixed and available with Tab and Enter.',
    routeCount: '{count} loci',
    locusA11y: 'Locus {order}: {name}',
    continueToPlace: 'Continue to placement',
    placeTitle: 'Place the items',
    placeBody: 'Choose an item, then a locus. You can move an assigned item; occupied loci exchange contents.',
    selectedItem: 'Selected: {item}',
    chooseItem: 'Choose an item first',
    placeAt: 'Place at locus {order}: {name}',
    emptyLocus: 'Empty',
    placedItem: '{locus}: {item}',
    placementProgress: 'Filled {current} of {total}',
    placementChangeHint: 'Placement remains editable without penalty until Recall starts.',
    studyPlacements: 'Study placements',
    studyTitle: 'Make associations vivid',
    studyBody: 'Imagine each item oversized, moving, or making a sound at its locus.',
    startRecall: 'Start Recall',
    forward: 'Forward',
    reverse: 'Reverse',
    recallTitle: 'Recall · {direction}',
    recallPrompt: 'What was placed here: {locus}?',
    recallProgress: 'Answer {current} of {total}',
    used: 'Already selected',
    transitionTitle: 'Now reverse the route',
    transitionBody: 'Visit the same loci from last to first. Placements are no longer shown.',
    continueReverse: 'Start reverse Recall',
    pause: 'Pause',
    resume: 'Resume',
    restart: 'Restart',
    exit: 'Exit',
    resultTitle: 'Route complete',
    noAutoAdvance: 'The next level does not start automatically.',
    accuracy: 'Overall accuracy',
    itemKnowledge: 'Item knowledge',
    locationAccuracy: 'Location accuracy',
    orderAccuracy: 'Order',
    forwardAccuracy: 'Forward locations',
    reverseAccuracy: 'Reverse locations',
    placementChanges: 'Rearrangements',
    duration: 'Time',
    seed: 'Seed',
    playAgain: 'Repeat the same route',
    keyboardHelp: 'Tab/Enter works on every interactive element; R restarts; P pauses.',
  },
};

export function getMemoryPalaceStrings(locale: MemoryPalaceLocale): MemoryPalaceStrings {
  return STRINGS[locale];
}

export function getRecallDirectionLabel(
  locale: MemoryPalaceLocale,
  direction: RecallDirection,
): string {
  const strings = STRINGS[locale];
  return direction === 'forward' ? strings.forward : strings.reverse;
}

export function interpolateMemoryPalace(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? '{' + key + '}'));
}
