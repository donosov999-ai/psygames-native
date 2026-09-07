/**
 * 🔴 ЗАДНИЙ РЯД ВИДЕН ДО ХОДА, А НЕ ПОСЛЕ.
 *
 * С L52 у части ниш за спиной стоит вторая полка: она выйдет вперёд, когда ниша
 * опустеет. Без метки такая ниша неотличима от обычной, и человек узнаёт о
 * втором ряде единственным способом — разобрав первый и получив неожиданное.
 * Ровно та угадайка, из-за которой рядом рисуются насечки ёмкости (смешанные
 * ниши) и звезда джокера.
 *
 * ⚠️ ПРОБА СМОТРИТ НА ДЕРЕВО, А НЕ НА ИСХОДНИК. Соседний набор `goods-sort-feel`
 * сверяет ТЕКСТ кода — и уже покраснел от переезда каскада в ядро при
 * неизменном поведении. Здесь монтируется настоящий экран.
 *
 * ⚠️ И ЦВЕТ МЕТКИ — ТОЖЕ ЗАМЕР, А НЕ ВКУС. Первая редакция красила край второй
 * полки тёмным «чтобы читалось как глубина», и метка пропала: замер по снимку
 * живой игры дал интерьер ниши RGB(42,23,12), а метку поверх — (52,31,12).
 * Сейчас край деревянный и притенённый: на экране (204,167,127) против
 * интерьера (82,47,36), контраст 5,25:1.
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

/*
 * 🔴 СЕМЯ ДЕРЖИТСЯ ДО КОНЦА ПРОБЫ, А НЕ ДО КОНЦА МОНТИРОВАНИЯ.
 *
 * 📍 Первая редакция возвращала настоящий `Math.random` сразу после нажатия
 * «Начать» — а раздача уровня доезжает эффектами и таймером, то есть уже ПОСЛЕ
 * возврата. Расклад снова становился случайным, и проба то проходила, то нет,
 * причём под нагрузкой чаще нет. Это выглядело как «медленная машина», а было
 * незакрытым окном.
 */
const НАСТОЯЩИЙ_RANDOM = Math.random;
afterEach(() => { Math.random = НАСТОЯЩИЙ_RANDOM; });

/**
 * Псевдослучайность с семенем: та же, что в `goods-sort-solver-cutoffs`.
 *
 * 🔴 ЗАЧЕМ ЗДЕСЬ СЕМЯ. Раздача уровня случайна (`generate` мешает пул без
 * семени), и партия, которую ведёт проба, на одном раскладе доходит до закрытия
 * полки, а на другом встаёт. Первая редакция была именно такой: соло зелено,
 * вдвоём с соседней пробой — красное, и оба раза честно. Замер прячется за
 * монеткой, поэтому расклад фиксируем.
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

/** Смонтировать «Сортировку товаров» на заданном уровне и войти в партию. */
async function открыть(уровень: number, семя = 0) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  // Ключ ровно тот, что строит usePersistentLevel: `psygames_<игра>_level_<профиль>`.
  await AsyncStorage.setItem('psygames_goods_sort_level_free', String(уровень));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/goods-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
  if (семя) Math.random = seeded(семя);
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
    && n.props?.accessibilityRole === 'button'
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

/** Плоский стиль: он бывает массивом. */
function плоско(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(плоско));
  return style;
}

/**
 * Сколько ниш помечено вторым рядом.
 *
 * 🔴 ИЩЕМ ПО ЦВЕТУ КРАЯ, А НЕ ПО ИМЕНИ СТИЛЯ. Имя стиля — внутреннее дело
 * экрана и переживёт переименование молча; цвет — то, что человек видит.
 */
function помечено(r: any): number {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && плоско(n.props?.style).backgroundColor === 'rgba(200,170,130,0.55)').length;
}

/** Ниши на доске: кнопки-цели с подписью полки. */
function ниш(r: any): number {
  return подписи(r).length;   // по одной на полку, без вложенных дублей
}

describe('задний ряд виден на доске', () => {
  /*
   * ⚠️ БЕРЁМ L52, А НЕ L58. Задние ряды идут с L52, схлопывание — с L56, и на
   * уровне с очередью раздача гоняет решателя до доказательства: замер дал 34 с
   * против штатных 20 с у пробы. Механика, которую мы проверяем, на L52 та же,
   * а стоит она секунды.
   *
   * ⚠️ И ЗАПАС ПО ВРЕМЕНИ ЯВНЫЙ, 180 с. Замер 07.09.2026: те же пробы вдвоём при
   * нагрузке от соседних чатов (19 процессов jest, load 34) выбивали штатные
   * 60 с — три прогона подряд, и каждый раз это был ТАЙМАУТ, а не логика.
   * Гейт, который краснеет от занятости машины, обходится дороже, чем ждёт.
   */
  it('🔴 на уровне с задними рядами метка есть, и не на всех нишах', async () => {
    const r = await открыть(52, 1);
    const всего = ниш(r);
    // Иначе проба хвалит пустоту: экран не дошёл до доски.
    expect(всего).toBeGreaterThan(10);

    const меток = помечено(r);
    expect(меток).toBeGreaterThan(0);
    /*
     * И не на всех: задние ряды даются ЧАСТИ ниш (`backRowCount` — не больше
     * четырёх). Метка на каждой нише означала бы, что рисуют её не по данным, а
     * по факту уровня — то есть она ничего не сообщает.
     */
    expect(меток).toBeLessThan(всего);
  }, 180_000);

  it('🔴 на уровне ДО порога задних рядов метки нет ни одной', async () => {
    const r = await открыть(20, 1);
    expect(ниш(r)).toBeGreaterThan(5);
    expect(помечено(r)).toBe(0);
  }, 180_000);
});

