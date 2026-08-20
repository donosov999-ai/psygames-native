/**
 * СОРТИРОВКА ТОВАРОВ: НЕДОИГРАННАЯ ПАРТИЯ ПЕРЕЖИВАЕТ ВЫХОД, И ОСТАТКИ ПРИ ЭТОМ НЕ ВРУТ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ (замер 19.08.2026). Склад здесь живёт весь уровень, уровней
 * шестьдесят, расклад случайный и по номеру уровня не воспроизводится: ниши,
 * препятствия и цель раскладываются на КОНКРЕТНУЮ доску. Выход с экрана —
 * промах пальцем по «назад» в шапке или аппаратная «назад» — уводил МОЛЧА и
 * стирал всё: расклад, потраченные ходы, очки, остатки подсказок и
 * перетасовок, ленту отмены. Ни вопроса, ни хранения.
 *
 * ⚠️ ПОЧЕМУ ПОВЕДЕНИЕМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА. Гейт `exit-guard.test.ts`
 * статический: он видит, что игра ДОТЯГИВАЕТСЯ до слоя партии и что вопрос при
 * выходе задан. Он физически не может увидеть главного — АРИФМЕТИКИ ОСТАТКОВ.
 * Ходы при лимите, подсказки и перетасовки не восстанавливаются в течение
 * уровня, значит выход и вход обязаны вернуть человеку ровно тот остаток, что у
 * него был. Ошибись — и «назад, потом обратно» станет способом получить их
 * бесплатно, причём в исходнике обе версии выглядят одинаково правильно.
 *
 * Момент времени приходит в функции аргументом — значит «человек вернулся через
 * сутки» проверяется числом, а не ожиданием суток.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveResume, loadResume, clearResume } from '@/src/services/resume';
import { GAMES } from '@/src/constants/games';
import {
  GS_GAME_ID,
  GS_RESUME_V,
  goodsHasSomethingToLose,
  snapshotGoodsParty,
  restoreGoodsParty,
  type GoodsLiveParty,
  type GoodsResume,
  type Obstacle,
  type Goal,
  type Snapshot,
} from '@/app/games/goods-sort';

/* ── доска для замера ───────────────────────────────────────────────────
 * Форма с ДЫРКОЙ (3×4, одна ниша вырезана маской) — ровно то, что выдаёт
 * генератор на уровнях с фигурной доской: ниш 11, а мест на сетке 12.
 */
const COLS = 3;
const ROWS = 4;
const MASK = [true, true, true, true, false, true, true, true, true, true, true, true];
const SLOTS = MASK.filter(Boolean).length;   // 11
const CELLS: number[][] = [
  [0, 1], [2], [], [0, 0], [1, 1, 2], [], [2], [1], [0], [], [2, 2],
];
const OBSTACLES: Obstacle[] = [
  null, null, { kind: 'blocked' }, null, null, { kind: 'locked', movesLeft: 4 },
  null, null, null, null, null,
];
const COVERED = ['4:0', '0:0'];
const FROZEN = { row: 2, type: 1 };
const GOAL: Goal = { kind: 'free', niches: [0, 3] };

/** Шаг ленты отмены — полный снимок доски, как его кладёт `moveItem`. */
const step = (moves: number, score: number): Snapshot => ({
  cells: CELLS.map((c) => [...c]),
  obstacles: OBSTACLES.map((o) => (o ? { ...o } : null)),
  covered: [...COVERED],
  frozen: { ...FROZEN },
  moves,
  score,
  cleared: 2,
});

const NOW = 1_000_000;
const NEXT_DAY = NOW + 24 * 60 * 60 * 1000;
const PLAYED_MS = 4 * 60 * 1000;   // уровень идёт четыре минуты
/** Уровень 20 с целью «ходы»: лимит 18, потрачено 11, ОСТАТОК 7. */
const LIMIT = 18;
const USED = 11;
const LEFT = LIMIT - USED;

