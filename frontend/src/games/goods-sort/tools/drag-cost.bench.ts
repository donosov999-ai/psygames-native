/* psygames-goods-sort-drag-cost · VER 1 · 07.09.2026 */
/**
 * 🔴 ЗАМЕР ЦЕНЫ ПЕРЕТАСКИВАНИЯ. ИНСТРУМЕНТ, А НЕ ГЕЙТ.
 *
 * ЗАЧЕМ. В реестре дефектов лежит пункт «перетаскивание лагает» с числами «хвост
 * p95 35–42 мс». Подтвердить их нечем: пробы, меряющей время жеста, в проекте
 * НЕТ ни одной. Пункт был бы починен вслепую — а «оптимизация без замера» это
 * ровно тот случай, когда чинят то, что не болит, и не трогают то, что болит.
 *
 * ⚠️ ПОЧЕМУ ЭТО НЕ ПРОБА. Время — величина, зависящая от загрузки машины: в
 * общем прогоне рядом идут 20–50 процессов jest других чатов, и порог, зелёный
 * соло, краснел бы вдвоём. Гейт на время был бы монеткой. Здесь замер запускается
 * РУКАМИ и сравнивается сам с собой до и после правки:
 *
 *   npx jest --testMatch '**\/tools/*.bench.ts' --testTimeout 900000
 *
 * ⚠️ И ЧТО ЭТИ ЧИСЛА ЗНАЧАТ. Это цена ДЖАВАСКРИПТА на маке, без настоящей
 * раскладки и отрисовки. Абсолютное значение на телефоне будет другим; сравнимы
 * только числа ДО и ПОСЛЕ одной и той же правки, снятые на одной машине.
 */
import { gridFor, gsLayout, nicheAtPoint, targetSlots, type BoardGeom } from '../core/level';

declare function require(id: string): any;

jest.setTimeout(900000);

/** Медиана и хвост: среднее прячет именно то, на что жалуются. */
function итог(мс: number[]): string {
  const s = [...мс].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] as number;
  return `медиана ${q(0.5).toFixed(4)} мс · p95 ${q(0.95).toFixed(4)} мс · худшее ${(s[s.length - 1] as number).toFixed(4)} мс`;
}

it('цена одного движения пальца по доске', () => {
  const строки: string[] = [];

  /*
   * ⚠️ Уровни выбраны по РАЗМЕРУ ДОСКИ, а не по красоте: узкая (L12), полная
   * телефонная (L30) и витрина (L58), где ниш больше всего и маска длиннее
   * всего — если линейный проход по маске чего-то стоит, видно будет там.
   */
  for (const L of [12, 30, 58]) {
    const ниш = targetSlots(L);
    const сетка = gridFor(L);
    const lay = gsLayout(360, 640, сетка.cols, сетка.rows);
    /*
     * ⚠️ Геометрию собираем ТЕМИ ЖЕ полями, что кладёт в `liveRef` экран
     * (`cellW`, `nicheH`, `pad`/`gap` = 9 из `styles.cabinet`). Свои числа тут
     * означали бы, что замер снят с другой доски, чем та, по которой ходит палец.
     */
    const geom: BoardGeom = {
      cols: сетка.cols, rows: сетка.rows, cellW: lay.cellW, nicheH: lay.nicheH,
      pad: 9, gap: 9, boardW: 360,
    };
    const mask = Array.from({ length: сетка.cols * сетка.rows }, (_, i) => i < ниш);

    // Прогрев: первые вызовы меряют компиляцию, а не работу.
    for (let i = 0; i < 2000; i += 1) nicheAtPoint(20 + (i % 300), 20 + (i % 500), geom, mask);

    const мс: number[] = [];
    for (let проба = 0; проба < 200; проба += 1) {
      const t = process.hrtime.bigint();
      // Сотня движений — примерно полсекунды жеста при 200 Гц опроса.
      for (let i = 0; i < 100; i += 1) nicheAtPoint(20 + (i % 300), 20 + (i % 500), geom, mask);
      мс.push(Number(process.hrtime.bigint() - t) / 1e6 / 100);
    }
    строки.push(`L${L} (ниш ${ниш}, сетка ${сетка.cols}×${сетка.rows}, маска ${mask.length}): ${итог(мс)} на движение`);
  }

  console.log('\nПОПАДАНИЕ В НИШУ (геометрия на каждое движение):\n' + строки.join('\n'));
  expect(строки.length).toBe(3);
});

