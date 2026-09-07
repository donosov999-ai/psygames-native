/**
 * 🔴 КУСОК ТОРТА ВЫГЛЯДИТ ТОРТОМ, А НЕ ДОЛЕЙ ДИАГРАММЫ.
 *
 * Денис 07.09.2026: «тортики надо отрисовать, щас страшные». Клинья рисовались
 * одноцветными треугольниками — шесть заливок в круге читаются как круговая
 * диаграмма, а не как кондитерская.
 *
 * ЧТО ПРОВЕРЯЕТСЯ, И ПОЧЕМУ ИМЕННО ЭТО:
 *   1. на каждый кусок приходится КАРТИНКА, обрезанная маской сектора;
 *   2. под картинкой ОСТАЁТСЯ цветная заливка вида начинки;
 *   3. маски именованы РАЗНО для разных тарелок.
 *
 * ⚠️ Пункт 2 — не украшение. Цвет вида начинки это единственный канал, по
 * которому игрок отличает виды друг от друга; рисунок добавляет второй, но не
 * заменяет первый. Убери заливку — и при недоехавшем ассете стол станет
 * нечитаемым, а не просто скучным.
 *
 * ⚠️ Пункт 3 — про то, как устроен SVG: `id` живёт в ОДНОМ пространстве имён на
 * весь документ, а тарелок на столе до двадцати. Совпади имена масок — все
 * куски обрезались бы одной, то есть кусок одной тарелки взял бы форму другой.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function открыть() {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/cake-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
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
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  }
  return r;
}

function текстВнутри(n: any): string {
  const куски: string[] = [];
  const обойти = (x: any) => {
    if (!x) return;
    if (typeof x === 'string') { куски.push(x); return; }
    if (Array.isArray(x)) { x.forEach(обойти); return; }
    if (x.children) x.children.forEach(обойти);
  };
  обойти(n.children);
  return куски.join(' ');
}

/** Картинки тортов на столе: узлы с `href` и маской сектора. */
function картинкиКусков(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.href !== undefined
    && typeof n.props?.clipPath === 'string'
    && n.props.clipPath.includes('cake-'));
}

/** Заливки секторов: пути с цветом и с командой дуги (то есть именно клинья). */
function заливкиКусков(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.d === 'string'
    && n.props.d.includes(' A ')
    && typeof n.props?.fill === 'string'
    && n.props.fill !== 'none');
}

describe('кусок торта — картинка, а не доля диаграммы', () => {
  it('🔴 у каждого куска есть картинка, обрезанная маской сектора', async () => {
    const r = await открыть();
    const картинок = картинкиКусков(r);
    // Иначе проба хвалит пустоту: экран не дошёл до стола.
    expect(картинок.length).toBeGreaterThan(3);
    // У каждой картинки свой источник и своя маска — пустых нет.
    картинок.forEach((n: any) => {
      expect(n.props.href).toBeTruthy();
      expect(n.props.clipPath).toMatch(/^url\(#cake-\d+-\d+\)$/);
    });
  }, 120_000);

  it('🔴 под картинкой остаётся цветная заливка вида начинки', async () => {
    const r = await открыть();
    const заливок = заливкиКусков(r);
    const картинок = картинкиКусков(r);
    expect(картинок.length).toBeGreaterThan(3);
    /*
     * Заливок не меньше, чем картинок: на каждый кусок приходится и то и другое.
     * Не «ровно столько же» — обводка сектора рисуется тем же путём, и считать
     * её отдельно значило бы привязываться к числу слоёв, а не к утверждению.
     */
    expect(заливок.length).toBeGreaterThanOrEqual(картинок.length);
    // И цвета настоящие, а не прозрачные заглушки.
    expect(заливок.every((n: any) => /^#[0-9a-fA-F]{6}$/.test(n.props.fill))).toBe(true);
  }, 120_000);

  it('🔴 маски разных тарелок названы по-разному', async () => {
    const r = await открыть();
    const маски = r.root.findAll((n: any) => typeof n.type !== 'string'
      && typeof n.props?.id === 'string' && n.props.id.startsWith('cake-'))
      .map((n: any) => n.props.id);
    expect(маски.length).toBeGreaterThan(3);
    /*
     * ⚠️ Проверяем ИМЕННО номер тарелки в имени: маски `cake-0-0` и `cake-1-0`
     * это разные сектора разных тарелок. Совпади они — вторая тарелка обрезала
     * бы свои куски маской первой.
     */
    expect(new Set(маски).size).toBe(маски.length);
    const тарелки = new Set(маски.map((s: string) => s.split('-')[1]));
    expect(тарелки.size).toBeGreaterThan(1);
  }, 120_000);
});
