/* psygames-gate-sort-field-height · VER 1 · 11.09.2026 */
/**
 * 🔴 ПОЛЕ СОРТИРОВЩИКА ЗАНИМАЕТ ВЫСОТУ, А НЕ ТРЕТЬ ЭКРАНА.
 *
 * 📍 ЗАМЕР, РАДИ КОТОРОГО ГЕЙТ ЗАВЕДЁН (11.09.2026, живая партия в браузере на
 * 375×812, под служебным рядом остаётся 687 точек):
 *     торты      — стол 226 точек из 687 (33 %), пустоты 231 сверху и 230 снизу
 *     переливалка — сосуды 186 точек из 687 (27 %), пять пробирок ОДНИМ рядом
 * Причина у обеих одна и та же: размер считался ТОЛЬКО ОТ ШИРИНЫ. У тортов пол
 * был «не меньше трёх столбцов», у переливалки высота не входила в расчёт вовсе
 * — ни в `колонокДля`, ни в `ширинаПробирки`.
 *
 * ⚠️ ПОРОГИ ВЗЯТЫ ПОСЛЕ ЗАМЕРА, А НЕ ДО НЕГО. Пол «занято ≥ 45 %» поставлен под
 * худшие ЧЕСТНЫЕ раскладки, где высоту занять нечем: три сосуда на 375 точках
 * упираются в ширину ряда (50 %), а на планшете 768×900 упирается абсолютный
 * потолок сосуда (55 %). Сломанные случаи были 33 % и 27 % — они ниже пола.
 *
 * ⚠️ ГЕЙТ СТОРОЖИТ И ОБРАТНОЕ: доски от девяти тарелок правка не трогает вовсе.
 * Без этой половины «стало крупнее» проходило бы и при раскладке, которая
 * раздувает тарелку на больших уровнях и уводит нижний ряд под обрез.
 */
import { tableFit, PLATE_GAP } from '@/src/games/cake-sort/core/layout';
import { ширинаПробирки, колонокДля } from '@/app/games/water-sort';

/** Высота к ширине у стекла — та же, что в экране (замер по самому файлу). */
const СТЕКЛО = 577 / 192;
const ОТСТУП = 8;
const ЗАПАС_ПОЛЕЙ = 32;

/** Ширина, высота поля под сосуды. Взято с живых замеров экранов. */
const ЭКРАНЫ: [number, number][] = [[320, 600], [375, 687], [390, 720], [414, 760], [768, 900]];

function занятоСосудами(n: number, ширинаЭкрана: number, высота: number): number {
  const доступно = ширинаЭкрана - ЗАПАС_ПОЛЕЙ;
  const ш = ширинаПробирки(n, доступно, высота);
  const рядов = Math.ceil(n / колонокДля(n, доступно, высота));
  return (рядов * ш * СТЕКЛО + ОТСТУП * (рядов + 1)) / высота;
}

