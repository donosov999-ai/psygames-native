/**
 * ВЫБОР ВИДА ИГРЫ ОБЯЗАН ПЕРЕЖИТЬ ВЫХОД С ЭКРАНА.
 *
 * 🔴 ЗАЧЕМ. Настройка «показывать слова рядом с полем» — это не поблажка, а
 * ВТОРОЕ УПРАЖНЕНИЕ: классические филворды меряют порождение («какие слова тут
 * вообще могут быть»), со списком — узнавание («где именно лежит вот это»).
 * Замер 06.09.2026: тумблер жил в useState(false), и после выхода из партии
 * возвращался в «выкл» без единого касания — человек, выбравший другую игру,
 * получал прежнюю при каждом заходе.
 *
 * ⚠️ ПРОБА ОТРИСОВЫВАЕТ ЭКРАН, А НЕ ЧИТАЕТ ЕГО ИСХОДНИК. Соседний гейт
 * fillwords-screen читает файл и оправдывает это тем, что «рендерера экранов в
 * прогоне нет: testMatch — только *.test.ts». Это УСТАРЕЛО: в package.json
 * testMatch содержит и *.test.tsx, экран поднимается в обёртке провайдеров
 * (замер: 630 узлов дерева). Чтение исходника здесь не годится принципиально —
 * строка `AsyncStorage.setItem(...)` в файле зеленеет и тогда, когда её никто
 * не вызывает.
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { ThemeProvider } from '@/src/contexts/ThemeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { PlayerLevelProvider } from '@/src/contexts/PlayerLevelContext';
import { WarmupProvider } from '@/src/contexts/WarmupContext';

const mockХранилище: Map<string,string> = new Map<string, string>();
const mockЗаписи: [string, string][] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(mockХранилище.has(k) ? mockХранилище.get(k)! : null)),
    setItem: jest.fn((k: string, v: string) => { mockЗаписи.push([k, v]); mockХранилище.set(k, v); return Promise.resolve(); }),
    removeItem: jest.fn(() => Promise.resolve()),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock, иначе экран возьмёт настоящее хранилище
const TestRenderer = require('react-test-renderer');

const КЛЮЧ = 'psygames_fillwords_wordlist';
const МЕТРИКИ = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/**
 * 🔴 КАЖДЫЙ ПОДНЯТЫЙ ЭКРАН ОБЯЗАН БЫТЬ ПОГАШЕН.
 *
 * 📍 Замер 07.09.2026 (`--detectOpenHandles`): пробы поднимали экран и не
 * размонтировали его. В шапке живёт питомец, а у него ВЕЧНАЯ петля кадров
 * (`PetSprite.tsx:558`, такт 140–420 мс). Она срабатывала уже ПОСЛЕ сноса
 * окружения jest, дерево шло на перерисовку, `react-native` к тому моменту
 * отдавал вместо `useWindowDimensions` пустоту — и процесс падал ЦЕЛИКОМ,
 * унося весь прогон после этого набора. Со стороны выглядело как «jest упал»
 * без единого имени пробы: итог не успевал напечататься.
 *
 * ⚠️ Сам компонент питомца исправен — он гасит свой интервал на размонтаже.
 * Утечка была ровно в том, что размонтажа не происходило.
 */
let поднятый: any = null;

afterEach(() => {
  if (!поднятый) return;
  const r = поднятый; поднятый = null;
  TestRenderer.act(() => { r.unmount(); });
});

async function поднять() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. комментарий про jest.mock
  const Экран = require('@/app/games/proofreading').default;
  let root: any;
  await TestRenderer.act(async () => {
    root = TestRenderer.create(
      <SafeAreaProvider initialMetrics={МЕТРИКИ}>
        <ProfileProvider><ThemeProvider><LanguageProvider>
          <PlayerLevelProvider><WarmupProvider><Экран /></WarmupProvider></PlayerLevelProvider>
        </LanguageProvider></ThemeProvider></ProfileProvider>
      </SafeAreaProvider>,
    );
  });
  поднятый = root;
  return root;
}

/** Тумблер ищем по РОЛИ, а не по подписи: подпись переводится, роль — нет. */
function тумблер(root: any) {
  const все = root.root.findAll(
    (n: any) => n.props && n.props.accessibilityRole === 'switch',
    { deep: true },
  );
  return все.length ? все[0] : null;
}

/**
 * Переключиться в филворды НЕ ПО ПОДПИСИ КНОПКИ. Подписи переводятся: в прогоне
 * язык английский («Fillwords»), а у человека любой из двенадцати — проба,
 * завязанная на текст, покраснела бы от смены языка, ничего не сказав про
 * хранилище. Кнопки РЕЖИМА отличает не текст, а `accessibilityState.selected`:
 * им помечен ряд выбора задачи. Жмём только их — три штуки — и берём ту, после
 * которой на экране появился тумблер.
 *
 * ⚠️ Перебирать ВСЕ кнопки экрана нельзя: среди них «Начать», и проба вместо
 * настройки запускала бы партию (первая версия так и делала — 70 нажатий,
 * прогон не уложился в пять минут).
 */
