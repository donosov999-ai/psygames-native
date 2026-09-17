/* psygames-puzzle-move-is-new-position · VER 1 · 17.09.2026 */
/**
 * 🔴 ХОД — ЭТО НОВАЯ ПОЗИЦИЯ В ИСТОРИИ ДВИЖКА; «КЛОЦКИ» ЗАСЧИТЫВАЮТСЯ ТОЛЬКО НА РЕШЁННОЙ ДОСКЕ.
 *
 * 📍 Задача f0ab1936 (отчёт тестировщика 4dcf8928; замер psygames-spatial-claude-mac 17.09.2026):
 *   1) `unfinished/slide.c:2290` — `completed ? +1 : 0`, а completed = −1, пока НЕ решено: статус 1 сразу
 *      после раздачи у 60 раздач из 60. Экран ставил «Уровень пройден!» при входе, настоящая победа
 *      перехода не давала. Починка — заплата копии slide.c в `build.sh` (канон не трогаем).
 *   2) `PKR_SOME_EFFECT` приходит и на `MOVE_UI_UPDATE` (midend.c:1043): тычок в блок без протяжки
 *      считался ходом. По всем 42 так раздут счёт у 37 режимов. Ход теперь — рост позиции в истории
 *      (`psy_statepos`, заплата midend.c), поле `сдвинул` у `Итог`.
 *
 * Под jest мост не играет (`psy_generate` → 0, шапка `scripts/tatham-bridge-gate.mjs`), поэтому поведение
 * движков сверяется по снимку `scripts/capture-move-positions.mjs`, привязанному к сборке md5, а экран —
 * живым рендером с подменённым мостом.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PuzzlesScreen from '@/app/games/puzzles';
import { клавиша, указатель } from '@/src/games/tatham-bridge/play';
import снимок from './tatham-move-positions.generated.json';

declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
/* eslint-enable @typescript-eslint/no-require-imports */
const МОСТ = join(__dirname, '../games/tatham-bridge');
const файл = (имя: string): string => readFileSync(join(МОСТ, имя), 'utf8');

let mockMode = 'Slide';
let mockShell: any = null;
let mockCanvas: any = null;

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => Promise.resolve(['Slide', 'Keen'].map((имя, индекс) => ({ индекс, имя, умеетТекстом: false, решаем: true, ступени: [{ индекс: 0, имя: 'Easy', параметры: имя === 'Keen' ? '4du' : '7x6m25' }] }))),
  доскаСтрок: () => [],
}));
const mockПартия = () => ({ ширина: 100, высота: 100, палитра: ['rgb(255,255,255)'], примитивы: [], статус: 0, ход: null, подорвался: false, тупик: false });
jest.mock('@/src/games/tatham-bridge/play', () => ({
  открыть: jest.fn(async () => mockПартия()),
  указатель: jest.fn(),
  клавиша: jest.fn(),
  стрелка: jest.fn(), отменить: jest.fn(), решить: jest.fn(), стеретьВвод: jest.fn(),
  ходЗаЖест: jest.requireActual('@/src/games/tatham-bridge/play').ходЗаЖест,
}));
jest.mock('@/src/components/PuzzleCanvas', () => ({ __esModule: true, default: (p: any) => { mockCanvas = p; return null; } }));
jest.mock('@/src/hooks/useGamePreset', () => ({
  useGamePreset: () => ({ isPreset: false, isCalm: false, autostart: true }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', bg: '#fff', text: '#000', textSecondary: '#666', card: '#eee', border: '#ccc', primary: '#7c6cf0', surface: '#fff' }, isDark: false }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ mode: mockMode }),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: (p: any) => { mockShell = p; return React.createElement(View, null, p.children, p.overlay); } };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/LevelCleared', () => ({ __esModule: true, default: () => null }));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => д.unmount()); });
  await AsyncStorage.clear();
  jest.mocked(указатель).mockReset();
  jest.mocked(клавиша).mockReset();
});

const дождаться = async () => { for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); }); };
async function экран(режим: string) {
  mockMode = режим; mockShell = null; mockCanvas = null;
  let дерево: any;
  await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
  деревья.push(дерево);
  await дождаться();
  return дерево;
}
const ходовНаЭкране = () => mockShell?.hud?.find((h: any) => h.key === 'moves')?.value;
const итог = (подействовало: boolean, сдвинул: boolean) => ({ партия: mockПартия(), подействовало, сдвинул });