describe('поле сортировщика занимает высоту', () => {
  it('переливалка: сосуд от высоты никогда не меньше, чем без неё', () => {
    const хуже: string[] = [];
    for (const [w, h] of ЭКРАНЫ) {
      const доступно = w - ЗАПАС_ПОЛЕЙ;
      for (let n = 3; n <= 14; n += 1) {
        const без = ширинаПробирки(n, доступно);
        const сВысотой = ширинаПробирки(n, доступно, h);
        if (сВысотой < без) хуже.push(`${w}×${h} n=${n}: ${без} → ${сВысотой}`);
      }
    }
    expect(хуже).toEqual([]);
  });

  it('переливалка: сломанный случай вырос ровно там, где был сломан', () => {
    // Пять пробирок на 375×687 — тот самый кадр. Было 62 точки в один ряд.
    const доступно = 375 - ЗАПАС_ПОЛЕЙ;
    expect(ширинаПробирки(5, доступно)).toBe(62);              // премиса: старое поведение ещё воспроизводимо
    expect(ширинаПробирки(5, доступно, 687)).toBeGreaterThanOrEqual(100);
    expect(колонокДля(5, доступно, 687)).toBe(3);              // 3 столбца в два ряда, а не 5 в один
    expect(занятоСосудами(5, 375, 687)).toBeGreaterThan(0.9);
  });

  it('переливалка: занято не меньше 45 % высоты на всех раскладках', () => {
    const тесные: string[] = [];
    for (const [w, h] of ЭКРАНЫ) {
      for (let n = 3; n <= 14; n += 1) {
        const доля = занятоСосудами(n, w, h);
        if (доля < 0.45) тесные.push(`${w}×${h} n=${n}: ${(100 * доля).toFixed(0)} %`);
      }
    }
    expect(тесные).toEqual([]);
  });

  /**
   * 🔴 И ВЕРХНЯЯ ГРАНИЦА ТОЖЕ, ИНАЧЕ ГЕЙТ СТОРОЖИТ ТОЛЬКО ОДНУ СТОРОНУ.
   *
   * 📍 Мутация «снять потолок высоты в `ширинаПробирки`» ПЕРЕЖИЛА первую
   * редакцию: проверка «занято ≥ 45 %» радуется и ста сорока трём процентам.
   * При девяти сосудах на 375×687 без потолка выходит 109 точек в три ряда,
   * то есть 982 точки при 687 — нижний ряд уезжает под обрез.
   */
  it('переливалка: сосуды влезают в отведённую высоту', () => {
    const вылезли: string[] = [];
    for (const [w, h] of ЭКРАНЫ) {
      for (let n = 3; n <= 14; n += 1) {
        const доля = занятоСосудами(n, w, h);
        if (доля > 1) вылезли.push(`${w}×${h} n=${n}: ${(100 * доля).toFixed(0)} %`);
      }
    }
    expect(вылезли).toEqual([]);
  });

  it('переливалка: ровный ряд не ломается ради одной точки', () => {
    // Три сосуда на 375: два столбца дают 110, три — 109. Берём ровный ряд.
    expect(колонокДля(3, 375 - ЗАПАС_ПОЛЕЙ, 687)).toBe(3);
    // А где разница настоящая (320 точек: 95 против 90), берём крупный сосуд.
    expect(колонокДля(3, 320 - ЗАПАС_ПОЛЕЙ, 600)).toBe(2);
  });

  it('торты: маленький стол вырос, большой не тронут', () => {
    const доступно = 375 - 16;
    const малый = tableFit(доступно, 687, 5);
    expect(малый.cols).toBe(2);
    expect(малый.rows).toBe(3);
    expect(малый.plate).toBeGreaterThanOrEqual(150);           // было 109
    const занято = (малый.rows * (малый.plate + PLATE_GAP) + PLATE_GAP) / 687;
    expect(занято).toBeGreaterThan(0.7);

    // Доски, где два столбца не влезают по высоте, обязаны остаться прежними.
    expect(tableFit(доступно, 687, 9).cols).toBe(3);
    expect(tableFit(доступно, 687, 16).cols).toBe(4);
    expect(tableFit(доступно, 687, 20).cols).toBe(4);
  });

  it('торты: стол влезает в отведённую высоту на всех раскладках', () => {
    const вылезли: string[] = [];
    for (const [w, h] of ЭКРАНЫ) {
      const доступно = Math.min(w, 520) - 16;
      for (const plates of [3, 5, 6, 9, 12, 16, 20]) {
        const f = tableFit(доступно, h, plates);
        const нужно = f.rows * (f.plate + PLATE_GAP) + PLATE_GAP;
        if (нужно > h) вылезли.push(`${w}×${h} тарелок ${plates}: нужно ${нужно.toFixed(0)} при ${h}`);
      }
    }
    expect(вылезли).toEqual([]);
  });
});

/**
 * 🔴 И ОТДЕЛЬНО — ЧТО ЗАМЕР ВЫСОТЫ ДОЕЗЖАЕТ ДО РАСЧЁТА.
 *
 * 📍 Мутация «экран снова не передаёт высоту в `ширинаПробирки`» ПЕРЕЖИЛА все
 * шесть проверок выше: они зовут чистую функцию напрямую и про экран не знают
 * ничего. Это ровно тот случай, что записан в памяти как «механизм есть, до
 * игрока не доехал»: расчёт правильный, а на поле он не влияет.
 *
 * ⚠️ `onLayout` в `react-test-renderer` сам не срабатывает — верстки там нет.
 * Поэтому событие подаётся руками, и сравниваются ДВА состояния одного экрана:
 * до замера (высота неизвестна) и после. Если экран высотой не пользуется,
 * размер сосуда не изменится, и проба краснеет.
 */
