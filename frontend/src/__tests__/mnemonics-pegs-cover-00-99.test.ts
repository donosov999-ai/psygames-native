/**
 * СЛОВАРЬ-ОПОРА 00–99: покрытие без дыр, без повторов и БЕЗ ВРАНЬЯ В КОДЕ.
 *
 * 🔴 ГЛАВНАЯ ПРОВЕРКА — ТРЕТЬЯ. Пересчитать сто строк и убедиться, что их сто,
 * умеет и глаз. А вот опечатка в самом слове («нора» вместо «нара») даёт опору,
 * которая кодирует ДРУГОЕ число, — и человек выучит неверный приём и будет им
 * пользоваться. Поэтому каждое слово прогоняется разбором по правилу кода.
 *
 * ⚠️ РАЗБОР ПРОВЕРЯЕТСЯ ОТДЕЛЬНО И ПЕРВЫМ. Проба, которая сверяет данные тем же
 * кодом, которым данные набирались, зелёная всегда — ровно на этом сгорел
 * голосовой слой 23.09.2026, где адрес записи строился из слова и проверялся той
 * же формулой. Поэтому сначала разбор ловится на словах с известным ответом.
 */
import {
  PEG_WORDS, PEG_RULE, decodePegWord, pegFor, pegHint, hasPegTable,
} from '../games/mnemonics/pegs';

describe('буквенно-цифровой код: разбор слова в цифры', () => {
  it('🔴 разбор даёт известный ответ на словах, набранных не им', () => {
    expect(decodePegWord('нос', 'ru')).toEqual([2, 0]);
    expect(decodePegWord('молоко', 'ru')).toEqual([3, 5, 7]);
    expect(decodePegWord('аэропорт', 'ru')).toEqual([4, 9, 4, 1]);
    expect(decodePegWord('nose', 'en')).toEqual([2, 0]);
    expect(decodePegWord('telephone', 'en')).toEqual([1, 5, 8, 2]);
  });

  it('удвоенная согласная — один звук', () => {
    expect(decodePegWord('lasso', 'en')).toEqual([5, 0]);
    expect(decodePegWord('ball', 'en')).toEqual([9, 5]);
    expect(decodePegWord('ванна', 'ru')).toEqual([8, 2]);
  });

  it('двубуквенные сочетания — один звук, а не два', () => {
    expect(decodePegWord('chess', 'en')).toEqual([6, 0]);
    expect(decodePegWord('chick', 'en')).toEqual([6, 7]);
    expect(decodePegWord('ship', 'en')).toEqual([6, 9]);
  });

  it('«c» читается по правилу: перед e/i/y — как s, иначе как k', () => {
    expect(decodePegWord('cameo', 'en')).toEqual([7, 3]);
    expect(decodePegWord('vac', 'en')).toEqual([8, 7]);
    expect(decodePegWord('city', 'en')).toEqual([0, 1]);
  });

  it('гласные и мягкий знак кода не несут', () => {
    expect(decodePegWord('соль', 'ru')).toEqual([0, 5]);
    expect(decodePegWord('аниме', 'ru')).toEqual([2, 3]);
    expect(decodePegWord('enemy', 'en')).toEqual([2, 3]);
  });
});

describe.each(['ru', 'en'] as const)('словарь-опора «%s»', (lang) => {
  const words = PEG_WORDS[lang];

  it('таблица покрывает 00–99 без дыр', () => {
    expect(words).toHaveLength(100);
    expect(words.filter((w) => !w || !w.trim())).toEqual([]);
  });

  it('🔴 каждое слово кодирует ИМЕННО своё число и ничего сверх', () => {
    const плохие = words
      .map((word, n) => {
        const digits = decodePegWord(word, lang);
        const ждали = [Math.floor(n / 10), n % 10];
        if (digits.length !== 2) return `${String(n).padStart(2, '0')} «${word}»: согласных ${digits.length}, а нужно ровно 2 (${digits.join('')})`;
        if (digits[0] !== ждали[0] || digits[1] !== ждали[1]) return `${String(n).padStart(2, '0')} «${word}»: кодирует ${digits.join('')}`;
        return null;
      })
      .filter(Boolean);
    expect(плохие).toEqual([]);
  });

  it('образы не повторяются', () => {
    const повторы = words.filter((w, i) => words.indexOf(w) !== i);
    expect(повторы).toEqual([]);
  });

  it('правило кода расписано на все десять цифр, и у каждой — зацепка', () => {
    const rows = PEG_RULE[lang];
    expect(rows.map((r) => r.digit)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.filter((r) => !r.letters.trim() || r.why.trim().length < 10)).toEqual([]);
  });

  it('подсказка называет слово и разбор по согласным', () => {
    const h = pegHint(47, lang) ?? '';
    expect(h).toContain(words[47]);
    expect(h).toMatch(/=4/);
    expect(h).toMatch(/=7/);
  });
});

describe('язык без таблицы', () => {
  it('🔴 честное «нет», а не чужая таблица', () => {
    expect(hasPegTable('de')).toBe(false);
    expect(pegFor(12, 'de')).toBeNull();
    expect(pegHint(12, 'zh')).toBeNull();
  });

  it('за пределами 0…99 опоры нет', () => {
    expect(pegFor(100, 'ru')).toBeNull();
    expect(pegFor(-1, 'en')).toBeNull();
  });
});

describe('английская таблица не берёт букв, которые код читает двояко', () => {
  it('🔴 без «g» и «x»: у них нет однозначной цифры', () => {
    const плохие = PEG_WORDS.en.filter((w) => /[gx]/i.test(w));
    expect(плохие).toEqual([]);
  });
});
