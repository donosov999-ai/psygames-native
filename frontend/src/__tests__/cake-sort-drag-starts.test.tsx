/**
 * 🔴 ПЕРЕТАСКИВАНИЕ В ТОРТАХ ВООБЩЕ НАЧИНАЕТСЯ.
 *
 * 📍 Денис 09.09.2026: «режим драг и дроп не работает, перетаскивание».
 *
 * РАЗБОР ДЕФЕКТА, ДВЕ ПРИЧИНЫ СРАЗУ.
 *   1. Стол спрашивал ответчика ТОЛЬКО без Capture. Каждая тарелка —
 *      `TouchableOpacity`, он забирает ответчика НА КАСАНИИ и держит до
 *      отпускания; родителя система в это время не спрашивает вовсе. Значит
 *      `onResponderGrant` стола не срабатывал ни разу.
 *   2. Порог сдвига читал `locationX/locationY` — координату пальца ВНУТРИ
 *      элемента, а не смещение. У тарелки крупнее шести точек сумма превышала
 *      порог всегда, то есть даже полученный вопрос стол «съедал» на первом
 *      касании.
 *
 * ⚠️ ПОЧЕМУ ПРОБА ГОНЯЕТ ЭКРАН, А НЕ ЧИТАЕТ ИСХОДНИК. Обе причины — про
 * ПЕРЕГОВОРЫ о жесте, а не про текст: проверка «в файле есть слово Capture»
 * зазеленела бы и на неработающем пороге. Здесь события подаются в том же
 * порядке, в каком их подаёт система, и спрашивается результат — поднялась ли
 * тарелка.
 */
import React from 'react';
import { PLATE_GAP, rowLeft, inRow } from '@/src/games/cake-sort/core/layout';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Экраны гасим: незакрытый каркас держит таймер питомца и роняет прогон после вердикта. */
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

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

async function открыть(уровень: string) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_cake_sort_level_free', уровень);
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/cake-sort').default;  // eslint-disable-line
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
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  return r;
}

/** Узел стола — тот, кто ведёт переговоры о жесте. */
const стол = (r: any) => r.root.findAll((n: any) =>
  typeof n.props?.onMoveShouldSetResponderCapture === 'function'
  && typeof n.props?.onResponderGrant === 'function')[0];

/**
 * Кнопки тарелок: подпись «<Тарелка> N: занято/всего».
 *
 * ⚠️ ДВЕ ЛОВУШКИ, обе стоили ложных падений 09.09.2026.
 * 1. Тот же вид «N/M» у счётчика ходов в шапке — он не тарелка, и попав в
 *    список, сдвигал всю нумерацию.
 * 2. `findAll` отдаёт и составной узел, и хостовый: каждая тарелка приходит по
 *    нескольку раз, и «третья тарелка» оказывалась первой.
 * Поэтому счётчик отсекается по слову, а список сжимается по подписи.
 */
const тарелки = (r: any) => {
  const все = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && typeof n.props?.accessibilityLabel === 'string'
    && /\s\d+:\s\d+\/\d+$/.test(n.props.accessibilityLabel)
    && !/^(Moves|Ходов)/.test(n.props.accessibilityLabel));
  const видели = new Set<string>();
  return все.filter((n: any) => {
    if (видели.has(n.props.accessibilityLabel)) return false;
    видели.add(n.props.accessibilityLabel);
    return true;
  });
};

/**
 * Диаметр тарелки — со стиля самой кнопки, а не из повторно посчитанной формулы.
 * ⚠️ `StyleSheet.flatten`, а не разбор массива руками: стиль приходит списком, где
 * первым лежит зарегистрированный `styles.plateBox` (на нативе это число, не объект).
 */
function диаметр(r: any): number {
  const { StyleSheet } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
  for (const т of тарелки(r)) {
    const плоско: any = StyleSheet.flatten(т.props?.style) || {};
    if (typeof плоско.width === 'number' && плоско.width > 0) return плоско.width;
  }
  return 0;
}

/**
 * Ширина стола — со стиля самого стола (у него единственного `touchAction: none`).
 * Нужна, потому что РЯД ЦЕНТРИРУЕТСЯ по числу тарелок в нём.
 */
function ширинаСтола(r: any): number {
  const { StyleSheet } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
  const узлы = r.root.findAll(() => true);
  for (const n of узлы) {
    const с: any = StyleSheet.flatten(n.props?.style) || {};
    if (с.touchAction === 'none' && typeof с.width === 'number') return с.width;
  }
  return 0;
}

/**
 * Центр тарелки `i` в координатах стола.
 *
 * ⚠️ СЧИТАЕТСЯ ТОЙ ЖЕ ГЕОМЕТРИЕЙ, ЧТО И ИГРА (`rowLeft`/`inRow`). Первая
 * редакция этих проб брала жёсткую сетку от левого края — то есть повторяла
 * ровно ту ошибку, которую чинит проверяемый код, и промахивалась мимо нижнего
 * ряда на 63 точки.
 */
