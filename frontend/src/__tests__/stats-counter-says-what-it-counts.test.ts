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
/**
 * ⚠️ Узловые глобали объявлены руками, а не взяты из @types/node: в tsconfig проб типов
 * node нет, и `import fs from 'fs'` валит tsc (TS2591/TS2304), а с ним и весь CI —
 * после него джобы не идут. Так же сделано в соседних пробах (evening-calm и др.).
 */
declare const __dirname: string;
declare function require(m: string): any;   // eslint-disable-line @typescript-eslint/no-explicit-any
const fs = require('fs');                   // eslint-disable-line @typescript-eslint/no-require-imports
const path = require('path');               // eslint-disable-line @typescript-eslint/no-require-imports

const КОРЕНЬ = path.join(__dirname, '..', '..');
const читать = (п: string) => fs.readFileSync(path.join(КОРЕНЬ, п), 'utf8');

/** Слово про завершённость на каждом языке словаря. */
const ЗАВЕРШЁННОСТЬ: Record<string, RegExp> = {
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
    const с = читать('src/contexts/LanguageContext.tsx');
    const строка = с.match(/gamesPlayed:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(строка).toMatch(/завершённых/);
    expect(строка).toMatch(/completed/i);
  });

  it('🔴 во всех десяти локалях подпись тоже про завершённость', () => {
    const плохие: string[] = [];
    for (const [код, узор] of Object.entries(ЗАВЕРШЁННОСТЬ)) {
      const с = читать(`src/contexts/translations/${код}.ts`);
      const значение = с.match(/"gamesPlayed":\s*"([^"]*)"/)?.[1];
      if (!значение) { плохие.push(`${код}: ключа нет`); continue; }
      if (!узор.test(значение)) плохие.push(`${код}: «${значение}» не говорит о завершённости`);
    }
    expect(плохие).toEqual([]);
  });

  it('🔴 токены и правда начисляются ВНЕ партий — иначе переименование было бы ложью', () => {
    const вне = ['src/services/achievements.ts', 'src/services/dailyGoal.ts',
                 'src/services/abilities.ts', 'src/services/wager.ts'];
    const без = вне.filter((п) => !/addTokens\s*\(/.test(читать(п)));
    expect(без).toEqual([]);
  });
});
