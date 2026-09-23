/* psygames-aux-row-under-field · VER 4 · 17.09.2026 */
/**
 * 🔴 СЛУЖЕБНЫЕ ДЕЙСТВИЯ — ОДНИМ РЯДОМ ЗНАЧКОВ ПОД ПОЛЕМ, У ВСЕХ ИГР, ГДЕ БЫ ИХ НИ ПРОСИЛИ ПОСТАВИТЬ.
 *
 * 📍 Денис 17.09.2026, кадр «Соедини точки» 375×667 («Открыть одну пару» и «Показать решение» —
 * подписанными пилюлями двумя рядами над полем): «их место снизу иконками под окном упражнения,
 * рядом с „Отменить“ и „Начать заново“… это надо везде такое правило делать».
 *
 * VER 1 этого файла (11.09.2026) стерёг обратное — служебное В ПОЛОСЕ СЧЁТЧИКОВ (`auxInHud`), чтобы
 * ряд над полем не отнимал 54 pt. Теперь у одного действия одно место: каркас ставит всё из
 * `headerActions` и лампочку `solution` одним рядом (`game-aux-row`) сразу под полем, а `auxInHud` и
 * `bottom="actions"` место больше не меняют. Имя файла прежнее — по нему его знают читатели каркаса.
 *
 * ЧТО СТЕРЕЖЁТСЯ (раскладки в `react-test-renderer` нет — геометрию меряет живой аудит
 * `scripts/slot-audit.mjs`; здесь устройство):
 *   1. ряд ровно один и ПРИБИТ сразу под полем (не внутри поля: содержимое, занявшее всё поле, выталкивало
 *      его за край окна — обход 17.09.2026); над полем и в полосе счётчиков служебного нет — при любых
 *      `auxInHud` и `bottom`;
 *   2. в прокручиваемом поле так же — сразу ПОД окном прокрутки, а не в конце содержимого;
 *   3. в ряду кнопка — значок: слово уходит в подпись для чтеца, остаток ресурса остаётся числом;
 *      «СТОП» без значка получает знак остановки; `GameAuxBar` своей коробки не заводит;
 *   4. лампочка «Показать решение» — в том же ряду, последней;
 *   5. плейлист (`frame`) сохраняет свой слот над полем фиксированной высоты;
 *   6. «Начать заново» из пункта паузы — значком в том же ряду (Денис 17.09.2026: «по 20 играм — да»);
 *      при `confirmExit` сначала вопрос «Начать заново?», у экрана со своим рядом (`auxRestart=false`) — нет.
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

/** Непосредственные хост-потомки узла (сквозь составные обёртки). */
const хостДети = (узел: any): any[] => {
  const вых: any[] = [];
  const обойти = (n: any) => {
    for (const ребёнок of n.children ?? []) {
      if (typeof ребёнок === 'string') continue;
      if (typeof ребёнок.type === 'string') вых.push(ребёнок); else обойти(ребёнок);
    }
  };
  обойти(узел);
  return вых;
};

/** Хост-узел, следующий в колонке каркаса сразу за полем. */
const заПолем = (r: any) => {
  const поле = якоря(r.root, 'game-field')[0]!;
  let колонка = поле.parent;
  while (колонка && якоря(колонка, 'game-aux-row').length === 0) колонка = колонка.parent;
  if (!колонка) return null;
  const дети = хостДети(колонка);
  const i = дети.findIndex((d) => d.props?.testID === 'game-field');
  return i >= 0 ? дети[i + 1] ?? null : null;
};

it('🔴 ряд служебных — один, ПРИБИТ сразу под полем (не в конце содержимого); над полем и в полосе счётчиков пусто', async () => {
  for (const пропсы of [{}, { auxInHud: true }, { bottom: 'actions' }, { auxInHud: true, bottom: 'actions' }]) {
    const r = await поднять(пропсы);
    const где = JSON.stringify(пропсы);
    expect(`${где}: рядов ${якоря(r.root, 'game-aux-row').length}`).toBe(`${где}: рядов 1`);
    // Не внутри поля: там его выталкивает за край содержимое, занявшее всё поле («Найди отличия», 17.09.2026).
    const поле = якоря(r.root, 'game-field')[0]!;
    expect(`${где}: ряд в поле ${якоря(поле, 'game-aux-row').length}`).toBe(`${где}: ряд в поле 0`);
    expect(`${где}: за полем ${заПолем(r)?.props?.testID}`).toBe(`${где}: за полем game-aux-row`);
    expect(якоря(якоря(r.root, 'game-hud')[0]!, 'game-aux')).toHaveLength(0);
    expect(якоря(r.root, 'game-header-actions')).toHaveLength(0);
    expect(якоря(r.root, 'game-bottom-actions')).toHaveLength(0);
  }
});

