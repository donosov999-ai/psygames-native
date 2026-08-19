/**
 * ВЕЧЕРНЯЯ ЗАРЯДКА НЕ ТОРОПИТ, А ОТЗЫВ НЕ СТОИТ ПАРТИИ.
 *
 * ЗАЧЕМ. Пять репортов тестировщицы 18.08.2026 на v1.203.0, все про одно:
 *   «Это же вечерняя зарядка, а зачем добавили время, когда есть время
 *    хочется сразу торопиться»
 *   «даже на маджонг теперь таймер. НЕЛЬЗЯ таймер, но в этом и был смысл
 *    вечерней зарядки»
 *   «заканчивается 30 секунд и сразу игра заканчивается, и больше шансов на
 *    повторение не даёт»
 *   «пока я писала отзыв, игра моя закончилась… несправедливость»
 *
 * Она права по всем четырём. Вечерний набор «Микро-релакса» — это
 * find_differences · mahjong · goods_sort · breathing, и в нём:
 *   · «Отличия» растили сложность СЖИМАЮЩИМСЯ таймером (40с → 15с) и валили
 *     раунд по нулю — запрещённая у нас ось сложности;
 *   · провал одного раунда обрывал ВЕСЬ уровень, съедая два оставшихся из трёх;
 *   · маджонг показывал бегущий секундомер — предела нет, но торопит он не хуже;
 *   · отсчёт шёл от Date.now(), и время текло, пока человек писал отзыв.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');
const read = (r: string) => readFileSync(join(__dirname, '../..', r), 'utf8') as string;

describe('вечерний набор', () => {
  const warmup = read('src/services/warmup.ts');
  const preset = read('src/hooks/useGamePreset.ts');
  const diffs = read('app/games/find-differences.tsx');
  const mahjong = read('app/games/mahjong.tsx');

  it('вечерний и ночной шаг помечаются calm — по слоту, не по имени игры', () => {
    expect(warmup).toMatch(/slot === 'evening' \|\| slot === 'night'/);
    expect(warmup).toMatch(/p\.calm = '1'/);
    expect(preset).toMatch(/params\?\.calm === '1'/);
  });

  it('в спокойном режиме «Отличия» не заводят обратный отсчёт вовсе', () => {
    expect(diffs).toMatch(/if \(isCalm\) \{ setTimeLeft\(0\); return; \}/);
  });

  it('маджонг прячет секундомер в спокойном режиме', () => {
    expect(mahjong).toMatch(/\{!isCalm && \(/);
  });

  /** Один медленный раунд не должен съедать оставшиеся. */
  it('просроченный раунд заканчивает раунд, а не уровень', () => {
    expect(diffs).toMatch(/if \(left <= 0\) missRound\(\)/);
    expect(diffs).toMatch(/const missRound = \(\) => \{/);
    expect(diffs).toMatch(/allRoundsRef\.current = false/);
    // и чистый проход по-прежнему требует всех раундов
    expect(diffs).toMatch(/completedAll && allRoundsRef\.current/);
  });
});

describe('отзыв не стоит партии', () => {
  const widget = read('src/components/FeedbackWidget.tsx');
  const diffs = read('app/games/find-differences.tsx');
  const pause = read('src/services/gamePause.ts');

  it('открытый отзыв держит игру', () => {
    expect(widget).toMatch(/holdGame\(\)/);
  });

  it('пауза считается счётчиком, а не флагом', () => {
    expect(pause).toMatch(/_depth \+= 1/);
    expect(pause).toMatch(/_depth = Math\.max\(0, _depth - 1\)/);
  });

  /** Гасить интервал мало: время всё равно течёт по Date.now(). */
  it('отсчёт считает игровое время, а не настенное', () => {
    expect(diffs).toMatch(/clock\.elapsed\(roundStartRef\.current\)/);
    expect(diffs).not.toMatch(/roundTimeRef\.current - \(Date\.now\(\)/);
  });
});
