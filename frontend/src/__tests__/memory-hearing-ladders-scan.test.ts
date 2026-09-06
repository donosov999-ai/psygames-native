/**
 * 📍 ЗАМЕР ЛЕСТНИЦ РАЗДЕЛА «ПАМЯТЬ И СЛУХ» — ПРОГОНОМ ВСЕХ ПЯТНАДЦАТИ УРОВНЕЙ.
 *
 * Правило §4 CHATS_RULES: лестницу проверяют прогоном всех уровней, а не
 * сравнением первого с последним — ломается она на стыке участков. Эта проба
 * прогоняет уровневые функции игр раздела и НАЗЫВАЕТ ЧИСЛОМ уровень, с которого
 * параметры перестают меняться, то есть где кончается рост.
 *
 * ⚠️ Проба не выносит приговор «плато = плохо»: у ступенчатых игр верхний
 * участок может быть задуман. Её дело — не дать плато остаться незамеченным,
 * как это было с «Соедини точки», где 34 уровня выглядели растущими, а на 25-м
 * медиана оказалась нулём.
 */
import { levelParams as wordPairsLevel } from '@/app/games/word-pairs';
import { levelParams as echoLevel } from '@/app/games/pseudoword-echo';
import { dictationLevelParams } from '@/src/games/dictation/core/phrases';
import { generateMemoryPalaceRound, memoryPalaceLociCountForLevel } from '@/src/games/memory-palace/core';
import { levelParams as mnemonicsLevel } from '@/app/games/mnemonics';
import { levelParams as phonemeLevel } from '@/app/games/phoneme-pairs';
import { levelParams as tonesLevel } from '@/app/games/chinese-tones';
import { noiseGainFor } from '@/src/services/noise';
import { generateFacesNamesPuzzle } from '@/src/games/faces-names/core/generator';
import { LEVELS as FACES_LEVELS } from '@/src/games/faces-names/core/types';

const УРОВНИ = 15;
/**
 * 📍 Замер 06.09.2026 прогоном всех 33 уровней «Лиц и имён»: подпись партии
 * (число изученных людей, проб, помех, режимы, difficulty) перестаёт меняться
 * с этого уровня. Число вписано ПОСЛЕ прогона, а не до него.
 */
const ФАКТ_FACES = 33;

/** Уровень, начиная с которого подпись параметров больше не меняется. */
function уровеньПлато(отпечаток: (level: number) => string, всего: number = УРОВНИ): number {
  const строки = Array.from({ length: всего }, (_, i) => отпечаток(i + 1));
  const последняя = строки[всего - 1];
  let первый = всего;
  for (let i = всего - 1; i >= 0; i--) {
    if (строки[i] === последняя) первый = i + 1; else break;
  }
  return первый;
}