it('🔴 прокручиваемое поле: ряд сразу ПОД окном прокрутки, а не в конце содержимого', async () => {
  const r = await поднять({ scrollableField: true });
  const поле = якоря(r.root, 'game-field')[0]!;
  expect(якоря(поле, 'game-aux-row')).toHaveLength(0);
  expect(якоря(r.root, 'game-aux-row')).toHaveLength(1);
  expect(заПолем(r)?.props?.testID).toBe('game-aux-row');
});

it('🔴 в ряду кнопка — значок: слова нет, число ресурса есть, GameAuxBar своей коробки не заводит', async () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
  const { GameAuxAction, GameAuxBar } = require('@/src/components/GameAuxAction');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const действия = React.createElement(GameAuxBar, null,
    React.createElement(GameAuxAction, { icon: 'bulb', label: 'Подсказка', count: 3, onPress: () => {} }),
    React.createElement(GameAuxAction, { icon: 'shuffle', label: 'Перемешать', onPress: () => {} }),
    React.createElement(GameAuxAction, { label: 'СТОП', danger: true, onPress: () => {} }));
  const r = await поднять({ headerActions: действия });
  const ряд = якоря(r.root, 'game-aux-row')[0]!;
  const кнопки = хостДети(ряд);
  expect(кнопки.map((k) => k.props?.testID)).toEqual(['game-aux', 'game-aux', 'game-aux']);
  const текст = (узел: any) => узел.findAll((n: any) => typeof n.type === 'string', { deep: true })
    .map((n: any) => n.props?.children).filter((c: any) => typeof c === 'string' || typeof c === 'number').join(' ');
  expect(текст(ряд)).not.toMatch(/Подсказка|Перемешать|СТОП/);
  expect(текст(ряд)).toContain('3');
  expect(кнопки.map((k) => k.props?.accessibilityLabel)).toEqual(['Подсказка — 3', 'Перемешать', 'СТОП']);
  // У «СТОПа» без значка в ряду — знак остановки, а не пустая кнопка.
  const значкиСтопа = кнопки[2]!.findAll((n: any) => n.props?.name === 'stop-circle-outline', { deep: true });
  expect(значкиСтопа.length).toBeGreaterThan(0);
});

it('🔴 лампочка «Показать решение» — в том же ряду, последней', async () => {
  const r = await поднять({ solution: { onPress: () => {} } });
  const ряд = якоря(r.root, 'game-aux-row')[0]!;
  const последний = хостДети(ряд).at(-1)!;
  expect(последний.props?.testID).toBe('game-solution-row');
  expect(якоря(ряд, 'game-aux')).toHaveLength(2);
});

/** Пункт паузы «Заново» — источник значка в ряду (см. проп `auxRestart`). */
const пунктЗаново = (onPress: () => void, extra: Record<string, unknown> = {}) =>
  [{ id: 'resume', label: 'Продолжить', icon: 'play', primary: true }, { id: 'restart', label: 'Заново', icon: 'refresh', onPress, ...extra }];

it('🔴 «Начать заново» из пункта паузы — значком в ряду: первым, если отмены нет; лампочка последней', async () => {
  const заново = jest.fn();
  const r = await поднять({ pauseActions: пунктЗаново(заново), solution: { onPress: () => {} } });
  const ряд = якоря(r.root, 'game-aux-row')[0]!;
  const подписи = хостДети(ряд).map((d) => d.props?.accessibilityLabel ?? d.props?.testID);
  expect(подписи).toEqual(['Заново', 'Подсказка', 'game-solution-row']);
  // Партия без прогресса (`confirmExit` не дан) — перезапуск сразу, без вопроса.
  await TestRenderer.act(async () => { хостДети(ряд)[0]!.props.onClick(); });
  expect(заново).toHaveBeenCalledTimes(1);
  expect(якоря(r.root, 'row-confirm-title')).toHaveLength(0);
});

it('🔴 порядок как у образцов: отменить, заново, потом подсказки', async () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
  const { GameAuxAction, GameAuxBar } = require('@/src/components/GameAuxAction');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const действия = React.createElement(GameAuxBar, null,
    React.createElement(GameAuxAction, { icon: 'arrow-undo', label: 'Отменить', onPress: () => {} }),
    React.createElement(GameAuxAction, { icon: 'shuffle', label: 'Перемешать', onPress: () => {} }));
  const r = await поднять({ headerActions: действия, pauseActions: пунктЗаново(() => {}) });
  const подписи = хостДети(якоря(r.root, 'game-aux-row')[0]!).map((d) => d.props?.accessibilityLabel);
  expect(подписи).toEqual(['Отменить', 'Заново', 'Перемешать']);
});

