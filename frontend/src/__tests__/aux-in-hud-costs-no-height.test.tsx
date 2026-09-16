/**
 * СЛУЖЕБНОЕ ДЕЙСТВИЕ В ПОЛОСЕ СЧЁТЧИКОВ: УСТРОЙСТВО, БЕЗ КОТОРОГО ЗАМЕР НЕ ПОВТОРИТСЯ.
 *
 * Механизм (`GameShell.auxInHud`) заведён 11.09.2026 вместе с переездом пяти
 * экранов на канон 119. Разбор и замеры свободной ширины — в шапке самого пропа.
 * Гейта у него не было; эта проба его закрывает.
 *
 * ЧТО ИМЕННО СТЕРЕЖЁТСЯ. Высоту в точках меряет браузер
 * (`scripts/screen-geometry.mjs`), здесь её измерить нечем — в `react-test-renderer`
 * нет раскладки. Здесь — пять утверждений об устройстве:
 *   1. в режиме `auxInHud` якорь живёт ВНУТРИ полосы и существует ровно один:
 *      нарисовать кнопки и там, и отдельным рядом — значит не сэкономить ничего;
 *   2. полоса при этом объявлена РЯДОМ. В колонке `GameAuxBar` (`flexGrow: 1,
 *      flexBasis: 0`) схлопывается в высоту 0, кнопка вылезает и перестаёт
 *      нажиматься — разбор в `aux-row-is-a-row.test.ts`, цена уже была заплачена;
 *   3. умолчание не тронуто: кто не просил — рисуется как раньше;
 *   4. `bottom="actions"` и режим замера (`frame`) сильнее: иначе одни и те же
 *      кнопки встали бы в двух местах сразу;
 *   5. компактная кнопка прячет СЛОВО, но не ОСТАТОК РЕСУРСА. У `count` записано,
 *      зачем он: «ресурс, о котором узнаёшь только когда он кончился, читается
 *      как поломка, а не как правило». Значок без числа вернул бы ровно это.
 *
 * ⚠️ ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ: ухода кнопки за правый край экрана. Он
 * ловится только шириной, то есть живьём — `scripts/slot-audit.mjs`, четвёртый
 * проход. Там же записан замер, из-за которого проход появился.
 */
import React from 'react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/games/проба',
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
const TestRenderer = require('react-test-renderer');
const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/*
 * ⚠️ Экраны гасим после каждой пробы: невыключенный каркас держит таймеры питомца
 * и роняет процесс ПОСЛЕ вердикта — эта течь уже стоила проекту трёх наборов.
 */
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    try { await TestRenderer.act(async () => { r.unmount(); }); } catch { /* уже погашено */ }
  }
});

async function осесть() {
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
}

async function поднять(пропсы: Record<string, unknown>) {
  /* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const { Text } = require('react-native');
  const GameShell = require('@/src/components/GameShell').default;
  const { GameAuxAction, GameAuxBar } = require('@/src/components/GameAuxAction');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const действия = React.createElement(GameAuxBar, null,
    React.createElement(GameAuxAction, { compact: true, icon: 'bulb', label: 'Подсказка', onPress: () => {} }));
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(GameShell, { title: 'Проба', headerActions: действия, ...пропсы },
                React.createElement(Text, null, 'поле')))))),
    );
  });
  await осесть();
  открытые.push(r);
  return r;
}

/**
 * Узлы с якорем — ТОЛЬКО хостовые.
 *
 * ⚠️ Без этого счёт врёт вдвое: `findAll` отдаёт и составной `View`, и его
 * хост-потомка с тем же `testID`, и «якорь один» превращается в «якоря два».
 */
const якоря = (у: any, имя: string) => у.findAll(
  (n: any) => typeof n.type === 'string' && n.props?.testID === имя,
  { deep: true },
);

it('🔴 auxInHud: якорь ВНУТРИ полосы счётчиков и ровно один — иначе экономии нет', async () => {
  const r = await поднять({ auxInHud: true });
  const полоса = якоря(r.root, 'game-hud');
  expect(полоса).toHaveLength(1);
  expect(якоря(r.root, 'game-header-actions')).toHaveLength(1);
  expect(якоря(полоса[0]!, 'game-header-actions')).toHaveLength(1);
});

it('🔴 полоса с кнопкой объявлена РЯДОМ — в колонке кнопка схлопнется и перестанет нажиматься', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- StyleSheet после моков
  const { StyleSheet } = require('react-native');
  const r = await поднять({ auxInHud: true });
  const полоса = якоря(r.root, 'game-hud')[0]!;
  const плоско = StyleSheet.flatten(полоса.props.style) as Record<string, unknown>;
  expect(плоско.flexDirection).toBe('row');
});

it('🔴 умолчание не тронуто: без auxInHud ряд остаётся ОТДЕЛЬНЫМ, вне полосы', async () => {
  const r = await поднять({});
  expect(якоря(r.root, 'game-header-actions')).toHaveLength(1);
  expect(якоря(якоря(r.root, 'game-hud')[0]!, 'game-header-actions')).toHaveLength(0);
});

