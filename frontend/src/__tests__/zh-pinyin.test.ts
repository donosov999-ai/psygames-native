/**
 * ПИНЬИНЬ И ТОНЫ ДЛЯ КИТАЙСКОГО (задача b8ea8ac8).
 *
 * Замер 03.09.2026: китайский в приложении был только иероглифами, из-за чего
 * аудио-часть «Полиглота» для zh мертва. Словарь собирается из HSK 3.0
 * (`scripts/build-zh-pinyin.mjs`), и главный риск здесь — не отсутствие данных, а
 * ТИХО НЕВЕРНЫЕ ТОНЫ: пиньинь на экране выглядит правильным при любом разрезании
 * слогов, а тон при этом уезжает.
 *
 * Ровно это и случилось: первая редакция резала `sān` на «sā» + «n», и 55 слов из
 * 189 получили лишний тон. Поэтому главная проверка здесь — ИНВАРИАНТ, а не
 * список значений: у китайского один иероглиф = один слог.
 */
import { ZH_PINYIN, ZH_PINYIN_COUNT } from '@/src/constants/zhPinyin.generated';
import { ZH_TONE_BANK, ZH_TONE_BANK_COUNT } from '@/src/constants/zhToneBank.generated';
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';
import { SOURCES, CREDIT_REQUIRED } from '@/src/constants/sources';

describe('словарь пиньиня', () => {
  it('🔴 тонов ровно столько же, сколько иероглифов — иначе тон уехал молча', () => {
    const плохие = Object.values(ZH_PINYIN)
      .filter((з) => [...з.zh].length !== з.tones.length)
      .map((з) => `${з.zh} → ${з.pinyin} ${JSON.stringify(з.tones)}`);
    expect(плохие).toEqual([]);
  });

  it('покрывает КАЖДОЕ китайское слово словаря переводов — ради него всё и делалось', () => {
    const непокрытые = TRANSLATION_VOCAB
      .map((с) => (с as { zh?: string }).zh)
      .filter((zh): zh is string => !!zh)
      .filter((zh) => !ZH_PINYIN[zh]);
    expect(непокрытые).toEqual([]);
  });

  it('тоны только 1–5 и пиньинь непустой', () => {
    for (const з of Object.values(ZH_PINYIN)) {
      expect(з.pinyin.length).toBeGreaterThan(0);
      for (const т of з.tones) expect([1, 2, 3, 4, 5]).toContain(т);
    }
  });

  /**
   * Замеренные вручную значения. Взяты слова, на которых ломалось разрезание:
   * коды -n/-ng, нейтральный второй слог, удвоение родства.
   */
  it.each([
    ['三', 'sān', [1]],
    ['今天', 'jīntiān', [1, 1]],
    ['公园', 'gōngyuán', [1, 2]],
    ['石头', 'shítou', [2, 5]],
    ['妈妈', 'māma', [1, 5]],
    ['你好', 'nǐhǎo', [3, 3]],
  ])('%s = %s %j', (zh, pinyin, tones) => {
    expect(ZH_PINYIN[zh as string]?.pinyin).toBe(pinyin);
    expect(ZH_PINYIN[zh as string]?.tones).toEqual(tones);
  });

  it('составленное нами помечено честно — источник не отвечает за наш вывод', () => {
    const собранные = Object.values(ZH_PINYIN).filter((з) => з.composed).map((з) => з.zh);
    // 妈妈/爸爸/哥哥/姐姐 нашлись в источнике вариантами через «|», собирать пришлось
    // только то, чего в HSK нет вовсе.
    expect(собранные.length).toBeGreaterThan(0);
    expect(собранные.length).toBeLessThan(10);
    expect(собранные).toContain('奶酪');
  });

  it('словарь непустой и счётчик не врёт', () => {
    expect(Object.keys(ZH_PINYIN)).toHaveLength(ZH_PINYIN_COUNT);
    expect(ZH_PINYIN_COUNT).toBeGreaterThan(150);
  });
});

