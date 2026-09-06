/* psygames-mahjong-deal-seeded · VER 1 · 07.09.2026 */
/**
 * 🔴 ЗАМЕР МАДЖОНГА ОБЯЗАН БЫТЬ ВОСПРОИЗВОДИМЫМ.
 *
 * ЧТО ЛОМАЛОСЬ. `dealSolvable` четвёртым параметром берёт `Math.random` по
 * умолчанию (`vendor/solvable.ts:136`). Для ИГРЫ это правильно: перетасовка
 * обязана быть разной. Для ЗАМЕРА — нет: каждая перетасовка внутри прогона
 * становится случайной, и одно и то же измерение выдаёт разные числа.
 *
 * Замер 06.09.2026, шесть повторов ОДНОГО И ТОГО ЖЕ прогона (30 партий,
 * случайная игра, доля вставших насмерть):
 *     без сеятеля  L28 17 27 20 17 13 17 %   ·  L40 43 33 20 23 30 23 %
 *     с сеятелем   L28 17 17 17 17 17 17 %   ·  L40 23 23 23 23 23 23 %
 *
 * 🔴 ЦЕНА ЭТОГО БЫЛА НЕ ТЕОРЕТИЧЕСКОЙ. Три замера одной величины разошлись
 * втрое и жили рядом, каждый считаясь верным: ТЗ §4.1 давало L28 60 %, шапка
 * `stuck.ts` — L40 26 %, мой прогон — L40 23 %. На цифре 60 % стояло решение
 * «записывать ли проигрыш» (задача 8543237a). Спор о числе шёл, пока никто не
 * спросил, воспроизводится ли оно вообще.
 *
 * ⚠️ ПОЧЕМУ ЭТО НЕ ЛОВИЛОСЬ. У `mahjong-stuck-exit` пороги стоят «≥ 1» — они
 * про достижимость состояния, а не про долю. Шаткость была, а сигнала не было:
 * файл называл себя воспроизводимым, будучи таким наполовину.
 */
import { generateDeal, SYMBOLS } from '@/app/games/mahjong';
import { type Tile } from '@/src/games/mahjong/board';
import { layoutForLevel } from '@/src/games/mahjong/layouts';
import { silhouetteForLevel } from '@/src/games/mahjong/silhouettes';
import { mahjongLevel } from '@/src/services/mahjongLevels';
import { dealSolvable } from '@/src/games/mahjong/vendor/solvable';

declare const __dirname: string;
declare function require(m: string): any;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Настоящая доска 15-го уровня — не выдуманный набор мест. */
function доска(): { x: number; y: number; layer: number }[] {
  const p = mahjongLevel(15);
  const tiles: Tile[] = generateDeal(
    p.layers, p.pairs, p.cols, silhouetteForLevel(15), layoutForLevel(15)?.places, rng(1),
  ).tiles;
  return tiles.map((t) => ({ x: t.x, y: t.y, layer: t.layer }));
}

const символы = (d: { tiles: Tile[] }) => d.tiles.map((t) => t.symbol).join(',');

describe('🔴 раздача маджонга: сеятель решает, воспроизводим ли замер', () => {
  const места = доска();

  it('есть что проверять: БЕЗ сеятеля две подряд раздачи РАЗНЫЕ', () => {
    // Если это перестанет быть правдой, весь гейт ниже зелен вслепую — и узнать
    // об этом надо здесь. 144 плитки: совпадение двух раздач практически
    // невозможно, но проверяется, а не предполагается.
    const a = символы(dealSolvable(места, SYMBOLS.length, 20));
    const b = символы(dealSolvable(места, SYMBOLS.length, 20));
    expect(a).not.toBe(b);
  });

  it('🔴 С сеятелем две раздачи побайтно одинаковы', () => {
    const a = символы(dealSolvable(места, SYMBOLS.length, 20, rng(42)));
    const b = символы(dealSolvable(места, SYMBOLS.length, 20, rng(42)));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);          // раздача не пустая, иначе сравнивали бы пустоту
  });

  it('🔴 разные зёрна дают разные раздачи — сеятель не игнорируется', () => {
    // Без этой строки «одинаково» проходило бы и в случае, когда четвёртый
    // параметр молча не используется вовсе.
    expect(символы(dealSolvable(места, SYMBOLS.length, 20, rng(1))))
      .not.toBe(символы(dealSolvable(места, SYMBOLS.length, 20, rng(2))));
  });
});

