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
import { levelCount as dictationLevel } from '@/src/games/dictation/core/phrases';
import { generateMemoryPalaceRound, memoryPalaceLociCountForLevel } from '@/src/games/memory-palace/core';
import { levelParams as mnemonicsLevel } from '@/app/games/mnemonics';
import { levelParams as phonemeLevel } from '@/app/games/phoneme-pairs';
import { levelParams as tonesLevel } from '@/app/games/chinese-tones';
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

  it('📍 «Диктант»: прогон 15 уровней', () => {
    const плато = уровеньПлато((l) => String(dictationLevel(l)));
    expect({ игра: 'dictation', плато_с_уровня: плато, из: УРОВНИ })
      .toEqual({ игра: 'dictation', плато_с_уровня: 7, из: УРОВНИ });
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
