/**
 * ЗАРАБОТОК ЗА ПАРТИЮ: множитель ×2 и блок «Сегодня».
 *
 * ЗАЧЕМ ГЕЙТ. Экономика — единственная часть приложения, поломку которой человек
 * замечает не как ошибку, а как несправедливость: «я же сыграл чисто». Ошибиться можно
 * четырьмя способами, и ни один не видно глазами за один заход:
 *
 *   1. множитель даётся не за то, за что объявлен (например, удваивает ноль
 *      или срабатывает на шаге зарядки, где за серию платит комплекс);
 *   2. повтор одного лёгкого уровня печатает монеты без конца;
 *   3. «сегодня» считается не по календарным суткам или не по своему профилю —
 *      и человек видит чужие или вчерашние деньги;
 *   4. начисление есть, но нигде не показано — тогда его как бы и нет.
 *
 * ⚠️ ПОЧЕМУ ПУТЬ ПРОВЕРЯЕТСЯ ЧЕРЕЗ `saveSession`, А НЕ ТОЛЬКО ФОРМУЛОЙ. Формула может
 * быть безупречной и не вызываться вовсе. Ровно так это и было устроено до правки:
 * начисление висело на `await import(...)`, который в прогонах молча падает
 * (`A dynamic import callback was invoked without --experimental-vm-modules`), — то
 * есть любой гейт на «сыграл и получил» был бы зелёным при отключённых деньгах.
 * Поэтому импорт сделан обычным, а здесь дёргается настоящая точка входа.
 *
 * ⚠️ ПОЧЕМУ РЯДОМ С ИСПОЛНЕНИЕМ ЕСТЬ ПРОВЕРКИ ИСХОДНИКА. Показ начисления живёт в
 * разметке, которую этим прогоном не отрисовать (тесты — .ts, JSX сюда не завести).
 * Но проверяется не наличие слова в комментарии, а поведение кода: что экран НЕ
 * пересчитывает формулу у себя (второй источник правды) и что блок «Сегодня»
 * нарисован БЕЗУСЛОВНО — то есть пустой день не превращается в пустое место.
 */
jest.mock('@/src/services/supabase', () => ({
  getSupabase: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
  SUPABASE_TABLE: 'cognitive_sessions',
  SUPABASE_URL: 'x',
  SUPABASE_RELAY_URL: 'x',
  SUPABASE_PUBLISHABLE_KEY: 'x',
  currentSupabaseBase: () => 'direct',
}));

declare const __dirname: string;
declare function require(id: string): any;

import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveSession } from '@/src/services/api';
import { getTokens, TOKEN_DELTA_CAP } from '@/src/services/tokens';
import * as cleanRun from '@/src/services/cleanRun';
import {
  earnForRound,
  earnReasonKey,
  goalReward,
  recordRound,
  streakFromDays,
  todayEarnings,
  dayKey,
  DAY_GOAL_REWARD,
  MULTIPLIER,
  MULT_ROUNDS_PER_GAME_PER_DAY,
  DAY_STREAK_FOR_MULT,
  EarnReason,
} from '@/src/services/earn';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;

/**
 * Код без комментариев.
 *
 * ⚠️ ЗАЧЕМ. Первая версия проверки «экран не считает формулу сам» покраснела на моём же
 * комментарии, где сказано, ЧТО раньше считалось. Гейт, краснеющий на исправном коде,
 * перестают читать — и вместе с придуманной поломкой он пропускает настоящую. Правило
 * не в том, чтобы слово не встречалось, а в том, чтобы вызова не было.
 */
const code = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Уникальный профиль на каждый случай — балансы и журналы не протекают между ними. */
let seq = 0;
const who = () => `p${++seq}`;

const round = (over: Partial<Parameters<typeof earnForRound>[0]> = {}) =>
  earnForRound({ score: 200, errors: 0, warmupStep: false, doubledToday: 0, dayStreak: 1, ...over });

const day = (shift: number, hour = 12) => {
  const d = new Date();
  d.setDate(d.getDate() + shift);
  d.setHours(hour, 0, 0, 0);
  return d;
};

beforeEach(async () => { await AsyncStorage.clear(); });

// ── 1. Множитель даётся ровно за то, за что объявлен ─────────────────────────

