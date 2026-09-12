/* psygames-gate-fractal-deep-band-reaches-board · VER 1 · 11.09.2026 */
/**
 * 🔴 ВЫБРАННАЯ СТУПЕНЬ ТРУДНОСТИ ДОЕЗЖАЕТ ДО ДОСКИ, А НЕ ОСТАЁТСЯ НАДПИСЬЮ.
 *
 * ЗАЧЕМ ИМЕННО ТАК. Лестницу полос (DEEP_BANDS) сторожит соседняя проба
 * fractal-deep-difficulty — но она смотрит на ТАБЛИЦУ. Таблица может быть
 * безупречной, а экран продолжать звать материализацию со старой впаянной полосой:
 * ровно это и было до 11.09.2026 — `deepRatingForLevel` в движке существовала и не
 * вызывалась НИ ОТКУДА. Механизм есть, до игрока не доехал.
 *
 * Поэтому здесь настоящий экран и настоящие нажатия: жмём чип ступени, жмём «начать»
 * и смотрим, с какой полосой экран позвал `materializeNode`. Подмены самого движка
 * нет — обёртка записывает cfg.rating и зовёт настоящую функцию.
 *
 * ⚠️ ЧЕГО ПРОБА НЕ ЛОВИТ: правильность самих полос (это соседняя проба) и вид кнопок.
 */
import React from 'react';
import FractalDeepScreen from '@/app/games/sudoku-fractal-deep';
import { DEEP_BANDS } from '@/src/services/fractal-deep';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

/** Полосы, с которыми экран реально звал движок. Имя с приставкой mock — требование jest. */
const mockПолосы: number[] = [];
/** Приправа, с которой экран звал движок, — вторая величина, уезжающая через снимок. */
const mockПриправы: boolean[] = [];
/** Снимки, которые экран отдал на сохранение. */
const mockСохранено: { spice?: boolean; rating?: number; band?: number }[] = [];
/** Снимок, который подсовывается при подъёме партии (null — партии не было). */
const mockСнимок: { v: unknown } = { v: null };
jest.mock('@/src/services/fractal-deep', () => {
  const настоящий = jest.requireActual('@/src/services/fractal-deep');
  return {
    ...настоящий,
    materializeNode: (seed: string, path: string, cfg: { rating: number; spice?: boolean }, digit: number) => {
      mockПолосы.push(cfg.rating); mockПриправы.push(!!cfg.spice);
      return настоящий.materializeNode(seed, path, cfg, digit);
    },
    materializePick: (seed: string, path: string, cfg: { rating: number; spice?: boolean }) => {
      mockПолосы.push(cfg.rating); mockПриправы.push(!!cfg.spice);
      return настоящий.materializePick(seed, path, cfg);
    },
  };
});

jest.mock('@/src/hooks/useScreenWidth', () => ({ useScreenWidth: () => 390 }));
jest.mock('@/src/hooks/useGameKeyboard', () => ({ useGameKeyboard: () => {}, digitKeys: () => [] }));
/** Подъём партии — настоящим путём экрана: хук зовёт обработчик снимком. */
jest.mock('@/src/hooks/useResumeBoot', () => {
  const R = require('react');
  return {
    useResumeBoot: (_g: string, _v: number, onLoaded: (s: unknown) => void) => {
      R.useEffect(() => { if (mockСнимок.v) onLoaded(mockСнимок.v); }, []);
    },
  };
});
jest.mock('@/src/services/resume', () => ({
  saveResume: (_g: string, _p: string, _v: number, snap: Record<string, unknown>) => {
    mockСохранено.push(snap as never); return Promise.resolve();
  },
  clearResume: () => Promise.resolve(),
}));
jest.mock('@/src/services/api', () => ({ saveSession: () => Promise.resolve() }));
jest.mock('@/src/services/feedback', () => ({ sndPlace: () => {}, sndWrong: () => {} }));
jest.mock('@/src/services/gamePause', () => ({
  gameNow: () => 1_700_000_000_000, holdGame: () => () => {}, isGameHeld: () => false, onGameHold: () => () => {},
}));
jest.mock('@/src/utils/nav', () => ({ goBackOrHome: () => {} }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => {
  const R = require('react'); const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => R.createElement(View, p, children) };
});
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: true, colors: {
    background: '#111', surface: '#222', card: '#222', border: '#444', text: '#fff', textSecondary: '#aaa', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  // Ключ с хвостом, а не ключ в ключ: так видно, что до подписи доехал ИМЕННО этот ключ.
  useLanguage: () => ({ t: (k: string) => `${k}·т`, language: 'ru' }),
  LANGUAGES: [{ code: 'ru', name: 'Русский' }],
}));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
}));
jest.mock('@/src/components/GameShell', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/ResultActions', () => ({ __esModule: true, ResultActions: () => null }));
jest.mock('@/src/components/PencilMarksLayer', () => ({ __esModule: true, PencilMarksLayer: () => null }));
jest.mock('@/src/components/GlassButton', () => {
  const R = require('react'); const { Pressable, Text } = require('react-native');
  return { __esModule: true, default: ({ label, onPress }: any) =>
    R.createElement(Pressable, { testID: 'deep-start', onPress }, R.createElement(Text, null, label)) };
});

jest.setTimeout(120000);

let mounted: any[] = [];
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = [];
  mockПолосы.length = 0; mockПриправы.length = 0; mockСохранено.length = 0; mockСнимок.v = null;
});

