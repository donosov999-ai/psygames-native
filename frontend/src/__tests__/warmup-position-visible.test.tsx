/**
 * ВО ВРЕМЯ ЗАРЯДКИ ВИДНО, ГДЕ ТЫ НАХОДИШЬСЯ.
 *
 * 📍 ОТЧЁТ NZT-48 `5f4eac8e` 08.09.2026, дословно: «Сколько всего серия зарядка
 * карекатурка длится ? Сколько подряд ? Нужен визуальный отображение где
 * находимся ? Я таблиц 7 решил сколько еще ?»
 *
 * 🔴 ЗАМЕР 09.09: позицию показывала РОВНО ОДНА игра из 77 под каркасом —
 * дыхание. Её собственный комментарий объяснял причину: «шаг N из M» рисует
 * экран РЕЗУЛЬТАТА, то есть человек видит позицию только МЕЖДУ упражнениями.
 * Внутри упражнения нити не было ни у кого. Ключ перевода `warmupStepOf` при
 * этом заведён давно и переведён на все языки — не хватало места, где показать.
 *
 * ЧТО СТЕРЕЖЁТ ПРОБА: каркас показывает позицию, когда зарядка идёт, и НЕ
 * показывает, когда человек играет сам. Второе не менее важно первого: лишняя
 * строка в обычной игре — это шум, который потом просят убрать.
 */
import React from 'react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

/** Состояние зарядки подменяем целиком: проверяем каркас, а не плейлист. */
let mockЗарядка: any = null;
jest.mock('@/src/contexts/WarmupContext', () => ({
  ...jest.requireActual('@/src/contexts/WarmupContext'),
  useWarmupSafe: () => mockЗарядка,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
const TestRenderer = require('react-test-renderer');
const МЕТРИКИ = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) {
    const r = поднятые.pop();
    try { TestRenderer.act(() => { r.unmount(); }); } catch { /* уже погашено */ }
  }
  mockЗарядка = null;
});

function зарядкаИзШагов(идёт: number, всего: number) {
  const шаги = Array.from({ length: всего }, (_, i) => ({
    game_id: `игра${i}`, game_route: `/games/игра${i}`, difficulty: 'medium', est_duration_sec: 60,
  }));
  return {
    active: true,
    currentIdx: идёт,
    currentStep: шаги[идёт],
    meta: { steps: шаги, duration_min: 5, est_total_sec: 300 },
    results: [],
    skipStep: () => {},
    finishStep: () => {},
  };
}

async function поднять() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const GameShell = require('@/src/components/GameShell').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { View } = require('react-native');
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИКИ },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(GameShell, { title: 'Проба' }, React.createElement(View)))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
  поднятые.push(r);
  return r;
}

/** Текст указателя позиции, если он нарисован. */
function позиция(r: any): string | null {
  const узлы = r.root.findAll((n: any) => n.props && n.props.testID === 'warmup-position', { deep: true });
  if (узлы.length === 0) return null;
  const из: string[] = [];
  const идти = (x: any) => {
    if (typeof x === 'string') из.push(x);
    else if (Array.isArray(x)) x.forEach(идти);
    else if (x && x.props) идти(x.props.children);
  };
  идти(узлы[0].props.children);
  return из.join('').trim();
}

it('🔴 идёт зарядка — каркас говорит, какая это игра по счёту', async () => {
  mockЗарядка = зарядкаИзШагов(2, 7);           // третий шаг из семи
  const r = await поднять();
  const текст = позиция(r);
  expect(текст).not.toBeNull();
  // Числа именно те: человек спрашивал «я 7 решил, сколько ещё».
  expect(текст).toMatch(/\b3\b/);
  expect(текст).toMatch(/\b7\b/);
});

it('🔴 человек играет сам — лишней строки нет', async () => {
  mockЗарядка = null;                            // зарядки нет вовсе
  const r = await поднять();
  expect(позиция(r)).toBeNull();
});

it('🔴 зарядка «не активна» — тоже без строки', async () => {
  mockЗарядка = { ...зарядкаИзШагов(0, 5), active: false, currentStep: null };
  const r = await поднять();
  expect(позиция(r)).toBeNull();
});
