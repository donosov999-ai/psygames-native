/**
 * ЛЕСТНИЦА ТОРТОВ — прогоняется ЦЕЛИКОМ, а не краями.
 *
 * ⚠️ Сравнение «первый уровень против последнего» уже подводило соседние игры:
 * у филвордов уровни 13…500 выдавали ОДНО И ТО ЖЕ поле при зелёных пробах, у
 * переливалки одиннадцатый оказался на 15 % легче десятого. Ломается на СТЫКЕ,
 * а стык виден только при обходе всех уровней подряд.
 */
import { levelCfg, deal, dealRejected, PLATES_MAX, SPARES_MIN, QUEUE_FROM, solvable } from '@/src/games/cake-sort/core/level';
import { CIRCLE, allSectors, completeIn, makeBoard } from '@/src/games/cake-sort/core/plate';
import { provenUnsolvable, solve } from '@/src/games/cake-sort/core/solver';
import { maxCols, tableLayout, SECTOR_MIN } from '@/src/games/cake-sort/core/layout';

jest.setTimeout(300000);
const LEVELS = Array.from({ length: 60 }, (_, i) => i + 1);

describe('лестница уровней', () => {
  it('есть что проверять — уровни различаются, а не повторяют друг друга', () => {
    const разных = new Set(LEVELS.map((L) => JSON.stringify(levelCfg(L))));
    expect(разных.size).toBeGreaterThanOrEqual(8);
  });

  it('🔴 ни на одном стыке уровень не становится проще предыдущего', () => {
    const откаты: string[] = [];
    for (let L = 2; L <= 60; L += 1) {
      const a = levelCfg(L - 1); const b = levelCfg(L);
      if (b.types < a.types) откаты.push(`L${L}: видов ${b.types} после ${a.types}`);
      // Запас манёвра не должен расти обратно: иначе выше становится ЛЕГЧЕ.
      const запасA = a.plates - a.types; const запасB = b.plates - b.types;
      if (запасB > запасA + 1) откаты.push(`L${L}: запас ${запасB} после ${запасA}`);
    }
    expect(откаты).toEqual([]);
  });

  it('🔴 запас тарелок на манёвр никогда не падает ниже пола', () => {
    const тесно = LEVELS
      .map((L) => ({ L, c: levelCfg(L) }))
      .filter(({ c }) => c.plates - c.types - c.queue < SPARES_MIN)
      .map(({ L, c }) => `L${L}: тарелок ${c.plates}, видов ${c.types}, очередь ${c.queue}`);
    expect(тесно).toEqual([]);
  });

  it('🔴 тарелок не больше, чем читаемо влезает на экран', () => {
    const колонок = maxCols(360);
    expect(колонок).toBe(5);
    expect(tableLayout(360, колонок).sector).toBeGreaterThanOrEqual(SECTOR_MIN);
    const перебор = LEVELS.filter((L) => levelCfg(L).plates > PLATES_MAX).map((L) => `L${L}`);
    expect(перебор).toEqual([]);
    expect(PLATES_MAX).toBeLessThanOrEqual(колонок * 4);
  });

  it('🔴 секторов всегда кратно кругу — иначе останется хвост, который не замкнуть', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      const { board } = deal(L);
      const n = allSectors(board).length;
      if (n % CIRCLE !== 0) плохо.push(`L${L}: секторов ${n}, круг ${CIRCLE}`);
      if (n !== levelCfg(L).types * CIRCLE) плохо.push(`L${L}: секторов ${n} при ${levelCfg(L).types} видах`);
    }
    expect(плохо).toEqual([]);
  });

  it('🔴 раздача не приезжает с готовым кругом — даровых побед нет', () => {
    const даром: string[] = [];
    for (const L of LEVELS) {
      const { board } = deal(L);
      board.plates.forEach((p, i) => { if (completeIn(p) !== null) даром.push(`L${L}: тарелка ${i} уже собрана`); });
      board.queue.forEach((p, i) => { if (completeIn(p) !== null) даром.push(`L${L}: очередь ${i} уже собрана`); });
    }
    expect(даром).toEqual([]);
  });

  /**
   * 🔴 ЕДИНСТВЕННАЯ НАША ОТСТРОЙКА. Бракуем только ДОКАЗАННУЮ нерешаемость:
   * «бюджет кончился» ≠ «нерешаемо», и на этой разнице сортировка товаров
   * однажды теряла полсекунды на старте, пересобирая хорошие столы.
   */
  /**
   * 🔴 ЗДЕСЬ ГАРАНТИЯ СИЛЬНЕЕ, ЧЕМ В СОРТИРОВКЕ ТОВАРОВ, и это замер, а не
   * похвальба. Там на 12–14 нишах ТРИНАДЦАТЬ столов из шестидесяти упираются в
   * бюджет 20 000 узлов, и приходится довольствоваться «не доказано обратное».
   * Здесь прогон L1…L60 даёт 60 ДОКАЗАННО решаемых и НОЛЬ исчерпаний.
   *
   * Причина — разные вопросы: «решается ли» отвечает первая найденная ветка,
   * «за сколько минимум» требует обойти все. Поэтому решаемость дешева даже на
   * двадцати тарелках, а минимум (`minMoves`) перестаёт считаться уже с L6.
   * Смешивать эти два числа нельзя: одно про честность уровня, другое про оценку.
   */
  it('🔴 все шестьдесят уровней ДОКАЗАННО решаемы, исчерпаний нет', () => {
    let доказано = 0; const исчерпано: string[] = []; const нерешаемо: string[] = [];
    for (const L of LEVELS) {
      const r = solve(deal(L).board, 20000);
      if (r.solvable) доказано += 1;
      else if (r.exhausted) исчерпано.push(`L${L}`);
      else нерешаемо.push(`L${L}`);
    }
    expect(нерешаемо).toEqual([]);
    expect(исчерпано).toEqual([]);
    expect(доказано).toBe(LEVELS.length);
  });

  /**
   * 🔴 ЗАСЛОН ПРОВЕРЯЕТСЯ НАПРЯМУЮ, ПОТОМУ ЧТО ЧЕРЕЗ РАЗДАЧУ ОН НЕДОСТИЖИМ.
   *
   * Замер: 720 раздач (L1…L60 × 12 попыток) — 0 готовых кругов, 0 доказанно
   * нерешаемых. Мутация «убрать проверку» проходила мимо гейта, пока он мерил
   * только `deal`. Подаём вход руками: заслон обязан жить, даже пока генератор
   * до него не доводит.
   */
  it('🔴 заслон раздачи бракует готовый круг и доказанно нерешаемый стол', () => {
    const круг = Array.from({ length: CIRCLE }, () => 7);
    expect(dealRejected(makeBoard([круг, []]))).toBe('готовый круг');
    expect(dealRejected(makeBoard([[]], [круг]))).toBe('готовый круг');
    // Два вида по шесть на двух ПОЛНЫХ разнотипных тарелках: ходов нет вовсе.
    const встал = makeBoard([[1, 1, 1, 1, 1, 2], [2, 2, 2, 2, 2, 1]]);
    expect(dealRejected(встал)).toBe('нерешаемо');
    // Годный стол не бракуется — иначе заслон отвергал бы всё подряд.
    expect(dealRejected(deal(1).board)).toBe(false);
  });

  it('брак раздачи опирается только на ДОКАЗАННУЮ нерешаемость', () => {
    // «Бюджет кончился» ≠ «нерешаемо»: сортировка товаров на этой разнице
    // однажды теряла полсекунды на старте, пересобирая хорошие столы.
    const плохо = LEVELS.filter((L) => provenUnsolvable(deal(L).board)).map((L) => `L${L}`);
    expect(плохо).toEqual([]);
    expect(solvable(deal(1).board)).toBe(true);
  });

  it('🔴 очередь входящих приходит со своего уровня и не раньше', () => {
    const плохо: string[] = [];
    for (const L of LEVELS) {
      const c = levelCfg(L);
      if (c.queue > 0 && L < QUEUE_FROM) плохо.push(`L${L}: очередь раньше порога L${QUEUE_FROM}`);
    }
    expect(плохо).toEqual([]);
    // Обе стороны непусты: уровни и с очередью, и без неё существуют.
    expect(LEVELS.filter((L) => levelCfg(L).queue > 0).length).toBeGreaterThan(5);
    expect(LEVELS.filter((L) => levelCfg(L).queue === 0).length).toBeGreaterThan(3);
    expect(levelCfg(QUEUE_FROM).queue).toBeGreaterThan(0);
  });

  it('🔴 уровень повторяется при повторном заходе — раздача детерминирована', () => {
    const разошлось = LEVELS
      .filter((L) => JSON.stringify(deal(L).board) !== JSON.stringify(deal(L).board))
      .map((L) => `L${L}: два захода дали разные столы`);
    expect(разошлось).toEqual([]);
  });
});