const live = (over: Partial<GoodsLiveParty> = {}): GoodsLiveParty => ({
  phase: 'playing',
  bannerUp: false,
  level: 20,
  setKey: 'dairy',
  cols: COLS,
  rows: ROWS,
  mask: MASK,
  cells: CELLS,
  obstacles: OBSTACLES,
  covered: COVERED,
  frozen: FROZEN,
  goal: GOAL,
  moves: USED,
  moveLimit: LIMIT,
  score: 350,
  cleared: 4,
  shuffles: 1,     // из трёх выданных потрачено две
  hints: 2,        // из трёх выданных потрачена одна
  canUndo: true,
  history: { past: [step(9, 300), step(10, 300)], future: [step(11, 350)] },
  startedAt: NOW - PLAYED_MS,
  ...over,
});

/** Снять партию и тут же поднять обратно — как при выходе и возвращении. */
const roundTrip = (over: Partial<GoodsLiveParty> = {}, back = NEXT_DAY) => {
  const snap = snapshotGoodsParty(live(over), NOW);
  expect(snap).not.toBeNull();
  return { snap: snap as GoodsResume, restored: restoreGoodsParty(snap, back) };
};

/** Фон «свежий склад»: ни хода, ни траты. */
const FRESH = { phase: 'playing' as const, bannerUp: false, canUndo: false, hints: 3, shuffles: 3 };

describe('сортировка — есть ли что терять при выходе', () => {
  it('🔴 свежий склад без единого действия → терять нечего, вопрос был бы шумом', () => {
    expect(goodsHasSomethingToLose(FRESH)).toBe(false);
  });

  it('🔴 сделан ход → есть что терять: расклад случайный, второй раз его не выдадут', () => {
    expect(goodsHasSomethingToLose({ ...FRESH, canUndo: true })).toBe(true);
  });

  it('🔴 потрачена подсказка или перетасовка → тоже есть что терять', () => {
    // Их по три на уровень, и обратно они не набираются: выйти = потерять оплаченное.
    expect(goodsHasSomethingToLose({ ...FRESH, hints: 2 })).toBe(true);
    expect(goodsHasSomethingToLose({ ...FRESH, shuffles: 2 })).toBe(true);
  });

  it('отменил всё до начала → снова терять нечего: доска ровно та, что была выдана', () => {
    expect(goodsHasSomethingToLose({ ...FRESH, canUndo: false })).toBe(false);
  });

  it('партия не идёт → молча, без «вы уверены?» (настройка, описание, итог)', () => {
    for (const phase of ['config', 'intro', 'result'] as const) {
      expect(goodsHasSomethingToLose({ ...FRESH, phase, canUndo: true, hints: 0, shuffles: 0 })).toBe(false);
    }
  });

  it('🔴 карточка итога уровня поверх полок → вопрос не нужен: уровень уже засчитан', () => {
    expect(goodsHasSomethingToLose({ ...FRESH, bannerUp: true, canUndo: true, hints: 0 })).toBe(false);
  });
});

describe('сортировка — остаток ходов при лимите', () => {
  it('🔴 вернулся через сутки → ровно тот же остаток ходов, что был при уходе', () => {
    const { snap, restored } = roundTrip();
    expect(snap.movesLeft).toBe(LEFT);
    expect(restored!.movesLeft).toBe(LEFT);
    expect(restored!.moves).toBe(USED);
    expect(restored!.moveLimit).toBe(LIMIT);
  });

  it('🔴 остаток НЕ становится полным лимитом — иначе выход и вход дают бесплатные ходы', () => {
    const { restored } = roundTrip();
    expect(restored!.movesLeft).not.toBe(LIMIT);
    expect(restored!.moves).toBeGreaterThan(0);
  });

  it('🔴 ходы поднимаются ПО ОСТАТКУ, а не по потраченному', () => {
    // Лимит на другой ширине экрана посчитался бы иначе. Авторитет — остаток:
    // «потрачено 11» без лимита ничего не значит, «осталось 7» значит всё.
    const { snap } = roundTrip();
    const back = restoreGoodsParty({ ...snap, moves: 0 }, NOW);
    expect(back!.movesLeft).toBe(LEFT);
    expect(back!.moves).toBe(USED);
  });

  it('запись без остатка (старый формат) → остаток считается из потраченного', () => {
    const { snap } = roundTrip();
    const back = restoreGoodsParty({ ...snap, movesLeft: undefined as any }, NOW);
    expect(back!.movesLeft).toBe(LEFT);
    expect(back!.moves).toBe(USED);
  });

  it('остаток больше лимита не переживает подъём', () => {
    const { snap } = roundTrip();
    expect(restoreGoodsParty({ ...snap, movesLeft: 999 }, NOW)!.movesLeft).toBe(LIMIT);
    expect(restoreGoodsParty({ ...snap, movesLeft: -5 }, NOW)!.movesLeft).toBe(0);
  });

  it('на уровне без лимита он не появляется из ниоткуда', () => {
    const { snap, restored } = roundTrip({ moveLimit: 0, goal: { kind: 'all' } });
    expect(snap.movesLeft).toBeNull();
    expect(restored!.movesLeft).toBeNull();
    expect(restored!.moveLimit).toBe(0);
    expect(restored!.moves).toBe(USED);   // счётчик ходов идёт всегда, лимита просто нет
  });
});