/**
 * Подписи полок по порядку, ПО ОДНОЙ НА ПОЛКУ.
 *
 * 📍 Дубли — не мелочь, а причина, по которой первая редакция пробы вставала на
 * нулевом шаге: `findAll` отдаёт подпись каждого вложенного узла, и одна полка
 * приходила четырежды. Жадный игрок находил «две полки с одинаковой верхушкой»,
 * которые были ОДНОЙ И ТОЙ ЖЕ, ход выходил пустым, партия не двигалась.
 */
function подписи(r: any): string[] {
  const по = new Map<number, string>();
  r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /^(Полка|Shelf) \d+:/.test(String(n.props?.accessibilityLabel ?? '')))
    .forEach((n: any) => {
      const с = String(n.props.accessibilityLabel);
      const номер = Number(с.match(/(?:Полка|Shelf) (\d+)/)![1]);
      if (!по.has(номер)) по.set(номер, с);
    });
  return [...по.keys()].sort((a, b) => a - b).map((k) => по.get(k) as string);
}

/** Кнопка-цель конкретной полки. */
function полка(r: any, номер: number): any {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && new RegExp(`^(Полка|Shelf) ${номер}:`).test(String(n.props?.accessibilityLabel ?? '')))[0];
}

/** Верхний товар полки по подписи, либо null у пустой. */
function верх(подпись: string): string | null {
  if (подпись.includes('пусто') || подпись.includes('empty')) return null;
  const части = подпись.split(':')[1]!.split(',').map((x) => x.trim());
  return части[части.length - 1] ?? null;
}

/** Сколько полок ещё в очереди — читаем у значка, как читает игрок. */
function вОчереди(r: any): number {
  const ч = r.root.findAll((n: any) => typeof n.type !== 'string'
    && /^(Ещё придёт полок|Shelves still to come)/.test(String(n.props?.accessibilityLabel ?? '')))[0];
  if (!ч) return 0;
  const м = String(ч.props.accessibilityLabel).match(/(\d+)/);
  return м ? Number(м[1]) : 0;
}