function поднять() {
  let tree: any;
  TestRenderer.act(() => { tree = TestRenderer.create(React.createElement(FractalDeepScreen)); });
  mounted.push(tree);
  return tree;
}
const по = (tree: any, id: string) => tree.root.findAll((n: any) => n.props && n.props.testID === id)[0];
/** Нажать по testID. Узел ищется ЗДЕСЬ: после каждого нажатия дерево пересобирается,
 *  и ссылка, взятая заранее, указывала бы на снятый узел. */
const жать = (tree: any, id: string) => {
  const узел = по(tree, id);
  if (!узел) throw new Error(`нечего нажать: ${id}`);
  TestRenderer.act(() => { узел.props.onPress(); });
};
function текст(tree: any): string {
  const out: string[] = [];
  const идти = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n.children) идти(n.children);
  };
  идти(tree.toJSON());
  return out.join(' ');
}

describe('ступень трудности Бездны доезжает до доски', () => {
  it('🔴 все ступени видны на экране настройки и подписаны своим ключом', () => {
    const tree = поднять();
    const t = текст(tree);
    for (let i = 0; i < DEEP_BANDS.length; i++) {
      expect(`чип ${i}: ${по(tree, `deep-band-${i}`) ? 'есть' : 'НЕТ'}`).toBe(`чип ${i}: есть`);
      expect(t).toContain(`${DEEP_BANDS[i]!.nameKey}·т`);
    }
  });

  /**
   * ГЛАВНАЯ. Жмём верхнюю ступень, стартуем — и смотрим, с какой полосой экран позвал
   * движок. Если полосу снова впаяют в пресет, здесь окажется 1.2 вместо 5.7.
   */
  it('🔴 полоса, с которой экран зовёт движок, — это выбранная ступень', () => {
    const верх = DEEP_BANDS.length - 1;
    const tree = поднять();
    жать(tree, `deep-band-${верх}`);
    mockПолосы.length = 0;
    жать(tree, 'deep-start');
    const чужие = [...new Set(mockПолосы)].filter((r) => r !== DEEP_BANDS[верх]!.rating);
    expect(`звали с полосами ${[...new Set(mockПолосы)].join(',')}, чужих ${чужие.length}`)
      .toBe(`звали с полосами ${DEEP_BANDS[верх]!.rating}, чужих 0`);
  });

  /**
   * ОБЪЁМ И ТРУДНОСТЬ — РАЗНЫЕ РУЧКИ. До 11.09 маленькой, но трудной партии не
   * существовало: полоса приходила из пресета объёма. Берём САМЫЙ МАЛЕНЬКИЙ пресет и
   * САМУЮ ВЕРХНЮЮ ступень — такого сочетания раньше не было в принципе.
   */
  it('🔴 маленькая партия бывает трудной: пресет объёма полосу больше не задаёт', () => {
    const верх = DEEP_BANDS.length - 1;
    const tree = поднять();
    жать(tree, 'deep-preset-scout');
    жать(tree, `deep-band-${верх}`);
    mockПолосы.length = 0;
    жать(tree, 'deep-start');
    expect(`scout на полосе ${[...new Set(mockПолосы)].join(',')}`)
      .toBe(`scout на полосе ${DEEP_BANDS[верх]!.rating}`);
  });

  /**
   * ⚠️ ПРЕСЕТ ЗДЕСЬ `trek`, А НЕ `abyss`, И ЭТО НЕ ЛЕНЬ. Замер 11.09.2026: открытие
   * abyss материализует 2548 узлов — ВСЁ дерево партии, потому что отрисовка корня
   * спрашивает у каждой кормимой клетки, решён ли ребёнок, а тот — своих детей.
   * Проба на abyss шла 98 секунд, то есть стоила дороже всего набора раздела вместе
   * взятого. Полосу это не проверяет лучше: `trek` — та же глубина 3, тот же путь
   * через cfg. Сам шторм материализаций — отдельный дефект экрана, он записан.
   */
  it('🔴 нижняя ступень тоже доезжает — проба не зелена от одного значения', () => {
    const tree = поднять();
    жать(tree, 'deep-preset-trek');
    жать(tree, 'deep-band-0');
    mockПолосы.length = 0;
    жать(tree, 'deep-start');
    expect(`trek на полосе ${[...new Set(mockПолосы)].join(',')}`)
      .toBe(`trek на полосе ${DEEP_BANDS[0]!.rating}`);
  });
});

