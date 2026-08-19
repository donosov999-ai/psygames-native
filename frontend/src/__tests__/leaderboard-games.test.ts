/**
 * ТАБЛИЦА РЕКОРДОВ: СРАВНИМОСТЬ ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ.
 *
 * 🔴 ЧТО ЛОМАЛОСЬ ДО 19.08.2026. Направление «лучше» было одним тернарником:
 * `gameId === 'schulte_table_5x5' ? candidate < current : candidate > current`. То есть
 * «меньше — лучше» знала РОВНО ОДНА игра, а любая следующая игра на время получала бы
 * перевёрнутый рекорд молча: в личном рекорде оседало бы САМОЕ МЕДЛЕННОЕ время, и человек
 * видел бы, что чем больше тренируется, тем хуже его «рекорд». Ни tsc, ни глаза такого не
 * ловят — число на месте, знак не тот. Отсюда первая проверка ниже: она не сверяет таблицу
 * с таблицей, а ГОНЯЕТ submitScore и смотрит, что осело в личном рекорде.
 *
 * ⚠️ ПОЧЕМУ НАПРАВЛЕНИЯ ПЕРЕПИСАНЫ ЗДЕСЬ ЗАНОВО. Взять `LEADERBOARD_GAMES[id].better` и
 * проверить им же поведение — значит проверить, что таблица равна самой себе; такой гейт
 * зелен при любом перевороте. Поэтому ниже стоит НЕЗАВИСИМЫЙ список, выведенный из смысла
 * метрики (секунды и миллисекунды — меньше; длина ряда и номер уровня — больше). Разойдутся
 * — краснеет.
 *
 * ⚠️ МЁРТВЫЙ КЛЮЧ — ЭТО ОБЕЩАНИЕ БЕЗ ИГРЫ. Ключ в типе, кнопка в интерфейсе, а отправлять
 * результат некому: таблица навсегда пуста, и виноватым выглядит сервер. Поэтому сверяется
 * в обе стороны: у каждого ключа есть экран, который его шлёт, и ни один экран не шлёт
 * ключа, которого нет в таблице.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const __dirname: string;
declare function require(id: string): any;

const fs = require('fs');
const path = require('path');
const GAMES_DIR = path.join(__dirname, '../../app/games');

const mockRpc = jest.fn();
jest.mock('@/src/services/supabase', () => ({
  getSupabase: () => ({ rpc: mockRpc }),
}));

import {
  countsForRecord,
  getPersonalBest,
  leaderboardView,
  LeaderboardGameId,
  LEADERBOARD_GAMES,
  leaderboardView as viewFn,
  submitScore,
} from '@/src/services/leaderboard';

/**
 * Направление, выведенное из СМЫСЛА метрики, а не скопированное из сервиса.
 * Секунды/миллисекунды — меньше лучше. Длина ряда и номер уровня — больше лучше.
 */
const DIRECTION_BY_MEANING: Record<LeaderboardGameId, 'less' | 'more'> = {
  schulte_table_5x5: 'less',   // секунды на прохождение таблицы
  n_back: 'more',              // достигнутый N
  digit_span: 'more',          // длина ряда цифр
  corsi: 'more',               // длина ряда блоков
  trail_making: 'less',        // секунды на маршрут
  choice_rt: 'less',           // миллисекунды реакции
};

const ALL_IDS = Object.keys(LEADERBOARD_GAMES) as LeaderboardGameId[];

/**
 * Зачётная («эталонная») партия каждой игры и по одному отклонению на КАЖДЫЙ рычаг,
 * который эту партию мог бы сделать несравнимой. Отклонение — ровно одно поле за раз:
 * иначе проверка «не засчиталось» не говорит, какое поле её остановило.
 */
