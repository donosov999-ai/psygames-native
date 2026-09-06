/**
 * 🔴 ОДИН СПИСОК РЕЖИМОВ, И ПОТОК ПРИМЕНЯЕТСЯ К ЛЮБОМУ ИЗ НИХ.
 *
 * Отчёт Дениса 05.09.2026 (`dda068e8`), помечен fixed в 2.43.0, дословно: «чем мат
 * с жертвой отличается от других типов мата? по сути ты выбираешь режим и его
 * отрабатываешь, а у тебя мат с жертвой вынесен отдельно, остальные отдельно, и
 * ещё режим потока — он только к одному».
 *
 * Он прав по устройству: жертва — ТАКОЙ ЖЕ узор, как арабский или эполетный, и
 * своего входа ей не нужно; а поток — не режим, а ПАРАМЕТР времени, и обязан
 * применяться к чему угодно.
 *
 * ⚠️ Отчёт помечен починенным, но исполнением его никто не проверял: сегодня из
 * трёх таких отметок две оказались неверны (у одной дефект был жив, у другой гейт
 * не ловил свою же поломку). Поэтому здесь настоящий экран и настоящие нажатия.
 */
import React from 'react';

import { buildDeck, buildFlowDeck, levelParams } from '@/src/games/scholars-mate/core/deck';
import { starsFor, ступеньПоМедиане } from '@/src/games/scholars-mate/core/run';
/**
 * ⚠️ Импорт экрана стоит ЗДЕСЬ, вместе с остальными, хотя ниже идут `jest.mock`.
 * Babel поднимает вызовы `jest.mock` выше импортов сам, поэтому моки успевают
 * встать; а импорт в теле модуля даёт предупреждение `import/first`, и потолок
 * линта поднимать нельзя.
 */
import ScholarsMateScreen from '@/app/games/scholars-mate';

declare function require(m: string): any;
const TestRenderer = require('react-test-renderer');

/**
 * Уровень, поднятый игрой, — за ним и следим.
 * ⚠️ Имена с приставкой `mock`: jest пускает в фабрику мока только такие
 * внешние переменные, иначе набор не собирается вовсе.
 */
const mockПоднято: number[] = [];
const mockПровалов: number[] = [];

jest.mock('@/src/hooks/usePersistentLevel', () => ({
  usePersistentLevel: () => ({
    level: 1, best: 1, loaded: true,
    reach: (n: number) => { mockПоднято.push(n); },
    fail: () => { mockПровалов.push(1); },
    pick: () => {},
  }),
}));
/** Признак «шаг зарядки» — переключаемый: без него ветка isPreset не проверяется. */
const mockПресет = { on: false };
jest.mock('@/src/hooks/useGamePreset', () => ({
  useGamePreset: () => ({ isPreset: mockПресет.on, autostart: false, num: (_k: string, d: number) => d, isCalm: false }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/hooks/useGameMode', () => ({
  useGameMode: () => 'levels',
  shouldChainNextLevel: (m: string) => m === 'levels',
}));
jest.mock('@/src/hooks/useCalmHush', () => ({ useCalmHush: () => {} }));
jest.mock('@/src/hooks/useScreenWidth', () => ({ useScreenWidth: () => 390, useScreenSize: () => ({ w: 390, h: 844 }) }));
jest.mock('@/src/services/api', () => ({ saveSession: () => Promise.resolve() }));
/** Игровые часы под управлением пробы — иначе до конца десятиминутного потока не дойти. */
const mockЧасы = { t: 1_000_000 };
jest.mock('@/src/services/gamePause', () => ({
  gameNow: () => mockЧасы.t,
  holdGame: () => () => {},
  isGameHeld: () => false,
  onGameHold: () => () => {},
}));
jest.mock('@/src/utils/nav', () => ({ goBackOrHome: () => {} }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/scholars-mate', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({ active: false, stopWarmup: () => {}, next: () => {}, step: 0, total: 0 }),
}));
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
  useProfileOptional: () => ({ profile: { id: 'p1', display_name: 'Денис' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({
  /**
   * ⚠️ `t` ВОЗВРАЩАЕТ НЕ КЛЮЧ, А КЛЮЧ С ХВОСТОМ. Экран прячет имя узора, когда
   * перевода нет: `имяУзора` сравнивает `t(ключ) === ключ` и отдаёт пустую строку.
   * С мокой «ключ в ключ» ВСЕ строки узоров получали пустую подпись, проба их не
   * находила и жала «Начать» — то есть проверяла лестницу вместо отработки узора и
   * при этом зеленела. Мутация «поток не применяется к узору» проходила её насквозь.
   */
  useLanguage: () => ({ t: (k: string) => `${k}·т`, language: 'ru' }),
}));
/** Оболочки — только рамка вокруг партии, содержимое пропускаем как есть. */
jest.mock('@/src/components/GameShell', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/GradientSurface', () => {
  const R = require('react'); const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: any) => R.createElement(View, null, children) };
});
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/GameSetupBar', () => {
  const R = require('react'); const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    SETUP_BAR_SPACE: 0,
    default: ({ onStart }: any) => R.createElement(
      Pressable, { accessibilityRole: 'button', accessibilityLabel: 'НАЧАТЬ', onPress: onStart },
      R.createElement(Text, null, 'НАЧАТЬ'),
    ),
  };
});
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));



