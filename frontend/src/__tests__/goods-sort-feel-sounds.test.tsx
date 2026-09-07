/**
 * 🔴 ОТВЕТ НА ХОД ПРОВЕРЯЕТСЯ ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА.
 *
 * Соседний файл `goods-sort-feel` сверял ТЕКСТ экрана: искал в нём `sndPlace()`,
 * `sndMatch()`, `sndCombo(clearedNow)`. Такая проверка краснеет от
 * переименования и молчит о поломке — 07.09.2026 она уже покраснела от переезда
 * каскада в ядро при полностью неизменном поведении. И наоборот: перепутай кто
 * местами `sndPlace` и `sndMatch`, оба имени остались бы в файле, и гейт был бы
 * зелёным, пока сбор тройки звучал бы как обычное перекладывание.
 *
 * Здесь звуковой слой ПОДМЕНЁН счётчиком вызовов, и партия ведётся по-настоящему:
 * что прозвучало, то и записано.
 *
 * ⚠️ ОТДЕЛЬНЫМ ФАЙЛОМ, ПОТОМУ ЧТО ПОДМЕНА — НА УРОВНЕ МОДУЛЯ. `jest.mock`
 * поднимается выше импортов и действует на весь файл; звать его в общем наборе
 * значило бы подменить звук и тем пробам, которые про него ничего не говорят.
 */
import React from 'react';

/**
 * ⚠️ Имя с приставки `mock` не для красоты: фабрика `jest.mock` поднимается выше
 * всех объявлений, и обращаться из неё к обычной внешней переменной jest
 * запрещает — исключение сделано ровно для этой приставки.
 */
