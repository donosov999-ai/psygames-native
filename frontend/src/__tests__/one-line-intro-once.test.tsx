/* psygames-one-line-intro-once · VER 2 · 17.09.2026 */
/**
 * «ОДНА ЛИНИЯ»: ПРАВИЛА И ТРЕНИРОВКА — ОДИН РАЗ ЗА ЗАХОД, ПАРТИЯ ПОСЛЕ ТРЕНИРОВКИ ИДЁТ САМА.
 *
 * 📍 ПОВОД. Два отчёта тестировщика 12.09.2026 (c96bfdd3, 76d9a90e; 2.54.5, iPhone, 403×873):
 * «Почему стоит? Не переходит дальше» — кадр карточки «Тренировка пройдена»; «Выскакивает
 * между уровнями справка с тренировки» — кадр экрана правил. Замер 17.09.2026 на
 * экспорт-сборке, окно 403×873, путь пальцем по уровням 1 и 2:
 *   · после итога уровня экран каждый раз вёл в правила и в тренировку заново;
 *   · карточка «Тренировка пройдена» стояла 3 с без нажатия как стояла;
 *   · тренировочная фигура совпадала с первым уровнем ход в ход (3-1-5-4-2-5-3-4) —
 *     после «Начать партию» на экране был тот же рисунок с нулём рёбер.
 *
 * ⚠️ ПРОБА ЖМЁТ, А НЕ ЧИТАЕТ ИСХОДНИК. Экран монтируется целиком, партия проходится
 * нажатиями по вершинам из решения ядра, карточка итога отдаёт настоящий `onContinue`.
 * Рядом у «Соедини точки» мутация «модуль не слушает skipIntro» уже однажды прошла зелёной
 * мимо проверки проводки — здесь проверяется то, что человек увидит после «Продолжить».
 *
 * 📍 VER 2 — «ОДИН РАЗ ЗА ЗАХОД» ОКАЗАЛОСЬ «ПРИ КАЖДОМ ЗАПУСКЕ» (отчёт 96ea896d, 17.09.2026,
 * 2.54.17, «Соедини точки»; задача d952c080). Знакомство само — только пока профиль его не
 * прошёл: флаг `useIntroSeen` ставится первым ходом в партии, пройденные уровни тоже считаются.
 */
import React from 'react';
import { holdGame, __resetGameClock } from '@/src/services/gamePause';
import OneLineScreen from '@/app/games/one-line';
import OneLineGame, { TRAINING_AUTO_MS } from '@/src/games/one-line/OneLineGame';
import {
  createOneLineSession,
  generateOneLinePuzzle,
  generateOneLineTrainingPuzzle,
  getOneLineStrings,
  startOneLineRound,
  startOneLineTraining,
  validateEulerGraph,
} from '@/src/games/one-line/core/index';
import { AUTHORED_LEVEL_COUNT } from '@/src/games/one-line/core/authored';
import { totalEdgeUses } from '@/src/games/one-line/core/validator';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', bg: '#000', text: '#fff', textSecondary: '#999', card: '#222', border: '#333', primary: '#7c6cf0', surface: '#111', success: '#0c0', error: '#c00', warning: '#fa0' }, isDark: true }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
/**
 * ⚠️ СВОЙ ПРОФИЛЬ НА КАЖДУЮ ПРОБУ ЭКРАНА. Уровень помнит не только AsyncStorage, но и память
 * модуля (`levelCache.ts`): вторая проба на том же профиле начинала с уровня, до которого дошла
 * первая, и решение первого уровня его не решало.
 */
