/**
 * ИГРА И ЕЁ ОПИСАНИЕ ГОВОРЯТ ОДНО И ТО ЖЕ. И ТРИ ЗВЕЗДЫ ДОСТИЖИМЫ.
 *
 * ЗАЧЕМ. Разбор кода 19.08.2026 нашёл три расхождения между тем, что игра
 * делает, и тем, что она обещает или показывает:
 *
 * 1. Справка описывала ДРУГУЮ игру: «тапни стопку — возьмёшь верхний товар»,
 *    «за передним товаром прячутся другие», «комбо ×2, ×3». Ни стопок, ни
 *    скрытия, ни множителя в коде нет. Текст был переведён на 12 языков, то
 *    есть враньё доехало до всех.
 * 2. Три звезды на уровнях 1–8 были НЕДОСТИЖИМЫ: порог считался как
 *    `moves <= moveLimit * 0.6`, а лимит ходов включается только с девятого
 *    уровня и до него равен нулю. Человек проходил идеально и получал две.
 * 3. Счётчик ходов в шапке и расчёт звёзд звали levelCfg БЕЗ признака узкого
 *    экрана, а проверка провала — с ним. На телефоне это разные сетки (3×6=18
 *    ниш против 4×4=16), разные `types`, разный лимит: игрок видел в шапке
 *    один предел, а проваливался по другому.
 */
// Лист без React: 14 мс против 3298 мс у экрана (замер 06.09.2026).
import { moveReference, REF_PER_TYPE } from '@/src/games/goods-sort/core/level';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const read = (r: string) => readFileSync(join(__dirname, '../..', r), 'utf8') as string;

const game = read('app/games/goods-sort.tsx');
const dict = read('src/contexts/LanguageContext.tsx');

describe('сортировка: обещание совпадает с игрой', () => {
  /** Механики, которых в коде нет — значит и в справке им не место. */
  it('справка не обещает механик, которых нет', () => {
    const intro = dict.slice(dict.indexOf('goodsSortIntroDesc'), dict.indexOf('skillPlanningWM'));
    const lies: string[] = [];
    if (/стопк|stack/i.test(intro)) lies.push('обещает стопки, а у нас ниши');
    if (/прячут|hide behind|скрыт/i.test(intro)) lies.push('обещает скрытые товары, их нет');
    if (/×2|×3|комбо|combo/i.test(intro)) lies.push('обещает множитель комбо, его нет');
    expect(lies).toEqual([]);
  });

  /** Если скрытые слои когда-нибудь появятся — этот тест напомнит обновить текст. */
  it('скрытых слоёв в коде действительно нет (иначе справку пора дополнить)', () => {
    expect(game).not.toMatch(/hiddenLayer|backRow|скрытый ряд/);
  });
});

describe('сортировка: звёзды и лимит честные', () => {
  /**
   * 🔴 ПРОВЕРЯЕМ ИСПОЛНЕНИЕМ, А НЕ СОВПАДЕНИЕМ СТРОКИ.
   *
   * Прежняя редакция сверяла ТЕКСТ формулы эталона с образцом. Такая проверка
   * ловит форму записи, а не поведение: переставь скобки — покраснеет на верном
   * коде; поменяй множитель на 9 — останется зелёной, потому что имя `REF_PER_TYPE`
   * в строке никуда не делось. `moveReference` — обычная чистая функция, её
   * можно просто ВЫЗВАТЬ, и тогда проверяется то, что игра действительно считает.
   */
  it('🔴 эталон ходов считается от лимита, а без лимита — от числа видов', () => {
    // Есть лимит — эталон равен ему, и число видов на это не влияет.
    expect(moveReference({ moveLimit: 17, types: 5 })).toBe(17);
    expect(moveReference({ moveLimit: 17, types: 9 })).toBe(17);
    // Лимита нет — эталон от видов, с калиброванным множителем.
    expect(moveReference({ moveLimit: 0, types: 5 })).toBe(Math.round(5 * REF_PER_TYPE));
    expect(moveReference({ moveLimit: 0, types: 9 })).toBe(Math.round(9 * REF_PER_TYPE));
    // И он РАСТЁТ с числом видов — иначе «эталон» ничего не меряет.
    expect(moveReference({ moveLimit: 0, types: 9 })).toBeGreaterThan(moveReference({ moveLimit: 0, types: 5 }));
    /**
     * ⚠️ Множитель больше не тройка: замер A* 02.09.2026 показал, что прикидка
     * `types × 3` завышала минимум на треть и три звезды были недостижимы на
     * 95 % досок. Держим его в коридоре замера, а не сверяем строку.
     */
    expect(REF_PER_TYPE).toBeGreaterThan(1.9);
    expect(REF_PER_TYPE).toBeLessThan(2.6);
    /**
     * ⚠️ Проверяем МЕСТО ПРИМЕНЕНИЯ, а не наличие строки в файле: первая версия
     * этой проверки покраснела на моём же комментарии, где старая формула
     * приведена как объяснение. Гейт, спотыкающийся о собственную документацию,
     * учит стирать документацию.
     */
    const starsProp = game.match(/stars=\{[^}]*\}/g) || [];
    expect(starsProp.some((x) => /starsFor\(/.test(x))).toBe(true);
    expect(starsProp.some((x) => /moveLimit/.test(x))).toBe(false);
  });

  /**
   * 🔴 Все обращения к levelCfg из ЭКРАНА обязаны нести narrowRef: иначе шапка
   * считает по одной сетке, а провал по другой.
   */
  it('ни один вызов levelCfg в экране не забыл про узкий экран', () => {
    /**
     * ⚠️ ФЛАГ МОЖНО НЕ ТОЛЬКО ПОДСТАВИТЬ, НО И ПРОБРОСИТЬ. 22.08.2026 раздача
     * доски вынесена в общую функцию `dealBoard(L, pool, narrow)`, которая берёт
     * флаг параметром и передаёт дальше — она его НЕ забывает. Прежняя редакция
     * требовала буквального `narrowRef.current` в каждом вызове и покраснела на
     * правильной правке. Проверяем смысл: флаг либо подставлен, либо проброшен —
     * и `dealBoard` в экране обязана зваться с `narrowRef.current`.
     */
    const bad: string[] = [];
    for (const m of game.matchAll(/levelCfg\(([^)]*)\)/g)) {
      const args = m[1];
      if (args.startsWith('L: number')) continue;          // само объявление
      if (/narrowRef\.current/.test(args)) continue;       // подставлен на месте
      if (/\bnarrow\b/.test(args)) continue;               // проброшен параметром
      bad.push(`levelCfg(${args})`);
    }
    expect(bad).toEqual([]);

    // И сама общая раздача обязана получать живой флаг, а не значение по умолчанию.
    for (const m of game.matchAll(/dealBoard\(([^)]*)\)/g)) {
      const args = m[1];
      if (args.startsWith('L: number')) continue;
      expect(`dealBoard(${args})`).toMatch(/narrowRef\.current/);
    }
  });
});