describe('сортировка — остатки подсказок и перетасовок', () => {
  it('🔴 потраченного не возвращают: остатки поднимаются те же, не полные', () => {
    const { restored } = roundTrip();
    expect(restored!.hints).toBe(2);
    expect(restored!.shuffles).toBe(1);
  });

  it('🔴 нулевой остаток остаётся нулём — иначе выход перезаряжает кнопки', () => {
    const { restored } = roundTrip({ hints: 0, shuffles: 0 });
    expect(restored!.hints).toBe(0);
    expect(restored!.shuffles).toBe(0);
  });

  it('остаток больше выданного на уровень не переживает подъём', () => {
    const { snap } = roundTrip();
    const back = restoreGoodsParty({ ...snap, hints: 99, shuffles: 99 }, NOW);
    expect(back!.hints).toBe(3);
    expect(back!.shuffles).toBe(3);
  });
});

describe('сортировка — склад переживает выход', () => {
  it('🔴 расклад поднимается тот же: ниши, содержимое, форма доски', () => {
    const { restored } = roundTrip();
    expect(restored!.cells).toEqual(CELLS);
    expect(restored!.mask).toEqual(MASK);
    expect(restored!.slots).toBe(SLOTS);
    expect(restored!.cols).toBe(COLS);
    expect(restored!.rows).toBe(ROWS);
  });

  it('🔴 препятствия, накрытия, заморозка и цель — тоже', () => {
    const { restored } = roundTrip();
    expect(restored!.obstacles).toEqual(OBSTACLES);
    expect(restored!.covered).toEqual(COVERED);
    expect(restored!.frozen).toEqual(FROZEN);
    expect(restored!.goal).toEqual(GOAL);
  });

  it('уровень, набор товаров и очки — те же', () => {
    const { restored } = roundTrip();
    expect(restored).toMatchObject({ level: 20, setKey: 'dairy', score: 350, cleared: 4 });
  });

  it('🔴 лента отмены пережила подъём — иначе «отменить» после возвращения пусто', () => {
    const { restored } = roundTrip();
    expect(restored!.history.past).toHaveLength(2);
    expect(restored!.history.future).toHaveLength(1);
    expect(restored!.history.past[1]).toEqual(step(10, 300));
  });

  it('🔴 секундомер продолжает, а не считает время, пока телефон лежал в кармане', () => {
    const { snap, restored } = roundTrip();
    expect(snap.elapsedMs).toBe(PLAYED_MS);
    expect(NEXT_DAY - restored!.startedAt).toBe(PLAYED_MS);
  });

  it('партия ложится в снимок ЖИВОЙ: время меряется моментом ухода, а не прошлым ходом', () => {
    const later = NOW + 7_000;   // человек ещё семь секунд смотрел на полки
    expect(snapshotGoodsParty(live(), later)!.elapsedMs).toBe(PLAYED_MS + 7_000);
  });

  it('снимок — КОПИЯ, а не ссылка на живую доску', () => {
    const cells = CELLS.map((c) => [...c]);
    const snap = snapshotGoodsParty(live({ cells }), NOW)!;
    cells[0].push(9);
    expect(snap.cells[0]).toEqual([0, 1]);
  });
});

