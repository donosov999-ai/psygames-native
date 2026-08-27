/**
 * СКРЫТАЯ ИНФОРМАЦИЯ — ШЕСТАЯ МЕХАНИКА СОРТИРОВКИ (§20 PSYGAMES_MERGE_PLAN.md).
 *
 * Под верхними товарами ниши стоит «?»: что в глубине — видно только когда
 * снимешь то, что спереди. Обычная сортировка полностью наблюдаема, и задача в
 * ней — выполнить вычислимый план; здесь план построить нельзя, приходится
 * вскрывать → узнавать → перестраивать.
 *
 * ЧТО СТЕРЕЖЁТ ЭТОТ ГЕЙТ.
 *   1. Скрытые НЕ вскрыты, пока над ними кто-то есть, и вскрываются, когда
 *      спереди никого не осталось, — исполнением того самого конвейера
 *      (сдвиг ключей → вскрытие), которым ходит moveItem, а не своей копией.
 *   2. §20.4 — правило измерения: в details скрытого уровня лежат ровно три
 *      замера (время до первого хода, пересмотры плана, ходы до первого
 *      вскрытия), а поля «ходы сверх минимума» НЕТ ВООБЩЕ — минимума при
 *      неполной информации не существует. На обычном уровне — наоборот.
 *   3. Куда режим приходит: с HIDDEN_FROM, через два уровня на третий, никогда
 *      вместе со строгой укладкой и никогда на цели «уложись в ходы» (лимит —
 *      это минимум, объявленный целью).
 *   4. Замеры переживают выход с экрана: снимок партии ↔ подъём.
 *
 * ⚠️ Проверяем ТЕМИ ЖЕ функциями, которыми пользуется игра (hideDeepSpots,
 * shiftCoveredAfterTake, revealUncovered, sessionDetails) — своя копия правила
 * в гейте уже подводила эту игру (см. шапку dealBoard).
 */
import {
  HIDDEN_FROM,
  hiddenInfo,
  hideDeepSpots,
  shiftCoveredAfterTake,
  revealUncovered,
  sessionDetails,
  moveReference,
  EMPTY_HIDDEN_STATS,
  strictPlacement,
  goalPlan,
  dealBoard,
  snapshotGoodsParty,
  restoreGoodsParty,
  type GoodsLiveParty,
  type GoodsResume,
  type HiddenRunStats,
} from '@/app/games/goods-sort';

/**
 * Ход, как его делает moveItem: изъять (from, idx) → положить в to спереди →
 * прокатить ключи скрытости через сдвиг и вскрытие. Каскад троек здесь не
 * нужен: после него в тронутой нише остаётся максимум один товар, а
 * единственный всегда спереди — его снимает то же вскрытие (см. комментарий
 * у revealUncovered в игре).
 */
function move(cells: number[][], cov: string[], from: number, idx: number, to: number) {
  const ns = cells.map((c) => [...c]);
  const [it] = ns[from].splice(idx, 1);
  ns[to].push(it);
  return { cells: ns, cov: revealUncovered(shiftCoveredAfterTake(cov, from, idx), ns) };
}

describe('куда режим приходит (лесенка уровней)', () => {
  it('до порога режима нет, на пороге есть, ритм — через два на третий', () => {
    for (let L = 1; L < HIDDEN_FROM; L++) expect(hiddenInfo(L)).toBe(false);
    expect(hiddenInfo(HIDDEN_FROM)).toBe(true);
    expect(hiddenInfo(HIDDEN_FROM + 1)).toBe(false);
    expect(hiddenInfo(HIDDEN_FROM + 2)).toBe(false);
    expect(hiddenInfo(HIDDEN_FROM + 3)).toBe(true);
  });

  it('со строгой укладкой не совпадает никогда: два режима разом — каша', () => {
    for (let L = 1; L <= 300; L++) {
      expect(hiddenInfo(L) && strictPlacement(L)).toBe(false);
    }
    // …и это не потому, что режимов нет вовсе: оба живут в диапазоне.
    const hiddenLevels = [];
    const strictLevels = [];
    for (let L = 1; L <= 60; L++) {
      if (hiddenInfo(L)) hiddenLevels.push(L);
      if (strictPlacement(L)) strictLevels.push(L);
    }
    expect(hiddenLevels.length).toBeGreaterThan(5);
    expect(strictLevels.length).toBeGreaterThan(5);
  });

  it('🔴 §20.4: на цели «уложись в ходы» режим не приходит — лимит и есть минимум', () => {
    for (let L = 1; L <= 300; L++) {
      if (hiddenInfo(L)) expect(goalPlan(L).kind).not.toBe('moves');
    }
    // Отвод не декоративный: L25 — кандидат ритма, отведён именно целью.
    // Мутация «убери проверку цели» краснеет ровно здесь.
    expect((25 - HIDDEN_FROM) % 3).toBe(0);
    expect(goalPlan(25).kind).toBe('moves');
    expect(hiddenInfo(25)).toBe(false);
  });
});