/**
 * 🔴 ВТОРАЯ ПОЛОВИНА ЦЕНЫ — ПЕРЕРИСОВКА ДОСКИ.
 *
 * ⚠️ ПОПРАВКА К ПЕРВОЙ РЕДАКЦИИ ЭТОГО ФАЙЛА, 07.09.2026. Здесь было написано
 * «каждое движение пальца зовёт `setHover`, а это перерисовка всей доски». Это
 * НЕВЕРНО, и проверяется одной строкой в экране: `onPanResponderMove` сравнивает
 * нишу с прошлой (`if (n !== hoverRef.current)`) и зовёт `setHover` только на
 * ПЕРЕСЕЧЕНИИ границы ниши. Оптимизация сделана 02.09.2026 по жалобе Дениса
 * «драг энд дроп тоже лагает» — то есть я записал в находки то, что уже было
 * починено, не прочитав обработчик до конца.
 *
 * Что остаётся правдой: одна перерисовка стоит столько, сколько показывает замер
 * ниже, и случается она на каждом пересечении ниши при перетаскивании, на каждом
 * выборе товара тапом и на каждом ходе. Сколько пересечений даёт один жест —
 * меряет третий замер.
 *
 * ⚠️ Меряем не `setHover` (он внутренний), а РАВНОЦЕННУЮ смену состояния —
 * выбор товара тапом: тот же `setState` на том же экране, та же перерисовка
 * доски. Число сравнимо само с собой до и после правки, а не с миллисекундами
 * телефона.
 */
it('цена перерисовки доски на смену состояния', async () => {
  const React = require('react');
  const TestRenderer = require('react-test-renderer');
  const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
  const строки: string[] = [];

  for (const L of [12, 58]) {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    /* ⚠️ Ждём хранилище: без `await` уровень не успевает лечь, экран поднимается
       на первом, и замер идёт по чужой доске. */
    await AsyncStorage.clear();
    await AsyncStorage.setItem('psygames_active_profile', 'free');
    await AsyncStorage.setItem('psygames_goods_sort_level_free', String(L));
    const { ThemeProvider } = require('@/src/contexts/ThemeContext');
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');
    const { ProfileProvider } = require('@/src/contexts/ProfileContext');
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const Screen = require('@/app/games/goods-sort').default;

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
    /* ⚠️ Раздача доезжает эффектами и таймером, а не первым кадром: без промотки
       микрозадач кнопки товара ещё не существует. */
    await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
    /* ⚠️ Текст собираем обходом, а не JSON.stringify: в пропах живут провайдеры
       контекста, и сериализация упирается в круговую ссылку. */
    const текст = (n: any): string => {
      const куски: string[] = [];
      const обойти = (x: any) => {
        if (!x) return;
        if (typeof x === 'string') { куски.push(x); return; }
        if (Array.isArray(x)) { x.forEach(обойти); return; }
        if (x.children) x.children.forEach(обойти);
      };
      обойти(n.children);
      return куски.join(' ');
    };
    const старт = r.root.findAll((n: any) => typeof n.type !== 'string'
      && n.props?.accessibilityRole === 'button'
      && /Начать|Start/i.test(текст(n)))[0];
    if (старт) await TestRenderer.act(async () => { старт.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });

    const товары = () => r.root.findAll((n: any) => typeof n.type !== 'string'
      && typeof n.props?.onPress === 'function'
      && /, (Полка|Shelf) \d+$/.test(String(n.props?.accessibilityLabel ?? '')));
    const кнопки = товары();
    if (!кнопки.length) { строки.push(`L${L}: доска не поднялась — замер пропущен`); r.unmount(); continue; }

    // Прогрев: первый рендер после старта дороже всех и меряет не то.
    for (let i = 0; i < 5; i += 1) TestRenderer.act(() => { товары()[0]?.props.onPress?.(); });

    const мс: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      const цель = товары()[i % Math.max(1, товары().length)];
      const t = process.hrtime.bigint();
      TestRenderer.act(() => { цель?.props.onPress?.(); });
      мс.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    /*
     * 🔴 СКОЛЬКО УЗЛОВ ПЕРЕСТРАИВАЕТСЯ — ЧТОБЫ ЗНАТЬ ЦЕНУ ПРАВКИ ДО ПРАВКИ.
     *
     * `React.memo` на нишу окупится ровно в той мере, в какой время тратится НА
     * НИШИ, а не на остальной экран. Считаем узлы всего дерева и узлы ниш: их
     * доля и есть верхняя граница отдачи. Меньше доля — меньше смысла в правке,
     * и лучше узнать это здесь, чем после трёхсот строк диффа.
     */
    const всего = (function счёт(u: any): number {
      if (!u || typeof u === 'string') return 1;
      const дети = Array.isArray(u.children) ? u.children : [];
      return 1 + дети.reduce((n: number, d: any) => n + счёт(d), 0);
    })(r.toJSON());
    const нишиУзлы = r.root.findAll((n: any) => typeof n.type !== 'string'
      && typeof n.props?.onPress === 'function'
      && /^(Полка|Shelf) \d+[,:]/.test(String(n.props?.accessibilityLabel ?? '')))
      .reduce((n: number, ниша: any) => n + ниша.findAll(() => true).length, 0);
    строки.push(`L${L} (кнопок товара ${кнопки.length}, узлов в дереве ${всего}, из них под нишами ${нишиУзлы} — ${Math.round(100 * нишиУзлы / Math.max(1, всего))}%): ${итог(мс)} на смену состояния`);
    TestRenderer.act(() => { r.unmount(); });
  }

  console.log('\nОДНА ПЕРЕРИСОВКА ДОСКИ (случается на пересечении ниши, на выборе товара и на ходе):\n' + строки.join('\n'));
  expect(строки.length).toBe(2);
});

