/**
 * 🔴 ОДНОЦВЕТНЫЙ УРОВЕНЬ — РАЗЛИЧАТЬ ПО ФОРМЕ ПРИ ПОДАВЛЕННОМ ЦВЕТЕ.
 *
 * В обычной раскладке цвет работает ДО внимания: пару к жёлтой пачке глаз
 * находит периферией, не рассматривая предметы. Подави цвет — и каждого
 * кандидата придётся навести на центр зрения и сравнить по контуру. Задача
 * меняется с «НАЙТИ» на «РАЗЛИЧИТЬ».
 *
 * ⚠️ РЕЖИМОМ УРОВНЯ, А НЕ НАБОРОМ: гейт `goods-sort-setpicker` жёстко требует
 * `alike === ['dairy']`, и требует по делу — два перцептивно трудных набора
 * рядом в выборе для игрока неотличимы.
 *
 * ЗАМЕР ДО ПРАВКИ: одноцветных уровней в игре не было — прогон L1…L60 давал 0.
 */
import {
  MONO_FROM, WARM_FAMILY, monochromeLevel, poolForLevel, GS_RULES,
  strictPlacement, hiddenInfo, movingNiches, TYPES_ON_BOARD_MAX, GOOD_SETS, dealBoard, levelCfg,
} from '@/app/games/goods-sort';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

const LEVELS = Array.from({ length: 80 }, (_, i) => i + 1);
const МИКС = (GOOD_SETS[0] as { pool: number[] }).pool;

describe('одноцветный уровень', () => {
  it('есть что проверять — такие уровни есть, и не все', () => {
    const свои = LEVELS.filter(monochromeLevel);
    expect(свои.length).toBeGreaterThan(2);
    expect(свои.length).toBeLessThan(LEVELS.length / 3);
    expect(Math.min(...свои)).toBe(MONO_FROM);
  });

  /**
   * 🔴 СВОБОДНОЙ ФАЗЫ «РАЗ В ТРИ» НЕ ОСТАЛОСЬ: остаток 0 занят строгой укладкой,
   * 1 — скрытой информацией, 2 — подвижными нишами. Поэтому у режима свой период
   * И явные исключения; проверяем исполнением, а не арифметикой в уме.
   */
  it('🔴 не совпадает ни с одним из трёх других режимов', () => {
    const плохо = LEVELS.filter(monochromeLevel)
      .filter((L) => strictPlacement(L) || hiddenInfo(L) || movingNiches(L))
      .map((L) => `L${L}: одноцветный вместе с ${strictPlacement(L) ? 'строгой укладкой' : hiddenInfo(L) ? 'скрытой информацией' : 'подвижными нишами'}`);
    expect(плохо).toEqual([]);
  });

  it('🔴 тёплой семьи хватает на потолок видов, и она вся из настоящих спрайтов', () => {
    expect(WARM_FAMILY.length).toBeGreaterThanOrEqual(TYPES_ON_BOARD_MAX);
    expect(new Set(WARM_FAMILY).size).toBe(WARM_FAMILY.length);
    // 🔴 Каждый индекс обязан быть в «Миксе»: он показывает всё, что игра вообще
    // рисует, кроме «Молочного». Спрайт вне его — либо бутылка (вторая
    // перцептивная трудность по ДРУГОЙ оси), либо сирота, которого нет ни в одном
    // наборе. И то и другое на одноцветном уровне быть не должно.
    const нет = WARM_FAMILY.filter((i) => !МИКС.includes(i));
    expect(нет).toEqual([]);
    // И ни один не из «Молочного» — это отдельная проверка, а не следствие.
    const молочные = (GOOD_SETS.find((g: any) => g.key === 'dairy') as { pool: number[] }).pool;
    expect(WARM_FAMILY.filter((i) => молочные.includes(i))).toEqual([]);
  });

  it('🔴 на своих уровнях пул подменяется, на остальных остаётся набором игрока', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      const пул = poolForLevel(L, МИКС);
      if (monochromeLevel(L) && пул !== WARM_FAMILY) плохо.push(`L${L}: одноцветный, а пул не тёплый`);
      if (!monochromeLevel(L) && пул !== МИКС) плохо.push(`L${L}: обычный, а пул подменён`);
    }
    expect(плохо).toEqual([]);
  });

  /**
   * 🔴 РАЗДАЧУ РЕЖИМ НЕ МЕНЯЕТ — только пул. Тот же принцип, что у скрытой
   * информации: доска остаётся той же, меняется только то, чем различают.
   * Значит число видов на одноцветном уровне не должно просесть.
   */
  it('🔴 число видов на одноцветном уровне не меньше, чем было бы без режима', () => {
    const плохо: string[] = [];
    for (const L of LEVELS.filter(monochromeLevel)) {
      const сРежимом = levelCfg(L, poolForLevel(L, МИКС).length, false).types;
      const без = levelCfg(L, МИКС.length, false).types;
      if (сРежимом < без) плохо.push(`L${L}: видов ${сРежимом} против ${без} без режима`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 раздача на одноцветном уровне берёт ТОЛЬКО тёплые спрайты', () => {
    const плохо: string[] = [];
    for (const L of LEVELS.filter(monochromeLevel)) {
      const { cells } = dealBoard(L, poolForLevel(L, МИКС), false);
      const чужие = [...new Set(cells.flat())].filter((t) => !WARM_FAMILY.includes(t));
      if (чужие.length) плохо.push(`L${L}: на доске холодные спрайты ${чужие.join(',')}`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 правило заведено с тем же порогом и переведено на двенадцать языков', () => {
    const r = GS_RULES.find((x) => x.key === 'mono');
    expect(r).toBeDefined();
    expect(r!.fromLevel).toBe(MONO_FROM);
    // Порог равен ПЕРВОМУ уровню, где режим включается после всех исключений.
    expect(LEVELS.find(monochromeLevel)).toBe(r!.fromLevel);
    const поля = ['title', 'rule', 'example'];
    const нет: string[] = [];
    const base = read('src/contexts/LanguageContext.tsx');
    for (const f of поля) if (!base.includes(`lr_goods_sort_mono_${f}:`)) нет.push(`base/${f}`);
    for (const loc of ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      const src = read(`src/contexts/translations/${loc}.ts`);
      for (const f of поля) if (!src.includes(`"lr_goods_sort_mono_${f}"`)) нет.push(`${loc}/${f}`);
    }
    expect(нет).toEqual([]);
  });
});
