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
