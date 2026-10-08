/* psygames-stats-host-model · VER 3 · 07.10.2026 */
/**
 * 🔴 «ПРОГРЕСС» ПОД ОБОЛОЧКОЙ ОТДАЁТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЕТ САМ (задача 6ff4a966).
 *
 * Экран монтируется целиком (обвязка — `stats-balance-follows-profile`): партии двух профилей,
 * настоящие профиль, тема, язык. Оболочка подменена (`window.PsyBridge`, `__psyHostScreens`).
 *   · без оболочки модели нет;
 *   · баланс в модели — те же числа, что в строках веба (своё: 4 и 4);
 *   · действие `scope(true)` переключает охват — баланс модели становится «все игры» (16, 12, 4);
 *   · история и карточки игр приходят готовыми строками; образец модели — для пробы Flutter;
 *   · 🔴 карточки и итоги — по партиям охвата, как баланс (a6b99ecc): у «Микро-релакс» в «Судоку»
 *     4 своих, а не 16 устройства; очки и серия — выбранного профиля и при холодном заходе.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

jest.mock('expo-router', () => {
  const r = { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} };
  return {
    useRouter: () => r,
    useLocalSearchParams: () => ({}),
    useGlobalSearchParams: () => ({}),
    usePathname: () => '/statistics',
    useFocusEffect: () => {},
    useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
    Redirect: () => null,
    router: r,
  };
});
// «Назад» — правило веба `goBackOrHome`; здесь только запоминаем вызов.
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
// ИИ-дайджест ходит в сеть — здесь сети нет: только кэш недели тем же ключом, что у настоящего
// `getAiInsight` (без кэша — молчит, как без ключа на сервере).
jest.mock('@/src/services/aiInsight', () => {
  const real = jest.requireActual('@/src/services/aiInsight');
  return {
    ...real,
    getAiInsight: async (kind: string, pid: string, slot: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-async-storage/async-storage');
      const AS = mod.default ?? mod;
      return (await AS.getItem(`psygames_ai_insight_${kind}_${pid}_${slot}`)) || null;
    },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }); };
const день = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const партии = (profile_id: string, game_type: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${profile_id}-${game_type}-${i}`, profile_id, game_type, score: 10 + i, time_seconds: 60 + i, timestamp: день(1 + i),
  }));

async function смонтировать(host: boolean, prep?: () => Promise<void>) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', '#switcher', '/statistics'];
  }
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'women');
  await AsyncStorage.setItem('language', 'ru');
  await AsyncStorage.setItem('psygames_sessions', JSON.stringify([
    ...партии('women', 'breathing', 4),
    ...партии('women', 'sudoku', 4),
    ...партии('nzt48', 'sudoku', 12),
    ...партии('nzt48', 'corsi', 12),
  ]));
  if (prep) await prep();
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/statistics').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === '/statistics')?.model;
  return { r, sent, last };
}

const числа = (m: any) => (m?.areas?.rows ?? []).map((a: any) => Number(/· (\d+)$/.exec(a.text)![1])).sort((a: number, b: number) => b - a);

describe('«Прогресс» под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать(false);
    expect(sent.filter((m) => m.op === 'screenUi')).toEqual([]);
  });

  it('🔴 баланс модели — тот же, что в строках веба; scope(true) — все игры устройства', async () => {
    const { last } = await смонтировать(true);
    const m = last();
    expect(m ? 'модель есть' : 'модели нет').toBe('модель есть');
    expect(m.loading).toBe(false);
    expect(числа(m)).toEqual([4, 4]);
    expect(m.scope.isAll).toBe(false);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].scope(true); });
    await осесть();
    expect(last().scope.isAll).toBe(true);
    expect(числа(last())).toEqual([16, 12, 4]);
  });

  it('🔴 refresh перечитывает хранилище; back — goBackOrHome веба', async () => {
    const { last } = await смонтировать(true);
    const было = last().totalPlayed;
    const raw = JSON.parse((await AsyncStorage.getItem('psygames_sessions'))!);
    await AsyncStorage.setItem('psygames_sessions', JSON.stringify([...raw, ...партии('women', 'sudoku', 3).map((x) => ({ ...x, id: `new-${x.id}` }))]));
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].refresh(); });
    await осесть();
    // Итог — по партиям профиля (8 своих у «women»), а не устройства (32).
    expect([было, last().totalPlayed]).toEqual([было.replace(/\d+/, '8'), было.replace(/\d+/, '11')]);
    mockBack.mockClear();
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].back(); });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('🔴 карточки игр — по партиям охвата: профиль — свои, «все игры» — устройства (a6b99ecc)', async () => {
    const { last } = await смонтировать(true);
    const всего = (m: any, id: string) => m.games.find((g: any) => g.id === id)?.stats[0].value ?? null;
    expect([всего(last(), 'sudoku'), всего(last(), 'breathing'), всего(last(), 'corsi')]).toEqual(['4', '4', null]);
    expect(last().hero.games).toMatch(/^8 /);
    await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].scope(true); });
    await осесть();
    expect([всего(last(), 'sudoku'), всего(last(), 'corsi')]).toEqual(['16', '12']);
    expect(last().hero.games).toMatch(/^32 /);
  });

  it('🔴 холодный заход: очки и серия — выбранного профиля, а не профиля по умолчанию (a6b99ecc)', async () => {
    const { last } = await смонтировать(true, async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { addTokens } = require('@/src/services/tokens');
      await addTokens('women', 1240);
    });
    expect(last().hero.tokens).toBe(1240);
  });

  it('карточки игр и история — готовыми строками; образец для Flutter', async () => {
    const { last } = await смонтировать(true);
    const m = last();
    expect(m.games.length).toBeGreaterThan(0);
    for (const g of m.games) expect([g.id, g.stats.length]).toEqual([g.id, 4]);
    expect(m.history.kind).toBe('days');
    expect(m.history.days[0].entries[0].name.length).toBeGreaterThan(0);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const file = path.resolve(__dirname, '../../../flutter/test/fixtures/stats_model.json');
    // Метки времени в образце — относительные к сегодняшнему дню: для пробы Flutter форма важнее дат.
    const now = `${JSON.stringify(m, null, 1)}\n`;
    if (process.env.WRITE === '1') fs.writeFileSync(file, now, 'utf8');
    expect(fs.existsSync(file)).toBe(true);
  });
});

/**
 * 🔴 ОБРАЗЦЫ ДЛЯ DART (задача d6a60b02, вариант Б): модель вместе с ВХОДАМИ — всем хранилищем после
 * монтирования, мигом «сейчас» и поясом. Время заморожено (подменён только `Date`, таймеры живые):
 * образец не меняется от перезаписи к перезаписи. Перезапись — `WRITE=1 npx jest stats-host-model`.
 */