describe('множитель ×2', () => {
  it('есть что проверять — множитель именно ×2, а не «какой-то»', () => {
    expect(MULTIPLIER).toBe(2);
  });

  it('чистая партия (без ошибок, со счётом) — вдвое', () => {
    const e = round({ errors: 0 });
    expect(e.multiplier).toBe(2);
    expect(e.reason).toBe('clean');
    expect(e.total).toBe(e.base * 2);
  });

  it('партия с ошибкой — по базе, без множителя', () => {
    const e = round({ errors: 2, dayStreak: 1 });
    expect(e.clean).toBe(false);
    expect(e.multiplier).toBe(1);
    expect(e.total).toBe(e.base);
  });

  it('серия тренировочных дней удваивает даже партию с ошибками', () => {
    const e = round({ errors: 2, dayStreak: DAY_STREAK_FOR_MULT });
    expect(e.multiplier).toBe(2);
    expect(e.reason).toBe('streak');
  });

  it('серия короче порога множителя не даёт', () => {
    const e = round({ errors: 2, dayStreak: DAY_STREAK_FOR_MULT - 1 });
    expect(e.multiplier).toBe(1);
    expect(e.reason).toBe('plain');
  });

  it('чисто И на серии — всё равно ×2, а не ×4: множитель в приложении один', () => {
    const e = round({ errors: 0, dayStreak: 10 });
    expect(e.multiplier).toBe(2);
    expect(e.total).toBe(e.base * 2);
  });

  it('нулевую партию множитель не превращает во что-то', () => {
    const e = round({ score: 0, errors: 0 });
    expect(e.base).toBe(0);
    expect(e.multiplier).toBe(1);
    expect(e.total).toBe(0);
    expect(e.reason).toBe('none');
  });

  it('игра, которая ошибок не считает, идёт как чистая — и это записано причиной', () => {
    // дыхание и гимнастика для глаз всегда пишут errors: 0 (а иные — вовсе не пишут)
    expect(round({ errors: undefined }).reason).toBe('clean');
    expect(round({ errors: 0 }).reason).toBe('clean');
  });

  it('шаг зарядки идёт по базе: за серию там платит комплекс, не партия', () => {
    const e = round({ errors: 0, warmupStep: true });
    expect(e.multiplier).toBe(1);
    expect(e.reason).toBe('warmup');
    expect(e.total).toBe(e.base);
  });
});

// ── 2. Повтор не печатает монеты ─────────────────────────────────────────────

describe('повтор пройденного уровня', () => {
  it('квота задана и она не бесконечна', () => {
    expect(MULT_ROUNDS_PER_GAME_PER_DAY).toBeGreaterThan(0);
    expect(MULT_ROUNDS_PER_GAME_PER_DAY).toBeLessThan(10);
  });

  it('десять одинаковых чистых партий подряд удваиваются ровно по квоте', async () => {
    const pid = who();
    const got: number[] = [];
    for (let i = 0; i < 10; i++) {
      const e = await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
      got.push(e.multiplier);
    }
    expect(got.filter((m) => m > 1).length).toBe(MULT_ROUNDS_PER_GAME_PER_DAY);
    // и это видно по кошельку, а не только по возвращённому объекту
    const base = 10;   // tokenDelta(200, 0)
    const expected = base * (MULT_ROUNDS_PER_GAME_PER_DAY * MULTIPLIER + (10 - MULT_ROUNDS_PER_GAME_PER_DAY));
    expect(await getTokens(pid)).toBe(expected);
  });

  it('партия сверх квоты так и говорит, почему не удвоена', async () => {
    const pid = who();
    for (let i = 0; i < MULT_ROUNDS_PER_GAME_PER_DAY; i++) {
      await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    }
    const over = await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    expect(over.reason).toBe('repeat');
    expect(earnReasonKey(over.reason)).toBe('earnWhyRepeat');
  });

  it('квота своя у каждой игры — разнообразие не наказано', async () => {
    const pid = who();
    for (let i = 0; i < MULT_ROUNDS_PER_GAME_PER_DAY; i++) {
      await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    }
    const other = await recordRound({ profileId: pid, game: 'schulte_table', score: 200, errors: 0, warmupStep: false });
    expect(other.multiplier).toBe(2);
  });

  it('партии без множителя квоту не тратят', async () => {
    const pid = who();
    // три партии с ошибками (множителя нет) — квота остаётся нетронутой
    for (let i = 0; i < MULT_ROUNDS_PER_GAME_PER_DAY; i++) {
      await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 3, warmupStep: false });
    }
    const clean = await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    expect(clean.multiplier).toBe(2);
  });

  it('шаг зарядки квоту не тратит — множителя он и не получал', async () => {
    const pid = who();
    for (let i = 0; i < MULT_ROUNDS_PER_GAME_PER_DAY; i++) {
      await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: true });
    }
    const free = await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    expect(free.multiplier).toBe(2);
  });

  it('назавтра квота открывается заново — это суточное ограничение, а не пожизненное', async () => {
    const pid = who();
    for (let i = 0; i < MULT_ROUNDS_PER_GAME_PER_DAY + 2; i++) {
      await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false, now: day(-1) });
    }
    const fresh = await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false, now: day(0) });
    expect(fresh.multiplier).toBe(2);
  });
});

