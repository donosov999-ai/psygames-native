/**
 * 🔴 СТОПКА ТОВАРОВ НЕ ПЕРЕСТРАИВАЕТСЯ ИЗ-ЗА ЧУЖОЙ ПОДСВЕТКИ.
 *
 * ЗАЧЕМ. Замер (`src/games/goods-sort/tools/drag-cost.bench.ts`): одна
 * перерисовка доски стоила медиану 5,5–9,4 мс и p95 13–24 мс при бюджете кадра
 * 16,7 мс, а под нишами лежит 62–67 % узлов дерева. При перетаскивании доска
 * перерисовывается на каждом пересечении границы ниши — девять раз за
 * полсекундную протяжку через витрину. Стопка вынесена в `React.memo`.
 *
 * 🔴 ЧТО ИМЕННО СТЕРЕЖЁТ ЭТА ПРОБА, И ПОЧЕМУ НЕ ВРЕМЯ. Гейт на миллисекунды был
 * бы монеткой: в общем прогоне рядом идут десятки процессов jest, и порог,
 * зелёный соло, краснел бы вдвоём. Стережётся ПРИЧИНА, по которой запоминание
 * работает: устойчивость пропов. `React.memo` сравнивает пропы по ссылке —
 * передай вниз `Set`, свежий массив или стрелку, и сравнение промахнётся
 * КАЖДЫЙ раз, а вынос окажется чистым убытком: тот же рендер плюс лишний
 * уровень. Никакой ошибки при этом не видно: экран работает, просто медленно.
 *
 * ⚠️ Проверяется на ЧУЖИХ нишах. У ниши, которой коснулись, пропы обязаны
 * измениться — иначе выделение не отрисуется; у всех остальных обязаны остаться
 * теми же объектами.
 */
import React from 'react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports
const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/*
 * 🔴 РАСКЛАД ФИКСИРУЕМ СЕМЕНЕМ, И ЭТО НЕ ПЕДАНТИЗМ.
 *
 * 📍 Первая редакция семени не ставила и брала «первую попавшуюся нишу». Соло
 * проба проходила, в общем прогоне падала с `Cannot read properties of
 * undefined`: там первая ниша оказывалась ПУСТОЙ, и кнопки товара в ней не
 * существовало. Выглядит как «тест флакует под нагрузкой», а на деле проба
 * зависела от монетки.
 */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const НАСТОЯЩИЙ_RANDOM = Math.random;

const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
  // ⚠️ Семя держится до конца пробы: раздача доезжает эффектами, уже после `открыть`.
  Math.random = НАСТОЯЩИЙ_RANDOM;
});

async function открыть(уровень: number) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_goods_sort_level_free', String(уровень));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/goods-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
  Math.random = seeded(11);
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
  открытые.push(r);
  const старт = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (старт) {
    await TestRenderer.act(async () => { старт.props.onPress?.(); });
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

/** Стопки товаров: узнаём их по пропу-маске — его нет больше ни у кого. */
function стопки(r: any): Map<number, Record<string, unknown>> {
  const по = new Map<number, Record<string, unknown>>();
  r.root.findAll((n: any) => n.props && typeof n.props.coveredMask === 'number' && typeof n.props.niche === 'number')
    .forEach((n: any) => { if (!по.has(n.props.niche)) по.set(n.props.niche, n.props); });
  return по;
}

describe('стопка товаров запоминается между перерисовками', () => {
  it('есть что проверять: стопки на доске нашлись', async () => {
    const r = await открыть(30);
    expect(стопки(r).size).toBeGreaterThan(6);
  }, 180_000);

  /**
   * 🔴 ГЛАВНОЕ: у ЧУЖИХ ниш пропы остаются ТЕМИ ЖЕ ОБЪЕКТАМИ.
   *
   * Тап по товару — та же по природе перерисовка, что и смена подсветки при
   * перетаскивании: меняется состояние экрана, и он строится заново весь. Если
   * при этом хоть один проп чужой стопки приезжает новым объектом, `React.memo`
   * промахивается и стопка перестраивается зря.
   */
  it('🔴 при тапе по товару пропы чужих стопок не меняются по ссылке', async () => {
    const r = await открыть(30);
    const до = стопки(r);
    /* ⚠️ Ниша нужна НЕПУСТАЯ: в пустой кнопки товара нет, и жать нечего. */
    const тронутая = [...до.entries()].find(([, props]) => (props.cell as number[]).length > 0)?.[0] as number;
    expect(тронутая).toBeDefined();

    const товар = r.root.findAll((n: any) => typeof n.type !== 'string'
      && typeof n.props?.onPress === 'function'
      && new RegExp(`, (Полка|Shelf) ${тронутая + 1}$`).test(String(n.props?.accessibilityLabel ?? '')))[0];
    expect(товар).toBeTruthy();
    await TestRenderer.act(async () => { товар.props.onPress?.(); });

    const после = стопки(r);
    const разъехались: string[] = [];
    for (const [ниша, props] of после) {
      if (ниша === тронутая) continue;
      const было = до.get(ниша);
      if (!было) continue;
      for (const ключ of Object.keys(props)) {
        if (!Object.is(props[ключ], было[ключ])) разъехались.push(`ниша ${ниша}, проп ${ключ}`);
      }
    }
    expect(разъехались).toEqual([]);
    // Иначе проба зелена вслепую: сравнивать было бы нечего.
    expect(после.size).toBeGreaterThan(6);
  }, 180_000);

  /**
   * 🔴 ОБРАТНАЯ СТОРОНА: у ТРОНУТОЙ ниши что-то обязано измениться. Без этого
   * пункта «пропы не меняются» можно было бы «починить», заморозив их совсем, —
   * и выделение товара перестало бы отрисовываться.
   */
  it('🔴 у тронутой ниши пропы всё-таки меняются', async () => {
    const r = await открыть(30);
    const до = стопки(r);
    const тронутая = [...до.entries()].find(([, props]) => (props.cell as number[]).length > 0)?.[0] as number;
    expect(тронутая).toBeDefined();
    const товар = r.root.findAll((n: any) => typeof n.type !== 'string'
      && typeof n.props?.onPress === 'function'
      && new RegExp(`, (Полка|Shelf) ${тронутая + 1}$`).test(String(n.props?.accessibilityLabel ?? '')))[0];
    await TestRenderer.act(async () => { товар.props.onPress?.(); });
    const стало = стопки(r).get(тронутая) as Record<string, unknown>;
    expect(стало.selIdx).not.toBe((до.get(тронутая) as Record<string, unknown>).selIdx);
  }, 180_000);
});
