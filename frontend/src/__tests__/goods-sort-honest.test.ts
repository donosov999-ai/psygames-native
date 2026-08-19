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
  it('порог звёзд считается отдельной функцией, а не формулой с нулевым лимитом', () => {
    expect(game).toMatch(/const starsFor = \(L: number, moves: number\): number =>/);
    expect(game).toMatch(/cfg\.moveLimit > 0 \? cfg\.moveLimit : cfg\.types \* 3/);
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
    const bad: string[] = [];
    for (const m of game.matchAll(/levelCfg\(([^)]*)\)/g)) {
      const args = m[1];
      if (args.startsWith('L: number')) continue;          // само объявление
      if (!/narrowRef\.current/.test(args)) bad.push(`levelCfg(${args})`);
    }
    expect(bad).toEqual([]);
  });
});