type Замер = { раз: number; поОтвету: number; поПозиции: number };
type Режим = { имя: string; параметры: string } & Record<'тычки' | 'правой' | 'стрелки' | 'выбрать' | 'цифры', Замер>;
const режимы = снимок.режимы as unknown as Режим[];
const ВИДЫ = ['тычки', 'правой', 'стрелки', 'выбрать', 'цифры'] as const;

describe('«Клоцки» и счёт ходов по позиции в истории движка', () => {
  it('🔴 снимок снят с ТЕКУЩЕЙ сборки моста (иначе он ничего не доказывает)', () => {
    const md5 = createHash('md5').update(readFileSync(join(МОСТ, 'tatham.js'))).digest('hex');
    expect(`мост ${md5}`).toBe(`мост ${снимок.мост}`);   // красное → пересними: node scripts/capture-move-positions.mjs
  });

  it('🔴 «Клоцки»: сразу после раздачи статус 0 — у всех 60 раздач (3 ступени × 20 зёрен)', () => {
    const { послеРаздачи } = снимок.клоцки;
    expect(послеРаздачи.map((п) => п.параметры)).toEqual(['7x6m25', '7x6u', '8x6u']);
    const статусы = послеРаздачи.flatMap((п) => п.статусы);
    expect(статусы).toHaveLength(60);
    expect(статусы.filter((c) => c !== 0)).toEqual([]);
  });

  it('🔴 «Клоцки»: доска, доведённая до конца, засчитана — статус 1 ровно на последнем ходе, не раньше', () => {
    const { доведения } = снимок.клоцки;
    expect(доведения).toHaveLength(9);
    for (const д of доведения) {
      expect({ где: `${д.параметры}#${д.зерно}`, до: д.статусДо, поПути: д.статусыПоПути, после: д.статусПосле, сбой: (д as { сбой?: string }).сбой })
        .toEqual({ где: `${д.параметры}#${д.зерно}`, до: 0, поПути: [0], после: 1, сбой: undefined });
      // Путь решателя — ровно минимум из строки состояния движка: доводили честными ходами.
      expect(д.ходов).toBe(д.минимум);
    }
  });

  it('🔴 позиция не растёт там, где движок не записал ход: по всем 42 — не больше ответа, у «Клоцек» тычок не ход', () => {
    expect(режимы).toHaveLength(42);
    const обратные = режимы.flatMap((р) => ВИДЫ.filter((в) => р[в].поПозиции > р[в].поОтвету).map((в) => `${р.имя}.${в}`));
    expect(обратные).toEqual([]);
    const раздуто = режимы.filter((р) => ВИДЫ.some((в) => р[в].поОтвету > р[в].поПозиции)).map((р) => р.имя);
    expect(раздуто.length).toBeGreaterThanOrEqual(30);
    const клоцки = режимы.find((р) => р.имя === 'Slide')!;
    expect([клоцки.тычки.поОтвету > 0, клоцки.тычки.поПозиции]).toEqual([true, 0]);
    // Выбор клетки в цифровых — не ход: 144 тычка, 0 записанных.
    for (const имя of ['Filling', 'Keen', 'Map', 'Solo']) expect(режимы.find((р) => р.имя === имя)!.тычки.поПозиции).toBe(0);
    // А где стрелка — сама фигура, позиция растёт: Cube, Fifteen, Sokoban.
    expect(режимы.filter((р) => р.стрелки.поПозиции > 0).map((р) => р.имя).sort()).toEqual(['Cube', 'Fifteen', 'Sokoban']);
  });

  it('🔴 заплаты канона в сборке моста на месте и со сторожем «не легла — сборка встаёт»', () => {
    const сборка = файл('build.sh');
    expect(сборка).toContain("sed 's/return state->completed ? +1 : 0;/return state->completed >= 0 ? +1 : 0;/' unfinished/slide.c");
    expect(сборка).toContain("grep -q 'return state->completed >= 0 ? +1 : 0;'");
    expect(сборка).toContain('int psy_midend_statepos(midend *me) { return me->statepos; }');
    expect(сборка).toContain('SRCS="${SRCS/unfinished\\/slide.c/$PATCHED/slide.c}"');
    expect(сборка).toContain('CORE="${CORE/midend.c/$PATCHED/midend.c}"');
    expect(файл('psy_play.c')).toContain('EMSCRIPTEN_KEEPALIVE int psy_statepos(void) { return ПАРТИЯ ? psy_midend_statepos(ПАРТИЯ) : 0; }');
    // Мост меряет позицию ДО и ПОСЛЕ каждого ввода — у тычка, стрелки и клавиши.
    const api = файл('play.ts');
    expect(api.match(/const до = позиция\(M\);/g)).toHaveLength(3);
    expect(api.match(/const сдвинул = позиция\(M\) > до;/g)).toHaveLength(3);
  });

  it('🔴 экран: тычок, на который движок «подействовал», но ход не записал, ходом не считается', async () => {
    await экран('Slide');
    expect(typeof mockCanvas?.onЖест).toBe('function');
    expect(ходовНаЭкране()).toBe(0);
    // Тычок в блок: нажал — начало протяжки (подействовало, не сдвинул), отпустил — сброс протяжки.
    jest.mocked(указатель).mockResolvedValueOnce(итог(true, false)).mockResolvedValueOnce(итог(true, false));
    await TestRenderer.act(async () => { mockCanvas.onЖест(10, 10, 'нажал', false); });
    await TestRenderer.act(async () => { mockCanvas.onЖест(10, 10, 'отпустил', false); });
    await дождаться();
    expect(ходовНаЭкране()).toBe(0);
    // Настоящая протяжка: ход записан на отпускании.
    jest.mocked(указатель).mockResolvedValueOnce(итог(true, false)).mockResolvedValueOnce(итог(true, false)).mockResolvedValueOnce(итог(true, true));
    await TestRenderer.act(async () => { mockCanvas.onЖест(10, 10, 'нажал', false); });
    await TestRenderer.act(async () => { mockCanvas.onЖест(40, 10, 'ведёт', false); });
    await TestRenderer.act(async () => { mockCanvas.onЖест(40, 10, 'отпустил', false); });
    await дождаться();
    expect(ходовНаЭкране()).toBe(1);
  });

  it('🔴 экран: цифра — ход, только если движок его записал (иначе «Отменить» у цифровых не включится никогда)', async () => {
    const дерево = await экран('Keen');
    const единица = () => дерево.root.findAll((n: any) => n.props?.accessibilityLabel === '1' && typeof n.props?.onPress === 'function')[0];
    expect(единица()).toBeTruthy();
    jest.mocked(клавиша).mockResolvedValueOnce(итог(true, true));
    await TestRenderer.act(async () => { единица().props.onPress(); });
    await дождаться();
    expect(ходовНаЭкране()).toBe(1);
    // Клавиша, на которую движок отозвался без записи хода (например, та же цифра поверх той же), — не ход.
    jest.mocked(клавиша).mockResolvedValueOnce(итог(true, false));
    await TestRenderer.act(async () => { единица().props.onPress(); });
    await дождаться();
    expect(ходовНаЭкране()).toBe(1);
  });
});
