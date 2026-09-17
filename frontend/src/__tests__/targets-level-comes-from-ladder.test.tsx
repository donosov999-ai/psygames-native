/* psygames-targets-level-comes-from-ladder · VER 1 · 17.09.2026 */
/**
 * «МИШЕНИ»: УРОВЕНЬ ПАРТИИ ДАЁТ ТОЛЬКО ЛЕСТНИЦА — НА НАСТРОЙКЕ ЕЁ НЕЧЕМ ОБОЙТИ.
 *
 * 📍 БЫЛО (main 33ca8e3c, задача a4d7e3c7): на настройке стоял ручной ряд «Уровень 1…10» рядом с
 * картой, а старт считался `Math.max(level, lvl.level)`. `level` — это и ручной ряд, и уровень
 * прошлой партии того же захода. Отсюда три обхода лестницы:
 *   1) новичок жал «10» — партия шла с десятого, и через 10 раундов `lvl.reach(11)` записывал
 *      11 достигнутым мимо десяти ступеней;
 *   2) понижение после трёх провалов подряд (`lvl.fail`) не действовало до перезахода: следующий
 *      старт брал уровень прошлой партии;
 *   3) переигровка пройденной ступени на карте (`lvl.pick`) после первой партии не срабатывала.
 *
 * КАК ПРОВЕРЯЕТСЯ — ПОВЕДЕНИЕМ. Экран монтируется целиком, уровень кладётся в хранилище тем же
 * ключом, что пишет usePersistentLevel. Партия начинается кнопками «Start» → «START». Уровень
 * партии читается из счётчика уровня, который экран отдаёт каркасу (GameShell подменён ловушкой
 * пропсов). Партию до конца доводят пропуски мишеней на фальшивых часах: Math.random = 0,1, так что
 * мишень — каждый раунд, жизней 3 + 5 = 8 меньше 10 раундов уровня, и повышения внутри партии нет.
 * Экран итога подменён ловушкой, «Стоп» возвращает на настройку.
 * 🔴 СЛЕПОЕ = КРАСНОЕ: нет счётчика уровня, нет итога партии, нет узла карты — проверка краснеет
 * с причиной, а не проходит пустой.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/games/targets',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));
const захват: { hud?: any[]; итог?: any } = {};
jest.mock('@/src/components/GameShell', () => ({
  __esModule: true,
  default: (p: any) => { захват.hud = p.hud; return null; },
}));
jest.mock('@/src/components/LevelCleared', () => ({
  __esModule: true,
  default: (p: any) => { захват.итог = p; return null; },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { __resetGameClock } = require('@/src/services/gamePause');
const { resetLevelCacheForTests } = require('@/src/services/levelCache');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
beforeEach(() => { jest.useFakeTimers(); __resetGameClock(); захват.hud = undefined; захват.итог = undefined; });
afterEach(() => {
  jest.restoreAllMocks();
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
  jest.useRealTimers();
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const текстУзла = (n: any): string => n.findAll((x: any) => typeof x.props?.children === 'string' || typeof x.props?.children === 'number' || Array.isArray(x.props?.children), { deep: true })
  .map((x: any) => (Array.isArray(x.props.children)
    ? x.props.children.filter((c: any) => typeof c === 'string' || typeof c === 'number').join('')
    : String(x.props.children)))
  .filter((s: string) => s.trim())
  .join(' ');
const нажимаемые = (r: any) => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true });
async function нажать(узел: any) {
  await TestRenderer.act(async () => { узел.props.onPress({ nativeEvent: {}, preventDefault() {}, stopPropagation() {} }); });
  await осесть();
}

async function смонтировать(хранилище: Record<string, string> = {}) {
  await AsyncStorage.clear();
  resetLevelCacheForTests();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  for (const [k, v] of Object.entries(хранилище)) await AsyncStorage.setItem(k, v);
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/targets').default;
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
  const понятно = нажимаемые(r).find((b: any) => /^got it$/i.test(текстУзла(b).trim()));
  if (понятно) await нажать(понятно);
  return r;
}

/** «Start» на настройке, затем «START» на экране готовности. Возвращает уровень из счётчика партии. */
async function начатьПартию(r: any): Promise<number | string> {
  const старт = нажимаемые(r).find((b: any) => String(b.props.accessibilityLabel) === 'Start')
    ?? нажимаемые(r).find((b: any) => /^start$/i.test(текстУзла(b).trim()));
  if (!старт) return 'нет кнопки Start на настройке';
  await нажать(старт);
  const готов = нажимаемые(r).find((b: any) => /^(start\s*)+$/i.test(текстУзла(b).trim()));
  if (!готов) return 'нет кнопки START на экране готовности';
  await нажать(готов);
  const счётчик = (захват.hud ?? []).find((x: any) => x.key === 'lvl');
  return счётчик ? Number(счётчик.value) : 'каркас партии не получил счётчика уровня';
}

