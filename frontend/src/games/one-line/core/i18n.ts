import type { OneLineLocale } from './types';

const STRINGS = {
  ru: {
    title: 'Одна линия',
    skill: 'Планирование и контроль импульса',
    rulesTitle: 'Как играть',
    rulesBody: 'Проведите одну непрерывную линию по каждому ребру графа ровно один раз.',
    rulesRepeat: 'В вершины можно возвращаться, но уже пройденное ребро использовать нельзя.',
    rulesCrossing: 'Визуальное пересечение линий не является вершиной: менять направление там нельзя.',
    keyboardHelp: 'Клавиши: стрелки — выбор вершины, Enter — шаг, U — отмена, H — подсказка, R — заново, P — пауза.',
    startTraining: 'Попробовать тренировку',
    training: 'Тренировка',
    trainingHint: 'Тренировка не входит в результат. Подсвеченная вершина — допустимый старт.',
    trainingDone: 'Тренировка пройдена',
    startRound: 'Начать партию',
    roundLabel: 'Уровень {level} · вершин {vertices} · рёбер {edges}',
    graphLabel: 'Граф для непрерывной линии',
    graphHint: 'Выбирайте соседние вершины касанием, перетаскиванием или клавиатурой.',
    progress: 'Пройдено рёбер: {used} из {total}',
    vertexLabel: 'Вершина {number}',
    startMarker: 'Допустимый старт',
    currentMarker: 'Текущая вершина',
    hintMarker: 'Подсказанный ход',
    undo: 'Отменить',
    hint: 'Подсказка',
    restart: 'Начать заново',
    pause: 'Пауза',
    resume: 'Продолжить',
    resultTitle: 'Линия завершена',
    accuracy: 'Точность',
    duration: 'Активное время',
    corrections: 'Исправления',
    hints: 'Подсказки',
    noAutoAdvance: 'Следующий уровень запускается только по вашему выбору.',
    playAgain: 'Повторить с тем же seed',
    seed: 'Seed',
    exit: 'Выйти',
  },
  en: {
    title: 'One Line',
    skill: 'Planning and inhibition',
    rulesTitle: 'How to play',
    rulesBody: 'Draw one continuous line across every graph edge exactly once.',
    rulesRepeat: 'You may revisit vertices, but you cannot use an edge twice.',
    rulesCrossing: 'A visual line crossing is not a vertex, so you cannot turn there.',
    keyboardHelp: 'Keys: arrows choose a vertex, Enter steps, U undoes, H hints, R restarts, P pauses.',
    startTraining: 'Try the training graph',
    training: 'Training',
    trainingHint: 'Training is excluded from results. The marked vertex is a valid start.',
    trainingDone: 'Training complete',
    startRound: 'Start round',
    roundLabel: 'Level {level} · {vertices} vertices · {edges} edges',
    graphLabel: 'Continuous-line graph',
    graphHint: 'Choose adjacent vertices by touch, drag, or keyboard.',
    progress: 'Edges used: {used} of {total}',
    vertexLabel: 'Vertex {number}',
    startMarker: 'Valid start',
    currentMarker: 'Current vertex',
    hintMarker: 'Suggested move',
    undo: 'Undo',
    hint: 'Hint',
    restart: 'Restart',
    pause: 'Pause',
    resume: 'Resume',
    resultTitle: 'Line complete',
    accuracy: 'Accuracy',
    duration: 'Active time',
    corrections: 'Corrections',
    hints: 'Hints',
    noAutoAdvance: 'The next level starts only when you choose it.',
    playAgain: 'Replay the same seed',
    seed: 'Seed',
    exit: 'Exit',
  },
} as const;

export type OneLineStrings = (typeof STRINGS)[OneLineLocale];

export function getOneLineStrings(locale: OneLineLocale): OneLineStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolateOneLine(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
