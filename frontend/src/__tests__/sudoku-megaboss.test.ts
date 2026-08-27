/* psygames-sudoku-megaboss-gate · VER 1 · 28.08.2026 */
/**
 * МЕГА-БОСС: САМУРАЙ КАК ВЕХА-СОБЫТИЕ (§7а-трети, идея Дениса 10.08).
 *
 * Что сторожится и почему:
 *   · каденс: MEGA_BOSS_EVERY кратен BOSS_EVERY — мега ВЫТЕСНЯЕТ обычного босса
 *     на своей вехе, а не встаёт рядом; и проверка меги стоит в коде ПЕРВОЙ —
 *     иначе на 15-м уровне выпал бы обычный босс (15 кратно 3);
 *   · «Позже» законен: уровень засчитывается ДО выбора фазы — отказ от меги не
 *     отнимает прогресс (порядок reachRoadLevel → megaboss в файле);
 *   · самурай читает метку и пишет её в партию (details.megaboss_from) — иначе
 *     «пришёл сам» и «пришёл вехой» неотличимы;
 *   · подача на всех двенадцати языках.
 */
declare function require(id: string): any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

const sudoku = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'sudoku.tsx'), 'utf8');
const samurai = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'sudoku-samurai.tsx'), 'utf8');

describe('мега-босс', () => {
  it('каденс кратен обычному боссу и мега проверяется первой', () => {
    const every = /const BOSS_EVERY = (\d+);/.exec(sudoku);
    const mega = /const MEGA_BOSS_EVERY = (\d+);/.exec(sudoku);
    expect(every && mega).toBeTruthy();
    expect(Number(mega![1]) % Number(every![1])).toBe(0);
    const iMega = sudoku.indexOf("level % MEGA_BOSS_EVERY === 0");
    const iBoss = sudoku.indexOf("level % BOSS_EVERY === 0");
    expect(iMega).toBeGreaterThan(-1);
    expect(iBoss).toBeGreaterThan(-1);
    expect(iMega).toBeLessThan(iBoss);   // мега раньше — иначе её съест обычный
  });

  it('«Позже» не отнимает прогресс: уровень засчитан до выбора фазы', () => {
    const iReach = sudoku.indexOf('reachRoadLevel(roadLevels, road, level + 1)');
    const iMega = sudoku.indexOf("setPhase('megaboss')");
    expect(iReach).toBeGreaterThan(-1);
    expect(iMega).toBeGreaterThan(iReach);
  });

  it('приглашение уводит в самурая с меткой вехи, отказ — в обычный поток', () => {
    expect(sudoku).toMatch(/sudoku-samurai\?megaboss=\$\{level\}/);
    expect(sudoku).toMatch(/updLater/);   // «Позже» — существующий ключ, дубль не заводим (гейт словаря)
  });

  it('самурай читает метку, показывает бейдж и пишет её в партию', () => {
    expect(samurai).toMatch(/useLocalSearchParams<\{ megaboss\?: string \}>/);
    expect(samurai).toMatch(/megaBossBadge/);
    expect(samurai).toMatch(/megaboss_from: megabossFrom/);
  });

  it('подача существует на всех двенадцати языках', () => {
    const base = readFileSync(join(__dirname, '..', 'contexts', 'LanguageContext.tsx'), 'utf8');
    const KEYS = ['megaBossTitle', 'megaBossOffer', 'megaBossGo', 'megaBossBadge'];
    for (const k of KEYS) expect(`${k}: ${base.includes(`  ${k}:`)}`).toBe(`${k}: true`);
    for (const lang of ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'zh']) {
      const overlay = readFileSync(join(__dirname, '..', 'contexts', 'translations', `${lang}.ts`), 'utf8');
      const missing = KEYS.filter((k) => !overlay.includes(`"${k}"`));
      expect(`${lang}: ${missing.join(',') || '—'}`).toBe(`${lang}: —`);
    }
  });
});