/** Партия без единого нажатия: все раунды — мишени, жизни кончаются, экран итога → «Стоп» → настройка. */
async function доигратьИВернуться(): Promise<string> {
  jest.spyOn(Math, 'random').mockReturnValue(0.1);
  for (let t = 0; t < 90_000 && !захват.итог; t += 250) {
    await TestRenderer.act(async () => { jest.advanceTimersByTime(250); });
    await осесть();
  }
  (Math.random as jest.Mock).mockRestore();
  if (!захват.итог) return 'за 90 с партия не дошла до итога';
  const итог = захват.итог;
  захват.итог = undefined;
  await TestRenderer.act(async () => { итог.onStop(); });
  await осесть();
  return 'на настройке';
}

const УРОВЕНЬ = 'psygames_targets_level_free';
const ПРОВАЛЫ = 'psygames_targets_failstreak_free';

describe('«Мишени»: уровень партии даёт только лестница', () => {
  it('на настройке нет ручного выбора уровня: новичок стартует с первого', async () => {
    const r = await смонтировать();
    // Ручной ряд рисовал голые числа «1…10». Узлы карты — пустые кнопки с подписью «Level N».
    // ⚠️ Текст кнопки приходит дважды («10 10»: составной Text и его узел) — повтор допустим.
    // Первая редакция ждала ровно одно число и на вернутом ряду оставалась зелёной (мутация B).
    const числовые = нажимаемые(r).filter((b: any) => /^(\d+)(\s+\1)*$/.test(текстУзла(b).trim()));
    for (const b of числовые) await нажать(b);   // если ряд вернули — жмём всё, последним «10»
    expect(await начатьПартию(r)).toBe(1);
    expect(числовые.map((b: any) => текстУзла(b).trim())).toEqual([]);
  });

  it('достигнутый уровень — это уровень старта', async () => {
    const r = await смонтировать({ [УРОВЕНЬ]: '7' });
    expect(await начатьПартию(r)).toBe(7);
  });

  it('понижение после трёх провалов подряд действует на следующем старте, без перезахода', async () => {
    const r = await смонтировать({ [УРОВЕНЬ]: '7', [ПРОВАЛЫ]: '2' });
    expect(await начатьПартию(r)).toBe(7);
    expect(await доигратьИВернуться()).toBe('на настройке');
    expect(await начатьПартию(r)).toBe(6);
  });

  it('переигровка пройденной ступени на карте срабатывает и после партии', async () => {
    const r = await смонтировать({ [УРОВЕНЬ]: '7' });
    expect(await начатьПартию(r)).toBe(7);
    expect(await доигратьИВернуться()).toBe('на настройке');
    const узел = нажимаемые(r).find((b: any) => /^Level 3(,|$)/.test(String(b.props.accessibilityLabel ?? '')));
    expect(узел ? 'узел «Level 3» на карте есть' : 'на карте нет узла «Level 3»').toBe('узел «Level 3» на карте есть');
    await нажать(узел);
    expect(await начатьПартию(r)).toBe(3);
  });
});