describe('банк тонов для упражнения', () => {
  it('в каждом тоне достаточно слогов, чтобы задание не повторялось', () => {
    for (const тон of [1, 2, 3, 4] as const) {
      expect(ZH_TONE_BANK[тон].length).toBeGreaterThanOrEqual(40);
    }
  });

  it('каждый слог банка ДЕЙСТВИТЕЛЬНО своего тона — иначе упражнение учит неправильному', () => {
    const знаки: Record<number, string> = {
      1: 'āēīōūǖ', 2: 'áéíóúǘ', 3: 'ǎěǐǒǔǚ', 4: 'àèìòùǜ',
    };
    for (const тон of [1, 2, 3, 4] as const) {
      const чужие = ZH_TONE_BANK[тон].filter((с) => ![...с.pinyin].some((б) => знаки[тон].includes(б)));
      expect(`тон ${тон}: ${чужие.map((с) => s(с)).join(' ')}`).toBe(`тон ${тон}: `);
    }
    function s(с: { zh: string; pinyin: string }) { return `${с.zh}/${с.pinyin}`; }
  });

  it('слоги односложные и не повторяются по звучанию', () => {
    for (const тон of [1, 2, 3, 4] as const) {
      const звуки = ZH_TONE_BANK[тон].map((с) => с.pinyin);
      expect(new Set(звуки).size).toBe(звуки.length);
      for (const с of ZH_TONE_BANK[тон]) expect([...с.zh]).toHaveLength(1);
    }
  });

  it('счётчик банка не врёт', () => {
    const всего = ([1, 2, 3, 4] as const).reduce((с, т) => с + ZH_TONE_BANK[т].length, 0);
    expect(всего).toBe(ZH_TONE_BANK_COUNT);
  });
});

/**
 * ЭКРАН «ИСТОЧНИКИ» — ЛИЦЕНЗИЯ ОБЯЗАНА БЫТЬ ВИДНА ЧЕЛОВЕКУ.
 *
 * Замер 04.09.2026: уведомление BSD-3 о шахматных фигурах (`CHESS_PIECES_NOTICE`)
 * существовало константой с 2.37.5 и НИ РАЗУ не показывалось — требование
 * лицензии выглядело выполненным, а выполнено не было. Гейт проверяет, что
 * каждая запись доезжает до экрана, а не лежит в файле.
 */
/**
 * ⚠️ Файлы читаем через `require`, а НЕ импортом из 'fs'. Гейт типов в CI гоняет
 * свой tsconfig без типов node, и `import { readFileSync } from 'fs'` роняет его
 * с TS2591 — при том, что локальный `tsc --noEmit` молчит. Та же запись, что в
 * `fab-clearance.test.ts` и соседях.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

describe('источники и лицензии', () => {
  const экран = readFileSync(join(__dirname, '../../app/sources.tsx'), 'utf8');
  const словарь = readFileSync(join(__dirname, '../contexts/LanguageContext.tsx'), 'utf8');

  it('у каждого источника есть лицензия, ссылка и ключ описания в словаре', () => {
    expect(SOURCES.length).toBeGreaterThan(0);
    for (const и of SOURCES) {
      expect(и.name.length).toBeGreaterThan(2);
      expect(и.url).toMatch(/^https:\/\//);
      expect(и.license.length).toBeGreaterThan(1);
      // Описание живёт в словаре, а не парой ru/en на экране: иначе оно не
      // доедет до остальных десяти языков (гейт screen-language-fallback).
      expect(и.key.length).toBeGreaterThan(3);
      expect(словарь).toContain(`  ${и.key}:`);
    }
  });

  it('🔴 где лицензия требует авторства — оно указано', () => {
    const без = SOURCES.filter((и) => CREDIT_REQUIRED.includes(и.license) && !и.credit).map((и) => и.name);
    expect(без).toEqual([]);
  });

  it('экран РИСУЕТ поля, а не просто импортирует список', () => {
    for (const поле of ['и.name', 'и.license', 'и.url']) expect(экран).toContain(поле);
    expect(экран).toContain('SOURCES.map');
  });

  it('китайский словарь и шахматные фигуры указаны поимённо', () => {
    const имена = SOURCES.map((и) => и.name).join(' | ');
    expect(имена).toMatch(/hsk30/i);
    expect(имена).toMatch(/Cburnett/i);
  });
});
