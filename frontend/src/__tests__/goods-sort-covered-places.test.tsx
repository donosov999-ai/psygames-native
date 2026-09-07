/**
 * 🔴 НАКРЫТЫЙ ТОВАР НАРИСОВАН СИЛУЭТОМ ИМЕННО ТАМ, ГДЕ ОН НАКРЫТ.
 *
 * 📍 ПРОБА ЗАВЕДЕНА ПО ВЫЖИВШЕЙ МУТАЦИИ, а не про запас. 07.09.2026 стопка
 * товаров вынесена в запоминающий компонент, и накрытость поехала вниз МАСКОЙ
 * (числом) вместо множества — иначе `React.memo` промахивался бы каждый раз.
 * Мутация «маска считается неправильно» (`coveredMask={covered.size}`) пережила
 * ВЕСЬ набор сортировки: 480 проб из 480 зелены. Мутант компилируется, а
 * силуэты рисуются не на тех местах — и об этом не знает ни одна проверка.
 *
 * 🔴 СВЕРЯЮТСЯ ДВА НЕЗАВИСИМЫХ ПУТИ, И В ЭТОМ ВСЯ СИЛА ПРОБЫ.
 *   · подпись НИШИ (`cellLabel` → `spokenGood`) читает НАСТОЯЩЕЕ множество
 *     `covered` в экране и ставит «?» там, где товар накрыт;
 *   · подпись и картинка ТОВАРА собираются внутри стопки из МАСКИ.
 * Пути разные, ответ обязан быть один. Разъедутся — значит маска врёт, и
 * человек видит силуэт не на том месте.
 *
 * ⚠️ Проверять «есть ли вообще силуэты» было бы бесполезно: их число мутация не
 * меняет, она меняет ИХ МЕСТА.
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
 * 🔴 РАСКЛАД ФИКСИРУЕМ СЕМЕНЕМ. Раздача уровня мешает пул без семени, и партия,
 * которую ведёт проба, на одном раскладе доходит до хода, а на другом встаёт.
 * Первая редакция этой пробы падала через раз именно поэтому — и выглядело это
 * как «тест флакует», а было незакрытым окном.
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
  // ⚠️ Семя держится ДО КОНЦА пробы: раздача доезжает эффектами, уже после `открыть`.
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
  Math.random = seeded(7);
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

/** Подписи полок по номеру: «Полка 6: кола, ?, кефир». */
function подписиПолок(r: any): Map<number, string> {
  const по = new Map<number, string>();
  r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /^(Полка|Shelf) \d+[,:]/.test(String(n.props?.accessibilityLabel ?? '')))
    .forEach((n: any) => {
      const с = String(n.props.accessibilityLabel);
      const номер = Number(с.match(/(?:Полка|Shelf) (\d+)/)![1]);
      if (!по.has(номер)) по.set(номер, с);
    });
  return по;
}

/**
 * Подписи товаров одной полки по порядку, ПО ОДНОЙ НА МЕСТО.
 *
 * 📍 `findAll` отдаёт кнопку дважды: составной узел и то, во что он
 * разворачивается, — и первая редакция этой пробы видела шесть товаров вместо
 * трёх. Дублей не отличить ни по подписи, ни по состоянию: они одинаковы.
 * Отличает их ОБЪЕКТ пропов — он один и тот же, передаётся вниз по ссылке.
 */
function подписиТоваров(r: any, полка: number): string[] {
  const все = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && new RegExp(`, (Полка|Shelf) ${полка}$`).test(String(n.props?.accessibilityLabel ?? '')));
  const множество = new Set(все);
  /*
   * Оставляем только ВЕРХНИЙ узел каждой кнопки: тот, чей родитель сам не
   * является такой же кнопкой. Ни подпись, ни состояние дубли не различают —
   * они одинаковы; различает только место в дереве.
   */
  return все
    .filter((n: any) => !множество.has(n.parent))
    .map((n: any) => String(n.props.accessibilityLabel).split(',')[0]!.trim());
}

/** Что перечислено в подписи полки после двоеточия. */
function содержимоеПолки(подпись: string): string[] {
  const хвост = подпись.slice(подпись.indexOf(':') + 1).trim();
  if (/пусто|empty/i.test(хвост)) return [];
  return хвост.split(',').map((x) => x.trim()).filter(Boolean);
}

describe('накрытость доезжает до товара тем же местом, что и до подписи ниши', () => {
  it('есть что проверять: накрытые товары на уровне нашлись', async () => {
    const r = await открыть(20);
    const накрытых = [...подписиПолок(r).values()]
      .reduce((n, с) => n + содержимоеПолки(с).filter((x) => x === '?').length, 0);
    // Накрытый товар приходит с 14-го уровня; на двадцатом их обязано быть.
    expect(накрытых).toBeGreaterThan(0);
  }, 180_000);

  it('🔴 «?» в подписи ниши и «?» у товара стоят на одних и тех же местах', async () => {
    const r = await открыть(20);
    const разъехались: string[] = [];
    for (const [номер, подпись] of подписиПолок(r)) {
      const поНише = содержимоеПолки(подпись).map((x) => x === '?');
      const поТоварам = подписиТоваров(r, номер).map((x) => x === '?');
      if (поНише.length !== поТоварам.length) {
        разъехались.push(`полка ${номер}: в подписи ${поНише.length} мест, у товаров ${поТоварам.length}`);
        continue;
      }
      поНише.forEach((накрыт, s) => {
        if (накрыт !== поТоварам[s]) разъехались.push(`полка ${номер}, место ${s}: ниша говорит ${накрыт}, товар ${поТоварам[s]}`);
      });
    }
    expect(разъехались).toEqual([]);
  }, 180_000);
});