/**
 * 🔴 СКОЛЬКО ПЕРЕРИСОВОК ДАЁТ ОДИН ЖЕСТ — БЕЗ ЭТОГО ЧИСЛА ПРЕДЫДУЩЕЕ НЕ ЗНАЧИТ
 * НИЧЕГО.
 *
 * Восемь миллисекунд на перерисовку — это много или мало, зависит от того, шесть
 * их за жест или шестьдесят. Считаем ПЕРЕСЕЧЕНИЯ границы ниши на протяжке пальца
 * через всю доску: ровно столько раз меняется `hover`, ровно столько раз экран и
 * перерисуется.
 */
it('сколько перерисовок вызывает одна протяжка через доску', () => {
  const строки: string[] = [];
  for (const L of [12, 58]) {
    const ниш = targetSlots(L);
    const сетка = gridFor(L);
    const lay = gsLayout(360, 640, сетка.cols, сетка.rows);
    const geom: BoardGeom = {
      cols: сетка.cols, rows: сетка.rows, cellW: lay.cellW, nicheH: lay.nicheH,
      pad: 9, gap: 9, boardW: 360,
    };
    const mask = Array.from({ length: сетка.cols * сетка.rows }, (_, i) => i < ниш);
    const высота = geom.pad + сетка.rows * (geom.nicheH + geom.gap);
    /* Протяжка по диагонали через всю доску за 60 событий — примерно полсекунды. */
    let прошлая: number | null = -1;
    let смен = 0;
    for (let i = 0; i <= 60; i += 1) {
      const t = i / 60;
      const n = nicheAtPoint(geom.pad + t * (geom.boardW - 2 * geom.pad), geom.pad + t * (высота - 2 * geom.pad), geom, mask);
      if (n !== прошлая) { смен += 1; прошлая = n; }
    }
    строки.push(`L${L} (сетка ${сетка.cols}×${сетка.rows}): ${смен} смен подсветки на 60 событий протяжки`);
  }
  console.log('\nПЕРЕСЕЧЕНИЙ НИШИ ЗА ОДНУ ПРОТЯЖКУ (столько раз перерисуется доска):\n' + строки.join('\n'));
  expect(строки.length).toBe(2);
});
