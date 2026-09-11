/* psygames-warmup-step-does-not-crash · VER 1 · 10.09.2026 */
/**
 * ШАГ ЗАРЯДКИ ОТКРЫВАЕТСЯ, А НЕ РОНЯЕТ ПРИЛОЖЕНИЕ.
 *
 * 🔴 ПОВОД — падение у Дениса 10.09.2026, языковая зарядка, ВТОРОЕ упражнение:
 * «undefined is not an object (evaluating 'SCRIPTS[mode].chars')». Весь заход
 * зарядки терялся.
 *
 * Причина в расхождении имён. У корректуры два параметра: `mode` — ПИСЬМЕННОСТЬ
 * (латиница, кириллица, греческий…), `taskMode` — ВИД ЗАДАНИЯ (буквы/филворды).
 * `wordWarmupSteps` слал `mode: 'fillwords'`; экран искал такую письменность в
 * `SCRIPTS`, не находил и разбивался о `.chars` у `undefined`.
 *
 * ⚠️ Дефект жил вдвойне: `taskMode` экран не читал из пресета ВООБЩЕ — то есть даже
 * без падения филворды в зарядке не включились бы ни разу.
 *
 * 🔴 ПОЧЕМУ ПРОБА ПОВЕДЕНЧЕСКАЯ, А НЕ ПО ИМЕНАМ. Первая моя редакция сверяла, что
 * каждое имя параметра экран читает, — и МУТАЦИЮ НЕ ПОЙМАЛА: `mode` экран читает,
 * негодным было ЗНАЧЕНИЕ. Проверка имён здесь бессильна по устройству. Поэтому
 * экран монтируется с теми же параметрами, что подаёт зарядка, и обязан открыться.
 *
 * ⚠️ Ни tsc, ни линт этого не видят: значение приходит из параметров маршрута,
 * а `str(...) as ScriptId` — приведение типа, а не проверка.
 */
import React from 'react';

declare const __dirname: string;
const TestRenderer = require('react-test-renderer');   // eslint-disable-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs');                // eslint-disable-line @typescript-eslint/no-require-imports
const { join } = require('path');                      // eslint-disable-line @typescript-eslint/no-require-imports

/**
 * Параметры шага подставляются как параметры маршрута — так их видит экран.
 * ⚠️ Имя с префиксом `mock`: jest не пускает в фабрику подмены внешние переменные,
 * и только этот префикс разрешён.
 */
const mockПараметры: { текущие: Record<string, string> } = { текущие: {} };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => mockПараметры.текущие,
  useGlobalSearchParams: () => mockПараметры.текущие,
  usePathname: () => '/games/proofreading',
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

/** Разобрать `настройки: { ... }` из построителей шагов зарядки. */
function шагиЗарядки(): { маршрут: string; параметры: Record<string, string> }[] {
  const с = readFileSync(join(__dirname, '../services/chessWarmup.ts'), 'utf8');
  const из: { маршрут: string; параметры: Record<string, string> }[] = [];
  const re = /game_route:\s*'([^']+)'[^}]*?настройки:\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(с))) {
    const параметры: Record<string, string> = {};
    for (const п of m[2].matchAll(/([A-Za-z_][\w]*)\s*:\s*'([^']*)'/g)) параметры[п[1]] = п[2];
    if (Object.keys(параметры).length) из.push({ маршрут: m[1], параметры });
  }
  return из;
}

async function открыть(путь: string) {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');       // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext'); // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');   // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context'); // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require(`../../app/${путь.replace(/^\//, '')}`).default;  // eslint-disable-line
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(Screen))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  открытые.push(r);
  return r;
}

describe('шаг зарядки открывается с её же параметрами', () => {
  it('есть что проверять — шаги с настройками найдены', () => {
    const ш = шагиЗарядки();
    expect(ш.length).toBeGreaterThan(0);
    expect(ш.some((x) => x.маршрут === '/games/proofreading')).toBe(true);
  });

  for (const { маршрут, параметры } of шагиЗарядки()) {
    it(`🔴 ${маршрут} не падает на ${JSON.stringify(параметры)}`, async () => {
      mockПараметры.текущие = { ...параметры, wu: '1', preset: '1' };
      const r = await открыть(маршрут);
      expect(r.toJSON()).toBeTruthy();
      mockПараметры.текущие = {};
    });
  }

  it('🔴 контрпроба: негодная письменность не роняет корректуру', async () => {
    // Ровно то значение, что подавала зарядка до починки.
    mockПараметры.текущие = { mode: 'fillwords', wu: '1', preset: '1' };
    const r = await открыть('/games/proofreading');
    expect(r.toJSON()).toBeTruthy();
    mockПараметры.текущие = {};
  });
});
