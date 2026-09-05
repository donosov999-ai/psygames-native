/**
 * 🔴 «ЗАНОВО» ВОЗВРАЩАЕТ ТУ ЖЕ ДОСКУ, А НЕ РАЗДАЁТ НОВУЮ.
 *
 * Отчёт Дениса 05.09.2026 (764330da, голосом, v2.37.54): «чтобы она не
 * перемешивалась, а просто… заново». Кнопка звала генератор, и каждое нажатие
 * приносило НОВЫЙ случайный расклад.
 *
 * Почему это ломает игру, а не просто раздражает — две стороны сразу:
 *   • головоломку перезапускают, когда зашли в тупик и хотят пройти ЭТУ доску
 *     иначе; новый расклад лишает такой возможности вовсе;
 *   • и обратно: кнопка становится перебором раздач, пока не выпадет полегче,
 *     а лестница считает уровень пройденным честно.
 *
 * ⚠️ ПРОБА СМОТРИТ НА ДОСКУ, А НЕ НА ВЫЗОВЫ. Считать «сколько раз позвали
 * generateLevel» бесполезно: генератор мог бы вызываться и отдавать ту же доску,
 * и наоборот. Сравниваются САМИ пробирки до и после нажатия.
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

/** Смонтировать экран и войти в партию. */
async function открыть() {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/water-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
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
  return r;
}

/** Нажать кнопку по подписи. */
async function нажать(r: any, подпись: RegExp) {
  const узел = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && подпись.test(текстВнутри(n)))[0];
  if (!узел) return false;
  await TestRenderer.act(async () => { узел.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
  return true;
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

/**
 * Снимок доски: содержимое каждой пробирки, по порядку.
 *
 * 🔴 ОТБИРАЕМ ПО СТРУКТУРЕ, А НЕ ПО СЛОВУ В ПОДПИСИ. Первая редакция искала
 * подписи со словом «пробирка» — и ловила только ПУСТЫЕ: у полной подпись
 * состоит из значков цвета («◆ ★ ●»), слова там нет вовсе. Снимок выходил
 * одинаковым при любой доске, и обе мутации проходили зелёными.
 *
 * Признак пробирки: нажимаемый узел, у которого есть состояние `selected`
 * (её можно выбрать) — это и отличает её от кнопок «Отменить»/«Заново».
 */
function пробиркиУзлы(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && typeof n.props?.accessibilityState?.selected === 'boolean'
    && typeof n.props?.accessibilityLabel === 'string');
}

function доска(r: any): string {
  return пробиркиУзлы(r).map((n: any) => n.props.accessibilityLabel).join(' | ');
}

describe('«Заново» в «Пробирках»', () => {
  it('🔴 возвращает ТУ ЖЕ доску, а не новую раздачу', async () => {
    const r = await открыть();
    expect(await нажать(r, /Начать|Start/)).toBe(true);
    const было = доска(r);
    // Есть что сравнивать: пробирок несколько И среди них есть НЕПУСТЫЕ.
    expect(пробиркиУзлы(r).length).toBeGreaterThanOrEqual(5);
    expect(было).toMatch(/[^\s|]/);
    expect(было.split(' | ').filter((x: string) => !/пуст|empty/i.test(x)).length).toBeGreaterThan(2);

    // Сделаем ход, чтобы доска заведомо отличалась от начальной.
    const пробирки = пробиркиУзлы(r);
    await TestRenderer.act(async () => { пробирки[0]?.props.onPress?.(); });
    await TestRenderer.act(async () => { пробирки[1]?.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });

    expect(await нажать(r, /Заново|Restart/)).toBe(true);
    expect(доска(r)).toBe(было);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('🔴 два нажатия подряд дают одно и то же — иначе это перебор раздач', async () => {
    const r = await открыть();
    expect(await нажать(r, /Начать|Start/)).toBe(true);
    const первая = доска(r);
    await нажать(r, /Заново|Restart/);
    const вторая = доска(r);
    await нажать(r, /Заново|Restart/);
    expect(вторая).toBe(первая);
    expect(доска(r)).toBe(первая);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
