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
 * 🔴 ЭКРАНЫ ГАСИМ ПОСЛЕ КАЖДОЙ ПРОБЫ, И ЭТО НЕ ОПРЯТНОСТЬ, А УСЛОВИЕ ПРОГОНА.
 *
 * 📍 09.09.2026: этот набор — одна из четырёх течей, из-за которых полный
 * `npx jest` не доходит до конца. Незакрытый каркас держит `setTimeout` питомца
 * и всплывающих очков; после `afterAll` они продолжают тикать, и первый же кадр
 * по снесённому окружению даёт «Cannot log after tests are done» и падение
 * процесса. В общем прогоне набор от этого краснеет БЕЗ ЕДИНОЙ строки `✕` —
 * вердикт зелёный, смерть после него.
 */
const открытыеЭкраны: any[] = [];
afterEach(async () => {
  while (открытыеЭкраны.length) {
    const r = открытыеЭкраны.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});


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
  открытыеЭкраны.push(r);
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

/*
 * 🔴 ПОТОЛКИ ВРЕМЕНИ ПОДНЯТЫ ПОД ПОЛНЫЙ ПРОГОН, А НЕ ПОД ОДИНОЧНЫЙ.
 *
 * 📍 Замер 07.09.2026: соло этот набор идёт секунды, а в полном прогоне (496
 * наборов, 5434 пробы, воркеры делят машину) — сотни. Первый полный прогон
 * уронил три набора, поднимающих настоящий экран игры, ИСКЛЮЧИТЕЛЬНО по
 * таймауту: `cake-sort-uses-prebuilt` 286 с, `goods-sort-settle-reduced` 300 с,
 * `goods-sort-backrow-visible` 420 с. Логика в них не менялась.
 *
 * ⚠️ Это не «щедрый лимит на всякий случай»: набор, зелёный соло и красный в
 * общем прогоне, ничем не отличается от сломанного — приёмка идёт по полному
 * прогону. Поднимать цену пробы это не разрешает: она и так режется (выбор
 * источника один раз на пару, а не два рендера на кандидата).
 */
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
      /*
       * ⚠️ Выбор — один раз на источник, дальше только цели: негодная цель стоит
       * один рендер экрана вместо двух. Без этого набор шёл 300 с в общем
       * прогоне и облагал налогом все чаты.
       */
      const выбрать = async (a: number) => {
        await TestRenderer.act(async () => { верхнийТовар(a)?.props.onPress?.(); });
      };
      const положить = async (b: number) => {
        await TestRenderer.act(async () => { полка(r, b)?.props.onPress?.(); });
        сдвигов += r.root.findAll((n: any) => typeof n.type !== 'string'
          && n.props?.testID === 'niche-settle').length;
      };
      const ход = async (a: number, b: number) => { await выбрать(a); await положить(b); };

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
  }, 900_000);
});
