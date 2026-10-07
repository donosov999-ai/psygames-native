/* psygames-info-pages-host-model · VER 1 · 07.10.2026 */
/**
 * 🔴 «ИСТОЧНИКИ», «КОЛЛЕКЦИЯ», «ДОСТИЖЕНИЯ», «ЛИГИ» ПОД ОБОЛОЧКОЙ ОТДАЮТ МОДЕЛЬ — ТО ЖЕ, ЧТО РИСУЮТ
 * САМИ (задачи 78165c68, 8111eea4, 56660caa, ac902ebf; приём — `services/hostScreens.ts`).
 *
 * Экраны монтируются целиком на настоящих провайдерах; оболочка подменена.
 *   Источники: карточки = `SOURCES`, чтецы — оба корпуса; `open` открывает ссылку `Linking`.
 *   Коллекция: собрано столько, сколько даёт `chestState` по заработанному; тап по закрытой — подсказка
 *   с остатком до порога, по собранной — подсказки нет.
 *   Достижения: заголовок «открыто/всего», открытые — с датой по-человечески.
 *   Лиги: очки сезона = `seasonPointsFrom`, ровно одна текущая лига.
 * Образцы моделей — для проб Flutter (`flutter/test/fixtures/*_model.json`).
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

declare const process: { env: Record<string, string | undefined> };

const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => {
  const params = {};
  const nav = { addListener: () => () => {}, setOptions: () => {} };
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => params,
    useGlobalSearchParams: () => params,
    usePathname: () => '/',
    useFocusEffect: (cb: () => void | (() => void)) => { require('react').useEffect(cb, [cb]); },   // eslint-disable-line @typescript-eslint/no-require-imports
    useNavigation: () => nav,
    Redirect: () => null,
    Stack: { Screen: () => null },
    router: mockRouter,
  };
});
const mockBack = jest.fn();
jest.mock('@/src/utils/nav', () => ({ ...jest.requireActual('@/src/utils/nav'), goBackOrHome: () => mockBack() }));
jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');   // eslint-disable-line @typescript-eslint/no-require-imports
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaView: RN.View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    SafeAreaInsetsContext: { Consumer: ({ children }: any) => children(insets) },
    initialWindowMetrics: { insets, frame },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const RN = require('react-native');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  const g = globalThis as any;
  delete g.PsyBridge;
  delete g.__psyHostScreens;
  delete g.__psyScreenUi;
  jest.clearAllMocks();
});

const осесть = async () => {
  await TestRenderer.act(async () => {
    for (let i = 0; i < 10; i += 1) { await new Promise((ok) => setTimeout(ok, 0)); for (let k = 0; k < 10; k += 1) await Promise.resolve(); }
  });
};

const ЭКРАНЫ: Record<string, string> = {
  '/sources': '../../app/sources', '/collection': '../../app/collection',
  '/achievements': '../../app/achievements', '/leagues': '../../app/leagues',
};

async function смонтировать(route: string, host = true) {
  const sent: any[] = [];
  if (host) {
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    (globalThis as any).__psyHostScreens = ['/', ...Object.keys(ЭКРАНЫ)];
  }
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const Screen = require(ЭКРАНЫ[route]).default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen)))));
  });
  await осесть();
  поднятые.push(r);
  const last = () => [...sent].reverse().find((m) => m.op === 'screenUi' && m.route === route)?.model;
  const ui = () => (globalThis as any).__psyScreenUi[route];
  return { sent, last, ui };
}

function образец(name: string, m: object) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path');
  const file = path.resolve(__dirname, `../../../flutter/test/fixtures/${name}`);
  if (process.env.WRITE === '1') fs.writeFileSync(file, `${JSON.stringify(m, null, 1)}\n`, 'utf8');
  expect(fs.existsSync(file)).toBe(true);
}

const день = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'nzt48');
  await AsyncStorage.setItem('language', 'ru');
});

describe('Источники под оболочкой', () => {
  it('без оболочки модели нет', async () => {
    const { sent } = await смонтировать('/sources', false);
    expect(sent).toEqual([]);
  });

  it('🔴 карточки — все SOURCES, чтецы — оба корпуса; open — Linking', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SOURCES } = require('@/src/constants/sources');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VOICE_LIVE_CREDITS } = require('@/src/constants/voiceLive.generated');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LETTER_VOICE_CREDITS } = require('@/src/constants/letterVoice.generated');
    const { last, ui } = await смонтировать('/sources');
    const m = last();
    expect(m.cards.map((c: any) => c.url)).toEqual(SOURCES.map((s: any) => s.url));
    expect(m.voices.rows.length).toBe(VOICE_LIVE_CREDITS.length + LETTER_VOICE_CREDITS.length);
    const open = jest.spyOn(RN.Linking, 'openURL').mockResolvedValue(true);
    await TestRenderer.act(async () => { ui().open(m.cards[0].url); });
    expect(open).toHaveBeenCalledWith(m.cards[0].url);
    await TestRenderer.act(async () => { ui().back(); });
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    образец('sources_model.json', m);
  });

  it('🔴 EN: имена и авторство источников — по-английски (было «Записи произношения Викисловаря»); образец для Dart', async () => {
    await AsyncStorage.setItem('language', 'en');
    const { last } = await смонтировать('/sources');
    const m = last();
    const cyr = /[А-Яа-яЁё]/;
    expect(m.cards.filter((c: any) => cyr.test(c.name) || cyr.test(c.credit ?? '') || cyr.test(c.what)).map((c: any) => c.name)).toEqual([]);
    образец('sources_model_en.json', m);
  });
});

describe('Коллекция под оболочкой', () => {
  it('🔴 собрано по chestState; тап по закрытой — подсказка с остатком, по собранной — нет', async () => {
    await AsyncStorage.setItem('psygames_earned_total_v1', JSON.stringify({ nzt48: 500 }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { chestState, фигурки } = require('@/src/services/collection');
    const { last, ui } = await смонтировать('/collection');
    const m = last();
    const собрано = chestState(500).have;
    expect(m.figures.filter((f: any) => f.owned).length).toBe(собрано);
    expect(m.figures.length).toBe(фигурки().length);
    expect(m.hint).toBe(null);
    await TestRenderer.act(async () => { ui().tap(собрано); });
    const закрытая = фигурки()[собрано];
    expect(last().hint).toContain(String(Math.max(0, закрытая.at - 500)));
    if (собрано > 0) {
      await TestRenderer.act(async () => { ui().tap(0); });
      expect(last().hint).toBe(null);
    }
    образец('collection_model.json', m);
  });
});

describe('Достижения под оболочкой', () => {
  it('🔴 заголовок «открыто/всего», открытые — с датой по-человечески', async () => {
    await AsyncStorage.setItem('psygames_achievements_unlocked', JSON.stringify([
      { id: 'first_session', date: '2026-10-01' }, { id: 'sessions_10', date: '2026-10-05' },
    ]));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ACHIEVEMENTS } = require('@/src/services/achievements');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { humanDate } = require('../../app/achievements');
    const { last, ui } = await смонтировать('/achievements');
    const m = last();
    expect(m.title).toContain(`2/${ACHIEVEMENTS.length}`);
    const карточки = m.sections.flatMap((s: any) => s.cards);
    expect(карточки.length).toBe(ACHIEVEMENTS.length);
    expect(карточки.filter((c: any) => c.unlocked).map((c: any) => c.id).sort()).toEqual(['first_session', 'sessions_10']);
    expect(карточки.find((c: any) => c.id === 'first_session').date).toBe(humanDate('2026-10-01', 'ru'));
    await TestRenderer.act(async () => { ui().back(); });
    expect(mockBack).toHaveBeenCalledTimes(1);
    образец('achievements_model.json', m);
  });
});

describe('Лиги под оболочкой', () => {
  it('🔴 очки сезона = seasonPointsFrom, текущая лига одна', async () => {
    const партии = [
      { profile_id: 'nzt48', game_type: 'sudoku', score: 400, time_seconds: 60, timestamp: день(1) },
      { profile_id: 'nzt48', game_type: 'corsi', score: 350, time_seconds: 60, timestamp: день(3) },
      { profile_id: 'nzt48', game_type: 'corsi', score: 900, time_seconds: 60, timestamp: день(60) },
    ];
    await AsyncStorage.setItem('psygames_sessions', JSON.stringify(партии));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { seasonPointsFrom } = require('@/src/services/progression');
    const { last } = await смонтировать('/leagues');
    const m = last();
    expect(m.card.pts).toBe(String(seasonPointsFrom(партии)));
    expect(m.leagues.filter((l: any) => l.here).length).toBe(1);
    expect(m.empty).toBe(null);
    образец('leagues_model.json', m);
    // Входы эталона — для сверки расчёта на Dart (вариант Б): очки сезона считаются от «сейчас».
    образец('leagues_input.json', { now: Date.now(), sessions: партии });
  });

  it('формулы лиг — эталон по точкам для Dart: границы каждой лиги ±1, середины рангов, верх', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { LEAGUES, standingFor, earnedFrames } = require('@/src/services/progression');
    const точки = new Set<number>([0, 1, 7, 133, 266, 267, 1e6]);
    for (const l of LEAGUES) for (const d of [-1, 0, 1, 2, 99, 333, 777]) if (l.from + d >= 0) точки.add(l.from + d);
    const rows = [...точки].sort((a, b) => a - b).map((pts) => {
      const st = standingFor(pts);
      return { pts, league: st.league.id, rank: st.rank, toNext: st.toNext, progress: Number(st.progress.toFixed(12)), frames: earnedFrames(pts).map((f: any) => f.id) };
    });
    expect(rows.length).toBeGreaterThan(60);
    образец('progression_oracle.json', rows);
  });

  it('EN — тот же расчёт, строки по-английски; образец для Dart', async () => {
    await AsyncStorage.setItem('language', 'en');
    const партии = [
      { profile_id: 'nzt48', game_type: 'sudoku', score: 5200, time_seconds: 60, timestamp: день(2) },
      { profile_id: 'nzt48', game_type: 'corsi', score: 80, time_seconds: 60, timestamp: день(29) },
    ];
    await AsyncStorage.setItem('psygames_sessions', JSON.stringify(партии));
    const { last } = await смонтировать('/leagues');
    const m = last();
    expect(m.card.pts).toBe('5280');
    expect(/[А-Яа-яЁё]/.test(JSON.stringify(m))).toBe(false);
    образец('leagues_model_en.json', m);
    образец('leagues_input_en.json', { now: Date.now(), sessions: партии });
  });
});