const RUNS: { [K in LeaderboardGameId]: { ok: any; bad: Record<string, any> } } = {
  schulte_table_5x5: {
    ok: { gridSize: 5, contentMode: 'numbers', direction: 'forward', colorMode: false, groupCount: 1, reshuffleOnClick: false },
    bad: {
      'сетка 4×4': { gridSize: 4 },
      'сетка 7×7': { gridSize: 7 },
      'буквы вместо цифр': { contentMode: 'letters' },
      'обратный порядок': { direction: 'backward' },
      'от центра наружу': { direction: 'center-out' },
      'цветной режим': { colorMode: true },
      'разделённое внимание (2 группы)': { groupCount: 2 },
      'перетасовка по клику': { reshuffleOnClick: true },
    },
  },
  n_back: {
    ok: { isPreset: false, passed: true, trials: 20 },
    bad: {
      'шаг зарядки': { isPreset: true },
      'уровень не пройден': { passed: false },
      'укороченный раунд 15 проб': { trials: 15 },
      'удлинённый раунд 30 проб': { trials: 30 },
    },
  },
  digit_span: {
    ok: { isPreset: false, level: 1 },
    bad: { 'шаг зарядки': { isPreset: true }, 'второй уровень': { level: 2 }, 'десятый уровень': { level: 10 } },
  },
  corsi: {
    ok: { isPreset: false, level: 1 },
    bad: { 'шаг зарядки': { isPreset: true }, 'второй уровень': { level: 2 }, 'десятый уровень': { level: 10 } },
  },
  trail_making: {
    ok: { isPreset: false, level: 1, errors: 0 },
    bad: {
      'шаг зарядки': { isPreset: true },
      'второй уровень (больше узлов)': { level: 2 },
      'восьмой уровень (Trail-B, буквы)': { level: 8 },
      'партия с ошибкой': { errors: 1 },
    },
  },
  choice_rt: {
    ok: { isPreset: false, level: 1, hits: 12, trials: 12 },
    bad: {
      'шаг зарядки': { isPreset: true },
      'шестой уровень (три стрелки)': { level: 6 },
      'одиннадцатый уровень (четыре стрелки)': { level: 11 },
      'одна проба мимо': { hits: 11 },
      'раунд не состоялся': { trials: 0, hits: 0 },
    },
  },
};

function gameScreens(): { file: string; src: string }[] {
  return fs.readdirSync(GAMES_DIR)
    .filter((f: string) => f.endsWith('.tsx'))
    .map((f: string) => ({ file: f, src: fs.readFileSync(path.join(GAMES_DIR, f), 'utf8') as string }));
}

describe('лидерборд: направление «лучше» у каждой игры', () => {
  beforeEach(async () => {
    mockRpc.mockReset();
    mockRpc.mockRejectedValue(new Error('offline'));   // сеть не нужна: смотрим локальный рекорд
    await AsyncStorage.clear();
  });

  it('заявленное направление совпадает с независимым разбором смысла метрики', () => {
    for (const id of ALL_IDS) {
      expect(`${id}:${LEADERBOARD_GAMES[id].better}`).toBe(`${id}:${DIRECTION_BY_MEANING[id]}`);
    }
  });

  // Не чтение таблицы, а прогон: отправляем два результата и смотрим, какой осел.
  it.each(ALL_IDS)('%s — в личном рекорде остаётся лучший, в каком бы порядке ни пришёл', async (id) => {
    const less = DIRECTION_BY_MEANING[id] === 'less';
    const better = less ? 10 : 8;
    const worse = less ? 12 : 6;

    await submitScore(id, worse);
    await submitScore(id, better);
    expect(await getPersonalBest(id)).toBe(better);

    await AsyncStorage.clear();
    await submitScore(id, better);
    await submitScore(id, worse);   // худший НЕ должен затирать лучший
    expect(await getPersonalBest(id)).toBe(better);
  });
});