function центрТарелки(i: number, d: number, boardW: number, всего: number, cols = 3) {
  const шаг = d + PLATE_GAP;
  const r = Math.floor(i / cols);
  const c = i % cols;
  return {
    x: rowLeft(boardW, d, inRow(r, cols, всего)) + PLATE_GAP / 2 + c * шаг + d / 2,
    y: PLATE_GAP / 2 + r * шаг + d / 2,
  };
}

/** Сколько тарелок «поднято» — кольцо выбора рисуется у выбранной и у той, что в руке. */
const поднятых = (r: any) => r.root.findAll((n: any) =>
  n.props?.stroke === '#f59e0b' && n.props?.strokeWidth === 3).length;

describe('перетаскивание в тортах начинается', () => {
  it('🔴 стол спрашивают о жесте ЧЕРЕЗ CAPTURE — иначе тарелка не отдаст ответчика', async () => {
    const r = await открыть('1');
    const с = стол(r);
    expect(с).toBeTruthy();
    // Обе половины переговоров: старт-capture (запомнить точку) и move-capture (забрать жест).
    expect(typeof с.props.onStartShouldSetResponderCapture).toBe('function');
    expect(typeof с.props.onMoveShouldSetResponderCapture).toBe('function');
  });

  it('🔴 порог считает СМЕЩЕНИЕ, а не координату внутри тарелки', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    expect(d).toBeGreaterThan(20);
    const x = PLATE_GAP / 2 + d / 2, y = PLATE_GAP / 2 + d / 2;
    await TestRenderer.act(async () => { с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: x, pageY: y } }); });
    // Палец не двигался — жест не забираем, иначе тап по тарелке съеден.
    expect(с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 1, pageY: y + 1 } })).toBe(false);
    // Ушёл дальше порога — забираем.
    expect(с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 40, pageY: y } })).toBe(true);
  });

  it('🔴 после касания и сдвига тарелка ПОДНИМАЕТСЯ, а не остаётся лежать', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const x = PLATE_GAP / 2 + d / 2, y = PLATE_GAP / 2 + d / 2;
    expect(поднятых(r)).toBe(0);
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: x, pageY: y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 40, pageY: y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: x + 40, pageY: y } });
    });
    expect(поднятых(r)).toBeGreaterThan(0);
    await TestRenderer.act(async () => { с.props.onResponderTerminate(); });
    expect(поднятых(r)).toBe(0);
  });

  it('🔴 жест доводится до соседней тарелки и там ОТПУСКАЕТСЯ', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const x = PLATE_GAP / 2 + d / 2, y = PLATE_GAP / 2 + d / 2;
    const подписи = () => тарелки(r).map((n: any) => n.props.accessibilityLabel);
    const было = подписи();
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: x, pageY: y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 40, pageY: y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: x + 40, pageY: y } });
      с.props.onResponderMove({ nativeEvent: { pageX: x + d + PLATE_GAP, pageY: y } });
      с.props.onResponderRelease();
    });
    await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
    // Ход либо прошёл (подписи изменились), либо был запрещён правилом укладки —
    // но «поднято» обязано погаснуть в обоих случаях: жест закончился.
    expect(поднятых(r)).toBe(0);
    expect(подписи().length).toBe(было.length);
  });
  /**
   * 🔴 ЖЕСТ ОБЯЗАН СДЕЛАТЬ ХОД, А НЕ ПРОСТО ПОГАСНУТЬ.
   *
   * 📍 Заведено 09.09.2026 по двум находкам живого разбора, и без него обе
   * прошли бы мимо:
   *
   * 1. Обработчики движения и отпускания читали СОСТОЯНИЕ того рендера, где
   *    рука ещё пуста: система ответчика запоминает их в момент захвата.
   *    Движение выходило первой строкой, отпускание видело пустую руку — ход не
   *    делался ни разу. Лечится ссылками (`тащимRef` / `цельRef`).
   * 2. Отпускание делало `setSel(f)` и тут же звало тап: тап в том же такте
   *    видел `sel === null` и ВЫБИРАЛ цель вместо хода. В браузере беда
   *    пряталась — если выбор уже был сделан раньше, ход проходил, и жест
   *    выглядел рабочим через раз.
   *
   * ⚠️ Поэтому проба начинает с ЧИСТОГО состояния и требует, чтобы содержимое
   * тарелок ИЗМЕНИЛОСЬ. «Подсветка погасла» этого не ловит: она гаснет и когда
   * ничего не произошло.
   */
  it('🔴 жест ПЕРЕКЛАДЫВАЕТ кусок, а не только гасит подсветку', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const подписи = () => тарелки(r).map((n: any) => n.props.accessibilityLabel);
    const было = подписи();
    // Пустая тарелка есть всегда: тарелок на уровне больше, чем видов.
    const пустая = было.findIndex((л: string) => /:\s*0\//.test(л));
    const полная = было.findIndex((л: string) => /:\s*[1-9]\d*\//.test(л));
    expect(пустая).toBeGreaterThanOrEqual(0);
    expect(полная).toBeGreaterThanOrEqual(0);
    const центр = (i: number) => центрТарелки(i, d, ширинаСтола(r), подписи().length);
    const a = центр(полная); const b = центр(пустая);
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: a.x, pageY: a.y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: a.x + 40, pageY: a.y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: a.x + 40, pageY: a.y } });
      с.props.onResponderMove({ nativeEvent: { pageX: b.x, pageY: b.y } });
      с.props.onResponderRelease();
    });
    await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
    expect(подписи()).not.toEqual(было);
    expect(поднятых(r)).toBe(0);
  }, 120_000);
});