it('🔴 bottom="actions" и режим замера сильнее — кнопки не рисуются в двух местах', async () => {
  const вниз = await поднять({ auxInHud: true, bottom: 'actions' });
  expect(якоря(вниз.root, 'game-bottom-actions')).toHaveLength(1);
  expect(якоря(вниз.root, 'game-header-actions')).toHaveLength(0);

  // `frame` — режим постоянных высот: там ряд обязан остаться отдельной полосой,
  // иначе прибор мерил бы не то, что рисуется.
  const замер = await поднять({ auxInHud: true, frame: { stats: 61, actions: 54, toolbar: 120 } });
  expect(якоря(якоря(замер.root, 'game-hud')[0]!, 'game-header-actions')).toHaveLength(0);
  expect(якоря(замер.root, 'game-header-actions')).toHaveLength(1);
});

/** Поднять ОДНУ служебную кнопку без каркаса — для проверок её собственного вида. */
async function кнопка(пропсы: Record<string, unknown>) {
  /* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { GameAuxAction } = require('@/src/components/GameAuxAction');
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(ProfileProvider, null,
        React.createElement(ThemeProvider, null,
          React.createElement(LanguageProvider, null,
            React.createElement(GameAuxAction, { icon: 'bulb', label: 'Подсказка', onPress: () => {}, ...пропсы })))),
    );
  });
  await осесть();
  открытые.push(r);
  return r;
}

/** Весь видимый текст кнопки, без служебных глифов шрифта значков. */
const видимыйТекст = (r: any): string => {
  const куски: string[] = [];
  r.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props?.children;
    if (typeof c === 'string') куски.push(c);
    else if (typeof c === 'number') куски.push(String(c));
  });
  return [...куски.join(' ')].filter((c) => {
    const k = c.charCodeAt(0);
    return !(k >= 0xE000 && k <= 0xF8FF);
  }).join('').trim();
};

it('🔴 компактная кнопка прячет СЛОВО, но показывает ОСТАТОК', async () => {
  const полная = await кнопка({ count: 3 });
  expect(видимыйТекст(полная)).toContain('Подсказка');
  expect(видимыйТекст(полная)).toContain('3');

  const сжатая = await кнопка({ compact: true, count: 3 });
  expect(видимыйТекст(сжатая)).not.toContain('Подсказка');
  expect(видимыйТекст(сжатая)).toContain('3');   // ← число обязано остаться

  // Ресурса нет вовсе — рисовать нечего, значок остаётся один.
  const безСчёта = await кнопка({ compact: true });
  expect(видимыйТекст(безСчёта)).toBe('');
});

/**
 * 🔴 СЛУЖЕБНАЯ КНОПКА НЕ ЗАЕЗЖАЕТ ПОД СКВОЗНОЙ УГОЛ (питомец + «Правила»).
 *
 * Угловой ряд абсолютный и висит поверх любого экрана, поэтому полоса счётчиков
 * о нём не знает. Замер 16.09.2026 (Playwright, 375×812, статика от 12.09): у
 * ВСЕХ ЧЕТЫРЁХ экранов с `auxInHud` кнопка лежала под питомцем — на «Тонах
 * китайского» 76×25 под спрайтом и 38×13 под самой кнопкой «Правила», то есть
 * палец в правый верхний угол кнопки открывал правила вместо повтора звука.
 * Контроль с известным ответом: `pseudoword-echo` — тот же раздел, та же кнопка,
 * но без `auxInHud` — перекрытий ноль.
 *
 * ⚠️ ПРОБА СМОТРИТ НА ОТВЕДЁННОЕ МЕСТО, А НЕ НА ПИКСЕЛИ. Геометрию меряет живой
 * аудит (`scripts/slot-audit.mjs`) на собранном приложении; здесь сторожится то,
 * что вернуть обратно проще всего, — сам резерв. Число берётся из константы угла,
 * а не переписывается сюда: разъедутся — и кнопка снова уедет под питомца.
 */
it('🔴 auxInHud: под угловой ряд отведено место, и ровно то, что он занимает', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- после моков
  const { StyleSheet } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- после моков
  const { HELP_CORNER_RESERVE } = require('@/src/components/GameHelpOverlay');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- после моков
  const { PAD_H } = require('@/src/components/GameShell');
  const r = await поднять({ auxInHud: true });
  const ряд = якоря(r.root, 'game-header-actions')[0]!;
  const плоско = StyleSheet.flatten(ряд.props.style) as Record<string, unknown>;
  expect(`отступ справа: ${плоско.marginRight ?? 0}`).toBe(`отступ справа: ${HELP_CORNER_RESERVE - PAD_H}`);
  /* Ширина ряда 120 плюс его собственный отступ 4 — одной ширины не хватало. */
  expect(HELP_CORNER_RESERVE).toBeGreaterThan(120);
});