let mockProfileId = 'intro-once-0';
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: mockProfileId } }) }));
/** Параметры адреса: `auto=1` — запуск из зарядки или вызова дня (автостарт). */
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Каркас подменён: нужна только сцена партии. Выход и пауза каркаса здесь не предмет. */
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, PAD_H: 16, БЕЗ_ЖЕСТА_ПРОКРУТКИ: {}, default: ({ children }: any) => React.createElement(View, null, children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Карточка итога — узел с настоящими пропами: `onContinue` зовётся тем же, что вызвала бы она. */
jest.mock('@/src/components/LevelCleared', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, default: (p: any) => React.createElement('LevelCleared', p) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/games/balls/BallStylePicker', () => ({ __esModule: true, default: () => null }));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

const S = getOneLineStrings('ru');
const деревья: any[] = [];
afterEach(async () => {
  mockParams = {};
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => { try { д.unmount(); } catch { /* снят */ } }); });
  jest.useRealTimers();
  __resetGameClock();
});

async function дождаться(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
}

function текст(дерево: any): string {
  const acc: string[] = [];
  const walk = (n: any) => {
    if (n == null || n === false) return;
    if (typeof n === 'string') { acc.push(n); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) walk(n.children);
  };
  walk(дерево.toJSON());
  return acc.join(' ');
}

/** Нажатие через композит с `onPress` — тот же обработчик, что у пальца. */
function нажать(дерево: any, подпись: string): void {
  const узел = дерево.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && (n.props.accessibilityLabel === подпись || String(n.props.accessibilityLabel ?? '').startsWith(`${подпись}.`)), { deep: true })[0]
    ?? дерево.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && n.findAll((m: any) => m.props?.children === подпись).length > 0)[0];
  if (!узел) throw new Error(`нет нажимаемого «${подпись}»; на экране: ${текст(дерево).slice(0, 300)}`);
  TestRenderer.act(() => { узел.props.onPress(); });
}

const вершина = (puzzle: any, id: string) => `Вершина ${puzzle.vertices.findIndex((v: any) => v.id === id) + 1}`;

function пройти(дерево: any, puzzle: any): void {
  for (const id of puzzle.solution.vertexIds) нажать(дерево, вершина(puzzle, id));
}

const партияУровня = (текстЭкрана: string) => /Уровень (\d+) · вершин/.exec(текстЭкрана)?.[1] ?? null;

describe('тренировочная фигура — своя, и учит тому правилу, ради которого она есть', () => {
  it('🔴 не совпадает ни с одним рисованным уровнем', () => {
    const тренировка = generateOneLineTrainingPuzzle('any');
    const рисунок = (p: any) => JSON.stringify([p.vertices, p.edges]);
    const совпала = Array.from({ length: AUTHORED_LEVEL_COUNT }, (_, i) => i + 1)
      .filter((lv) => рисунок(generateOneLinePuzzle(`one-line-${lv}`, lv)) === рисунок(тренировка));
    expect(`совпала с уровнями: [${совпала.join(', ')}]`).toBe('совпала с уровнями: []');
    // В сессии лежит именно она, а не фигура первого уровня.
    const сессия = createOneLineSession({ seed: 'one-line-1', level: 1 });
    expect(рисунок(сессия.trainingPuzzle)).toBe(рисунок(тренировка));
    expect(рисунок(сессия.trainingPuzzle)).not.toBe(рисунок(сессия.puzzle));
  });

  it('решается одним росчерком и требует вернуться в вершину — «в вершину можно, в ребро нельзя»', () => {
    const тренировка = generateOneLineTrainingPuzzle('any');
    const v = validateEulerGraph(тренировка);
    expect(`связна=${v.connected}, нечётных=${v.oddVertexIds.length}`).toBe('связна=true, нечётных=0');
    expect(тренировка.solution.edgeIds).toHaveLength(totalEdgeUses(тренировка.edges));
    // Повтор вершины внутри пути (замыкание круга не в счёт): без него правило не проверено делом.
    const путь = тренировка.solution.vertexIds.slice(0, -1);
    expect(new Set(путь).size).toBeLessThan(путь.length);
    expect(тренировка.startHintVertexId).not.toBeNull();   // «подсвеченная вершина — допустимый старт»
  });
});

