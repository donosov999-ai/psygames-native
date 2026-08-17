import type { MathSliderLocale } from './types';

export interface MathSliderStrings {
  title: string;
  skill: string;
  rulesTitle: string;
  rulesBody: string;
  rulesAccuracy: string;
  rulesControls: string;
  startTraining: string;
  trainingTitle: string;
  trainingHint: string;
  roundLabel: string;
  levelLabel: string;
  prompt: string;
  sliderLabel: string;
  sliderHint: string;
  confirm: string;
  continue: string;
  startRound: string;
  exactAnswer: string;
  yourEstimate: string;
  normalizedError: string;
  signedError: string;
  resultTitle: string;
  accuracy: string;
  duration: string;
  errors: string;
  bias: string;
  biasOver: string;
  biasUnder: string;
  biasBalanced: string;
  playAgain: string;
  exit: string;
  pause: string;
  resume: string;
  seed: string;
  keyboardHelp: string;
  noAutoAdvance: string;
}

export const MATH_SLIDER_STRINGS: Record<MathSliderLocale, MathSliderStrings> = {
  ru: {
    title: 'Математическая шкала',
    skill: 'Приблизительный счёт и чувство величины',
    rulesTitle: 'Как играть',
    rulesBody: 'Оцените результат выражения без точного ввода и поставьте маркер на числовой шкале.',
    rulesAccuracy: 'После подтверждения вы увидите точный ответ, свою оценку и размер ошибки.',
    rulesControls: 'Маркер двигается пальцем, мышью или клавишами со стрелками.',
    startTraining: 'Тренировочная попытка',
    trainingTitle: 'Тренировка',
    trainingHint: 'Попробуйте один раз. Эта попытка не сохраняется.',
    roundLabel: 'Задание {current} из {total}',
    levelLabel: 'Уровень {level}',
    prompt: 'Где примерно находится результат?',
    sliderLabel: 'Оценка результата на числовой шкале',
    sliderHint: 'Стрелки двигают маркер, Enter подтверждает.',
    confirm: 'Подтвердить оценку',
    continue: 'Следующее задание',
    startRound: 'Начать партию',
    exactAnswer: 'Точный ответ',
    yourEstimate: 'Ваша оценка',
    normalizedError: 'Ошибка от ширины шкалы',
    signedError: 'Смещение',
    resultTitle: 'Партия завершена',
    accuracy: 'Точность',
    duration: 'Активное время',
    errors: 'За пределами 10%',
    bias: 'Систематическое смещение',
    biasOver: 'завышение',
    biasUnder: 'занижение',
    biasBalanced: 'без заметного смещения',
    playAgain: 'Повторить с тем же seed',
    exit: 'Выйти',
    pause: 'Пауза',
    resume: 'Продолжить',
    seed: 'Seed',
    keyboardHelp: 'Клавиатура: ←/→ — точная настройка, Page Up/Page Down — крупный шаг, Enter — подтвердить.',
    noAutoAdvance: 'Следующий уровень не запускается автоматически.',
  },
  en: {
    title: 'Math Slider',
    skill: 'Estimation and number magnitude',
    rulesTitle: 'How to play',
    rulesBody: 'Estimate the expression without exact input, then place the marker on the number line.',
    rulesAccuracy: 'After confirming, you will see the exact answer, your estimate, and the error size.',
    rulesControls: 'Move the marker with touch, mouse, or arrow keys.',
    startTraining: 'Training attempt',
    trainingTitle: 'Training',
    trainingHint: 'Try once. This attempt is not saved.',
    roundLabel: 'Question {current} of {total}',
    levelLabel: 'Level {level}',
    prompt: 'Where is the result approximately?',
    sliderLabel: 'Estimated result on the number line',
    sliderHint: 'Arrow keys move the marker; Enter confirms.',
    confirm: 'Confirm estimate',
    continue: 'Next question',
    startRound: 'Start game',
    exactAnswer: 'Exact answer',
    yourEstimate: 'Your estimate',
    normalizedError: 'Error as scale width',
    signedError: 'Bias',
    resultTitle: 'Game complete',
    accuracy: 'Accuracy',
    duration: 'Active time',
    errors: 'Outside 10%',
    bias: 'Systematic bias',
    biasOver: 'overestimation',
    biasUnder: 'underestimation',
    biasBalanced: 'no clear bias',
    playAgain: 'Replay the same seed',
    exit: 'Exit',
    pause: 'Pause',
    resume: 'Resume',
    seed: 'Seed',
    keyboardHelp: 'Keyboard: Left/Right for a fine step, Page Up/Page Down for a large step, Enter to confirm.',
    noAutoAdvance: 'The next level never starts automatically.',
  },
};

export function getMathSliderStrings(locale: string): MathSliderStrings {
  return MATH_SLIDER_STRINGS[locale === 'ru' ? 'ru' : 'en'];
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