// ── 3. Серия дней ────────────────────────────────────────────────────────────

describe('серия тренировочных дней', () => {
  const k = (shift: number) => dayKey(day(shift));

  it('считает подряд идущие дни, включая сегодня', () => {
    expect(streakFromDays([k(-2), k(-1), k(0)], day(0))).toBe(3);
  });

  it('пропуск обрывает серию', () => {
    expect(streakFromDays([k(-4), k(-3), k(-1)], day(0))).toBe(1);
    expect(streakFromDays([k(-5), k(-4), k(-3)], day(0))).toBe(0);
  });

  it('утром, до первой партии, вчерашняя серия ещё жива', () => {
    expect(streakFromDays([k(-3), k(-2), k(-1)], day(0))).toBe(3);
  });

  it('пустой журнал — серии нет', () => {
    expect(streakFromDays([], day(0))).toBe(0);
  });

  it('третий день подряд удваивает уже ПЕРВУЮ партию дня', async () => {
    const pid = who();
    await recordRound({ profileId: pid, game: 'stroop', score: 200, errors: 4, warmupStep: false, now: day(-2) });
    await recordRound({ profileId: pid, game: 'stroop', score: 200, errors: 4, warmupStep: false, now: day(-1) });
    const third = await recordRound({ profileId: pid, game: 'stroop', score: 200, errors: 4, warmupStep: false, now: day(0) });
    expect(third.dayStreak).toBe(3);
    expect(third.multiplier).toBe(2);
    expect(third.reason).toBe('streak');
  });
});

// ── 4. Итог за день ──────────────────────────────────────────────────────────

describe('блок «Сегодня»', () => {
  it('пустой день отдаёт годную сводку, а не пустоту и не падение', async () => {
    const sum = await todayEarnings(who());
    expect(sum.rows).toEqual([]);
    expect(sum.total).toBe(0);
    expect(sum.rounds).toBe(0);
  });

  it('считает по календарным суткам: вчерашнее в сегодня не попадает', async () => {
    const pid = who();
    await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false, now: day(-1) });
    await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false, now: day(0) });
    const sum = await todayEarnings(pid, day(0));
    expect(sum.rounds).toBe(1);
    expect(sum.total).toBe(20);
  });

  it('поздний вечер и раннее утро — разные дни, а не «последние сутки»', async () => {
    const pid = who();
    await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false, now: day(-1, 23) });
    const sum = await todayEarnings(pid, day(0, 1));
    expect(sum.rounds).toBe(0);
  });

  it('считает по СВОЕМУ профилю: партии соседа по устройству сюда не идут', async () => {
    const mine = who(); const other = who();
    await recordRound({ profileId: other, game: 'mahjong', score: 400, errors: 0, warmupStep: false });
    await recordRound({ profileId: mine, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    const sum = await todayEarnings(mine);
    expect(sum.rounds).toBe(1);
    expect(sum.total).toBe(20);
  });

  it('строки сходятся с кошельком: сумма показанного равна начисленному за день', async () => {
    const pid = who();
    await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    await recordRound({ profileId: pid, game: 'stroop', score: 300, errors: 5, warmupStep: false });
    await recordRound({ profileId: pid, game: 'mahjong', score: 100, errors: 0, warmupStep: false });
    const sum = await todayEarnings(pid);
    expect(sum.rows.reduce((s, r) => s + r.total, 0)).toBe(sum.total);
    expect(sum.total).toBe(await getTokens(pid));
  });

  it('партии одной игры схлопнуты в строку со счётчиком, а не размазаны', async () => {
    const pid = who();
    await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    await recordRound({ profileId: pid, game: 'mahjong', score: 200, errors: 0, warmupStep: false });
    const sum = await todayEarnings(pid);
    expect(sum.rows.length).toBe(1);
    expect(sum.rows[0].rounds).toBe(2);
    expect(sum.rows[0].doubled).toBe(true);
  });

  it('партия без начисления всё равно видна: «сегодня» отвечает, ЧТО сыграно', async () => {
    const pid = who();
    await recordRound({ profileId: pid, game: 'breathing', score: 0, errors: 0, warmupStep: false });
    const sum = await todayEarnings(pid);
    expect(sum.rounds).toBe(1);
    expect(sum.total).toBe(0);
  });
});