describe('проводка: ни одна проба маджонга не меряет шум', () => {
  /**
   * ⚠️ ЭТО ПРОВЕРКА ИСХОДНИКА, И Я НАЗЫВАЮ ЕЁ СВОИМ ИМЕНЕМ. Поведение выше
   * доказывает, ЧТО бывает без сеятеля; но выполнить правило за автора будущей
   * пробы поведение не может — вызов без четвёртого аргумента просто тихо
   * возьмёт `Math.random`, и проба станет мерить шум, оставаясь зелёной.
   *
   * 🚫 ДВА ФАЙЛА ВЫВЕДЕНЫ ИЗ-ПОД ПРАВИЛА ЯВНО, а не пропущены молча. Оба зовут
   * раздатчик без сеятеля НАМЕРЕННО, потому что их работа — показать разницу:
   *   · `mahjong-run-variance-probe` меряет разброс прогона;
   *   · этот файл — его строка «есть что проверять: БЕЗ сеятеля две подряд
   *     раздачи РАЗНЫЕ» и есть та самая демонстрация.
   * ⚠️ Первый прогон гейта поймал ровно их — и это правильное поведение, а не
   * поломка: правило работает. Исключения названы поимённо и ниже проверяются
   * на подлинность, чтобы список нельзя было расширить опечаткой.
   */
  const ИСКЛЮЧЕНИЯ: Record<string, RegExp> = {
    'mahjong-run-variance-probe.test.ts': /сеятьТасовку/,
    'mahjong-deal-seeded.test.ts': /есть что проверять: БЕЗ сеятеля/,
  };

  it('🔴 каждый вызов dealSolvable в пробах маджонга подаёт сеятель', () => {
    const fs = require('fs');
    const path = require('path');
    const файлы: string[] = fs.readdirSync(__dirname)
      .filter((f: string) => /^mahjong.*\.test\.ts$/.test(f) && !(f in ИСКЛЮЧЕНИЯ));
    expect(файлы.length).toBeGreaterThan(1);      // список не должен схлопнуться в ноль

    const голые: string[] = [];
    for (const f of файлы) {
      const текст: string = fs.readFileSync(path.join(__dirname, f), 'utf8');
      // Вызов с тремя аргументами: до закрывающей скобки нет ни одной запятой
      // после третьего параметра. Достаточно, потому что аргументы здесь простые.
      for (const m of текст.matchAll(/dealSolvable\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
        const аргументов = (m[1] as string).split(',').length;
        if (аргументов < 4) голые.push(`${f}: dealSolvable(${(m[1] as string).slice(0, 60)}) — ${аргументов} аргумента`);
      }
    }
    expect(голые).toEqual([]);
  });

  it('🔴 каждое исключение существует и правда демонстрирует разницу', () => {
    // Иначе в список можно вписать что угодно и вывести файл из-под правила
    // опечаткой. Проверяется и наличие файла, и что он про то, о чём заявлен.
    const fs = require('fs');
    const path = require('path');
    const врут: string[] = [];
    for (const [файл, признак] of Object.entries(ИСКЛЮЧЕНИЯ)) {
      const полный = path.join(__dirname, файл);
      if (!fs.existsSync(полный)) { врут.push(`${файл}: файла нет`); continue; }
      if (!признак.test(fs.readFileSync(полный, 'utf8'))) врут.push(`${файл}: не содержит ${признак}`);
    }
    expect(врут).toEqual([]);
  });
});