describe('скрыта вся глубина, фронт видим', () => {
  it('hideDeepSpots прячет всё, что не спереди, и ничего сверх', () => {
    const cells = [[7, 8, 9], [5, 5], [4], []];
    expect(hideDeepSpots(cells).sort()).toEqual(['0:0', '0:1', '1:0']);
  });

  it('живая раздача уровня режима: каждый глубинный скрыт, каждый фронтовый — нет', () => {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const deal = dealBoard(HIDDEN_FROM, pool);
    const cov = new Set(hideDeepSpots(deal.cells));
    let deep = 0;
    deal.cells.forEach((c, i) => {
      c.forEach((_, j) => {
        if (j < c.length - 1) { expect(cov.has(`${i}:${j}`)).toBe(true); deep++; }
        else expect(cov.has(`${i}:${j}`)).toBe(false);
      });
    });
    // На доске шестнадцатого уровня глубина не пустует — иначе гейт зелен вслепую.
    expect(deep).toBeGreaterThan(5);
  });
});

describe('вскрытие: только когда спереди никого', () => {
  // Ниша 0: [7, 8, 9] — 7 и 8 в глубине, 9 спереди. Ниша 1 пустая.
  const start = [[7, 8, 9], []];
  const cov0 = hideDeepSpots(start);

  it('пока фронт на месте, глубина НЕ вскрыта', () => {
    expect(revealUncovered(cov0, start).sort()).toEqual(['0:0', '0:1']);
  });

  it('снял верхний — вскрылся ровно следующий, глубже — всё ещё «?»', () => {
    const s1 = move(start, cov0, 0, 2, 1);          // 9 уехала в пустую нишу
    expect(s1.cov).toEqual(['0:0']);                // 8 вскрылась, 7 в глубине
    const s2 = move(s1.cells, s1.cov, 0, 1, 1);     // 8 уехала следом
    expect(s2.cov).toEqual([]);                     // 7 спереди — вскрыта
  });

  it('выкопал скрытый напрямую — он вскрыт укладкой, а сосед НЕ наследует его ключ', () => {
    // [скрытый 7, скрытый 8, видимый 9]: изъятие среднего сдвигает 9 на его
    // позицию — до правки сдвига ключей 9 темнела бы на глазах.
    const s = move(start, cov0, 0, 1, 1);
    expect(s.cells).toEqual([[7, 9], [8]]);
    expect(s.cov).toEqual(['0:0']);                 // 7 всё ещё в глубине
    expect(s.cov).not.toContain('0:1');             // 9 ключ не унаследовала
  });

  it('положил поверх вскрытого — вскрытое НЕ прячется заново: знание не отзывается', () => {
    const s1 = move(start, cov0, 0, 2, 1);          // 8 вскрылась
    const s2 = move(s1.cells, s1.cov, 1, 0, 0);     // 9 вернулась поверх 8
    expect(s2.cells).toEqual([[7, 8, 9], []]);
    expect(s2.cov).toEqual(['0:0']);                // 8 осталась видимой
  });

  it('опустевшая ниша чистится тем же условием вскрытия', () => {
    expect(revealUncovered(['2:0', '2:1'], [[], [], [], []])).toEqual([]);
  });
});