const mockОтклик: string[] = [];
jest.mock('@/src/services/feedback', () => {
  const настоящий = jest.requireActual('@/src/services/feedback');
  return {
    ...настоящий,
    sndPlace: () => { mockОтклик.push('place'); },
    sndMatch: () => { mockОтклик.push('match'); },
    sndCombo: (n: number) => { mockОтклик.push(`combo:${n}`); },
    sndWrong: () => { mockОтклик.push('wrong'); },
    hapticTap: () => { mockОтклик.push('tap'); },
    hapticSuccess: () => { mockОтклик.push('success'); },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports
const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/*
 * 🔴 СЕМЯ ДЕРЖИТСЯ ДО КОНЦА ПРОБЫ, А НЕ ДО КОНЦА МОНТИРОВАНИЯ: раздача уровня
 * доезжает эффектами и таймером, то есть уже ПОСЛЕ возврата из `открыть`.
 * Вернёшь настоящий `Math.random` раньше — расклад снова станет случайным, и
 * проба будет то проходить, то нет, причём под нагрузкой чаще нет.
 */
const НАСТОЯЩИЙ_RANDOM = Math.random;
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
  Math.random = НАСТОЯЩИЙ_RANDOM;
});

const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

async function открыть(уровень: number, семя: number) {
  /*
   * 🔴 ПРЕДЫДУЩИЙ ЭКРАН ГАСИМ ПЕРЕД ОТКРЫТИЕМ СЛЕДУЮЩЕГО, А НЕ В КОНЦЕ ПРОБЫ.
   *
   * 📍 Проба перебирает семена в одном тесте, и первая редакция копила все
   * экраны живыми. А `открыть` начинается с `AsyncStorage.clear()` — то есть
   * вытирает хранилище ПОД НОГАМИ у уже смонтированных экранов: они замечают
   * пропажу уровня, перераздаются и по дороге съедают поток засеянного
   * `Math.random`. Соло это проходило, в общем прогоне давало «сбор тройки так и
   * не случился» — и выглядело как шумная машина.
   */
  while (открытые.length) {
    const прежний = открытые.pop();
    await TestRenderer.act(async () => { прежний.unmount(); });
  }
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_goods_sort_level_free', String(уровень));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/goods-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
  Math.random = seeded(семя);
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
 * Подписи полок, ПО ОДНОЙ НА ПОЛКУ.
 *
 * 📍 Дубли — не мелочь: `findAll` отдаёт подпись каждого вложенного узла, и одна
 * полка приходит четырежды. Жадный игрок находил «две полки с одинаковой
 * верхушкой», которые были ОДНОЙ И ТОЙ ЖЕ, и партия не двигалась.
 */
function подписи(r: any): Map<number, string> {
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

/** Кнопка-цель полки. */
function полка(r: any, номер: number): any {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && new RegExp(`^(Полка|Shelf) ${номер}[,:]`).test(String(n.props?.accessibilityLabel ?? '')))[0];
}

/** Верхний товар полки: кнопка последнего предмета — именно её жмёт игрок. */
function верхнийТовар(r: any, номер: number): any {
  const все = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && new RegExp(`, (Полка|Shelf) ${номер}$`).test(String(n.props?.accessibilityLabel ?? '')));
  return все[все.length - 1];
}

/** Содержимое полки по подписи; `null` — пусто. Состояние (заморожена и т. п.) отбрасываем. */
function товары(подпись: string): string[] {
  const хвост = подпись.slice(подпись.indexOf(':') + 1).trim();
  if (/пусто|empty/i.test(хвост)) return [];
  return хвост.split(',').map((x) => x.trim()).filter(Boolean);
}

/** Полка с препятствием: в подписи есть состояние между номером и двоеточием. */
function занятая(по: Map<number, string>): number | null {
  for (const [номер, с] of по) if (/^(Полка|Shelf) \d+,/.test(с)) return номер;
  return null;
}

async function ход(r: any, откуда: number, куда: number) {
  await TestRenderer.act(async () => { верхнийТовар(r, откуда)?.props.onPress?.(); });
  await TestRenderer.act(async () => { полка(r, куда)?.props.onPress?.(); });
}

describe('звук отвечает тому, что произошло', () => {
  /**
   * 🔴 ОБЫЧНОЕ ПЕРЕКЛАДЫВАНИЕ И СБОР ТРОЙКИ ЗВУЧАТ РАЗНО.
   *
   * ⚠️ Проверяются ОБЕ стороны. «Прозвучал place» без «на сборе звучит match»
   * зеленело бы у игры, которая всегда играет одно и то же; и наоборот.
   */
  it('🔴 перекладывание звучит place, сбор тройки — match', async () => {
    let былоPlace = false; let былоMatch = false;
    for (const семя of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const r = await открыть(3, семя);
      const по = подписи(r);
      expect(по.size).toBeGreaterThan(3);
      for (let шаг = 0; шаг < 60 && !(былоPlace && былоMatch); шаг += 1) {
        const сейчас = подписи(r);
        const номера = [...сейчас.keys()];
        const было = [...сейчас.values()].join('|');
        let сделал = false;
        for (const a of номера) {
          const t = товары(сейчас.get(a) as string);
          if (!t.length) continue;
          const верх = t[t.length - 1] as string;
          for (const b of номера) {
            if (b === a) continue;
            const цель = товары(сейчас.get(b) as string);
            if (цель.length && цель[цель.length - 1] !== верх) continue;
            mockОтклик.length = 0;
            await ход(r, a, b);
            if ([...подписи(r).values()].join('|') === было) continue;
            сделал = true;
            if (mockОтклик.includes('place')) былоPlace = true;
            if (mockОтклик.includes('match') || mockОтклик.some((x) => x.startsWith('combo:'))) былоMatch = true;
            break;
          }
          if (сделал) break;
        }
        if (!сделал) break;
      }
      if (былоPlace && былоMatch) break;
    }
    expect(былоPlace).toBe(true);
    expect(былоMatch).toBe(true);
  }, 300_000);

  /**
   * 🔴 ОТКАЗ ПО ПРЕПЯТСТВИЮ ОБЯЗАН ОЩУЩАТЬСЯ. Иначе он неотличим от «не
   * нажалось»: человек жмёт второй раз, и второе нажатие делает уже другое.
   *
   * ⚠️ Молчание тоже проверяется, и это не педантизм: если бы «нельзя» звучало
   * ВСЕГДА, отказ по полной полке и повторный тык по той же нише сыпали бы
   * тревогой там, где и так видно, почему не вышло.
   */
  it('🔴 отказ по препятствию отзывается звуком, обычная неудача молчит', async () => {
    let проверено = false;
    for (const семя of [1, 2, 3, 4, 5, 6, 7, 8] as const) {
      const r = await открыть(26, семя);
      const по = подписи(r);
      const плохая = занятая(по);
      if (плохая === null) continue;
      const источник = [...по.keys()].find((n) => n !== плохая && товары(по.get(n) as string).length > 0);
      if (источник === undefined) continue;

      mockОтклик.length = 0;
      await ход(r, источник, плохая);
      expect(mockОтклик).toContain('wrong');

      /*
       * 🔴 И ОБРАТНАЯ СТОРОНА: отказ БЕЗ препятствия молчит.
       *
       * 📍 Первая редакция брала сюда «тык по той же самой нише» — и мутация
       * «тревога звучит на любой неудаче» (условие ветки заменено на `true`)
       * ЕЁ ПЕРЕЖИЛА. Причина: повторный тык по своей же полке снимает выбор и
       * до `moveItem` не доходит вовсе, то есть проверялось молчание там, где
       * ветка не исполняется. Нужен отказ, который ДОХОДИТ до неё: цель без
       * препятствия, но с чужим товаром наверху.
       */
      const верх = (n: number) => { const t = товары(по.get(n) as string); return t[t.length - 1] ?? null; };
      const чужая = [...по.keys()].find((n) => n !== плохая && n !== источник
        && !/^(Полка|Shelf) \d+,/.test(по.get(n) as string)
        && верх(n) !== null && верх(n) !== верх(источник));
      if (чужая === undefined) continue;
      mockОтклик.length = 0;
      await ход(r, источник, чужая);
      expect(mockОтклик).not.toContain('wrong');
      проверено = true;
      break;
    }
    // Иначе проба хвалила бы партию, в которой препятствий не оказалось вовсе.
    expect(проверено).toBe(true);
  }, 300_000);
});