describe('лидерборд: партия идёт в рекорд только в зачётной конфигурации', () => {
  it.each(ALL_IDS)('%s — эталонная партия засчитывается', (id) => {
    expect(countsForRecord(id as any, RUNS[id].ok)).toBe(true);
  });

  it.each(ALL_IDS)('%s — каждое отклонение конфигурации отсекается', (id) => {
    const rejected: string[] = [];
    for (const [what, patch] of Object.entries(RUNS[id].bad)) {
      if (countsForRecord(id as any, { ...RUNS[id].ok, ...patch })) rejected.push(what);
    }
    expect(rejected).toEqual([]);   // всё, что здесь всплыло, попадало бы в рекорд незаслуженно
  });

  it('у каждой игры перечислено хотя бы одно отклонение — иначе проверять нечего', () => {
    for (const id of ALL_IDS) {
      expect(Object.keys(RUNS[id].bad).length).toBeGreaterThan(0);
    }
  });
});

describe('лидерборд: у каждого ключа есть игра, которая его шлёт', () => {
  const screens = gameScreens();

  it.each(ALL_IDS)('%s отправляется хотя бы одним экраном', (id) => {
    const senders = screens.filter((s) => s.src.includes(`submitScore('${id}'`)).map((s) => s.file);
    expect(senders.length).toBeGreaterThan(0);
  });

  it('ни один экран не шлёт ключа, которого нет в таблице игр', () => {
    const unknown: string[] = [];
    for (const { file, src } of screens) {
      const found = src.match(/submitScore\('([a-z0-9_]+)'/g) ?? [];
      for (const m of found) {
        const key = m.slice("submitScore('".length, -1);
        if (!ALL_IDS.includes(key as LeaderboardGameId)) unknown.push(`${file}: ${key}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  /**
   * Условие сравнимости — чистая функция, и её гоняет проверка выше. Но она бесполезна,
   * если экран отправляет результат мимо неё: тогда проверенным окажется код, который в
   * приложении не исполняется. Отсюда требование — рядом с submitScore обязан стоять
   * countsForRecord.
   */
  it('экран, который шлёт рекорд, спрашивает countsForRecord', () => {
    const bad: string[] = [];
    for (const { file, src } of screens) {
      if (src.includes('submitScore(') && !src.includes('countsForRecord(')) bad.push(file);
    }
    expect(bad).toEqual([]);
  });
});

describe('лидерборд: у каждой игры записано, что и почему сравнивается', () => {
  it.each(ALL_IDS)('%s — метрика, конфигурация и причина заполнены', (id) => {
    const spec = LEADERBOARD_GAMES[id];
    expect(spec.metric.length).toBeGreaterThan(10);
    expect(spec.config.length).toBeGreaterThan(10);
    // Причина — это разбор, а не отписка: «так исторически» в тридцать символов не влезет.
    expect(spec.why.length).toBeGreaterThan(60);
  });

  it('описания не скопированы между играми', () => {
    for (const field of ['metric', 'config', 'why'] as const) {
      const values = ALL_IDS.map((id) => LEADERBOARD_GAMES[id][field]);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe('лидерборд: пустая таблица показывает личный рекорд, а не пустоту', () => {
  it('чужих результатов нет, свой рекорд есть → показываем свой', () => {
    expect(leaderboardView([], 13.6)).toEqual({ kind: 'personal', score: 13.6 });
  });

  it('нет ни чужих, ни своего → честная пустота', () => {
    expect(leaderboardView([], null)).toEqual({ kind: 'empty' });
  });

  it('ещё не ответили → загрузка, а не «пусто»', () => {
    expect(viewFn(null, 13.6)).toEqual({ kind: 'loading' });
    expect(viewFn(null, null)).toEqual({ kind: 'loading' });
  });

  it('чужие результаты пришли → показываем их, свой рекорд не заслоняет таблицу', () => {
    const rows = [{ player_name: 'anon', score: 11, updated_at: 'now' }];
    expect(leaderboardView(rows, 13.6)).toEqual({ kind: 'top', entries: rows });
  });

  it('битый личный рекорд не подставляется вместо пустоты', () => {
    expect(leaderboardView([], Number.NaN)).toEqual({ kind: 'empty' });
  });
});
