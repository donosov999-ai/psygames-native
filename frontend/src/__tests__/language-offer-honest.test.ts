/* psygames-language-offer-honest · VER 2 · 09.09.2026 */
/**
 * ПРЕДЛАГАЕМ ТОЛЬКО ТЕ ЯЗЫКИ, НА КОТОРЫХ ИГРА ПРАВДА РАБОТАЕТ.
 *
 * 🔴 ЧТО БЫЛО. Шесть словесных игр строили выбор языка из всех двенадцати
 * языков приложения, а словарь покрывает семь. Для французского, итальянского,
 * японского, корейского и арабского слов НЕТ — игра запускалась и оказывалась
 * пустой: «выбери 1-е из 0». В зарядке это хуже всего: экран остаётся мёртвым
 * навсегда, без шапки и без «назад», выйти нечем.
 *
 * 🔴 И ВТОРАЯ ДЫРА ПОД ПЕРВОЙ. У «Лексического решения» ограничение ещё уже:
 * подмена буквы опирается на таблицы гласных и согласных, а их пять, не семь.
 * Для хинди таблица `undefined`, и экран падает.
 *
 * ⚠️ СПИСКИ ВЫЧИСЛЯЮТСЯ ИЗ САМИХ ДАННЫХ, а не вписаны руками. Вписанный
 * разъедется с первым же добавленным языком, и заметит это опять игрок.
 *
 * ★ 09.09.2026 · VER 2. НЕХВАТКА ЗАКРЫТА: словарь дорос до всех двенадцати
 * языков, `fr it ja ko ar` больше не пустые. Две проверки этого набора
 * закрепляли ТОГДАШНЕЕ СОСТОЯНИЕ как правило — «языков со словарём меньше
 * двенадцати» и «fr отвечает false» — и после починки требовали вернуть дефект.
 * Переписаны так, чтобы проверять МЕХАНИЗМ на подставных данных: предикат
 * обязан отвечать «нет» языку, которого в словаре нет, независимо от того,
 * сколько языков в словаре сегодня. Полноту покрытия сторожит отдельный набор
 * `vocab-covers-every-interface`.
 */
