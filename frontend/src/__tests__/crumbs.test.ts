/* psygames-crumbs-test · VER 1 · 29.08.2026 */
/**
 * КРОШКИ РЕПОРТА (§3.1) — траектория и консоль в каждом отчёте.
 *
 * Классы багов: буфер растёт без потолка (утечка за недельную сессию) ·
 * повторный hook дублирует каждую ошибку ×2 · перехват глотает оригинал
 * (немая консоль хуже отсутствия крошек) · поля не доехали до context
 * (класс «замер делался и выбрасывался», audio_peak).
 */
import {
  pushCrumb, readCrumbs, readConsoleErrors, hookConsoleErrors,
  STEPS_MAX, CONSOLE_ERRORS_MAX, __resetCrumbs,
} from '@/src/services/crumbs';

declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

beforeEach(() => __resetCrumbs());

describe('крошки шагов', () => {
  it('кольцо держит ровно STEPS_MAX, старое вытесняется', () => {
    for (let i = 0; i < STEPS_MAX + 7; i++) pushCrumb(`step-${i}`);
    const got = readCrumbs();
    expect(got.length).toBe(STEPS_MAX);
    expect(got[0]!.s).toBe('step-7');
    expect(got[got.length - 1]!.s).toBe(`step-${STEPS_MAX + 6}`);
  });

  it('подряд одинаковые шаги не копятся (фокус-эффекты стреляют дважды)', () => {
    pushCrumb('screen /games/sudoku');
    pushCrumb('screen /games/sudoku');
    pushCrumb('mode:levels level:45');
    pushCrumb('screen /games/sudoku');
    expect(readCrumbs().map((c) => c.s)).toEqual([
      'screen /games/sudoku', 'mode:levels level:45', 'screen /games/sudoku',
    ]);
  });

  it('длинный шаг режется, время в формате часов', () => {
    pushCrumb('x'.repeat(500));
    const c = readCrumbs()[0]!;
    expect(c.s.length).toBe(120);
    expect(c.t).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('перехват console.error', () => {
  it('🔴 ошибки ловятся, оригинал зовётся, повторный hook не дублирует', () => {
    const orig = console.error;
    const passed: unknown[][] = [];
    console.error = (...a: unknown[]) => { passed.push(a); };
    try {
      hookConsoleErrors();
      hookConsoleErrors();   // второй вызов — не второй перехват
      console.error('boom', new Error('bad thing'));
      expect(readConsoleErrors().length).toBe(1);
      expect(readConsoleErrors()[0]!.s).toContain('boom');
      expect(readConsoleErrors()[0]!.s).toContain('bad thing');
      expect(passed.length).toBe(1);   // оригинал получил ровно один вызов
    } finally {
      console.error = orig;
    }
  });

  it('кольцо ошибок держит CONSOLE_ERRORS_MAX', () => {
    const orig = console.error;
    console.error = () => {};
    hookConsoleErrors();
    for (let i = 0; i < CONSOLE_ERRORS_MAX + 5; i++) console.error(`e-${i}`);
    console.error = orig;
    const got = readConsoleErrors();
    expect(got.length).toBe(CONSOLE_ERRORS_MAX);
    expect(got[got.length - 1]!.s).toContain(`e-${CONSOLE_ERRORS_MAX + 4}`);
  });
});

describe('поля доезжают до репорта (класс audio_peak: собрали и выбросили)', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('context репорта несёт steps и console_errors', () => {
    const s = src('services/appFeedback.ts');
    expect(s).toContain('steps: readCrumbs()');
    expect(s).toContain('console_errors: readConsoleErrors()');
  });

  it('источники живые: навигация, game_state и перехват на корне', () => {
    expect(src('components/FeedbackWidget.tsx')).toMatch(/pushCrumb\(`screen \$\{pathname\}`\)/);
    expect(src('services/feedbackGameState.ts')).toContain('pushCrumb(label)');
    expect(readFileSync(join(__dirname, '..', '..', 'app', '_layout.tsx'), 'utf8')).toContain('hookConsoleErrors();');
  });
});
