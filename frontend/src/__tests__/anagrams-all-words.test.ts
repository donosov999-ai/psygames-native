/**
 * 🔴 РЕЖИМ «НАЙДИ ВСЕ СЛОВА» — ПРОВЕРЯЕМ НАБОРЫ ЧИСЛАМИ.
 *
 * Наборы собраны отдельными скриптами из внешних источников (`wordlist-build/`),
 * а значит могут молча испортиться при пересборке: не тот словарь, не та
 * кодировка, не тот отсев. Пробы держат ровно то, ради чего режим и делался.
 */
import {
  allWordsLocales, allWordsCount, allWordsPack, allWordsLetters,
  собираетсяИзПлиток, сдатьСлово, всёНайдено, подсказкаAllWords, allWordsНачат,
} from '@/src/games/anagrams/core/allWords';

describe('наборы «найди все слова»', () => {
  it('есть оба языка, и они не пустые', () => {
    expect(allWordsLocales()).toEqual(['en', 'ru']);
    expect(allWordsCount('ru')).toBeGreaterThan(300);
    expect(allWordsCount('en')).toBeGreaterThan(1000);
  });

  it('🔴 КАЖДОЕ слово раскладки собирается из букв базы', () => {
    // Ради этого режим и существует: несобираемая цель делает уровень
    // непроходимым, а заметно это только на ней самой.
    const плохо: string[] = [];
    for (const loc of allWordsLocales()) {
      for (let i = 1; i <= allWordsCount(loc); i++) {
        const p = allWordsPack(loc, i)!;
        for (const w of p.words) {
          if (!собираетсяИзПлиток(w, [...p.base])) плохо.push(`${loc} «${p.base}» ⊅ «${w}»`);
        }
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('база длиной 7–8, целей 6…14, дублей нет, цель ≠ база', () => {
    const плохо: string[] = [];
    for (const loc of allWordsLocales()) {
      for (let i = 1; i <= allWordsCount(loc); i++) {
        const p = allWordsPack(loc, i)!;
        const n = [...p.base].length;
        if (n < 7 || n > 8) плохо.push(`${loc} «${p.base}»: база ${n} букв`);
        if (p.words.length < 6 || p.words.length > 14) плохо.push(`${loc} «${p.base}»: целей ${p.words.length}`);
        if (new Set(p.words).size !== p.words.length) плохо.push(`${loc} «${p.base}»: дубль в целях`);
        if (p.words.indexOf(p.base) >= 0) плохо.push(`${loc} «${p.base}»: база среди целей`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('уровень даёт ту же раскладку всегда, а набор идёт по кругу', () => {
    const a = allWordsPack('ru', 3)!;
    expect(allWordsPack('ru', 3)!.base).toBe(a.base);
    expect(allWordsPack('ru', 3 + allWordsCount('ru'))!.base).toBe(a.base);
  });

  it('неизвестный язык не роняет игру — отдаётся английский', () => {
    expect(allWordsPack('ja', 1)).not.toBeNull();
  });

  it('🔴 банк — это буквы базы, перемешанные, а НЕ другой состав', () => {
    for (const loc of allWordsLocales()) {
      for (const уровень of [1, 7, 42]) {
        const p = allWordsPack(loc, уровень)!;
        const банк = allWordsLetters(p, уровень);
        expect(банк.slice().sort().join('')).toBe([...p.base].sort().join(''));
        // И каждое слово собирается уже из БАНКА, а не только из базы.
        for (const w of p.words) expect(`${w}: ${собираетсяИзПлиток(w, банк)}`).toBe(`${w}: true`);
      }
    }
  });

  it('перемешивание детерминированно от уровня', () => {
    const p = allWordsPack('ru', 5)!;
    expect(allWordsLetters(p, 5).join('')).toBe(allWordsLetters(p, 5).join(''));
  });
});

describe('сдача слова', () => {
  const p = allWordsPack('ru', 1)!;

  it('цель засчитывается, повтор виден отдельно, чужое — мимо', () => {
    const цель = p.words[0]!;
    expect(сдатьСлово(p, цель, [])).toBe('цель');
    expect(сдатьСлово(p, цель.toUpperCase(), [])).toBe('цель');
    expect(сдатьСлово(p, цель, [цель])).toBe('повтор');
    expect(сдатьСлово(p, 'ъъъ', [])).toBe('мимо');
  });

  it('уровень закрыт, когда найдены ВСЕ', () => {
    expect(всёНайдено(p, [])).toBe(false);
    expect(всёНайдено(p, p.words.slice(0, -1))).toBe(false);
    expect(всёНайдено(p, p.words)).toBe(true);
  });

  it('🔴 подсказка даёт САМОЕ КОРОТКОЕ ненайденное, а не решает уровень', () => {
    const h = подсказкаAllWords(p, [])!;
    expect(h.слово.length).toBe(Math.min(...p.words.map((w) => w.length)));
    expect(h.открыто).toBe(1);
    expect(подсказкаAllWords(p, p.words)).toBeNull();
  });

  /**
   * 🔴 ПОДСКАЗКА НЕ БУКСУЕТ НА ОДНОМ СЛОВЕ. Найдено игрой 06.09.2026: слово
   * открывается не больше чем на `длина − 1` букву, и следующее нажатие
   * списывало подсказку впустую.
   */
  it('исчерпав слово, подсказка переходит к следующему', () => {
    const короткое = p.words.reduce((a, b) => (b.length < a.length ? b : a));
    const доПредела = { [короткое]: короткое.length - 1 };
    const h = подсказкаAllWords(p, [], доПредела)!;
    expect(h.слово).not.toBe(короткое);
  });

  it('когда открывать нечего вовсе — отдаёт null, а не пустой шаг', () => {
    const всёОткрыто: Record<string, number> = {};
    for (const w of p.words) всёОткрыто[w] = w.length - 1;
    expect(подсказкаAllWords(p, [], всёОткрыто)).toBeNull();
  });

  it('повторная подсказка на том же слове открывает СЛЕДУЮЩУЮ букву', () => {
    const первая = подсказкаAllWords(p, [])!;
    const вторая = подсказкаAllWords(p, [], { [первая.слово]: первая.открыто })!;
    if (первая.слово.length > 2) {
      expect(`${вторая.слово}: ${вторая.открыто}`).toBe(`${первая.слово}: ${первая.открыто + 1}`);
    }
  });

  it('«есть что терять» — с первого найденного слова', () => {
    expect(allWordsНачат([])).toBe(false);
    expect(allWordsНачат(['кот'])).toBe(true);
  });
});