it('🔴 есть что терять (confirmExit) — значок сначала спрашивает «Начать заново?»', async () => {
  const заново = jest.fn();
  const r = await поднять({ pauseActions: пунктЗаново(заново), confirmExit: true });
  const кнопка = () => хостДети(якоря(r.root, 'game-aux-row')[0]!).find((d) => d.props?.accessibilityLabel === 'Заново')!;
  await TestRenderer.act(async () => { кнопка().props.onClick?.(); });
  expect(заново).not.toHaveBeenCalled();
  expect(якоря(r.root, 'row-confirm-title')).toHaveLength(1);
  // «Продолжить игру» — вопрос снят, перезапуска нет.
  await TestRenderer.act(async () => { якоря(r.root, 'row-confirm-stay')[0]!.props.onClick?.(); });
  expect(якоря(r.root, 'row-confirm-title')).toHaveLength(0);
  expect(заново).not.toHaveBeenCalled();
  // Снова, и теперь «Заново» — ровно один перезапуск.
  await TestRenderer.act(async () => { кнопка().props.onClick?.(); });
  await TestRenderer.act(async () => { якоря(r.root, 'row-confirm-go')[0]!.props.onClick?.(); });
  expect(заново).toHaveBeenCalledTimes(1);
  expect(якоря(r.root, 'row-confirm-title')).toHaveLength(0);
});

it('🔴 «СТОП» в ряду сначала спрашивает «Остановить упражнение?» — промах на скорости сеанс не обрывает', async () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
  const { GameAuxAction, GameAuxBar } = require('@/src/components/GameAuxAction');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const стоп = jest.fn();
  const действия = React.createElement(GameAuxBar, null,
    React.createElement(GameAuxAction, { label: 'СТОП', danger: true, onPress: стоп }));
  const r = await поднять({ headerActions: действия });
  const кнопка = () => хостДети(якоря(r.root, 'game-aux-row')[0]!).find((d) => d.props?.accessibilityLabel === 'СТОП')!;
  await TestRenderer.act(async () => { кнопка().props.onClick(); });
  expect(стоп).not.toHaveBeenCalled();
  expect(якоря(r.root, 'row-confirm-title')).toHaveLength(1);
  await TestRenderer.act(async () => { якоря(r.root, 'row-confirm-stay')[0]!.props.onClick(); });
  expect(стоп).not.toHaveBeenCalled();
  expect(якоря(r.root, 'row-confirm-title')).toHaveLength(0);
  await TestRenderer.act(async () => { кнопка().props.onClick(); });
  await TestRenderer.act(async () => { якоря(r.root, 'row-confirm-go')[0]!.props.onClick(); });
  expect(стоп).toHaveBeenCalledTimes(1);
});

it('«СТОП» ВНЕ ряда каркаса (свой ряд экрана) — без вопроса, как было', async () => {
  const стоп = jest.fn();
  const r = await кнопка({ label: 'СТОП', danger: true, icon: undefined, onPress: стоп });
  const узел = r.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'game-aux')[0];
  await TestRenderer.act(async () => { узел.props.onClick(); });
  expect(стоп).toHaveBeenCalledTimes(1);
});

it('«Заново» в ряд не ставится: у экрана свой ряд (auxRestart=false), пункт выключен, плейлист', async () => {
  const свой = await поднять({ pauseActions: пунктЗаново(() => {}), auxRestart: false });
  expect(хостДети(якоря(свой.root, 'game-aux-row')[0]!).map((d) => d.props?.accessibilityLabel)).toEqual(['Подсказка']);
  const выключен = await поднять({ pauseActions: пунктЗаново(() => {}, { disabled: true }) });
  expect(хостДети(якоря(выключен.root, 'game-aux-row')[0]!).map((d) => d.props?.accessibilityLabel)).toEqual(['Подсказка']);
  const плейлист = await поднять({ pauseActions: пунктЗаново(() => {}), frame: { stats: 61, actions: 54, toolbar: 120 } });
  expect(якоря(плейлист.root, 'game-aux-row')).toHaveLength(0);
});

it('ряд — строка с переносом по центру, как ряд головоломок', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- StyleSheet после моков
  const { StyleSheet } = require('react-native');
  const r = await поднять({});
  const стиль = StyleSheet.flatten(якоря(r.root, 'game-aux-row')[0]!.props.style) as Record<string, unknown>;
  expect([стиль.flexDirection, стиль.flexWrap, стиль.justifyContent]).toEqual(['row', 'wrap', 'center']);
});

it('🔴 плейлист (frame) держит свой слот над полем фиксированной высоты — там подпись задания', async () => {
  const r = await поднять({ frame: { stats: 61, actions: 54, toolbar: 120 } });
  expect(якоря(r.root, 'game-header-actions')).toHaveLength(1);
  expect(якоря(r.root, 'game-aux-row')).toHaveLength(0);
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