/**
 * 🔴 СНИМОК ПАРТИИ — ПОВЕДЕНИЕМ, А НЕ ГРЕПОМ ПО ИСХОДНИКУ.
 *
 * ⚠️ ПОВОД, 12.09.2026. Это же требование сторожил `deep-spice.test.ts` строкой
 * `expect(screen).toContain('({ preset, spice, seed, path, grids, marks, errors, elapsed')`.
 * 11.09 я вставил в снимок два поля (`rating`, `band`) — приправа осталась на месте,
 * дефекта не возникло, а литерал перестал совпадать: main покраснел и задержал выпуск.
 * Греп по исходнику ловит ПОРЯДОК СЛОВ, а сторожить надо, что величина переживает
 * сохранение и подъём. Здесь именно это: партия сохраняется, снимок подаётся обратно
 * настоящим путём (`useResumeBoot`), и сверяется, с чем экран зовёт движок ПОСЛЕ подъёма.
 */
describe('снимок партии Бездны переживает выход и подъём', () => {
  /** Сыграть настройку, выйти — и отдать то, что экран сохранил. */
  function снятьСнимок(band: number, приправа: boolean) {
    const tree = поднять();
    жать(tree, 'deep-preset-scout');
    жать(tree, `deep-band-${band}`);
    if (приправа) жать(tree, 'deep-spice-toggle');
    жать(tree, 'deep-start');
    mockСохранено.length = 0;
    TestRenderer.act(() => { tree.unmount(); });   // выход из партии сохраняет снимок
    return mockСохранено[mockСохранено.length - 1];
  }

  it('🔴 в снимок попадают И приправа, И полоса — обе задают доску', () => {
    const верх = DEEP_BANDS.length - 1;
    const снимок = снятьСнимок(верх, true);
    expect(`приправа ${снимок?.spice}, полоса ${снимок?.rating}`)
      .toBe(`приправа true, полоса ${DEEP_BANDS[верх]!.rating}`);
  });

  it('🔴 поднятая партия собирается ТЕМИ ЖЕ досками, а не настройкой по умолчанию', () => {
    const верх = DEEP_BANDS.length - 1;
    const снимок = снятьСнимок(верх, true);
    mockСнимок.v = снимок;
    mockПолосы.length = 0; mockПриправы.length = 0;
    поднять();
    expect(`полосы ${[...new Set(mockПолосы)].join(',')} · приправа ${[...new Set(mockПриправы)].join(',')}`)
      .toBe(`полосы ${DEEP_BANDS[верх]!.rating} · приправа true`);
  });

  /**
   * Снимки до 11.09.2026 полосы не несут. Продолжать их надо на ТОЙ, что была
   * впаяна в пресет (scout = 1.2), иначе дерево пересоберётся другими досками
   * под уже наигранной рукой.
   */
  it('🔴 старый снимок без полосы поднимается на впаянной в пресет, а не на верхней ступени', () => {
    const снимок = снятьСнимок(DEEP_BANDS.length - 1, false) as Record<string, unknown>;
    delete снимок.rating; delete снимок.band;   // форма снимка до 11.09
    mockСнимок.v = снимок;
    mockПолосы.length = 0;
    поднять();
    expect(`старый снимок scout поднялся на полосе ${[...new Set(mockПолосы)].join(',')}`)
      .toBe('старый снимок scout поднялся на полосе 1.2');
  });
});
