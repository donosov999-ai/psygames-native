/**
 * РЕЖИМ «ОПОРЫ»: ВОПРОС ОБЯЗАН БЫТЬ ЗАДАНИЕМ, А НЕ УГАДАЙКОЙ.
 *
 * 🔴 ГЛАВНОЕ ЗДЕСЬ — ОТВЛЕКАЮЩИЕ. Четыре варианта, из которых три взяты
 * случайно, проходятся без знания кода: одно слово знакомо, три чужих. Задание
 * начинается там, где варианты похожи, — поэтому проба требует, чтобы среди них
 * были числа с совпавшей цифрой.
 */
import { makePegQuestion, pegDistractors, pegQuizParams } from '../games/mnemonics/pegsQuiz';
import { PEG_WORDS, pegFor } from '../games/mnemonics/pegs';

/** Подставной случай: вопросы обязаны быть проверяемыми, а не «обычно такими». */
const ряд = (значения: number[]) => {
  let i = 0;
  return () => значения[i++ % значения.length];
};

describe('лестница режима опор', () => {
  it('🔴 диапазон растёт, а не стоит: десяток → тридцать → полсотни → сотня', () => {
    expect(pegQuizParams(1).range).toBe(10);
    expect(pegQuizParams(3).range).toBe(30);
    expect(pegQuizParams(7).range).toBe(50);
    expect(pegQuizParams(12).range).toBe(100);
  });

  it('обратная сторона включается не сразу', () => {
    expect(pegQuizParams(1).bothWays).toBe(false);
    expect(pegQuizParams(3).bothWays).toBe(false);
    expect(pegQuizParams(4).bothWays).toBe(true);
  });

  it('🔴 плато не раньше 20-го уровня: между 1 и 19 параметры меняются', () => {
    const слепки = Array.from({ length: 19 }, (_, i) => JSON.stringify(pegQuizParams(i + 1)));
    const подряд = слепки.filter((s, i) => i > 0 && s === слепки[i - 1]).length;
    expect(подряд).toBeLessThan(10);
    expect(new Set(слепки).size).toBeGreaterThanOrEqual(8);
  });
});

describe('вопрос', () => {
  it('🔴 четыре варианта, верный ровно один, и он есть среди них', () => {
    for (let level = 1; level <= 12; level += 1) {
      const q = makePegQuestion(level, 'ru');
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });

  it('🔴 верный ответ — это и есть опора загаданного числа', () => {
    for (let i = 0; i < 40; i += 1) {
      const q = makePegQuestion(12, 'ru');
      if (q.direction === 'toWord') {
        expect(q.answer).toBe(pegFor(q.n, 'ru'));
        expect(q.prompt).toBe(String(q.n).padStart(2, '0'));
      } else {
        expect(q.prompt).toBe(pegFor(q.n, 'ru'));
        expect(q.answer).toBe(String(q.n).padStart(2, '0'));
      }
    }
  });

  it('🔴 отвлекающие похожи: есть совпадение цифры, иначе код можно не знать', () => {
    for (let i = 0; i < 30; i += 1) {
      const ч = pegDistractors(47, 100, Math.random);
      expect(ч).toHaveLength(3);
      expect(ч).not.toContain(47);
      const похожих = ч.filter((x) => Math.floor(x / 10) === 4 || x % 10 === 7).length;
      expect(похожих).toBeGreaterThanOrEqual(2);
    }
  });

  it('в первом десятке отвлекающие тоже набираются, а вопрос не ломается', () => {
    const q = makePegQuestion(1, 'ru', ряд([0.1, 0.9, 0.3, 0.7, 0.2, 0.5, 0.4, 0.8, 0.6, 0.05]));
    expect(q.options).toHaveLength(4);
    expect(q.n).toBeLessThan(10);
  });

  it('вопрос не повторяет уже спрошенное, пока есть запас', () => {
    const было = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 0; i < 20; i += 1) {
      expect(было).not.toContain(makePegQuestion(1, 'ru', Math.random, было).n);
    }
  });

  it('английская сторона берёт английские слова', () => {
    const q = makePegQuestion(12, 'en');
    const словарь = PEG_WORDS.en;
    if (q.direction === 'toWord') q.options.forEach((o) => expect(словарь).toContain(o));
    else expect(словарь).toContain(q.prompt);
  });
});
