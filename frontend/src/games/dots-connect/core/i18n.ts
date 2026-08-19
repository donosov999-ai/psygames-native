import type { DotsLocale } from './types';

const STRINGS = {
  ru: {
    title: 'Соедини точки',
    skill: 'Пространственное планирование',
    rulesTitle: 'Как играть',
    rulesBody: 'Соедините одинаковые символы непрерывными путями. Пути не пересекаются и не делят клетки.',
    rulesCoverage: 'Победа — когда соединены все пары и занята вся сетка.',
    rulesCorrection: 'Проведите назад по своему пути, чтобы стереть хвост, или коснитесь его для исправления.',
    keyboardHelp: 'Клавиши: стрелки — курсор/путь, Enter — начать или отпустить, U — отмена, R — заново, P — пауза.',
    startTraining: 'Попробовать тренировку',
    training: 'Тренировка',
    trainingHint: 'Эта сетка не сохраняется в результат.',
    trainingDone: 'Тренировка пройдена',
    startRound: 'Начать партию',
    roundLabel: 'Уровень {level} · {size}×{size} · пар: {pairs}',
    boardLabel: 'Сетка путей {size} на {size}',
    boardHint: 'Выберите конец пары и ведите путь стрелками или пальцем.',
    boardValue: 'Курсор: строка {row}, столбец {col}. Занято {covered} из {total}.',
    pairCell: 'Символ {symbol}',
    emptyCell: 'Пустая клетка',
    undo: 'Отменить',
    restart: 'Начать заново',
    pause: 'Пауза',
    resume: 'Продолжить',
    resultTitle: 'Сетка заполнена',
    accuracy: 'Эффективность',
    duration: 'Активное время',
    corrections: 'Исправления',
    moves: 'Ходы вперёд',
    noAutoAdvance: 'Следующий уровень запускается только по вашему выбору.',
    playAgain: 'Повторить с тем же seed',
    seed: 'Seed',
    exit: 'Выйти',
  },
  en: {
    title: 'Connect the Dots',
    skill: 'Spatial planning',
    rulesTitle: 'How to play',
    rulesBody: 'Join matching symbols with continuous paths. Paths cannot cross or share a cell.',
    rulesCoverage: 'You win when every pair is joined and the entire grid is filled.',
    rulesCorrection: 'Move backward along your path to erase its tail, or touch it to correct it.',
    keyboardHelp: 'Keys: arrows move the cursor/path, Enter starts or releases, U undoes, R restarts, P pauses.',
    startTraining: 'Try the training board',
    training: 'Training',
    trainingHint: 'This board is not included in your result.',
    trainingDone: 'Training complete',
    startRound: 'Start round',
    roundLabel: 'Level {level} · {size}×{size} · pairs: {pairs}',
    boardLabel: '{size} by {size} path grid',
    boardHint: 'Select a pair endpoint, then draw with arrows or touch.',
    boardValue: 'Cursor: row {row}, column {col}. Covered {covered} of {total}.',
    pairCell: 'Symbol {symbol}',
    emptyCell: 'Empty cell',
    undo: 'Undo',
    restart: 'Restart',
    pause: 'Pause',
    resume: 'Resume',
    resultTitle: 'Grid complete',
    accuracy: 'Efficiency',
    duration: 'Active time',
    corrections: 'Corrections',
    moves: 'Forward moves',
    noAutoAdvance: 'The next level starts only when you choose it.',
    playAgain: 'Replay the same seed',
    seed: 'Seed',
    exit: 'Exit',
  },
} as const;

export type DotsStrings = (typeof STRINGS)[DotsLocale];

export function getDotsStrings(locale: DotsLocale): DotsStrings {
  return STRINGS[locale] ?? STRINGS.en;
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}