describe('Память и слух · где кончается рост трудности', () => {
  it('📍 «Пары слов»: прогон 15 уровней', () => {
    const плато = уровеньПлато((l) => JSON.stringify(wordPairsLevel(l)));
    expect({ игра: 'word-pairs', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'word-pairs', плато_с_уровня: 15, из: УРОВНИ });
  });

  it('📍 «Эхо псевдослов»: прогон 15 уровней', () => {
    const плато = уровеньПлато((l) => JSON.stringify(echoLevel(l)));
    expect({ игра: 'pseudoword-echo', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'pseudoword-echo', плато_с_уровня: 9, из: УРОВНИ });
  });

  /**
   * 📍 «Диктант» ДО правки 07.09.2026: плато с 7-го — менялось одно число,
   * `levelCount` (4/5/6 фраз), и девять уровней из пятнадцати были неотличимы.
   * ПОСЛЕ: четыре оси (объём, темп речи, шум по SNR, задержка перед вводом),
   * подпись меняется на каждом уровне.
   */
  it('📍 «Диктант»: прогон 15 уровней (объём + темп + шум + задержка)', () => {
    const плато = уровеньПлато((l) => {
      const p = dictationLevelParams(l);
      return [p.count, p.rate, p.snrDb, p.delayMs].join('/');
    });
    expect({ игра: 'dictation', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'dictation', плато_с_уровня: 15, из: УРОВНИ });
  });

  /** 🔴 Оси включаются там, где объявлено: шум с 5-го, задержка с 8-го. */
  it('🔴 «Диктант»: шум приходит с 5-го уровня, задержка с 8-го', () => {
    const шум = Array.from({ length: УРОВНИ }, (_, i) => dictationLevelParams(i + 1).snrDb);
    const пауза = Array.from({ length: УРОВНИ }, (_, i) => dictationLevelParams(i + 1).delayMs);
    expect({ тишина_до: шум.findIndex((v) => v !== null) + 1, пауза_с: пауза.findIndex((v) => v > 0) + 1 })
      .toEqual({ тишина_до: 5, пауза_с: 8 });
    // Шум усиливается: SNR падает от уровня к уровню и упирается в 0 дБ, не ниже.
    const снр = шум.slice(4) as number[];
    expect(снр[0]).toBe(18);
    expect(Math.min(...снр)).toBeGreaterThanOrEqual(0);
    expect(снр.every((v, i) => i === 0 || v <= снр[i - 1])).toBe(true);
  });

  /**
   * 🔴 КАЖДАЯ ОСЬ ДЕРЖИТСЯ ОТДЕЛЬНО — иначе потеря одной пройдёт молча.
   *
   * ⚠️ Эта проверка появилась потому, что МУТАЦИЯ ВЫЖИЛА. Вернул темп речи в
   * константу 0,85 — проба «плато 15 из 15» осталась ЗЕЛЁНОЙ: подпись уровня
   * всё равно уникальна за счёт шума и задержки, и лестница по-прежнему растёт.
   * То есть гейт мерил отсутствие плато, а не наличие оси, и ось темпа можно
   * было потерять незаметно. Проверять надо каждую ось по отдельности.
   */
  it('🔴 «Диктант»: темп речи меняется на КАЖДОМ уровне и только убывает', () => {
    const темпы = Array.from({ length: УРОВНИ }, (_, i) => dictationLevelParams(i + 1).rate);
    expect({ различных_темпов: new Set(темпы).size, из: УРОВНИ })
      .toEqual({ различных_темпов: УРОВНИ, из: УРОВНИ });
    expect(темпы.every((v, i) => i === 0 || v < темпы[i - 1])).toBe(true);
    // Границы разумности: медленнее 1.0 речь тянется, быстрее 0.7 рвёт слова.
    expect(темпы[0]).toBeLessThanOrEqual(1);
    expect(темпы[УРОВНИ - 1]).toBeGreaterThanOrEqual(0.7);
  });

  /** 🔴 Задержка растёт, а не включается один раз. */
  it('🔴 «Диктант»: задержка растёт от уровня к уровню', () => {
    const паузы = Array.from({ length: УРОВНИ }, (_, i) => dictationLevelParams(i + 1).delayMs).slice(7);
    expect(паузы.every((v, i) => i === 0 || v >= паузы[i - 1])).toBe(true);
    expect(new Set(паузы).size).toBeGreaterThan(1);
  });

  /** 🔴 Громкость помехи считается из SNR, а не на глаз. */
  it('🔴 громкость шума: 18 дБ едва слышен, 0 дБ вровень с речью', () => {
    expect(noiseGainFor(18)).toBeCloseTo(0.126, 3);
    expect(noiseGainFor(6)).toBeCloseTo(0.501, 3);
    expect(noiseGainFor(0)).toBe(0.9);      // потолок: вровень, но не громче речи
    expect(noiseGainFor(60)).toBeLessThan(0.01);
  });

  it('📍 «Дворец памяти»: прогон 15 уровней (места + лишние предметы + маршрут)', () => {
    const плато = уровеньПлато((l) => {
      const round = generateMemoryPalaceRound('замер-лестницы', l);
      return [memoryPalaceLociCountForLevel(l), round.distractorItems.length, round.difficulty].join('/');
    });
    expect({ игра: 'memory-palace', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'memory-palace', плато_с_уровня: 15, из: УРОВНИ });
  });

  it('📍 «Мнемоника»: прогон 15 уровней', () => {
    const плато = уровеньПлато((l) => JSON.stringify(mnemonicsLevel(l)));
    expect({ игра: 'mnemonics', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'mnemonics', плато_с_уровня: 11, из: УРОВНИ });
  });

  it('📍 «Близкие звуки»: прогон 15 уровней', () => {
    const плато = уровеньПлато((l) => JSON.stringify(phonemeLevel(l)));
    expect({ игра: 'phoneme-pairs', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'phoneme-pairs', плато_с_уровня: 11, из: УРОВНИ });
  });

  it('📍 «Тоны китайского»: прогон 15 уровней', () => {
    const плато = уровеньПлато((l) => JSON.stringify(tonesLevel(l)));
    expect({ игра: 'chinese-tones', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'chinese-tones', плато_с_уровня: 11, из: УРОВНИ });
  });

  it('📍 «Лица и имена»: прогон всех 33 уровней', () => {
    const плато = уровеньПлато((l) => {
      const p = generateFacesNamesPuzzle('замер-лестницы', l);
      return [p.studiedPersonIds.length, p.trials.length, p.interferencePrompts.length,
        p.factRecallEnabled, p.immediateRecall, p.difficulty].join('/');
    }, FACES_LEVELS);
    expect({ игра: 'faces-names', плато_с_уровня: плато, из: FACES_LEVELS })
      .toEqual({ игра: 'faces-names', плато_с_уровня: ФАКТ_FACES, из: FACES_LEVELS });
  });
});
