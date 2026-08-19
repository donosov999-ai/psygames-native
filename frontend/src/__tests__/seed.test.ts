/**
 * Воспроизводимая случайность.
 *
 * ЗАЧЕМ ТЕСТ. Сид либо воспроизводит доску точно, либо бесполезен: «почти та же доска»
 * хуже, чем никакой — двое сравнивают результаты, не подозревая, что решали разное.
 * Проверить это глазами нельзя, поломка выглядит как обычная случайность.
 *
 * Второе место, где легко потерять смысл, — приведение введённого. Человек наберёт
 * «Кедр-Муссон-47» или «кедр муссон 47», а доска обязана получиться одна и та же.
 */
import { makeRng, hashSeed, seededShuffle, makeReadableSeed, normalizeSeed } from '@/src/services/seed';
import { generateSamurai } from '@/src/services/samurai';
import { generateFractal } from '@/src/services/fractal-sudoku';

describe('генератор из сида', () => {
  it('одна строка — одна и та же последовательность', () => {
    const a = makeRng('кедр-муссон-47');
    const b = makeRng('кедр-муссон-47');
    const xa = Array.from({ length: 50 }, () => a());
    const xb = Array.from({ length: 50 }, () => b());
    expect(xa).toEqual(xb);
  });

  it('разные строки — разные последовательности', () => {
    const a = Array.from({ length: 20 }, makeRng('сокол-риф-12'));
    const b = Array.from({ length: 20 }, makeRng('сокол-риф-13'));
    expect(a).not.toEqual(b);
  });

  it('значения лежат в [0,1) — иначе выбор элемента выйдет за массив', () => {
    const r = makeRng('дюна-иней-88');
    for (let i = 0; i < 500; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('не застревает на одном значении', () => {
    const r = makeRng('оникс-пламя-31');
    expect(new Set(Array.from({ length: 100 }, r)).size).toBeGreaterThan(90);
  });

  it('пустая строка не запирает генератор', () => {
    const r = makeRng('');
    expect(new Set(Array.from({ length: 50 }, r)).size).toBeGreaterThan(40);
  });

  it('хеш устойчив и не даёт отрицательных', () => {
    expect(hashSeed('кедр')).toBe(hashSeed('кедр'));
    expect(hashSeed('кедр')).toBeGreaterThanOrEqual(0);
    expect(hashSeed('кедр')).not.toBe(hashSeed('кедр '));
  });
});

describe('тасовка', () => {
  it('на одном сиде даёт одинаковый порядок — это и есть «та же доска»', () => {
    const src = Array.from({ length: 40 }, (_, i) => i);
    const a = seededShuffle(src, makeRng('лагуна-агат-55'));
    const b = seededShuffle(src, makeRng('лагуна-агат-55'));
    expect(a).toEqual(b);
  });

  it('перемешивает, а не возвращает исходное', () => {
    const src = Array.from({ length: 40 }, (_, i) => i);
    expect(seededShuffle(src, makeRng('бриз-фьорд-19'))).not.toEqual(src);
  });

  it('ничего не теряет и не дублирует', () => {
    const src = Array.from({ length: 40 }, (_, i) => i);
    const out = seededShuffle(src, makeRng('нефрит-кварц-73'));
    expect([...out].sort((x, y) => x - y)).toEqual(src);
  });

  it('исходный массив не портится', () => {
    const src = [1, 2, 3, 4, 5];
    seededShuffle(src, makeRng('вереск-сокол-20'));
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('приведение введённого', () => {
  it.each([
    ['Кедр-Муссон-47', 'кедр-муссон-47'],
    ['кедр муссон 47', 'кедр-муссон-47'],
    ['  КЕДР--МУССОН--47  ', 'кедр-муссон-47'],
    ['кедр_муссон_47', 'кедр-муссон-47'],
  ])('«%s» приводится к «%s»', (input, want) => {
    expect(normalizeSeed(input)).toBe(want);
  });

  it('после приведения разные записи дают ОДНУ доску', () => {
    const one = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], makeRng(normalizeSeed('Кедр Муссон 47')));
    const two = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], makeRng(normalizeSeed('кедр-муссон-47')));
    expect(one).toEqual(two);
  });
});

describe('читаемый сид', () => {
  it('вид «слово-слово-число», без пробелов', () => {
    const s = makeReadableSeed(makeRng('источник'));
    expect(s).toMatch(/^[а-яё]+-[а-яё]+-\d{2}$/);
  });

  it('сам себе тождествен после приведения — иначе диктовать бесполезно', () => {
    for (let i = 0; i < 20; i++) {
      const s = makeReadableSeed(makeRng(`сид${i}`));
      expect(normalizeSeed(s)).toBe(s);
    }
  });
});

describe('сид воспроизводит доски мега-боссов', () => {
  it('самурай: один сид — та же доска целиком', () => {
    const a = generateSamurai(45, 'кедр-муссон-47');
    const b = generateSamurai(45, 'кедр-муссон-47');
    expect(a.solution).toEqual(b.solution);
    expect(a.puzzle).toEqual(b.puzzle);   // и выкалывание тоже, иначе воспроизводится половина
  });

  it('самурай: разные сиды — разные доски', () => {
    const a = generateSamurai(45, 'сокол-риф-12');
    const b = generateSamurai(45, 'сокол-риф-13');
    expect(a.solution).not.toEqual(b.solution);
  });

  it('фрактал: один сид — тот же корень и те же дочерние', () => {
    const a = generateFractal(8, 'дюна-иней-88');
    const b = generateFractal(8, 'дюна-иней-88');
    expect(a.root).toEqual(b.root);
    expect(a.children).toEqual(b.children);
  });

  it('без сида доски разные — случайность не потерялась', () => {
    expect(generateSamurai(45).solution).not.toEqual(generateSamurai(45).solution);
  });
});