let mounted: any[] = [];
afterEach(() => {
  TestRenderer.act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted = [];
  mockПоднято.length = 0; mockПровалов.length = 0; mockПресет.on = false;
});
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

function текст(tree: any): string {
  const out: string[] = [];
  const идти = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(идти); return; }
    if (n.children) идти(n.children);
  };
  идти(tree.toJSON());
  return out.join(' ').replace(/\s+/g, ' ');
}
const уник = (n: any[]) => { const s = new Set(); return n.filter((x) => !s.has(x.props.onPress) && s.add(x.props.onPress)); };
function поМетке(tree: any, метка: string) {
  return уник(tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && String(n.props.accessibilityLabel ?? '').replace(/·т$/, '') === метка, { deep: true }));
}
function нажать(tree: any, метка: string) {
  const у = поМетке(tree, метка);
  if (!у.length) throw new Error(`нет кнопки «${метка}»`);
  TestRenderer.act(() => { у[0].props.onPress(); });
}
function смонтировать() {
  let tree: any;
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(ScholarsMateScreen as any));
    mounted.push(tree);
  });
  return tree;
}

describe('«Детский мат»: жертва — строка общего списка, поток — параметр', () => {
  it('🔴 жертва и именованные узоры лежат в ОДНОМ списке, а не двумя входами', () => {
    const tree = смонтировать();
    // Список закрыт — ни жертвы, ни узоров не видно: значит вход действительно один.
    expect(`жертва видна до раскрытия списка: ${поМетке(tree, 'scholarsSacrificeMode').length > 0}`)
      .toBe('жертва видна до раскрытия списка: false');

    нажать(tree, 'scholarsPickMotif');

    const жертва = поМетке(tree, 'scholarsSacrificeMode');
    expect(`жертва в раскрытом списке: ${жертва.length}`).toBe('жертва в раскрытом списке: 1');

    // И рядом с ней — именованные узоры, тем же видом строки.
    const строкиУзоров = уник(tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && Array.isArray(n.props?.style)
      && n.props.style.some((s: any) => s && typeof s === 'object' && s.minHeight === 48 && s.borderWidth === 1),
      { deep: true }));
    expect(`строк в списке (жертва + узоры): ${строкиУзоров.length >= 3}`)
      .toBe('строк в списке (жертва + узоры): true');
  });

  it('🔴 поток применяется к ЖЕРТВЕ, а не только к лестнице', () => {
    const tree = смонтировать();
    нажать(tree, 'scholarsFlow');          // параметр времени
    нажать(tree, 'scholarsPickMotif');
    нажать(tree, 'scholarsSacrificeMode'); // выбор узора
    // ⚠️ Остаток потока заполняется В ТИКЕ секундомера, а не при отрисовке: до
    // первого тика строка пуста, и проба без этой строки объявляла бы дефект на
    // исправном коде.
    TestRenderer.act(() => { jest.advanceTimersByTime(200); });

    const t = текст(tree);
    // Вопрос — про жертву, а не про обычный мат.
    expect(`вопрос про жертву: ${t.includes('scholarsSacrificeAsk')}`).toBe('вопрос про жертву: true');
    // И идёт именно поток: вместо «1/8» показан остаток времени «м:сс».
    expect(`показан остаток потока, а не счёт позиций: ${/\d+:\d\d/.test(t) && !/ 1\/\d/.test(t)}`)
      .toBe('показан остаток потока, а не счёт позиций: true');
  });

  it('🔴 поток применяется и к ИМЕНОВАННОМУ узору', () => {
    const tree = смонтировать();
    нажать(tree, 'scholarsFlow');
    нажать(tree, 'scholarsPickMotif');

    // Первая строка узора после жертвы — берём её метку из дерева.
    // Строки узоров подписаны ключами вида `scholarsMotif…`; жертва и служебные — нет.
    const метки: string[] = уник(tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && /^scholarsMotif/.test(String(n.props.accessibilityLabel ?? '')), { deep: true }))
      .map((n: any) => String(n.props.accessibilityLabel).replace(/·т$/, ''));
    expect(`строк именованных узоров: ${метки.length >= 2}`).toBe('строк именованных узоров: true');

    нажать(tree, метки[0]!);
    TestRenderer.act(() => { jest.advanceTimersByTime(200); });
    const t = текст(tree);
    expect(`идёт поток: ${/\d+:\d\d/.test(t)}`).toBe('идёт поток: true');
    /**
     * 🔴 И ПУЛ ДЕЙСТВИТЕЛЬНО СУЖЕН ДО ВЫБРАННОГО УЗОРА. Без этой строки мутация
     * «узор при выборе сбрасывается в ноль» проходит насквозь: поток идёт, доска
     * нарисована, а играется смешанная лестница — то есть отработка узора молча
     * подменена. Экран подписывает узор под вопросом, по подписи и судим.
     */
    expect(`на экране имя выбранного узора «${метки[0]}»: ${t.includes(метки[0]!)}`)
      .toBe(`на экране имя выбранного узора «${метки[0]}»: true`);
    expect(`доска нарисована: ${tree.root.findAll((n: any) => /^[a-h][1-8](,|$)/.test(String(n.props?.accessibilityLabel ?? '')), { deep: true }).length > 0}`)
      .toBe('доска нарисована: true');
  });
});