// ── 5. Настоящий путь: партия → кошелёк ──────────────────────────────────────

describe('партия доиграна', () => {
  const play = async (pid: string, over: Partial<Parameters<typeof saveSession>[0]>) => {
    (globalThis as any).__psygames_active_profile_id = pid;
    (globalThis as any).__psygames_warmup_active = false;
    const before = await getTokens(pid);
    await saveSession({ game_type: 'mahjong', score: 200, time_seconds: 30, errors: 0, ...over });
    return (await getTokens(pid)) - before;
  };

  it('чистая партия приносит ровно вдвое против партии с ошибками той же цены', async () => {
    // База обеих партий одинакова — 10: у чистой это 200/20, у второй 240/20 − 2 ошибки.
    // Значит разница в итоге — ровно множитель, а не разный счёт.
    const cleanGain = await play(who(), { score: 200, errors: 0 });
    const dirtyGain = await play(who(), { score: 240, errors: 2 });
    expect(cleanGain).toBe(20);
    expect(dirtyGain).toBe(10);
    expect(cleanGain).toBe(dirtyGain * 2);
  });

  it('партия попадает и в кошелёк, и в «сегодня» — одним числом', async () => {
    const pid = who();
    const gain = await play(pid, { score: 200, errors: 0 });
    const sum = await todayEarnings(pid);
    expect(sum.total).toBe(gain);
    expect(sum.rows[0].game).toBe('mahjong');
  });

  it('шаг зарядки платит по базе — множитель отдан комплексу', async () => {
    const pid = who();
    (globalThis as any).__psygames_active_profile_id = pid;
    (globalThis as any).__psygames_warmup_active = true;
    await saveSession({ game_type: 'mahjong', score: 200, time_seconds: 30, errors: 0 });
    (globalThis as any).__psygames_warmup_active = false;
    expect(await getTokens(pid)).toBe(10);
  });

  it('переигровка того же уровня перестаёт удваивать после квоты', async () => {
    const pid = who();
    let gains: number[] = [];
    for (let i = 0; i < MULT_ROUNDS_PER_GAME_PER_DAY + 2; i++) {
      gains.push(await play(pid, { score: 200, errors: 0, details: { level: 1 } }));
    }
    expect(gains.slice(0, MULT_ROUNDS_PER_GAME_PER_DAY)).toEqual(
      new Array(MULT_ROUNDS_PER_GAME_PER_DAY).fill(20),
    );
    expect(gains.slice(MULT_ROUNDS_PER_GAME_PER_DAY)).toEqual([10, 10]);
  });
});

// ── 6. Одно правило — один источник ──────────────────────────────────────────

