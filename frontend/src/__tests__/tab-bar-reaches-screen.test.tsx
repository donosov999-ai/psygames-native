/* eslint-disable @typescript-eslint/no-require-imports -- компонент берётся ПОСЛЕ подмен. */
/**
 * 🔴 ПОЛОСА ОБЯЗАНА ДОЙТИ ДО ЭКРАНА, А НЕ ОСТАТЬСЯ В СЕРВИСЕ.
 *
 * `tab-bar-core` проверяет, ЧТО должно быть на полосе. Это половина: ровно так
 * же выглядела бы задача, где сервис написан, покрыт пробами и никем не вызван.
 * Здесь полоса монтируется по-настоящему и смотрим, что нарисовалось.
 */
const пути: string[] = ['/'];
jest.mock('expo-router', () => ({
  usePathname: () => пути[0],
  router: { push: () => {}, replace: () => {}, canGoBack: () => false, back: () => {} },
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 34 } };

function нарисовать(path: string) {
  пути[0] = path;
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  // ⚠️ ProfileProvider обязателен: язык в приложении свой у каждого профиля, и
  // LanguageProvider спрашивает профиль. Без него падает не полоса, а словарь.
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const BottomTabBar = require('@/src/components/BottomTabBar').default;
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(BottomTabBar))))),
    );
  });
  return r;
}

const смонтированные: any[] = [];
afterEach(() => {
  const TestRenderer = require('react-test-renderer');
  смонтированные.splice(0).forEach((r) => TestRenderer.act(() => r.unmount()));
});

describe('полоса вкладок на экране', () => {
  /**
   * ⚠️ ЯЗЫК НЕ ЗАШИТ. Приложение в пробах поднимается на английском, и ожидание
   * «Главная» покраснело бы не потому, что полоса не дошла, а потому что дошла
   * по-английски. Проверяется ровно то, ради чего проба: пять непустых РАЗНЫХ
   * подписей на своих местах. Что подписи есть во всех двенадцати языках,
   * сторожит i18n-coverage; что ключи не задублированы — dictionary-duplicates.
   */
  const подписи = (r: any): string[] => r.root
    .findAll((n: any) => typeof n.props?.testID === 'string'
      && n.props.testID.startsWith('tab-') && typeof n.props?.onPress === 'function')
    .map((к: any) => {
      // Узел проб — не JSON-дерево: строки собираются обходом его детей.
      const слова: string[] = [];
      const идти = (n: any) => {
        if (typeof n === 'string') { слова.push(n); return; }
        if (!n || typeof n !== 'object') return;
        (n.children ?? []).forEach(идти);
      };
      идти(к);
      return слова.join(' ').trim();
    });

  it('🔴 на главной нарисованы все пять вкладок, у каждой своя подпись', () => {
    const r = нарисовать('/'); смонтированные.push(r);
    const п = подписи(r);
    expect(п.length).toBe(5);
    expect(п.filter((s) => s.length > 0).length).toBe(5);
    expect(new Set(п).size).toBe(5);
  });

  it('🔴 внутри игры полосы нет вовсе', () => {
    const r = нарисовать('/games/schulte'); смонтированные.push(r);
    const есть = r.root.findAll((n: any) => n.props?.testID === 'bottom-tab-bar');
    expect(`полоса в игре: ${есть.length}`).toBe('полоса в игре: 0');
  });

  it('🔴 а на самом каталоге — есть', () => {
    const r = нарисовать('/games'); смонтированные.push(r);
    expect(подписи(r).length).toBe(5);
  });

  it('высота полосы учитывает безопасную зону снизу', () => {
    const { TAB_BAR_H } = require('@/src/services/tabBar');
    const r = нарисовать('/'); смонтированные.push(r);
    const узел = r.root.findAll((n: any) => n.props?.testID === 'bottom-tab-bar' && typeof n.type === 'string')[0];
    const стиль = Object.assign({}, ...[узел.props.style].flat(9).filter(Boolean));
    expect(стиль.height).toBe(TAB_BAR_H + МЕТРИК.insets.bottom);
    expect(стиль.paddingBottom).toBe(МЕТРИК.insets.bottom);
  });

  it('🔴 у каждой вкладки своя цель нажатия и роль кнопки', () => {
    const r = нарисовать('/'); смонтированные.push(r);
    const кнопки = r.root.findAll((n: any) => typeof n.props?.testID === 'string'
      && n.props.testID.startsWith('tab-') && typeof n.props?.onPress === 'function');
    expect(кнопки.length).toBe(5);
    for (const к of кнопки) expect(к.props.accessibilityRole).toBe('button');
  });
});
