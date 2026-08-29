/* psygames-passed-coverage-test · VER 1 · 29.08.2026 */
/**
 * КАРТА ИСХОДОВ (задача e53f4958): у каждой игры с лестницей поле passed либо
 * ПИШЕТСЯ, либо ОТСУТСТВУЕТ НАМЕРЕННО с задокументированной причиной.
 *
 * Классы багов:
 *  · «замер завышен в 6 раз» — аудит грепал литерал 'passed: false' и записал
 *    в дефекты 66 игр из 68, включая здоровые (выражения, shorthand). Карта
 *    здесь считает все три формы записи;
 *  · молчаливая «безысходность» — игра без поля неотличима от игры, где поле
 *    забыли: намеренное отсутствие обязано быть помечено в исходнике;
 *  · дрейф: новая игра с усePersistentLevel и без passed тихо вернула бы враньё
 *    статистики — гейт назовёт её по имени.
 */
declare const __dirname: string;
declare function require(m: string): any;
const { readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const GAMES_DIR = join(__dirname, '..', '..', 'app', 'games');

/** Игры, где провала НЕТ ПО УСТРОЙСТВУ — отсутствие passed намеренное и помечено. */
const NO_OUTCOME_BY_DESIGN = new Set([
  'breathing', 'eye-gym', 'iowa', 'phonemic-fluency', 'rmet', 'story-recall', 'vocab-srs',
]);

/**
 * Solvable-игры: сессия пишется только по факту решения, passed: true — константа.
 * Вопрос «вводить ли предел, чтобы появился провал» — решение Дениса (открытый
 * пункт задачи e53f4958); пока константа помечена комментом в самих файлах.
 */
const SOLVABLE_ALWAYS_TRUE = new Set(['hanoi', 'mahjong', 'picture-pairs']);

const gameFiles = (): string[] =>
  readdirSync(GAMES_DIR).filter((f: string) => f.endsWith('.tsx'));

const nameOf = (f: string) => f.replace(/\.tsx$/, '');
const read = (f: string) => readFileSync(join(GAMES_DIR, f), 'utf8');

describe('карта исходов: passed пишется или отсутствует намеренно', () => {
  it('есть что проверять: игр с лестницей десятки', () => {
    const withLadder = gameFiles().filter((f) => read(f).includes('usePersistentLevel'));
    expect(withLadder.length).toBeGreaterThan(50);
  });

  it('🔴 каждая игра с лестницей и записью сессий определилась с исходом', () => {
    const silent: string[] = [];
    for (const f of gameFiles()) {
      const src = read(f);
      if (!src.includes('usePersistentLevel') || !src.includes('saveSession')) continue;
      const writesPassed = /passed[:,]/.test(src);
      const documentedNoOutcome = src.includes('passed отсутствует НАМЕРЕННО');
      if (!writesPassed && !documentedNoOutcome) silent.push(nameOf(f));
    }
    expect(silent).toEqual([]);
  });

  it('намеренно-безысходные и помечены, и не пишут поле (двойная жизнь запрещена)', () => {
    for (const g of NO_OUTCOME_BY_DESIGN) {
      const src = read(`${g}.tsx`);
      expect(`${g}: помечено ${src.includes('passed отсутствует НАМЕРЕННО')}`).toBe(`${g}: помечено true`);
      expect(`${g}: пишет passed ${/passed[:,]/.test(src)}`).toBe(`${g}: пишет passed false`);
    }
  });

  it('solvable «только true» несут коммент-причину у константы', () => {
    for (const g of SOLVABLE_ALWAYS_TRUE) {
      const src = read(`${g}.tsx`);
      expect(`${g}: ${/passed: true,\s*\/\//.test(src)}`).toBe(`${g}: true`);
    }
  });

  it('смерть в targets понижает лестницу (замер 27.08: fail() не было)', () => {
    const src = read('targets.tsx');
    expect(src).toContain('lvl.fail()');
    expect(src).toMatch(/passed: !gameOverRef\.current/);
  });

  /**
   * 🔴 ЛЕСТНИЦА ДВУСТОРОННЯЯ. Замер 29.08.2026: тринадцать игр звали `reach`
   * (уровень вверх) и ни разу `fail` (уровень вниз) — то есть после любой серии
   * провалов человек оставался на уровне, который ему не даётся, и упирался в него
   * бесконечно. Понижение не наказание: `fail()` гистерезисный, срабатывает на
   * ТРЕТИЙ провал подряд и не трогает переигровку пройденного (см. шапку
   * usePersistentLevel).
   *
   * Исключения бывают двух родов, и оба обязаны быть НАПИСАНЫ в самой игре,
   * иначе это не исключение, а забытая правка:
   *   · «passed отсутствует НАМЕРЕННО» — исхода нет по устройству (зарядки, тесты);
   *   · «ЛЕСТНИЦА ОДНОСТОРОННЯЯ» — уровни авторские, а не ступени сложности:
   *     провал лечится повтором того же уровня, понижение отобрало бы пройденное;
   *   · три solvable-игры (hanoi/mahjong/picture-pairs) — партия пишется только по
   *     факту решения, провала как события нет; вопрос «вводить ли предел» стоит
   *     перед Денисом, а не перед этим гейтом.
   */
  it('🔴 у каждой игры, поднимающей уровень, есть и понижение', () => {
    const oneWayLadder: string[] = [];
    for (const f of gameFiles()) {
      const src = read(f);
      const name = nameOf(f);
      if (!src.includes('usePersistentLevel')) continue;
      if (SOLVABLE_ALWAYS_TRUE.has(name)) continue;
      const excused =
        src.includes('passed отсутствует НАМЕРЕННО') || src.includes('ЛЕСТНИЦА ОДНОСТОРОННЯЯ');
      const raises = /\.reach\(/.test(src);
      const lowers = /\.fail\(\)/.test(src);
      if (raises && !lowers && !excused) oneWayLadder.push(name);
    }
    expect(oneWayLadder).toEqual([]);
  });
});