import { VOCAB_LANGS, hasVocab, vocabLangsOf, TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import {
  PSEUDOWORD_LANGS, hasPseudowords, generatePseudowords, producesPseudowords,
} from '@/src/services/pseudowords';
import { LANGUAGES } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(m: string): any;
const read = (rel: string): string => require('fs').readFileSync(
  require('path').join(__dirname, rel), 'utf8',
) as string;
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('список языков выведен из данных', () => {
  it('🔴 у каждого объявленного языка слово есть в КАЖДОЙ записи', () => {
    const bad: string[] = [];
    for (const lang of VOCAB_LANGS) {
      const missing = TRANSLATION_VOCAB.filter((e) => !e[lang]).length;
      if (missing > 0) bad.push(`${lang}: нет слова в ${missing} записях`);
    }
    expect(bad).toEqual([]);
  });

  /**
   * 🔴 ПОЛОВИНЧАТО ДОБАВЛЕННЫЙ ЯЗЫК ОБЯЗАН НЕ ПОПАСТЬ В СПИСОК. Это и есть
   * смысл вывода: если завтра кто-то допишет французский в первые двадцать
   * записей и забудет остальные, игра НЕ должна его предлагать. Проверяем
   * подставным словарём, а не текущими данными — на них разницы не видно.
   */
  it('🔴 язык, добавленный не во все записи, в список не попадает', () => {
    const half: Record<string, string>[] = [
      { en: 'a', ru: 'а', fr: 'a' },
      { en: 'b', ru: 'б' },              // французского здесь нет
    ];
    expect(vocabLangsOf(half).sort()).toEqual(['en', 'ru']);
  });

  it('язык, добавленный ВЕЗДЕ, в список попадает', () => {
    const full: Record<string, string>[] = [{ en: 'a', ru: 'а', fr: 'a' }, { en: 'b', ru: 'б', fr: 'b' }];
    expect(vocabLangsOf(full).sort()).toEqual(['en', 'fr', 'ru']);
  });

  it('пустая строка языком не считается', () => {
    expect(vocabLangsOf([{ en: 'a', ru: '' }])).toEqual(['en']);
  });

  it('словарных языков не больше, чем языков приложения, и все они настоящие', () => {
    const коды = (LANGUAGES as { code: string }[]).map((l) => l.code);
    expect(VOCAB_LANGS.length).toBeGreaterThanOrEqual(5);
    expect(VOCAB_LANGS.length).toBeLessThanOrEqual(коды.length);
    expect(VOCAB_LANGS.filter((l) => !коды.includes(l))).toEqual([]);
  });

  /**
   * 🔴 ПРОВЕРЯЕТСЯ ПРЕДИКАТ, А НЕ СЕГОДНЯШНИЕ ДАННЫЕ. До 09.09.2026 здесь стояли
   * `fr it ja ko ar` — те, у кого словаря тогда не было. Как только словарь
   * дорос, проверка стала требовать вернуть нехватку. Теперь берётся язык,
   * которого в словаре нет ЗАВЕДОМО и не будет: он обязан получить «нет».
   */
  it('🔴 язык, которого в словаре нет, честно отвечает «нет»', () => {
    expect(`выдуманный: ${hasVocab('xx-нет-такого')}`).toBe('выдуманный: false');
    expect(`пустой код: ${hasVocab('')}`).toBe('пустой код: false');
    const урезанный = TRANSLATION_VOCAB.map(({ en, ru }) => ({ en, ru }));
    expect(vocabLangsOf(урезанный).includes('fr')).toBe(false);
    expect(vocabLangsOf(урезанный).sort()).toEqual(['en', 'ru']);
  });

  it('русский и английский на месте', () => {
    expect(hasVocab('ru')).toBe(true);
    expect(hasVocab('en')).toBe(true);
  });
});

describe('🔴 псевдослова строятся не на всех языках словаря', () => {
  it('их список УЖЕ словарного — и это не ошибка, а другая нехватка', () => {
    expect(PSEUDOWORD_LANGS.length).toBeLessThanOrEqual(VOCAB_LANGS.length);
  });

  it('для каждого объявленного языка псевдослова правда строятся', () => {
    const bad: string[] = [];
    for (const lang of PSEUDOWORD_LANGS) {
      try {
        const w = generatePseudowords(lang, 5);
        if (w.length === 0) bad.push(`${lang}: пусто`);
      } catch (e) { bad.push(`${lang}: упало — ${String(e).slice(0, 40)}`); }
    }
    expect(bad).toEqual([]);
  });

  it('язык, на котором ничего не выходит, честно отвечает «нет»', () => {
    expect(hasPseudowords('fr')).toBe(false);
  });

  /**
   * 🔴 СМЫСЛ ОТБОРА — ИМЕННО В ПРОВЕРКЕ РЕЗУЛЬТАТА. Сегодня все языки словаря
   * выдают псевдослова, поэтому отбор ничего не отсекает и его легко снять «как
   * лишний». Здесь проверяется САМ признак: язык без слов обязан отвечать «нет».
   */
  it('признак отбора смотрит на результат, а не пропускает всех', () => {
    expect(producesPseudowords('fr')).toBe(false);      // слов нет вовсе
    expect(producesPseudowords('не-язык')).toBe(false);
    expect(producesPseudowords('ru')).toBe(true);
  });

  /**
   * ⚠️ ЗДЕСЬ Я ЕДВА НЕ СДЕЛАЛ ХУЖЕ. Первая редакция выводила список из таблиц
   * гласных и согласных — их пять, — и хинди из выбора ПРОПАЛ, хотя на нём
   * псевдослова строятся: у него свой путь. Проверка исполнением это показала.
   */
  it('🔴 хинди остаётся — на нём псевдослова правда строятся', () => {
    expect(hasPseudowords('hi')).toBe(true);
    expect(generatePseudowords('hi', 5).length).toBeGreaterThan(0);
  });
});

describe('🔴 экраны спрашивают именно свой список', () => {
  const screens = ['listening-span', 'word-pairs', 'semantic-sort', 'cloze', 'vocab-srs'];

  it.each(screens)('%s предлагает только языки со словарём', (name) => {
    const src = code(read(`../../app/games/${name}.tsx`));
    expect(src).toMatch(/hasVocab\(l\.code\)/);
  });

  it('«Лексическое решение» спрашивает СВОЙ, более узкий список', () => {
    const src = code(read('../../app/games/lexical-decision.tsx'));
    expect(src).toMatch(/hasPseudowords\(l\.code\)/);
    expect(src).not.toMatch(/hasVocab\(l\.code\)/);
  });

  it('забытый язык без словаря не воскрешается из сохранённого выбора', () => {
    const src = code(read('../../app/games/listening-span.tsx'));
    expect(src).toMatch(/hasVocab\(v\)/);
    expect(src).not.toMatch(/LANGUAGES\.some\(\(l\) => l\.code === v\)/);
  });
});
