/**
 * РЕЖИМ «ОПОРЫ»: ТРЕНИРОВКА САМОЙ ТАБЛИЦЫ, БЕЗ РЯДА НА УДЕРЖАНИЕ.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ РЕЖИМ. Отчёт NZT-48 (bf1f53cc, 13.09.2026) просил ровно
 * этого: «ввести отдельный режим для запоминания цифр мнемонических таблицы до
 * 100». Причина не в разнообразии: пока сотня опор не узнаётся мгновенно, приём
 * В ПАРТИИ только мешает — человек тратит рабочую память на вспоминание слова
 * вместо удержания ряда. Таблица учится отдельно и до того.
 *
 * ⚠️ ПОЧЕМУ ЛОГИКА ЗДЕСЬ, А НЕ В ЭКРАНЕ. Вопрос собирается случайностью, и
 * проверить его свойства (в разборе ровно четыре варианта, верный ровно один,
 * отвлекающие не случайные, диапазон растёт с уровнем) можно только когда
 * сборка — чистая функция с подставным случаем.
 */
import { PEG_WORDS, PegLang, pegFor } from './pegs';

export type PegDirection = 'toWord' | 'toNumber';

export type PegQuestion = {
  /** Загаданное число 0…99. */
  n: number;
  /** В какую сторону спрашиваем. */
  direction: PegDirection;
  /** Что показано человеку: число или слово. */
  prompt: string;
  /** Четыре варианта в перемешанном порядке. */
  options: string[];
  /** Верный из них. */
  answer: string;
};

/**
 * Лестница режима — три оси, а не одна.
 *
 * · ДИАПАЗОН. Сто опор сразу — это не трудно, а безнадёжно: человек не узнаёт
 *   ни одной и отвечает наугад. Поэтому сначала первый десяток, потом тридцать,
 *   дальше вся сотня.
 * · СТОРОНА. «Число → слово» проще: подсказывает сам код. «Слово → число» —
 *   обратный ход, которым потом и вспоминают. Обе стороны включаются не сразу.
 * · ДЛИНА. Число вопросов в заходе.
 */
export function pegQuizParams(level: number): { range: number; bothWays: boolean; count: number } {
  const l = Math.min(20, Math.max(1, Math.floor(level)));
  const range = l <= 2 ? 10 : l <= 5 ? 30 : l <= 9 ? 50 : 100;
  return { range, bothWays: l >= 4, count: Math.min(20, 6 + Math.floor((l - 1) / 2) * 2) };
}

/**
 * Отвлекающие берутся ПОХОЖИМИ, а не случайными.
 *
 * 🔴 Случайный набор превращает задание в узнавание одного знакомого слова из
 * четырёх чужих: отвечать можно, не зная кода вовсе. Похожие — те, у кого
 * совпала одна из двух цифр: чтобы их различить, код надо прочитать целиком.
 */
export function pegDistractors(n: number, range: number, rnd: () => number): number[] {
  const все = Array.from({ length: range }, (_, i) => i).filter((x) => x !== n);
  const похожие = все.filter((x) => Math.floor(x / 10) === Math.floor(n / 10) || x % 10 === n % 10);
  const прочие = все.filter((x) => !похожие.includes(x));
  const выбрать = (из: number[], сколько: number) => {
    const копия = [...из];
    const взято: number[] = [];
    while (взято.length < сколько && копия.length) {
      взято.push(...копия.splice(Math.floor(rnd() * копия.length), 1));
    }
    return взято;
  };
  // Двое похожих — столько, сколько почти всегда есть даже в первом десятке.
  const набор = выбрать(похожие, 2);
  набор.push(...выбрать(прочие, 3 - набор.length));
  if (набор.length < 3) набор.push(...выбрать(все.filter((x) => !набор.includes(x)), 3 - набор.length));
  return набор;
}

export function makePegQuestion(
  level: number,
  lang: PegLang,
  rnd: () => number = Math.random,
  избегать: number[] = [],
): PegQuestion {
  const { range, bothWays } = pegQuizParams(level);
  const свободные = Array.from({ length: range }, (_, i) => i).filter((x) => !избегать.includes(x));
  const пул = свободные.length ? свободные : Array.from({ length: range }, (_, i) => i);
  const n = пул[Math.floor(rnd() * пул.length)];
  const direction: PegDirection = bothWays && rnd() < 0.5 ? 'toNumber' : 'toWord';
  const слово = pegFor(n, lang) as string;
  const двузначно = (x: number) => String(x).padStart(2, '0');
  const чужие = pegDistractors(n, range, rnd);
  const варианты = direction === 'toWord'
    ? [слово, ...чужие.map((x) => PEG_WORDS[lang][x])]
    : [двузначно(n), ...чужие.map(двузначно)];
  for (let i = варианты.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [варианты[i], варианты[j]] = [варианты[j], варианты[i]];
  }
  return {
    n,
    direction,
    prompt: direction === 'toWord' ? двузначно(n) : слово,
    options: варианты,
    answer: direction === 'toWord' ? слово : двузначно(n),
  };
}
