/**
 * 🔴 ПОДПИСЬ СЧЁТЧИКА ОБЯЗАНА НАЗЫВАТЬ ТО, ЧТО ОН СЧИТАЕТ.
 *
 * Отзыв с кадром 14.09.2026: экран статистики показывал «сыграно игр 0» рядом с
 * «токенов 15» и «серия 1». Человек читал это как сломанный счётчик.
 * Замер 23.09 показал, что счётчик исправен: он берёт ЗАВЕРШЁННЫЕ сессии из
 * psygames_sessions, а токены начисляются ещё из шести мест БЕЗ партии —
 * achievements.ts, dailyGoal.ts, abilities.ts, wager.ts, компенсация зарядки и
 * бонус уровня. «0 и 15» — законное состояние, врала подпись.
 *
 * Проба держит две вещи разом: подпись говорит про завершённость на ВСЕХ языках,
 * и токены по-прежнему начисляются вне игр (то есть расхождение принципиально
 * возможно, и переименование было не косметикой).
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Слово про завершённость на каждом языке словаря. */
const DONE_WORD: Record<string, RegExp> = {
  de: /abgeschlossen/i,
  es: /completad/i,
  fr: /terminée/i,
  it: /completat/i,
  pt: /concluíd/i,
  ar: /مكتمل/,
  hi: /पूर्ण/,
  ja: /完了/,
  ko: /완료/,
  zh: /已完成/,
};

describe('счётчик статистики называет то, что считает', () => {
  it('🔴 базовый словарь: подпись про завершённые партии, а не просто «сыграно»', () => {
    const src = read('src/contexts/LanguageContext.tsx');
    const entry = src.match(/gamesPlayed:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(entry).toMatch(/завершённых/);
    expect(entry).toMatch(/completed/i);
  });

  it('🔴 во всех десяти локалях подпись тоже про завершённость', () => {
    const bad: string[] = [];
    for (const [loc, pattern] of Object.entries(DONE_WORD)) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      const value = src.match(/"gamesPlayed":\s*"([^"]*)"/)?.[1];
      if (!value) { bad.push(`${loc}: ключа нет`); continue; }
      if (!pattern.test(value)) bad.push(`${loc}: «${value}» не говорит о завершённости`);
    }
    expect(bad).toEqual([]);
  });

  it('🔴 токены и правда начисляются ВНЕ партий — иначе переименование было бы ложью', () => {
    const outsideGames = ['src/services/achievements.ts', 'src/services/dailyGoal.ts',
                          'src/services/abilities.ts', 'src/services/wager.ts'];
    const without = outsideGames.filter((rel) => !/addTokens\s*\(/.test(read(rel)));
    expect(without).toEqual([]);
  });
});