describe('сортировка — что сохранять НЕЛЬЗЯ', () => {
  it('🔴 терять нечего → снимка нет: иначе «Продолжить» на главной зовёт в пустоту', () => {
    expect(snapshotGoodsParty(live({ canUndo: false, hints: 3, shuffles: 3 }), NOW)).toBeNull();
  });

  it('партия не идёт (настройка, итог) → не сохраняется', () => {
    expect(snapshotGoodsParty(live({ phase: 'config' }), NOW)).toBeNull();
    expect(snapshotGoodsParty(live({ phase: 'result' }), NOW)).toBeNull();
  });

  it('🔴 карточка итога уровня → не сохраняется: уровень доигран, доска будет новой', () => {
    expect(snapshotGoodsParty(live({ bannerUp: true }), NOW)).toBeNull();
  });

  it('🔴 полки пусты (уровень собран) → не сохраняется', () => {
    const empty = CELLS.map(() => [] as number[]);
    expect(snapshotGoodsParty(live({ cells: empty }), NOW)).toBeNull();
  });

  it('доска, не сходящаяся с маской, не сохраняется', () => {
    expect(snapshotGoodsParty(live({ cells: CELLS.slice(0, 5) }), NOW)).toBeNull();
  });
});

describe('сортировка — мусор из хранилища не поднимается', () => {
  it('записи нет → продолжать нечего', () => {
    expect(restoreGoodsParty(null, NOW)).toBeNull();
    expect(restoreGoodsParty(undefined, NOW)).toBeNull();
  });

  it('🔴 форма доски не сходится сама с собой → партии нет', () => {
    // По маске считается и попадание пальцем в нишу, и ряд для заморозки.
    const { snap } = roundTrip();
    expect(restoreGoodsParty({ ...snap, mask: MASK.slice(0, 8) }, NOW)).toBeNull();
    expect(restoreGoodsParty({ ...snap, cols: 5 }, NOW)).toBeNull();
  });

  it('🔴 число ниш не сходится с доской → партии нет, иначе половина склада исчезнет молча', () => {
    const { snap } = roundTrip();
    expect(restoreGoodsParty({ ...snap, cells: CELLS.slice(0, 9) }, NOW)).toBeNull();
  });

  it('🔴 ниша с мусором вместо товаров → партии нет', () => {
    const { snap } = roundTrip();
    const bad = CELLS.map((c) => [...c]);
    bad[1] = ['кола' as any];
    expect(restoreGoodsParty({ ...snap, cells: bad }, NOW)).toBeNull();
    const tooMany = CELLS.map((c) => [...c]);
    tooMany[1] = [1, 1, 1, 1, 1];   // больше, чем вмещает самая вместительная ниша
    expect(restoreGoodsParty({ ...snap, cells: tooMany }, NOW)).toBeNull();
  });

  it('🔴 непонятная цель → партию не поднимаем, а не подставляем «убрать всё»', () => {
    // Подстановка выдала бы человеку ДРУГОЙ уровень вместо того, что он играл.
    const { snap } = roundTrip();
    expect(restoreGoodsParty({ ...snap, goal: { kind: 'что-нибудь' } as any }, NOW)).toBeNull();
    expect(restoreGoodsParty({ ...snap, goal: { kind: 'free', niches: [] } as any }, NOW)).toBeNull();
    expect(restoreGoodsParty({ ...snap, goal: null as any }, NOW)).toBeNull();
  });

  it('доигранный склад из записи не поднимается', () => {
    const { snap } = roundTrip();
    expect(restoreGoodsParty({ ...snap, cells: CELLS.map(() => []) }, NOW)).toBeNull();
  });

  it('препятствие-мусор → ниша просто без препятствия, партия жива', () => {
    const { snap } = roundTrip();
    const back = restoreGoodsParty({ ...snap, obstacles: [{ kind: 'непонятно' } as any] }, NOW);
    expect(back!.obstacles).toHaveLength(SLOTS);
    expect(back!.obstacles.every((o) => o === null)).toBe(true);
  });

  it('накрытие, указывающее в пустоту, отсеивается — силуэт над ничем', () => {
    const { snap } = roundTrip();
    const back = restoreGoodsParty({ ...snap, covered: ['4:0', '2:0', '99:1', 'мусор'] }, NOW);
    expect(back!.covered).toEqual(['4:0']);   // ниша 2 пуста, ниши 99 нет
  });

  it('заморозка вне доски снимается, а не ломает ряд', () => {
    const { snap } = roundTrip();
    expect(restoreGoodsParty({ ...snap, frozen: { row: 9, type: 1 } }, NOW)!.frozen).toBeNull();
  });

  it('🔴 битый шаг ленты выбрасывается, остальные откаты живы', () => {
    // Каждый шаг — ПОЛНЫЙ снимок доски, поэтому один битый можно потерять:
    // лента станет короче на откат, а не сломается вся.
    const { snap } = roundTrip();
    const back = restoreGoodsParty(
      { ...snap, history: { past: [step(9, 300), { cells: 'нет' } as any], future: [] } },
      NOW,
    );
    expect(back!.history.past).toHaveLength(1);
    expect(back!.history.past[0]).toEqual(step(9, 300));
  });

  it('незнакомый набор товаров не роняет партию — спрайты лежат своими номерами', () => {
    const { snap } = roundTrip();
    // Первый в списке — самый широкий «Микс»: единственный открытый с 1-го уровня.
    expect(restoreGoodsParty({ ...snap, setKey: 'мясное' }, NOW)!.setKey).toBe('mix');
  });
});