describe('замер высоты доезжает до сосуда', () => {
  const React = require('react');                                   // eslint-disable-line @typescript-eslint/no-require-imports
  const TestRenderer = require('react-test-renderer');              // eslint-disable-line @typescript-eslint/no-require-imports

  jest.mock('expo-router', () => ({
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useLocalSearchParams: () => ({}),
    router: { canGoBack: () => false, back: () => {}, replace: () => {} },
    useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
  }));

  const МЕТРИК = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  const открытые: any[] = [];
  afterEach(async () => {
    while (открытые.length) {
      const r = открытые.pop();
      await TestRenderer.act(async () => { r.unmount(); });
    }
  });

  const текст = (n: any): string => {
    const к: string[] = [];
    const go = (x: any) => {
      if (x === null || x === undefined) return;
      if (typeof x === 'string' || typeof x === 'number') { к.push(String(x)); return; }
      if (Array.isArray(x)) { x.forEach(go); return; }
      if (x.children) x.children.forEach(go);
    };
    go(n.children);
    return к.join(' ');
  };

  /** Ширины сосудов, как они РЕАЛЬНО попали в стиль узла. */
  const ширины = (r: any): number[] => r.root
    .findAll((n: any) => typeof n.type !== 'string'
      && n.props?.accessibilityRole === 'button'
      && n.props?.activeOpacity !== undefined
      && Array.isArray(n.props?.style))
    .map((n: any) => n.props.style.find((s: any) => s && typeof s.width === 'number')?.width)
    .filter((w: any) => typeof w === 'number');

  it('после замера высоты сосуд становится крупнее', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
    await AsyncStorage.clear();
    await AsyncStorage.setItem('language', 'ru');
    const { ThemeProvider } = require('@/src/contexts/ThemeContext');           // eslint-disable-line @typescript-eslint/no-require-imports
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');     // eslint-disable-line @typescript-eslint/no-require-imports
    const { ProfileProvider } = require('@/src/contexts/ProfileContext');       // eslint-disable-line @typescript-eslint/no-require-imports
    const { SafeAreaProvider } = require('react-native-safe-area-context');     // eslint-disable-line @typescript-eslint/no-require-imports
    const Screen = require('@/app/games/water-sort').default;                   // eslint-disable-line
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
    const начать = r.root.findAll((n: any) => typeof n.type !== 'string'
      && n.props?.accessibilityRole === 'button' && /Начать|Продолжить/i.test(текст(n)))[0];
    expect(начать).toBeTruthy();
    await TestRenderer.act(async () => { начать.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });

    const доЗамера = ширины(r);
    expect(доЗамера.length).toBeGreaterThan(2);            // премиса: сосуды на поле есть

    // Подаём измеренную вёрстку руками: середина 687, подпись 38.
    /*
     * ⚠️ Узлы ищутся ПО МЕТКЕ, а не «первый попавшийся с onLayout». Первая
     * редакция брала их по порядку обхода и подала 687 не в ту коробку: свои
     * `onLayout` есть и у каркаса, и сосуд остался прежним — проба покраснела
     * на исправном коде.
     */
    const коробка = r.root.findAll((n: any) => n.props?.testID === 'sort-field-box'
      && typeof n.props?.onLayout === 'function')[0];
    const подпись = r.root.findAll((n: any) => n.props?.testID === 'sort-field-hint'
      && typeof n.props?.onLayout === 'function')[0];
    expect(Boolean(коробка) && Boolean(подпись)).toBe(true);   // премиса: экран меряет то, что надо
    await TestRenderer.act(async () => {
      коробка.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 687 } } });
      подпись.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 38 } } });
    });
    await TestRenderer.act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });

    const послеЗамера = ширины(r);
    expect({ до: доЗамера[0], после: послеЗамера[0] }).toEqual({ до: доЗамера[0], после: послеЗамера[0] });
    expect(послеЗамера[0]).toBeGreaterThan(доЗамера[0] as number);
    expect(послеЗамера[0]).toBeGreaterThanOrEqual(100);
  });
});
