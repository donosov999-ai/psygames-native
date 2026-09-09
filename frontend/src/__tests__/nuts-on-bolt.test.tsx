/**
 * 🔴 ГАЙКИ СТОЯТ ВПЛОТНУЮ НА БОЛТЕ И ЗАВИНЧИВАЮТСЯ.
 *
 * Денис 09.09.2026, дословно: «гайки плотно должны быть, и резьба должна
 * вплотную по ширине центра гайки, плюс анимация вращения по кругу, когда
 * одеваются… завинчиваются». До этого на месте болта стоял полупрозрачный
 * прямоугольник шириной 9% пробирки, а между гайками зияли поля.
 *
 * 📍 ТРИ ЧИСЛА, СНЯТЫЕ С САМИХ КАРТИНОК, а не подобранные:
 *   · отверстие гайки — 0,43 её ширины (медиана профиля яркости по 10 файлам);
 *   · гайка нарисована с отношением ширина/высота 1,115;
 *   · стержень занимает 0,523 ширины кадра болта.
 * Отсюда: шаг столба = ширина ÷ 1,115 (гайки касаются), ширина кадра болта =
 * 0,43 ÷ 0,523 ≈ 0,822 ширины гайки (резьба вровень с отверстием).
 *
 * ⚠️ ПРОВЕРЯЕТСЯ СЛЕДСТВИЕ, А НЕ КОНСТАНТЫ. Сверять числа с теми же числами
 * бессмысленно; проба меряет то, что получилось в дереве: высоту коробки гайки
 * против её ширины и ширину болта против ширины гайки.
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
const АСПЕКТ_ГАЙКИ = 1.115;

const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

async function открыть(путь: string) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require(путь).default;  // eslint-disable-line
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
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
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

function плоско(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(плоско));
  return style;
}

/** Картинки гаек: вписываются в коробку (`contain`), в отличие от растянутого болта. */
function гайки(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.resizeMode === 'contain' && n.props?.source !== undefined);
}

/** Болты: единственные растянутые картинки на экране гаек. */
function болты(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.resizeMode === 'stretch' && n.props?.source !== undefined);
}

describe('гайки на болте', () => {
  it('есть что проверять: на поле нашлись и гайки, и болты', async () => {
    const r = await открыть('@/app/games/nut-sort');
    expect(гайки(r).length).toBeGreaterThan(6);
    expect(болты(r).length).toBeGreaterThan(2);
  }, 180_000);

  /**
   * 🔴 ГАЙКИ ВПЛОТНУЮ. Коробка гайки обязана быть ровно той высоты, какую даёт
   * её собственный рисунок: выше — и `contain` оставит поля, между гайками
   * покажется болт, и это будет «не плотно».
   */
  it('🔴 высота коробки гайки равна нарисованной, а не доле пробирки', async () => {
    const r = await открыть('@/app/games/nut-sort');
    const плохо: string[] = [];
    гайки(r).forEach((n: any, i: number) => {
      const с = плоско(n.props.style);
      const ожидание = с.width / АСПЕКТ_ГАЙКИ;
      if (Math.abs(с.height - ожидание) > 0.6) {
        плохо.push(`гайка ${i}: коробка ${с.width.toFixed(1)}×${с.height.toFixed(1)}, а рисунок даёт ${ожидание.toFixed(1)}`);
      }
    });
    expect(плохо).toEqual([]);
  }, 180_000);

  /**
   * 🔴 РЕЗЬБА ВРОВЕНЬ С ОТВЕРСТИЕМ. Стержень занимает 0,523 кадра болта, значит
   * при верной ширине кадра сам стержень выходит 0,43 ширины гайки — ровно
   * отверстие. Проверяем ВИДИМЫЙ стержень, а не кадр: ошибка в любую сторону
   * читается сразу — тонкая резьба болтается в отверстии, толстая вылезает.
   */
  it('🔴 стержень болта совпадает по ширине с отверстием гайки', async () => {
    const r = await открыть('@/app/games/nut-sort');
    const ширинаГайки = плоско(гайки(r)[0].props.style).width as number;
    expect(ширинаГайки).toBeGreaterThan(0);
    const плохо: string[] = [];
    болты(r).forEach((n: any, i: number) => {
      const стержень = (плоско(n.props.style).width as number) * 0.523;
      const доля = стержень / ширинаГайки;
      if (Math.abs(доля - 0.43) > 0.03) плохо.push(`болт ${i}: стержень ${доля.toFixed(3)} ширины гайки вместо 0,43`);
    });
    expect(плохо).toEqual([]);
  }, 180_000);

  /**
   * 🔴 ЗАВИНЧИВАНИЕ. Пришедшие гайки проворачиваются, вставая на болт: без
   * поворота ход читается как «гайка телепортировалась».
   *
   * ⚠️ Проверяется ФАКТ поворота у пришедших и его ОТСУТСТВИЕ у стоявших —
   * иначе «крутится всё» прошло бы проверку, а это другая картинка: столб
   * завинчивается заново на каждом ходу.
   */
  it('🔴 пришедшая гайка проворачивается, а стоявшие — нет', async () => {
    const r = await открыть('@/app/games/nut-sort');
    const сосуды = () => r.root.findAll((n: any) => typeof n.type !== 'string'
      && n.props?.accessibilityRole === 'button'
      && n.props?.activeOpacity !== undefined && n.props?.style !== undefined);
    const все = сосуды();
    expect(все.length).toBeGreaterThan(3);

    // Ищем законный ход перебором пар: расклад случаен, назначать номера нельзя.
    let сделан = false;
    for (let a = 0; a < все.length && !сделан; a += 1) {
      for (let b = 0; b < все.length && !сделан; b += 1) {
        if (a === b) continue;
        const было = гайки(r).length;
        await TestRenderer.act(async () => { сосуды()[a]?.props.onPress?.(); });
        await TestRenderer.act(async () => { сосуды()[b]?.props.onPress?.(); });
        const крутятся = гайки(r).filter((n: any) => {
          const t = плоско(n.parent?.props?.style)?.transform;
          return Array.isArray(t) && t.some((x: any) => x.rotate !== undefined);
        });
        if (крутятся.length > 0) {
          сделан = true;
          // Крутится не весь стол: стоявшие гайки поворота не получают.
          expect(крутятся.length).toBeLessThan(гайки(r).length);
          expect(гайки(r).length).toBeGreaterThanOrEqual(было - 1);
        }
      }
    }
    expect(сделан).toBe(true);
  }, 300_000);
});