describe('«Прогресс» — образцы модели для Dart', () => {
  const NOW = Date.UTC(2026, 9, 7, 12, 34, 56);
  const ч = 3600000;
  const д = 24 * ч;
  const в = (ms: number) => new Date(NOW - ms).toISOString();
  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
    });
  });
  afterEach(() => { jest.useRealTimers(); });

  /** Партии «Микро-релакс» и чужие: уровни, дороги, мусорное время, старые имена, тренд области. */
  const богатые = () => [
    { profile_id: 'women', game_type: 'schulte_table', score: 25, time_seconds: 40, timestamp: в(3 * д), details: { level: 1 } },
    { profile_id: 'women', game_type: 'schulte_table', score: 25, time_seconds: 35, timestamp: в(2 * д), details: { level: 1 } },
    { profile_id: 'women', game_type: 'schulte_table', score: 36, time_seconds: 61, timestamp: в(1 * д + ч), details: { level: 2 } },
    { profile_id: 'women', game_type: 'schulte_table', score: 36, time_seconds: 1.78e9, timestamp: в(2 * ч), details: { level: 2 } },
    { profile_id: 'women', game_type: 'sudoku', score: 1500, time_seconds: 300, timestamp: в(5 * ч), passed: true, details: { level: 12, road: 'hard' } },
    { profile_id: 'women', game_type: 'sudoku', score: 1500, time_seconds: 290, timestamp: в(4 * ч), passed: true, details: { level: 12, road: 'hard' } },
    { profile_id: 'women', game_type: 'sudoku', score: 1200, time_seconds: 420, timestamp: в(3 * ч), passed: false, details: { level: 12, road: 'hard' } },
    { profile_id: 'women', game_type: 'sudoku', score: 900, time_seconds: 0.4, timestamp: в(3 * ч - 60000), details: { level: 3, road: 'normal' } },
    { profile_id: 'women', game_type: 'sudoku', score: 4000, time_seconds: 900, timestamp: в(6 * д), details: { level: 5, samurai: true } },
    { profile_id: 'women', game_type: 'word_mnemonics', score: 7, time_seconds: 50, timestamp: в(10 * д) },
    ...[20, 18, 16].map((d, i) => ({ profile_id: 'women', game_type: 'breathing', score: 10 + i, time_seconds: 120, timestamp: в(d * д) })),
    ...[6, 4, 1].map((d, i) => ({ profile_id: 'women', game_type: 'breathing', score: 12 + i, time_seconds: 120, timestamp: в(d * д + 2 * ч) })),
    { profile_id: 'women', game_type: 'retired_game', score: 3, time_seconds: 10, timestamp: в(9 * д) },
    { profile_id: 'women', game_type: 'corsi', score: 5, time_seconds: 70, timestamp: в(8 * д), passed: true },
    { profile_id: 'women', game_type: 'corsi', score: 6, time_seconds: 65, timestamp: в(7 * д), passed: true },
    { profile_id: 'women', game_type: 'n_back', timestamp: в(40 * д) },
    { game_type: 'schulte_table', score: 25, time_seconds: 30, timestamp: в(1 * д) },
    ...партии('nzt48', 'sudoku', 5).map((x, i) => ({ ...x, timestamp: в((i + 1) * д + 3 * ч) })),
    ...партии('nzt48', 'corsi', 3).map((x, i) => ({ ...x, timestamp: в((i + 1) * д + 5 * ч), passed: i !== 1 })),
  ];

  async function снять(name: string, opts: { scopeAll?: boolean; prep?: () => Promise<void>; profile?: string }) {
    const { last } = await смонтировать(true, async () => {
      if (opts.profile) await AsyncStorage.setItem('psygames_active_profile', opts.profile);
      if (opts.prep) await opts.prep();
    });
    // Дайджест недели приходит цепочкой после чтения партий (серия → кэш) — даём ей осесть.
    await осесть();
    if (opts.scopeAll) {
      await TestRenderer.act(async () => { (globalThis as any).__psyScreenUi['/statistics'].scope(true); });
      await осесть();
    }
    const m = last();
    const keys: string[] = [...(await AsyncStorage.getAllKeys())].sort();
    const storage: Record<string, string> = {};
    for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) storage[k] = v;
    // Серый текста — темы профиля, как у `ThemeProvider` без ручного выбора (модель его только расставляет).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PROFILE_THEME, FALLBACK_PROFILE_THEME, lightTheme, darkTheme } = require('@/src/contexts/ThemeContext');
    const mood = (PROFILE_THEME[storage.psygames_active_profile ?? 'free'] ?? FALLBACK_PROFILE_THEME).mood;
    const input = {
      storage, now: NOW, tzOffsetMinutes: new Date(NOW).getTimezoneOffset(), scopeAll: !!opts.scopeAll,
      textSecondary: (mood === 'dark' ? darkTheme : lightTheme).textSecondary,
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const dir = path.resolve(__dirname, '../../../flutter/test/fixtures');
    if (process.env.WRITE === '1') {
      fs.writeFileSync(path.join(dir, `stats_input_${name}.json`), `${JSON.stringify(input, null, 1)}\n`, 'utf8');
      fs.writeFileSync(path.join(dir, `stats_model_${name}.json`), `${JSON.stringify(m, null, 1)}\n`, 'utf8');
    }
    expect(fs.existsSync(path.join(dir, `stats_model_${name}.json`))).toBe(true);
    return m;
  }

  /**
   * Очки — точным числом и непременно в хранилище: у модуля очков свой кэш в памяти, прибавка идёт
   * поверх него, а нулевая прибавка не пишет ничего — и снимок хранилища разошёлся бы с тем, что
   * показал веб из кэша (замер: «все игры» — 777 на экране, ключа очков в снимке нет).
   */
  const очки = async (pid: string, n: number) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addTokens, getTokens } = require('@/src/services/tokens');
    await addTokens(pid, n - (await getTokens(pid)) + 1);
    await addTokens(pid, -1);
  };

  it('🔴 ru: профиль — свои партии, история с вердиктами, баланс со сдвигом, дайджест недели из кэша', async () => {
    const m = await снять('ru', {
      prep: async () => {
        await AsyncStorage.setItem('psygames_sessions', JSON.stringify(богатые()));
        await очки('women', 777);
        await AsyncStorage.setItem('psygames_streak_v1', JSON.stringify({ women: { streak: 5, last: '2026-10-7' } }));
        const { isoWeekKey } = jest.requireActual('@/src/services/aiInsight');
        await AsyncStorage.setItem(`psygames_ai_insight_weekly_digest_women_${isoWeekKey()}`, 'Неделя ровная: дыхание каждый день.');
      },
    });
    expect(m.ai?.text).toBe('Неделя ровная: дыхание каждый день.');
    expect(m.history.kind).toBe('days');
    const вердикты = m.history.days.flatMap((d: any) => d.entries.map((e: any) => e.verdict));
    expect(new Set(вердикты).size).toBeGreaterThanOrEqual(4);
    expect(m.areas.rows.some((r: any) => r.trend)).toBe(true);
  });

  it('ru, все игры: охват устройства, ничьи партии — тоже', async () => {
    const m = await снять('ru_all', {
      scopeAll: true,
      prep: async () => {
        await AsyncStorage.setItem('psygames_sessions', JSON.stringify(богатые()));
        await очки('women', 777);
      },
    });
    expect(m.scope.isAll).toBe(true);
  });

  it('en: файл состава закрывает игру профилю — ни карточки, ни истории; итог её считает', async () => {
    const m = await снять('en', {
      profile: 'vasilyeva',
      prep: async () => {
        await AsyncStorage.setItem('language', 'en');
        await AsyncStorage.setItem('psygames_sessions', JSON.stringify(богатые().map((s) => (s.profile_id === 'women' ? { ...s, profile_id: 'vasilyeva' } : s))));
        await AsyncStorage.setItem('psygames_playlists_override', JSON.stringify({
          профили: { vasilyeva: { игры: ['schulte_table', 'sudoku', 'corsi', 'breathing'], убрать: ['corsi'] } }, наборы: [],
        }));
        await очки('vasilyeva', 4321);
      },
    });
    expect(m.games.some((g: any) => g.id === 'corsi')).toBe(false);
    expect(/[А-Яа-яЁё]/.test(JSON.stringify({ ...m, history: null }))).toBe(false);
  });

  it('пусто — приглашение сыграть; партии только чужие — «не здесь»', async () => {
    const пусто = await снять('empty', { prep: async () => { await AsyncStorage.removeItem('psygames_sessions'); await очки('women', 0); } });
    expect(пусто.history.kind).toBe('empty');
    const чужие = await снять('scoped', {
      prep: async () => {
        await AsyncStorage.setItem('psygames_sessions', JSON.stringify(партии('nzt48', 'corsi', 3)));
        await очки('women', 0);
      },
    });
    expect(чужие.history.kind).toBe('scoped');
  });
});