describe('дверь мимо знакомства открывает партию, а не тренировку', () => {
  it('🔴 из правил — сразу партия нужного уровня, часы пошли', () => {
    const свежая = createOneLineSession({ seed: 'one-line-7', level: 7 });
    expect(свежая.phase).toBe('rules');
    const сразу = startOneLineRound(свежая, 5000);
    expect(сразу.phase).toBe('playing');
    expect(сразу.startedAt).toBe(5000);
    expect(сразу.puzzle.level).toBe(7);
    // Из тренировки этой дверью не выйти — иначе тренировка засчиталась бы за партию.
    expect(startOneLineRound(startOneLineTraining(свежая), 5000).phase).toBe('training');
  });

  it('🔴 модуль слушает skipIntro: с ним — доска уровня, без него — правила', () => {
    const смонтировать = (skipIntro: boolean) => {
      let д: any;
      TestRenderer.act(() => {
        д = TestRenderer.create(React.createElement(OneLineGame as any, {
          seed: 'one-line-5', level: 5, locale: 'ru', skipIntro,
          theme: { background: '#000', surface: '#111', card: '#222', text: '#fff', textSecondary: '#999', primary: '#4338ca', border: '#333', success: '#0c0', error: '#c00', warning: '#fa0' },
          gameGradient: ['#4338ca', '#db2777'], gameGradientText: '#fff', showOwnResults: false, now: () => 1_000_000,
        }));
      });
      деревья.push(д);
      return текст(д);
    };
    const сразу = смонтировать(true);
    expect(партияУровня(сразу)).toBe('5');
    expect(сразу).not.toContain(S.startTraining);
    const знакомство = смонтировать(false);
    expect(знакомство).toContain(S.startTraining);
    expect(партияУровня(знакомство)).toBeNull();
  });
});

describe('🔴 после тренировки партия начинается сама — и не за спиной паузы', () => {
  function доКарточкиТренировки(): any {
    let д: any;
    TestRenderer.act(() => {
      д = TestRenderer.create(React.createElement(OneLineGame as any, {
        seed: 'one-line-3', level: 3, locale: 'ru',
        theme: { background: '#000', surface: '#111', card: '#222', text: '#fff', textSecondary: '#999', primary: '#4338ca', border: '#333', success: '#0c0', error: '#c00', warning: '#fa0' },
        gameGradient: ['#4338ca', '#db2777'], gameGradientText: '#fff', showOwnResults: false, now: () => Date.now(),
      }));
    });
    деревья.push(д);
    нажать(д, S.startTraining);
    пройти(д, createOneLineSession({ seed: 'one-line-3', level: 3 }).trainingPuzzle);
    expect(текст(д)).toContain(S.trainingDone);
    expect(текст(д)).toContain(S.roundStarting);          // человеку сказано, что будет дальше
    return д;
  }

  it('стоит ровно до срока карточки, потом партия третьего уровня — без нажатия', () => {
    jest.useFakeTimers();
    const д = доКарточкиТренировки();
    TestRenderer.act(() => { jest.advanceTimersByTime(TRAINING_AUTO_MS - 200); });
    expect(`${партияУровня(текст(д))}`).toBe('null');
    TestRenderer.act(() => { jest.advanceTimersByTime(400); });
    expect(партияУровня(текст(д))).toBe('3');
    expect(текст(д)).not.toContain(S.trainingDone);
  });

  it('пока партия на паузе (меню паузы, окно отзыва), карточка ждёт', () => {
    jest.useFakeTimers();
    const д = доКарточкиТренировки();
    const отпустить = holdGame();
    TestRenderer.act(() => { jest.advanceTimersByTime(TRAINING_AUTO_MS * 5); });
    expect(`${партияУровня(текст(д))}`).toBe('null');
    TestRenderer.act(() => { отпустить(); });
    TestRenderer.act(() => { jest.advanceTimersByTime(TRAINING_AUTO_MS + 100); });
    expect(партияУровня(текст(д))).toBe('3');
  });

  it('кнопка «Начать партию» по-прежнему не заставляет ждать', () => {
    const д = доКарточкиТренировки();
    нажать(д, S.startRound);
    expect(партияУровня(текст(д))).toBe('3');
  });
});