describe('§20.4 — details сессии', () => {
  const stats: HiddenRunStats = { firstMoveMs: 4200, planRevisions: 3, movesBeforeFirstReveal: 2 };

  it('🔴 скрытый уровень: три замера на месте, поля «ходы сверх минимума» НЕТ', () => {
    const d = sessionDetails(16, 25, true, 21, stats);
    expect(d.time_to_first_move_ms).toBe(4200);
    expect(d.plan_revisions).toBe(3);
    expect(d.moves_before_first_reveal).toBe(2);
    expect(d.hidden_info).toBe(true);
    expect(d.moves).toBe(25);                       // сырой счётчик — факт, он остаётся
    expect('moves_over_min' in d).toBe(false);      // не ноль и не null — отсутствует
  });

  it('обычный уровень: moves_over_min есть, замеров §20.4 нет', () => {
    const d = sessionDetails(15, 25, false, 21, stats);
    expect(d.moves_over_min).toBe(4);
    expect('time_to_first_move_ms' in d).toBe(false);
    expect('plan_revisions' in d).toBe(false);
    expect('moves_before_first_reveal' in d).toBe(false);
    expect('hidden_info' in d).toBe(false);
  });

  it('ненаступившее событие уходит null, а не нулём: ноль был бы выдуманным замером', () => {
    const d = sessionDetails(16, 2, true, 21, EMPTY_HIDDEN_STATS);
    expect(d.time_to_first_move_ms).toBeNull();
    expect(d.moves_before_first_reveal).toBeNull();
    expect(d.plan_revisions).toBe(0);               // счётчик — законный ноль
  });

  it('эталон ходов один на звёзды и на запись: лимит, а без него types × 3', () => {
    expect(moveReference({ moveLimit: 18, types: 5 })).toBe(18);
    expect(moveReference({ moveLimit: 0, types: 5 })).toBe(15);
  });
});

describe('замеры переживают выход с экрана', () => {
  const live = (): GoodsLiveParty => ({
    phase: 'playing',
    bannerUp: false,
    level: HIDDEN_FROM,
    setKey: 'mix',
    cols: 3,
    rows: 3,
    mask: Array(9).fill(true),
    cells: [[1, 2, 3], [2], [], [], [], [], [], [], []],
    obstacles: Array(9).fill(null),
    covered: ['0:0', '0:1'],
    frozen: null,
    goal: { kind: 'all' },
    moves: 4,
    moveLimit: 0,
    score: 100,
    cleared: 1,
    shuffles: 3,
    hints: 3,
    canUndo: true,
    history: { past: [], future: [] },
    startedAt: 1_000,
    hiddenStats: { firstMoveMs: 5200, planRevisions: 2, movesBeforeFirstReveal: 3 },
  });

  it('снимок ↔ подъём: три числа доезжают, какими были', () => {
    const snap = snapshotGoodsParty(live(), 61_000);
    expect(snap).not.toBeNull();
    expect(snap!.hiddenStats).toEqual({ firstMoveMs: 5200, planRevisions: 2, movesBeforeFirstReveal: 3 });
    const back = restoreGoodsParty(snap!, 100_000);
    expect(back).not.toBeNull();
    expect(back!.hiddenStats).toEqual({ firstMoveMs: 5200, planRevisions: 2, movesBeforeFirstReveal: 3 });
    // Скрытость доски тоже поднялась — «?» стоят там же, где стояли.
    expect(back!.covered.sort()).toEqual(['0:0', '0:1']);
  });

  it('снимок СТАРОГО формата (без поля) поднимается с пустыми замерами, а не падает', () => {
    const snap = snapshotGoodsParty(live(), 61_000)!;
    const legacy = { ...snap } as Partial<GoodsResume>;
    delete legacy.hiddenStats;
    const back = restoreGoodsParty(legacy as GoodsResume, 100_000);
    expect(back).not.toBeNull();
    expect(back!.hiddenStats).toEqual({ firstMoveMs: null, planRevisions: 0, movesBeforeFirstReveal: null });
  });

  it('мусор в замерах превращается в null («замера нет»), а не в ноль («замерено: ноль»)', () => {
    const snap = snapshotGoodsParty(live(), 61_000)!;
    (snap as any).hiddenStats = { firstMoveMs: 'abc', planRevisions: -7, movesBeforeFirstReveal: undefined };
    const back = restoreGoodsParty(snap, 100_000)!;
    expect(back.hiddenStats).toEqual({ firstMoveMs: null, planRevisions: 0, movesBeforeFirstReveal: null });
  });
});
