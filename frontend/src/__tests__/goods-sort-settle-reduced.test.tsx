/**
 * 🔴 В ЩАДЯЩЕМ РЕЖИМЕ СТОЛБЕЦ НЕ ЕДЕТ.
 *
 * У всего, что движется, в этом приложении есть ветка «мгновенно»: движение —
 * худшее, что можно предложить вестибулярной чувствительности, и человек,
 * который его выключил, выключил его совсем. Оседание столбца — такое же
 * движение, как вспышка ниши и дрожание при отказе.
 *
 * ⚠️ ОТДЕЛЬНЫМ ФАЙЛОМ, ПОТОМУ ЧТО РЕЖИМ ПОДМЕНЯЕТСЯ НА УРОВНЕ МОДУЛЯ. В соседней
 * пробе (`goods-sort-backrow-visible`) режим обычный, и мутация «убрать проверку
 * reduced» её переживала: ветка там просто не исполняется. Здесь исполняется
 * всегда.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('@/src/hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));

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


/** Ниши на доске: кнопки-цели с подписью полки. */
function ниш(r: any): number {
  return подписи(r).length;   // по одной на полку, без вложенных дублей
}

describe('оседание столбца слушает щадящий режим', () => {
  it('🔴 при включённом щадящем режиме сдвига нет ни на одном ходу', async () => {
    let закрылась = false;
    let сдвигов = 0;

    /*
     * Семена те же и в том же порядке, что в соседней пробе: там первое годное
     * доводит партию до закрытия, значит и здесь дойдёт — разница только в
     * режиме. Перебор фиксирован, монетки нет.
     */
    for (const семя of [1, 2, 3, 4, 5, 6] as const) {
      const r = await открыть(56, семя);
      expect(ниш(r)).toBeGreaterThan(10);
      const очередьДо = вОчереди(r);
      if (!очередьДо) continue;

      const верхнийТовар = (номер: number) => {
        const все = r.root.findAll((n: any) => typeof n.type !== 'string'
          && typeof n.props?.onPress === 'function'
          && new RegExp(`, (Полка|Shelf) ${номер}$`).test(String(n.props?.accessibilityLabel ?? '')));
        return все[все.length - 1];
      };
      const ход = async (a: number, b: number) => {
        await TestRenderer.act(async () => { верхнийТовар(a)?.props.onPress?.(); });
        await TestRenderer.act(async () => { полка(r, b)?.props.onPress?.(); });
        сдвигов += r.root.findAll((n: any) => typeof n.type !== 'string'
          && n.props?.testID === 'niche-settle').length;
        await TestRenderer.act(async () => { for (let k = 0; k < 5; k += 1) await Promise.resolve(); });
      };

      for (let шаг = 0; шаг < 120 && !закрылась; шаг += 1) {
        const сп = подписи(r);
        const ном = сп.map((s) => Number(s.match(/(?:Полка|Shelf) (\d+)/)![1]));
        const было = сп.join('|');
        let сделал = false;
        for (let a = 0; a < сп.length && !сделал; a += 1) {
          const t = верх(сп[a] as string);
          if (!t) continue;
          for (let b = 0; b < сп.length && !сделал; b += 1) {
            if (a === b || верх(сп[b] as string) !== t) continue;
            await ход(ном[a] as number, ном[b] as number);
            сделал = подписи(r).join('|') !== было;
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
        if (!сделал) break;
        if (вОчереди(r) < очередьДо) закрылась = true;
      }
      if (закрылась) break;
    }

    /*
     * ⚠️ Полка ОБЯЗАНА закрыться и здесь. Иначе проба говорила бы «сдвига нет»
     * про партию, где и оседать было нечему, — то есть хвалила бы простой.
     */
    expect(закрылась).toBe(true);
    expect(сдвигов).toBe(0);
  }, 300_000);
});