describe('🔴 экран целиком: знакомство — первый заход, дальше уровни идут подряд', () => {
  let профилей = 0;
  async function экран(): Promise<any> {
    профилей += 1;
    mockProfileId = `intro-once-${профилей}`;
    let д: any;
    await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(OneLineScreen)); });
    деревья.push(д);
    await дождаться();
    return д;
  }
  const карточка = (д: any) => д.root.findAll((n: any) => n.type === 'LevelCleared')[0] ?? null;

  it('первый «Начать» — правила; уровень 1 → «Продолжить» → уровень 2 и 3 без правил и тренировки', async () => {
    const д = await экран();
    нажать(д, 'start');
    // Первый заход за визит — через знакомство: оно не пропало совсем.
    expect(текст(д)).toContain(S.startTraining);
    нажать(д, S.startTraining);
    пройти(д, createOneLineSession({ seed: 'one-line-1', level: 1 }).trainingPuzzle);
    нажать(д, S.startRound);
    expect(партияУровня(текст(д))).toBe('1');
    пройти(д, createOneLineSession({ seed: 'one-line-1', level: 1 }).puzzle);
    await дождаться();

    for (const следующий of [2, 3]) {
      const к = карточка(д);
      expect(`карточка итога: ${Boolean(к)}`).toBe('карточка итога: true');
      await TestRenderer.act(async () => { к.props.onContinue(); });
      await дождаться();
      const виден = текст(д);
      expect(`после «Продолжить»: партия ${партияУровня(виден)}, правила ${виден.includes(S.startTraining)}, тренировка ${виден.includes(S.training)}`)
        .toBe(`после «Продолжить»: партия ${следующий}, правила false, тренировка false`);
      пройти(д, createOneLineSession({ seed: `one-line-${следующий}`, level: следующий }).puzzle);
      await дождаться();
    }
  });

  it('дверь «Помощь» на экране настройки возвращает правила и тренировку', async () => {
    const д = await экран();
    // До первого захода двери нет: «Начать» и так ведёт через правила.
    expect(текст(д)).not.toContain('btn_help');
    нажать(д, 'start');
    нажать(д, S.startTraining);
    пройти(д, createOneLineSession({ seed: 'one-line-1', level: 1 }).trainingPuzzle);
    нажать(д, S.startRound);
    пройти(д, createOneLineSession({ seed: 'one-line-1', level: 1 }).puzzle);
    await дождаться();
    await TestRenderer.act(async () => { карточка(д).props.onStop(); });
    await дождаться();
    expect(текст(д)).toContain('btn_help');
    // Обычный «Начать» после первого захода — сразу партия…
    нажать(д, 'start');
    await дождаться();
    expect(`партия ${партияУровня(текст(д))}, правила ${текст(д).includes(S.startTraining)}`).toBe('партия 2, правила false');
    пройти(д, createOneLineSession({ seed: 'one-line-2', level: 2 }).puzzle);
    await дождаться();
    await TestRenderer.act(async () => { карточка(д).props.onStop(); });
    await дождаться();
    // …а дверь «Помощь» ведёт через правила и тренировку.
    нажать(д, 'btn_help');
    await дождаться();
    expect(`партия ${партияУровня(текст(д))}, правила ${текст(д).includes(S.startTraining)}`).toBe('партия null, правила true');
  });
});