/**
 * 🔴 ПОДСВЕТКА ВО ВРЕМЯ ПЕРЕНОСА ГОВОРИТ ПРАВДУ.
 *
 * 📍 Денис 09.09.2026: «нихуя не тащится на другие тарелки нормально». Замер
 * разобрал жалобу надвое и это важно записать: механизм переноса был ЖИВОЙ — на
 * свежей доске 2→4 и 3→5 через ряд проходили. Не проходило ровно то, что
 * ЗАПРЕЩЕНО правилом (класть можно на пустую или на свой цвет), а игра об этом
 * молчала: вибрации в вебе нет, звук выключают, и цель при этом подсвечивалась
 * голубым НЕЗАВИСИМО от того, ляжет кусок или нет. Подсветка обещала ход,
 * которого не будет.
 *
 * ⚠️ Проба смотрит на КОЛЬЦА, а не на «сработал ли ход»: беда была не в ходе.
 */
describe('подсветка переноса не врёт', () => {
  /**
   * Кольца РАЗНЫЕ, и путать их нельзя — на этом первая редакция пробы упала.
   *   пунктирное голубое  — подсказка «сюда можно», горит на всех годных целях;
   *   сплошное голубое    — «отпустишь здесь, и ляжет»;
   *   сплошное алое       — «здесь не примут».
   * Требовать «голубых нет вовсе» неверно: подсказки обязаны гореть и на
   * запрещённой цели тоже, они про ДРУГИЕ тарелки.
   */
  const сплошное = (r: any, цвет: string) => r.root.findAll((n: any) =>
    n.props?.stroke === цвет && (n.props?.strokeWidth ?? 0) >= 4
    && n.props?.strokeDasharray === undefined).length;
  const пунктир = (r: any, цвет: string) => r.root.findAll((n: any) =>
    n.props?.stroke === цвет && typeof n.props?.strokeDasharray === 'string').length;

  it('🔴 на запрещённой цели горит АЛОЕ кольцо, а не голубое', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const подписи = () => тарелки(r).map((n: any) => n.props.accessibilityLabel);
    const центр = (i: number) => центрТарелки(i, d, ширинаСтола(r), подписи().length);
    /*
     * Берём с ПОЛНОЙ тарелки и целимся в другую ПОЛНУЮ: места там нет, значит
     * ход запрещён при любом цвете — условие не зависит от раздачи.
     */
    const полные = подписи().map((л: string, i: number) => ({ л, i })).filter((o: any) => /: 6\/6$/.test(o.л));
    expect(полные.length).toBeGreaterThan(1);
    const a = центр(полные[0].i); const b = центр(полные[1].i);
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: a.x, pageY: a.y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: a.x + 40, pageY: a.y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: a.x + 40, pageY: a.y } });
      с.props.onResponderMove({ nativeEvent: { pageX: b.x, pageY: b.y } });
    });
    expect(сплошное(r, '#f43f5e')).toBeGreaterThan(0);   // «сюда не примут» — видно
    expect(сплошное(r, '#38bdf8')).toBe(0);              // и «ляжет» НЕ обещано
    expect(пунктир(r, '#38bdf8')).toBeGreaterThan(0);    // а годные цели подсказаны
    await TestRenderer.act(async () => { с.props.onResponderTerminate(); });
  }, 120_000);

  it('🔴 на разрешённой цели горит ГОЛУБОЕ кольцо, а не алое', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const подписи = () => тарелки(r).map((n: any) => n.props.accessibilityLabel);
    const центр = (i: number) => центрТарелки(i, d, ширинаСтола(r), подписи().length);
    const полная = подписи().findIndex((л: string) => /: [1-9]\d*\/6$/.test(л));
    const пустая = подписи().findIndex((л: string) => /: 0\/6$/.test(л));
    expect(полная).toBeGreaterThanOrEqual(0);
    expect(пустая).toBeGreaterThanOrEqual(0);
    const a = центр(полная); const b = центр(пустая);
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: a.x, pageY: a.y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: a.x + 40, pageY: a.y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: a.x + 40, pageY: a.y } });
      с.props.onResponderMove({ nativeEvent: { pageX: b.x, pageY: b.y } });
    });
    expect(сплошное(r, '#38bdf8')).toBeGreaterThan(0);
    expect(сплошное(r, '#f43f5e')).toBe(0);
    await TestRenderer.act(async () => { с.props.onResponderTerminate(); });
  }, 120_000);
});