describe('сортировка — партия и хранилище', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('🔴 записали → прочитали → подняли: склад и остатки те же', async () => {
    const snap = snapshotGoodsParty(live(), NOW)!;
    await saveResume(GS_GAME_ID, 'default', GS_RESUME_V, snap);
    const back = restoreGoodsParty(await loadResume<GoodsResume>(GS_GAME_ID, 'default', GS_RESUME_V), NEXT_DAY);
    expect(back!.cells).toEqual(CELLS);
    expect(back!.obstacles).toEqual(OBSTACLES);
    expect(back!.movesLeft).toBe(LEFT);
    expect(back!.hints).toBe(2);
    expect(back!.shuffles).toBe(1);
    expect(back!.history.past).toHaveLength(2);
    expect(NEXT_DAY - back!.startedAt).toBe(PLAYED_MS);
  });

  it('🔴 «лимита нет» переживает укладку в JSON: null не должен стать нулём', async () => {
    // Разница принципиальная: null = «лимита на уровне нет», 0 = «ходы кончились».
    const snap = snapshotGoodsParty(live({ moveLimit: 0, goal: { kind: 'all' } }), NOW)!;
    await saveResume(GS_GAME_ID, 'default', GS_RESUME_V, snap);
    const raw = await loadResume<GoodsResume>(GS_GAME_ID, 'default', GS_RESUME_V);
    expect(raw!.movesLeft).toBeNull();
    expect(restoreGoodsParty(raw, NOW)!.movesLeft).toBeNull();
  });

  it('🔴 уровень доигран → партия выброшена, вход начинается с настройки', async () => {
    await saveResume(GS_GAME_ID, 'default', GS_RESUME_V, snapshotGoodsParty(live(), NOW)!);
    await clearResume(GS_GAME_ID, 'default');   // ровно это делает экран в advanceLevel
    expect(await loadResume<GoodsResume>(GS_GAME_ID, 'default', GS_RESUME_V)).toBeNull();
  });

  it('🔴 чужой профиль не поднимает чужую партию', async () => {
    // Профили в приложении — разные люди (Денис и сын). Поднять партию отца
    // ребёнку значит и подсунуть чужой уровень, и стереть её ему же.
    await saveResume(GS_GAME_ID, 'default', GS_RESUME_V, snapshotGoodsParty(live(), NOW)!);
    expect(await loadResume<GoodsResume>(GS_GAME_ID, 'kids', GS_RESUME_V)).toBeNull();
    expect(await loadResume<GoodsResume>(GS_GAME_ID, 'default', GS_RESUME_V)).not.toBeNull();
  });

  it('🔴 запись другого формата не поднимается — экран упал бы на чужих полях', async () => {
    await saveResume(GS_GAME_ID, 'default', GS_RESUME_V, snapshotGoodsParty(live(), NOW)!);
    expect(await loadResume<GoodsResume>(GS_GAME_ID, 'default', GS_RESUME_V + 1)).toBeNull();
  });

  it('ключ партии совпадает с id игры в реестре — иначе карточка «Продолжить» зовёт в никуда', () => {
    expect(GS_GAME_ID).toBe('goods_sort');
    expect(GAMES.some((g) => g.id === GS_GAME_ID)).toBe(true);
  });
});
