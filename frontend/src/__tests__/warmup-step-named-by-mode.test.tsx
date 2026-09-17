/* psygames-warmup-step-named-by-mode · VER 1 · 17.09.2026 */
/**
 * 🔴 ШАГ СЕРИИ НАЗЫВАЕТСЯ СВОИМ РЕЖИМОМ — «ТРУБЫ», А НЕ «ЧЁТ-НЕЧЕТ».
 *
 * 📍 17.09.2026 раздел «Зарядки» прошёл «Не спится» живьём: головоломка «Трубы» (`mode: "Net"`)
 * подписана «Чёт-нечет» на карточке, мосту, в «Пропущено» и в вопросе пропуска каркаса.
 * 42 режима живут на одном маршруте, у маршрута одна карточка в `GAMES` (`puzzles` →
 * `puzzlesUnruly`), и поиск шага по `game_id` находит её для любого режима.
 * Правило имени — `src/services/stepName.ts`; каркас зовёт его в вопросе пропуска. Карточка,
 * мост и «Пропущено» — экраны раздела «Зарядки», они переходят на то же правило своим куском.
 *
 * Проверяется на НАСТОЯЩИХ шагах всех серий (`defaultPlaylists.json`) и на смонтированном каркасе.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import GameShell from '@/src/components/GameShell';
import { ключИмениШага, имяШага } from '@/src/services/stepName';
import { HELP_MAP } from '@/src/constants/helpMap';
import { GAMES } from '@/src/constants/games';

declare const __dirname: string;
declare function require(id: string): any;

let mockWarmup: any = null;
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmupSafe: () => mockWarmup }));
jest.mock('@/src/hooks/useExitGuard', () => ({
  useExitGuard: () => ({ asking: false, requestExit: () => {}, stay: () => {}, confirmExit: () => {} }),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/games/puzzles', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
jest.mock('@/src/services/feedback', () => ({
  sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
  soundOn: () => true, hapticEnabledNow: () => true, setSoundEnabled: () => {}, setHapticEnabled: () => {},
}));
jest.mock('@/src/services/petMood', () => ({ setGameMood: () => {}, setGameStreak: () => {} }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, HELP_CORNER_RESERVE: 0, default: () => null }));

const fs = require('fs');
const path = require('path');

type Шаг = { game_id: string; game_route?: string; mode?: string };

/** Все шаги всех серий и наборов поставки. */
function шагиПоставки(): Шаг[] {
  const данные = JSON.parse(fs.readFileSync(path.join(__dirname, '../constants/defaultPlaylists.json'), 'utf8'));
  const шаги: Шаг[] = [];
  const обход = (узел: any) => {
    if (Array.isArray(узел)) { узел.forEach(обход); return; }
    if (!узел || typeof узел !== 'object') return;
    if (typeof узел.game_id === 'string') шаги.push(узел);
    Object.values(узел).forEach(обход);
  };
  обход(данные);
  return шаги;
}

/** Что написано в вопросе пропуска, когда идёт этот шаг. */
function вопросПропуска(шаг: Шаг): string {
  const steps = [{ game_id: 'schulte', game_route: '/games/schulte' }, { ...шаг, difficulty: 'easy', est_duration_sec: 90 }];
  mockWarmup = { active: true, meta: { steps }, currentIdx: 1, currentStep: steps[1], skipCurrent: () => {} };
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="Головоломка" onBack={() => {}}>
        <Text>поле</Text>
      </GameShell>,
    );
  });
  const кнопка = tr.root.findAll((n: any) => n.props?.testID === 'warmup-skip-step' && typeof n.props.onPress === 'function');
  expect(кнопка.length).toBeGreaterThan(0);
  act(() => { кнопка[0].props.onPress(); });
  const тело = tr.root.findAll((n: any) => n.props?.testID === 'skip-step-body' && typeof n.type === 'string');
  const текст = тело.length ? [].concat(тело[0].props.children).join('') : 'вопроса нет';
  act(() => { tr.unmount(); });
  return текст;
}

describe('имя шага серии — по режиму', () => {
  afterEach(() => { mockWarmup = null; });

  it('каждый из 42 режимов головоломок имеет свою запись имени', () => {
    const режимы: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'tatham-tables.generated.json'), 'utf8')).режимы;
    expect(режимы).toHaveLength(42);
    const безИмени = режимы.filter((р) => !HELP_MAP[`/games/puzzles?mode=${р}`]?.nameKey);
    expect(безИмени).toEqual([]);
  });

  it('🔴 шаги-головоломки всех серий называются своим режимом, а не «Чёт-нечет»', () => {
    const головоломки = шагиПоставки().filter((ш) => ш.game_id === 'puzzles' && ш.mode);
    const режимы = new Set(головоломки.map((ш) => ш.mode!));
    expect(режимы.size).toBeGreaterThan(10);
    const чужие = головоломки
      .map((ш) => ({ режим: ш.mode!, ключ: ключИмениШага(ш) }))
      .filter(({ режим, ключ }) => ключ !== HELP_MAP[`/games/puzzles?mode=${режим}`].nameKey)
      .map(({ режим, ключ }) => `${режим} → ${ключ}`);
    expect([...new Set(чужие)]).toEqual([]);
    expect(ключИмениШага({ game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Net' })).toBe('puzzlesNet');
    // Ключ не склеивается из режима: у «Train Tracks» он другой.
    expect(ключИмениШага({ game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Train Tracks' })).toBe('puzzlesTracks');
  });

  it('у остальных игр режим — настройка партии, имя остаётся именем игры', () => {
    const сРежимом = шагиПоставки().filter((ш) => ш.game_id !== 'puzzles' && ш.mode && GAMES.some((g) => g.id === ш.game_id));
    expect(сРежимом.length).toBeGreaterThan(0);
    const расхождения = сРежимом
      .filter((ш) => ключИмениШага(ш) !== GAMES.find((g) => g.id === ш.game_id)!.nameKey)
      .map((ш) => `${ш.game_id}:${ш.mode}`);
    expect([...new Set(расхождения)]).toEqual([]);
  });

  it('шаг без режима — карточка игры; незнакомый шаг — его game_id', () => {
    expect(ключИмениШага({ game_id: 'puzzles', game_route: '/games/puzzles' })).toBe('puzzlesUnruly');
    expect(ключИмениШага({ game_id: 'нет-такой' })).toBeNull();
    expect(имяШага({ game_id: 'нет-такой' }, (k) => k)).toBe('нет-такой');
    // Режим без записи (старая сборка) — имя игры, а не пустота.
    expect(ключИмениШага({ game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Нет-такого' })).toBe('puzzlesUnruly');
  });

  it('🔴 каркас: вопрос пропуска называет «Трубы», а не «Чёт-нечет»', () => {
    expect(вопросПропуска({ game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Net' })).toBe('skipGameNamed puzzlesNet?');
    expect(вопросПропуска({ game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Train Tracks' })).toBe('skipGameNamed puzzlesTracks?');
  });

  it('каркас: обычная игра в серии названа как прежде', () => {
    expect(вопросПропуска({ game_id: 'schulte_table', game_route: '/games/schulte', mode: '5x5' }))
      .toBe(`skipGameNamed ${GAMES.find((g) => g.id === 'schulte_table')!.nameKey}?`);
  });
});