describe('🔴 знакомство само — только в первый раз по профилю, а не на каждом заходе (отчёт 96ea896d)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const хранилище = require('@react-native-async-storage/async-storage');
  const AsyncStorage = хранилище.default ?? хранилище;
  let номер = 0;
  const новыйПрофиль = () => { номер += 1; return `seen-${номер}`; };
  async function экранПрофиля(профиль: string): Promise<any> {
    mockProfileId = профиль;
    let д: any;
    await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(OneLineScreen)); });
    деревья.push(д);
    await дождаться();
    return д;
  }
  async function снять(д: any): Promise<void> {
    await TestRenderer.act(async () => { д.unmount(); });
    деревья.splice(деревья.indexOf(д), 1);
  }
  const уровень1 = () => createOneLineSession({ seed: 'one-line-1', level: 1 });
  /** Знакомство до партии и ОДИН ход в ней: две вершины решения уровня 1. */
  async function знакомствоИХод(д: any): Promise<void> {
    нажать(д, 'start');
    expect(текст(д)).toContain(S.startTraining);
    нажать(д, S.startTraining);
    пройти(д, уровень1().trainingPuzzle);
    нажать(д, S.startRound);
    const puzzle = уровень1().puzzle;
    нажать(д, вершина(puzzle, puzzle.solution.vertexIds[0]));
    нажать(д, вершина(puzzle, puzzle.solution.vertexIds[1]));
    await дождаться();
  }

  it('после хода в партии новый заход того же профиля — сразу партия, дверь «Как играть» видна до «Начать»', async () => {
    const профиль = новыйПрофиль();
    const д1 = await экранПрофиля(профиль);
    // Первый заход нового профиля: двери нет — «Начать» и так ведёт через знакомство.
    expect(текст(д1)).not.toContain('btn_help');
    await знакомствоИХод(д1);
    await снять(д1);

    const д2 = await экранПрофиля(профиль);
    expect(текст(д2)).toContain('btn_help');
    нажать(д2, 'start');
    await дождаться();
    expect(`партия ${партияУровня(текст(д2))}, правила ${текст(д2).includes(S.startTraining)}`).toBe('партия 1, правила false');
  });

  it('выход с экрана правил без хода — знакомство не засчитано: новый заход снова через правила', async () => {
    const профиль = новыйПрофиль();
    const д1 = await экранПрофиля(профиль);
    нажать(д1, 'start');
    expect(текст(д1)).toContain(S.startTraining);
    await снять(д1);
    const д2 = await экранПрофиля(профиль);
    нажать(д2, 'start');
    await дождаться();
    expect(текст(д2)).toContain(S.startTraining);
  });

  it('другой профиль на том же телефоне — снова знакомство', async () => {
    const д1 = await экранПрофиля(новыйПрофиль());
    await знакомствоИХод(д1);
    await снять(д1);
    const д2 = await экранПрофиля(новыйПрофиль());
    нажать(д2, 'start');
    await дождаться();
    expect(текст(д2)).toContain(S.startTraining);
  });

  it('запуск из зарядки (автостарт): прошедший знакомство — сразу партия, новый профиль — правила', async () => {
    const профиль = новыйПрофиль();
    const д1 = await экранПрофиля(профиль);
    await знакомствоИХод(д1);
    await снять(д1);

    mockParams = { auto: '1' };
    const д2 = await экранПрофиля(профиль);
    await дождаться();
    expect(`партия ${партияУровня(текст(д2))}, правила ${текст(д2).includes(S.startTraining)}`).toBe('партия 1, правила false');
    await снять(д2);

    const д3 = await экранПрофиля(новыйПрофиль());
    await дождаться();
    expect(текст(д3)).toContain(S.startTraining);
  });

  it('у кого уже пройдены уровни (обновились с прошлой версии), знакомство само не показывается', async () => {
    const профиль = новыйПрофиль();
    await AsyncStorage.setItem(`psygames_one_line_level_${профиль}`, '5');
    const д = await экранПрофиля(профиль);
    await дождаться();
    expect(текст(д)).toContain('btn_help');
    нажать(д, 'start');
    await дождаться();
    expect(`партия ${партияУровня(текст(д))}, правила ${текст(д).includes(S.startTraining)}`).toBe('партия 5, правила false');
  });
});