describe('столбец оседает, а не перескакивает', () => {
  /**
   * 🔴 ДВИЖЕНИЕ ЕСТЬ — И ЭТО ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ КОДА.
   *
   * Полка закрылась — всё, что стояло выше в столбце, сползает на её место. Без
   * движения это выглядит подменой: товары просто оказываются в других нишах.
   * Правило уровня обещает «оседает вниз», и обещание надо держать.
   *
   * ⚠️ ПРОБА ВЕДЁТ НАСТОЯЩУЮ ПАРТИЮ до закрытия полки (сводит одинаковые
   * верхушки, а когда сводить нечего — снимает верхний товар на пустую полку,
   * иначе третий товар пары так и остаётся под спудом).
   *
   * ⚠️ И РАСКЛАД ФИКСИРОВАН СЕМЕНЕМ. Раздача случайна, и на одном раскладе
   * партия доходит до закрытия, а на другом встаёт: первая редакция была зелёной
   * соло и красной вдвоём с соседней пробой — и оба раза честно. Перебираем
   * фиксированный список семян до первого годного: это детерминировано, а не
   * монетка.
   *
   * ⚠️ БЕРЁМ L56, А НЕ L58: схлопывание идёт с L56, а на L58 к нему добавлена
   * скрытая информация, и партию оттуда не довести — третий товар под «?», и
   * какой он, не знает и проба.
   */
  it('🔴 после закрытия полки ниши столбца получают сдвиг', async () => {
    let закрылась = false;
    let виделиСдвиг = 0;
    let семяУспеха = 0;

    for (const семя of [1, 2, 3, 4, 5, 6] as const) {
      const r = await открыть(56, семя);
      expect(ниш(r)).toBeGreaterThan(10);
      const очередьДо = вОчереди(r);
      if (!очередьДо) continue;

      const верхнийТовар = (номер: number) => {
        /*
         * ⚠️ БЕРЁМ УЗЕЛ С ОБРАБОТЧИКОМ. `findAll` отдаёт и составной узел
         * (`TouchableOpacity`), и хостовый под ним с теми же подписями; `onPress`
         * есть только у составного. Первая редакция жала хостовый, и партия не
         * двигалась вовсе — диагностика показывала «выбрано: []».
         */
        const все = r.root.findAll((n: any) => typeof n.type !== 'string'
          && typeof n.props?.onPress === 'function'
          && new RegExp(`, (Полка|Shelf) ${номер}$`).test(String(n.props?.accessibilityLabel ?? '')));
        return все[все.length - 1];   // верхний товар — последний в нише
      };
      /*
       * 🔴 ХОД — ЭТО ДВА РАЗНЫХ ТАПА. Тап по ПОЛКЕ только КЛАДЁТ выбранное
       * (`handleCellTap`), а ВЫБИРАЕТ тап по ТОВАРУ (`handleItemTap`).
       *
       * 🔴 И СДВИГ СЧИТАЕМ СРАЗУ ПОСЛЕ ХОДА, А НЕ В КОНЦЕ ПАРТИИ: движение живёт
       * 230 мс и снимает обёртку само (`start(() => setОсевшие({}))`).
       */
      /*
       * 🔴 ВЫБОР ДЕЛАЕТСЯ ОДИН РАЗ НА ИСТОЧНИК, А НЕ НА КАЖДУЮ ПАРУ.
       *
       * 📍 Первая редакция на каждую пробуемую пару тратила ДВА полных рендера
       * экрана — и негодные пары стоили столько же, сколько годные. Набор дорос
       * до 300 с в общем прогоне, то есть стал налогом на все чаты. Теперь
       * товар выбирается один раз, а дальше перебираются только цели: негодная
       * цель стоит один рендер вместо двух, и выбор при этом не сбрасывается.
       */
      const выбрать = async (изНомера: number) => {
        await TestRenderer.act(async () => { верхнийТовар(изНомера)?.props.onPress?.(); });
      };
      const положить = async (вНомер: number) => {
        await TestRenderer.act(async () => { полка(r, вНомер)?.props.onPress?.(); });
        const узлы = r.root.findAll((n: any) => typeof n.type !== 'string'
          && n.props?.testID === 'niche-settle');
        if (узлы.length > виделиСдвиг) {
          виделиСдвиг = узлы.length;
          // И сдвиг настоящий: перенос по Y, а не пустой стиль.
          expect(узлы.some((n: any) => {
            const тр = плоско(n.props?.style).transform;
            return Array.isArray(тр) && тр.some((x: any) => 'translateY' in x);
          })).toBe(true);
        }
      };
      const ход = async (изНомера: number, вНомер: number) => {
        await выбрать(изНомера);
        await положить(вНомер);
      };

      for (let шаг = 0; шаг < 120 && !закрылась; шаг += 1) {
        const сп = подписи(r);
        const ном = сп.map((s) => Number(s.match(/(?:Полка|Shelf) (\d+)/)![1]));
        const было = сп.join('|');
        let сделал = false;
        for (let a = 0; a < сп.length && !сделал; a += 1) {
          const t = верх(сп[a] as string);
          if (!t) continue;
          const цели = сп.map((s, i) => (i !== a && верх(s) === t ? i : -1)).filter((i) => i >= 0);
          if (!цели.length) continue;
          await выбрать(ном[a] as number);
          for (const b of цели) {
            await положить(ном[b] as number);
            if (подписи(r).join('|') !== было) { сделал = true; break; }
          }
        }
        if (!сделал) {
          const пустая = сп.findIndex((s) => верх(s) === null);
          for (let a = 0; a < сп.length && !сделал && пустая >= 0; a += 1) {
            if (верх(сп[a] as string) === null) continue;
            await ход(ном[a] as number, ном[пустая] as number);
            сделал = подписи(r).join('|') !== было;
          }
        }
        void ход;
        if (!сделал) break;
        if (вОчереди(r) < очередьДо) { закрылась = true; семяУспеха = семя; }
      }
      if (закрылась) break;
    }

    // Иначе проба хвалит простой: полка так и не закрылась, мерить нечего.
    expect(закрылась).toBe(true);
    expect(семяУспеха).toBeGreaterThan(0);
    /*
     * 🔴 СПРАШИВАЕМ ПРО ОСЕДАНИЕ ИМЕННО, А НЕ «ЕСТЬ ЛИ СДВИГ НА ЭКРАНЕ».
     * 📍 Редакция до этой искала любой узел с `translateY` — и была ЛОЖНО
     * ЗЕЛЁНОЙ: такой сдвиг есть у мини-карты, у выбранного товара, у летящей
     * копии и у слоя перетаскивания. Три мутации подряд её пережили.
     */
    expect(виделиСдвиг).toBeGreaterThan(0);
  }, 300_000);
});