describe('второго источника правды нет', () => {
  it('аддитивная надбавка за серию убрана: за чистоту не платят дважды', () => {
    expect((cleanRun as any).cleanRunBonus).toBeUndefined();
  });

  it('запись партии начисляет ТОЛЬКО через журнал, мимо него в api начислений нет', () => {
    const src = code('src/services/api.ts');
    expect(src).toContain('recordRound(');
    expect(src).not.toContain('addTokens(');
    expect(src).not.toContain('cleanRunBonus');
  });

  it.each(['src/components/GameResult.tsx', 'src/components/LevelCleared.tsx'])(
    '%s показывает НАЧИСЛЕННОЕ, а не пересчитывает формулу у себя',
    (file) => {
      const src = code(file);
      expect(src).not.toContain('tokenDelta');
      expect(src).toContain('@/src/services/earn');
    },
  );

  it('у каждой причины множителя есть своё слово, у обычной партии — нет', () => {
    const reasons: EarnReason[] = ['clean', 'streak', 'repeat', 'warmup'];
    for (const r of reasons) expect(earnReasonKey(r)).toBeTruthy();
    expect(earnReasonKey('plain')).toBeNull();
    expect(earnReasonKey('none')).toBeNull();
  });

  it.each(['src/components/GameResult.tsx', 'src/components/LevelCleared.tsx'])(
    '%s называет и сумму, и причину — через словарь, а не строкой в разметке',
    (file) => {
      const src = code(file);
      expect(src).toContain('earnReasonKey');
      // причина обязана дойти до показа через t(), а не осесть в переменной
      expect(src).toMatch(/t\(\s*(whyKey|earnReasonKey\()/);
      // и сумма обязана быть нарисована рядом, иначе объяснение висит без числа
      expect(src).toMatch(/\+\{\s*(earned|earn\?\.total)/);
    },
  );

  it.each(['src/components/GameResult.tsx', 'src/components/LevelCleared.tsx'])(
    '%s: показ начисления не выключен константой',
    (file) => {
      // 🔴 Дыра, найденная поломкой: проверка «в файле есть earnReasonKey» оставалась
      //    зелёной, когда условие показа заменили на `{false && (…)}` — слово в файле
      //    осталось, а строка не рисовалась никогда. Та же болезнь, что в
      //    dead-ui-state.test.ts, только там ищут состояние без сеттера, а здесь —
      //    условие, которое не станет истинным ни при каких данных.
      expect(code(file)).not.toMatch(/\{\s*(false|0|null|undefined)\s*&&/);
    },
  );
});

// ── 7. Пустой день не даёт пустого экрана ────────────────────────────────────

describe('блок «Сегодня» на главном экране', () => {
  const home = () => read('app/index.tsx');
  /** Разметка блока: от его комментария до следующего блока экрана. */
  const region = () => {
    const src = home();
    const from = src.indexOf('📒 «Сегодня»');
    const to = src.indexOf('🎯 «Рекомендуем сегодня»');
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    return src.slice(from, to);
  };

  it('блок вообще есть и берёт данные из журнала', () => {
    expect(home()).toContain('todayEarnings');
    expect(region()).toContain('styles.todayBlock');
  });

  it('рисуется БЕЗУСЛОВНО — за комментарием сразу разметка, а не условие', () => {
    // 🔴 Поломка, которую ловим: `{today.rows.length > 0 && (…)}` — в день без партий
    //    блок бесследно исчезает, и узнать, что он бывает, неоткуда.
    // Комментарий блока — JSX-комментарий, поэтому после `*/` идёт его закрывающая
    // скобка, и только потом разметка. Отрезаем её, а не подгоняем ожидание.
    /**
     * ⚠️ 03.09.2026 РАЗБОР СТАЛ УСТОЙЧИВЕЕ. Блок стал НАЖИМАЕМЫМ (просьба Дениса:
     * «чтобы можно было кликнуть по нему и перейти на развёрнутую статистику»), а
     * комментариев перед разметкой стало два. Прежний разбор резал по первому `*​/`
     * и ломался на этом, хотя проверяемое свойство не менялось. Теперь снимаем ВСЕ
     * ведущие комментарии и смотрим, что первым идёт тег, а не условие.
     */
    // Область начинается ВНУТРИ первого комментария (с эмодзи-метки), поэтому сперва
    // закрываем его, а потом снимаем сколько угодно следующих комментариев подряд.
    let after = (region().split('*/').slice(1).join('*/')).replace(/^\s*\}/, '');
    for (;;) {
      const t = after.trimStart();
      if (t.startsWith('{/*')) { after = t.slice(t.indexOf('*/') + 2).replace(/^\s*\}/, ''); continue; }
      after = t; break;
    }
    expect(after.startsWith('<')).toBe(true);
    /**
     * ⚠️ УСЛОВИЕ ЗАПРЕЩЕНО ПЕРЕД КОРНЕМ, А НЕ ВЕЗДЕ ВНУТРИ. Проверка ловит «блок
     * исчезает целиком», то есть условие ВОКРУГ него. Внутри же условия законны:
     * 03.09.2026 появилась строка «и ещё N — весь список в статистике», и она по
     * определению показывается только когда игр больше трёх. Прежняя редакция
     * искала образец по всей области и покраснела на ней — то есть на работе,
     * которую сама же не запрещала.
     */
    const доКорня = region().slice(0, region().length - after.length);
    expect(доКорня).not.toMatch(/today\.(rows\.length|total|rounds)\s*[><!=]=?[^?]*&&\s*\(/);
  });

  it('у пустого дня своя строка, а не пустота', () => {
    expect(region()).toContain('today.rows.length === 0 ?');
    expect(region()).toContain("t('todayEmptyHint')");
  });

  it('строка дня показывает и что сыграно, и сколько принесло', () => {
    const r = region();
    expect(r).toContain('todayRoundsLabel');
    expect(r).toContain('row.total');
    expect(r).toContain('today.total');
  });
});

// ── 7б. Цель дня: единственное начисление не за партию ───────────────────────

/**
 * ⚠️ ЗДЕСЬ ТОЛЬКО ЧИСТОЕ ПРАВИЛО — «сколько положено». Что оно доходит до кошелька,
 * что платит один раз в сутки и что берёт факт тренировки из настоящего журнала,
 * проверяется исполнением в `daily-goal.test.ts`: правило может быть безупречным и
 * не вызываться вовсе — этой болезнью болел и сам множитель (см. шапку файла).
 */
describe('награда за цель дня', () => {
  const decide = (over: Partial<Parameters<typeof goalReward>[0]> = {}) =>
    goalReward({ outcome: 'done', roundsToday: 3, alreadyMarked: false, ...over });

  it('🔴 достигнутая цель в день с партиями — платим объявленное', () => {
    expect(decide()).toEqual({ amount: DAY_GOAL_REWARD, reason: 'paid' });
  });

  it('🔴 «не сегодня» — РОВНО НОЛЬ, а не отрицательное', () => {
    // Отрицательной суммы в этом правиле не бывает ни при каком наборе входов:
    // честный ответ, стоящий денег, — это плата за враньё.
    const r = decide({ outcome: 'not_today' });
    expect(r).toEqual({ amount: 0, reason: 'notToday' });
    for (const rounds of [0, 1, 50]) {
      expect(`${rounds}: ${decide({ outcome: 'not_today', roundsToday: rounds }).amount}`)
        .toBe(`${rounds}: 0`);
    }
  });

  it('🔴 без партий сегодня — ноль даже за «получилось»', () => {
    expect(decide({ roundsToday: 0 })).toEqual({ amount: 0, reason: 'noRounds' });
    expect(decide({ roundsToday: -1 }).amount).toBe(0);
  });

  it('🔴 исход за сутки уже отмечен — второй раз не платим', () => {
    expect(decide({ alreadyMarked: true })).toEqual({ amount: 0, reason: 'alreadyPaid' });
  });

  it('🔴 награда меньше лучшей партии — иначе отметка обесценивает игру', () => {
    // Потолок партии: база 50 × множитель 2 = 100. Награда обязана быть заметно ниже.
    expect(DAY_GOAL_REWARD).toBeGreaterThan(0);
    expect(DAY_GOAL_REWARD).toBeLessThan(TOKEN_DELTA_CAP * MULTIPLIER);
    // И привязана к потолку, а не написана числом: правка экономики её тянет за собой.
    expect(DAY_GOAL_REWARD).toBe(Math.round(TOKEN_DELTA_CAP / 2));
  });

  it('🔴 в правиле награды нет ни одной ветки, уменьшающей баланс', () => {
    const outcomes = ['done', 'not_today'] as const;
    const worst: number[] = [];
    for (const outcome of outcomes) {
      for (const roundsToday of [0, 1, 7]) {
        for (const alreadyMarked of [false, true]) {
          worst.push(goalReward({ outcome, roundsToday, alreadyMarked }).amount);
        }
      }
    }
    expect(Math.min(...worst)).toBe(0);
    expect(Math.max(...worst)).toBe(DAY_GOAL_REWARD);
  });
});

// ── 8. Новые слова есть на всех языках ───────────────────────────────────────

describe('словарь', () => {
  const KEYS = [
    'earnWhyClean', 'earnWhyStreak', 'earnWhyRepeat', 'earnWhyWarmup',
    'todayEarnedTitle', 'todayEmptyHint', 'todayRoundsLabel', 'todayStreakNote',
  ];
  const LOCALES = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];

  it('ключи причин, которые отдаёт сервис, заведены в базовом словаре', () => {
    const base = read('src/contexts/LanguageContext.tsx');
    const used = (['clean', 'streak', 'repeat', 'warmup'] as EarnReason[])
      .map((r) => earnReasonKey(r) as string);
    for (const k of used) expect(base).toContain(`  ${k}: { ru:`);
  });

  it.each(LOCALES)('в локали %s переведены все новые слова', (loc) => {
    const src = read(`src/contexts/translations/${loc}.ts`);
    const miss = KEYS.filter((k) => !src.includes(`"${k}":`));
    expect(`${loc}: не хватает ${miss.join(', ') || '—'}`).toBe(`${loc}: не хватает —`);
  });
});