async function войтиВФилворды(root: any) {
  const режимы = root.root.findAll(
    (n: any) => n.props
      && n.props.accessibilityRole === 'button'
      && typeof n.props.onPress === 'function'
      && n.props.accessibilityState
      && typeof n.props.accessibilityState.selected === 'boolean',
    { deep: true },
  );
  /*
    Разводим по ССЫЛКЕ НА ОБРАБОТЧИК, а не по подписи. У кнопок режима
    accessibilityLabel нет вовсе — название лежит в дочернем Text, — поэтому
    дедуп по метке склеивал ОБА режима в один ключ '' и жал только первый,
    уже выбранный. Ссылка же различает режимы и при этом схлопывает пару
    «составной узел + хостовый», которую findAll возвращает на каждую кнопку.
  */
  const нажатые = new Set<unknown>();
  for (const b of режимы) {
    if (нажатые.has(b.props.onPress)) continue;
    нажатые.add(b.props.onPress);
    await TestRenderer.act(async () => { b.props.onPress(); });
    if (тумблер(root)) return true;
  }
  return false;
}

beforeEach(() => { mockХранилище.clear(); mockЗаписи.length = 0; });

it('щелчок по тумблеру записывает выбор в хранилище', async () => {
  const root = await поднять();
  expect(await войтиВФилворды(root)).toBe(true);
  const t = тумблер(root);
  expect(t).not.toBeNull();
  expect(t.props.accessibilityState.checked).toBe(false);

  await TestRenderer.act(async () => { t.props.onPress(); });

  expect(mockЗаписи).toContainEqual([КЛЮЧ, '1']);
  expect(тумблер(root).props.accessibilityState.checked).toBe(true);

  await TestRenderer.act(async () => { тумблер(root).props.onPress(); });
  expect(mockЗаписи).toContainEqual([КЛЮЧ, '0']);
});

it('сохранённый выбор поднимается при следующем входе', async () => {
  mockХранилище.set(КЛЮЧ, '1');
  const root = await поднять();
  expect(await войтиВФилворды(root)).toBe(true);
  expect(тумблер(root)!.props.accessibilityState.checked).toBe(true);
});

it('пустое хранилище оставляет прежний вид игры', async () => {
  const root = await поднять();
  expect(await войтиВФилворды(root)).toBe(true);
  expect(тумблер(root)!.props.accessibilityState.checked).toBe(false);
});

/**
 * 🔴 ПАРТИЯ ФИЛВОРДОВ ДОЛЖНА ЗАПУСКАТЬСЯ — ПРОБА, КОТОРОЙ НЕ ХВАТИЛО.
 *
 * 07.09.2026 коммит 54235f1a оставил main красным: экран звал `порядокДляПартии`,
 * не добавив её в импорт. Babel типы не проверяет и оставил свободную переменную,
 * поэтому нажатие «Начать» упало бы с ReferenceError.
 *
 * ⚠️ НИ ОДНА МОЯ ПРОБА ЭТОГО НЕ ЛОВИЛА. Экранная доходила только до тумблера,
 * пробы осей звали ядро напрямую. Поломку нашёл соседний чат по tsc — то есть
 * набор был зелёным на сломанном экране. Здесь закрывается ровно эта дыра:
 * кнопка «Начать» нажимается по-настоящему, и на поле появляются буквы.
 */
it('нажатие «Начать» поднимает поле, а не падает', async () => {
  /*
   * 🔴 ЧАСЫ ПОДДЕЛЬНЫЕ — ИНАЧЕ ПАДАЕТ ВЕСЬ ПРОГОН, А НЕ ЭТА ПРОБА.
   *
   * 📍 07.09.2026: партия заводит отсчёт. С настоящими часами таймер срабатывал
   * уже ПОСЛЕ сноса окружения jest: экран шёл на перерисовку, `react-native`
   * отдавал вместо `useWindowDimensions` пустоту, и процесс падал целиком — до
   * вывода итога. Со стороны это выглядело как «набор упал на 423 наборах»,
   * хотя сама проверка проходила. Поддельные часы не заводят ничего реального.
   */
  jest.useFakeTimers();
  const root = await поднять();
  expect(await войтиВФилворды(root)).toBe(true);

  const кнопки = () => root.root.findAll((n: any) => n.props
    && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function', { deep: true });
  const чисто = (t: string) => [...(t || '')].filter((c) => {
    const k = c.charCodeAt(0); return !(k >= 0xE000 && k <= 0xF8FF);
  }).join('').trim();
  const текст = (b: any): string => {
    const o: string[] = [];
    const идти = (x: any) => { if (typeof x === 'string') o.push(x);
      else if (Array.isArray(x)) x.forEach(идти);
      else if (x && x.props) идти(x.props.children); };
    идти(b.props.children); return чисто(o.join(''));
  };
  const старт = кнопки().find((b: any) => текст(b).length > 0 && текст(b).length < 10
    && String(b.props.accessibilityLabel ?? '') === 'Start');
  expect(старт).toBeTruthy();
  await TestRenderer.act(async () => { старт.props.onPress(); });

  // Клетки поля — одиночные буквы. Если экран упал, их не будет ни одной.
  const буквы: string[] = [];
  root.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props && n.props.children;
    if (typeof c === 'string' && [...c].length === 1 && /\p{L}/u.test(c)) буквы.push(c);
  });
  expect(буквы.length).toBeGreaterThanOrEqual(9);

  /*
   * 🔴 ПАРТИЮ ОБЯЗАТЕЛЬНО ГАСИТЬ. Нажатие «Начать» заводит таймеры отсчёта; без
   * размонтирования они срабатывают уже ПОСЛЕ сноса окружения jest, экран идёт
   * на перерисовку, а `react-native` к тому моменту отдаёт вместо
   * `useWindowDimensions` пустоту — процесс падает целиком, до вывода итога, и
   * весь прогон выглядит как «набор упал», хотя проверка прошла.
   */
  jest.useRealTimers();
});
