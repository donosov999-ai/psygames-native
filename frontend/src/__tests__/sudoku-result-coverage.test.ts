/* psygames-sudoku-result-coverage-gate · VER 1 · 28.08.2026 */
/**
 * У КАЖДОГО РЕЖИМА СУДОКУ ОБЯЗАН БЫТЬ ЭКРАН ИТОГА.
 *
 * Баг Дениса 28.08: небоскрёбы (towers) после победы показывали ПУСТОЙ экран —
 * завершение ставило фазу `result`, а рендер `result` существовал только для
 * free и levels. Тем же страдали killer и unequal: три режима из пяти молча
 * теряли момент победы. Пустой экран не падает и не пишет в консоль — ни один
 * общий гейт его не ловил, поэтому ловим устройством: каждый режим из типа
 * состояния обязан встречаться в каком-нибудь условии рендера фазы result.
 */
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const sudoku = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'sudoku.tsx'), 'utf8');
const modesSvc = readFileSync(join(__dirname, '..', 'services', 'sudoku-modes.ts'), 'utf8');

/** Все режимы: из useState-типа + расшифровка SideMode из сервиса. */
function allModes(): string[] {
  const st = /useState<'([^>]+)'>\('levels'\)/.exec(sudoku.replace(/\s+/g, ' '));
  const union = /useState<([^>]*SideMode[^>]*)>/.exec(sudoku);
  expect(union).toBeTruthy();
  const named = Array.from(union![1].matchAll(/'(\w+)'/g)).map((m) => m[1]);
  const side = /type SideMode = ([^;\n]+)/.exec(modesSvc);
  expect(side).toBeTruthy();
  const sideNames = Array.from(side![1].matchAll(/'(\w+)'/g)).map((m) => m[1]);
  void st;
  return [...new Set([...named, ...sideNames])];
}

describe('судоку — покрытие экрана итога', () => {
  it('каждый режим встречается в условии рендера фазы result', () => {
    const modes = allModes();
    expect(modes.length).toBeGreaterThanOrEqual(5);   // levels, free, killer, towers, unequal
    // Строки-условия рендера итога: «phase === 'result' && ...»
    const conds = sudoku.split('\n').filter((l: string) => l.includes("phase === 'result' &&"));
    expect(conds.length).toBeGreaterThan(0);
    for (const m of modes) {
      const covered = conds.some((l: string) => l.includes(`'${m}'`));
      expect(`${m}: ${covered}`).toBe(`${m}: true`);
    }
  });

  it('🔴 уровень дороги не протекает в мини-лестницы (баг Валентины «Ур.45/8»)', () => {
    // Гонка входа: загрузка дорог и ?mode= из хаба резолвятся в любом порядке.
    // Дороги пишут level ТОЛЬКО в режиме уровней (по свежему modeRef), а сборка
    // side-доски зажимает ступень своей лестницей от любых будущих утечек.
    expect(sudoku).toContain("if (modeRef.current === 'levels') setLevel(reached);");
    expect(sudoku).toContain('const step = Math.min(sideStepCount(mode), Math.max(1, lvlOverride ?? level));');
    // и подъём снимка зажимает чужое число
    expect(sudoku).toMatch(/s\.mode === 'towers' \|\| s\.mode === 'unequal'\) \? Math\.min\(sideStepCount\(s\.mode\)/);
  });

  it('🔴 снимок мини-лестницы поднимается только за своей карточкой (Валентина: «всё ещё неравенства»)', () => {
    // Вход в обычную судоку не поднимает и не стирает towers/unequal-партию;
    // вход в мини-режим не поднимает чужой levels-снимок.
    expect(sudoku).toContain("const sideSnapshot = saved.mode === 'towers' || saved.mode === 'unequal';");
    expect(sudoku).toContain('if (sideSnapshot !== sideEntry) return;');
    expect(sudoku).toContain('if (sideSnapshot && routeM !== saved.mode) return;');
  });

  it('итог мини-лестницы называет ПРОЙДЕННУЮ ступень, а не сдвинутый level', () => {
    // level сдвигается на следующую ступень ещё в завершении — карточка обязана
    // читать снятое ДО сдвига число, иначе врёт на единицу.
    const capture = sudoku.indexOf('setSideDoneLevel(level);');
    const shift = sudoku.indexOf('setLevel(nextStep);');
    expect(capture).toBeGreaterThan(-1);
    expect(shift).toBeGreaterThan(capture);
    expect(sudoku).toContain("t('levelDone').replace('{n}', String(sideDoneLevel))");
  });
});
